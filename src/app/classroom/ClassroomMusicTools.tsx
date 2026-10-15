"use client";

import { useEffect, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";
import {
  Disc3,
  Edit3,
  Hand,
  Mic,
  Music,
  Music2,
  Radio,
  Sliders,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import ClassroomPiano from "./ClassroomPiano";
import ClassroomTuner from "./ClassroomTuner";
import ClassroomDrone from "./ClassroomDrone";
import ClassroomWhiteboard from "./ClassroomWhiteboard";

interface FloatingReaction {
  id: string;
  sender: string;
  emoji: string;
  label: string;
  leftPercent: number;
}

export default function ClassroomMusicTools() {
  const room = useRoomContext();
  const [musicMode, setMusicMode] = useState(true);

  // Tool Modals / Panels
  const [metronomeOpen, setMetronomeOpen] = useState(false);
  const [pianoOpen, setPianoOpen] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [droneOpen, setDroneOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);

  // Metronome State
  const [bpm, setBpm] = useState(120);
  const [isPlayingMetronome, setIsPlayingMetronome] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [currentBeat, setCurrentBeat] = useState(0);

  // Reactions & Hand Raise
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [handRaised, setHandRaised] = useState(false);

  // Audio Context Ref for synthetic woodblock metronome
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const currentBeatRef = useRef<number>(0);
  const timerWorkerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTapRef = useRef<number>(0);
  const tapIntervalsRef = useRef<number[]>([]);

  // Setup LiveKit Data Channel for reactions & metronome sync
  const { send: sendReaction } = useDataChannel("reactions", (msg) => {
    try {
      const decoded = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(decoded);
      if (data.type === "reaction") {
        addFloatingReaction(data.sender, data.emoji, data.label);
      } else if (data.type === "hand_raise") {
        addFloatingReaction(data.sender, "✋", "Hand Raised!");
      }
    } catch {
      // ignore malformed payloads
    }
  });

  const { send: sendMetronome } = useDataChannel("metronome", (msg) => {
    try {
      const decoded = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(decoded);
      if (data.type === "sync_bpm" && typeof data.bpm === "number") {
        setBpm(Math.max(40, Math.min(260, data.bpm)));
      }
    } catch {
      // ignore
    }
  });

  const addFloatingReaction = (sender: string, emoji: string, label: string) => {
    const id = Math.random().toString(36).slice(2, 9);
    const leftPercent = 20 + Math.random() * 60;
    setReactions((prev) => [...prev, { id, sender, emoji, label, leftPercent }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 3500);
  };

  const triggerReaction = (emoji: string, label: string) => {
    const sender = room?.localParticipant?.name || "Participant";
    addFloatingReaction("You", emoji, label);
    if (sendReaction) {
      const payload = JSON.stringify({ type: "reaction", sender, emoji, label });
      sendReaction(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  const toggleHandRaise = () => {
    const next = !handRaised;
    setHandRaised(next);
    const sender = room?.localParticipant?.name || "Participant";
    if (next) {
      addFloatingReaction("You", "✋", "Hand Raised");
      if (sendReaction) {
        const payload = JSON.stringify({ type: "hand_raise", sender });
        sendReaction(new TextEncoder().encode(payload), { reliable: true });
      }
    }
  };

  // Toggle Music Mode (HQ Stereo uncompressed vs Voice Noise Cancellation)
  const toggleMusicMode = async () => {
    const next = !musicMode;
    setMusicMode(next);
    try {
      const audioTracks = Array.from(room?.localParticipant?.audioTrackPublications.values() || []);
      for (const pub of audioTracks) {
        if (pub.track) {
          const mediaTrack = pub.track.mediaStreamTrack;
          if (mediaTrack) {
            await mediaTrack.applyConstraints({
              echoCancellation: !next,
              noiseSuppression: !next,
              autoGainControl: !next,
            });
          }
        }
      }
    } catch (err) {
      console.warn("Could not apply audio constraints:", err);
    }
  };

  // Metronome Sound Engine (Web Audio API)
  const playClick = (time: number, isAccent: boolean) => {
    if (!audioCtxRef.current) return;
    const osc = audioCtxRef.current.createOscillator();
    const gain = audioCtxRef.current.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(isAccent ? 1200 : 800, time);

    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.connect(gain);
    gain.connect(audioCtxRef.current.destination);

    osc.start(time);
    osc.stop(time + 0.05);
  };

  useEffect(() => {
    if (!isPlayingMetronome) {
      if (timerWorkerRef.current) clearInterval(timerWorkerRef.current);
      setCurrentBeat(0);
      return;
    }

    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }

    nextNoteTimeRef.current = audioCtxRef.current.currentTime + 0.05;
    currentBeatRef.current = 0;

    const schedule = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
        const isAccent = currentBeatRef.current === 0;
        playClick(nextNoteTimeRef.current, isAccent);
        setCurrentBeat(currentBeatRef.current);

        const secondsPerBeat = 60.0 / bpm;
        nextNoteTimeRef.current += secondsPerBeat;
        currentBeatRef.current = (currentBeatRef.current + 1) % beatsPerBar;
      }
    };

    timerWorkerRef.current = setInterval(schedule, 25);
    return () => {
      if (timerWorkerRef.current) clearInterval(timerWorkerRef.current);
    };
  }, [isPlayingMetronome, bpm, beatsPerBar]);

  // Tap Tempo Handler
  const handleTapTempo = () => {
    const now = Date.now();
    if (lastTapRef.current) {
      const diff = now - lastTapRef.current;
      if (diff > 200 && diff < 2500) {
        tapIntervalsRef.current.push(diff);
        if (tapIntervalsRef.current.length > 4) {
          tapIntervalsRef.current.shift();
        }
        const avg = tapIntervalsRef.current.reduce((a, b) => a + b, 0) / tapIntervalsRef.current.length;
        const calculatedBpm = Math.round(60000 / avg);
        setBpm(Math.max(40, Math.min(240, calculatedBpm)));
      } else {
        tapIntervalsRef.current = [];
      }
    }
    lastTapRef.current = now;
  };

  const broadcastBpm = () => {
    if (sendMetronome) {
      const payload = JSON.stringify({ type: "sync_bpm", bpm });
      sendMetronome(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  return (
    <>
      {/* Floating Animated In-Call Reactions */}
      <div
        className="pc-floating-reactions-container"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        {reactions.map((r) => (
          <div
            key={r.id}
            className="pc-floating-reaction"
            style={{
              position: "absolute",
              bottom: "80px",
              left: `${r.leftPercent}%`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              animation: "floatUp 3.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
            }}
          >
            <span style={{ fontSize: "38px", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.4))" }}>
              {r.emoji}
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#fff",
                background: "rgba(0,0,0,0.75)",
                padding: "2px 8px",
                borderRadius: "10px",
                whiteSpace: "nowrap",
                marginTop: "4px",
              }}
            >
              {r.sender}: {r.label}
            </span>
          </div>
        ))}
      </div>

      {/* Top Header Tools: Music Mode, Piano, Metronome, Tuner, Drone, Whiteboard */}
      <div
        className="pc-classroom-tools-bar"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {/* Music Mode HQ Audio Toggle */}
        <button
          type="button"
          onClick={() => void toggleMusicMode()}
          title={
            musicMode
              ? "Music Mode Active: High-Fidelity uncompressed audio for instruments and singing"
              : "Voice Mode: Noise suppression active"
          }
          style={{
            background: musicMode ? "rgba(46, 213, 115, 0.18)" : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${musicMode ? "#2ed573" : "rgba(255, 255, 255, 0.2)"}`,
            color: musicMode ? "#2ed573" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Music size={13} />
          <span>{musicMode ? "Music Mode" : "Voice Mode"}</span>
        </button>

        {/* Visual Piano & MIDI Keyboard */}
        <button
          type="button"
          onClick={() => {
            setPianoOpen((prev) => !prev);
            setTunerOpen(false);
            setDroneOpen(false);
            setWhiteboardOpen(false);
          }}
          title="Interactive Visual Piano & Web MIDI visualizer"
          style={{
            background: pianoOpen ? "rgba(46, 213, 115, 0.25)" : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${pianoOpen ? "#2ed573" : "rgba(255, 255, 255, 0.2)"}`,
            color: pianoOpen ? "#2ed573" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Music2 size={13} />
          <span>Piano</span>
        </button>

        {/* Metronome */}
        <button
          type="button"
          onClick={() => {
            setMetronomeOpen((prev) => !prev);
            setTunerOpen(false);
            setDroneOpen(false);
          }}
          title="Academy Metronome & Tempo Tool"
          style={{
            background: metronomeOpen || isPlayingMetronome ? "rgba(255, 177, 66, 0.22)" : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${metronomeOpen || isPlayingMetronome ? "#ffb142" : "rgba(255, 255, 255, 0.2)"}`,
            color: metronomeOpen || isPlayingMetronome ? "#ffb142" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Sliders size={13} />
          <span>Metronome {isPlayingMetronome ? `(${bpm})` : ""}</span>
        </button>

        {/* Chromatic Tuner */}
        <button
          type="button"
          onClick={() => {
            setTunerOpen((prev) => !prev);
            setMetronomeOpen(false);
            setDroneOpen(false);
          }}
          title="Real-Time Chromatic Pitch Tuner"
          style={{
            background: tunerOpen ? "rgba(46, 213, 115, 0.25)" : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${tunerOpen ? "#2ed573" : "rgba(255, 255, 255, 0.2)"}`,
            color: tunerOpen ? "#2ed573" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Radio size={13} />
          <span>Tuner</span>
        </button>

        {/* Pitch Drone */}
        <button
          type="button"
          onClick={() => {
            setDroneOpen((prev) => !prev);
            setMetronomeOpen(false);
            setTunerOpen(false);
          }}
          title="Pitch Drone & Reference Tuning Tone"
          style={{
            background: droneOpen ? "rgba(165, 94, 234, 0.25)" : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${droneOpen ? "#a55eea" : "rgba(255, 255, 255, 0.2)"}`,
            color: droneOpen ? "#a55eea" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Disc3 size={13} />
          <span>Drone</span>
        </button>

        {/* Music Staff Whiteboard */}
        <button
          type="button"
          onClick={() => {
            setWhiteboardOpen((prev) => !prev);
            setPianoOpen(false);
          }}
          title="Collaborative Music Staff & Whiteboard Canvas"
          style={{
            background: whiteboardOpen ? "rgba(46, 213, 115, 0.25)" : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${whiteboardOpen ? "#2ed573" : "rgba(255, 255, 255, 0.2)"}`,
            color: whiteboardOpen ? "#2ed573" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Edit3 size={13} />
          <span>Whiteboard</span>
        </button>

        {/* Quick Reactions Bar */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(255, 255, 255, 0.08)",
            padding: "2px 5px",
            borderRadius: 6,
            border: "1px solid rgba(255, 255, 255, 0.12)",
          }}
        >
          <button
            type="button"
            onClick={() => triggerReaction("🎵", "Bravo!")}
            title="Send Bravo!"
            style={{ background: "transparent", border: "none", fontSize: 13, cursor: "pointer", padding: "1px" }}
          >
            🎵
          </button>
          <button
            type="button"
            onClick={() => triggerReaction("👏", "Applause!")}
            title="Send Applause"
            style={{ background: "transparent", border: "none", fontSize: 13, cursor: "pointer", padding: "1px" }}
          >
            👏
          </button>
          <button
            type="button"
            onClick={() => triggerReaction("🎹", "Piano!")}
            title="Send Piano"
            style={{ background: "transparent", border: "none", fontSize: 13, cursor: "pointer", padding: "1px" }}
          >
            🎹
          </button>
          <button
            type="button"
            onClick={() => triggerReaction("🌟", "Superb!")}
            title="Send Star"
            style={{ background: "transparent", border: "none", fontSize: 13, cursor: "pointer", padding: "1px" }}
          >
            🌟
          </button>
        </div>

        {/* Raise Hand Button */}
        <button
          type="button"
          onClick={toggleHandRaise}
          title={handRaised ? "Lower Hand" : "Raise Hand to speak"}
          style={{
            background: handRaised ? "#ff4757" : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${handRaised ? "#ff4757" : "rgba(255, 255, 255, 0.2)"}`,
            color: "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Hand size={13} />
          <span>{handRaised ? "Lower Hand" : "Raise Hand"}</span>
        </button>
      </div>

      {/* Floating Metronome Drawer / Modal */}
      {metronomeOpen && (
        <div
          className="pc-metronome-panel"
          style={{
            position: "absolute",
            top: 55,
            right: 20,
            background: "#1e2922",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: 12,
            padding: "16px 20px",
            boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
            zIndex: 999,
            width: 270,
            color: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, color: "#ffb142" }}>
              <Sliders size={15} />
              Academy Metronome
            </div>
            <button
              type="button"
              onClick={() => setMetronomeOpen(false)}
              style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", padding: 2 }}
            >
              <X size={15} />
            </button>
          </div>

          <div style={{ textAlign: "center", margin: "14px 0" }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{bpm}</div>
            <div style={{ fontSize: 11, color: "#ffb142", fontWeight: 600, textTransform: "uppercase", marginTop: 4 }}>
              {bpm < 60 ? "Largo" : bpm < 76 ? "Adagio" : bpm < 108 ? "Andante" : bpm < 120 ? "Moderato" : bpm < 168 ? "Allegro" : "Presto"} BPM
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
              {Array.from({ length: beatsPerBar }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background:
                      isPlayingMetronome && currentBeat === i
                        ? i === 0
                          ? "#ff4757"
                          : "#2ed573"
                        : "rgba(255,255,255,0.2)",
                    boxShadow:
                      isPlayingMetronome && currentBeat === i
                        ? `0 0 10px ${i === 0 ? "#ff4757" : "#2ed573"}`
                        : "none",
                    transition: "background 0.05s ease",
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ margin: "12px 0" }}>
            <input
              type="range"
              min={40}
              max={220}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#ffb142", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setIsPlayingMetronome((prev) => !prev)}
              style={{
                flex: 1,
                background: isPlayingMetronome ? "#ff4757" : "#2ed573",
                color: "#fff",
                border: "none",
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
              {isPlayingMetronome ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {isPlayingMetronome ? "Stop Metronome" : "Start Metronome"}
            </button>
            <button
              type="button"
              onClick={handleTapTempo}
              title="Click repeatedly to set tempo"
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Tap
            </button>
          </div>

          <button
            type="button"
            onClick={broadcastBpm}
            style={{
              width: "100%",
              marginTop: 10,
              background: "transparent",
              border: "1px dashed rgba(255,255,255,0.3)",
              color: "#a4b0be",
              borderRadius: 6,
              padding: "5px",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Broadcast {bpm} BPM to everyone in room
          </button>
        </div>
      )}

      {/* Piano Keyboard Component */}
      {pianoOpen && <ClassroomPiano onClose={() => setPianoOpen(false)} />}

      {/* Chromatic Tuner Component */}
      {tunerOpen && <ClassroomTuner onClose={() => setTunerOpen(false)} />}

      {/* Pitch Drone Component */}
      {droneOpen && <ClassroomDrone onClose={() => setDroneOpen(false)} />}

      {/* Musical Staff Whiteboard Component */}
      {whiteboardOpen && <ClassroomWhiteboard onClose={() => setWhiteboardOpen(false)} />}
    </>
  );
}
