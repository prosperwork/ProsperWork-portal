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

  // Master-Detail selection & Resolution state
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(
    null
  );
  const [actionStatus, setActionStatus] = useState<ComplaintStatus>("resolved");
  const [actionNotes, setActionNotes] = useState("");
  const [notifyParent, setNotifyParent] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  // Conversation Thread & Reply state
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState("");

  const loadComplaints = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/complaints", {
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

  // When selected complaint changes, prepopulate resolution form
  useEffect(() => {
    if (selectedComplaint) {
      setActionStatus(
        selectedComplaint.status === "open"
          ? "in_progress"
          : selectedComplaint.status
      );
      setActionNotes(selectedComplaint.resolution_notes || "");
      setActionError("");
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
      showToast(
        `Reply sent to ${selectedComplaint.parent_name}. Email alert delivered.`
      );
    } catch (err) {
      setReplyError(
        err instanceof Error ? err.message : "Failed to post reply."
      );
    } finally {
      setReplyBusy(false);
    }
  };

  const handleSaveResolution = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;
    if (actionNotes.trim().length < 3) {
      setActionError(
        "Please provide resolution or update notes for the parent."
      );
      return;
    }

    setActionBusy(true);
    setActionError("");

    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          complaintId: selectedComplaint.id,
          status: actionStatus,
          resolutionNotes: actionNotes.trim(),
          notifyParent,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to update complaint.");
      }

      const updated = result.complaint as ComplaintRecord;
      setComplaints((current) =>
        current.map((c) => (c.id === updated.id ? updated : c))
      );

      showToast(
        `Ticket #${updated.ticket_number} marked as ${
          updated.status === "resolved" ? "Resolved" : "Under Review"
        }. ${notifyParent ? "Parent notified by email." : ""}`
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update ticket."
      );
    } finally {
      setActionBusy(false);
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
            {refreshing ? "Refreshing…" : "Refresh records"}
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
                    <Pill
                      tone={
                        selectedComplaint.status === "resolved"
                          ? "green"
                          : selectedComplaint.status === "in_progress"
                          ? "blue"
                          : "amber"
                      }
                    >
                      {selectedComplaint.status === "in_progress"
                        ? "Under Investigation"
                        : selectedComplaint.status === "resolved"
                        ? "Resolved"
                        : "Awaiting Review"}
                    </Pill>
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

              <div style={{ padding: "20px" }}>
                <div style={{ marginBottom: "14px" }}>
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
                <div>
                  <span className="eyebrow">
                    Parent Message &amp; Grievance Statement
                  </span>
                  <div
                    style={{
                      background: "#f9faf8",
                      border: "1px solid var(--line)",
                      borderRadius: "10px",
                      padding: "16px",
                      marginTop: "6px",
                      fontSize: "13px",
                      lineHeight: "1.6",
                      color: "var(--ink)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {selectedComplaint.message}
                  </div>
                </div>
              </div>
            </section>

            {/* Live Discussion & Reply Thread Card */}
            <section className="card section-card">
              <SectionTitle
                title={`Discussion & Messages (${
                  (selectedComplaint.messages?.length || 0) + 1
                })`}
                detail="Real-time two-way communication between academy staff and the parent."
              />

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  maxHeight: "520px",
                  overflowY: "auto",
                  padding: "4px 0 16px 0",
                }}
              >
                {/* Initial Parent Grievance Statement */}
                <div
                  style={{
                    border: "1px solid #dce8df",
                    borderRadius: "10px",
                    background: "#ffffff",
                    padding: "14px 16px",
                    borderLeft: "4px solid #135b45",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <strong
                        style={{ fontSize: "13px", color: "var(--pine-950)" }}
                      >
                        {selectedComplaint.parent_name}
                      </strong>
                      <Pill tone="amber">Parent (Initial Ticket)</Pill>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {niceDate(selectedComplaint.created_at)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      lineHeight: "1.6",
                      color: "var(--ink)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {selectedComplaint.message}
                  </div>
                </div>

                {/* All Subsequent Replies */}
                {selectedComplaint.messages &&
                selectedComplaint.messages.length > 0
                  ? selectedComplaint.messages.map((msg) => {
                      const isStaff = msg.sender_role !== "parent";
                      return (
                        <div
                          key={msg.id}
                          style={{
                            border: isStaff
                              ? "1px solid #bbf7d0"
                              : "1px solid #dce8df",
                            borderRadius: "10px",
                            background: isStaff ? "#f0fdf4" : "#ffffff",
                            padding: "14px 16px",
                            borderLeft: isStaff
                              ? "4px solid #16a34a"
                              : "4px solid #d97706",
                            marginLeft: isStaff ? "20px" : "0",
                            marginRight: isStaff ? "0" : "20px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "6px",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <strong
                                style={{
                                  fontSize: "13px",
                                  color: isStaff
                                    ? "#14532d"
                                    : "var(--pine-950)",
                                }}
                              >
                                {msg.sender_name}
                              </strong>
                              <Pill tone={isStaff ? "green" : "amber"}>
                                {isStaff ? "Academy Staff" : "Parent"}
                              </Pill>
                            </div>
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
                              fontSize: "13px",
                              lineHeight: "1.6",
                              color: isStaff ? "#14532d" : "var(--ink)",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {msg.message}
                          </div>
                        </div>
                      );
                    })
                  : null}
              </div>

              {/* Reply Input Box */}
              <form
                onSubmit={handleSendReply}
                style={{
                  borderTop: "1px solid var(--line)",
                  paddingTop: "16px",
                  marginTop: "6px",
                }}
              >
                <div className="field">
                  <label htmlFor="complaint-reply-input">
                    Post Reply to Parent (Sends immediate email alert)
                  </label>
                  <textarea
                    id="complaint-reply-input"
                    rows={3}
                    placeholder={`Write a reply to ${selectedComplaint.parent_name}…`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    required
                  />
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

                <div className="modal-actions" style={{ marginTop: "12px" }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={replyBusy || !replyText.trim()}
                  >
                    <Send size={14} />
                    {replyBusy ? "Sending…" : "Send Reply to Parent"}
                  </button>
                </div>
              </form>
            </section>

            {/* Resolution Form Card */}
            <section className="card section-card">
              <SectionTitle
                title="Resolution & Investigation Action"
                detail="Update the case status, record investigative notes, and email the family."
              />

              {selectedComplaint.resolution_notes && (
                <div
                  style={{
                    marginBottom: "16px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "10px",
                    padding: "14px 16px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#166534",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Previous Resolution Notes{" "}
                    {selectedComplaint.resolved_by_name
                      ? `by ${selectedComplaint.resolved_by_name}`
                      : ""}{" "}
                    {selectedComplaint.resolved_at
                      ? `on ${niceDate(selectedComplaint.resolved_at)}`
                      : ""}
                  </span>
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: "12px",
                      color: "#14532d",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {selectedComplaint.resolution_notes}
                  </p>
                </div>
              )}

              <form onSubmit={handleSaveResolution}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="complaint-status">Ticket Status *</label>
                    <select
                      id="complaint-status"
                      value={actionStatus}
                      onChange={(e) =>
                        setActionStatus(e.target.value as ComplaintStatus)
                      }
                    >
                      <option value="in_progress">
                        Keep Under Investigation (In Progress)
                      </option>
                      <option value="resolved">
                        Mark Fully Resolved (Close Ticket)
                      </option>
                      <option value="open">Re-open for Review</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Family Communication</label>
                    <label
                      className="check-field"
                      style={{ marginTop: "10px" }}
                    >
                      <input
                        type="checkbox"
                        checked={notifyParent}
                        onChange={(e) => setNotifyParent(e.target.checked)}
                      />
                      Send resolution email to {selectedComplaint.parent_email}
                    </label>
                  </div>

                  <div className="field full">
                    <label htmlFor="resolution-notes">
                      Resolution / Investigation Notes (Included in parent
                      notification) *
                    </label>
                    <textarea
                      id="resolution-notes"
                      rows={4}
                      placeholder="Detail findings, actions agreed with teacher or admin, schedule adjustments made, or compensation provided…"
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {actionError && (
                  <p
                    role="alert"
                    className="form-error"
                    style={{ marginTop: "12px" }}
                  >
                    {actionError}
                  </p>
                )}

                <div className="modal-actions" style={{ marginTop: "16px" }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={actionBusy || !actionNotes.trim()}
                  >
                    <Check size={14} />
                    {actionBusy
                      ? "Saving…"
                      : actionStatus === "resolved"
                      ? "Confirm & Resolve Ticket"
                      : "Save Investigation Update"}
                  </button>
                </div>
              </form>
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
