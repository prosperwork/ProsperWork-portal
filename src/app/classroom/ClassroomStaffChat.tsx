"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRoomContext } from "@livekit/components-react";
import {
  Lock,
  MessageSquare,
  Send,
  Users,
  X,
  ShieldAlert,
  Globe,
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
  onClose?: () => void;
  userRole?: string;
  isRestrictedRole?: boolean;
  staffMessages: StaffChatMessage[];
  onSendStaffMessage: (message: string) => Promise<void> | void;
  forceOpenStaffTab?: boolean;
  onStaffTabOpened?: () => void;
}

export default function ClassroomStaffChat({
  onClose,
  userRole = "staff",
  isRestrictedRole = false,
  staffMessages,
  onSendStaffMessage,
  forceOpenStaffTab = false,
  onStaffTabOpened,
}: ClassroomStaffChatProps) {
  // Absolute security guard: if user is restricted (student/parent), NEVER render
  if (isRestrictedRole || userRole === "student" || userRole === "parent") {
    return null;
  }

  const room = useRoomContext();
  const [activeTab, setActiveTab] = useState<"public" | "staff">("public");
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lkChatEl, setLkChatEl] = useState<HTMLElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // If forceOpenStaffTab is triggered (e.g. from floating toolbar or toast)
  useEffect(() => {
    if (forceOpenStaffTab) {
      setActiveTab("staff");
      onStaffTabOpened?.();
    }
  }, [forceOpenStaffTab, onStaffTabOpened]);

  // Monitor DOM for LiveKit's .lk-chat sidebar
  useEffect(() => {
    const findChat = () => {
      const chat = document.querySelector(".lk-chat") as HTMLElement | null;
      if (chat) {
        // Check if visible
        const isVisible =
          chat.style.display !== "none" &&
          window.getComputedStyle(chat).display !== "none";
        if (isVisible) {
          setLkChatEl(chat);
          return;
        }
      }
      setLkChatEl(null);
    };

    findChat();
    const observer = new MutationObserver(findChat);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    return () => observer.disconnect();
  }, []);

  // When .lk-chat is found, inject a portal mount point directly under .lk-chat-header
  useEffect(() => {
    if (!lkChatEl) {
      setPortalTarget(null);
      return;
    }

    let mount = lkChatEl.querySelector("#pc-staff-chat-portal") as HTMLElement | null;
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "pc-staff-chat-portal";
      mount.style.display = "flex";
      mount.style.flexDirection = "column";
      mount.style.width = "100%";
      mount.style.overflow = "hidden";

      const header = lkChatEl.querySelector(".lk-chat-header");
      if (header && header.nextSibling) {
        lkChatEl.insertBefore(mount, header.nextSibling);
      } else if (header) {
        header.after(mount);
      } else {
        lkChatEl.prepend(mount);
      }
    }
    setPortalTarget(mount);

    return () => {
      // Cleanup on unmount or removal
      const existing = lkChatEl?.querySelector("#pc-staff-chat-portal");
      if (existing) {
        existing.remove();
      }
    };
  }, [lkChatEl]);

  // Control visibility of default LiveKit public elements based on activeTab
  useEffect(() => {
    if (!lkChatEl) return;
    const msgList = lkChatEl.querySelector(".lk-chat-messages") as HTMLElement | null;
    const msgForm = lkChatEl.querySelector(".lk-chat-form") as HTMLElement | null;

    if (activeTab === "staff") {
      if (msgList) msgList.style.display = "none";
      if (msgForm) msgForm.style.display = "none";
    } else {
      if (msgList) msgList.style.display = "flex";
      if (msgForm) msgForm.style.display = "flex";
    }

    return () => {
      if (msgList) msgList.style.display = "flex";
      if (msgForm) msgForm.style.display = "flex";
    };
  }, [lkChatEl, activeTab]);

  // Auto-scroll staff messages to bottom
  useEffect(() => {
    if (activeTab === "staff") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [staffMessages, activeTab]);

  // Focus input when switching to staff tab
  useEffect(() => {
    if (activeTab === "staff") {
      inputRef.current?.focus();
    }
  }, [activeTab]);

  // Find all active staff in the room
  const staffParticipants = React.useMemo(() => {
    if (!room) return [];
    const staffList: Array<{
      identity: string;
      name: string;
      role: string;
      isLocal: boolean;
    }> = [];

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

    for (const p of room.remoteParticipants.values()) {
      let role = p.attributes?.role || "";
      let isStaff = p.attributes?.isStaff === "true";
      if (!isStaff && p.metadata) {
        try {
          const parsed = JSON.parse(p.metadata);
          if (parsed.isStaff) isStaff = true;
          if (parsed.role) role = parsed.role;
        } catch {
          // ignore
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
      await onSendStaffMessage(trimmed);
      setInputText("");
    } catch (err) {
      console.error("Failed to send staff message:", err);
    } finally {
      setIsSending(false);
    }
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
  ];

  // If LiveKit chat sidebar is open, render directly inside it via React Portal
  if (portalTarget) {
    return createPortal(
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          flex: 1,
          minHeight: 0,
          background: "transparent",
        }}
      >
        {/* Channel Selector Tabs mounted inside the LiveKit Chat sidebar */}
        <div
          style={{
            display: "flex",
            background: "rgba(0, 0, 0, 0.4)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            padding: "6px 10px",
            gap: 6,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("public")}
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              border:
                activeTab === "public"
                  ? "1px solid rgba(46, 213, 115, 0.5)"
                  : "1px solid transparent",
              background:
                activeTab === "public"
                  ? "rgba(46, 213, 115, 0.2)"
                  : "rgba(255, 255, 255, 0.05)",
              color: activeTab === "public" ? "#2ed573" : "#aaa",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              transition: "all 0.15s ease",
            }}
          >
            <Globe size={13} />
            <span>Everyone (Public)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              border:
                activeTab === "staff"
                  ? "1px solid rgba(255, 177, 66, 0.5)"
                  : "1px solid rgba(255, 177, 66, 0.2)",
              background:
                activeTab === "staff"
                  ? "rgba(255, 177, 66, 0.22)"
                  : "rgba(255, 177, 66, 0.08)",
              color: activeTab === "staff" ? "#ffb142" : "#ffc078",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              transition: "all 0.15s ease",
            }}
          >
            <Lock size={12} />
            <span>Staff Only (Private)</span>
            {staffMessages.length > 0 && (
              <span
                style={{
                  background: activeTab === "staff" ? "#ffb142" : "#ff4757",
                  color: activeTab === "staff" ? "#111" : "#fff",
                  fontSize: 9,
                  fontWeight: 800,
                  padding: "1px 5px",
                  borderRadius: 10,
                }}
              >
                {staffMessages.length}
              </span>
            )}
          </button>
        </div>

        {/* When Staff Only is active, render the Private Backchannel view */}
        {activeTab === "staff" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "calc(100vh - 165px)",
              minHeight: "360px",
              background: "rgba(18, 24, 21, 0.98)",
            }}
          >
            {/* Private Banner */}
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(255, 177, 66, 0.1)",
                borderBottom: "1px solid rgba(255, 177, 66, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 11,
                color: "#ffc078",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldAlert size={14} color="#ffb142" />
                <span>
                  <strong>Private Staff Channel:</strong> Invisible to student & parent.
                </span>
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#9eb3a7",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  whiteSpace: "nowrap",
                }}
              >
                <Users size={11} color="#2ed573" />
                <span>{staffParticipants.length} staff</span>
              </div>
            </div>

            {/* Staff Messages List */}
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
              {staffMessages.length === 0 ? (
                <div
                  style={{
                    margin: "auto",
                    textAlign: "center",
                    color: "#889991",
                    padding: "30px 14px",
                  }}
                >
                  <Lock size={32} color="#ffb142" style={{ margin: "0 auto 10px" }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                    Private Staff Backchannel
                  </div>
                  <p style={{ fontSize: 11, margin: "6px 0 12px", color: "#a5b8ae" }}>
                    Messages here are sent directly between Teacher and Admin only.
                    The student will not see or hear these messages.
                  </p>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#ffc078",
                      background: "rgba(255, 177, 66, 0.1)",
                      border: "1px solid rgba(255, 177, 66, 0.2)",
                      padding: "4px 8px",
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
                        <span
                          style={{
                            fontWeight: 700,
                            color: isMe ? "#ffb142" : "#e1e8e4",
                          }}
                        >
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
                          maxWidth: "88%",
                          padding: "8px 12px",
                          borderRadius: isMe
                            ? "12px 2px 12px 12px"
                            : "2px 12px 12px 12px",
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
                          boxShadow: isMe
                            ? "0 4px 12px rgba(255, 177, 66, 0.1)"
                            : "none",
                        }}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Presets for Staff */}
            <div
              style={{
                padding: "6px 10px 2px",
                display: "flex",
                gap: 5,
                overflowX: "auto",
                whiteSpace: "nowrap",
                scrollbarWidth: "none",
                background: "rgba(0, 0, 0, 0.2)",
              }}
            >
              {staffPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setInputText(preset);
                    inputRef.current?.focus();
                  }}
                  style={{
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 12,
                    padding: "3px 8px",
                    color: "#c2d1c9",
                    fontSize: 10,
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255, 177, 66, 0.25)";
                    e.currentTarget.style.borderColor = "#ffb142";
                    e.currentTarget.style.color = "#ffb142";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
                    e.currentTarget.style.color = "#c2d1c9";
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Input & Send Form for Staff */}
            <form
              onSubmit={handleSend}
              style={{
                padding: "10px 12px",
                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                background: "rgba(10, 15, 13, 0.95)",
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
                placeholder="Type private message to teacher / admin…"
                disabled={isSending}
                style={{
                  flex: 1,
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 177, 66, 0.4)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "#fff",
                  fontSize: 12,
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#ffb142";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255, 177, 66, 0.4)";
                }}
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                style={{
                  background:
                    !inputText.trim() || isSending
                      ? "rgba(255, 255, 255, 0.1)"
                      : "#ffb142",
                  color: !inputText.trim() || isSending ? "#666" : "#111",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
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
          </div>
        )}
      </div>,
      portalTarget
    );
  }

  // If sidebar is not yet open in DOM, return null (the toolbar button & toasts handle opening)
  return null;
}
