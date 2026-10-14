"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  Sparkles,
  X,
  Send,
  LoaderCircle,
  Shield,
  RotateCcw,
  GripHorizontal,
} from "lucide-react";
import type { Role } from "@/lib/types";

interface Profile {
  id: string;
  name: string;
  role: Role;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function roleLabel(role: Role): string {
  return role.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function roleSuggestionChips(role: Role): string[] {
  switch (role) {
    case "parent":
    case "student":
      return [
        "How do I upload my payment receipt?",
        "Where is my lesson schedule?",
        "How do I submit homework?",
        "How do I join the classroom?",
      ];
    case "teacher":
    case "qc":
      return [
        "How do I mark a lesson Teacher Done?",
        "Where is the Lesson board for continuity?",
        "Where do I record lesson notes?",
        "Where is the Birthday radar?",
      ];
    case "head_admin":
    case "admin":
    case "super_admin":
      return [
        "Where is the Birthday radar on the dashboard?",
        "How does attendance verification work?",
        "How are senior escalations handled?",
        "Where are billing documents located?",
      ];
    case "finance":
      return [
        "How are referral discounts applied?",
        "How do I review student payment receipts?",
        "What is the salary approval workflow?",
        "Where are invoices and documents?",
      ];
    default:
      return [
        "How do I navigate my workspace?",
        "How do I update my profile?",
        "Where can I find manual guidance?",
      ];
  }
}

// Inline Markdown Parser: turns links into clickable Next.js links, handles bold, italics, code
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const regex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(regex);

  return parts.map((part, i) => {
    if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        const [, linkText, href] = match;
        return (
          <Link
            key={i}
            href={href}
            style={{
              color: "#135B45",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            {linkText}
          </Link>
        );
      }
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={i} style={{ fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={i}
          style={{
            background: "rgba(0,0,0,0.06)",
            padding: "1px 5px",
            borderRadius: "3px",
            fontSize: "12px",
            fontFamily: "monospace",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function FormattedContent({ content }: { content: string }) {
  const blocks = content.split(/\n\n+/);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {blocks.map((block, idx) => {
        const lines = block.split("\n");
        const isBulletList = lines.every(
          (l) =>
            l.trim().startsWith("- ") ||
            l.trim().startsWith("* ") ||
            l.trim() === ""
        );

        if (isBulletList && lines.some((l) => l.trim())) {
          return (
            <ul
              key={idx}
              style={{
                margin: 0,
                paddingLeft: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {lines
                .filter((l) => l.trim())
                .map((line, lIdx) => {
                  const itemText = line.trim().replace(/^[-*]\s+/, "");
                  return <li key={lIdx}>{renderInlineMarkdown(itemText)}</li>;
                })}
            </ul>
          );
        }

        return (
          <p key={idx} style={{ margin: 0, lineHeight: 1.5 }}>
            {lines.map((line, lIdx) => (
              <span key={lIdx}>
                {renderInlineMarkdown(line)}
                {lIdx < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// Compacts chat history when it gets long so token limits are respected
function optimizeChatHistory(
  messages: ChatMessage[]
): { role: "user" | "assistant"; content: string }[] {
  const eligible = messages.filter((m) => m.id !== "welcome");
  if (eligible.length <= 6) {
    return eligible.map((m) => ({ role: m.role, content: m.content }));
  }

  // Keep last 6 messages
  const recent = eligible.slice(-6);
  const older = eligible.slice(0, -6);

  // Compress older messages into a concise summary tag
  const olderTopics = older
    .filter((m) => m.role === "user")
    .map((m) => m.content.slice(0, 35))
    .join("; ");

  const summaryItem: { role: "assistant"; content: string } = {
    role: "assistant",
    content: `[Previous conversation context: user previously asked about "${olderTopics}"]`,
  };

  return [
    summaryItem,
    ...recent.map((m) => ({ role: m.role, content: m.content })),
  ];
}

export default function PortalAiChatBubble({
  profile,
  avatarUrl,
}: {
  profile: Profile | null;
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorNotice, setErrorNotice] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dragging state for launcher button & chat dialog (in-memory only, resets on page refresh)
  const [buttonPos, setButtonPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // Launcher button drag logic
  const handleButtonPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    // Only primary button
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handleButtonPointerMove = (
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragStartRef.current.moved = true;
    }
    const newX = Math.max(
      12,
      Math.min(window.innerWidth - 130, dragStartRef.current.origX + deltaX)
    );
    const newY = Math.max(
      12,
      Math.min(window.innerHeight - 56, dragStartRef.current.origY + deltaY)
    );
    setButtonPos({ x: newX, y: newY });
  };

  const handleButtonPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStartRef.current) return;
    const moved = dragStartRef.current.moved;
    dragStartRef.current = null;
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // If it was just a click and not a drag, open the drawer
    if (!moved) {
      openChatAtSafeLocation();
    }
  };

  const openChatAtSafeLocation = () => {
    // If user dragged the bubble, open the modal anchored to that bubble location
    // while clamping so it stays completely on-screen and readable
    if (buttonPos) {
      const panelWidth = Math.min(370, window.innerWidth - 24);
      const panelHeight = Math.min(540, window.innerHeight - 36);

      // Prefer placing panel above or near the bubble
      let targetX = buttonPos.x + 120 - panelWidth; // align right edge towards button
      let targetY = buttonPos.y - panelHeight + 40; // place above button

      // If too close to top edge, place below button
      if (targetY < 16) {
        targetY = buttonPos.y;
      }

      // Clamp X so it stays entirely on screen
      targetX = Math.max(
        12,
        Math.min(window.innerWidth - panelWidth - 12, targetX)
      );
      // Clamp Y so it stays entirely on screen
      targetY = Math.max(
        12,
        Math.min(window.innerHeight - panelHeight - 12, targetY)
      );

      setPanelPos({ x: targetX, y: targetY });
    }
    setOpen(true);
  };

  // Chat panel header drag logic
  const handlePanelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Don't drag if clicking buttons inside the header
    if ((e.target as HTMLElement).closest("button")) return;
    const panel = e.currentTarget.closest(
      '[role="dialog"]'
    ) as HTMLElement | null;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePanelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;
    const newX = Math.max(
      10,
      Math.min(window.innerWidth - 380, dragStartRef.current.origX + deltaX)
    );
    const newY = Math.max(
      10,
      Math.min(window.innerHeight - 550, dragStartRef.current.origY + deltaY)
    );
    setPanelPos({ x: newX, y: newY });
  };

  const handlePanelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const storageKey = profile
    ? `prosperwork_ai_chat_${profile.id}`
    : "prosperwork_ai_chat_guest";

  const activeUserIdRef = useRef<string | null>(profile?.id ?? null);

  // When profile changes (e.g. login as different user), load their isolated chat history
  useEffect(() => {
    if (!profile) {
      setMessages([]);
      activeUserIdRef.current = null;
      return;
    }

    activeUserIdRef.current = profile.id;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
      // ignore storage parsing failure
    }

    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Hi ${
          profile.name.split(" ")[0]
        }! 👋 I'm your ProsperWork Music Academy assistant. I can answer questions about your lessons, practice routines, billing, or portal workspaces with direct links. How can I help you today?`,
      },
    ]);
  }, [profile?.id, storageKey]);

  // Sync messages to localStorage only for the current active user
  useEffect(() => {
    if (!profile || messages.length === 0) return;
    // Guard against writing previous user's messages if profile just switched
    if (activeUserIdRef.current !== profile.id) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // storage quota or private mode fallback
    }
  }, [messages, profile, storageKey]);

  const clearChatHistory = () => {
    if (!profile) return;
    const defaultWelcome: ChatMessage = {
      id: "welcome",
      role: "assistant",
      content: `Hi ${
        profile.name.split(" ")[0]
      }! 👋 I'm your ProsperWork Music Academy assistant. I can answer questions about your lessons, practice routines, billing, or portal workspaces with direct links. How can I help you today?`,
    };
    setMessages([defaultWelcome]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(
    async (textToSend: string) => {
      const trimmed = textToSend.trim();
      if (!trimmed || busy || !profile) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setBusy(true);
      setErrorNotice("");

      const optimizedHistory = optimizeChatHistory([...messages, userMsg]);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: optimizedHistory,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            data.error || "Unable to get an answer at this time."
          );
        }

        const replyContent =
          typeof data.reply === "string"
            ? data.reply
            : "I am having trouble answering right now. Please check the [Manual usage](/manual) page.";

        const assistantMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          role: "assistant",
          content: replyContent,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error. Please try again.";
        setErrorNotice(msg);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, profile]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  if (!profile) return null;

  const suggestions = roleSuggestionChips(profile.role);

  return (
    <>
      {/* Floating Toggle Button with Brand Logo Profile - Draggable anywhere on screen */}
      {!open && (
        <button
          type="button"
          onPointerDown={handleButtonPointerDown}
          onPointerMove={handleButtonPointerMove}
          onPointerUp={handleButtonPointerUp}
          onPointerCancel={handleButtonPointerUp}
          aria-label="Open ProsperWork AI Assistant (Drag to reposition)"
          title="Click to chat • Drag to reposition"
          style={{
            position: "fixed",
            left: buttonPos ? `${buttonPos.x}px` : "auto",
            top: buttonPos ? `${buttonPos.y}px` : "auto",
            bottom: buttonPos ? "auto" : "24px",
            right: buttonPos ? "auto" : "24px",
            zIndex: 9990,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px 8px 10px",
            borderRadius: "30px",
            background: "linear-gradient(135deg, #135B45 0%, #1e7a5e 100%)",
            color: "#ffffff",
            border: "none",
            boxShadow: isDragging
              ? "0 12px 32px rgba(19, 91, 69, 0.55)"
              : "0 8px 24px rgba(19, 91, 69, 0.35)",
            cursor: isDragging ? "grabbing" : "grab",
            fontWeight: 600,
            fontSize: "13px",
            touchAction: "none",
            userSelect: "none",
            transition: isDragging ? "none" : "box-shadow 0.2s ease",
          }}
        >
          <GripHorizontal size={14} style={{ opacity: 0.7 }} />
          <img
            src="/images/logo/brand-emblem.webp"
            alt="ProsperWork Logo"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "/images/logo/brand-emblem.png";
            }}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              objectFit: "contain",
              background: "#ffffff",
              padding: "2px",
              pointerEvents: "none",
            }}
          />
          <span style={{ pointerEvents: "none" }}>Ask AI</span>
        </button>
      )}

      {/* Floating Chat Panel - Header is draggable */}
      {open && (
        <div
          role="dialog"
          aria-label="ProsperWork AI Chat"
          style={{
            position: "fixed",
            left: panelPos ? `${panelPos.x}px` : "auto",
            top: panelPos ? `${panelPos.y}px` : "auto",
            bottom: panelPos ? "auto" : "24px",
            right: panelPos ? "auto" : "24px",
            width: "370px",
            maxWidth: "calc(100vw - 32px)",
            height: "540px",
            maxHeight: "calc(100vh - 48px)",
            zIndex: 9995,
            background: "#ffffff",
            borderRadius: "16px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.18)",
            border: "1px solid #e2ece7",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: panelPos ? "none" : "fadeIn 0.2s ease",
          }}
        >
          {/* Header with Academy Logo as Profile (Draggable) */}
          <div
            onPointerDown={handlePanelPointerDown}
            onPointerMove={handlePanelPointerMove}
            onPointerUp={handlePanelPointerUp}
            onPointerCancel={handlePanelPointerUp}
            title="Drag header to move chat window"
            style={{
              padding: "12px 16px",
              background: "#135B45",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "grab",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                pointerEvents: "none",
              }}
            >
              <img
                src="/images/logo/brand-emblem.webp"
                alt="ProsperWork AI Logo"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "/images/logo/brand-emblem.png";
                }}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  background: "#ffffff",
                  padding: "2px",
                  objectFit: "contain",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              />
              <div>
                <strong
                  style={{
                    fontSize: "14px",
                    display: "block",
                    lineHeight: 1.2,
                  }}
                >
                  ProsperWork AI
                </strong>
                <span
                  style={{
                    fontSize: "10px",
                    opacity: 0.85,
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Shield size={10} /> Role: {roleLabel(profile.role)}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {messages.length > 1 && (
                <button
                  type="button"
                  onClick={clearChatHistory}
                  title="Clear conversation history"
                  aria-label="Clear conversation history"
                  style={{
                    background: "rgba(255, 255, 255, 0.15)",
                    border: "none",
                    color: "#ffffff",
                    cursor: "pointer",
                    padding: "4px 8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 500,
                    transition: "background 0.2s ease",
                  }}
                >
                  <RotateCcw size={12} />
                  <span>Clear</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close AI Assistant"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "4px",
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages Area with Brand Logo next to Assistant Responses */}
          <div
            style={{
              flex: 1,
              padding: "16px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              background: "#fafcfb",
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent:
                    msg.role === "user" ? "flex-end" : "flex-start",
                  alignItems: "flex-start",
                  gap: "8px",
                }}
              >
                {msg.role === "assistant" && (
                  <img
                    src="/images/logo/brand-emblem.webp"
                    alt="AI Logo"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "/images/logo/brand-emblem.png";
                    }}
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: "#ffffff",
                      padding: "1px",
                      border: "1px solid #e5e7eb",
                      flexShrink: 0,
                      marginTop: "2px",
                      objectFit: "contain",
                    }}
                  />
                )}
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius:
                      msg.role === "user"
                        ? "14px 14px 2px 14px"
                        : "14px 14px 14px 2px",
                    background: msg.role === "user" ? "#135B45" : "#ffffff",
                    color: msg.role === "user" ? "#ffffff" : "#1f2937",
                    fontSize: "13px",
                    lineHeight: "1.45",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    border: msg.role === "user" ? "none" : "1px solid #e5e7eb",
                  }}
                >
                  {msg.role === "user" ? (
                    <span style={{ whiteSpace: "pre-wrap" }}>
                      {msg.content}
                    </span>
                  ) : (
                    <FormattedContent content={msg.content} />
                  )}
                </div>

                {msg.role === "user" && (
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      overflow: "hidden",
                      flexShrink: 0,
                      marginTop: "2px",
                      background: "#135B45",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "10px",
                      fontWeight: 700,
                      border: "1px solid rgba(19, 91, 69, 0.2)",
                    }}
                    title={profile.name}
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={profile.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                        onError={(e) => {
                          // Hide image and show initials if image fails
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    ) : (
                      <span>
                        {profile.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <img
                  src="/images/logo/brand-emblem.webp"
                  alt="AI Logo"
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: "#ffffff",
                    padding: "1px",
                    border: "1px solid #e5e7eb",
                    objectFit: "contain",
                  }}
                />
                <div
                  style={{
                    padding: "8px 14px",
                    borderRadius: "14px 14px 14px 2px",
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                    color: "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <LoaderCircle size={13} className="spin" /> Thinking…
                </div>
              </div>
            )}

            {errorNotice && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  fontSize: "12px",
                }}
              >
                {errorNotice}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions (shown if few messages) */}
          {messages.length <= 2 && !busy && (
            <div
              style={{
                padding: "8px 12px",
                background: "#f3f7f5",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span
                style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}
              >
                Suggested:
              </span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      fontSize: "11px",
                      color: "#1e3a2b",
                      cursor: "pointer",
                      textAlign: "left",
                      lineHeight: "1.2",
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: "10px 12px",
              background: "#ffffff",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question or follow-up…"
              maxLength={600}
              disabled={busy}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: "20px",
                border: "1px solid #d1d5db",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: input.trim() && !busy ? "#135B45" : "#e5e7eb",
                color: input.trim() && !busy ? "#ffffff" : "#9ca3af",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !busy ? "pointer" : "default",
                transition: "all 0.15s ease",
              }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
