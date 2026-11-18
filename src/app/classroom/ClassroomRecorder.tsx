"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleDot,
  Download,
  LoaderCircle,
  RotateCcw,
  Square,
} from "lucide-react";

const WARN_BYTES = 45 * 1024 * 1024; // 45 MiB warning threshold
const AUTO_STOP_BYTES = 48 * 1024 * 1024; // 48 MiB auto-stop before 50 MiB server cap
const MIME_CANDIDATES = [
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

function pickSupportedMimeType(): string {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return "";
  }
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

function normalizeRecordingFormat(rawMime: string): {
  mimeType: "video/webm" | "video/mp4";
  extension: "webm" | "mp4";
} {
  const base = (rawMime || "").split(";")[0].trim().toLowerCase();
  if (base === "video/mp4") {
    return { mimeType: "video/mp4", extension: "mp4" };
  }
  return { mimeType: "video/webm", extension: "webm" };
}

interface FailedRecording {
  blob: Blob;
  fileName: string;
  mimeType: "video/webm" | "video/mp4";
}

interface ClassroomRecorderProps {
  lessonId: string;
  onRecordingSaved?: () => void;
}

export default function ClassroomRecorder({
  lessonId,
  onRecordingSaved,
}: ClassroomRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [duration, setDuration] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [hasFailedRecording, setHasFailedRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const totalBytesRef = useRef(0);
  const mimeTypeRef = useRef<string>("");
  const autoStoppedRef = useRef(false);
  const handlingStopRef = useRef(false);
  const failedBlobRef = useRef<FailedRecording | null>(null);
  const unmountedRef = useRef(false);

  const stopAllTracks = (stream?: MediaStream | null) => {
    const target = stream ?? streamRef.current;
    if (target) {
      for (const track of target.getTracks()) {
        track.stop();
      }
    }
    if (!stream || stream === streamRef.current) {
      streamRef.current = null;
    }
  };

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const rec = mediaRecorderRef.current;
      if (rec) {
        rec.onstop = null;
        rec.ondataavailable = null;
        if (rec.state === "recording" || rec.state === "paused") {
          try {
            rec.stop();
          } catch {
            // ignore
          }
        }
        mediaRecorderRef.current = null;
      }
      stopAllTracks();
      chunksRef.current = [];
      failedBlobRef.current = null;
    };
  }, []);

  const uploadRecording = async (
    payload: FailedRecording,
    wasAutoStopped = false
  ) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const file = new File([payload.blob], payload.fileName, {
        type: payload.mimeType,
      });

      const formData = new FormData();
      formData.set("lessonId", lessonId);
      formData.set("file", file);

      const response = await fetch("/api/classroom/recording", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Upload failed (${response.status}).`);
      }

      failedBlobRef.current = null;
      if (!unmountedRef.current) {
        setHasFailedRecording(false);
        const apiMessage =
          typeof result.message === "string" && result.message.trim()
            ? result.message.trim()
            : "Lesson recording saved securely to private academy storage.";
        setNotice(
          wasAutoStopped
            ? `Reached 48 MB limit and auto-stopped. ${apiMessage}`
            : apiMessage
        );
        if (onRecordingSaved) onRecordingSaved();
      }
    } catch (cause) {
      failedBlobRef.current = payload;
      if (!unmountedRef.current) {
        setHasFailedRecording(true);
        setError(
          cause instanceof Error
            ? cause.message
            : "Recording could not be uploaded."
        );
      }
    } finally {
      if (!unmountedRef.current) {
        setSaving(false);
        setDuration(0);
      }
    }
  };

  const handleStop = async () => {
    if (handlingStopRef.current) return;
    handlingStopRef.current = true;
    const wasAutoStopped = autoStoppedRef.current;
    setRecording(false);
    setError("");

    try {
      const firstChunkType = chunksRef.current[0]?.type || "";
      const { mimeType, extension } = normalizeRecordingFormat(
        mimeTypeRef.current || firstChunkType
      );
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];

      if (blob.size === 0) {
        setError("No video was captured.");
        setDuration(0);
        return;
      }

      const fileName = `lesson-recording-${lessonId}.${extension}`;
      const recorded: FailedRecording = { blob, fileName, mimeType };
      failedBlobRef.current = recorded;
      await uploadRecording(recorded, wasAutoStopped);
    } finally {
      chunksRef.current = [];
      handlingStopRef.current = false;
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      try {
        rec.stop();
      } catch {
        stopAllTracks();
        void handleStop();
      }
    } else {
      stopAllTracks();
      if (chunksRef.current.length > 0 && !handlingStopRef.current) {
        void handleStop();
      }
    }
  };

  const startRecording = async () => {
    setError("");
    setNotice("");
    failedBlobRef.current = null;
    setHasFailedRecording(false);
    chunksRef.current = [];
    totalBytesRef.current = 0;
    autoStoppedRef.current = false;
    handlingStopRef.current = false;
    setRecordedBytes(0);
    let capturedStream: MediaStream | null = null;
    try {
      // Capture the browser display/tab or screen with system and microphone audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24, max: 30 },
        } as MediaTrackConstraints,
        audio: true,
      });

      capturedStream = stream;
      if (unmountedRef.current) {
        stopAllTracks(stream);
        return;
      }
      streamRef.current = stream;

      const selectedMime = pickSupportedMimeType();
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: 900_000,
        audioBitsPerSecond: 96_000,
      };
      if (selectedMime) {
        recorderOptions.mimeType = selectedMime;
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, recorderOptions);
      } catch {
        try {
          recorder = new MediaRecorder(stream);
        } catch (fallbackErr) {
          stopAllTracks(stream);
          throw fallbackErr;
        }
      }
      mediaRecorderRef.current = recorder;
      mimeTypeRef.current = recorder.mimeType || selectedMime || "video/webm";

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          totalBytesRef.current += event.data.size;
          if (!unmountedRef.current) {
            setRecordedBytes(totalBytesRef.current);
          }
          if (
            totalBytesRef.current >= AUTO_STOP_BYTES &&
            !autoStoppedRef.current
          ) {
            autoStoppedRef.current = true;
            if (recorder.state === "recording") {
              stopRecording();
            } else {
              void handleStop();
            }
          }
        }
      };

      recorder.onstop = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        stopAllTracks();
        if (!unmountedRef.current) {
          void handleStop();
        }
      };

      // Handle user clicking native browser "Stop sharing" bar
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopAllTracks();
          if (recorder.state === "recording") {
            recorder.stop();
          }
        };
      }

      recorder.start(1000); // 1-second chunks
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (cause) {
      if (capturedStream) {
        stopAllTracks(capturedStream);
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Screen recording permission was not granted."
      );
    }
  };

  const retryUpload = () => {
    const failed = failedBlobRef.current;
    if (!failed || saving) return;
    void uploadRecording(failed, false);
  };

  const downloadLocally = () => {
    const failed = failedBlobRef.current;
    if (!failed) return;
    const objectUrl = URL.createObjectURL(failed.blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = failed.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const formatDuration = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hrs > 0) {
      return `${hrs}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
    }
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const approachingLimit = recordedBytes >= WARN_BYTES;

  return (
    <div
      className="pc-recorder-widget"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {recording ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              color: approachingLimit ? "#fde68a" : "#ff4757",
              background: approachingLimit
                ? "rgba(217, 119, 6, 0.25)"
                : "rgba(255, 71, 87, 0.15)",
              border: approachingLimit
                ? "1px solid rgba(251, 191, 36, 0.55)"
                : "1px solid rgba(255, 71, 87, 0.35)",
              padding: "3px 8px",
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.3,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: approachingLimit ? "#f59e0b" : "#ff4757",
                display: "inline-block",
                boxShadow: approachingLimit
                  ? "0 0 8px #f59e0b"
                  : "0 0 8px #ff4757",
                animation: "pulse 1.5s infinite",
              }}
            />
            REC {formatDuration(duration)}
            <small
              style={{
                color: approachingLimit ? "#fef3c7" : "#ffb4bc",
                fontWeight: 500,
                fontSize: 10,
              }}
            >
              ({formatBytes(recordedBytes)} / 48 MB
              {approachingLimit ? " · near limit" : ""})
            </small>
          </span>
          <button
            type="button"
            className="pc-primary"
            style={{
              background: "#ff4757",
              color: "#fff",
              padding: "4px 10px",
              fontSize: 11,
              minHeight: 28,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
            onClick={stopRecording}
          >
            <Square size={11} fill="currentColor" /> Stop &amp; Save
          </button>
        </div>
      ) : saving ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "#6ee7b7",
            background: "rgba(110, 231, 183, 0.1)",
            padding: "4px 9px",
            borderRadius: 6,
            border: "1px solid rgba(110, 231, 183, 0.25)",
          }}
        >
          <LoaderCircle size={13} className="pc-spinning" /> Saving to academy
          storage…
        </span>
      ) : (
        <button
          type="button"
          className="pc-primary"
          style={{
            background: "rgba(255, 255, 255, 0.12)",
            border: "1px solid rgba(255, 255, 255, 0.22)",
            color: "#fff",
            padding: "4px 10px",
            fontSize: 11,
            minHeight: 28,
            borderRadius: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
          onClick={() => void startRecording()}
          title="Record this lesson directly to private academy storage"
        >
          <CircleDot size={13} color="#ff4757" /> Record class
        </button>
      )}

      {!recording && !saving && hasFailedRecording && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={retryUpload}
            style={{
              background: "rgba(46, 213, 115, 0.18)",
              border: "1px solid rgba(46, 213, 115, 0.45)",
              color: "#6ee7b7",
              padding: "3px 8px",
              fontSize: 11,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <RotateCcw size={11} /> Retry upload
          </button>
          <button
            type="button"
            onClick={downloadLocally}
            style={{
              background: "rgba(255, 255, 255, 0.12)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              color: "#fff",
              padding: "3px 8px",
              fontSize: 11,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <Download size={11} /> Download locally
          </button>
        </div>
      )}

      {error && (
        <span style={{ color: "#ff6b81", fontSize: 11, fontWeight: 500 }}>
          {error}
        </span>
      )}
      {notice && (
        <span style={{ color: "#2ed573", fontSize: 11, fontWeight: 500 }}>
          {notice}
        </span>
      )}
    </div>
  );
}
