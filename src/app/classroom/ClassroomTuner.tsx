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
    // Calculate RMS to ensure signal is present
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

    // Calculate autocorrelation across candidate periods
    const c = new Float32Array(maxPeriod + 2);
    const halfLen = Math.floor(buffer.length / 2);

    for (let lag = 0; lag <= maxPeriod + 1; lag++) {
      let sum = 0;
      for (let i = 0; i < halfLen; i++) {
        sum += buffer[i] * buffer[i + lag];
      }
      c[lag] = sum;
    }

    // Step past the initial zero-lag decay slope
    let d = minPeriod;
    while (d < maxPeriod && c[d] < c[d - 1]) {
      d++;
    }

    // Find the global maximum correlation peak in [d, maxPeriod]
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
    // Parabolic interpolation around peak for high-precision pitch
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
    // Support from 50 Hz up to 4500 Hz (easily covers C7 at 2093 Hz and C8 at 4186 Hz)
    if (freq !== -1 && freq >= 50 && freq <= 4500) {
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
