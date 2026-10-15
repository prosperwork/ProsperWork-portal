"use client";

import { useEffect, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";
import { ChevronLeft, ChevronRight, Music2, Volume2, VolumeX, X } from "lucide-react";

interface PianoNote {
  note: string;
  midi: number;
  isBlack: boolean;
  name: string;
}

interface ClassroomPianoProps {
  onClose: () => void;
}

// 12 semitones
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export default function ClassroomPiano({ onClose }: ClassroomPianoProps) {
  const room = useRoomContext();
  const [baseOctave, setBaseOctave] = useState(4); // C4 default
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [remoteNotes, setRemoteNotes] = useState<Set<number>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [midiConnected, setMidiConnected] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeOscillatorsRef = useRef<Map<number, { osc: OscillatorNode; gain: GainNode }>>(new Map());

  // Listen to remote participant piano notes
  const { send: sendPianoData } = useDataChannel("piano_sync", (msg) => {
    try {
      const decoded = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(decoded);
      if (data.type === "note_on" && typeof data.midi === "number") {
        setRemoteNotes((prev) => new Set(prev).add(data.midi));
        if (soundEnabled) playTone(data.midi);
      } else if (data.type === "note_off" && typeof data.midi === "number") {
        setRemoteNotes((prev) => {
          const next = new Set(prev);
          next.delete(data.midi);
          return next;
        });
        stopTone(data.midi);
      }
    } catch {
      // ignore
    }
  });

  // Sound Engine
  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

  const playTone = (midi: number) => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      // Stop existing if any
      stopTone(midi);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Piano-like harmonic content: triangle wave with harmonic overtones
      osc.type = "triangle";
      osc.frequency.setValueAtTime(midiToFreq(midi), ctx.currentTime);

      // ADSR envelope: fast attack, natural acoustic decay
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      activeOscillatorsRef.current.set(midi, { osc, gain });
    } catch {
      // AudioContext might require user gesture
    }
  };

  const stopTone = (midi: number) => {
    const existing = activeOscillatorsRef.current.get(midi);
    if (existing && audioCtxRef.current) {
      try {
        const ctx = audioCtxRef.current;
        existing.gain.gain.cancelScheduledValues(ctx.currentTime);
        existing.gain.gain.setValueAtTime(existing.gain.gain.value, ctx.currentTime);
        existing.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
        existing.osc.stop(ctx.currentTime + 0.09);
      } catch {
        // ignore
      }
      activeOscillatorsRef.current.delete(midi);
    }
  };

  const handleNoteOn = (midi: number) => {
    setActiveNotes((prev) => new Set(prev).add(midi));
    playTone(midi);
    if (sendPianoData) {
      const payload = JSON.stringify({ type: "note_on", midi });
      sendPianoData(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  const handleNoteOff = (midi: number) => {
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
    stopTone(midi);
    if (sendPianoData) {
      const payload = JSON.stringify({ type: "note_off", midi });
      sendPianoData(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  // Web MIDI Support
  useEffect(() => {
    if (typeof navigator !== "undefined" && "requestMIDIAccess" in navigator) {
      (navigator as any).requestMIDIAccess().then(
        (midiAccess: any) => {
          setMidiConnected(true);
          const handleMidiMessage = (event: { data: Uint8Array | number[] }) => {
            const [status, noteNumber, velocity] = Array.from(event.data);
            const command = status >> 4;
            if (command === 9 && velocity > 0) {
              handleNoteOn(noteNumber);
            } else if (command === 8 || (command === 9 && velocity === 0)) {
              handleNoteOff(noteNumber);
            }
          };

          for (const input of midiAccess.inputs.values()) {
            input.onmidimessage = handleMidiMessage;
          }

          midiAccess.onstatechange = () => {
            for (const input of midiAccess.inputs.values()) {
              input.onmidimessage = handleMidiMessage;
            }
          };
        },
        () => setMidiConnected(false)
      );
    }
    return () => {
      activeOscillatorsRef.current.forEach(({ osc }) => {
        try {
          osc.stop();
        } catch {
          // ignore
        }
      });
      activeOscillatorsRef.current.clear();
    };
  }, []);

  // Generate 2 Octaves (24 semitones from C{baseOctave} to B{baseOctave + 1})
  const generateKeys = (): PianoNote[] => {
    const startMidi = (baseOctave + 1) * 12; // C4 is 60
    const keys: PianoNote[] = [];
    for (let i = 0; i < 24; i++) {
      const midi = startMidi + i;
      const semitone = midi % 12;
      const name = NOTE_NAMES[semitone];
      const isBlack = name.includes("#");
      keys.push({ note: `${name}${Math.floor(midi / 12) - 1}`, midi, isBlack, name });
    }
    return keys;
  };

  const keys = generateKeys();
  const whiteKeys = keys.filter((k) => !k.isBlack);

  return (
    <div
      className="pc-piano-panel"
      style={{
        position: "absolute",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#18221c",
        border: "1px solid rgba(255, 255, 255, 0.22)",
        borderRadius: 14,
        padding: "12px 18px 16px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.7)",
        zIndex: 100,
        color: "#fff",
        maxWidth: "96vw",
        userSelect: "none",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Music2 size={16} color="#2ed573" />
          <strong style={{ fontSize: 13, color: "#2ed573" }}>Visual Keyboard &amp; MIDI</strong>
          {midiConnected && (
            <span
              style={{
                fontSize: 10,
                background: "rgba(46, 213, 115, 0.2)",
                color: "#2ed573",
                padding: "2px 6px",
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              MIDI Connected
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Octave Shift */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              disabled={baseOctave <= 1}
              onClick={() => setBaseOctave((prev) => Math.max(1, prev - 1))}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                color: "#fff",
                borderRadius: 4,
                padding: "2px 6px",
                cursor: "pointer",
              }}
              title="Lower Octave"
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 11, fontWeight: 700, minWidth: 50, textAlign: "center" }}>
              C{baseOctave} - B{baseOctave + 1}
            </span>
            <button
              type="button"
              disabled={baseOctave >= 6}
              onClick={() => setBaseOctave((prev) => Math.min(6, prev + 1))}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                color: "#fff",
                borderRadius: 4,
                padding: "2px 6px",
                cursor: "pointer",
              }}
              title="Raise Octave"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            style={{
              background: soundEnabled ? "rgba(46, 213, 115, 0.2)" : "rgba(255,255,255,0.1)",
              border: "none",
              color: soundEnabled ? "#2ed573" : "#888",
              borderRadius: 4,
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: 11,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>Sound</span>
          </button>

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
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Piano Keyboard Container */}
      <div
        className="pc-keys-wrapper"
        style={{
          position: "relative",
          display: "flex",
          height: 120,
          background: "#111",
          padding: "3px 4px",
          borderRadius: 8,
          border: "2px solid #222",
        }}
      >
        {whiteKeys.map((k) => {
          const isPressed = activeNotes.has(k.midi);
          const isRemote = remoteNotes.has(k.midi);
          return (
            <div
              key={k.midi}
              onMouseDown={() => handleNoteOn(k.midi)}
              onMouseUp={() => handleNoteOff(k.midi)}
              onMouseLeave={() => {
                if (activeNotes.has(k.midi)) handleNoteOff(k.midi);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                handleNoteOn(k.midi);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleNoteOff(k.midi);
              }}
              style={{
                flex: 1,
                minWidth: 26,
                maxWidth: 42,
                height: "100%",
                background: isPressed
                  ? "#2ed573"
                  : isRemote
                  ? "#ffb142"
                  : "#ffffff",
                border: "1px solid #c2c2c2",
                borderBottom: "4px solid #999",
                borderRadius: "0 0 5px 5px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                alignItems: "center",
                paddingBottom: 6,
                cursor: "pointer",
                boxShadow: isPressed ? "inset 0 4px 8px rgba(0,0,0,0.4)" : "none",
                transform: isPressed ? "translateY(2px)" : "none",
                transition: "background 0.05s ease",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: isPressed || isRemote ? "#fff" : "#444",
                }}
              >
                {k.name}
              </span>
            </div>
          );
        })}

        {/* Black Keys Rendered Over White Keys */}
        {keys
          .filter((k) => k.isBlack)
          .map((k) => {
            // Find index among all keys to position precisely
            const whiteIndexBefore = keys
              .slice(0, keys.findIndex((x) => x.midi === k.midi))
              .filter((x) => !x.isBlack).length;

            const isPressed = activeNotes.has(k.midi);
            const isRemote = remoteNotes.has(k.midi);

            return (
              <div
                key={k.midi}
                onMouseDown={() => handleNoteOn(k.midi)}
                onMouseUp={() => handleNoteOff(k.midi)}
                onMouseLeave={() => {
                  if (activeNotes.has(k.midi)) handleNoteOff(k.midi);
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleNoteOn(k.midi);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleNoteOff(k.midi);
                }}
                style={{
                  position: "absolute",
                  left: `calc(${whiteIndexBefore} * (100% / ${whiteKeys.length}) - 10px)`,
                  width: 20,
                  height: "64%",
                  background: isPressed
                    ? "#2ed573"
                    : isRemote
                    ? "#ffb142"
                    : "#222222",
                  border: "1px solid #111",
                  borderBottom: "3px solid #000",
                  borderRadius: "0 0 4px 4px",
                  zIndex: 2,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  paddingBottom: 4,
                  cursor: "pointer",
                  boxShadow: isPressed ? "0 0 8px #2ed573" : "0 3px 6px rgba(0,0,0,0.6)",
                  transform: isPressed ? "translateY(2px)" : "none",
                  transition: "background 0.05s ease",
                }}
              >
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: isPressed || isRemote ? "#000" : "#fff",
                  }}
                >
                  {k.name.replace("#", "♯")}
                </span>
              </div>
            );
          })}
      </div>

      <div style={{ textAlign: "center", marginTop: 6, fontSize: 10, color: "#8fcaab" }}>
        {midiConnected
          ? "● Real MIDI Keyboard active: Keys played physically will highlight on both screens"
          : "Click or tap keys to play · Notes synchronize live with the other person"}
      </div>
    </div>
  );
}

