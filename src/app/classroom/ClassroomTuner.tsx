"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, X } from "lucide-react";

interface ClassroomTunerProps {
  onClose: () => void;
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

export default function ClassroomTuner({ onClose }: ClassroomTunerProps) {
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("-");
  const [octave, setOctave] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<number>(0);
  const [cents, setCents] = useState<number>(0);
  const [inTune, setInTune] = useState(false);
  const [error, setError] = useState("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startTuner = async () => {
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
  };

  // Autocorrelation Pitch Detection
  const autoCorrelate = (buffer: Float32Array, sampleRate: number): number => {
    // Calculate RMS to ensure signal is loud enough
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    if (rms < 0.01) return -1; // too quiet

    // Trim edges to find signal bounds
    let r1 = 0;
    let r2 = buffer.length - 1;
    const threshold = 0.2;
    for (let i = 0; i < buffer.length / 2; i++) {
      if (Math.abs(buffer[i]) < threshold) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < buffer.length / 2; i++) {
      if (Math.abs(buffer[buffer.length - i]) < threshold) {
        r2 = buffer.length - i;
        break;
      }
    }

    const trimmed = buffer.slice(r1, r2);
    const c = new Array<number>(trimmed.length).fill(0);
    for (let i = 0; i < trimmed.length; i++) {
      for (let j = 0; j < trimmed.length - i; j++) {
        c[i] = c[i] + trimmed[j] * trimmed[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxVal = -1;
    let maxPos = -1;
    for (let i = d; i < trimmed.length; i++) {
      if (c[i] > maxVal) {
        maxVal = c[i];
        maxPos = i;
      }
    }
    let T0 = maxPos;

    // Parabolic interpolation for sub-bin accuracy
    const x1 = c[T0 - 1];
    const x2 = c[T0];
    const x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  };

  const detectPitch = () => {
    if (!analyserRef.current || !audioCtxRef.current) return;
    const buffer = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(buffer);

    const freq = autoCorrelate(buffer, audioCtxRef.current.sampleRate);
    if (freq !== -1 && freq >= 60 && freq <= 1800) {
      // Calculate MIDI note: n = 12 * log2(freq / 440) + 69
      const midi = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
      const roundedMidi = Math.round(midi);
      const noteName = NOTE_STRINGS[roundedMidi % 12];
      const oct = Math.floor(roundedMidi / 12) - 1;

      // Nearest frequency
      const targetFreq = 440 * Math.pow(2, (roundedMidi - 69) / 12);
      const centDiff = Math.floor(
        (1200 * Math.log(freq / targetFreq)) / Math.log(2)
      );

      setNote(noteName);
      setOctave(oct);
      setFrequency(Math.round(freq * 10) / 10);
      setCents(Math.max(-50, Math.min(50, centDiff)));
      setInTune(Math.abs(centDiff) <= 4);
    }

    animationFrameRef.current = requestAnimationFrame(detectPitch);
  };

  useEffect(() => {
    void startTuner();
    return () => {
      stopTuner();
    };
  }, []);

  return (
    <div
      className="pc-tuner-panel"
      style={{
        position: "absolute",
        top: 55,
        right: 18,
        background: "#16201a",
        border: "1px solid rgba(255, 255, 255, 0.22)",
        borderRadius: 14,
        padding: "16px 20px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.7)",
        zIndex: 100,
        width: 290,
        color: "#fff",
        userSelect: "none",
      }}
    >
      {/* Header */}
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
            color: "#2ed573",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          <Radio size={16} />
          Chromatic Tuner
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
        <div
          style={{
            color: "#ff4757",
            fontSize: 11,
            textAlign: "center",
            padding: "10px 0",
          }}
        >
          {error}
        </div>
      ) : (
        <>
          {/* Note Display */}
          <div style={{ textAlign: "center", margin: "10px 0" }}>
            <div
              style={{
                fontSize: 54,
                fontWeight: 900,
                lineHeight: 1,
                color: inTune
                  ? "#2ed573"
                  : cents === 0
                  ? "#fff"
                  : cents < 0
                  ? "#ffb142"
                  : "#ff4757",
                textShadow: inTune
                  ? "0 0 16px rgba(46, 213, 115, 0.6)"
                  : "none",
                transition: "color 0.1s ease",
              }}
            >
              {note}
              {octave !== null && (
                <small
                  style={{
                    fontSize: 24,
                    verticalAlign: "super",
                    marginLeft: 4,
                    opacity: 0.8,
                  }}
                >
                  {octave}
                </small>
              )}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#8fcaab",
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              {frequency > 0
                ? `${frequency.toFixed(1)} Hz`
                : "Play or sing a note…"}
            </div>
          </div>

          {/* Cents Needle Meter (-50 to +50 cents) */}
          <div style={{ margin: "14px 0 8px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "#777",
                marginBottom: 4,
                fontWeight: 600,
              }}
            >
              <span>-50 Flat</span>
              <span style={{ color: inTune ? "#2ed573" : "#aaa" }}>
                {inTune
                  ? "IN TUNE"
                  : cents > 0
                  ? `+${cents}c Sharp`
                  : `${cents}c Flat`}
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
              {/* Center in-tune target zone */}
              <div
                style={{
                  position: "absolute",
                  left: "calc(50% - 10px)",
                  width: 20,
                  height: "100%",
                  background: "rgba(46, 213, 115, 0.25)",
                }}
              />
              {/* Needle Indicator */}
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
              onClick={listening ? stopTuner : () => void startTuner()}
              style={{
                flex: 1,
                background: listening
                  ? "rgba(255, 71, 87, 0.2)"
                  : "rgba(46, 213, 115, 0.2)",
                border: `1px solid ${listening ? "#ff4757" : "#2ed573"}`,
                color: listening ? "#ff4757" : "#2ed573",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
              {listening ? "Pause Mic Tuner" : "Start Mic Tuner"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
