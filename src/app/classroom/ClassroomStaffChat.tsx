"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRoomContext } from "@livekit/components-react";
import {
  Lock,
  MessageSquare,
  Send,
  Users,
  X,
  Minimize2,
  Maximize2,
  ShieldAlert,
  Globe,
  Sparkles,
  Info,
} from "lucide-react";

export interface StaffChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  message: string;
  timestamp: number;
}

interface ClassroomStaffChatProps {
  onClose: () => void;
  userRole?: string;
  isRestrictedRole?: boolean;
  staffMessages: StaffChatMessage[];
  onSendStaffMessage: (message: string) => Promise<void> | void;
  publicMessages?: Array<{
    id: string;
    sender: string;
    message: string;
    timestamp: number;
  }>;
  onSendPublicMessage?: (message: string) => Promise<void> | void;
}

export default function ClassroomStaffChat({
  onClose,
  userRole = "staff",
  isRestrictedRole = false,
  staffMessages,
  onSendStaffMessage,
  publicMessages = [],
  onSendPublicMessage,
}: ClassroomStaffChatProps) {
  // Absolute security guard: if user is restricted (student/parent), NEVER render
  if (isRestrictedRole || userRole === "student" || userRole === "parent") {
    return null;
  }

  const room = useRoomContext();
  const [activeTab, setActiveTab] = useState<"staff" | "public">("staff");
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to bottom whenever messages update
  useEffect(() => {
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [staffMessages, publicMessages, activeTab, isMinimized]);

  // Focus input on mount or tab change
  useEffect(() => {
    if (!isMinimized) {
      inputRef.current?.focus();
    }
  }, [activeTab, isMinimized]);

  // Find all active staff in the room
  const staffParticipants = React.useMemo(() => {
    if (!room) return [];
    const staffList: Array<{
      identity: string;
      name: string;
      role: string;
      isLocal: boolean;
    }> = [];

    // Local user
    staffList.push({
      identity: room.localParticipant.identity,
      name: room.localParticipant.name || "You",
      role: userRole,
      isLocal: true,
    });

    const staffRoles = [
      "super_admin",
      "admin",
      "head_admin",
      "general_manager",
      "teacher",
      "qc",
    ];

    // Remote users
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
        staffList.push({
          identity: p.identity,
          name: p.name || p.identity,
          role: role || "Staff",
          isLocal: false,
        });
      }
    }
    return staffList;
  }, [room, userRole]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      if (activeTab === "staff") {
        await onSendStaffMessage(trimmed);
      } else if (onSendPublicMessage) {
        await onSendPublicMessage(trimmed);
      }
      setInputText("");
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handlePresetClick = (presetText: string) => {
    setInputText(presetText);
    inputRef.current?.focus();
  };

  const formatRoleBadge = (roleName: string) => {
    const lower = (roleName || "").toLowerCase();
    if (lower.includes("super")) {
      return {
        label: "Super Admin",
        bg: "rgba(46, 213, 115, 0.2)",
        color: "#2ed573",
        border: "1px solid rgba(46, 213, 115, 0.4)",
      };
    }
    if (lower.includes("admin")) {
      return {
        label: "Admin",
        bg: "rgba(255, 177, 66, 0.2)",
        color: "#ffb142",
        border: "1px solid rgba(255, 177, 66, 0.4)",
      };
    }
    if (lower.includes("teacher")) {
      return {
        label: "Teacher",
        bg: "rgba(112, 161, 255, 0.2)",
        color: "#70a1ff",
        border: "1px solid rgba(112, 161, 255, 0.4)",
      };
    }
    if (lower.includes("qc") || lower.includes("head")) {
      return {
        label: "Supervisor",
        bg: "rgba(236, 204, 104, 0.2)",
        color: "#eccc68",
        border: "1px solid rgba(236, 204, 104, 0.4)",
      };
    }
    return {
      label: roleName.replace(/_/g, " "),
      bg: "rgba(255, 255, 255, 0.1)",
      color: "#ccc",
      border: "1px solid rgba(255, 255, 255, 0.2)",
    };
  };

  const formatTime = (ts: number) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const staffPresets = [
    "🔊 Check student audio & mic",
    "⏱️ 5 minutes remaining",
    "👍 Great lesson pace",
    "👂 Guide student through rhythm",
    "📝 Assign practice note",
    "✅ Wrap up lesson smoothly",
  ];

  return (
    <div
      className="pc-staff-chat-window"
      style={{
        position: "fixed",
        bottom: "84px",
        right: "24px",
        width: "min(400px, calc(100vw - 32px))",
        height: isMinimized ? "52px" : "min(540px, calc(100vh - 120px))",
        background: "rgba(17, 24, 22, 0.95)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255, 177, 66, 0.4)",
        boxShadow: "0 18px 45px rgba(0, 0, 0, 0.75), 0 0 25px rgba(255, 177, 66, 0.12)",
        borderRadius: "14px",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "height 0.2s ease, transform 0.2s ease",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          background: "linear-gradient(180deg, rgba(255, 177, 66, 0.15) 0%, rgba(20, 28, 25, 0.95) 100%)",
          borderBottom: isMinimized ? "none" : "1px solid rgba(255, 255, 255, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "rgba(255, 177, 66, 0.2)",
              border: "1px solid rgba(255, 177, 66, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffb142",
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                Staff Private Chat
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#ffb142",
                  background: "rgba(255, 177, 66, 0.15)",
                  border: "1px solid rgba(255, 177, 66, 0.3)",
                  padding: "1px 6px",
                  borderRadius: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <Lock size={9} /> Private
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#9eb3a7",
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginTop: 1,
              }}
            >
              <Users size={11} color="#2ed573" />
              <span>
                {staffParticipants.length} staff online (Admin & Teacher)
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => setIsMinimized((prev) => !prev)}
            title={isMinimized ? "Expand Chat" : "Minimize"}
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              cursor: "pointer",
              padding: 5,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isMinimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close Staff Chat"
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              cursor: "pointer",
              padding: 5,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Channel Tabs */}
          <div
            style={{
              display: "flex",
              background: "rgba(0, 0, 0, 0.35)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "4px 8px",
              gap: 6,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("staff")}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border:
                  activeTab === "staff"
                    ? "1px solid rgba(255, 177, 66, 0.4)"
                    : "1px solid transparent",
                background:
                  activeTab === "staff"
                    ? "rgba(255, 177, 66, 0.16)"
                    : "transparent",
                color: activeTab === "staff" ? "#ffb142" : "#999",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                transition: "all 0.15s ease",
              }}
            >
              <Lock size={12} />
              Staff Backchannel
              {staffMessages.length > 0 && (
                <span
                  style={{
                    background: activeTab === "staff" ? "#ffb142" : "#444",
                    color: activeTab === "staff" ? "#111" : "#ccc",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 10,
                  }}
                >
                  {staffMessages.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("public")}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border:
                  activeTab === "public"
                    ? "1px solid rgba(46, 213, 115, 0.4)"
                    : "1px solid transparent",
                background:
                  activeTab === "public"
                    ? "rgba(46, 213, 115, 0.15)"
                    : "transparent",
                color: activeTab === "public" ? "#2ed573" : "#999",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                transition: "all 0.15s ease",
              }}
            >
              <Globe size={12} />
              Everyone (Public)
              {publicMessages.length > 0 && (
                <span
                  style={{
                    background: activeTab === "public" ? "#2ed573" : "#444",
                    color: activeTab === "public" ? "#111" : "#ccc",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 10,
                  }}
                >
                  {publicMessages.length}
                </span>
              )}
            </button>
          </div>

          {/* Privacy Notice Banner */}
          {activeTab === "staff" ? (
            <div
              style={{
                padding: "6px 12px",
                background: "rgba(255, 177, 66, 0.08)",
                borderBottom: "1px solid rgba(255, 177, 66, 0.15)",
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 11,
                color: "#ffc078",
              }}
            >
              <Info size={12} style={{ flexShrink: 0 }} />
              <span>
                <strong>Confidential backchannel:</strong> Student & parent cannot see this conversation.
              </span>
            </div>
          ) : (
            <div
              style={{
                padding: "6px 12px",
                background: "rgba(46, 213, 115, 0.08)",
                borderBottom: "1px solid rgba(46, 213, 115, 0.15)",
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 11,
                color: "#a8f0c6",
              }}
            >
              <Globe size={12} style={{ flexShrink: 0 }} />
              <span>
                <strong>Room public chat:</strong> Seen by all participants (teacher, student, parent, admin).
              </span>
            </div>
          )}

          {/* Messages Feed */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {activeTab === "staff" ? (
              staffMessages.length === 0 ? (
                <div
                  style={{
                    margin: "auto",
                    textAlign: "center",
                    color: "#889991",
                    padding: "20px 10px",
                  }}
                >
                  <Lock size={28} color="#ffb142" style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                    Staff Backchannel Ready
                  </div>
                  <p style={{ fontSize: 11, margin: "6px 0 12px", maxWidth: 260 }}>
                    Coordinate lesson pacing, verify sound levels, or pass notes privately between Teacher and Admin.
                  </p>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#6b7d75",
                      background: "rgba(255,255,255,0.04)",
                      padding: "6px 10px",
                      borderRadius: 6,
                      display: "inline-block",
                    }}
                  >
                    Click any quick action below to start
                  </div>
                </div>
              ) : (
                staffMessages.map((msg) => {
                  const isMe = msg.senderId === room?.localParticipant?.identity;
                  const roleBadge = formatRoleBadge(msg.senderRole);
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isMe ? "flex-end" : "flex-start",
                        gap: 2,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          color: "#889991",
                          padding: "0 4px",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: isMe ? "#ffb142" : "#e1e8e4" }}>
                          {isMe ? "You" : msg.senderName}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "0 5px",
                            borderRadius: 4,
                            background: roleBadge.bg,
                            color: roleBadge.color,
                            border: roleBadge.border,
                            textTransform: "capitalize",
                          }}
                        >
                          {roleBadge.label}
                        </span>
                        <span style={{ fontSize: 9, color: "#667" }}>
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>

                      <div
                        style={{
                          maxWidth: "85%",
                          padding: "8px 12px",
                          borderRadius: isMe ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
                          background: isMe
                            ? "linear-gradient(135deg, #2b2313 0%, #1a160d 100%)"
                            : "rgba(255, 255, 255, 0.08)",
                          border: isMe
                            ? "1px solid rgba(255, 177, 66, 0.45)"
                            : "1px solid rgba(255, 255, 255, 0.12)",
                          color: "#fff",
                          fontSize: 12,
                          lineHeight: "1.45",
                          wordBreak: "break-word",
                          boxShadow: isMe ? "0 4px 12px rgba(255, 177, 66, 0.08)" : "none",
                        }}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              publicMessages.length === 0 ? (
                <div
                  style={{
                    margin: "auto",
                    textAlign: "center",
                    color: "#889991",
                    padding: "20px 10px",
                  }}
                >
                  <Globe size={28} color="#2ed573" style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                    Public Room Chat
                  </div>
                  <p style={{ fontSize: 11, margin: "6px 0 0", maxWidth: 260 }}>
                    Messages here are visible to the student and anyone in this lesson room.
                  </p>
                </div>
              ) : (
                publicMessages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        color: "#889991",
                        padding: "0 4px",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#2ed573" }}>
                        {msg.sender}
                      </span>
                      <span style={{ fontSize: 9, color: "#667" }}>
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <div
                      style={{
                        maxWidth: "90%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: "#fff",
                        fontSize: 12,
                        lineHeight: "1.45",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.message}
                    </div>
                  </div>
                ))
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Presets for Staff */}
          {activeTab === "staff" && (
            <div
              style={{
                padding: "6px 12px 2px",
                display: "flex",
                gap: 5,
                overflowX: "auto",
                whiteSpace: "nowrap",
                scrollbarWidth: "none",
              }}
            >
              {staffPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  style={{
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 12,
                    padding: "3px 8px",
                    color: "#c2d1c9",
                    fontSize: 10,
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255, 177, 66, 0.2)";
                    e.currentTarget.style.borderColor = "rgba(255, 177, 66, 0.4)";
                    e.currentTarget.style.color = "#ffb142";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
                    e.currentTarget.style.color = "#c2d1c9";
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          {/* Input & Send Form */}
          <form
            onSubmit={handleSend}
            style={{
              padding: "10px 12px",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              background: "rgba(10, 15, 13, 0.85)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                activeTab === "staff"
                  ? "Send private note to staff…"
                  : "Send message to everyone…"
              }
              disabled={isSending}
              style={{
                flex: 1,
                background: "rgba(255, 255, 255, 0.07)",
                border:
                  activeTab === "staff"
                    ? "1px solid rgba(255, 177, 66, 0.3)"
                    : "1px solid rgba(46, 213, 115, 0.3)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#fff",
                fontSize: 12,
                outline: "none",
              }}
              onFocus={(e) => {
                e.target.style.borderColor =
                  activeTab === "staff" ? "#ffb142" : "#2ed573";
              }}
              onBlur={(e) => {
                e.target.style.borderColor =
                  activeTab === "staff"
                    ? "rgba(255, 177, 66, 0.3)"
                    : "rgba(46, 213, 115, 0.3)";
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              style={{
                background:
                  !inputText.trim() || isSending
                    ? "rgba(255, 255, 255, 0.1)"
                    : activeTab === "staff"
                    ? "#ffb142"
                    : "#2ed573",
                color: !inputText.trim() || isSending ? "#666" : "#111",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: !inputText.trim() || isSending ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 12,
                transition: "all 0.15s ease",
              }}
            >
              <Send size={13} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
