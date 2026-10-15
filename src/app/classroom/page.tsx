"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  PreJoin,
  VideoConference,
} from "@livekit/components-react";
import type { PreJoinProps } from "@livekit/components-react";
import { AudioPresets } from "livekit-client";
import "@livekit/components-styles";
import {
  ArrowLeft,
  Camera,
  Clock3,
  Headphones,
  LockKeyhole,
  Maximize2,
  Mic,
  Minimize2,
  RefreshCw,
  ShieldCheck,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";

import BrandEmblem from "../_components/BrandEmblem";
import ClassroomRecorder from "./ClassroomRecorder";
import ClassroomMusicTools from "./ClassroomMusicTools";

type Lesson = {
  id: string;
  title: string;
  studentName: string;
  startsAt: string;
  studentTimezone: string;
  kind: string;
  durationMinutes: number;
};
type ClassroomData = {
  lesson: Lesson;
  opensAt: string;
  closesAt: string;
  joinEligible: boolean;
  serverTime: string;
  classroomProvider?: "inbuilt" | "google_meet";
  meetUrl?: string;
};

type DeviceSettings = Parameters<NonNullable<PreJoinProps["onSubmit"]>>[0];
type RoomTicket = {
  token: string;
  serverUrl: string;
  roomName: string;
  closesAt: string;
  canRecord?: boolean;
  lessonId?: string;
};

async function json(response: Response) {
  return response.json().catch(() => ({}));
}
function timeLabel(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || "UTC",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export default function ClassroomPage() {
  const [lessonId, setLessonId] = useState("");
  const [data, setData] = useState<ClassroomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [notice, setNotice] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [ticket, setTicket] = useState<RoomTicket | null>(null);
  const [devices, setDevices] = useState<DeviceSettings | null>(null);
  const [checkingPermissions, setCheckingPermissions] = useState(false);
  const [permissionReady, setPermissionReady] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [remaining, setRemaining] = useState("");
  const [roomEnded, setRoomEnded] = useState(false);
  const [serverOffset, setServerOffset] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // browser may restrict programmatic fullscreen without direct interaction
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setLessonId(params.get("lessonId") || "");
  }, []);

  const load = useCallback(async () => {
    if (!lessonId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setJoinError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/classroom?lessonId=${encodeURIComponent(lessonId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const result = await json(response);
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok)
        throw new Error(
          result.error ||
            (response.status === 403
              ? "This lesson is not available to your account."
              : "Lesson details could not be loaded.")
        );
      setData(result as ClassroomData);
      if (result.serverTime)
        setServerOffset(new Date(result.serverTime).getTime() - Date.now());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Lesson details could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    if (lessonId) void load();
  }, [lessonId, load]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setClockNow(Date.now() + serverOffset),
      1000
    );
    return () => window.clearInterval(timer);
  }, [serverOffset]);
  const effectiveJoinOpen =
    !!data?.joinEligible &&
    clockNow >= new Date(data.opensAt).getTime() &&
    clockNow < new Date(data.closesAt).getTime();

  useEffect(() => {
    if (!ticket) return;
    const closeAt = new Date(ticket.closesAt).getTime();
    const update = () => {
      const ms = closeAt - (Date.now() + serverOffset);
      if (ms <= 0) {
        setRemaining("0:00");
        setRoomEnded(true);
        setTicket(null);
        setDevices(null);
        return;
      }
      const totalSeconds = Math.floor(ms / 1000);
      setRemaining(
        `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(
          2,
          "0"
        )}`
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [ticket, serverOffset]);

  function openPreview() {
    if (!data || !effectiveJoinOpen || requesting) return;
    setJoinError("");
    setNotice("");
    setRoomEnded(false);
    setPermissionReady(true);
    setPreviewOpen(true);
  }
  async function joinFromPreview(values: DeviceSettings) {
    if (!data || !effectiveJoinOpen || requesting) return;
    setJoinError("");
    setNotice("");
    setRoomEnded(false);
    setCheckingPermissions(true);
    setRequesting(true);
    try {
      const response = await fetch("/api/classroom", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      const result = await json(response);
      if (!response.ok || !result.token || !result.serverUrl)
        throw new Error(
          result.error ||
            (response.status === 503
              ? "The live room service is not configured. Contact the academy before your class."
              : "A secure room could not be prepared.")
        );
      if (new Date(result.closesAt).getTime() <= Date.now() + serverOffset)
        throw new Error("The lesson room window has ended.");
      setTicket({
        token: result.token,
        serverUrl: result.serverUrl,
        roomName: result.roomName || data.lesson.title,
        closesAt: result.closesAt,
        canRecord:
          typeof result.canRecord === "boolean" ? result.canRecord : true,
        lessonId: (result.lessonId as string) || lessonId,
      });
      setDevices(values);
      setPreviewOpen(false);
    } catch (cause) {
      setJoinError(
        cause instanceof Error
          ? cause.message
          : "Camera or microphone permission was not granted."
      );
    } finally {
      setCheckingPermissions(false);
      setRequesting(false);
    }
  }
  function leaveRoom() {
    setTicket(null);
    setDevices(null);
    setPermissionReady(false);
    setPreviewOpen(false);
    setRoomEnded(false);
    setNotice("You have left the lesson room. Your device preview is off.");
  }
  function onDisconnect() {
    setTicket(null);
    setDevices(null);
    setPermissionReady(false);
    setPreviewOpen(false);
    if (!roomEnded)
      setNotice("The room connection ended. Your device preview is off.");
  }

  const minutesToOpen = data
    ? Math.max(
        0,
        Math.ceil((new Date(data.opensAt).getTime() - clockNow) / 60000)
      )
    : 0;
  return (
    <main className={`pw-classroom ${ticket ? "in-call" : ""}`}>
      {!ticket && <div className="pc-topline" />}
      {!ticket && (
        <header className="pc-header">
          <a
            className="pc-brand"
            href="/"
            aria-label="ProsperWork Music Concepts home"
          >
            <span className="pc-mark" aria-hidden="true">
              <img src="/favicon-192x192.png" alt="" />
            </span>
            <span>
              <strong>ProsperWork</strong>
              <small>Music Concepts</small>
            </span>
          </a>
          <a className="pc-back" href="/">
            <ArrowLeft size={15} />
            Workspace
          </a>
        </header>
      )}
      <div className="pc-content">
        {!ticket && (
          <section className="pc-intro">
            <div>
              <div className="pc-eyebrow">
                <span /> Private lesson room
              </div>
              <h1>Make space for music.</h1>
              <p>
                A secure room for your scheduled lesson. Join only when the room
                window opens.
              </p>
            </div>
            <div className="pc-privacy">
              <ShieldCheck size={17} />
              <span>
                <strong>Private by design</strong>
                <small>No recording starts automatically</small>
              </span>
            </div>
          </section>
        )}
        {!lessonId ? (
          <section className="pc-empty">
            <span className="pc-empty-mark">
              <Headphones size={22} />
            </span>
            <div className="pc-eyebrow">Lesson link needed</div>
            <h2>Your classroom is ready when you are.</h2>
            <p>
              Open the join link from a scheduled lesson to enter its private
              room. The lesson identifier stays in the link; room access is
              checked by the academy when you join.
            </p>
            <a className="pc-primary-link" href="/schedule">
              Go to schedule <span aria-hidden="true">→</span>
            </a>
          </section>
        ) : loading && !data ? (
          <section
            className="pc-loading"
            aria-label="Loading lesson details"
            aria-busy="true"
          >
            <div className="pc-skeleton" />
            <div className="pc-skeleton short" />
            <div className="pc-skeleton" />
          </section>
        ) : error ? (
          <section className="pc-error" role="alert">
            <span className="pc-error-icon">
              <WifiOff size={19} />
            </span>
            <div>
              <strong>Lesson unavailable</strong>
              <p>{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={14} />
              Try again
            </button>
          </section>
        ) : (
          data && (
            <div className="pc-room-layout">
              <section className="pc-stage">
                {ticket ? (
                  <LiveKitRoom
                    token={ticket.token}
                    serverUrl={ticket.serverUrl}
                    connect
                    audio={devices?.audioEnabled ?? true}
                    video={devices?.videoEnabled ?? true}
                    options={{
                      audioCaptureDefaults: {
                        deviceId: devices?.audioDeviceId || undefined,
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                      },
                      videoCaptureDefaults: {
                        deviceId: devices?.videoDeviceId || undefined,
                      },
                      publishDefaults: {
                        audioPreset: AudioPresets.musicHighQualityStereo,
                      },
                    }}
                    onDisconnected={onDisconnect}
                    onError={(cause) =>
                      setJoinError(
                        cause?.message ||
                          "The secure room connection failed. Check your network and try again."
                      )
                    }
                    data-lk-theme="default"
                    className="pc-livekit"
                  >
                    <div className="pc-live-wrap">
                      <div className="pc-live-head">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            minWidth: 0,
                          }}
                        >
                          <span className="pc-live-indicator">
                            <i /> In the lesson
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#d1ded5",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            · {data.lesson.title || "Music Lesson"} (
                            {data.lesson.studentName})
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <ClassroomMusicTools />
                          {ticket.canRecord && (
                            <ClassroomRecorder
                              lessonId={ticket.lessonId || lessonId}
                              onRecordingSaved={() =>
                                setNotice(
                                  "Recording saved to lesson notebook and QC video queue."
                                )
                              }
                            />
                          )}
                          <span className="pc-countdown">
                            <Clock3 size={13} /> Room closes in {remaining}
                          </span>
                          <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="pc-fullscreen-btn"
                            title={
                              isFullscreen
                                ? "Exit Fullscreen"
                                : "Fullscreen Mode (Zoom / Meet Style)"
                            }
                            style={{
                              background: "rgba(255, 255, 255, 0.12)",
                              border: "1px solid rgba(255, 255, 255, 0.2)",
                              color: "#fff",
                              borderRadius: 6,
                              padding: "4px 9px",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {isFullscreen ? (
                              <Minimize2 size={13} />
                            ) : (
                              <Maximize2 size={13} />
                            )}
                            <span>
                              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                            </span>
                          </button>
                        </div>
                      </div>
                      <div className="pc-live-conference-area">
                        <VideoConference />
                      </div>
                    </div>
                  </LiveKitRoom>
                ) : previewOpen && permissionReady && effectiveJoinOpen ? (
                  <div className="pc-preview" data-lk-theme="default">
                    <div className="pc-preview-title">
                      <Camera size={16} />
                      <span>
                        Device preview
                        <small>
                          Your camera and microphone are not connected to the
                          room yet.
                        </small>
                      </span>
                    </div>
                    <PreJoin
                      persistUserChoices={false}
                      defaults={{
                        audioEnabled: true,
                        videoEnabled: true,
                      }}
                      joinLabel={
                        requesting ? "Preparing secure room…" : "Join lesson"
                      }
                      onSubmit={(values) => void joinFromPreview(values)}
                      onError={(cause) =>
                        setJoinError(
                          cause?.message ||
                            "A selected device could not be started. Check browser permissions or choose another device."
                        )
                      }
                    />
                    <p className="pc-preview-help">
                      You can turn off camera and microphone for a listen-only
                      lesson. Room access is requested only after you select
                      Join lesson.
                    </p>
                  </div>
                ) : (
                  <div className="pc-stage-empty">
                    <div className="pc-stage-art" aria-hidden="true">
                      <span className="pc-orbit one" />
                      <span className="pc-orbit two" />
                      <span className="pc-emblem-mark">
                        <BrandEmblem className="pc-brand-emblem" />
                      </span>
                      <span className="pc-stage-line" />
                    </div>
                    <span
                      className={`pc-room-status ${
                        effectiveJoinOpen ? "ready" : ""
                      } ${
                        data && clockNow >= new Date(data.closesAt).getTime()
                          ? "closed"
                          : ""
                      }`}
                    >
                      <i />
                      {effectiveJoinOpen
                        ? "Room is open"
                        : data && clockNow >= new Date(data.closesAt).getTime()
                        ? "Room window closed"
                        : "Room is not open yet"}
                    </span>
                    <h2>
                      {effectiveJoinOpen
                        ? "Set up your sound first."
                        : data && clockNow >= new Date(data.closesAt).getTime()
                        ? "This lesson room window has closed."
                        : "Every good session starts in time."}
                    </h2>
                    <p>
                      {effectiveJoinOpen
                        ? "Open your device preview and check your setup. You’ll choose to connect only after the preview."
                        : data && clockNow >= new Date(data.closesAt).getTime()
                        ? "The scheduled room window has ended. If you still need help, return to your workspace."
                        : `Your room opens ${
                            minutesToOpen > 0
                              ? `in about ${minutesToOpen} minute${
                                  minutesToOpen === 1 ? "" : "s"
                                }`
                              : "at the scheduled time"
                          }. You can return here when it is ready.`}
                    </p>
                    {effectiveJoinOpen &&
                      (data.classroomProvider === "google_meet" &&
                      data.meetUrl ? (
                        <a
                          className="pc-primary"
                          href={data.meetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            textDecoration: "none",
                            background: "#1a73e8",
                          }}
                        >
                          <Video size={16} />
                          Join Lesson on Google Meet
                        </a>
                      ) : (
                        <button
                          className="pc-primary"
                          type="button"
                          onClick={openPreview}
                          disabled={checkingPermissions || requesting}
                        >
                          Open In-App Studio Preview
                        </button>
                      ))}

                    <div className="pc-stage-footer">
                      <span>
                        <LockKeyhole size={13} />
                        Access checked securely by the academy
                      </span>
                      <span>
                        <Mic size={13} />
                        Lesson recording available to educator
                      </span>
                    </div>
                  </div>
                )}
                {joinError && (
                  <div className="pc-action-error" role="alert">
                    <WifiOff size={15} />
                    <span>{joinError}</span>
                  </div>
                )}
                {notice && (
                  <div className="pc-action-success" role="status">
                    {notice}
                  </div>
                )}
                {roomEnded && (
                  <div className="pc-action-success" role="status">
                    The lesson room has closed at its scheduled end time.
                  </div>
                )}
              </section>
              {!ticket && (
                <aside className="pc-side">
                  <section className="pc-lesson-card">
                    <div className="pc-card-kicker">Your lesson</div>
                    <span className="pc-lesson-symbol" aria-hidden="true">
                      PW
                    </span>
                    <h2>{data.lesson.title || "Music lesson"}</h2>
                    <p className="pc-student">
                      For <strong>{data.lesson.studentName}</strong>
                    </p>
                    <div className="pc-detail">
                      <Clock3 size={15} />
                      <span>
                        <strong>
                          {timeLabel(
                            data.lesson.startsAt,
                            data.lesson.studentTimezone
                          )}
                        </strong>
                        <small>
                          Student local time · {data.lesson.studentTimezone}
                        </small>
                      </span>
                    </div>
                    <div className="pc-detail">
                      <span className="pc-duration-icon">
                        {data.lesson.durationMinutes}
                      </span>
                      <span>
                        <strong>{data.lesson.durationMinutes} minutes</strong>
                        <small>{label(data.lesson.kind)} lesson</small>
                      </span>
                    </div>
                    <div
                      className={`pc-window ${effectiveJoinOpen ? "open" : ""}`}
                    >
                      <span className="pc-window-dot" />
                      <span>
                        <strong>
                          {effectiveJoinOpen
                            ? "Ready to join"
                            : "Access window"}
                        </strong>
                        <small>
                          {timeLabel(data.opensAt, data.lesson.studentTimezone)}{" "}
                          –{" "}
                          {timeLabel(
                            data.closesAt,
                            data.lesson.studentTimezone
                          )}
                        </small>
                      </span>
                    </div>
                  </section>
                  <section className="pc-checklist">
                    <div className="pc-card-kicker">Before you join</div>
                    <div>
                      <span className="pc-check-icon">
                        <Wifi size={14} />
                      </span>
                      <p>
                        <strong>Find a steady connection</strong>
                        <small>
                          A quiet, stable network helps your teacher hear every
                          note. Use headphones: music mode preserves instrument
                          sound without speech noise suppression.
                        </small>
                      </p>
                    </div>
                    <div>
                      <span className="pc-check-icon">
                        <Camera size={14} />
                      </span>
                      <p>
                        <strong>Check your camera and mic</strong>
                        <small>
                          Preview devices before connecting. Permission is
                          requested only when you choose setup.
                        </small>
                      </p>
                    </div>
                    <div>
                      <span className="pc-check-icon">
                        <ShieldCheck size={14} />
                      </span>
                      <p>
                        <strong>Keep lessons private</strong>
                        <small>
                          Join from a trusted device. Recording does not start
                          automatically.
                        </small>
                      </p>
                    </div>
                  </section>
                </aside>
              )}
            </div>
          )
        )}
        {!ticket && (
          <footer className="pc-footer">
            <span>ProsperWork · Music Concepts</span>
            <span>Private learning, one lesson at a time</span>
          </footer>
        )}
      </div>
    </main>
  );
}

function label(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
