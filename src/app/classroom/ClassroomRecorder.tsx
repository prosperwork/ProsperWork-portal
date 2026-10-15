"use client";

import { useRef, useState } from "react";
import { CircleDot, Disc, LoaderCircle, Square, Video } from "lucide-react";

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const totalBytesRef = useRef(0);

  const startRecording = async () => {
    setError("");
    setNotice("");
    chunksRef.current = [];
    totalBytesRef.current = 0;
    setRecordedBytes(0);
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

      streamRef.current = stream;

      // Choose supported webm codec
      const mimeType = MediaRecorder.isTypeSupported(
        "video/webm;codecs=vp9,opus"
      )
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";

      // 900 kbps video + 96 kbps audio provides crystal-clear music notation and instrument sound
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 900_000,
        audioBitsPerSecond: 96_000,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          totalBytesRef.current += event.data.size;
          setRecordedBytes(totalBytesRef.current);
        }
      };

      recorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        void handleStop();
      };

      // Handle user clicking native browser "Stop sharing" bar
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
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
      setError(
        cause instanceof Error
          ? cause.message
          : "Screen recording permission was not granted."
      );
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
    }
  };

  const handleStop = async () => {
    setRecording(false);
    setSaving(true);
    setError("");
    try {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      if (blob.size === 0) throw new Error("No video was captured.");

      const file = new File([blob], `lesson-recording-${lessonId}.webm`, {
        type: "video/webm",
      });

      const formData = new FormData();
      formData.set("lessonId", lessonId);
      formData.set("file", file);

      // Upload directly to Google Drive via /api/classroom/recording
      const response = await fetch("/api/classroom/recording", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Upload failed (${response.status})`);
      }

      setNotice("Lesson recording saved to Google Drive and attached to notebook.");
      if (onRecordingSaved) onRecordingSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Recording could not be uploaded."
      );
    } finally {
      setSaving(false);
      setDuration(0);
    }
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

  return (
    <div
      className="pc-recorder-widget"
      style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
    >
      {recording ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              color: "#ff4757",
              background: "rgba(255, 71, 87, 0.15)",
              border: "1px solid rgba(255, 71, 87, 0.35)",
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
                background: "#ff4757",
                display: "inline-block",
                boxShadow: "0 0 8px #ff4757",
                animation: "pulse 1.5s infinite",
              }}
            />
            REC {formatDuration(duration)}
            <small style={{ color: "#ffb4bc", fontWeight: 500, fontSize: 10 }}>
              ({formatBytes(recordedBytes)})
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
          <LoaderCircle size={13} className="pc-spinning" /> Saving to Google Drive…
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
          title="Record this lesson directly to academy Google Drive"
        >
          <CircleDot size={13} color="#ff4757" /> Record class
        </button>
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
