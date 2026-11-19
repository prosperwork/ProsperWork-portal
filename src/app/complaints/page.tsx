"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import ProfileAvatar from "../_components/ProfileAvatar";
import { PortalModal } from "../_components/PortalModal";
import { Empty, Pill, SectionTitle, niceDate } from "../_lib/portal-formatters";
import {
  COMPLAINT_CATEGORIES,
  categoryLabel,
  type ComplaintRecord,
  type ComplaintStatus,
  type ComplaintUrgency,
} from "@/lib/academy/complaints";
import { useCatalogs } from "@/lib/academy/use-academy-config";

const statusLabels: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "Under Investigation",
  resolved: "Resolved",
};

export default function ComplaintsPage() {
  const { enabledByCatalog, allByCatalog } = useCatalogs();
  const complaintCategoryItems = allByCatalog("complaint_categories");
  const complaintCategoryOptions = useMemo(() => {
    const enabled = enabledByCatalog("complaint_categories");
    return enabled.length > 0
      ? enabled.map((item) => ({ value: item.code, label: item.label }))
      : COMPLAINT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));
  }, [enabledByCatalog]);

  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadContainerRef = useRef<HTMLDivElement | null>(null);
  const didParseParamsRef = useRef(false);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

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

  // New Complaint Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newCategory, setNewCategory] = useState<string>(
    COMPLAINT_CATEGORIES[0].value
  );
  const [newUrgency, setNewUrgency] = useState<ComplaintUrgency>("normal");
  const [newSubject, setNewSubject] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newLessonRef, setNewLessonRef] = useState("");
  const [newMessage, setNewMessage] = useState("");

  // Resolve Ticket Confirmation Modal state
  const [resolveTarget, setResolveTarget] = useState<ComplaintRecord | null>(
    null
  );
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveError, setResolveError] = useState("");

  const isParent = currentUser?.role === "parent";
  const canManageStatus = Boolean(currentUser?.role && !isParent);

  // Read ?category= and ?lessonId= query params to pre-fill and open the modal
  useEffect(() => {
    if (didParseParamsRef.current || typeof window === "undefined") return;
    didParseParamsRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const paramCategory = params.get("category")?.trim();
    const paramLessonId = params.get("lessonId")?.trim();
    const paramStudent = params.get("studentName")?.trim();

    if (paramCategory || paramLessonId) {
      if (paramCategory) {
        setNewCategory(paramCategory);
      }
      if (paramLessonId) {
        setNewLessonRef(paramLessonId);
        setNewSubject((prev) =>
          prev || `Lesson issue (Ref: ${paramLessonId.slice(0, 12)})`
        );
      }
      if (paramStudent) {
        setNewStudentName(paramStudent);
      }
      setCreateOpen(true);
    }
  }, []);

  // Ensure default category stays valid when catalogs load
  useEffect(() => {
    if (
      complaintCategoryOptions.length > 0 &&
      !complaintCategoryOptions.some((c) => c.value === newCategory)
    ) {
      setNewCategory(complaintCategoryOptions[0].value);
    }
  }, [complaintCategoryOptions, newCategory]);

  const loadComplaints = useCallback(
    async (isRefresh = false, allowSync = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const url =
          isRefresh && allowSync
            ? "/api/complaints?sync=true"
            : "/api/complaints";
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
    },
    []
  );

  useEffect(() => {
    void loadComplaints(false, false);
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
          categoryLabel(c.category, complaintCategoryItems),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      }
      return true;
    });
  }, [
    complaints,
    statusFilter,
    categoryFilter,
    searchQuery,
    complaintCategoryItems,
  ]);

  // Always keep selectedComplaint strictly aligned with filteredComplaints
  const selectedComplaint = useMemo(() => {
    if (!filteredComplaints.length) return null;
    if (selectedComplaintId) {
      const match = filteredComplaints.find(
        (c) => c.id === selectedComplaintId
      );
      if (match) return match;
    }
    return filteredComplaints[0];
  }, [selectedComplaintId, filteredComplaints]);

  // Keep selectedComplaintId synced when filters hide the previous ticket
  useEffect(() => {
    if (selectedComplaint && selectedComplaint.id !== selectedComplaintId) {
      setSelectedComplaintId(selectedComplaint.id);
    } else if (!selectedComplaint && selectedComplaintId !== null) {
      setSelectedComplaintId(null);
    }
  }, [selectedComplaint, selectedComplaintId]);

  // Reset reply box when selected complaint changes
  useEffect(() => {
    if (selectedComplaint) {
      setReplyText("");
      setReplyError("");
    }
  }, [selectedComplaint?.id]);

  // Auto-scroll chat thread to the latest message on selection or new reply
  const selectedMessageCount = selectedComplaint?.messages?.length ?? 0;
  useEffect(() => {
    const el = threadContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [selectedComplaint?.id, selectedMessageCount]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, 4500);
  };

  const resetCreateForm = () => {
    setNewCategory(
      complaintCategoryOptions[0]?.value ?? COMPLAINT_CATEGORIES[0].value
    );
    setNewUrgency("normal");
    setNewSubject("");
    setNewStudentName("");
    setNewLessonRef("");
    setNewMessage("");
    setCreateError("");
  };

  const handleCreateComplaint = async (e: FormEvent) => {
    e.preventDefault();
    if (createBusy) return;

    const trimmedSubject = newSubject.trim();
    const trimmedLesson = newLessonRef.trim();
    const baseMessage = newMessage.trim();
    const finalMessage =
      trimmedLesson && !baseMessage.includes(trimmedLesson)
        ? `${baseMessage}\n\nLesson reference: ${trimmedLesson}`
        : baseMessage;

    if (trimmedSubject.length < 3) {
      setCreateError("Please enter a subject of at least 3 characters.");
      return;
    }
    if (finalMessage.length < 10) {
      setCreateError("Please describe your concern in at least 10 characters.");
      return;
    }

    setCreateBusy(true);
    setCreateError("");
    try {
      const payload: Record<string, unknown> = {
        action: "create",
        category: newCategory,
        urgency: newUrgency,
        subject: trimmedSubject,
        message: finalMessage,
      };
      if (newStudentName.trim()) {
        payload.studentName = newStudentName.trim();
      }

      const response = await fetch("/api/complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Could not submit your complaint.");
      }

      const created = result.complaint as ComplaintRecord | undefined;
      if (created) {
        setComplaints((prev) => [{ ...created, messages: [] }, ...prev]);
        setStatusFilter("all");
        setCategoryFilter("all");
        setSearchQuery("");
        setSelectedComplaintId(created.id);
      } else {
        await loadComplaints(true, false);
      }

      setCreateOpen(false);
      resetCreateForm();
      showToast(
        created
          ? `Ticket #${created.ticket_number} submitted. Confirmation sent by email.`
          : "Your complaint has been submitted."
      );
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Could not submit your complaint."
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (replyBusy || !selectedComplaint || !replyText.trim()) return;

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

      const newMsg = result.messageRecord;
      const nextStatus = result.status;

      setComplaints((current) =>
        current.map((c) => {
          if (c.id === selectedComplaint.id) {
            const updatedMessages = [...(c.messages || []), newMsg];
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

  const executeStatusUpdate = async (
    ticket: ComplaintRecord,
    newStatus: ComplaintStatus,
    resolutionNotes?: string
  ): Promise<boolean> => {
    setStatusBusy(true);
    try {
      const payload: Record<string, unknown> = {
        action: "update_status",
        complaintId: ticket.id,
        status: newStatus,
        notifyParent: newStatus === "resolved",
      };
      if (resolutionNotes !== undefined) {
        payload.resolutionNotes = resolutionNotes;
      }

      const response = await fetch("/api/complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to update ticket status.");
      }

      const updated = result.complaint as ComplaintRecord;
      setComplaints((current) =>
        current.map((c) =>
          c.id === updated.id ? { ...updated, messages: c.messages } : c
        )
      );

      showToast(
        newStatus === "resolved"
          ? `Ticket #${updated.ticket_number} marked as resolved and family notified.`
          : `Ticket #${updated.ticket_number} status set to ${
              statusLabels[updated.status] || updated.status
            }.`
      );
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update ticket status.";
      if (newStatus === "resolved") {
        setResolveError(msg);
      } else {
        showToast(msg);
      }
      return false;
    } finally {
      setStatusBusy(false);
    }
  };

  const handleStatusSelectChange = (newStatus: ComplaintStatus) => {
    if (
      !canManageStatus ||
      !selectedComplaint ||
      selectedComplaint.status === newStatus ||
      statusBusy
    ) {
      return;
    }

    if (newStatus === "resolved") {
      setResolveTarget(selectedComplaint);
      setResolveNotes(selectedComplaint.resolution_notes || "");
      setResolveError("");
      return;
    }

    void executeStatusUpdate(selectedComplaint, newStatus);
  };

  const handleConfirmResolve = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolveTarget || statusBusy) return;
    setResolveError("");
    const ok = await executeStatusUpdate(
      resolveTarget,
      "resolved",
      resolveNotes.trim() || undefined
    );
    if (ok) {
      setResolveTarget(null);
      setResolveNotes("");
    }
  };

  const toggleStatusFilter = (
    target: "all" | "open" | "in_progress" | "resolved"
  ) => {
    setStatusFilter((prev) => (prev === target ? "all" : target));
  };

  const statCardStyle = (active: boolean) => ({
    cursor: "pointer" as const,
    textAlign: "left" as const,
    width: "100%",
    borderColor: active ? "var(--pine-800, #135b45)" : undefined,
    boxShadow: active ? "0 0 0 2px rgba(19, 91, 69, 0.14)" : undefined,
  });

  return (
    <div className="page-wrap">
      {/* Page Heading matching all other workspaces */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {isParent ? "Family Support" : "Quality & Operations"}
          </span>
          <h1>Complaints &amp; Support</h1>
          <p className="page-subtitle">
            {isParent
              ? "Raise concerns, follow updates, and message academy administration directly."
              : "Review, investigate, and resolve grievances raised by academy parents and families."}
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => void loadComplaints(true, canManageStatus)}
            disabled={loading || refreshing}
            aria-label="Refresh tickets"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "spinning" : undefined}
            />
            {isParent
              ? refreshing
                ? "Refreshing…"
                : "Refresh"
              : refreshing
              ? "Syncing emails…"
              : "Sync emails & refresh"}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setCreateError("");
              setCreateOpen(true);
            }}
          >
            <Plus size={14} /> New Complaint
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div role="alert" className="form-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Clickable KPI Stat Cards */}
      <div className="stat-grid">
        <button
          type="button"
          className="card stat-card"
          style={statCardStyle(statusFilter === "all")}
          onClick={() => setStatusFilter("all")}
          aria-pressed={statusFilter === "all"}
        >
          <div className="stat-top">
            Total Inquiries{" "}
            <span className="stat-icon">
              <MessageSquare size={15} />
            </span>
          </div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-foot">
            {isParent ? "Your logged tickets" : "Logged across academy families"}
          </div>
        </button>

        <button
          type="button"
          className="card stat-card"
          style={statCardStyle(statusFilter === "open")}
          onClick={() => toggleStatusFilter("open")}
          aria-pressed={statusFilter === "open"}
        >
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
        </button>

        <button
          type="button"
          className="card stat-card"
          style={statCardStyle(statusFilter === "in_progress")}
          onClick={() => toggleStatusFilter("in_progress")}
          aria-pressed={statusFilter === "in_progress"}
        >
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
        </button>

        <button
          type="button"
          className="card stat-card"
          style={statCardStyle(statusFilter === "resolved")}
          onClick={() => toggleStatusFilter("resolved")}
          aria-pressed={statusFilter === "resolved"}
        >
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
        </button>
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
          {complaintCategoryOptions.map((cat) => (
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

      {/* Master-Detail Layout */}
      <div className="complaints-grid-main">
        {/* Left: Ticket Roster */}
        <section className="card section-card">
          <SectionTitle
            title="Grievance Tickets"
            detail={`${filteredComplaints.length} ticket${
              filteredComplaints.length === 1 ? "" : "s"
            } matching filters`}
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
                      {categoryLabel(c.category, complaintCategoryItems)} ·{" "}
                      {niceDate(c.created_at)}
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
                  : "No complaints or inquiries recorded yet. Click New Complaint to open one."
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
                    {canManageStatus ? (
                      <div
                        style={{ display: "inline-flex", alignItems: "center" }}
                      >
                        <select
                          aria-label="Ticket Status"
                          value={selectedComplaint.status}
                          onChange={(e) =>
                            handleStatusSelectChange(
                              e.target.value as ComplaintStatus
                            )
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
                    ) : (
                      <Pill
                        tone={
                          selectedComplaint.status === "resolved"
                            ? "green"
                            : selectedComplaint.status === "in_progress"
                            ? "blue"
                            : "amber"
                        }
                      >
                        {statusLabels[selectedComplaint.status] ||
                          selectedComplaint.status}
                      </Pill>
                    )}
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
                  <strong>
                    {categoryLabel(
                      selectedComplaint.category,
                      complaintCategoryItems
                    )}
                  </strong>
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
                {selectedComplaint.resolution_notes && (
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      fontSize: "12.5px",
                      color: "#166534",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: 4 }}>
                      Resolution summary
                      {selectedComplaint.resolved_by_name
                        ? ` · ${selectedComplaint.resolved_by_name}`
                        : ""}
                    </strong>
                    {selectedComplaint.resolution_notes}
                  </div>
                )}
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
                ref={threadContainerRef}
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
                {/* Initial Parent Inquiry */}
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

              {/* Chat Reply Input */}
              {isParent && selectedComplaint.status === "resolved" ? (
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
                    replies. Open a new complaint if you need further help.
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
                          isParent
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
              title={
                filteredComplaints.length === 0
                  ? "No matching ticket"
                  : "Select a ticket"
              }
              detail={
                filteredComplaints.length === 0
                  ? "Adjust your filters or submit a new support complaint."
                  : "Choose a complaint from the roster on the left to inspect details and message the family or academy staff."
              }
            />
          </section>
        )}
      </div>

      {/* + New Complaint Modal */}
      <PortalModal
        open={createOpen}
        onClose={() => {
          if (!createBusy) setCreateOpen(false);
        }}
        title="Submit a Support Complaint"
        eyebrow="New Ticket"
        subtitle="Your inquiry will be logged immediately and routed to academy administration with an email receipt."
        size="md"
        busy={createBusy}
        footer={
          <>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setCreateOpen(false)}
              disabled={createBusy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-complaint-form"
              className="btn primary"
              disabled={createBusy}
            >
              {createBusy ? "Submitting…" : "Submit Complaint"}
            </button>
          </>
        }
      >
        <form
          id="new-complaint-form"
          onSubmit={(e) => void handleCreateComplaint(e)}
          className="form-grid"
        >
          <div className="field">
            <label htmlFor="new-complaint-category">Category</label>
            <select
              id="new-complaint-category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              required
            >
              {complaintCategoryOptions.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="new-complaint-urgency">Priority / Urgency</label>
            <select
              id="new-complaint-urgency"
              value={newUrgency}
              onChange={(e) =>
                setNewUrgency(e.target.value as ComplaintUrgency)
              }
            >
              <option value="normal">Standard</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="field full">
            <label htmlFor="new-complaint-subject">Subject</label>
            <input
              id="new-complaint-subject"
              type="text"
              required
              minLength={3}
              maxLength={200}
              placeholder="Brief summary of the issue"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="new-complaint-student">
              Student name (optional)
            </label>
            <input
              id="new-complaint-student"
              type="text"
              maxLength={120}
              placeholder="Leave blank for general concern"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="new-complaint-lesson">
              Lesson / reference ID (optional)
            </label>
            <input
              id="new-complaint-lesson"
              type="text"
              maxLength={120}
              placeholder="e.g. lesson date or ID"
              value={newLessonRef}
              onChange={(e) => setNewLessonRef(e.target.value)}
            />
          </div>

          <div className="field full">
            <label htmlFor="new-complaint-message">Message details</label>
            <textarea
              id="new-complaint-message"
              required
              minLength={10}
              maxLength={5000}
              rows={5}
              placeholder="Describe what happened, relevant dates or classes, and how we can help (at least 10 characters)."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <small style={{ color: "var(--muted)", fontSize: 10 }}>
              {newMessage.length}/5000 characters
            </small>
          </div>

          {createError && (
            <div className="field full">
              <div role="alert" className="form-error" style={{ marginTop: 0 }}>
                {createError}
              </div>
            </div>
          )}
        </form>
      </PortalModal>

      {/* Confirm Ticket Resolution Modal */}
      <PortalModal
        open={Boolean(resolveTarget)}
        onClose={() => {
          if (!statusBusy) setResolveTarget(null);
        }}
        title="Resolve Support Ticket?"
        eyebrow={
          resolveTarget ? `Ticket #${resolveTarget.ticket_number}` : undefined
        }
        subtitle="Marking this ticket as resolved immediately sends a resolution email notification to the family and closes parent replies."
        size="sm"
        busy={statusBusy}
        footer={
          <>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setResolveTarget(null)}
              disabled={statusBusy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="resolve-complaint-form"
              className="btn primary"
              disabled={statusBusy}
            >
              {statusBusy ? "Resolving…" : "Confirm & Notify Family"}
            </button>
          </>
        }
      >
        <form
          id="resolve-complaint-form"
          onSubmit={(e) => void handleConfirmResolve(e)}
        >
          <div className="notice" style={{ marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              An official resolution notice will be emailed to{" "}
              <strong>{resolveTarget?.parent_email}</strong>.
            </span>
          </div>

          <div className="field">
            <label htmlFor="resolve-notes-input">
              Resolution note (optional — included in family email)
            </label>
            <textarea
              id="resolve-notes-input"
              rows={4}
              maxLength={5000}
              placeholder="Summarize the outcome or action taken…"
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
            />
          </div>

          {resolveError && (
            <div role="alert" className="form-error">
              {resolveError}
            </div>
          )}
        </form>
      </PortalModal>

      {/* Floating Notification Toast matching portal standard */}
      {toast && (
        <div role="status" aria-live="polite" className="toast">
          {toast}
        </div>
      )}
    </div>
  );
}
