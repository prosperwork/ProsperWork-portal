"use client";

import { useEffect, useRef, useState } from "react";
import { useChat, useDataChannel, useRoomContext } from "@livekit/components-react";
import {
  Bell,
  Disc3,
  Edit3,
  Hand,
  Lock,
  MessageSquare,
  Mic,
  Music,
  Music2,
  Radio,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Unlock,
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

interface ChatToast {
  id: string;
  sender: string;
  message: string;
}

interface ClassroomMusicToolsProps {
  lessonId: string;
  userRole?: string;
  canGrantAccess?: boolean;
  isRestrictedRole?: boolean;
  initialStudentFeaturesEnabled?: boolean;
}

export default function ClassroomMusicTools({
  lessonId,
  userRole,
  canGrantAccess = false,
  isRestrictedRole = false,
  initialStudentFeaturesEnabled = false,
}: ClassroomMusicToolsProps) {
  const room = useRoomContext();
  const { chatMessages } = useChat();

  const [musicMode, setMusicMode] = useState(true);

  // Student Access Permission State (controlled by SuperAdmin & Assigned Admin Usher)
  const [studentFeaturesEnabled, setStudentFeaturesEnabled] = useState(initialStudentFeaturesEnabled);
  const [togglingAccess, setTogglingAccess] = useState(false);

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
  const [metronomeShared, setMetronomeShared] = useState(true);

  // Reactions & Hand Raise
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [handRaised, setHandRaised] = useState(false);

  // Chat Notifications
  const [chatToast, setChatToast] = useState<ChatToast | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());

  // Audio Context Ref for synthetic woodblock metronome
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const currentBeatRef = useRef<number>(0);
  const timerWorkerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTapRef = useRef<number>(0);
  const tapIntervalsRef = useRef<number[]>([]);

  // Is this user currently blocked from using student tools?
  // Only students and parents are restricted when studentFeaturesEnabled is false.
  // Teachers, Admins, SuperAdmins are never restricted from using tools.
  const isFeatureLockedForUser = isRestrictedRole && !studentFeaturesEnabled;

  // Master Classroom Broadcast Channel
  const { send: sendBroadcast } = useDataChannel("classroom_broadcast", (msg) => {
    try {
      const decoded = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(decoded);

      if (data.type === "student_access_changed") {
        const next = Boolean(data.enabled);
        setStudentFeaturesEnabled(next);
        if (isRestrictedRole) {
          if (next) {
            addFloatingReaction("Supervisor", "🎉", "Music tools & chat unlocked for you!");
          } else {
            addFloatingReaction("Supervisor", "🔒", "Tools restricted by lesson supervisor");
            setPianoOpen(false);
            setWhiteboardOpen(false);
            setTunerOpen(false);
            setDroneOpen(false);
            setMetronomeOpen(false);
          }
        }
      } else if (data.type === "whiteboard_toggle") {
        setWhiteboardOpen(Boolean(data.open));
      } else if (data.type === "piano_toggle") {
        setPianoOpen(Boolean(data.open));
      } else if (data.type === "metronome_sync") {
        if (typeof data.bpm === "number") setBpm(data.bpm);
        if (typeof data.isPlaying === "boolean") setIsPlayingMetronome(data.isPlaying);
      } else if (data.type === "reaction") {
        addFloatingReaction(data.sender, data.emoji, data.label);
      } else if (data.type === "hand_raise") {
        addFloatingReaction(data.sender, "✋", "Hand Raised!");
      }
    } catch {
      // ignore
    }
  });

  // Toggle student feature access (SuperAdmin or Assigned Admin Usher only)
  const toggleStudentAccess = async () => {
    if (!canGrantAccess || togglingAccess) return;
    const next = !studentFeaturesEnabled;
    setTogglingAccess(true);
    setStudentFeaturesEnabled(next);

    try {
      // 1. Update database
      await fetch("/api/classroom", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          studentFeaturesEnabled: next,
        }),
      });

      // 2. Broadcast via LiveKit Data Channel
      if (sendBroadcast) {
        const payload = JSON.stringify({
          type: "student_access_changed",
          enabled: next,
        });
        sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
      }
    } catch (err) {
      console.warn("Could not persist student access setting:", err);
    } finally {
      setTogglingAccess(false);
    }
  };

  // Check if a tool can be opened
  const requireAccess = (actionName: string): boolean => {
    if (isFeatureLockedForUser) {
      addFloatingReaction("Supervisor", "🔒", `${actionName} is controlled by your lesson supervisor.`);
      return false;
    }
    return true;
  };

  // Monitor chat messages and show in-call toast so no one misses messages
  useEffect(() => {
    if (!chatMessages || chatMessages.length === 0) return;
    const latest = chatMessages[chatMessages.length - 1];
    if (latest.timestamp > lastMessageTimeRef.current) {
      lastMessageTimeRef.current = latest.timestamp;
      // Only show toast if sent by someone else
      if (latest.from?.identity !== room?.localParticipant?.identity) {
        const sender = latest.from?.name || latest.from?.identity || "Participant";
        setChatToast({
          id: String(latest.timestamp),
          sender,
          message: latest.message,
        });
        setTimeout(() => {
          setChatToast((prev) => (prev?.id === String(latest.timestamp) ? null : prev));
        }, 5500);
      }
    }
  }, [chatMessages, room?.localParticipant?.identity]);

  const addFloatingReaction = (sender: string, emoji: string, label: string) => {
    const id = Math.random().toString(36).slice(2, 9);
    const leftPercent = 20 + Math.random() * 60;
    setReactions((prev) => [...prev, { id, sender, emoji, label, leftPercent }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 3500);
  };

  const triggerReaction = (emoji: string, label: string) => {
    if (!requireAccess("Reactions")) return;
    const sender = room?.localParticipant?.name || "Participant";
    addFloatingReaction("You", emoji, label);
    if (sendBroadcast) {
      const payload = JSON.stringify({ type: "reaction", sender, emoji, label });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  const toggleHandRaise = () => {
    const next = !handRaised;
    setHandRaised(next);
    const sender = room?.localParticipant?.name || "Participant";
    if (next) {
      addFloatingReaction("You", "✋", "Hand Raised");
      if (sendBroadcast) {
        const payload = JSON.stringify({ type: "hand_raise", sender });
        sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
      }
    }
  };

  // Toggle Whiteboard with synchronized open/close for everyone
  const toggleWhiteboard = () => {
    if (!requireAccess("Whiteboard")) return;
    const next = !whiteboardOpen;
    setWhiteboardOpen(next);
    setPianoOpen(false);
    if (sendBroadcast) {
      const payload = JSON.stringify({ type: "whiteboard_toggle", open: next });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  // Toggle Piano with synchronized open for everyone
  const togglePiano = () => {
    if (!requireAccess("Piano")) return;
    const next = !pianoOpen;
    setPianoOpen(next);
    setWhiteboardOpen(false);
    setTunerOpen(false);
    setDroneOpen(false);
    if (sendBroadcast) {
      const payload = JSON.stringify({ type: "piano_toggle", open: next });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
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
    if (!requireAccess("Metronome")) return;
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

  const toggleMetronomePlay = () => {
    if (!requireAccess("Metronome")) return;
    const next = !isPlayingMetronome;
    setIsPlayingMetronome(next);
    if (metronomeShared && sendBroadcast) {
      const payload = JSON.stringify({ type: "metronome_sync", isPlaying: next, bpm });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  const handleBpmChange = (newBpm: number) => {
    if (!requireAccess("Metronome")) return;
    setBpm(newBpm);
    if (metronomeShared && isPlayingMetronome && sendBroadcast) {
      const payload = JSON.stringify({ type: "metronome_sync", isPlaying: true, bpm: newBpm });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  return (
    <>
      {/* Floating In-Call Chat Notification Toast */}
      {chatToast && (
        <div
          className="pc-chat-toast"
          style={{
            position: "fixed",
            bottom: "85px",
            right: "24px",
            background: "#18221c",
            border: "1px solid rgba(46, 213, 115, 0.4)",
            borderRadius: 10,
            padding: "10px 14px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
            zIndex: 9999,
            maxWidth: 320,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            animation: "fadeIn 0.25s ease",
            color: "#fff",
          }}
        >
          <MessageSquare size={16} color="#2ed573" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#2ed573" }}>{chatToast.sender}</div>
            <div style={{ fontSize: 12, color: "#e1e8e4", overflow: "hidden", textOverflow: "ellipsis", wordBreak: "break-word" }}>
              {chatToast.message}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setChatToast(null)}
            style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", padding: 0 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

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

      {/* Top Header Tools: Supervisor Access Control, Music Mode, Piano, Metronome, Tuner, Drone, Whiteboard */}
      <div
        className="pc-classroom-tools-bar"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {/* ASSIGNED ADMIN / SUPER ADMIN STUDENT ACCESS CONTROL SWITCH */}
        {canGrantAccess && (
          <button
            type="button"
            onClick={() => void toggleStudentAccess()}
            disabled={togglingAccess}
            title={
              studentFeaturesEnabled
                ? "Student access is UNLOCKED. Click to lock student tools and chat."
                : "Student access is LOCKED. Click to give student access to music tools and chat."
            }
            style={{
              background: studentFeaturesEnabled ? "rgba(46, 213, 115, 0.22)" : "rgba(255, 71, 87, 0.22)",
              border: `1px solid ${studentFeaturesEnabled ? "#2ed573" : "#ff4757"}`,
              color: studentFeaturesEnabled ? "#2ed573" : "#ff6b81",
              borderRadius: 6,
              padding: "4px 9px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {studentFeaturesEnabled ? <Unlock size={13} /> : <Lock size={13} />}
            <span>Student Tools: {studentFeaturesEnabled ? "Unlocked (Active)" : "Locked (Admin Only)"}</span>
          </button>
        )}

        {/* RESTRICTED STUDENT / PARENT STATUS BADGE */}
        {isRestrictedRole && (
          <span
            style={{
              background: studentFeaturesEnabled ? "rgba(46, 213, 115, 0.15)" : "rgba(255, 177, 66, 0.15)",
              border: `1px solid ${studentFeaturesEnabled ? "rgba(46, 213, 115, 0.3)" : "rgba(255, 177, 66, 0.3)"}`,
              color: studentFeaturesEnabled ? "#2ed573" : "#ffb142",
              borderRadius: 6,
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {studentFeaturesEnabled ? <ShieldCheck size={12} /> : <Lock size={12} />}
            <span>{studentFeaturesEnabled ? "Tools Unlocked by Admin" : "Tools Managed by Supervisor"}</span>
          </span>
        )}

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
          onClick={togglePiano}
          title={
            isFeatureLockedForUser
              ? "Piano is controlled by your lesson supervisor."
              : "Interactive Visual Piano: Synchronizes notes & sound with everyone in room"
          }
          style={{
            background: isFeatureLockedForUser
              ? "rgba(255, 255, 255, 0.05)"
              : pianoOpen
              ? "rgba(46, 213, 115, 0.25)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              isFeatureLockedForUser
                ? "rgba(255, 255, 255, 0.12)"
                : pianoOpen
                ? "#2ed573"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color: isFeatureLockedForUser ? "#777" : pianoOpen ? "#2ed573" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: isFeatureLockedForUser ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {isFeatureLockedForUser ? <Lock size={12} /> : <Music2 size={13} />}
          <span>Piano {pianoOpen ? "● Live" : ""}</span>
        </button>

        {/* Metronome */}
        <button
          type="button"
          onClick={() => {
            if (!requireAccess("Metronome")) return;
            setMetronomeOpen((prev) => !prev);
            setTunerOpen(false);
            setDroneOpen(false);
          }}
          title={
            isFeatureLockedForUser
              ? "Metronome is controlled by your lesson supervisor."
              : "Academy Metronome: Syncs tempo with everyone in room"
          }
          style={{
            background: isFeatureLockedForUser
              ? "rgba(255, 255, 255, 0.05)"
              : metronomeOpen || isPlayingMetronome
              ? "rgba(255, 177, 66, 0.22)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              isFeatureLockedForUser
                ? "rgba(255, 255, 255, 0.12)"
                : metronomeOpen || isPlayingMetronome
                ? "#ffb142"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color: isFeatureLockedForUser ? "#777" : metronomeOpen || isPlayingMetronome ? "#ffb142" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: isFeatureLockedForUser ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {isFeatureLockedForUser ? <Lock size={12} /> : <Sliders size={13} />}
          <span>Metronome {isPlayingMetronome ? `(${bpm})` : ""}</span>
        </button>

        {/* Chromatic Tuner */}
        <button
          type="button"
          onClick={() => {
            if (!requireAccess("Tuner")) return;
            setTunerOpen((prev) => !prev);
            setMetronomeOpen(false);
            setDroneOpen(false);
          }}
          title={
            isFeatureLockedForUser
              ? "Tuner is controlled by your lesson supervisor."
              : "Real-Time Chromatic Pitch Tuner"
          }
          style={{
            background: isFeatureLockedForUser
              ? "rgba(255, 255, 255, 0.05)"
              : tunerOpen
              ? "rgba(46, 213, 115, 0.25)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              isFeatureLockedForUser
                ? "rgba(255, 255, 255, 0.12)"
                : tunerOpen
                ? "#2ed573"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color: isFeatureLockedForUser ? "#777" : tunerOpen ? "#2ed573" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: isFeatureLockedForUser ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {isFeatureLockedForUser ? <Lock size={12} /> : <Radio size={13} />}
          <span>Tuner</span>
        </button>

        {/* Pitch Drone */}
        <button
          type="button"
          onClick={() => {
            if (!requireAccess("Pitch Drone")) return;
            setDroneOpen((prev) => !prev);
            setMetronomeOpen(false);
            setTunerOpen(false);
          }}
          title={
            isFeatureLockedForUser
              ? "Pitch Drone is controlled by your lesson supervisor."
              : "Pitch Drone & Reference Tuning Tone"
          }
          style={{
            background: isFeatureLockedForUser
              ? "rgba(255, 255, 255, 0.05)"
              : droneOpen
              ? "rgba(165, 94, 234, 0.25)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              isFeatureLockedForUser
                ? "rgba(255, 255, 255, 0.12)"
                : droneOpen
                ? "#a55eea"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color: isFeatureLockedForUser ? "#777" : droneOpen ? "#a55eea" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: isFeatureLockedForUser ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {isFeatureLockedForUser ? <Lock size={12} /> : <Disc3 size={13} />}
          <span>Drone</span>
        </button>

        {/* Collaborative Whiteboard */}
        <button
          type="button"
          onClick={toggleWhiteboard}
          title={
            isFeatureLockedForUser
              ? "Whiteboard is controlled by your lesson supervisor."
              : "Collaborative Music Staff Whiteboard: Opens on everyone's screen in real time"
          }
          style={{
            background: isFeatureLockedForUser
              ? "rgba(255, 255, 255, 0.05)"
              : whiteboardOpen
              ? "rgba(46, 213, 115, 0.25)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              isFeatureLockedForUser
                ? "rgba(255, 255, 255, 0.12)"
                : whiteboardOpen
                ? "#2ed573"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color: isFeatureLockedForUser ? "#777" : whiteboardOpen ? "#2ed573" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: isFeatureLockedForUser ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {isFeatureLockedForUser ? <Lock size={12} /> : <Edit3 size={13} />}
          <span>Whiteboard {whiteboardOpen ? "● Shared" : ""}</span>
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
            width: 280,
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
              disabled={isFeatureLockedForUser}
              onChange={(e) => handleBpmChange(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#ffb142", cursor: isFeatureLockedForUser ? "not-allowed" : "pointer" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={toggleMetronomePlay}
              disabled={isFeatureLockedForUser}
              style={{
                flex: 1,
                background: isPlayingMetronome ? "#ff4757" : "#2ed573",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: isFeatureLockedForUser ? "not-allowed" : "pointer",
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
              disabled={isFeatureLockedForUser}
              title="Click repeatedly to set tempo"
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: isFeatureLockedForUser ? "not-allowed" : "pointer",
              }}
            >
              Tap
            </button>
          </div>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontSize: 11, color: "#aaa", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={metronomeShared}
                onChange={(e) => setMetronomeShared(e.target.checked)}
                style={{ accentColor: "#ffb142" }}
              />
              Sync click sound to student
            </label>
            <span style={{ fontSize: 10, color: metronomeShared ? "#ffb142" : "#666" }}>
              {metronomeShared ? "● Synchronized" : "Local only"}
            </span>
          </div>
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
