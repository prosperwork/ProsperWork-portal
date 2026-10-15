"use client";

import { useEffect, useRef, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import { Lock, Mic, MicOff, Radio, X } from "lucide-react";

interface ClassroomTunerProps {
  onClose: () => void;
  isLocked?: boolean;
  isAdmin?: boolean;
}

const NOTE_STRINGS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export default function ClassroomTuner({
  onClose,
  isLocked = false,
  isAdmin = false,
}: ClassroomTunerProps) {
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("-");
  const [octave, setOctave] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<number>(0);
  const [cents, setCents] = useState<number>(0);
  const [inTune, setInTune] = useState(false);
  const [error, setError] = useState("");
  const [syncToRoom, setSyncToRoom] = useState(true);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastBroadcastRef = useRef<number>(0);

  // Sync Tuner Pitch across Call
  const { send: sendTuner } = useDataChannel("tuner_sync", (msg) => {
    try {
      const decoded = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(decoded);
      if (data.type === "pitch") {
        setNote(data.note);
        setOctave(data.octave);
        setFrequency(data.frequency);
        setCents(data.cents);
        setInTune(Boolean(data.inTune));
        setListening(true);
      } else if (data.type === "stop") {
        setNote("-");
        setFrequency(0);
        setCents(0);
        setInTune(false);
      }
    } catch {
      // ignore
    }
  });

  const startTuner = async () => {
    // If student is locked, don't ask for microphone permission; they sync from teacher
    if (isLocked) {
      setListening(true);
      return;
    }

    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      setListening(true);
      detectPitch();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not access microphone for tuner."
      );
    }
  };

  const stopTuner = () => {
    if (animationFrameRef.current)
      cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    setListening(false);
    setNote("-");
    setFrequency(0);
    setCents(0);
    setInTune(false);

    if (sendTuner && syncToRoom) {
      const payload = JSON.stringify({ type: "stop" });
      sendTuner(new TextEncoder().encode(payload), { reliable: false });
    }
  };

  // Autocorrelation Pitch Detection
  const autoCorrelate = (buffer: Float32Array, sampleRate: number): number => {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    if (rms < 0.003) return -1; // sensitive to soft acoustic & high-pitch notes

    // Minimum period for 4500 Hz (C8 is ~4186 Hz), Maximum period for 50 Hz (bass notes)
    const minPeriod = Math.max(8, Math.floor(sampleRate / 4500));
    const maxPeriod = Math.min(
      Math.floor(buffer.length / 2),
      Math.floor(sampleRate / 50)
    );

    const c = new Float32Array(maxPeriod + 2);
    const halfLen = Math.floor(buffer.length / 2);

    for (let lag = 0; lag <= maxPeriod + 1; lag++) {
      let sum = 0;
      for (let i = 0; i < halfLen; i++) {
        sum += buffer[i] * buffer[i + lag];
      }
      c[lag] = sum;
    }

    let d = 0;
    while (d < maxPeriod && c[d] > c[d + 1]) d++;

    let maxVal = -1;
    let maxPos = -1;
    for (let i = d; i <= maxPeriod; i++) {
      if (c[i] > maxVal) {
        maxVal = c[i];
        maxPos = i;
      }
    }

    if (maxPos <= 0 || maxVal < c[0] * 0.2) {
      return -1;
    }

    let T0 = maxPos;
    if (T0 > 0 && T0 < maxPeriod) {
      const x1 = c[T0 - 1];
      const x2 = c[T0];
      const x3 = c[T0 + 1];
      const a = (x1 + x3 - 2 * x2) / 2;
      const b = (x3 - x1) / 2;
      if (a !== 0) {
        T0 = T0 - b / (2 * a);
      }
    }

    return sampleRate / T0;
  };

  const detectPitch = () => {
    if (!analyserRef.current || !audioCtxRef.current) return;
    const buffer = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(buffer);

    const freq = autoCorrelate(buffer, audioCtxRef.current.sampleRate);
    if (freq !== -1 && freq >= 50 && freq <= 4500) {
      const midi = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
      const roundedMidi = Math.round(midi);
      const noteName = NOTE_STRINGS[roundedMidi % 12];
      const oct = Math.floor(roundedMidi / 12) - 1;

      const targetFreq = 440 * Math.pow(2, (roundedMidi - 69) / 12);
      const centDiff = Math.floor(
        (1200 * Math.log(freq / targetFreq)) / Math.log(2)
      );

      const isWithinTune = Math.abs(centDiff) <= 4;
      const roundedFreq = Math.round(freq * 10) / 10;
      const clampedCents = Math.max(-50, Math.min(50, centDiff));

      setNote(noteName);
      setOctave(oct);
      setFrequency(roundedFreq);
      setCents(clampedCents);
      setInTune(isWithinTune);

      // Broadcast detected pitch to other participants every 100ms
      const now = Date.now();
      if (sendTuner && syncToRoom && now - lastBroadcastRef.current > 100) {
        lastBroadcastRef.current = now;
        const payload = JSON.stringify({
          type: "pitch",
          note: noteName,
          octave: oct,
          frequency: roundedFreq,
          cents: clampedCents,
          inTune: isWithinTune,
        });
        sendTuner(new TextEncoder().encode(payload), { reliable: false });
      }
    }

    animationFrameRef.current = requestAnimationFrame(detectPitch);
  };

  useEffect(() => {
    void startTuner();
    return () => {
      stopTuner();
    };
  }, [isLocked]);

  return (
    <div
      className="pc-tuner-panel"
      style={{
        position: "absolute",
        top: 55,
        right: 18,
        background: "#16201a",
        border: `1px solid ${
          isLocked ? "rgba(255, 177, 66, 0.35)" : "rgba(255, 255, 255, 0.22)"
        }`,
        borderRadius: 14,
        padding: "16px 20px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.7)",
        zIndex: 100,
        width: 290,
        color: "#fff",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            color: isLocked ? "#ffb142" : "#2ed573",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          <Radio size={16} />
          Chromatic Tuner
          {isLocked && (
            <span
              style={{
                fontSize: 10,
                background: "rgba(255, 177, 66, 0.18)",
                color: "#ffb142",
                border: "1px solid rgba(255, 177, 66, 0.35)",
                padding: "2px 6px",
                borderRadius: 4,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Lock size={10} /> View Only
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#aaa",
            cursor: "pointer",
            padding: 2,
          }}
        >
          <X size={15} />
        </button>
      </div>

      {error ? (
        <div style={{ fontSize: 12, color: "#ff4757", margin: "10px 0" }}>
          {error}
        </div>
      ) : (
        <>
          {/* Main Note & Octave Display */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: 105,
              background: "#0e1511",
              borderRadius: 10,
              border: `2px solid ${
                inTune
                  ? "#2ed573"
                  : isLocked
                  ? "rgba(255,177,66,0.3)"
                  : "rgba(255,255,255,0.1)"
              }`,
              boxShadow: inTune ? "0 0 20px rgba(46, 213, 115, 0.3)" : "none",
              transition: "all 0.1s ease",
              position: "relative",
            }}
          >
            <div
              style={{
                fontSize: 52,
                fontWeight: 900,
                color: inTune ? "#2ed573" : "#fff",
                lineHeight: 1,
                display: "flex",
                alignItems: "flex-start",
              }}
            >
              <span>{note}</span>
              {octave !== null && (
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    marginLeft: 2,
                    color: inTune ? "#2ed573" : "#8fcaab",
                  }}
                >
                  {octave}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>
              {frequency > 0 ? `${frequency} Hz` : "Listening…"}
            </div>
            {inTune && (
              <span
                style={{
                  position: "absolute",
                  bottom: 6,
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#2ed573",
                  background: "rgba(46, 213, 115, 0.2)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  letterSpacing: 0.5,
                }}
              >
                ● IN TUNE
              </span>
            )}
          </div>

          {/* Cent Meter Needle */}
          <div style={{ margin: "14px 0 8px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "#777",
                marginBottom: 4,
              }}
            >
              <span>-50 Flat</span>
              <span
                style={{
                  color: inTune ? "#2ed573" : "#fff",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                {cents > 0 ? `+${cents}` : cents} cents
              </span>
              <span>+50 Sharp</span>
            </div>

            {/* Meter Bar */}
            <div
              style={{
                height: 12,
                background: "#0a110d",
                borderRadius: 6,
                position: "relative",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.15)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "calc(50% - 10px)",
                  width: 20,
                  height: "100%",
                  background: "rgba(46, 213, 115, 0.25)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${((cents + 50) / 100) * 100}%`,
                  width: 4,
                  height: "100%",
                  background: inTune
                    ? "#2ed573"
                    : cents < 0
                    ? "#ffb142"
                    : "#ff4757",
                  transform: "translateX(-50%)",
                  boxShadow: inTune ? "0 0 8px #2ed573" : "none",
                  transition: "left 0.08s ease, background 0.1s ease",
                }}
              />
            </div>
          </div>

          {/* Toggle Listening Button */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              disabled={isLocked}
              onClick={listening ? stopTuner : () => void startTuner()}
              style={{
                flex: 1,
                background: isLocked
                  ? "rgba(255, 177, 66, 0.15)"
                  : listening
                  ? "rgba(255, 71, 87, 0.2)"
                  : "rgba(46, 213, 115, 0.2)",
                border: `1px solid ${
                  isLocked ? "#ffb142" : listening ? "#ff4757" : "#2ed573"
                }`,
                color: isLocked ? "#ffb142" : listening ? "#ff4757" : "#2ed573",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: isLocked ? "default" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {isLocked ? (
                <>
                  <Lock size={13} />
                  <span>Listening to Teacher’s Pitch</span>
                </>
              ) : listening ? (
                <>
                  <MicOff size={14} />
                  <span>Pause Mic Tuner</span>
                </>
              ) : (
                <>
                  <Mic size={14} />
                  <span>Start Mic Tuner</span>
                </>
              )}
            </button>
          </div>

          {/* Sync to Student Checkbox */}
          {!isLocked && (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 8,
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <label
                style={{
                  fontSize: 11,
                  color: syncToRoom ? "#2ed573" : "#aaa",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
                title="When enabled, pitch detection syncs live to student. When disabled, you tune privately on your side."
              >
                <input
                  type="checkbox"
                  checked={syncToRoom}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setSyncToRoom(next);
                    if (!next && sendTuner) {
                      const payload = JSON.stringify({ type: "stop" });
                      sendTuner(new TextEncoder().encode(payload), {
                        reliable: false,
                      });
                    }
                  }}
                  style={{ accentColor: "#2ed573", cursor: "pointer" }}
                />
                Sync pitch to student
              </label>
              <span
                style={{
                  fontSize: 10,
                  color: syncToRoom ? "#2ed573" : "#666",
                }}
              >
                {syncToRoom ? "● Synchronized" : "Local only"}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
