"use client";

import { useEffect, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Maximize2,
  Minimize2,
  Music2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

export type PianoSize = "small" | "medium" | "large";

interface PianoNote {
  note: string;
  midi: number;
  isBlack: boolean;
  name: string;
  octave: number;
}

interface ClassroomPianoProps {
  onClose: () => void;
  isLocked?: boolean;
  isAdmin?: boolean;
  initialSize?: PianoSize;
}

// 12 semitones starting from C
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface PianoSizeConfig {
  startMidi: number;
  endMidi: number;
  label: string;
  shortLabel: string;
  keyCount: number;
  whiteKeyWidthScroll: number;
  blackKeyWidthScroll: number;
  defaultScrollTargetMidi: number;
}

const PIANO_SIZES: Record<PianoSize, PianoSizeConfig> = {
  small: {
    startMidi: 48, // C3
    endMidi: 72,   // C5
    label: "Small (25 Keys · 2 Octaves)",
    shortLabel: "Small (25)",
    keyCount: 25,
    whiteKeyWidthScroll: 36,
    blackKeyWidthScroll: 22,
    defaultScrollTargetMidi: 60, // C4
  },
  medium: {
    startMidi: 36, // C2
    endMidi: 84,   // C6
    label: "Medium (49 Keys · 4 Octaves)",
    shortLabel: "Medium (49)",
    keyCount: 49,
    whiteKeyWidthScroll: 28,
    blackKeyWidthScroll: 17,
    defaultScrollTargetMidi: 60, // C4
  },
  large: {
    startMidi: 21, // A0
    endMidi: 108,  // C8
    label: "Large (88 Keys · Concert Grand)",
    shortLabel: "Large (88)",
    keyCount: 88,
    whiteKeyWidthScroll: 24,
    blackKeyWidthScroll: 15,
    defaultScrollTargetMidi: 60, // C4
  },
};

export default function ClassroomPiano({
  onClose,
  isLocked = false,
  isAdmin = false,
  initialSize = "large",
}: ClassroomPianoProps) {
  const room = useRoomContext();
  const [keyboardSize, setKeyboardSize] = useState<PianoSize>(initialSize);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [remoteNotes, setRemoteNotes] = useState<Set<number>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [midiConnected, setMidiConnected] = useState(false);
  const [viewMode, setViewMode] = useState<"scroll" | "fit">("scroll");
  const [syncToRoom, setSyncToRoom] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeOscillatorsRef = useRef<
    Map<number, { osc: OscillatorNode; gain: GainNode }>
  >(new Map());

  const currentConfig = PIANO_SIZES[keyboardSize];

  // Listen to remote participant piano notes & size change broadcasts
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
      } else if (
        data.type === "piano_size_changed" &&
        (data.size === "small" || data.size === "medium" || data.size === "large")
      ) {
        setKeyboardSize(data.size);
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
      stopTone(midi);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(midiToFreq(midi), ctx.currentTime);

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
    // If student has piano locked, prevent student from triggering note events
    if (isLocked) return;
    setActiveNotes((prev) => new Set(prev).add(midi));
    playTone(midi);
    if (sendPianoData && syncToRoom) {
      const payload = JSON.stringify({ type: "note_on", midi });
      sendPianoData(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  const handleNoteOff = (midi: number) => {
    if (isLocked) return;
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
    stopTone(midi);
    if (sendPianoData && syncToRoom) {
      const payload = JSON.stringify({ type: "note_off", midi });
      sendPianoData(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  // Change keyboard size (Admin broadcasts to all students in room if syncToRoom is enabled)
  const handleSizeChange = (newSize: PianoSize) => {
    setKeyboardSize(newSize);
    if (sendPianoData && isAdmin && syncToRoom) {
      const payload = JSON.stringify({ type: "piano_size_changed", size: newSize });
      sendPianoData(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  // Web MIDI Support (Synchronizes external hardware keyboard)
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
  }, [isLocked]);

  // Generate Keys for the active size configuration
  const allKeys: PianoNote[] = [];
  for (let midi = currentConfig.startMidi; midi <= currentConfig.endMidi; midi++) {
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

  // Auto-center on Middle C (C4, MIDI 60) on size or view change
  useEffect(() => {
    if (viewMode === "scroll" && scrollContainerRef.current) {
      const middleCWhiteIndex = whiteKeys.findIndex((w) => w.midi === 60);
      if (middleCWhiteIndex >= 0) {
        const container = scrollContainerRef.current;
        const middleCPos = middleCWhiteIndex * currentConfig.whiteKeyWidthScroll;
        const centerOffset =
          container.clientWidth / 2 - currentConfig.whiteKeyWidthScroll / 2;
        container.scrollTo({
          left: Math.max(0, middleCPos - centerOffset),
          behavior: "smooth",
        });
      }
    }
  }, [keyboardSize, viewMode]);

  const jumpToMidi = (targetMidi: number) => {
    if (viewMode !== "scroll" || !scrollContainerRef.current) return;
    const wIndex = whiteKeys.findIndex((w) => w.midi >= targetMidi);
    if (wIndex >= 0) {
      const container = scrollContainerRef.current;
      const targetPos = wIndex * currentConfig.whiteKeyWidthScroll;
      const centerOffset =
        container.clientWidth / 2 - currentConfig.whiteKeyWidthScroll / 2;
      container.scrollTo({
        left: Math.max(0, targetPos - centerOffset),
        behavior: "smooth",
      });
    }
  };

  const scrollByOctaves = (direction: -1 | 1) => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollBy({
      left: direction * 7 * currentConfig.whiteKeyWidthScroll,
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
        border: `1px solid ${
          isLocked ? "rgba(255, 177, 66, 0.4)" : "rgba(46, 213, 115, 0.35)"
        }`,
        borderRadius: 14,
        padding: "10px 14px 12px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.85), 0 0 20px rgba(0,0,0,0.5)",
        zIndex: 100,
        color: "#fff",
        width: viewMode === "fit" ? "96vw" : "min(96vw, 1340px)",
        maxWidth: "98vw",
        userSelect: "none",
        boxSizing: "border-box",
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: isLocked
                ? "rgba(255, 177, 66, 0.18)"
                : "rgba(46, 213, 115, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Music2 size={15} color={isLocked ? "#ffb142" : "#2ed573"} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <strong
              style={{
                fontSize: 13,
                color: isLocked ? "#ffb142" : "#2ed573",
              }}
            >
              Visual Keyboard
            </strong>

            {/* Size Selector Control */}
            <div
              style={{
                display: "inline-flex",
                background: "rgba(0,0,0,0.4)",
                padding: "2px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                gap: 2,
              }}
            >
              {(["small", "medium", "large"] as PianoSize[]).map((sz) => {
                const isActive = keyboardSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => handleSizeChange(sz)}
                    style={{
                      background: isActive
                        ? isLocked
                          ? "#ffb142"
                          : "#2ed573"
                        : "transparent",
                      color: isActive ? "#000" : "#bbb",
                      border: "none",
                      borderRadius: 4,
                      padding: "2px 7px",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    title={
                      isAdmin
                        ? `Set keyboard size to ${PIANO_SIZES[sz].label} (Syncs with students)`
                        : `Switch view to ${PIANO_SIZES[sz].label}`
                    }
                  >
                    {PIANO_SIZES[sz].shortLabel}
                  </button>
                );
              })}
            </div>

            {/* Lock Status Badge */}
            {isLocked ? (
              <span
                style={{
                  fontSize: 10,
                  background: "rgba(255, 177, 66, 0.18)",
                  color: "#ffb142",
                  border: "1px solid rgba(255, 177, 66, 0.35)",
                  padding: "2px 7px",
                  borderRadius: 4,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Lock size={10} /> View Only · Live Teacher Sync
              </span>
            ) : midiConnected ? (
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
                ● MIDI Keyboard Connected
              </span>
            ) : null}

            {/* Sync to Student Checkbox */}
            {!isLocked && (
              <label
                style={{
                  fontSize: 11,
                  color: syncToRoom ? "#2ed573" : "#aaa",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                  background: syncToRoom
                    ? "rgba(46, 213, 115, 0.12)"
                    : "rgba(255, 255, 255, 0.05)",
                  padding: "2px 8px",
                  borderRadius: 5,
                  border: `1px solid ${
                    syncToRoom
                      ? "rgba(46, 213, 115, 0.35)"
                      : "rgba(255, 255, 255, 0.12)"
                  }`,
                }}
                title="When enabled, your played keys and sounds synchronize live to student. When unchecked, you play privately on your side."
              >
                <input
                  type="checkbox"
                  checked={syncToRoom}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setSyncToRoom(next);
                    if (!next && sendPianoData) {
                      activeNotes.forEach((midi) => {
                        const payload = JSON.stringify({ type: "note_off", midi });
                        sendPianoData(new TextEncoder().encode(payload), { reliable: true });
                      });
                    }
                  }}
                  style={{ accentColor: "#2ed573", cursor: "pointer" }}
                />
                <span>{syncToRoom ? "Sync piano to student" : "Local only"}</span>
              </label>
            )}
          </div>
        </div>

        {/* Navigation & Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {/* Quick-Jump Section (Only when in scroll mode and multiple octaves) */}
          {viewMode === "scroll" && keyboardSize !== "small" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
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
                  padding: "3px 5px",
                  cursor: "pointer",
                }}
                title="Scroll 1 Octave Down"
              >
                <ChevronLeft size={13} />
              </button>

              <button
                type="button"
                onClick={() => jumpToMidi(currentConfig.startMidi)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#aaa",
                  borderRadius: 4,
                  padding: "3px 6px",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                title="Jump to Lowest Octave"
              >
                Bass
              </button>

              <button
                type="button"
                onClick={() => jumpToMidi(60)}
                style={{
                  background: "rgba(46, 213, 115, 0.22)",
                  border: "1px solid rgba(46, 213, 115, 0.4)",
                  color: "#2ed573",
                  borderRadius: 4,
                  padding: "3px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                title="Jump to Middle C (C4)"
              >
                ● Mid C4
              </button>

              <button
                type="button"
                onClick={() => jumpToMidi(keyboardSize === "large" ? 84 : 72)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#aaa",
                  borderRadius: 4,
                  padding: "3px 6px",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                title="Jump to Upper Register"
              >
                Treble
              </button>

              <button
                type="button"
                onClick={() => scrollByOctaves(1)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 4,
                  padding: "3px 5px",
                  cursor: "pointer",
                }}
                title="Scroll 1 Octave Up"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}

          {/* View Mode Toggle (Full Size Scroll vs Fit Screen) */}
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
              gap: 4,
            }}
            title={
              viewMode === "scroll"
                ? "Switch to Fit Screen (Scales keys across width)"
                : "Switch to Full Size (Scrollable keyboard)"
            }
          >
            {viewMode === "scroll" ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            <span>{viewMode === "scroll" ? "Fit Screen" : "Full Size"}</span>
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            style={{
              background: soundEnabled
                ? "rgba(46, 213, 115, 0.2)"
                : "rgba(255,255,255,0.1)",
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
            title={soundEnabled ? "Mute piano audio" : "Enable piano audio"}
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
            title="Close Piano"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Red Felt Runner Fallboard Accent */}
      <div
        style={{
          height: 3,
          background: "linear-gradient(90deg, #8b151b 0%, #b91c1c 50%, #8b151b 100%)",
          borderRadius: "3px 3px 0 0",
          marginBottom: 1,
          boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }}
      />

      {/* Piano Keyboard Scroll Container */}
      <div
        ref={scrollContainerRef}
        className="pc-keys-scroll-container"
        style={{
          position: "relative",
          overflowX: viewMode === "scroll" ? "auto" : "hidden",
          overflowY: "hidden",
          background: "#0c0d0e",
          padding: "2px 2px 3px",
          borderRadius: "0 0 8px 8px",
          border: "2px solid #222",
          scrollbarWidth: "thin",
          scrollbarColor: "#2ed573 #111",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          className="pc-keys-track"
          style={{
            position: "relative",
            display: "flex",
            height: keyboardSize === "small" ? 115 : 125,
            width:
              viewMode === "scroll"
                ? `${whiteKeys.length * currentConfig.whiteKeyWidthScroll}px`
                : "100%",
            minWidth:
              viewMode === "scroll"
                ? `${whiteKeys.length * currentConfig.whiteKeyWidthScroll}px`
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
                    viewMode === "scroll"
                      ? `${currentConfig.whiteKeyWidthScroll}px`
                      : "auto",
                  minWidth:
                    viewMode === "fit"
                      ? 0
                      : `${currentConfig.whiteKeyWidthScroll}px`,
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
                  cursor: isLocked ? "default" : "pointer",
                  boxShadow:
                    isPressed || isRemote
                      ? "inset 0 4px 8px rgba(0,0,0,0.4)"
                      : "none",
                  transform: isPressed || isRemote ? "translateY(2px)" : "none",
                  transition: "background 0.05s ease, transform 0.05s ease",
                  position: "relative",
                  boxSizing: "border-box",
                }}
                title={`${k.name}${k.octave} (MIDI ${k.midi})${
                  isMiddleC ? " - Middle C" : ""
                }${isLocked ? " · Locked (View Only)" : ""}`}
              >
                {/* Middle C Dot Indicator */}
                {isMiddleC && (
                  <span
                    style={{
                      position: "absolute",
                      top: 5,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#2ed573",
                      boxShadow: "0 0 6px #2ed573",
                    }}
                  />
                )}

                {/* Note Label */}
                {(k.name === "C" ||
                  viewMode === "scroll" ||
                  keyboardSize === "small") && (
                  <span
                    style={{
                      fontSize:
                        viewMode === "fit" && keyboardSize === "large"
                          ? 7
                          : 8,
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
            const precedingWhiteIdx = whiteKeys.findIndex(
              (w) => w.midi === k.midi - 1
            );
            if (precedingWhiteIdx < 0) return null;

            const isPressed = activeNotes.has(k.midi);
            const isRemote = remoteNotes.has(k.midi);

            const leftPositionStyle =
              viewMode === "scroll"
                ? {
                    left: `${
                      (precedingWhiteIdx + 1) *
                        currentConfig.whiteKeyWidthScroll -
                      currentConfig.blackKeyWidthScroll / 2
                    }px`,
                    width: `${currentConfig.blackKeyWidthScroll}px`,
                  }
                : {
                    left: `${
                      ((precedingWhiteIdx + 1) / whiteKeys.length) * 100
                    }%`,
                    width: `max(6px, ${
                      (100 / whiteKeys.length) * 0.65
                    }%)`,
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
                  cursor: isLocked ? "default" : "pointer",
                  boxShadow:
                    isPressed || isRemote
                      ? `0 0 10px ${isRemote ? "#ffb142" : "#2ed573"}`
                      : "0 3px 6px rgba(0,0,0,0.7)",
                  transform: isPressed || isRemote ? "translateY(2px)" : "none",
                  transition: "background 0.05s ease, transform 0.05s ease",
                  boxSizing: "border-box",
                }}
                title={`${k.name.replace("#", "♯")}${k.octave} (MIDI ${k.midi})${
                  isLocked ? " · Locked (View Only)" : ""
                }`}
              >
                {(viewMode === "scroll" || keyboardSize === "small") && (
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

      {/* Bottom Status / Guidance */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 10,
          color: isLocked ? "#ffb142" : "#8fcaab",
          padding: "0 4px",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <span>
          {isLocked
            ? "🔒 View Only Mode: You are viewing your teacher's demonstration live"
            : midiConnected
            ? "● Physical MIDI keyboard active · All notes synchronize with the classroom"
            : "Click, tap, or connect any USB/Bluetooth MIDI keyboard"}
        </span>
        <span style={{ color: "#aaa" }}>
          {currentConfig.label} · Middle C (C4) marked with green
        </span>
      </div>
    </div>
  );
}
