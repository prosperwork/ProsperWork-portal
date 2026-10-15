import { useEffect, useRef, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import { Disc3, Volume2, VolumeX, X } from "lucide-react";

interface ClassroomDroneProps {
  onClose: () => void;
  tunerOpen?: boolean;
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export default function ClassroomDrone({
  onClose,
  tunerOpen = false,
}: ClassroomDroneProps) {
  const [selectedNote, setSelectedNote] = useState("A");
  const [octave, setOctave] = useState(4);
  const [standardFreq, setStandardFreq] = useState(440); // 440 Hz or 432 Hz
  const [isPlaying, setIsPlaying] = useState(false);
  const [includeFifth, setIncludeFifth] = useState(true); // Root + Fifth drone
  const [volume, setVolume] = useState(0.4);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const rootOscRef = useRef<OscillatorNode | null>(null);
  const fifthOscRef = useRef<OscillatorNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // Sync drone state across call
  const { send: sendDrone } = useDataChannel("drone_sync", (msg) => {
    try {
      const decoded = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(decoded);
      if (data.type === "play") {
        setSelectedNote(data.note);
        setOctave(data.octave);
        setStandardFreq(data.standardFreq);
        setIncludeFifth(Boolean(data.includeFifth));
        if (!isPlaying)
          startDroneAudio(
            data.note,
            data.octave,
            data.standardFreq,
            data.includeFifth
          );
      } else if (data.type === "stop") {
        stopDroneAudio();
      }
    } catch {
      // ignore
    }
  });

  const getFreq = (noteName: string, oct: number, baseA = 440) => {
    const semitone = NOTES.indexOf(noteName);
    const midi = (oct + 1) * 12 + semitone;
    return baseA * Math.pow(2, (midi - 69) / 12);
  };

  const startDroneAudio = (
    note = selectedNote,
    oct = octave,
    baseA = standardFreq,
    fifth = includeFifth
  ) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = audioCtxRef.current || new AudioCtx();
      audioCtxRef.current = ctx;

      if (ctx.state === "suspended") void ctx.resume();

      // Stop previous if active
      if (rootOscRef.current) rootOscRef.current.stop();
      if (fifthOscRef.current) fifthOscRef.current.stop();

      // Master Gain
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.15);
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      // Root Oscillator
      const rootFreq = getFreq(note, oct, baseA);
      const rootOsc = ctx.createOscillator();
      rootOsc.type = "sine";
      rootOsc.frequency.setValueAtTime(rootFreq, ctx.currentTime);
      rootOsc.connect(masterGain);
      rootOsc.start();
      rootOscRef.current = rootOsc;

      // Fifth Harmonic Oscillator
      if (fifth) {
        const fifthFreq = rootFreq * 1.498307; // perfect fifth interval (7 semitones)
        const fifthOsc = ctx.createOscillator();
        const fifthGain = ctx.createGain();
        fifthGain.gain.value = 0.35; // quieter overtone
        fifthOsc.type = "triangle";
        fifthOsc.frequency.setValueAtTime(fifthFreq, ctx.currentTime);
        fifthOsc.connect(fifthGain);
        fifthGain.connect(masterGain);
        fifthOsc.start();
        fifthOscRef.current = fifthOsc;
      }

      setIsPlaying(true);
    } catch {
      // ignore
    }
  };

  const stopDroneAudio = () => {
    if (audioCtxRef.current && masterGainRef.current) {
      try {
        const ctx = audioCtxRef.current;
        masterGainRef.current.gain.linearRampToValueAtTime(
          0.0001,
          ctx.currentTime + 0.1
        );
        setTimeout(() => {
          rootOscRef.current?.stop();
          fifthOscRef.current?.stop();
          rootOscRef.current = null;
          fifthOscRef.current = null;
        }, 120);
      } catch {
        // ignore
      }
    }
    setIsPlaying(false);
  };

  const startDrone = () => {
    startDroneAudio(selectedNote, octave, standardFreq, includeFifth);
    if (sendDrone) {
      const payload = JSON.stringify({
        type: "play",
        note: selectedNote,
        octave,
        standardFreq,
        includeFifth,
      });
      sendDrone(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  const stopDrone = () => {
    stopDroneAudio();
    if (sendDrone) {
      const payload = JSON.stringify({ type: "stop" });
      sendDrone(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  // Re-tune active oscillator if parameters change while playing
  useEffect(() => {
    if (isPlaying && rootOscRef.current && audioCtxRef.current) {
      const rootFreq = getFreq(selectedNote, octave, standardFreq);
      rootOscRef.current.frequency.setTargetAtTime(
        rootFreq,
        audioCtxRef.current.currentTime,
        0.05
      );
      if (fifthOscRef.current) {
        fifthOscRef.current.frequency.setTargetAtTime(
          rootFreq * 1.498307,
          audioCtxRef.current.currentTime,
          0.05
        );
      }
    }
  }, [selectedNote, octave, standardFreq, isPlaying]);

  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(
        volume,
        audioCtxRef.current.currentTime,
        0.05
      );
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      stopDrone();
    };
  }, []);

  return (
    <div
      className="pc-drone-panel"
      style={{
        position: "absolute",
        top: 55,
        right: tunerOpen ? 320 : 18,
        background: "#16201a",
        border: "1px solid rgba(255, 255, 255, 0.22)",
        borderRadius: 14,
        padding: "16px 20px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.7)",
        zIndex: 100,
        width: 300,
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
            color: "#a55eea",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          <Disc3 size={16} />
          Pitch Drone &amp; Ear Training
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

      {/* Note Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 5,
          marginBottom: 12,
        }}
      >
        {NOTES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setSelectedNote(n)}
            style={{
              background:
                selectedNote === n ? "#a55eea" : "rgba(255,255,255,0.08)",
              border: `1px solid ${
                selectedNote === n ? "#a55eea" : "rgba(255,255,255,0.15)"
              }`,
              color: "#fff",
              borderRadius: 6,
              padding: "6px 0",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Octave & Reference Frequency */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10,
              color: "#aaa",
              display: "block",
              marginBottom: 3,
            }}
          >
            Octave
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            {[3, 4, 5].map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOctave(o)}
                style={{
                  flex: 1,
                  background:
                    octave === o
                      ? "rgba(165, 94, 234, 0.3)"
                      : "rgba(255,255,255,0.06)",
                  border: `1px solid ${
                    octave === o ? "#a55eea" : "rgba(255,255,255,0.12)"
                  }`,
                  color: "#fff",
                  borderRadius: 4,
                  padding: "4px 0",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Oct {o}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10,
              color: "#aaa",
              display: "block",
              marginBottom: 3,
            }}
          >
            Standard Pitch
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            {[440, 432].map((hz) => (
              <button
                key={hz}
                type="button"
                onClick={() => setStandardFreq(hz)}
                style={{
                  flex: 1,
                  background:
                    standardFreq === hz
                      ? "rgba(165, 94, 234, 0.3)"
                      : "rgba(255,255,255,0.06)",
                  border: `1px solid ${
                    standardFreq === hz ? "#a55eea" : "rgba(255,255,255,0.12)"
                  }`,
                  color: "#fff",
                  borderRadius: 4,
                  padding: "4px 0",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {hz} Hz
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Root + 5th Checkbox & Volume */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <label
          style={{
            fontSize: 11,
            color: "#ccc",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={includeFifth}
            onChange={(e) => setIncludeFifth(e.target.checked)}
            style={{ accentColor: "#a55eea" }}
          />
          Harmonic 5th ({NOTES[(NOTES.indexOf(selectedNote) + 7) % 12]})
        </label>
        <span style={{ fontSize: 11, color: "#a55eea", fontWeight: 700 }}>
          {getFreq(selectedNote, octave, standardFreq).toFixed(1)} Hz
        </span>
      </div>

      {/* Play/Stop Drone Button */}
      <button
        type="button"
        onClick={isPlaying ? stopDrone : startDrone}
        style={{
          width: "100%",
          background: isPlaying ? "#ff4757" : "#a55eea",
          border: "none",
          color: "#fff",
          borderRadius: 8,
          padding: "9px 12px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {isPlaying ? <VolumeX size={15} /> : <Volume2 size={15} />}
        {isPlaying
          ? `Stop ${selectedNote}${octave} Drone`
          : `Play ${selectedNote}${octave} Drone`}
      </button>
    </div>
  );
}
