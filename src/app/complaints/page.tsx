"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Inbox,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import {
  COMPLAINT_CATEGORIES,
  categoryLabel,
  urgencyBadge,
  statusBadge,
  type ComplaintRecord,
  type ComplaintCategory,
  type ComplaintStatus,
  type ComplaintUrgency,
} from "@/lib/academy/complaints";

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "in_progress" | "resolved" | "urgent"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Resolution modal state
  const [activeComplaint, setActiveComplaint] =
    useState<ComplaintRecord | null>(null);
  const [modalStatus, setModalStatus] = useState<ComplaintStatus>("resolved");
  const [modalNotes, setModalNotes] = useState("");
  const [modalNotifyParent, setModalNotifyParent] = useState(true);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");

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
      setComplaints(data.complaints || []);
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

  // Filtered complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      // Status tab
      if (statusFilter === "open" && c.status !== "open") return false;
      if (statusFilter === "in_progress" && c.status !== "in_progress")
        return false;
      if (statusFilter === "resolved" && c.status !== "resolved") return false;
      if (statusFilter === "urgent") {
        if (c.urgency !== "urgent") return false;
      }

      // Category
      if (categoryFilter !== "all" && c.category !== categoryFilter)
        return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          c.ticket_number.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          c.message.toLowerCase().includes(q) ||
          c.parent_name.toLowerCase().includes(q) ||
          c.parent_email.toLowerCase().includes(q) ||
          (c.student_name && c.student_name.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [complaints, statusFilter, categoryFilter, searchQuery]);

  const openResolutionModal = (complaint: ComplaintRecord) => {
    setActiveComplaint(complaint);
    setModalStatus(
      complaint.status === "open" ? "in_progress" : complaint.status
    );
    setModalNotes(complaint.resolution_notes || "");
    setModalNotifyParent(true);
    setModalError("");
  };

  const handleSaveResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplaint) return;
    if (modalNotes.trim().length < 3) {
      setModalError("Please provide resolution or update notes for the parent.");
      return;
    }

    setModalBusy(true);
    setModalError("");

    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          complaintId: activeComplaint.id,
          status: modalStatus,
          resolutionNotes: modalNotes.trim(),
          notifyParent: modalNotifyParent,
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

      setNotice(
        `Ticket #${updated.ticket_number} marked as ${updated.status === "resolved" ? "Resolved" : "Under Review"}. ${modalNotifyParent ? "Parent has been notified by email." : ""}`
      );
      setActiveComplaint(null);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Failed to update ticket."
      );
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <main className="complaints-wrap">
      {/* Header */}
      <div className="complaints-header">
        <div>
          <span className="eyebrow">Quality & Operations</span>
          <h1>Complaints & Support Center</h1>
          <p>
            Review, investigate, and resolve grievances raised by academy
            parents and families.
          </p>
        </div>
        <button
          className="btn ghost"
          onClick={() => void loadComplaints(true)}
          disabled={loading || refreshing}
          aria-label="Refresh tickets"
        >
          <RefreshCw
            size={14}
            className={refreshing ? "spinning" : undefined}
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Notifications / Alerts */}
      {error && (
        <div className="family-alert" role="alert">
          <AlertCircle size={16} />
          <p>{error}</p>
        </div>
      )}

      {notice && (
        <div className="family-alert success" role="status">
          <CheckCircle2 size={16} />
          <p>{notice}</p>
          <button
            className="family-modal-close"
            style={{ marginLeft: "auto" }}
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="complaints-stats">
        <div className="complaints-stat-card">
          <span className="complaints-stat-num">{stats.total}</span>
          <span className="complaints-stat-label">Total Inquiries</span>
        </div>
        <div className="complaints-stat-card open-stat">
          <span className="complaints-stat-num" style={{ color: "#d97706" }}>
            {stats.open}
          </span>
          <span className="complaints-stat-label">Open / Pending Review</span>
        </div>
        <div className="complaints-stat-card">
          <span className="complaints-stat-num" style={{ color: "#0284c7" }}>
            {stats.inProgress}
          </span>
          <span className="complaints-stat-label">Under Investigation</span>
        </div>
        <div className="complaints-stat-card resolved-stat">
          <span className="complaints-stat-num" style={{ color: "#059669" }}>
            {stats.resolved}
          </span>
          <span className="complaints-stat-label">Resolved</span>
        </div>
        <div className="complaints-stat-card urgent-stat">
          <span className="complaints-stat-num" style={{ color: "#dc2626" }}>
            {stats.urgent}
          </span>
          <span className="complaints-stat-label">Urgent Priority</span>
        </div>
      </div>

      {/* Controls & Filters */}
      <div className="complaints-controls">
        <div className="complaints-filter-tabs">
          <button
            className={`complaints-tab-btn ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            All Tickets ({stats.total})
          </button>
          <button
            className={`complaints-tab-btn ${statusFilter === "open" ? "active" : ""}`}
            onClick={() => setStatusFilter("open")}
          >
            Open ({stats.open})
          </button>
          <button
            className={`complaints-tab-btn ${statusFilter === "in_progress" ? "active" : ""}`}
            onClick={() => setStatusFilter("in_progress")}
          >
            Under Review ({stats.inProgress})
          </button>
          <button
            className={`complaints-tab-btn ${statusFilter === "resolved" ? "active" : ""}`}
            onClick={() => setStatusFilter("resolved")}
          >
            Resolved ({stats.resolved})
          </button>
          <button
            className={`complaints-tab-btn ${statusFilter === "urgent" ? "active" : ""}`}
            onClick={() => setStatusFilter("urgent")}
          >
            Urgent ({stats.urgent})
          </button>
        </div>

        <div className="complaints-filter-group">
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 10,
                color: "#6a7f74",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search parent, student, ticket…"
              className="complaints-search-input"
              style={{ paddingLeft: 30 }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="complaints-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {COMPLAINT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ticket List */}
      {loading ? (
        <div className="complaints-empty">
          <div className="skeleton-line" style={{ width: 140 }} />
          <div className="skeleton-line short" />
          <p>Loading complaints queue…</p>
        </div>
      ) : filteredComplaints.length === 0 ? (
        <div className="complaints-empty">
          <div className="complaints-empty-icon">
            <Inbox size={26} />
          </div>
          <h3>No complaints found</h3>
          <p>
            {complaints.length === 0
              ? "No complaints or feedback have been submitted by parents yet."
              : "No tickets match your current filters. Try selecting a different tab or clearing your search."}
          </p>
        </div>
      ) : (
        <div className="complaints-list">
          {filteredComplaints.map((c) => {
            const urgency = urgencyBadge(c.urgency);
            const status = statusBadge(c.status);
            const isResolved = c.status === "resolved";

            return (
              <article key={c.id} className="complaint-card">
                <div className="complaint-card-top">
                  <div className="complaint-meta-badges">
                    <span className="complaint-ticket-id">
                      #{c.ticket_number}
                    </span>
                    <span className={urgency.className}>{urgency.label}</span>
                    <span className={status.className}>{status.label}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "#6a7f74",
                        fontWeight: 600,
                      }}
                    >
                      {categoryLabel(c.category)}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 12,
                      color: "#6a7f74",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Clock size={12} />
                    {new Date(c.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <h2 className="complaint-subject">{c.subject}</h2>

                <div className="complaint-parties">
                  <div>
                    <strong>Guardian:</strong> {c.parent_name}{" "}
                    <a
                      href={`mailto:${c.parent_email}`}
                      style={{
                        color: "#135b45",
                        fontWeight: 600,
                        marginLeft: 4,
                      }}
                    >
                      ({c.parent_email})
                    </a>
                  </div>
                  {c.student_name && (
                    <div>
                      <strong>Student:</strong> {c.student_name}
                    </div>
                  )}
                </div>

                <div className="complaint-body-box">{c.message}</div>

                {/* Resolution Notes Box if present */}
                {c.resolution_notes && (
                  <div
                    className={`complaint-resolution-box ${
                      !isResolved ? "in-progress-box" : ""
                    }`}
                  >
                    <div className="complaint-resolution-header">
                      <span className="complaint-resolution-title">
                        {isResolved
                          ? "✓ Official Resolution"
                          : "⚙ Administrative Notes"}
                      </span>
                      {c.resolved_by_name && (
                        <span style={{ fontSize: 11.5, color: "#5a6e64" }}>
                          Updated by {c.resolved_by_name}
                          {c.resolved_at
                            ? ` on ${new Date(c.resolved_at).toLocaleDateString(
                                "en-GB",
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}`
                            : ""}
                        </span>
                      )}
                    </div>
                    <p className="complaint-resolution-notes">
                      {c.resolution_notes}
                    </p>
                  </div>
                )}

                <div className="complaint-card-actions">
                  <button
                    className="family-button secondary"
                    onClick={() => openResolutionModal(c)}
                  >
                    <MessageSquare size={14} />
                    {isResolved ? "Update Resolution" : "Respond & Resolve"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Resolution Modal */}
      {activeComplaint && (
        <div
          className="complaints-modal-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveComplaint(null);
          }}
        >
          <div
            className="complaints-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolution-title"
          >
            <div className="complaints-modal-head">
              <div>
                <h2 id="resolution-title">
                  Respond to Ticket #{activeComplaint.ticket_number}
                </h2>
                <span style={{ fontSize: 12, color: "#6a7f74" }}>
                  Guardian: {activeComplaint.parent_name} (
                  {activeComplaint.parent_email})
                </span>
              </div>
              <button
                type="button"
                className="family-modal-close"
                onClick={() => setActiveComplaint(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveResolution}>
              <div className="complaints-modal-body">
                {modalError && (
                  <div className="family-alert" role="alert">
                    <AlertCircle size={15} />
                    <p>{modalError}</p>
                  </div>
                )}

                <div
                  style={{
                    padding: 12,
                    background: "#f7faf8",
                    borderRadius: 8,
                    fontSize: 13,
                    border: "1px solid #eef2ef",
                  }}
                >
                  <strong style={{ display: "block", color: "#0a2e22" }}>
                    {activeComplaint.subject}
                  </strong>
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "#4a5d54",
                      maxHeight: 80,
                      overflowY: "auto",
                      whiteSpace: "pre-line",
                    }}
                  >
                    {activeComplaint.message}
                  </p>
                </div>

                <div className="complaints-field">
                  <label htmlFor="modal-status">Ticket Status *</label>
                  <select
                    id="modal-status"
                    value={modalStatus}
                    onChange={(e) =>
                      setModalStatus(e.target.value as ComplaintStatus)
                    }
                  >
                    <option value="in_progress">
                      Under Review / In Progress
                    </option>
                    <option value="resolved">Mark as Resolved</option>
                    <option value="open">Re-open Ticket</option>
                  </select>
                </div>

                <div className="complaints-field">
                  <label htmlFor="modal-notes">
                    Resolution / Administrative Response *
                  </label>
                  <textarea
                    id="modal-notes"
                    required
                    placeholder="Describe the actions taken, corrective measures, or findings. This note is shared with the guardian."
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                  />
                  <small style={{ fontSize: 11, color: "#6a7f74" }}>
                    Clear, empathetic communication maintains parent trust and
                    upholds our quality standards.
                  </small>
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: "#24382e",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={modalNotifyParent}
                    onChange={(e) => setModalNotifyParent(e.target.checked)}
                  />
                  <span>
                    Send resolution email update to {activeComplaint.parent_email}
                  </span>
                </label>
              </div>

              <div className="complaints-modal-foot">
                <button
                  type="button"
                  className="family-button secondary"
                  onClick={() => setActiveComplaint(null)}
                  disabled={modalBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="family-button primary"
                  disabled={modalBusy || modalNotes.trim().length < 3}
                >
                  {modalBusy ? (
                    "Saving…"
                  ) : (
                    <>
                      <Send size={14} /> Save & Update Ticket
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
