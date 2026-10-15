"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import ProfileAvatar from "../_components/ProfileAvatar";
import { Empty, Pill, SectionTitle, niceDate } from "../_lib/portal-formatters";
import {
  COMPLAINT_CATEGORIES,
  categoryLabel,
  type ComplaintRecord,
  type ComplaintCategory,
  type ComplaintStatus,
} from "@/lib/academy/complaints";

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "in_progress" | "resolved" | "urgent"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Master-Detail selection & Status state
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(
    null
  );
  const [statusBusy, setStatusBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    role?: string;
    id?: string;
    name?: string;
  } | null>(null);

  // Conversation Thread & Reply state
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState("");

  const loadComplaints = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const url = isRefresh ? "/api/complaints?sync=true" : "/api/complaints";
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to load complaints.");
      }
      const list = (data.complaints || []) as ComplaintRecord[];
      setComplaints(list);
      if (data.currentRole) {
        setCurrentUser({
          role: data.currentRole,
          id: data.currentUserId,
          name: data.currentName,
        });
      }
      // Auto-select first ticket if none selected
      setSelectedComplaintId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load complaints."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadComplaints();
  }, [loadComplaints]);

  // Derived metrics
  const stats = useMemo(() => {
    const total = complaints.length;
    const open = complaints.filter((c) => c.status === "open").length;
    const inProgress = complaints.filter(
      (c) => c.status === "in_progress"
    ).length;
    const resolved = complaints.filter((c) => c.status === "resolved").length;
    const urgent = complaints.filter(
      (c) => c.urgency === "urgent" && c.status !== "resolved"
    ).length;
    return { total, open, inProgress, resolved, urgent };
  }, [complaints]);

  // Filtered complaints list
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (statusFilter === "open" && c.status !== "open") return false;
      if (statusFilter === "in_progress" && c.status !== "in_progress")
        return false;
      if (statusFilter === "resolved" && c.status !== "resolved") return false;
      if (
        statusFilter === "urgent" &&
        (c.urgency !== "urgent" || c.status === "resolved")
      )
        return false;

      if (categoryFilter !== "all" && c.category !== categoryFilter)
        return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const haystack = [
          c.ticket_number,
          c.parent_name,
          c.parent_email,
          c.student_name || "",
          c.subject,
          c.message,
          categoryLabel(c.category),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      }
      return true;
    });
  }, [complaints, statusFilter, categoryFilter, searchQuery]);

  const selectedComplaint = useMemo(() => {
    if (!selectedComplaintId) return filteredComplaints[0] || null;
    return (
      filteredComplaints.find((c) => c.id === selectedComplaintId) ||
      complaints.find((c) => c.id === selectedComplaintId) ||
      filteredComplaints[0] ||
      null
    );
  }, [selectedComplaintId, filteredComplaints, complaints]);

  // When selected complaint changes, reset reply box
  useEffect(() => {
    if (selectedComplaint) {
      setReplyText("");
      setReplyError("");
    }
  }, [selectedComplaint?.id]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 4500);
  };

  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint || !replyText.trim()) return;

    setReplyBusy(true);
    setReplyError("");

    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          complaintId: selectedComplaint.id,
          message: replyText.trim(),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to post reply.");
      }

      const newMessage = result.messageRecord;
      const nextStatus = result.status;

      setComplaints((current) =>
        current.map((c) => {
          if (c.id === selectedComplaint.id) {
            const updatedMessages = [...(c.messages || []), newMessage];
            return {
              ...c,
              status: nextStatus || c.status,
              messages: updatedMessages,
            };
          }
          return c;
        })
      );

      setReplyText("");
      showToast("Reply sent.");
    } catch (err) {
      setReplyError(
        err instanceof Error ? err.message : "Failed to post reply."
      );
    } finally {
      setReplyBusy(false);
    }
  };

  const handleUpdateStatus = async (newStatus: ComplaintStatus) => {
    if (
      !selectedComplaint ||
      selectedComplaint.status === newStatus ||
      statusBusy
    )
      return;

    setStatusBusy(true);
    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          complaintId: selectedComplaint.id,
          status: newStatus,
          notifyParent: newStatus === "resolved",
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to update ticket status.");
      }

      const updated = result.complaint as ComplaintRecord;
      setComplaints((current) =>
        current.map((c) => (c.id === updated.id ? updated : c))
      );

      const statusLabels: Record<ComplaintStatus, string> = {
        open: "Open",
        in_progress: "Under Investigation",
        resolved: "Resolved",
      };

      showToast(
        newStatus === "resolved"
          ? `Ticket #${updated.ticket_number} marked as resolved.`
          : `Ticket #${updated.ticket_number} status set to ${
              statusLabels[updated.status] || updated.status
            }.`
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to update ticket status."
      );
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <div className="page-wrap">
      {/* Page Heading matching all other workspaces */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">Quality &amp; Operations</span>
          <h1>Complaints &amp; Support</h1>
          <p className="page-subtitle">
            Review, investigate, and resolve grievances raised by academy
            parents and families.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => void loadComplaints(true)}
            disabled={loading || refreshing}
            aria-label="Refresh tickets"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "spinning" : undefined}
            />
            {refreshing ? "Syncing emails…" : "Sync emails & refresh"}
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div role="alert" className="form-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Stat Cards - using exact base.css .stat-grid layout */}
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            Total Inquiries{" "}
            <span className="stat-icon">
              <MessageSquare size={15} />
            </span>
          </div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-foot">Logged across academy families</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            Awaiting Review{" "}
            <span
              className="stat-icon"
              style={{ background: "#fef3c7", color: "#d97706" }}
            >
              <Clock size={15} />
            </span>
          </div>
          <div
            className="stat-value"
            style={{ color: stats.open > 0 ? "#b45309" : undefined }}
          >
            {stats.open}
          </div>
          <div className="stat-foot">
            {stats.urgent} urgent priority ticket{stats.urgent === 1 ? "" : "s"}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            Under Investigation{" "}
            <span
              className="stat-icon"
              style={{ background: "#e0f2fe", color: "#0284c7" }}
            >
              <Search size={15} />
            </span>
          </div>
          <div
            className="stat-value"
            style={{ color: stats.inProgress > 0 ? "#0284c7" : undefined }}
          >
            {stats.inProgress}
          </div>
          <div className="stat-foot">Staff follow-up in progress</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            Resolved{" "}
            <span
              className="stat-icon"
              style={{ background: "#d1fae5", color: "#059669" }}
            >
              <CheckCircle2 size={15} />
            </span>
          </div>
          <div className="stat-value" style={{ color: "#059669" }}>
            {stats.resolved}
          </div>
          <div className="stat-foot">Issues concluded and confirmed</div>
        </div>
      </div>

      {/* Toolbar matching FamiliesView and LeadsView */}
      <div className="toolbar">
        <div className="search">
          <Search size={14} />
          <input
            type="search"
            placeholder="Search by ticket #, parent, student or subject…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="select-mini"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="all">All Categories</option>
          {COMPLAINT_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>

        <select
          className="select-mini"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as typeof statusFilter)
          }
          aria-label="Filter by status"
        >
          <option value="all">All Statuses ({stats.total})</option>
          <option value="open">Awaiting Review ({stats.open})</option>
          <option value="in_progress">
            Under Investigation ({stats.inProgress})
          </option>
          <option value="resolved">Resolved ({stats.resolved})</option>
          {stats.urgent > 0 && (
            <option value="urgent">Urgent Priority ({stats.urgent})</option>
          )}
        </select>
      </div>

      {/* Master-Detail Layout - exactly matching FamiliesView */}
      <div
        className="grid-main"
        style={{
          gridTemplateColumns: "minmax(300px, 380px) 1fr",
          gap: "18px",
          alignItems: "start",
        }}
      >
        {/* Left: Ticket Roster */}
        <section className="card section-card">
          <SectionTitle
            title="Grievance Tickets"
            detail={`${filteredComplaints.length} tickets matching filters`}
          />

          {filteredComplaints.length > 0 ? (
            filteredComplaints.map((c) => {
              const isSelected = selectedComplaint?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`student-select ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedComplaintId(c.id)}
                >
                  <ProfileAvatar name={c.parent_name} size={32} />
                  <span className="student-select-copy">
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <strong>{c.parent_name}</strong>
                      <small style={{ color: "var(--muted)" }}>
                        #{c.ticket_number}
                      </small>
                    </span>
                    <small
                      style={{
                        color: "var(--pine-950)",
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.subject}
                    </small>
                    <small>
                      {c.student_name ? `${c.student_name} · ` : ""}
                      {categoryLabel(c.category)} · {niceDate(c.created_at)}
                    </small>
                  </span>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      alignItems: "flex-end",
                    }}
                  >
                    <Pill
                      tone={
                        c.status === "resolved"
                          ? "green"
                          : c.status === "in_progress"
                          ? "blue"
                          : "amber"
                      }
                    >
                      {c.status === "in_progress"
                        ? "In Review"
                        : c.status === "resolved"
                        ? "Resolved"
                        : "Open"}
                    </Pill>
                    {c.urgency === "urgent" && (
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          color: "#dc2626",
                          textTransform: "uppercase",
                        }}
                      >
                        Urgent
                      </span>
                    )}
                  </div>
                  <ChevronRight size={14} color="#829087" />
                </button>
              );
            })
          ) : (
            <Empty
              title="No tickets found"
              detail={
                searchQuery ||
                categoryFilter !== "all" ||
                statusFilter !== "all"
                  ? "No tickets match the selected filters."
                  : "No parent complaints or inquiries recorded."
              }
            />
          )}
        </section>

        {/* Right: Selected Ticket Detail & Action Desk */}
        {selectedComplaint ? (
          <div className="stack">
            {/* Ticket Header & Context Card */}
            <section className="card">
              <div className="profile-head">
                <ProfileAvatar name={selectedComplaint.parent_name} size={49} />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                      marginBottom: "4px",
                    }}
                  >
                    <h3 style={{ margin: 0 }}>
                      {selectedComplaint.parent_name}
                    </h3>
                    <div
                      style={{ display: "inline-flex", alignItems: "center" }}
                    >
                      <select
                        aria-label="Ticket Status"
                        value={selectedComplaint.status}
                        onChange={(e) =>
                          handleUpdateStatus(e.target.value as ComplaintStatus)
                        }
                        disabled={statusBusy}
                        style={{
                          fontWeight: 700,
                          fontSize: "11px",
                          borderRadius: "14px",
                          padding: "3px 8px",
                          border: "1px solid var(--line)",
                          backgroundColor:
                            selectedComplaint.status === "resolved"
                              ? "#ecfdf5"
                              : selectedComplaint.status === "in_progress"
                              ? "#eff6ff"
                              : "#fffbeb",
                          color:
                            selectedComplaint.status === "resolved"
                              ? "#065f46"
                              : selectedComplaint.status === "in_progress"
                              ? "#1e40af"
                              : "#92400e",
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        <option value="open">Status: Open</option>
                        <option value="in_progress">
                          Status: Under Investigation
                        </option>
                        <option value="resolved">Status: Resolved</option>
                      </select>
                    </div>
                    <Pill
                      tone={
                        selectedComplaint.urgency === "urgent"
                          ? "red"
                          : selectedComplaint.urgency === "high"
                          ? "amber"
                          : "blue"
                      }
                    >
                      {selectedComplaint.urgency.toUpperCase()} Urgency
                    </Pill>
                  </div>
                  <span className="page-subtitle">
                    Ticket #{selectedComplaint.ticket_number} · Logged{" "}
                    {niceDate(selectedComplaint.created_at)}
                  </span>
                </div>
              </div>

              <div className="profile-grid">
                <div className="profile-field">
                  <span>Category</span>
                  <strong>{categoryLabel(selectedComplaint.category)}</strong>
                </div>
                <div className="profile-field">
                  <span>Student / Learner</span>
                  <strong>
                    {selectedComplaint.student_name || "General Family Concern"}
                  </strong>
                </div>
                <div className="profile-field">
                  <span>Parent Email</span>
                  <strong style={{ wordBreak: "break-all" }}>
                    {selectedComplaint.parent_email}
                  </strong>
                </div>
              </div>

              <div style={{ padding: "18px 20px 22px" }}>
                <div>
                  <span className="eyebrow">Subject</span>
                  <h2
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      margin: "4px 0 0",
                      color: "var(--pine-950)",
                    }}
                  >
                    {selectedComplaint.subject}
                  </h2>
                </div>
              </div>
            </section>

            {/* Live Chat Discussion & Reply Thread Card */}
            <section className="card section-card">
              <SectionTitle
                title={`Discussion & Messages (${
                  (selectedComplaint.messages?.length || 0) + 1
                })`}
                detail="Real-time two-way communication between academy staff and the family."
              />

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  maxHeight: "520px",
                  overflowY: "auto",
                  padding: "16px",
                  backgroundColor: "#f9faf8",
                  borderRadius: "14px",
                  border: "1px solid var(--line)",
                  marginTop: "6px",
                }}
              >
                {/* Initial Parent Inquiry (First Chat Message) */}
                {(() => {
                  const isMe =
                    currentUser?.role === "parent" &&
                    selectedComplaint.parent_id === currentUser?.id;
                  return (
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "flex-start",
                        flexDirection: isMe ? "row-reverse" : "row",
                      }}
                    >
                      <ProfileAvatar
                        name={selectedComplaint.parent_name}
                        size={36}
                      />
                      <div
                        style={{
                          maxWidth: "82%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: isMe ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "4px",
                            flexDirection: isMe ? "row-reverse" : "row",
                          }}
                        >
                          <strong
                            style={{
                              fontSize: "12.5px",
                              color: "var(--pine-950)",
                            }}
                          >
                            {isMe ? "You" : selectedComplaint.parent_name}
                          </strong>
                          <Pill tone="amber">Parent (Inquiry)</Pill>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                            }}
                          >
                            {niceDate(selectedComplaint.created_at)}
                          </span>
                        </div>
                        <div
                          style={{
                            background: isMe ? "#135b45" : "#ffffff",
                            color: isMe ? "#ffffff" : "var(--ink)",
                            border: isMe
                              ? "1px solid #0f4b39"
                              : "1px solid #dce8df",
                            borderRadius: isMe
                              ? "16px 4px 16px 16px"
                              : "4px 16px 16px 16px",
                            padding: "12px 16px",
                            fontSize: "13.5px",
                            lineHeight: "1.6",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                          }}
                        >
                          {selectedComplaint.message}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* All Subsequent Chat Replies */}
                {selectedComplaint.messages &&
                selectedComplaint.messages.length > 0
                  ? selectedComplaint.messages.map((msg) => {
                      const isStaff = msg.sender_role !== "parent";
                      const isMe =
                        currentUser?.id && msg.sender_id === currentUser.id;
                      return (
                        <div
                          key={msg.id}
                          style={{
                            display: "flex",
                            gap: "12px",
                            alignItems: "flex-start",
                            flexDirection: isMe ? "row-reverse" : "row",
                          }}
                        >
                          <ProfileAvatar name={msg.sender_name} size={36} />
                          <div
                            style={{
                              maxWidth: "82%",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: isMe ? "flex-end" : "flex-start",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                marginBottom: "4px",
                                flexDirection: isMe ? "row-reverse" : "row",
                              }}
                            >
                              <strong
                                style={{
                                  fontSize: "12.5px",
                                  color: "var(--pine-950)",
                                }}
                              >
                                {isMe ? "You" : msg.sender_name}
                              </strong>
                              <Pill tone={isStaff ? "green" : "amber"}>
                                {isStaff ? "Academy Staff" : "Parent"}
                              </Pill>
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "var(--muted)",
                                }}
                              >
                                {niceDate(msg.created_at)}
                              </span>
                            </div>
                            <div
                              style={{
                                background: isMe
                                  ? "#135b45"
                                  : isStaff
                                  ? "#f0fdf4"
                                  : "#ffffff",
                                color: isMe
                                  ? "#ffffff"
                                  : isStaff
                                  ? "#14532d"
                                  : "var(--ink)",
                                border: isMe
                                  ? "1px solid #0f4b39"
                                  : isStaff
                                  ? "1px solid #bbf7d0"
                                  : "1px solid #dce8df",
                                borderRadius: isMe
                                  ? "16px 4px 16px 16px"
                                  : "4px 16px 16px 16px",
                                padding: "12px 16px",
                                fontSize: "13.5px",
                                lineHeight: "1.6",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                              }}
                            >
                              {msg.message}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  : null}
              </div>

              {/* Modern Chat Reply Input */}
              {currentUser?.role === "parent" &&
              selectedComplaint.status === "resolved" ? (
                <div
                  style={{
                    padding: "14px 18px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    color: "#166534",
                    fontSize: "13px",
                    fontWeight: 500,
                    marginTop: "16px",
                  }}
                >
                  <Lock size={16} style={{ flexShrink: 0, color: "#16a34a" }} />
                  <span>
                    This ticket has been marked as resolved and closed for new
                    replies.
                  </span>
                </div>
              ) : (
                <form
                  onSubmit={handleSendReply}
                  style={{
                    borderTop: "1px solid var(--line)",
                    paddingTop: "16px",
                    marginTop: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "flex-end",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <textarea
                        id="complaint-reply-input"
                        rows={2}
                        placeholder={`Write a reply to ${
                          currentUser?.role === "parent"
                            ? "Academy Staff"
                            : selectedComplaint.parent_name
                        }…`}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (replyText.trim() && !replyBusy) {
                              void handleSendReply(e);
                            }
                          }
                        }}
                        style={{
                          width: "100%",
                          borderRadius: "12px",
                          padding: "10px 14px",
                          fontSize: "13px",
                          lineHeight: "1.5",
                          border: "1px solid var(--line)",
                          resize: "none",
                          fontFamily: "inherit",
                        }}
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={replyBusy || !replyText.trim()}
                      style={{
                        height: "44px",
                        padding: "0 18px",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Send size={15} />
                      <span>{replyBusy ? "Sending…" : "Send"}</span>
                    </button>
                  </div>

                  {replyError && (
                    <p
                      role="alert"
                      className="form-error"
                      style={{ marginTop: "8px" }}
                    >
                      {replyError}
                    </p>
                  )}
                </form>
              )}
            </section>
          </div>
        ) : (
          <section className="card section-card">
            <Empty
              title="Select a ticket"
              detail="Choose a complaint from the roster on the left to inspect student details, read the parent's message, and take resolution action."
            />
          </section>
        )}
      </div>

      {/* Floating Notification Toast matching portal standard */}
      {toast && (
        <div role="status" aria-live="polite" className="toast">
          {toast}
        </div>
      )}
    </div>
  );
}
