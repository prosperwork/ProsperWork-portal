"use client";

import { useEffect, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Music2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

interface PianoNote {
  note: string;
  midi: number;
  isBlack: boolean;
  name: string;
  octave: number;
}

interface ClassroomPianoProps {
  onClose: () => void;
}

// 12 semitones starting from C
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Standard 88-Key Piano: A0 (MIDI 21) to C8 (MIDI 108)
const TOTAL_KEYS = 88;
const START_MIDI = 21; // A0
const END_MIDI = 108;  // C8

const WHITE_KEY_WIDTH_SCROLL = 24; // px in scroll mode
const BLACK_KEY_WIDTH_SCROLL = 15; // px in scroll mode

export default function ClassroomPiano({ onClose }: ClassroomPianoProps) {
  const room = useRoomContext();
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [remoteNotes, setRemoteNotes] = useState<Set<number>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [midiConnected, setMidiConnected] = useState(false);
  const [viewMode, setViewMode] = useState<"scroll" | "fit">("scroll");

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeOscillatorsRef = useRef<
    Map<number, { osc: OscillatorNode; gain: GainNode }>
  >(new Map());

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
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
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

      // Piano-like harmonic content: triangle wave with warm piano envelope
      osc.type = "triangle";
      osc.frequency.setValueAtTime(midiToFreq(midi), ctx.currentTime);

      // ADSR envelope: fast attack, natural acoustic piano decay
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
        existing.gain.gain.setValueAtTime(
          existing.gain.gain.value,
          ctx.currentTime
        );
        existing.gain.gain.exponentialRampToValueAtTime(
          0.0001,
          ctx.currentTime + 0.08
        );
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

  // Web MIDI Support (Full 88-Key sync with external hardware keyboard)
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

  // Generate All 88 Standard Piano Keys (A0 MIDI 21 to C8 MIDI 108)
  const allKeys: PianoNote[] = [];
  for (let midi = START_MIDI; midi <= END_MIDI; midi++) {
    const semitone = midi % 12;
    const name = NOTE_NAMES[semitone];
    const isBlack = name.includes("#");
    const octave = Math.floor(midi / 12) - 1;
    allKeys.push({
      note: `${name}${octave}`,
      midi,
      isBlack,
      name,
      octave,
    });
  }

  const whiteKeys = allKeys.filter((k) => !k.isBlack);
  const blackKeys = allKeys.filter((k) => k.isBlack);

  // Auto-center on Middle C (C4, MIDI 60) on mount
  useEffect(() => {
    if (viewMode === "scroll" && scrollContainerRef.current) {
      const middleCWhiteIndex = whiteKeys.findIndex((w) => w.midi === 60);
      if (middleCWhiteIndex >= 0) {
        const container = scrollContainerRef.current;
        const middleCPos = middleCWhiteIndex * WHITE_KEY_WIDTH_SCROLL;
        const centerOffset = container.clientWidth / 2 - WHITE_KEY_WIDTH_SCROLL / 2;
        container.scrollTo({
          left: Math.max(0, middleCPos - centerOffset),
          behavior: "smooth",
        });
      }
    }
  }, [viewMode]);

  // Jump to specific region
  const jumpToMidi = (targetMidi: number) => {
    if (viewMode !== "scroll" || !scrollContainerRef.current) return;
    const wIndex = whiteKeys.findIndex((w) => w.midi >= targetMidi);
    if (wIndex >= 0) {
      const container = scrollContainerRef.current;
      const targetPos = wIndex * WHITE_KEY_WIDTH_SCROLL;
      const centerOffset = container.clientWidth / 2 - WHITE_KEY_WIDTH_SCROLL / 2;
      container.scrollTo({
        left: Math.max(0, targetPos - centerOffset),
        behavior: "smooth",
      });
    }
  };

  const scrollByOctaves = (direction: -1 | 1) => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollBy({
      left: direction * 7 * WHITE_KEY_WIDTH_SCROLL,
      behavior: "smooth",
    });
  };

  return (
    <div
      className="pc-piano-panel"
      style={{
        position: "absolute",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        background: "linear-gradient(180deg, #18221c 0%, #0d1410 100%)",
        border: "1px solid rgba(46, 213, 115, 0.35)",
        borderRadius: 14,
        padding: "12px 18px 14px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.85), 0 0 20px rgba(46, 213, 115, 0.15)",
        zIndex: 100,
        color: "#fff",
        width: viewMode === "fit" ? "96vw" : "min(96vw, 1340px)",
        maxWidth: "96vw",
        userSelect: "none",
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "rgba(46, 213, 115, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Music2 size={15} color="#2ed573" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <strong style={{ fontSize: 13, color: "#2ed573" }}>
                Standard 88-Key Concert Grand Piano
              </strong>
              <span
                style={{
                  fontSize: 10,
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "#cbd5e1",
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                }}
              >
                A0 – C8 (88 Keys)
              </span>
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
                  ● MIDI Keyboard Sync
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation & Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Quick-Jump Section (Only when in scroll mode) */}
          {viewMode === "scroll" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(0,0,0,0.35)",
                padding: "2px 4px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <button
                type="button"
                onClick={() => scrollByOctaves(-1)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 4,
                  padding: "3px 6px",
                  cursor: "pointer",
                }}
                title="Scroll 1 Octave Down"
              >
                <ChevronLeft size={14} />
              </button>

              <button
                type="button"
                onClick={() => jumpToMidi(21)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#aaa",
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                title="Jump to Low Bass (A0)"
              >
                Bass (A0)
              </button>

              <button
                type="button"
                onClick={() => jumpToMidi(60)}
                style={{
                  background: "rgba(46, 213, 115, 0.22)",
                  border: "1px solid rgba(46, 213, 115, 0.4)",
                  color: "#2ed573",
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                title="Jump to Middle C (C4)"
              >
                ● Middle C (C4)
              </button>

              <button
                type="button"
                onClick={() => jumpToMidi(84)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#aaa",
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                title="Jump to High Treble (C6-C8)"
              >
                Treble (C6+)
              </button>

              <button
                type="button"
                onClick={() => scrollByOctaves(1)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 4,
                  padding: "3px 6px",
                  cursor: "pointer",
                }}
                title="Scroll 1 Octave Up"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* View Mode Toggle (Full Scrollable vs Fit Screen) */}
          <button
            type="button"
            onClick={() => setViewMode((prev) => (prev === "scroll" ? "fit" : "scroll"))}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#e2e8f0",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
            title={
              viewMode === "scroll"
                ? "Switch to Fit Screen (All 88 Keys scaled)"
                : "Switch to Full Scrollable Grand Piano"
            }
          >
            {viewMode === "scroll" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{viewMode === "scroll" ? "Fit Screen" : "Full Size"}</span>
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            style={{
              background: soundEnabled ? "rgba(46, 213, 115, 0.2)" : "rgba(255,255,255,0.1)",
              border: "none",
              color: soundEnabled ? "#2ed573" : "#888",
              borderRadius: 6,
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

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Red Felt Fallboard Runner (Concert Grand Accent) */}
      <div
        style={{
          height: 4,
          background: "linear-gradient(90deg, #8b151b 0%, #b91c1c 50%, #8b151b 100%)",
          borderRadius: "4px 4px 0 0",
          marginBottom: 1,
          boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }}
      />

      {/* Piano Keyboard Container */}
      <div
        ref={scrollContainerRef}
        className="pc-keys-scroll-container"
        style={{
          position: "relative",
          overflowX: viewMode === "scroll" ? "auto" : "hidden",
          overflowY: "hidden",
          background: "#0c0d0e",
          padding: "2px 2px 4px",
          borderRadius: "0 0 8px 8px",
          border: "2px solid #222",
          scrollbarWidth: "thin",
          scrollbarColor: "#2ed573 #111",
        }}
      >
        <div
          className="pc-keys-track"
          style={{
            position: "relative",
            display: "flex",
            height: 130,
            width:
              viewMode === "scroll"
                ? `${whiteKeys.length * WHITE_KEY_WIDTH_SCROLL}px`
                : "100%",
            minWidth:
              viewMode === "scroll"
                ? `${whiteKeys.length * WHITE_KEY_WIDTH_SCROLL}px`
                : "100%",
          }}
        >
          {/* White Keys */}
          {whiteKeys.map((k) => {
            const isPressed = activeNotes.has(k.midi);
            const isRemote = remoteNotes.has(k.midi);
            const isMiddleC = k.midi === 60; // C4

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
                  flex: viewMode === "fit" ? 1 : "none",
                  width:
                    viewMode === "scroll" ? `${WHITE_KEY_WIDTH_SCROLL}px` : "auto",
                  minWidth: viewMode === "fit" ? 0 : `${WHITE_KEY_WIDTH_SCROLL}px`,
                  height: "100%",
                  background: isPressed
                    ? "#2ed573"
                    : isRemote
                    ? "#ffb142"
                    : isMiddleC
                    ? "#fafbf9"
                    : "#ffffff",
                  border: "1px solid #c2c2c2",
                  borderBottom: isMiddleC
                    ? "5px solid #2ed573"
                    : "4px solid #999",
                  borderRadius: "0 0 4px 4px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  paddingBottom: 4,
                  cursor: "pointer",
                  boxShadow: isPressed
                    ? "inset 0 4px 8px rgba(0,0,0,0.4)"
                    : "none",
                  transform: isPressed ? "translateY(2px)" : "none",
                  transition: "background 0.05s ease, transform 0.05s ease",
                  position: "relative",
                  boxSizing: "border-box",
                }}
                title={`${k.name}${k.octave} (MIDI ${k.midi})${isMiddleC ? " - Middle C" : ""}`}
              >
                {/* Middle C Marker Indicator */}
                {isMiddleC && (
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#2ed573",
                      boxShadow: "0 0 6px #2ed573",
                    }}
                  />
                )}

                {/* Show label on C notes or when zoomed in */}
                {(k.name === "C" || viewMode === "scroll") && (
                  <span
                    style={{
                      fontSize: viewMode === "fit" && k.name !== "C" ? 7 : 8,
                      fontWeight: k.name === "C" ? 800 : 600,
                      color:
                        isPressed || isRemote
                          ? "#fff"
                          : isMiddleC
                          ? "#059669"
                          : "#555",
                      pointerEvents: "none",
                      lineHeight: 1,
                    }}
                  >
                    {k.name}
                    {k.octave}
                  </span>
                )}
              </div>
            );
          })}

          {/* Black Keys Rendered Over White Keys */}
          {blackKeys.map((k) => {
            // Find preceding white key index
            const precedingWhiteIdx = whiteKeys.findIndex(
              (w) => w.midi === k.midi - 1
            );
            if (precedingWhiteIdx < 0) return null;

            const isPressed = activeNotes.has(k.midi);
            const isRemote = remoteNotes.has(k.midi);

            // In scroll mode, fixed px placement on the seam
            // In fit mode, exact percentage placement
            const leftPositionStyle =
              viewMode === "scroll"
                ? {
                    left: `${
                      (precedingWhiteIdx + 1) * WHITE_KEY_WIDTH_SCROLL -
                      BLACK_KEY_WIDTH_SCROLL / 2
                    }px`,
                    width: `${BLACK_KEY_WIDTH_SCROLL}px`,
                  }
                : {
                    left: `${((precedingWhiteIdx + 1) / whiteKeys.length) * 100}%`,
                    width: `max(7px, ${100 / whiteKeys.length * 0.65}%)`,
                    transform: "translateX(-50%)",
                  };

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
                  ...leftPositionStyle,
                  height: "64%",
                  background: isPressed
                    ? "#2ed573"
                    : isRemote
                    ? "#ffb142"
                    : "linear-gradient(180deg, #2b2b2b 0%, #151515 100%)",
                  border: "1px solid #111",
                  borderBottom: "3px solid #000",
                  borderRadius: "0 0 3px 3px",
                  zIndex: 2,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  paddingBottom: 3,
                  cursor: "pointer",
                  boxShadow: isPressed
                    ? "0 0 10px #2ed573"
                    : "0 3px 6px rgba(0,0,0,0.7)",
                  transition: "background 0.05s ease",
                  boxSizing: "border-box",
                }}
                title={`${k.name.replace("#", "♯")}${k.octave} (MIDI ${k.midi})`}
              >
                {viewMode === "scroll" && (
                  <span
                    style={{
                      fontSize: 7,
                      fontWeight: 700,
                      color: isPressed || isRemote ? "#000" : "#bbb",
                      pointerEvents: "none",
                    }}
                  >
                    {k.name.replace("#", "♯")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 10,
          color: "#8fcaab",
          padding: "0 4px",
        }}
      >
        <span>
          {midiConnected
            ? "● Physical MIDI keyboard active (all 88 keys sync bidirectionally)"
            : "Click, tap, or connect any USB/Bluetooth MIDI keyboard"}
        </span>
        <span style={{ color: "#aaa" }}>
          Full 88 Keys (A0 – C8) · Middle C is marked with green
        </span>
      </div>
    </div>
  );
}
