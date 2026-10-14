"use client";

import { useRef, useState } from "react";
import { Disc, LoaderCircle, Square, Video } from "lucide-react";

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
      // Capture the browser display/tab or screen with system audio
      // Request 720p 24fps to optimize for clarity (sheet music/notes) and small file size
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 24, max: 24 },
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

      // 400 kbps video + 64 kbps audio keeps ~40 min lessons under 35 MB, safely within Supabase Free 50 MB
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 400_000,
        audioBitsPerSecond: 64_000,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          totalBytesRef.current += event.data.size;
          setRecordedBytes(totalBytesRef.current);

          // Auto-stop if approaching Supabase Free 50 MB ceiling (stop at 48 MB for safety)
          if (totalBytesRef.current >= 48 * 1024 * 1024) {
            recorder.stop();
          }
        }
      };

      recorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        void handleStop();
      };

      // Handle user clicking native browser "Stop sharing" bar
      stream.getVideoTracks()[0].onended = () => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      };

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
      if (blob.size > 50 * 1024 * 1024) {
        throw new Error(
          "Recording exceeded 50 MiB limit. Keep clips focused for lesson review."
        );
      }

      const file = new File([blob], `lesson-recording-${lessonId}.webm`, {
        type: "video/webm",
      });

      const formData = new FormData();
      formData.set("category", "lesson_recording");
      formData.set("targetId", lessonId);
      formData.set("file", file);

      const response = await fetch("/api/files", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Upload failed (${response.status})`);
      }

      setNotice("Class recording saved to lesson notebook & QC video queue.");
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
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
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
              color: "#d9383a",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <Disc
              size={13}
              className="pc-spinning"
              style={{ animation: "spin 2s linear infinite" }}
            />
            REC {formatDuration(duration)} (
            {(recordedBytes / (1024 * 1024)).toFixed(1)} MB / 48 MB)
          </span>
          <button
            type="button"
            className="pc-primary"
            style={{
              background: "#d9383a",
              color: "#fff",
              padding: "4px 10px",
              fontSize: 11,
              minHeight: 28,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
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
            gap: 5,
            fontSize: 11,
            color: "#1c7a5d",
          }}
        >
          <LoaderCircle size={13} className="pc-spinning" /> Uploading
          recording…
        </span>
      ) : (
        <button
          type="button"
          className="pc-primary"
          style={{
            background: "#1c7a5d",
            color: "#fff",
            padding: "4px 10px",
            fontSize: 11,
            minHeight: 28,
            borderRadius: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
          onClick={() => void startRecording()}
        >
          <Video size={13} /> Record class
        </button>
      )}

      {error && <span style={{ color: "#d9383a", fontSize: 10 }}>{error}</span>}
      {notice && (
        <span style={{ color: "#1c7a5d", fontSize: 10 }}>{notice}</span>
      )}
    </div>
  );
}
