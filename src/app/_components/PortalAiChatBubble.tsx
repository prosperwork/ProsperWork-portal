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
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  GripHorizontal,
  LoaderCircle,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import type { Role } from "@/lib/types";
import {
  COMPLAINT_CATEGORIES,
  categoryLabel,
  type ComplaintCategory,
  type ComplaintMessageRecord,
  type ComplaintRecord,
  type ComplaintUrgency,
} from "@/lib/academy/complaints";

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
      return [
        "How do I upload my payment receipt?",
        "Where is my lesson schedule?",
        "How do I submit homework?",
        "I have an issue or complaint to report",
      ];
    case "student":
      return [
        "Where is my lesson schedule?",
        "How do I submit homework?",
        "How do I join the classroom?",
        "Can you give me a practice tip?",
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
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            background: "#edf4f0",
            padding: "2px 5px",
            borderRadius: "4px",
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#0f4735",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function formatAssistantResponse(content: string): React.ReactNode {
  const blocks = content.split(/\n\n+/);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {blocks.map((block, idx) => {
        const lines = block.split("\n");

        if (lines.every((l) => l.trim().startsWith("- ") || l.trim().startsWith("* "))) {
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
              {lines.map((item, lIdx) => (
                <li key={lIdx} style={{ lineHeight: 1.45 }}>
                  {renderInlineMarkdown(item.replace(/^[-*]\s+/, ""))}
                </li>
              ))}
            </ul>
          );
        }

        if (lines.every((l) => /^\d+\.\s+/.test(l.trim()))) {
          return (
            <ol
              key={idx}
              style={{
                margin: 0,
                paddingLeft: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {lines.map((item, lIdx) => (
                <li key={lIdx} style={{ lineHeight: 1.45 }}>
                  {renderInlineMarkdown(item.replace(/^\d+\.\s+/, ""))}
                </li>
              ))}
            </ol>
          );
        }

        if (block.startsWith("> ")) {
          return (
            <blockquote
              key={idx}
              style={{
                margin: 0,
                padding: "6px 12px",
                borderLeft: "3px solid #135B45",
                background: "#f3f8f5",
                borderRadius: "0 6px 6px 0",
                fontSize: "12.5px",
                color: "#1e3a2b",
                fontStyle: "italic",
              }}
            >
              {renderInlineMarkdown(block.replace(/^>\s*/gm, ""))}
            </blockquote>
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

  const recent = eligible.slice(-6);
  const older = eligible.slice(0, -6);

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

function formatShortDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function getStatusPill(status: string) {
  switch (status) {
    case "resolved":
      return { label: "Resolved", bg: "#dcfce7", color: "#166534", border: "#bbf7d0" };
    case "in_progress":
      return { label: "In Progress", bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" };
    default:
      return { label: "Under Review", bg: "#fef3c7", color: "#92400e", border: "#fde68a" };
  }
}

function getUrgencyPill(urgency: string) {
  switch (urgency) {
    case "urgent":
      return { label: "Urgent", bg: "#fee2e2", color: "#991b1b" };
    case "high":
      return { label: "High", bg: "#fef3c7", color: "#92400e" };
    default:
      return { label: "Normal", bg: "#f1f5f9", color: "#475569" };
  }
}

export default function PortalAiChatBubble({
  profile,
  avatarUrl,
}: {
  profile: Profile | null;
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"ai" | "complaints">("ai");

  // AI Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorNotice, setErrorNotice] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Complaints & Support State
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintsError, setComplaintsError] = useState("");
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [showCreateComplaint, setShowCreateComplaint] = useState(false);

  // New Complaint Form
  const [createCategory, setCreateCategory] = useState<ComplaintCategory>("lesson_quality");
  const [createUrgency, setCreateUrgency] = useState<ComplaintUrgency>("normal");
  const [createSubject, setCreateSubject] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [createStudentName, setCreateStudentName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  // Thread Reply State
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState("");
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Dragging state for launcher button & chat dialog
  const [buttonPos, setButtonPos] = useState<{ x: number; y: number } | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // Launcher button drag logic
  const handleButtonPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
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

  const handleButtonPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragStartRef.current.moved = true;
    }
    const newX = Math.max(
      12,
      Math.min(window.innerWidth - 150, dragStartRef.current.origX + deltaX)
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
    if (!moved) {
      openChatAtSafeLocation();
    }
  };

  const openChatAtSafeLocation = () => {
    if (buttonPos) {
      const panelWidth = Math.min(410, window.innerWidth - 24);
      const panelHeight = Math.min(570, window.innerHeight - 36);

      let targetX = buttonPos.x + 130 - panelWidth;
      let targetY = buttonPos.y - panelHeight + 40;

      if (targetY < 16) targetY = buttonPos.y;

      targetX = Math.max(12, Math.min(window.innerWidth - panelWidth - 12, targetX));
      targetY = Math.max(12, Math.min(window.innerHeight - panelHeight - 12, targetY));

      setPanelPos({ x: targetX, y: targetY });
    }
    setOpen(true);
  };

  // Chat panel header drag logic
  const handlePanelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const panel = e.currentTarget.closest('[role="dialog"]') as HTMLElement | null;
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
      Math.min(window.innerWidth - 420, dragStartRef.current.origX + deltaX)
    );
    const newY = Math.max(
      10,
      Math.min(window.innerHeight - 580, dragStartRef.current.origY + deltaY)
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

  // Load isolated chat history per user
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
      // ignore
    }

    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Hi ${
          profile.name.split(" ")[0]
        }! 👋 I'm your ProsperWork Music Academy assistant. I can answer questions about your lessons, schedules, billing, or help you raise an official complaint to academy leadership. How can I help you today?`,
      },
    ]);
  }, [profile?.id, storageKey]);

  // Sync AI messages to localStorage
  useEffect(() => {
    if (!profile || messages.length === 0) return;
    if (activeUserIdRef.current !== profile.id) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, profile, storageKey]);

  // Fetch complaints
  const loadComplaints = useCallback(async () => {
    if (!profile) return;
    setComplaintsLoading(true);
    setComplaintsError("");
    try {
      const res = await fetch("/api/complaints", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load complaints.");
      setComplaints(data.complaints || []);
    } catch (err) {
      setComplaintsError(
        err instanceof Error ? err.message : "Could not load support tickets."
      );
    } finally {
      setComplaintsLoading(false);
    }
  }, [profile]);

  // Load complaints on initial open or when tab changes to complaints
  useEffect(() => {
    if (open && activeTab === "complaints") {
      void loadComplaints();
    }
  }, [open, activeTab, loadComplaints]);

  // Listen for global open event
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{
        mode?: "ai" | "complaints";
        complaintId?: string;
      }>;
      setOpen(true);
      if (ce.detail?.mode) setActiveTab(ce.detail.mode);
      if (ce.detail?.complaintId) {
        setSelectedComplaintId(ce.detail.complaintId);
        setShowCreateComplaint(false);
      }
    };
    window.addEventListener("open-academy-chat", handler);
    return () => window.removeEventListener("open-academy-chat", handler);
  }, []);

  const clearChatHistory = () => {
    if (!profile) return;
    const defaultWelcome: ChatMessage = {
      id: "welcome",
      role: "assistant",
      content: `Hi ${
        profile.name.split(" ")[0]
      }! 👋 I'm your ProsperWork Music Academy assistant. I can answer questions about your lessons, schedules, billing, or help you raise an official complaint to academy leadership. How can I help you today?`,
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
    if (activeTab === "ai") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, busy, activeTab]);

  useEffect(() => {
    if (activeTab === "complaints" && selectedComplaintId) {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedComplaintId, complaints, activeTab]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
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

      try {
        const payloadHistory = optimizeChatHistory([...messages, userMsg]);

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: payloadHistory,
          }),
        });

        if (res.status === 429) {
          throw new Error("You're asking questions too quickly. Please wait a moment.");
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "The AI assistant is temporarily unavailable.");
        }

        const data = await res.json();
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

  const handleSubmitAi = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  // Create complaint handler
  const handleCreateComplaint = async (e: FormEvent) => {
    e.preventDefault();
    if (!createSubject.trim() || createMessage.trim().length < 10) {
      setCreateError("Please provide a subject and at least 10 characters describing the issue.");
      return;
    }

    setCreateBusy(true);
    setCreateError("");
    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          category: createCategory,
          urgency: createUrgency,
          subject: createSubject.trim(),
          message: createMessage.trim(),
          studentName: createStudentName.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not submit complaint.");
      }

      if (data.complaint) {
        setComplaints((prev) => [data.complaint, ...prev]);
        setSelectedComplaintId(data.complaint.id);
      }
      setShowCreateComplaint(false);
      setCreateSubject("");
      setCreateMessage("");
      setCreateStudentName("");
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to submit inquiry."
      );
    } finally {
      setCreateBusy(false);
    }
  };

  // Reply handler
  const handleSendComplaintReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedComplaintId || !replyText.trim()) return;

    setReplyBusy(true);
    setReplyError("");
    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          complaintId: selectedComplaintId,
          message: replyText.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to send reply.");
      }

      const newMessage = data.messageRecord as ComplaintMessageRecord;
      const nextStatus = data.status;

      setComplaints((current) =>
        current.map((c) => {
          if (c.id === selectedComplaintId) {
            return {
              ...c,
              status: nextStatus || c.status,
              messages: [...(c.messages || []), newMessage],
            };
          }
          return c;
        })
      );
      setReplyText("");
    } catch (err) {
      setReplyError(
        err instanceof Error ? err.message : "Failed to post reply."
      );
    } finally {
      setReplyBusy(false);
    }
  };

  if (!profile) return null;

  const suggestions = roleSuggestionChips(profile.role);
  const selectedComplaint = complaints.find((c) => c.id === selectedComplaintId);
  const activeTicketCount = complaints.filter((c) => c.status !== "resolved").length;

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
          aria-label="Open ProsperWork AI & Support Hub (Drag to reposition)"
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
          <span style={{ pointerEvents: "none" }}>AI &amp; Support</span>
          {activeTicketCount > 0 && (
            <span
              style={{
                background: "#fef3c7",
                color: "#92400e",
                fontSize: "11px",
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: "10px",
              }}
            >
              {activeTicketCount}
            </span>
          )}
        </button>
      )}

      {/* Floating Chat Panel - Header is draggable */}
      {open && (
        <div
          role="dialog"
          aria-label="ProsperWork AI & Support Hub"
          style={{
            position: "fixed",
            left: panelPos ? `${panelPos.x}px` : "auto",
            top: panelPos ? `${panelPos.y}px` : "auto",
            bottom: panelPos ? "auto" : "24px",
            right: panelPos ? "auto" : "24px",
            width: "410px",
            maxWidth: "calc(100vw - 28px)",
            height: "570px",
            maxHeight: "calc(100vh - 40px)",
            zIndex: 9995,
            background: "#ffffff",
            borderRadius: "16px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.22)",
            border: "1px solid #dce8df",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: panelPos ? "none" : "fadeIn 0.2s ease",
          }}
        >
          {/* Header (Draggable) */}
          <div
            onPointerDown={handlePanelPointerDown}
            onPointerMove={handlePanelPointerMove}
            onPointerUp={handlePanelPointerUp}
            onPointerCancel={handlePanelPointerUp}
            title="Drag header to reposition"
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
                alt="ProsperWork Logo"
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
                  Academy Assistant &amp; Support
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
              {activeTab === "ai" && messages.length > 1 && (
                <button
                  type="button"
                  onClick={clearChatHistory}
                  title="Clear AI conversation history"
                  aria-label="Clear AI conversation history"
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
                  }}
                >
                  <RotateCcw size={12} />
                  <span>Clear</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Assistant"
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

          {/* Mode Switcher Segmented Tabs */}
          <div
            style={{
              display: "flex",
              background: "#f3f7f5",
              borderBottom: "1px solid #dce8df",
              padding: "4px",
              gap: "4px",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("ai")}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "ai" ? "#ffffff" : "transparent",
                color: activeTab === "ai" ? "#135b45" : "#5a6e64",
                fontWeight: activeTab === "ai" ? 700 : 500,
                fontSize: "12px",
                boxShadow:
                  activeTab === "ai" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Sparkles
                size={13}
                color={activeTab === "ai" ? "#135b45" : "#5a6e64"}
              />
              <span>Ask AI Assistant</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("complaints");
                if (complaints.length === 0) void loadComplaints();
              }}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "none",
                background:
                  activeTab === "complaints" ? "#ffffff" : "transparent",
                color: activeTab === "complaints" ? "#135b45" : "#5a6e64",
                fontWeight: activeTab === "complaints" ? 700 : 500,
                fontSize: "12px",
                boxShadow:
                  activeTab === "complaints"
                    ? "0 1px 3px rgba(0,0,0,0.08)"
                    : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <MessageSquare
                size={13}
                color={activeTab === "complaints" ? "#135b45" : "#5a6e64"}
              />
              <span>Complaints &amp; Support</span>
              {activeTicketCount > 0 && (
                <span
                  style={{
                    background: "#135b45",
                    color: "#ffffff",
                    fontSize: "10px",
                    padding: "1px 5px",
                    borderRadius: "10px",
                    fontWeight: 700,
                  }}
                >
                  {activeTicketCount}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: AI ASSISTANT CHAT */}
          {activeTab === "ai" && (
            <>
              {/* Messages Area */}
              <div
                style={{
                  flex: 1,
                  padding: "14px 16px",
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
                          border: "1px solid #dce8df",
                          objectFit: "contain",
                          flexShrink: 0,
                          marginTop: "2px",
                        }}
                      />
                    )}

                    <div
                      style={{
                        maxWidth: "82%",
                        padding: "10px 14px",
                        borderRadius:
                          msg.role === "user"
                            ? "14px 14px 2px 14px"
                            : "14px 14px 14px 2px",
                        background:
                          msg.role === "user" ? "#135B45" : "#ffffff",
                        color: msg.role === "user" ? "#ffffff" : "#1f2937",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                        border:
                          msg.role === "user" ? "none" : "1px solid #e5e7eb",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.role === "assistant"
                        ? formatAssistantResponse(msg.content)
                        : msg.content}

                      {msg.role === "assistant" &&
                        /complaint|grievance|complaints & support|raise an inquiry|official ticket|inquiry ticket/i.test(
                          msg.content
                        ) && (
                          <div
                            style={{
                              marginTop: "10px",
                              paddingTop: "8px",
                              borderTop: "1px dashed #dce8df",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("complaints");
                                if (profile.role === "parent") {
                                  setShowCreateComplaint(true);
                                }
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                background: "#135B45",
                                color: "#ffffff",
                                padding: "6px 12px",
                                borderRadius: "8px",
                                border: "none",
                                fontSize: "11.5px",
                                fontWeight: 600,
                                cursor: "pointer",
                                boxShadow: "0 2px 4px rgba(19,91,69,0.18)",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <MessageSquare size={13} />
                              <span>Open Complaints &amp; Support &rarr;</span>
                            </button>
                          </div>
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
                      <LoaderCircle size={13} className="spinning" /> Thinking…
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

              {/* In-AI Escalation Banner */}
              <div
                style={{
                  padding: "6px 12px",
                  background: "#edf6f1",
                  borderTop: "1px solid #dce8df",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "11px",
                }}
              >
                <span style={{ color: "#14532d" }}>
                  Have an unresolved issue or grievance?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("complaints");
                    setShowCreateComplaint(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#135b45",
                    fontWeight: 700,
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Raise Complaint &rarr;
                </button>
              </div>

              {/* Quick Suggestions */}
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
                    style={{
                      fontSize: "10px",
                      color: "#6b7280",
                      fontWeight: 600,
                    }}
                  >
                    Suggested:
                  </span>
                  <div
                    style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}
                  >
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

              {/* AI Input Form */}
              <form
                onSubmit={handleSubmitAi}
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
                  placeholder="Ask a question or request guidance…"
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
            </>
          )}

          {/* TAB 2: COMPLAINTS & HUMAN SUPPORT */}
          {activeTab === "complaints" && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                background: "#fafcfb",
              }}
            >
              {/* SUBVIEW A: NEW COMPLAINT FORM */}
              {showCreateComplaint ? (
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderBottom: "1px solid #e2ece5",
                      paddingBottom: "8px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowCreateComplaint(false)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#135b45",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      <ArrowLeft size={14} /> Back to tickets
                    </button>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#0a2e22",
                      }}
                    >
                      Raise a Ticket
                    </span>
                  </div>

                  {createError && (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        color: "#991b1b",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <AlertCircle size={14} />
                      <span>{createError}</span>
                    </div>
                  )}

                  <form
                    onSubmit={handleCreateComplaint}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#374a40",
                          marginBottom: "4px",
                        }}
                      >
                        Category *
                      </label>
                      <select
                        value={createCategory}
                        onChange={(e) =>
                          setCreateCategory(e.target.value as ComplaintCategory)
                        }
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "12.5px",
                          background: "#ffffff",
                        }}
                      >
                        {COMPLAINT_CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#374a40",
                            marginBottom: "4px",
                          }}
                        >
                          Urgency *
                        </label>
                        <select
                          value={createUrgency}
                          onChange={(e) =>
                            setCreateUrgency(e.target.value as ComplaintUrgency)
                          }
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            fontSize: "12.5px",
                            background: "#ffffff",
                          }}
                        >
                          <option value="normal">Normal</option>
                          <option value="high">High Priority</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>

                      <div style={{ flex: 1 }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#374a40",
                            marginBottom: "4px",
                          }}
                        >
                          Student Name (optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. David"
                          value={createStudentName}
                          onChange={(e) => setCreateStudentName(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            fontSize: "12.5px",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#374a40",
                          marginBottom: "4px",
                        }}
                      >
                        Subject / Summary *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Teacher missed scheduled lesson"
                        value={createSubject}
                        onChange={(e) => setCreateSubject(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "12.5px",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#374a40",
                          marginBottom: "4px",
                        }}
                      >
                        Detailed Statement *
                      </label>
                      <textarea
                        required
                        rows={4}
                        placeholder="Please describe what occurred so administration and quality control can investigate and take swift action…"
                        value={createMessage}
                        onChange={(e) => setCreateMessage(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "12.5px",
                          lineHeight: "1.5",
                          resize: "vertical",
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={
                        createBusy ||
                        !createSubject.trim() ||
                        createMessage.trim().length < 10
                      }
                      style={{
                        marginTop: "6px",
                        padding: "10px",
                        borderRadius: "8px",
                        background: "#135b45",
                        color: "#ffffff",
                        border: "none",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: createBusy ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      {createBusy ? (
                        <>
                          <LoaderCircle size={14} className="spinning" />
                          <span>Submitting ticket…</span>
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          <span>Submit Official Complaint</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              ) : selectedComplaint ? (
                /* SUBVIEW B: CHAT THREAD ON SELECTED COMPLAINT */
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  {/* Thread Top Navigation */}
                  <div
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid #e2ece5",
                      background: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedComplaintId(null)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#135b45",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      <ArrowLeft size={14} /> Back
                    </button>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#135b45",
                        }}
                      >
                        #{selectedComplaint.ticket_number}
                      </span>
                      {(() => {
                        const s = getStatusPill(selectedComplaint.status);
                        return (
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "10px",
                              background: s.bg,
                              color: s.color,
                              border: `1px solid ${s.border}`,
                              fontWeight: 700,
                            }}
                          >
                            {s.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Thread Header Subject */}
                  <div
                    style={{
                      padding: "8px 14px",
                      background: "#f7faf8",
                      borderBottom: "1px solid #e5ede7",
                      fontSize: "12px",
                      color: "#14532d",
                      fontWeight: 600,
                    }}
                  >
                    {selectedComplaint.subject}
                  </div>

                  {/* Message Bubbles Container */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    {/* Initial Parent Grievance Message */}
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#ffffff",
                        border: "1px solid #dce8df",
                        borderLeft: "4px solid #135b45",
                        fontSize: "12.5px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <strong style={{ color: "#0a2e22", fontSize: "12px" }}>
                          {selectedComplaint.parent_name} (Initial Inquiry)
                        </strong>
                        <span style={{ fontSize: "10px", color: "#6b7280" }}>
                          {formatShortDate(selectedComplaint.created_at)}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.5,
                          color: "#1e2924",
                        }}
                      >
                        {selectedComplaint.message}
                      </p>
                    </div>

                    {/* Replies */}
                    {selectedComplaint.messages &&
                      selectedComplaint.messages.map((m) => {
                        const isStaff = m.sender_role !== "parent";
                        return (
                          <div
                            key={m.id}
                            style={{
                              padding: "12px",
                              borderRadius: "10px",
                              background: isStaff ? "#edf8f2" : "#ffffff",
                              border: isStaff
                                ? "1px solid #bbf7d0"
                                : "1px solid #dce8df",
                              borderLeft: isStaff
                                ? "4px solid #16a34a"
                                : "4px solid #d97706",
                              marginLeft: isStaff ? "16px" : "0",
                              marginRight: isStaff ? "0" : "16px",
                              fontSize: "12.5px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "4px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <strong
                                  style={{
                                    color: isStaff ? "#14532d" : "#0a2e22",
                                    fontSize: "12px",
                                  }}
                                >
                                  {m.sender_name}
                                </strong>
                                <span
                                  style={{
                                    fontSize: "9.5px",
                                    padding: "1px 6px",
                                    borderRadius: "8px",
                                    background: isStaff
                                      ? "#dcfce7"
                                      : "#fef3c7",
                                    color: isStaff ? "#166534" : "#92400e",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {isStaff ? "Academy Staff" : "Parent"}
                                </span>
                              </div>
                              <span
                                style={{ fontSize: "10px", color: "#6b7280" }}
                              >
                                {formatShortDate(m.created_at)}
                              </span>
                            </div>
                            <p
                              style={{
                                margin: 0,
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.5,
                                color: isStaff ? "#14532d" : "#1e2924",
                              }}
                            >
                              {m.message}
                            </p>
                          </div>
                        );
                      })}

                    {/* Official Resolution Banner if resolved */}
                    {selectedComplaint.resolution_notes && (
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "10px",
                          background:
                            selectedComplaint.status === "resolved"
                              ? "#f0fdf4"
                              : "#eff6ff",
                          border: `1px solid ${
                            selectedComplaint.status === "resolved"
                              ? "#bbf7d0"
                              : "#bfdbfe"
                          }`,
                          fontSize: "12px",
                        }}
                      >
                        <strong
                          style={{
                            color:
                              selectedComplaint.status === "resolved"
                                ? "#166534"
                                : "#1e40af",
                            display: "block",
                            marginBottom: "2px",
                          }}
                        >
                          {selectedComplaint.status === "resolved"
                            ? "✓ Official Resolution"
                            : "⚙ Academy Update"}
                        </strong>
                        <p
                          style={{
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.5,
                            color: "#1e2924",
                          }}
                        >
                          {selectedComplaint.resolution_notes}
                        </p>
                        {selectedComplaint.resolved_by_name && (
                          <small
                            style={{
                              display: "block",
                              marginTop: "4px",
                              color: "#6b7280",
                              fontSize: "10px",
                            }}
                          >
                            Logged by {selectedComplaint.resolved_by_name}
                          </small>
                        )}
                      </div>
                    )}

                    <div ref={threadEndRef} />
                  </div>

                  {/* Reply Input Form */}
                  <form
                    onSubmit={handleSendComplaintReply}
                    style={{
                      padding: "10px 12px",
                      background: "#ffffff",
                      borderTop: "1px solid #e5ede7",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type reply to academy leadership…"
                      disabled={replyBusy}
                      style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: "20px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12.5px",
                        outline: "none",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={replyBusy || !replyText.trim()}
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background:
                          replyText.trim() && !replyBusy
                            ? "#135B45"
                            : "#e5e7eb",
                        color:
                          replyText.trim() && !replyBusy
                            ? "#ffffff"
                            : "#9ca3af",
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor:
                          replyText.trim() && !replyBusy
                            ? "pointer"
                            : "default",
                      }}
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              ) : (
                /* SUBVIEW C: TICKET LIST */
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid #e2ece5",
                      background: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <strong style={{ fontSize: "13px", color: "#0a2e22" }}>
                      Support &amp; Grievances
                    </strong>
                    <button
                      type="button"
                      onClick={() => setShowCreateComplaint(true)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "5px 10px",
                        borderRadius: "6px",
                        background: "#135b45",
                        color: "#ffffff",
                        border: "none",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <Plus size={13} />
                      <span>Raise Complaint</span>
                    </button>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {complaintsLoading && (
                      <div
                        style={{
                          padding: "24px",
                          textAlign: "center",
                          color: "#6b7280",
                          fontSize: "12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                      >
                        <LoaderCircle size={15} className="spinning" />
                        <span>Loading your tickets…</span>
                      </div>
                    )}

                    {complaintsError && (
                      <div
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          color: "#991b1b",
                          fontSize: "12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>{complaintsError}</span>
                        <button
                          type="button"
                          onClick={() => void loadComplaints()}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#991b1b",
                            fontWeight: 700,
                            cursor: "pointer",
                            textDecoration: "underline",
                            padding: 0,
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {!complaintsLoading && complaints.length === 0 && (
                      <div
                        style={{
                          padding: "36px 20px",
                          textAlign: "center",
                          color: "#6b7280",
                          fontSize: "12.5px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <MessageSquare size={28} color="#9ca3af" />
                        <strong style={{ color: "#374151", fontSize: "13px" }}>
                          No tickets logged
                        </strong>
                        <p style={{ margin: 0, lineHeight: 1.45 }}>
                          If you ever experience lesson quality issues, teacher
                          punctuality problems, or billing concerns, you can file a
                          complaint directly to school leadership.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowCreateComplaint(true)}
                          style={{
                            marginTop: "8px",
                            padding: "6px 14px",
                            borderRadius: "8px",
                            background: "#135b45",
                            color: "#ffffff",
                            border: "none",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          File Your First Ticket
                        </button>
                      </div>
                    )}

                    {complaints.map((c) => {
                      const s = getStatusPill(c.status);
                      const u = getUrgencyPill(c.urgency);
                      const replyCount = (c.messages?.length || 0);

                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelectedComplaintId(c.id)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "10px",
                            background: "#ffffff",
                            border: "1px solid #dce8df",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            gap: "5px",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "#135b45";
                            e.currentTarget.style.transform = "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "#dce8df";
                            e.currentTarget.style.transform = "none";
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#135b45",
                              }}
                            >
                              #{c.ticket_number}
                            </span>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <span
                                style={{
                                  fontSize: "9.5px",
                                  padding: "2px 6px",
                                  borderRadius: "8px",
                                  background: u.bg,
                                  color: u.color,
                                  fontWeight: 700,
                                }}
                              >
                                {u.label}
                              </span>
                              <span
                                style={{
                                  fontSize: "9.5px",
                                  padding: "2px 6px",
                                  borderRadius: "8px",
                                  background: s.bg,
                                  color: s.color,
                                  border: `1px solid ${s.border}`,
                                  fontWeight: 700,
                                }}
                              >
                                {s.label}
                              </span>
                            </div>
                          </div>

                          <strong
                            style={{
                              fontSize: "13px",
                              color: "#0a2e22",
                              lineHeight: 1.3,
                            }}
                          >
                            {c.subject}
                          </strong>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: "11px",
                              color: "#6b7280",
                              marginTop: "2px",
                            }}
                          >
                            <span>{categoryLabel(c.category)}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                              <MessageSquare size={11} />
                              {replyCount > 0
                                ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
                                : "No replies yet"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
