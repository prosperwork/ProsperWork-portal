"use client";

import { useEffect, useRef, useState } from "react";
import {
  useChat,
  useDataChannel,
  useRoomContext,
} from "@livekit/components-react";
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
import ClassroomStaffChat, {
  type StaffChatMessage,
} from "./ClassroomStaffChat";

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

import type { StudentPermissions } from "@/app/api/classroom/route";

interface ClassroomMusicToolsProps {
  lessonId: string;
  userRole?: string;
  canGrantAccess?: boolean;
  isRestrictedRole?: boolean;
  initialStudentFeaturesEnabled?: boolean;
  initialStudentPermissions?: StudentPermissions;
}

export default function ClassroomMusicTools({
  lessonId,
  userRole,
  canGrantAccess = false,
  isRestrictedRole = false,
  initialStudentFeaturesEnabled = false,
  initialStudentPermissions,
}: ClassroomMusicToolsProps) {
  const room = useRoomContext();
  const { chatMessages, send: sendPublicMessage } = useChat();

  const [musicMode, setMusicMode] = useState(true);

  // Per-feature student permission state (strictly defaults to locked/false for students)
  const defaultStudentPermissions: StudentPermissions = {
    piano: false,
    whiteboard: false,
    metronome: false,
    tuner: false,
    drone: false,
    chat: false,
    reactions: false,
  };

  const [studentPermissions, setStudentPermissions] =
    useState<StudentPermissions>(() => {
      if (initialStudentPermissions) {
        return {
          piano: Boolean(initialStudentPermissions.piano),
          whiteboard: Boolean(initialStudentPermissions.whiteboard),
          metronome: Boolean(initialStudentPermissions.metronome),
          tuner: Boolean(initialStudentPermissions.tuner),
          drone: Boolean(initialStudentPermissions.drone),
          chat: Boolean(initialStudentPermissions.chat),
          reactions: Boolean(initialStudentPermissions.reactions),
        };
      }
      return defaultStudentPermissions;
    });

  const [permissionsMenuOpen, setPermissionsMenuOpen] = useState(false);
  const [updatingFeature, setUpdatingFeature] = useState<string | null>(null);

  // Tool Modals / Panels
  const [metronomeOpen, setMetronomeOpen] = useState(false);
  const [pianoOpen, setPianoOpen] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [droneOpen, setDroneOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);

  // Staff Private Chat State (Admin & Teacher backchannel)
  const [staffChatOpen, setStaffChatOpen] = useState(false);
  const [forceOpenStaffTab, setForceOpenStaffTab] = useState(false);
  const [staffMessages, setStaffMessages] = useState<StaffChatMessage[]>([]);
  const [unreadStaffCount, setUnreadStaffCount] = useState(0);
  const [staffToast, setStaffToast] = useState<{
    id: string;
    sender: string;
    role: string;
    message: string;
  } | null>(null);

  const openStaffChat = () => {
    setForceOpenStaffTab(true);
    setUnreadStaffCount(0);
    setStaffToast(null);
    const chatToggle = document.querySelector(
      ".lk-chat-toggle, button[aria-label*='chat' i]"
    ) as HTMLButtonElement | null;
    const isChatOpen = chatToggle?.getAttribute("aria-pressed") === "true";
    if (chatToggle && !isChatOpen) {
      chatToggle.click();
    }
  };

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

  // Check if a specific feature is locked for this user
  const isFeatureLocked = (feature: keyof StudentPermissions): boolean => {
    // If user is marked as restricted or student/parent role, strictly verify permission
    if (isRestrictedRole || userRole === "student" || userRole === "parent") {
      return !studentPermissions[feature];
    }
    // Teachers, Admins, SuperAdmins are not restricted
    return false;
  };

  // Check and prompt if action is allowed
  const requireAccess = (
    feature: keyof StudentPermissions,
    label: string
  ): boolean => {
    if (isFeatureLocked(feature)) {
      addFloatingReaction(
        "Supervisor",
        "🔒",
        `${label} is locked by your lesson supervisor.`
      );
      return false;
    }
    return true;
  };

  // Master Classroom Broadcast Channel
  const { send: sendBroadcast } = useDataChannel(
    "classroom_broadcast",
    (msg) => {
      try {
        const decoded = new TextDecoder().decode(msg.payload);
        const data = JSON.parse(decoded);

        if (data.type === "student_permissions_changed" && data.permissions) {
          const next = data.permissions as StudentPermissions;
          setStudentPermissions(next);
          if (isRestrictedRole) {
            if (data.changedKey) {
              const toolNames: Record<keyof StudentPermissions, string> = {
                piano: "Piano & MIDI",
                whiteboard: "Whiteboard & Typing",
                metronome: "Academy Metronome",
                tuner: "Chromatic Tuner",
                drone: "Pitch Drone",
                chat: "Live Chat",
                reactions: "Reactions & Hand Raise",
              };
              const name =
                toolNames[data.changedKey as keyof StudentPermissions] ||
                "Feature";
              if (data.enabled) {
                addFloatingReaction(
                  "Supervisor",
                  "🎉",
                  `${name} unlocked for you!`
                );
              } else {
                addFloatingReaction(
                  "Supervisor",
                  "🔒",
                  `${name} locked by supervisor`
                );
              }
            } else {
              const anyEnabled = Object.values(next).some(Boolean);
              if (anyEnabled) {
                addFloatingReaction(
                  "Supervisor",
                  "🎉",
                  "Permissions updated by supervisor!"
                );
              } else {
                addFloatingReaction(
                  "Supervisor",
                  "🔒",
                  "Student tools restricted by supervisor"
                );
              }
            }

            // Modals remain open in View-Only mode so student continues to see what the teacher is presenting
          }
        } else if (data.type === "student_access_changed") {
          // Backward compatibility for legacy all-or-nothing broadcast
          const enabled = Boolean(data.enabled);
          const next: StudentPermissions = {
            piano: enabled,
            whiteboard: enabled,
            metronome: enabled,
            tuner: enabled,
            drone: enabled,
            chat: enabled,
            reactions: enabled,
          };
          setStudentPermissions(next);
        } else if (data.type === "whiteboard_toggle") {
          setWhiteboardOpen(Boolean(data.open));
        } else if (data.type === "piano_toggle") {
          setPianoOpen(Boolean(data.open));
        } else if (data.type === "metronome_sync") {
          if (typeof data.bpm === "number") setBpm(data.bpm);
          if (typeof data.isPlaying === "boolean")
            setIsPlayingMetronome(data.isPlaying);
        } else if (data.type === "reaction") {
          addFloatingReaction(data.sender, data.emoji, data.label);
        } else if (data.type === "hand_raise") {
          addFloatingReaction(data.sender, "✋", "Hand Raised!");
        }
      } catch {
        // ignore
      }
    }
  );

  // Staff Private Backchannel Data Channel (Teacher & Admin Only)
  const { send: sendStaffBroadcast } = useDataChannel(
    "classroom_staff_chat",
    (msg) => {
      // Security guard: If user is restricted (student/parent), drop immediately!
      if (isRestrictedRole || userRole === "student" || userRole === "parent")
        return;
      try {
        const decoded = new TextDecoder().decode(msg.payload);
        const data = JSON.parse(decoded) as StaffChatMessage;
        if (!data || !data.id || !data.message) return;

        setStaffMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev;
          return [...prev, data];
        });

        // If message is from someone else and staff chat panel is closed, show private toast
        if (data.senderId !== room?.localParticipant?.identity) {
          if (!staffChatOpen) {
            setUnreadStaffCount((prev) => prev + 1);
            setStaffToast({
              id: data.id,
              sender: data.senderName,
              role: data.senderRole,
              message: data.message,
            });
            setTimeout(() => {
              setStaffToast((prev) => (prev?.id === data.id ? null : prev));
            }, 6500);
          }
        }
      } catch {
        // ignore malformed message
      }
    }
  );

  // Send Staff Message handler (targeted SFU delivery to staff participants only)
  const handleSendStaffMessage = async (text: string) => {
    if (
      !room ||
      !text.trim() ||
      isRestrictedRole ||
      userRole === "student" ||
      userRole === "parent"
    )
      return;

    const chatItem: StaffChatMessage = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      senderId: room.localParticipant.identity,
      senderName: room.localParticipant.name || "Staff",
      senderRole: userRole || "Staff",
      message: text.trim(),
      timestamp: Date.now(),
    };

    setStaffMessages((prev) => [...prev, chatItem]);

    const staffRoles = [
      "super_admin",
      "admin",
      "head_admin",
      "general_manager",
      "teacher",
      "qc",
    ];
    const remoteStaffIds: string[] = [];
    for (const p of room.remoteParticipants.values()) {
      let role = p.attributes?.role || "";
      let isStaff = p.attributes?.isStaff === "true";
      if (!isStaff && p.metadata) {
        try {
          const parsed = JSON.parse(p.metadata);
          if (parsed.isStaff) isStaff = true;
          if (parsed.role) role = parsed.role;
        } catch {
          // ignore parsing error
        }
      }
      if (isStaff || staffRoles.includes(role.toLowerCase())) {
        remoteStaffIds.push(p.identity);
      }
    }

    const payload = new TextEncoder().encode(JSON.stringify(chatItem));
    if (sendStaffBroadcast) {
      if (remoteStaffIds.length > 0) {
        sendStaffBroadcast(payload, {
          reliable: true,
          destinationIdentities: remoteStaffIds,
        });
      } else {
        sendStaffBroadcast(payload, { reliable: true });
      }
    }
  };

  // Broadcast current permissions whenever room connects or a new participant arrives
  useEffect(() => {
    if (!canGrantAccess || !room) return;
    const broadcastCurrent = () => {
      if (sendBroadcast) {
        const payload = JSON.stringify({
          type: "student_permissions_changed",
          permissions: studentPermissions,
        });
        sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
      }
    };
    broadcastCurrent();
    room.on("participantConnected", broadcastCurrent);
    return () => {
      room.off("participantConnected", broadcastCurrent);
    };
  }, [canGrantAccess, room, studentPermissions, sendBroadcast]);

  // Toggle single permission for student
  const toggleSinglePermission = async (feature: keyof StudentPermissions) => {
    if (!canGrantAccess || updatingFeature) return;
    const nextVal = !studentPermissions[feature];
    const nextPermissions: StudentPermissions = {
      ...studentPermissions,
      [feature]: nextVal,
    };
    setUpdatingFeature(feature);
    setStudentPermissions(nextPermissions);

    try {
      await fetch("/api/classroom", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          feature,
          enabled: nextVal,
        }),
      });

      if (sendBroadcast) {
        const payload = JSON.stringify({
          type: "student_permissions_changed",
          permissions: nextPermissions,
          changedKey: feature,
          enabled: nextVal,
        });
        sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
      }
    } catch (err) {
      console.warn("Could not save permission toggle:", err);
    } finally {
      setUpdatingFeature(null);
    }
  };

  // Toggle all permissions at once
  const toggleAllPermissions = async (enableAll: boolean) => {
    if (!canGrantAccess || updatingFeature) return;
    const nextPermissions: StudentPermissions = {
      piano: enableAll,
      whiteboard: enableAll,
      metronome: enableAll,
      tuner: enableAll,
      drone: enableAll,
      chat: enableAll,
      reactions: enableAll,
    };
    setUpdatingFeature("all");
    setStudentPermissions(nextPermissions);

    try {
      await fetch("/api/classroom", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          studentPermissions: nextPermissions,
          studentFeaturesEnabled: enableAll,
        }),
      });

      if (sendBroadcast) {
        const payload = JSON.stringify({
          type: "student_permissions_changed",
          permissions: nextPermissions,
          enabled: enableAll,
        });
        sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
      }
    } catch (err) {
      console.warn("Could not save all permissions:", err);
    } finally {
      setUpdatingFeature(null);
    }
  };

  // Monitor chat messages and show in-call toast so no one misses messages
  useEffect(() => {
    if (!chatMessages || chatMessages.length === 0) return;
    const latest = chatMessages[chatMessages.length - 1];
    if (latest.timestamp > lastMessageTimeRef.current) {
      lastMessageTimeRef.current = latest.timestamp;
      // If message is marked private staff, suppress toast for restricted students
      if (
        latest.message?.startsWith("[STAFF_PRIVATE]") &&
        (isRestrictedRole || userRole === "student" || userRole === "parent")
      ) {
        return;
      }
      // Only show toast if sent by someone else
      if (latest.from?.identity !== room?.localParticipant?.identity) {
        const sender =
          latest.from?.name || latest.from?.identity || "Participant";
        setChatToast({
          id: String(latest.timestamp),
          sender,
          message: latest.message,
        });
        setTimeout(() => {
          setChatToast((prev) =>
            prev?.id === String(latest.timestamp) ? null : prev
          );
        }, 5500);
      }
    }
  }, [
    chatMessages,
    room?.localParticipant?.identity,
    isRestrictedRole,
    userRole,
  ]);

  const addFloatingReaction = (
    sender: string,
    emoji: string,
    label: string
  ) => {
    const id = Math.random().toString(36).slice(2, 9);
    const leftPercent = 20 + Math.random() * 60;
    setReactions((prev) => [
      ...prev,
      { id, sender, emoji, label, leftPercent },
    ]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 3500);
  };

  const triggerReaction = (emoji: string, label: string) => {
    if (!requireAccess("reactions", "Reactions")) return;
    const sender = room?.localParticipant?.name || "Participant";
    addFloatingReaction("You", emoji, label);
    if (sendBroadcast) {
      const payload = JSON.stringify({
        type: "reaction",
        sender,
        emoji,
        label,
      });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  const toggleHandRaise = () => {
    if (!requireAccess("reactions", "Hand Raise")) return;
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

  // Toggle Whiteboard with synchronized open/close for teacher, view-only toggle for students
  const toggleWhiteboard = () => {
    const next = !whiteboardOpen;
    setWhiteboardOpen(next);
    if (!isRestrictedRole && sendBroadcast) {
      const payload = JSON.stringify({ type: "whiteboard_toggle", open: next });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  // Toggle Piano with synchronized open for teacher, view-only toggle for students
  const togglePiano = () => {
    const next = !pianoOpen;
    setPianoOpen(next);
    if (!isRestrictedRole && sendBroadcast) {
      const payload = JSON.stringify({ type: "piano_toggle", open: next });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  // Toggle Music Mode (HQ Stereo uncompressed vs Voice Noise Cancellation)
  const toggleMusicMode = async () => {
    const next = !musicMode;
    setMusicMode(next);
    try {
      const audioTracks = Array.from(
        room?.localParticipant?.audioTrackPublications.values() || []
      );
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
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
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
    if (!requireAccess("metronome", "Metronome")) return;
    const now = Date.now();
    if (lastTapRef.current) {
      const diff = now - lastTapRef.current;
      if (diff > 200 && diff < 2500) {
        tapIntervalsRef.current.push(diff);
        if (tapIntervalsRef.current.length > 4) {
          tapIntervalsRef.current.shift();
        }
        const avg =
          tapIntervalsRef.current.reduce((a, b) => a + b, 0) /
          tapIntervalsRef.current.length;
        const calculatedBpm = Math.round(60000 / avg);
        setBpm(Math.max(40, Math.min(240, calculatedBpm)));
      } else {
        tapIntervalsRef.current = [];
      }
    }
    lastTapRef.current = now;
  };

  const toggleMetronomePlay = () => {
    if (!requireAccess("metronome", "Metronome")) return;
    const next = !isPlayingMetronome;
    setIsPlayingMetronome(next);
    if (metronomeShared && sendBroadcast) {
      const payload = JSON.stringify({
        type: "metronome_sync",
        isPlaying: next,
        bpm,
      });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  const handleBpmChange = (newBpm: number) => {
    if (!requireAccess("metronome", "Metronome")) return;
    setBpm(newBpm);
    if (metronomeShared && isPlayingMetronome && sendBroadcast) {
      const payload = JSON.stringify({
        type: "metronome_sync",
        isPlaying: true,
        bpm: newBpm,
      });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  const handleMetronomeSharedToggle = (checked: boolean) => {
    setMetronomeShared(checked);
    if (!checked && isPlayingMetronome && sendBroadcast) {
      const payload = JSON.stringify({
        type: "metronome_sync",
        isPlaying: false,
        bpm,
      });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    } else if (checked && isPlayingMetronome && sendBroadcast) {
      const payload = JSON.stringify({
        type: "metronome_sync",
        isPlaying: true,
        bpm,
      });
      sendBroadcast(new TextEncoder().encode(payload), { reliable: true });
    }
  };

  return (
    <>
      {/* Staff Private In-Call Chat Notification Toast (Staff Only) */}
      {staffToast &&
        !isRestrictedRole &&
        userRole !== "student" &&
        userRole !== "parent" && (
          <div
            className="pc-staff-chat-toast"
            onClick={openStaffChat}
            style={{
              position: "fixed",
              bottom: chatToast ? "165px" : "85px",
              right: "24px",
              background: "#1f180d",
              border: "1px solid rgba(255, 177, 66, 0.6)",
              borderRadius: 10,
              padding: "10px 14px",
              boxShadow:
                "0 12px 35px rgba(0,0,0,0.7), 0 0 15px rgba(255, 177, 66, 0.2)",
              zIndex: 9999,
              maxWidth: 340,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              cursor: "pointer",
              animation: "fadeIn 0.25s ease",
              color: "#fff",
            }}
          >
            <ShieldAlert
              size={16}
              color="#ffb142"
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{ fontSize: 11, fontWeight: 700, color: "#ffb142" }}
                >
                  🔒 Staff Backchannel · {staffToast.sender}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    background: "rgba(255, 177, 66, 0.2)",
                    color: "#ffb142",
                    padding: "0 4px",
                    borderRadius: 4,
                    textTransform: "capitalize",
                  }}
                >
                  {staffToast.role}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#e1e8e4",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  wordBreak: "break-word",
                  marginTop: 2,
                }}
              >
                {staffToast.message}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#ffb142",
                  marginTop: 3,
                  fontWeight: 600,
                }}
              >
                Click to reply privately →
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStaffToast(null);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#888",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <X size={13} />
            </button>
          </div>
        )}

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
          <MessageSquare
            size={16}
            color="#2ed573"
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#2ed573" }}>
              {chatToast.sender}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#e1e8e4",
                overflow: "hidden",
                textOverflow: "ellipsis",
                wordBreak: "break-word",
              }}
            >
              {chatToast.message}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setChatToast(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              cursor: "pointer",
              padding: 0,
            }}
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
            <span
              style={{
                fontSize: "38px",
                filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.4))",
              }}
            >
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
        {/* ASSIGNED ADMIN / SUPER ADMIN PER-FEATURE STUDENT ACCESS MANAGER */}
        {canGrantAccess && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setPermissionsMenuOpen((prev) => !prev)}
              title="Configure individual feature permissions for student"
              style={{
                background: Object.values(studentPermissions).some(Boolean)
                  ? "rgba(46, 213, 115, 0.18)"
                  : "rgba(255, 71, 87, 0.18)",
                border: `1px solid ${
                  Object.values(studentPermissions).some(Boolean)
                    ? "#2ed573"
                    : "#ff4757"
                }`,
                color: Object.values(studentPermissions).some(Boolean)
                  ? "#2ed573"
                  : "#ff6b81",
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
              <ShieldCheck size={13} />
              <span>
                Student Access (
                {Object.values(studentPermissions).filter(Boolean).length}/7)
              </span>
              <Sliders size={11} style={{ opacity: 0.8 }} />
            </button>

            {/* Per-Feature Permissions Dropdown Menu */}
            {permissionsMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  width: 300,
                  background: "#152019",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: 12,
                  boxShadow: "0 18px 45px rgba(0,0,0,0.85)",
                  padding: "12px 14px",
                  zIndex: 9999,
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
                    marginBottom: 10,
                    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                    paddingBottom: 8,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 12, color: "#2ed573" }}>
                      Student Feature Access
                    </strong>
                    <div style={{ fontSize: 10, color: "#8fcaab" }}>
                      Toggle permissions per feature
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPermissionsMenuOpen(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#aaa",
                      cursor: "pointer",
                      padding: 2,
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Quick All / None actions */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => void toggleAllPermissions(true)}
                    disabled={updatingFeature !== null}
                    style={{
                      flex: 1,
                      background: "rgba(46, 213, 115, 0.2)",
                      border: "1px solid #2ed573",
                      color: "#2ed573",
                      borderRadius: 4,
                      padding: "4px 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: updatingFeature ? "wait" : "pointer",
                    }}
                  >
                    Enable All (7)
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleAllPermissions(false)}
                    disabled={updatingFeature !== null}
                    style={{
                      flex: 1,
                      background: "rgba(255, 71, 87, 0.2)",
                      border: "1px solid #ff4757",
                      color: "#ff4757",
                      borderRadius: 4,
                      padding: "4px 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: updatingFeature ? "wait" : "pointer",
                    }}
                  >
                    Lock All (0)
                  </button>
                </div>

                {/* Individual Feature Toggles */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 5 }}
                >
                  {[
                    {
                      key: "piano" as const,
                      label: "Piano & MIDI Keyboard",
                      icon: <Music2 size={13} color="#2ed573" />,
                    },
                    {
                      key: "whiteboard" as const,
                      label: "Whiteboard & Typing",
                      icon: <Edit3 size={13} color="#2ed573" />,
                    },
                    {
                      key: "metronome" as const,
                      label: "Academy Metronome",
                      icon: <Sliders size={13} color="#ffb142" />,
                    },
                    {
                      key: "tuner" as const,
                      label: "Chromatic Tuner",
                      icon: <Radio size={13} color="#2ed573" />,
                    },
                    {
                      key: "drone" as const,
                      label: "Pitch Drone (Reference)",
                      icon: <Disc3 size={13} color="#a55eea" />,
                    },
                    {
                      key: "chat" as const,
                      label: "In-Call Text Chat",
                      icon: <MessageSquare size={13} color="#70a1ff" />,
                    },
                    {
                      key: "reactions" as const,
                      label: "Reactions & Hand Raise",
                      icon: <Hand size={13} color="#ffa502" />,
                    },
                  ].map((feat) => {
                    const isAllowed = studentPermissions[feat.key];
                    const isUpdating = updatingFeature === feat.key;
                    return (
                      <div
                        key={feat.key}
                        onClick={() => void toggleSinglePermission(feat.key)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: isAllowed
                            ? "rgba(46, 213, 115, 0.12)"
                            : "rgba(0, 0, 0, 0.25)",
                          border: `1px solid ${
                            isAllowed
                              ? "rgba(46, 213, 115, 0.35)"
                              : "rgba(255, 255, 255, 0.08)"
                          }`,
                          cursor: isUpdating ? "wait" : "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                          }}
                        >
                          {feat.icon}
                          <span style={{ fontSize: 11, fontWeight: 600 }}>
                            {feat.label}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: isAllowed ? "#2ed573" : "#333",
                            color: isAllowed ? "#000" : "#888",
                            letterSpacing: 0.3,
                          }}
                        >
                          {isUpdating ? "…" : isAllowed ? "ALLOWED" : "LOCKED"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* RESTRICTED STUDENT / PARENT STATUS BADGE */}
        {isRestrictedRole && (
          <span
            style={{
              background: Object.values(studentPermissions).some(Boolean)
                ? "rgba(46, 213, 115, 0.15)"
                : "rgba(255, 177, 66, 0.15)",
              border: `1px solid ${
                Object.values(studentPermissions).some(Boolean)
                  ? "rgba(46, 213, 115, 0.3)"
                  : "rgba(255, 177, 66, 0.3)"
              }`,
              color: Object.values(studentPermissions).some(Boolean)
                ? "#2ed573"
                : "#ffb142",
              borderRadius: 6,
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {Object.values(studentPermissions).some(Boolean) ? (
              <ShieldCheck size={12} />
            ) : (
              <Lock size={12} />
            )}
            <span>
              {Object.values(studentPermissions).filter(Boolean).length > 0
                ? `${
                    Object.values(studentPermissions).filter(Boolean).length
                  } Tool${
                    Object.values(studentPermissions).filter(Boolean).length > 1
                      ? "s"
                      : ""
                  } Unlocked by Supervisor`
                : "Tools Managed by Supervisor"}
            </span>
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
            background: musicMode
              ? "rgba(46, 213, 115, 0.18)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              musicMode ? "#2ed573" : "rgba(255, 255, 255, 0.2)"
            }`,
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
            isFeatureLocked("piano")
              ? pianoOpen
                ? "Close Piano (View Only)"
                : "Open Piano (View Only - Supervisor controlled)"
              : "Interactive Visual Piano: Synchronizes notes & sound with everyone in room"
          }
          style={{
            background: pianoOpen
              ? isFeatureLocked("piano")
                ? "rgba(255, 177, 66, 0.2)"
                : "rgba(46, 213, 115, 0.25)"
              : isFeatureLocked("piano")
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              pianoOpen
                ? isFeatureLocked("piano")
                  ? "#ffb142"
                  : "#2ed573"
                : isFeatureLocked("piano")
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color: pianoOpen
              ? isFeatureLocked("piano")
                ? "#ffb142"
                : "#2ed573"
              : isFeatureLocked("piano")
              ? "#aaa"
              : "#fff",
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
          {isFeatureLocked("piano") ? <Lock size={12} /> : <Music2 size={13} />}
          <span>
            Piano{" "}
            {isFeatureLocked("piano") ? "(View)" : pianoOpen ? "● Live" : ""}
          </span>
        </button>

        {/* Metronome */}
        <button
          type="button"
          onClick={() => {
            setMetronomeOpen((prev) => !prev);
          }}
          title={
            isFeatureLocked("metronome")
              ? metronomeOpen
                ? "Close Metronome (View Only)"
                : "Open Metronome (View Only - Supervisor controlled)"
              : "Academy Metronome: Syncs tempo with everyone in room"
          }
          style={{
            background:
              metronomeOpen || isPlayingMetronome
                ? "rgba(255, 177, 66, 0.22)"
                : isFeatureLocked("metronome")
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              metronomeOpen || isPlayingMetronome
                ? "#ffb142"
                : isFeatureLocked("metronome")
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color:
              metronomeOpen || isPlayingMetronome
                ? "#ffb142"
                : isFeatureLocked("metronome")
                ? "#aaa"
                : "#fff",
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
          {isFeatureLocked("metronome") ? (
            <Lock size={12} />
          ) : (
            <Sliders size={13} />
          )}
          <span>
            Metronome{" "}
            {isFeatureLocked("metronome")
              ? "(View)"
              : isPlayingMetronome
              ? `(${bpm})`
              : ""}
          </span>
        </button>

        {/* Chromatic Tuner */}
        <button
          type="button"
          onClick={() => {
            setTunerOpen((prev) => !prev);
          }}
          title={
            isFeatureLocked("tuner")
              ? tunerOpen
                ? "Close Tuner (View Only)"
                : "Open Tuner (View Only - Supervisor pitch live)"
              : "Real-Time Chromatic Pitch Tuner"
          }
          style={{
            background: tunerOpen
              ? isFeatureLocked("tuner")
                ? "rgba(255, 177, 66, 0.2)"
                : "rgba(46, 213, 115, 0.25)"
              : isFeatureLocked("tuner")
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              tunerOpen
                ? isFeatureLocked("tuner")
                  ? "#ffb142"
                  : "#2ed573"
                : isFeatureLocked("tuner")
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color: tunerOpen
              ? isFeatureLocked("tuner")
                ? "#ffb142"
                : "#2ed573"
              : isFeatureLocked("tuner")
              ? "#aaa"
              : "#fff",
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
          {isFeatureLocked("tuner") ? <Lock size={12} /> : <Radio size={13} />}
          <span>Tuner {isFeatureLocked("tuner") ? "(View)" : ""}</span>
        </button>

        {/* Pitch Drone */}
        <button
          type="button"
          onClick={() => {
            setDroneOpen((prev) => !prev);
          }}
          title={
            isFeatureLocked("drone")
              ? droneOpen
                ? "Close Drone (View Only)"
                : "Open Drone (View Only - Supervisor tone live)"
              : "Pitch Drone & Reference Tuning Tone"
          }
          style={{
            background: droneOpen
              ? isFeatureLocked("drone")
                ? "rgba(255, 177, 66, 0.2)"
                : "rgba(165, 94, 234, 0.25)"
              : isFeatureLocked("drone")
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              droneOpen
                ? isFeatureLocked("drone")
                  ? "#ffb142"
                  : "#a55eea"
                : isFeatureLocked("drone")
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color: droneOpen
              ? isFeatureLocked("drone")
                ? "#ffb142"
                : "#a55eea"
              : isFeatureLocked("drone")
              ? "#aaa"
              : "#fff",
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
          {isFeatureLocked("drone") ? <Lock size={12} /> : <Disc3 size={13} />}
          <span>Drone {isFeatureLocked("drone") ? "(View)" : ""}</span>
        </button>

        {/* Collaborative Whiteboard */}
        <button
          type="button"
          onClick={toggleWhiteboard}
          title={
            isFeatureLocked("whiteboard")
              ? whiteboardOpen
                ? "Close Whiteboard (View Only)"
                : "Open Whiteboard (View Only - Supervisor live)"
              : "Collaborative Music Staff Whiteboard: Opens on everyone's screen in real time"
          }
          style={{
            background: whiteboardOpen
              ? isFeatureLocked("whiteboard")
                ? "rgba(255, 177, 66, 0.2)"
                : "rgba(46, 213, 115, 0.25)"
              : isFeatureLocked("whiteboard")
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              whiteboardOpen
                ? isFeatureLocked("whiteboard")
                  ? "#ffb142"
                  : "#2ed573"
                : isFeatureLocked("whiteboard")
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(255, 255, 255, 0.2)"
            }`,
            color: whiteboardOpen
              ? isFeatureLocked("whiteboard")
                ? "#ffb142"
                : "#2ed573"
              : isFeatureLocked("whiteboard")
              ? "#aaa"
              : "#fff",
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
          {isFeatureLocked("whiteboard") ? (
            <Lock size={12} />
          ) : (
            <Edit3 size={13} />
          )}
          <span>
            Whiteboard{" "}
            {isFeatureLocked("whiteboard")
              ? "(View)"
              : whiteboardOpen
              ? "● Shared"
              : ""}
          </span>
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
            opacity: isFeatureLocked("reactions") ? 0.5 : 1,
          }}
        >
          <button
            type="button"
            onClick={() => triggerReaction("🎵", "Bravo!")}
            title={
              isFeatureLocked("reactions")
                ? "Reactions locked by supervisor"
                : "Send Bravo!"
            }
            style={{
              background: "transparent",
              border: "none",
              fontSize: 13,
              cursor: isFeatureLocked("reactions") ? "not-allowed" : "pointer",
              padding: "1px",
            }}
          >
            🎵
          </button>
          <button
            type="button"
            onClick={() => triggerReaction("👏", "Applause!")}
            title={
              isFeatureLocked("reactions")
                ? "Reactions locked by supervisor"
                : "Send Applause"
            }
            style={{
              background: "transparent",
              border: "none",
              fontSize: 13,
              cursor: isFeatureLocked("reactions") ? "not-allowed" : "pointer",
              padding: "1px",
            }}
          >
            👏
          </button>
          <button
            type="button"
            onClick={() => triggerReaction("🎹", "Piano!")}
            title={
              isFeatureLocked("reactions")
                ? "Reactions locked by supervisor"
                : "Send Piano"
            }
            style={{
              background: "transparent",
              border: "none",
              fontSize: 13,
              cursor: isFeatureLocked("reactions") ? "not-allowed" : "pointer",
              padding: "1px",
            }}
          >
            🎹
          </button>
          <button
            type="button"
            onClick={() => triggerReaction("🌟", "Superb!")}
            title={
              isFeatureLocked("reactions")
                ? "Reactions locked by supervisor"
                : "Send Star"
            }
            style={{
              background: "transparent",
              border: "none",
              fontSize: 13,
              cursor: isFeatureLocked("reactions") ? "not-allowed" : "pointer",
              padding: "1px",
            }}
          >
            🌟
          </button>
        </div>

        {/* Raise Hand Button */}
        <button
          type="button"
          onClick={toggleHandRaise}
          title={
            isFeatureLocked("reactions")
              ? "Hand raise locked by supervisor"
              : handRaised
              ? "Lower Hand"
              : "Raise Hand to speak"
          }
          style={{
            background: handRaised ? "#ff4757" : "rgba(255, 255, 255, 0.1)",
            border: `1px solid ${
              handRaised ? "#ff4757" : "rgba(255, 255, 255, 0.2)"
            }`,
            color: isFeatureLocked("reactions") ? "#777" : "#fff",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: isFeatureLocked("reactions") ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {isFeatureLocked("reactions") ? (
            <Lock size={12} />
          ) : (
            <Hand size={13} />
          )}
          <span>{handRaised ? "Lower Hand" : "Raise Hand"}</span>
        </button>

        {/* Staff Private Backchannel Chat Button (Admin & Teacher Only) */}
        {!isRestrictedRole &&
          userRole !== "student" &&
          userRole !== "parent" && (
            <button
              type="button"
              onClick={openStaffChat}
              title="Private Staff Backchannel: Secret chat between Teacher and Admin (Invisible to student & parent)"
              style={{
                position: "relative",
                background: staffChatOpen
                  ? "rgba(255, 177, 66, 0.28)"
                  : unreadStaffCount > 0
                  ? "rgba(255, 177, 66, 0.2)"
                  : "rgba(255, 255, 255, 0.1)",
                border: `1px solid ${
                  staffChatOpen
                    ? "#ffb142"
                    : unreadStaffCount > 0
                    ? "#ffb142"
                    : "rgba(255, 177, 66, 0.45)"
                }`,
                color:
                  staffChatOpen || unreadStaffCount > 0 ? "#ffb142" : "#ffc078",
                borderRadius: 6,
                padding: "4px 9px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                boxShadow:
                  unreadStaffCount > 0
                    ? "0 0 10px rgba(255, 177, 66, 0.45)"
                    : "none",
              }}
            >
              <ShieldAlert size={13} color="#ffb142" />
              <span>Staff Chat</span>
              {unreadStaffCount > 0 && (
                <span
                  style={{
                    background: "#ff4757",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 800,
                    padding: "0 5px",
                    borderRadius: 10,
                  }}
                >
                  {unreadStaffCount}
                </span>
              )}
            </button>
          )}
      </div>

      {/* Floating Metronome Drawer / Modal */}
      {metronomeOpen && (
        <div
          className="pc-metronome-panel"
          style={{
            position: "absolute",
            top: 55,
            left: 18,
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
                gap: 6,
                fontWeight: 700,
                fontSize: 13,
                color: "#ffb142",
              }}
            >
              <Sliders size={15} />
              Academy Metronome
            </div>
            <button
              type="button"
              onClick={() => setMetronomeOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#888",
                cursor: "pointer",
                padding: 2,
              }}
            >
              <X size={15} />
            </button>
          </div>

          <div style={{ textAlign: "center", margin: "14px 0" }}>
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: "#fff",
                lineHeight: 1,
              }}
            >
              {bpm}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#ffb142",
                fontWeight: 600,
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              {bpm < 60
                ? "Largo"
                : bpm < 76
                ? "Adagio"
                : bpm < 108
                ? "Andante"
                : bpm < 120
                ? "Moderato"
                : bpm < 168
                ? "Allegro"
                : "Presto"}{" "}
              BPM
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                marginTop: 12,
              }}
            >
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
              disabled={isFeatureLocked("metronome")}
              onChange={(e) => handleBpmChange(Number(e.target.value))}
              style={{
                width: "100%",
                accentColor: "#ffb142",
                cursor: isFeatureLocked("metronome")
                  ? "not-allowed"
                  : "pointer",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={toggleMetronomePlay}
              disabled={isFeatureLocked("metronome")}
              style={{
                flex: 1,
                background: isPlayingMetronome ? "#ff4757" : "#2ed573",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: isFeatureLocked("metronome")
                  ? "not-allowed"
                  : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {isPlayingMetronome ? (
                <VolumeX size={14} />
              ) : (
                <Volume2 size={14} />
              )}
              {isPlayingMetronome ? "Stop Metronome" : "Start Metronome"}
            </button>
            <button
              type="button"
              onClick={handleTapTempo}
              disabled={isFeatureLocked("metronome")}
              title="Click repeatedly to set tempo"
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: isFeatureLocked("metronome")
                  ? "not-allowed"
                  : "pointer",
              }}
            >
              Tap
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <label
              style={{
                fontSize: 11,
                color: metronomeShared ? "#ffb142" : "#aaa",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: isFeatureLocked("metronome") ? "default" : "pointer",
              }}
              title="When enabled, metronome tempo and clicks synchronize to student. When disabled, it clicks privately on your device."
            >
              <input
                type="checkbox"
                disabled={isFeatureLocked("metronome")}
                checked={metronomeShared}
                onChange={(e) => handleMetronomeSharedToggle(e.target.checked)}
                style={{
                  accentColor: "#ffb142",
                  cursor: isFeatureLocked("metronome") ? "default" : "pointer",
                }}
              />
              Sync click sound to student
            </label>
            <span
              style={{
                fontSize: 10,
                color: metronomeShared ? "#ffb142" : "#666",
              }}
            >
              {metronomeShared ? "● Synchronized" : "Local only"}
            </span>
          </div>
        </div>
      )}

      {/* Piano Keyboard Component */}
      {pianoOpen && (
        <ClassroomPiano
          onClose={() => setPianoOpen(false)}
          isLocked={isFeatureLocked("piano")}
          isAdmin={canGrantAccess || !isRestrictedRole}
        />
      )}

      {/* Chromatic Tuner Component */}
      {tunerOpen && (
        <ClassroomTuner
          onClose={() => setTunerOpen(false)}
          isLocked={isFeatureLocked("tuner")}
        />
      )}

      {/* Pitch Drone Component */}
      {droneOpen && (
        <ClassroomDrone
          onClose={() => setDroneOpen(false)}
          tunerOpen={tunerOpen}
          isLocked={isFeatureLocked("drone")}
        />
      )}

      {/* Musical Staff Whiteboard Component */}
      {whiteboardOpen && (
        <ClassroomWhiteboard
          onClose={() => setWhiteboardOpen(false)}
          pianoOpen={pianoOpen}
          isLocked={isFeatureLocked("whiteboard")}
        />
      )}

      {/* Staff Private Backchannel Chat Controller (Admin & Teacher Only) */}
      {!isRestrictedRole &&
        userRole !== "student" &&
        userRole !== "parent" && (
          <ClassroomStaffChat
            userRole={userRole}
            isRestrictedRole={isRestrictedRole}
            staffMessages={staffMessages}
            onSendStaffMessage={handleSendStaffMessage}
            forceOpenStaffTab={forceOpenStaffTab}
            onStaffTabOpened={() => setForceOpenStaffTab(false)}
          />
        )}
    </>
  );
}
