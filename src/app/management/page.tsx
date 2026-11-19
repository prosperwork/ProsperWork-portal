"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  Inbox,
  MessageSquare,
  Plus,
  RefreshCw,
  Sliders,
  UserCheck,
  UserCog,
  UserX,
  Users,
} from "lucide-react";
import { useConfirmModal } from "@/app/_components/ConfirmModal";
import { PortalModal } from "@/app/_components/PortalModal";
import ProfileAvatar from "@/app/_components/ProfileAvatar";

type Staff = {
  id: string;
  name: string;
  role: string;
  department?: string;
  status: string;
  quota: number | null;
  head_admin_id: string | null;
  avatar_file_id: string | null;
};
type DeskItem = {
  id: string;
  kind: string;
  student_id: string | null;
  lead_id: string | null;
  staff_id: string | null;
  assigned_to: string | null;
  due_at: string | null;
  notes: string;
  status: "open" | "in_progress" | "completed" | "cancelled";
  revision: number;
};
type Announcement = {
  id: string;
  title: string;
  body: string;
  roles: string[];
  expires_at: string;
};
type RuleSettings = {
  stagnant_days: number;
  empty_board_classes: number;
  followup_hours: number;
  escalation_hours: number;
  late_grace_minutes: number;
};
type QualityRow = {
  staffId: string;
  name: string;
  activeStudents: number | null;
  verifiedLessons: number | null;
  missedLessons: number | null;
  emptyBoards: number | null;
  observedClasses: number | null;
  punctualPercent: number | null;
  retentionPercent: number | null;
  score: number | null;
};
type ScheduledLesson = {
  id: string;
  student_id: string;
  teacher_id: string | null;
  admin_id: string | null;
  payload: Record<string, unknown>;
};
type Snapshot = {
  profile: {
    id: string;
    name: string;
    role: string;
    status: string;
    permissions?: string[];
  };
  staff: Staff[];
  items: DeskItem[];
  announcements: Announcement[];
  quality: QualityRow[];
  rules?: RuleSettings | null;
  lessons?: ScheduledLesson[];
  students: { id: string; payload: Record<string, unknown> }[];
  leads: { id: string; payload: Record<string, unknown> }[];
};

type CaseStatusFilter = "all" | "open" | "in_progress" | "resolved";

const kinds = [
  "trial_request",
  "callback",
  "nursery",
  "winback",
  "exit_feedback",
  "dispute",
  "priority",
  "monthly_report",
  "shadow_request",
  "personal_teaching",
];

const roles = [
  "super_admin",
  "head_admin",
  "admin",
  "teacher",
  "qc",
  "hr",
  "finance",
  "sales_marketing",
  "social_media",
  "parent",
  "student",
];

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

const formatRoleName = (role: string) => {
  const map: Record<string, string> = {
    super_admin: "Super Administrator",
    head_admin: "Head Administrator",
    admin: "Administrator",
    teacher: "Music Instructor",
    qc: "Quality Control",
    hr: "Human Resources",
    finance: "Finance & Accounts",
    sales_marketing: "Admissions & Marketing",
    social_media: "Media & Outreach",
    parent: "Parent / Guardian",
    student: "Student",
  };
  return map[role] || label(role);
};

const toISO = (value: string) => (value ? new Date(value).toISOString() : "");

const payloadName = (payload: Record<string, unknown>, fallback: string) =>
  String(
    payload.name ||
      payload.childName ||
      payload.studentName ||
      payload.parentName ||
      payload.title ||
      fallback
  );

function RecordTag({
  children,
  status = "",
}: {
  children: ReactNode;
  status?: string;
}) {
  const tone = ["completed", "active"].includes(status)
    ? ""
    : ["cancelled", "inactive", "restricted"].includes(status)
      ? "red"
      : ["open", "in_progress", "pending", "paused", "on_leave"].includes(
            status
          )
        ? "amber"
        : "";
  return <span className={`mw-tag ${tone}`}>{children}</span>;
}

export default function ManagementPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const { confirm, ConfirmDialog } = useConfirmModal();

  // Case status filter
  const [caseFilter, setCaseFilter] = useState<CaseStatusFilter>("all");

  // Modal states
  const [openCaseModal, setOpenCaseModal] = useState(false);
  const [caseForm, setCaseForm] = useState({
    kind: kinds[0],
    assignedTo: "",
    studentId: "",
    leadId: "",
    staffId: "",
    at: "",
    slots: "",
    notes: "",
  });

  const [updateCaseTarget, setUpdateCaseTarget] = useState<DeskItem | null>(
    null
  );
  const [updateForm, setUpdateForm] = useState<{
    status: DeskItem["status"];
    notes: string;
  }>({ status: "in_progress", notes: "" });

  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
    expiresAt: "",
    roles: [] as string[],
  });

  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [rulesForm, setRulesForm] = useState({
    stagnantDays: "",
    emptyBoardClasses: "",
    followupHours: "",
    escalationHours: "",
    lateGraceMinutes: "",
    notes: "",
  });

  const [hierarchyTarget, setHierarchyTarget] = useState<Staff | null>(null);
  const [hierarchyForm, setHierarchyForm] = useState({
    headId: "",
    quota: "0",
    notes: "",
  });

  const [deactivateTarget, setDeactivateTarget] = useState<Staff | null>(null);
  const [deactivateForm, setDeactivateForm] = useState({
    notes: "",
    confirmText: "",
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/management", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error || "Management records could not be loaded."
        );
      setSnapshot(result as Snapshot);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Management records could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const staff = useMemo(() => snapshot?.staff || [], [snapshot?.staff]);
  const activeStaff = useMemo(
    () => staff.filter((person) => person.status === "active"),
    [staff]
  );
  const students = useMemo(
    () => snapshot?.students || [],
    [snapshot?.students]
  );
  const leads = useMemo(() => snapshot?.leads || [], [snapshot?.leads]);
  const lessons = useMemo(() => snapshot?.lessons || [], [snapshot?.lessons]);

  // Real-name lookup maps (no raw UUIDs displayed!)
  const staffNameMap = useMemo(
    () => new Map(staff.map((person) => [person.id, person.name] as const)),
    [staff]
  );
  const studentNameMap = useMemo(
    () =>
      new Map(
        students.map(
          (row) => [row.id, payloadName(row.payload, "Student")] as const
        )
      ),
    [students]
  );
  const leadNameMap = useMemo(
    () =>
      new Map(
        leads.map((row) => [row.id, payloadName(row.payload, "Lead")] as const)
      ),
    [leads]
  );

  const resolveStaffName = (id: string) => staffNameMap.get(id) || "Staff member";
  const resolveStudentName = (id: string) =>
    studentNameMap.get(id) || "Enrolled student";
  const resolveLeadName = (id: string) =>
    leadNameMap.get(id) || "Trial inquiry";

  const currentRole = snapshot?.profile.role || "";
  const perms = useMemo(
    () => new Set(snapshot?.profile.permissions ?? []),
    [snapshot?.profile.permissions]
  );
  const ownerActions =
    currentRole === "super_admin" || currentRole === "owner";
  const managementActions =
    ownerActions ||
    [
      "super_admin",
      "head_admin",
      "admin",
      "general_manager",
      "sales_marketing",
      "qc",
    ].includes(currentRole) ||
    perms.has("workspace.management");
  const canManageAnnouncements = ownerActions || currentRole === "head_admin";

  const visibleKinds =
    currentRole === "sales_marketing"
      ? ["trial_request", "callback", "nursery", "winback", "exit_feedback"]
      : currentRole === "qc"
        ? ["shadow_request", "personal_teaching"]
        : kinds;

  const hierarchyOptions = useMemo(
    () =>
      staff.filter(
        (person) =>
          ["head_admin", "general_manager", "super_admin"].includes(
            person.role
          ) && person.status === "active"
      ),
    [staff]
  );

  const hasScheduledTrial = (item: DeskItem) =>
    lessons.some((lesson) => {
      if (String(lesson.payload.status || "").toLowerCase() !== "scheduled")
        return false;
      const leadLink = String(
        lesson.payload.lead_id || lesson.payload.leadId || ""
      );
      const lessonKind = String(
        lesson.payload.kind || lesson.payload.lesson_kind || ""
      ).toLowerCase();
      if (item.lead_id) return leadLink === item.lead_id;
      return (
        !!item.student_id &&
        lesson.student_id === item.student_id &&
        lessonKind === "trial"
      );
    });

  const postManagementAction = async (
    payload: Record<string, unknown>,
    successMsg: string
  ): Promise<boolean> => {
    setBusy(true);
    setModalError("");
    setNotice("");
    try {
      const response = await fetch("/api/management", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error)
        throw new Error(result.error || "That action could not be completed.");
      setNotice(successMsg);
      await reload();
      return true;
    } catch (error) {
      setModalError(
        error instanceof Error
          ? error.message
          : "That action could not be completed."
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Submit handlers for focused modals
  const handleCreateCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (caseForm.notes.trim().length < 5) {
      setModalError("A written reason of at least 5 characters is required.");
      return;
    }
    const rawSlots = caseForm.slots
      .split(/\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    const slots = rawSlots.map((value) =>
      /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)
        ? new Date(value).toISOString()
        : value
    );
    const ok = await postManagementAction(
      {
        action: "create",
        kind: visibleKinds.includes(caseForm.kind)
          ? caseForm.kind
          : visibleKinds[0],
        assignedTo: caseForm.assignedTo,
        at: toISO(caseForm.at),
        slots,
        notes: caseForm.notes.trim(),
        ...(caseForm.studentId ? { studentId: caseForm.studentId } : {}),
        ...(caseForm.leadId ? { leadId: caseForm.leadId } : {}),
        ...(caseForm.staffId ? { staffId: caseForm.staffId } : {}),
      },
      "Management case opened."
    );
    if (ok) {
      setOpenCaseModal(false);
      setCaseForm({
        kind: visibleKinds[0] || kinds[0],
        assignedTo: "",
        studentId: "",
        leadId: "",
        staffId: "",
        at: "",
        slots: "",
        notes: "",
      });
    }
  };

  const handleUpdateCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!updateCaseTarget) return;
    if (updateForm.notes.trim().length < 5) {
      setModalError("A written update note of at least 5 characters is required.");
      return;
    }
    if (
      updateCaseTarget.kind === "trial_request" &&
      updateForm.status === "completed" &&
      !hasScheduledTrial(updateCaseTarget)
    ) {
      setModalError(
        "Schedule the trial through Operations before completing this task. The linked scheduled lesson must be present in the authorized snapshot."
      );
      return;
    }
    const ok = await postManagementAction(
      {
        action: "update",
        id: updateCaseTarget.id,
        revision: updateCaseTarget.revision,
        status: updateForm.status,
        notes: updateForm.notes.trim(),
      },
      `Case updated to ${label(updateForm.status)}.`
    );
    if (ok) {
      setUpdateCaseTarget(null);
      setUpdateForm({ status: "in_progress", notes: "" });
    }
  };

  const handlePublishAnnouncement = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!announcementForm.roles.length) {
      setModalError("Choose at least one audience role.");
      return;
    }
    const ok = await postManagementAction(
      {
        action: "announcement",
        title: announcementForm.title.trim(),
        body: announcementForm.body.trim(),
        roles: announcementForm.roles,
        expiresAt: toISO(announcementForm.expiresAt),
      },
      "Announcement published."
    );
    if (ok) {
      setAnnouncementModalOpen(false);
      setAnnouncementForm({ title: "", body: "", expiresAt: "", roles: [] });
    }
  };

  const handleArchiveAnnouncement = (announcement: Announcement) => {
    confirm({
      title: "Archive announcement?",
      message: `Archiving "${announcement.title}" removes it from active academy portals immediately.`,
      confirmLabel: "Archive Announcement",
      tone: "warning",
      onConfirm: async () => {
        const response = await fetch("/api/management", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "announcement_archive",
            id: announcement.id,
            notes: `Archived "${announcement.title}" from Management.`,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.error) {
          throw new Error(
            result.error || "Announcement could not be archived."
          );
        }
        setNotice(`Archived announcement "${announcement.title}".`);
        await reload();
      },
    });
  };

  const handleSaveRules = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rulesForm.notes.trim().length < 5) {
      setModalError("A written reason of at least 5 characters is required.");
      return;
    }
    const ok = await postManagementAction(
      {
        action: "rules",
        stagnantDays: Number(rulesForm.stagnantDays),
        emptyBoardClasses: Number(rulesForm.emptyBoardClasses),
        followupHours: Number(rulesForm.followupHours),
        escalationHours: Number(rulesForm.escalationHours),
        lateGraceMinutes: Number(rulesForm.lateGraceMinutes),
        notes: rulesForm.notes.trim(),
      },
      "Academy operating rules updated."
    );
    if (ok) {
      setRulesModalOpen(false);
    }
  };

  const handleSaveHierarchy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hierarchyTarget) return;
    if (hierarchyForm.notes.trim().length < 5) {
      setModalError("A written reason of at least 5 characters is required.");
      return;
    }
    const ok = await postManagementAction(
      {
        action: "hierarchy",
        adminId: hierarchyTarget.id,
        headId: hierarchyForm.headId,
        quota: Number(hierarchyForm.quota),
        notes: hierarchyForm.notes.trim(),
      },
      `Updated supervisor and quota for ${hierarchyTarget.name}.`
    );
    if (ok) {
      setHierarchyTarget(null);
    }
  };

  const handleDeactivateStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deactivateTarget) return;
    if (deactivateForm.notes.trim().length < 5) {
      setModalError("A written reason of at least 5 characters is required.");
      return;
    }
    if (deactivateForm.confirmText !== "DEACTIVATE") {
      setModalError("Type DEACTIVATE exactly to confirm this account change.");
      return;
    }
    const ok = await postManagementAction(
      {
        action: "deactivate",
        staffId: deactivateTarget.id,
        confirm: "DEACTIVATE",
        notes: deactivateForm.notes.trim(),
      },
      `${deactivateTarget.name} has been deactivated.`
    );
    if (ok) {
      setDeactivateTarget(null);
      setDeactivateForm({ notes: "", confirmText: "" });
    }
  };

  // Filtered cases
  const allItems = useMemo(() => snapshot?.items || [], [snapshot?.items]);
  const caseCounts = useMemo(
    () => ({
      all: allItems.length,
      open: allItems.filter((i) => i.status === "open").length,
      in_progress: allItems.filter((i) => i.status === "in_progress").length,
      resolved: allItems.filter(
        (i) => i.status === "completed" || i.status === "cancelled"
      ).length,
    }),
    [allItems]
  );
  const filteredItems = useMemo(() => {
    if (caseFilter === "all") return allItems;
    if (caseFilter === "resolved")
      return allItems.filter(
        (i) => i.status === "completed" || i.status === "cancelled"
      );
    return allItems.filter((i) => i.status === caseFilter);
  }, [allItems, caseFilter]);

  const qualityRows = useMemo(() => snapshot?.quality || [], [snapshot]);

  if (loading && !snapshot)
    return (
      <main className="mw-page">
        <div className="mw-shell">
          <div className="mw-skeleton" />
          <div className="mw-skeleton" style={{ marginTop: 16 }} />
        </div>
      </main>
    );

  return (
    <main className="mw-page">
      <div className="mw-shell">
        <section className="mw-intro">
          <h1>Management</h1>
          <div className="mw-intro-actions" style={{ flexWrap: "wrap" }}>
            <Link
              className="mw-button"
              href="/schedule"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Manage Emergency Cover in Schedule →
            </Link>
            {(ownerActions || currentRole === "head_admin") && (
              <Link
                className="mw-button"
                href="/accounts"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Use View As User in Accounts →
              </Link>
            )}
            <Link
              className="mw-button"
              href="/complaints"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              <AlertCircle size={14} /> Complaints &amp; Support
            </Link>
            <button
              type="button"
              className="mw-button"
              onClick={() => void reload()}
              disabled={loading}
            >
              <RefreshCw size={14} />{" "}
              {loading ? "Refreshing…" : "Refresh records"}
            </button>
          </div>
        </section>

        {loadError && (
          <div className="mw-banner error" role="alert">
            {loadError}{" "}
            <button className="mw-button" onClick={() => void reload()}>
              Retry
            </button>
          </div>
        )}
        {notice && (
          <div className="mw-banner" role="status">
            {notice}
          </div>
        )}
        {loading && snapshot && (
          <div className="mw-banner" role="status">
            Refreshing authorized records…
          </div>
        )}

        <div
          className="mw-grid mw-management-layout"
          data-portal-layout="management-workspace"
        >
          <div className="mw-stack mw-primary-work">
            {/* Management Cases */}
            <section className="mw-card mw-casework-card mw-record-ledger">
              <div className="mw-section-head">
                <div>
                  <h2>Management cases</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="mw-count">{allItems.length} records</span>
                  {managementActions && (
                    <button
                      type="button"
                      className="mw-button primary"
                      onClick={() => {
                        setModalError("");
                        setCaseForm((prev) => ({
                          ...prev,
                          kind: visibleKinds[0] || kinds[0],
                        }));
                        setOpenCaseModal(true);
                      }}
                    >
                      <Plus size={14} /> + Open Case
                    </button>
                  )}
                </div>
              </div>

              {allItems.length > 0 && (
                <div
                  className="portal-tabs"
                  role="tablist"
                  aria-label="Filter management cases by status"
                  style={{ marginTop: 10 }}
                >
                  {(
                    [
                      { key: "all", label: "All" },
                      { key: "open", label: "Open" },
                      { key: "in_progress", label: "In Progress" },
                      { key: "resolved", label: "Resolved" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={caseFilter === tab.key}
                      className={`portal-tab ${
                        caseFilter === tab.key ? "active" : ""
                      }`}
                      onClick={() => setCaseFilter(tab.key)}
                    >
                      {tab.label}
                      <span className="portal-tab-badge">
                        {caseCounts[tab.key]}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {filteredItems.length ? (
                <div>
                  {filteredItems.map((item) => {
                    const classroomLessons =
                      item.student_id &&
                      ["shadow_request", "personal_teaching"].includes(
                        item.kind
                      )
                        ? lessons.filter(
                            (lesson) => lesson.student_id === item.student_id
                          )
                        : [];
                    return (
                      <article className="mw-record" key={item.id}>
                        <div style={{ width: "100%" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            <h3 style={{ margin: 0 }}>{label(item.kind)}</h3>
                            {managementActions && (
                              <button
                                type="button"
                                className="mw-button"
                                style={{
                                  padding: "5px 10px",
                                  fontSize: 12,
                                }}
                                onClick={() => {
                                  setModalError("");
                                  setUpdateCaseTarget(item);
                                  setUpdateForm({
                                    status: item.status,
                                    notes: "",
                                  });
                                }}
                              >
                                <Edit3 size={12} /> Update Case
                              </button>
                            )}
                          </div>
                          <p>{item.notes}</p>
                          <div className="mw-meta">
                            <RecordTag status={item.status}>
                              {label(item.status)}
                            </RecordTag>
                            {item.student_id && (
                              <RecordTag>
                                Student: {resolveStudentName(item.student_id)}
                              </RecordTag>
                            )}
                            {item.lead_id && (
                              <RecordTag>
                                Lead: {resolveLeadName(item.lead_id)}
                              </RecordTag>
                            )}
                            {item.staff_id && (
                              <RecordTag>
                                Staff: {resolveStaffName(item.staff_id)}
                              </RecordTag>
                            )}
                            {item.assigned_to && (
                              <RecordTag>
                                Assigned: {resolveStaffName(item.assigned_to)}
                              </RecordTag>
                            )}
                            {item.due_at && (
                              <RecordTag>
                                Due {new Date(item.due_at).toLocaleString()}
                              </RecordTag>
                            )}
                            <RecordTag>Revision {item.revision}</RecordTag>
                          </div>
                          {item.kind === "trial_request" && (
                            <div className="mw-actions">
                              <Link className="mw-link" href="/operations">
                                Open Operations trial assignment
                              </Link>
                              {!hasScheduledTrial(item) && (
                                <span className="mw-hint">
                                  This task cannot be completed until an actual
                                  trial lesson is scheduled and appears in this
                                  scope.
                                </span>
                              )}
                            </div>
                          )}
                          {classroomLessons.length > 0 && (
                            <div className="mw-actions">
                              <span className="mw-hint">
                                Matching student lesson classrooms:
                              </span>
                              {classroomLessons.map((lesson) => (
                                <Link
                                  className="mw-link"
                                  key={lesson.id}
                                  href={`/classroom?lessonId=${encodeURIComponent(
                                    lesson.id
                                  )}`}
                                >
                                  Open classroom
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mw-empty">
                  <strong>
                    {allItems.length
                      ? `No ${label(caseFilter).toLowerCase()} cases`
                      : "No management cases in this scope"}
                  </strong>
                  <span>
                    {allItems.length
                      ? "Switch status tabs to inspect other cases."
                      : "New cases will appear here."}
                  </span>
                </div>
              )}
            </section>

            {/* Quality Coordination */}
            <section className="mw-support-section">
              <div className="mw-section-head">
                <div>
                  <h2>Quality coordination</h2>
                  <p>Scoped teaching and retention signals.</p>
                </div>
                <span className="mw-count">{qualityRows.length} staff</span>
              </div>
              {qualityRows.length ? (
                qualityRows.map((row) => (
                  <article className="mw-record" key={row.staffId}>
                    <div className="pw-person-inline">
                      <ProfileAvatar
                        profileId={row.staffId}
                        name={row.name}
                        size={32}
                      />
                      <div>
                        <h3>{row.name}</h3>
                        <div className="mw-meta">
                          <RecordTag>
                            {row.activeStudents == null
                              ? "Active students · Not enough observed history"
                              : `Active students · ${row.activeStudents}`}
                          </RecordTag>
                          <RecordTag>
                            {row.verifiedLessons == null
                              ? "Verified lessons · Not enough observed history"
                              : `Verified lessons · ${row.verifiedLessons}`}
                          </RecordTag>
                          <RecordTag>
                            {row.missedLessons == null
                              ? "Missed lessons · Not enough observed history"
                              : `Missed lessons · ${row.missedLessons}`}
                          </RecordTag>
                          <RecordTag>
                            {row.emptyBoards == null
                              ? "Empty boards · Not enough observed history"
                              : `Empty boards · ${row.emptyBoards}`}
                          </RecordTag>
                          <RecordTag>
                            {row.observedClasses == null
                              ? "Observed classes · Not enough observed history"
                              : `Observed classes · ${row.observedClasses}`}
                          </RecordTag>
                          <RecordTag>
                            {row.punctualPercent == null
                              ? "Punctuality · Not enough observed history"
                              : `Punctuality · ${row.punctualPercent}%`}
                          </RecordTag>
                          <RecordTag>
                            {row.retentionPercent == null
                              ? "Retention · Not enough observed history"
                              : `Retention · ${row.retentionPercent}%`}
                          </RecordTag>
                          <RecordTag>
                            {row.score == null
                              ? "Quality score · Not enough observed history"
                              : `Quality score · ${row.score}`}
                          </RecordTag>
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="mw-empty">
                  <strong>No quality records in this scope</strong>
                </div>
              )}
            </section>
          </div>

          <aside className="mw-stack mw-support-column">
            <div className="mw-support-ledgers">
              {/* Academy Operating Rules */}
              {ownerActions && (
                <section className="mw-support-section">
                  <div className="mw-section-head">
                    <div>
                      <h2>Academy Operating Rules</h2>
                      <p>
                        System thresholds and escalation timelines for academy
                        operations.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mw-button"
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={() => {
                        setModalError("");
                        setRulesForm({
                          stagnantDays: String(
                            snapshot?.rules?.stagnant_days ?? 30
                          ),
                          emptyBoardClasses: String(
                            snapshot?.rules?.empty_board_classes ?? 2
                          ),
                          followupHours: String(
                            snapshot?.rules?.followup_hours ?? 24
                          ),
                          escalationHours: String(
                            snapshot?.rules?.escalation_hours ?? 24
                          ),
                          lateGraceMinutes: String(
                            snapshot?.rules?.late_grace_minutes ?? 5
                          ),
                          notes: "",
                        });
                        setRulesModalOpen(true);
                      }}
                    >
                      <Sliders size={12} /> Edit Rules
                    </button>
                  </div>
                  {snapshot?.rules ? (
                    <div className="mw-rules-card-grid">
                      <div className="mw-rule-item">
                        <div className="mw-rule-icon">
                          <Clock size={15} />
                        </div>
                        <div className="mw-rule-content">
                          <div className="mw-rule-top">
                            <span className="mw-rule-title">
                              Lesson Late Grace
                            </span>
                            <span className="mw-rule-badge">
                              {snapshot.rules.late_grace_minutes} mins
                            </span>
                          </div>
                          <p className="mw-rule-desc">
                            Grace period of {snapshot.rules.late_grace_minutes}{" "}
                            minutes before a lesson is flagged late.
                          </p>
                        </div>
                      </div>
                      <div className="mw-rule-item">
                        <div className="mw-rule-icon">
                          <FileText size={15} />
                        </div>
                        <div className="mw-rule-content">
                          <div className="mw-rule-top">
                            <span className="mw-rule-title">
                              Classroom Board Notes
                            </span>
                            <span className="mw-rule-badge">
                              {snapshot.rules.empty_board_classes} classes
                            </span>
                          </div>
                          <p className="mw-rule-desc">
                            Alerts when notes are missing for{" "}
                            {snapshot.rules.empty_board_classes} consecutive
                            lessons.
                          </p>
                        </div>
                      </div>
                      <div className="mw-rule-item">
                        <div className="mw-rule-icon">
                          <MessageSquare size={15} />
                        </div>
                        <div className="mw-rule-content">
                          <div className="mw-rule-top">
                            <span className="mw-rule-title">
                              Trial Lead Contact
                            </span>
                            <span className="mw-rule-badge">
                              {snapshot.rules.followup_hours} hrs
                            </span>
                          </div>
                          <p className="mw-rule-desc">
                            Target window of {snapshot.rules.followup_hours}h to
                            contact prospective trial applicants.
                          </p>
                        </div>
                      </div>
                      <div className="mw-rule-item">
                        <div className="mw-rule-icon">
                          <AlertTriangle size={15} />
                        </div>
                        <div className="mw-rule-content">
                          <div className="mw-rule-top">
                            <span className="mw-rule-title">
                              Case Escalation
                            </span>
                            <span className="mw-rule-badge">
                              {snapshot.rules.escalation_hours} hrs
                            </span>
                          </div>
                          <p className="mw-rule-desc">
                            Unresolved items escalate to leadership after{" "}
                            {snapshot.rules.escalation_hours}h.
                          </p>
                        </div>
                      </div>
                      <div className="mw-rule-item">
                        <div className="mw-rule-icon">
                          <CalendarClock size={15} />
                        </div>
                        <div className="mw-rule-content">
                          <div className="mw-rule-top">
                            <span className="mw-rule-title">
                              Inactivity Review
                            </span>
                            <span className="mw-rule-badge">
                              {snapshot.rules.stagnant_days} days
                            </span>
                          </div>
                          <p className="mw-rule-desc">
                            Flags stagnant records without activity for{" "}
                            {snapshot.rules.stagnant_days} days.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mw-empty">
                      <strong>Rule settings unavailable</strong>
                      <span>
                        The snapshot did not return owner rule values.
                      </span>
                    </div>
                  )}
                </section>
              )}

              {/* Team & Hierarchy */}
              <section className="mw-support-section">
                <div className="mw-section-head">
                  <div>
                    <h2>Team &amp; Hierarchy</h2>
                    <p>Staff status, reporting lines, and student capacity.</p>
                  </div>
                  <span className="mw-count">
                    {staff.length} {staff.length === 1 ? "member" : "members"}
                  </span>
                </div>
                {staff.length ? (
                  staff.map((person) => {
                    const headName = person.head_admin_id
                      ? resolveStaffName(person.head_admin_id)
                      : null;
                    const isActivePerson = person.status === "active";
                    const canAssignHierarchy =
                      ownerActions &&
                      isActivePerson &&
                      (person.role === "admin" ||
                        (person.department !== "Music Education" &&
                          person.role !== "parent" &&
                          person.role !== "student" &&
                          person.role !== "super_admin"));
                    const canDeactivate =
                      ownerActions &&
                      isActivePerson &&
                      person.id !== snapshot?.profile.id &&
                      person.role !== "super_admin" &&
                      person.role !== "owner";

                    return (
                      <article className="mw-record" key={person.id}>
                        <div
                          className="pw-person-inline"
                          style={{ width: "100%", alignItems: "flex-start" }}
                        >
                          <ProfileAvatar
                            profileId={person.id}
                            name={person.name}
                            size={36}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <h3 style={{ margin: 0, fontSize: 13.5 }}>
                                {person.name}
                              </h3>
                              {isActivePerson ? (
                                <span className="mw-pill-active">
                                  <CheckCircle2 size={11} /> Active
                                </span>
                              ) : (
                                <RecordTag status={person.status}>
                                  {label(person.status)}
                                </RecordTag>
                              )}
                            </div>
                            <p
                              style={{
                                margin: "2px 0 0",
                                color: "#456154",
                                fontSize: 12,
                              }}
                            >
                              {formatRoleName(person.role)}
                              {headName ? ` · Reports to ${headName}` : ""}
                            </p>
                            <div
                              className="mw-meta"
                              style={{
                                marginTop: 6,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <span className="mw-sub-tag">
                                {person.quota === 0 || person.quota === null
                                  ? "Capacity: Unlimited"
                                  : `Capacity: ${person.quota} students`}
                              </span>
                              {(canAssignHierarchy || canDeactivate) && (
                                <div style={{ display: "flex", gap: 6 }}>
                                  {canAssignHierarchy && (
                                    <button
                                      type="button"
                                      className="mw-button"
                                      style={{
                                        padding: "3px 8px",
                                        fontSize: 11,
                                      }}
                                      onClick={() => {
                                        setModalError("");
                                        setHierarchyTarget(person);
                                        setHierarchyForm({
                                          headId: person.head_admin_id || "",
                                          quota: String(person.quota ?? 0),
                                          notes: "",
                                        });
                                      }}
                                    >
                                      <UserCog size={11} /> Supervisor / Quota
                                    </button>
                                  )}
                                  {canDeactivate && (
                                    <button
                                      type="button"
                                      className="mw-button danger"
                                      style={{
                                        padding: "3px 8px",
                                        fontSize: 11,
                                      }}
                                      onClick={() => {
                                        setModalError("");
                                        setDeactivateTarget(person);
                                        setDeactivateForm({
                                          notes: "",
                                          confirmText: "",
                                        });
                                      }}
                                    >
                                      <UserX size={11} /> Deactivate
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="mw-empty-clean">
                    <Users size={18} className="mw-empty-icon" />
                    <strong>No team members found</strong>
                    <span>
                      Team listings are scoped to your management permissions.
                    </span>
                  </div>
                )}
              </section>

              {/* Academy Announcements */}
              <section className="mw-support-section">
                <div className="mw-section-head">
                  <div>
                    <h2>Academy Announcements</h2>
                    <p>
                      Active bulletins published for teachers, staff, or
                      families.
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="mw-count">
                      {snapshot?.announcements.length || 0} active
                    </span>
                    {canManageAnnouncements && (
                      <button
                        type="button"
                        className="mw-button primary"
                        style={{ padding: "5px 10px", fontSize: 12 }}
                        onClick={() => {
                          setModalError("");
                          setAnnouncementForm({
                            title: "",
                            body: "",
                            expiresAt: "",
                            roles: [],
                          });
                          setAnnouncementModalOpen(true);
                        }}
                      >
                        <Plus size={12} /> + New Announcement
                      </button>
                    )}
                  </div>
                </div>
                {(snapshot?.announcements || []).length ? (
                  snapshot?.announcements.map((item) => (
                    <article className="mw-record" key={item.id}>
                      <div style={{ width: "100%" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <h3 style={{ margin: 0 }}>{item.title}</h3>
                          {canManageAnnouncements && (
                            <button
                              type="button"
                              className="mw-button"
                              style={{
                                padding: "3px 8px",
                                fontSize: 11,
                                flexShrink: 0,
                              }}
                              onClick={() => handleArchiveAnnouncement(item)}
                            >
                              <Archive size={11} /> Archive
                            </button>
                          )}
                        </div>
                        <p>{item.body}</p>
                        <div className="mw-meta">
                          {item.roles.map((role) => (
                            <RecordTag key={role}>
                              {formatRoleName(role)}
                            </RecordTag>
                          ))}
                          <RecordTag status="pending">
                            Expires{" "}
                            {new Date(item.expires_at).toLocaleDateString()}
                          </RecordTag>
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="mw-empty-clean">
                    <Bell size={18} className="mw-empty-icon" />
                    <strong>No active announcements</strong>
                    <span>
                      Broadcast notices published to academy portals will show
                      here.
                    </span>
                  </div>
                )}
              </section>

              {/* Students & Inquiries */}
              <section className="mw-support-section">
                <div className="mw-section-head">
                  <div>
                    <h2>Students &amp; Inquiries</h2>
                    <p>
                      Quick reference of enrolled students and prospective trial
                      inquiries.
                    </p>
                  </div>
                </div>
                <div className="mw-stat-row">
                  <div className="mw-stat-pill">
                    <Users size={14} />
                    <span>
                      <strong>{students.length}</strong> Enrolled Students
                    </span>
                  </div>
                  <div className="mw-stat-pill">
                    <UserCheck size={14} />
                    <span>
                      <strong>{leads.length}</strong> Trial Inquiries
                    </span>
                  </div>
                </div>
                {students.slice(0, 5).map((row) => (
                  <article className="mw-record" key={row.id}>
                    <div className="pw-person-inline">
                      <ProfileAvatar
                        name={payloadName(row.payload, "Student record")}
                        size={30}
                      />
                      <div>
                        <h3>{payloadName(row.payload, "Student record")}</h3>
                        <p>Enrolled Student</p>
                      </div>
                    </div>
                  </article>
                ))}
                {leads.slice(0, 5).map((row) => (
                  <article className="mw-record" key={row.id}>
                    <div className="pw-person-inline">
                      <ProfileAvatar
                        name={payloadName(row.payload, "Lead record")}
                        size={30}
                      />
                      <div>
                        <h3>{payloadName(row.payload, "Lead record")}</h3>
                        <p>Prospective Trial Inquiry</p>
                      </div>
                    </div>
                  </article>
                ))}
                {!students.length && !leads.length && (
                  <div className="mw-empty-clean">
                    <Inbox size={18} className="mw-empty-icon" />
                    <strong>No linked records yet</strong>
                    <span>
                      Newly registered students and incoming trial leads will
                      display here.
                    </span>
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>

        <footer className="mw-actions" style={{ marginTop: 24 }}>
          <span className="mw-hint">
            ProsperWork Music Concepts · account-scoped management
          </span>
        </footer>
      </div>

      {/* ========== CONTEXTUAL MODALS ========== */}

      {/* Open Case Modal */}
      <PortalModal
        open={openCaseModal}
        onClose={() => {
          setOpenCaseModal(false);
          setModalError("");
        }}
        eyebrow="Management casework"
        title="Open a case"
        subtitle="Create a tracked case and assign an active staff owner."
        size="lg"
        busy={busy}
      >
        <form className="mw-form" onSubmit={(e) => void handleCreateCase(e)}>
          {modalError && (
            <div className="mw-banner error mw-field full" role="alert">
              {modalError}
            </div>
          )}
          <div className="mw-field">
            <label htmlFor="case-kind">Case type *</label>
            <select
              id="case-kind"
              required
              value={caseForm.kind}
              onChange={(e) =>
                setCaseForm({ ...caseForm, kind: e.target.value })
              }
            >
              {visibleKinds.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
            {caseForm.kind === "trial_request" && (
              <Link className="mw-link" href="/operations">
                Schedule and assign the trial in Operations →
              </Link>
            )}
          </div>
          <div className="mw-field">
            <label htmlFor="case-assigned">Owner / follow-through *</label>
            <select
              id="case-assigned"
              required
              value={caseForm.assignedTo}
              onChange={(e) =>
                setCaseForm({ ...caseForm, assignedTo: e.target.value })
              }
            >
              <option value="">Choose staff…</option>
              {activeStaff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {formatRoleName(person.role)}
                </option>
              ))}
            </select>
          </div>
          <div className="mw-field">
            <label htmlFor="case-student">Linked student (optional)</label>
            <select
              id="case-student"
              value={caseForm.studentId}
              onChange={(e) =>
                setCaseForm({ ...caseForm, studentId: e.target.value })
              }
            >
              <option value="">None</option>
              {students.map((row) => (
                <option key={row.id} value={row.id}>
                  {payloadName(row.payload, "Student")}
                </option>
              ))}
            </select>
          </div>
          <div className="mw-field">
            <label htmlFor="case-lead">Linked lead (optional)</label>
            <select
              id="case-lead"
              value={caseForm.leadId}
              onChange={(e) =>
                setCaseForm({ ...caseForm, leadId: e.target.value })
              }
            >
              <option value="">None</option>
              {leads.map((row) => (
                <option key={row.id} value={row.id}>
                  {payloadName(row.payload, "Lead")}
                </option>
              ))}
            </select>
          </div>
          <div className="mw-field">
            <label htmlFor="case-staff">
              Staff member involved (optional)
            </label>
            <select
              id="case-staff"
              value={caseForm.staffId}
              onChange={(e) =>
                setCaseForm({ ...caseForm, staffId: e.target.value })
              }
            >
              <option value="">None</option>
              {activeStaff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {formatRoleName(person.role)}
                </option>
              ))}
            </select>
          </div>
          <div className="mw-field">
            <label htmlFor="case-at">Follow-up date and time *</label>
            <input
              id="case-at"
              type="datetime-local"
              required
              value={caseForm.at}
              onChange={(e) => setCaseForm({ ...caseForm, at: e.target.value })}
            />
          </div>
          <div className="mw-field full">
            <label htmlFor="case-slots">
              Preferred / proposed slots (one per line, optional)
            </label>
            <textarea
              id="case-slots"
              rows={2}
              value={caseForm.slots}
              onChange={(e) =>
                setCaseForm({ ...caseForm, slots: e.target.value })
              }
              placeholder="For trial requests, add the family's preferred slots here."
            />
          </div>
          <div className="mw-field full">
            <label htmlFor="case-notes">Reason and case notes *</label>
            <textarea
              id="case-notes"
              rows={3}
              required
              minLength={5}
              maxLength={4000}
              value={caseForm.notes}
              onChange={(e) =>
                setCaseForm({ ...caseForm, notes: e.target.value })
              }
              placeholder="At least 5 characters. Keep sensitive family details out."
            />
          </div>
          <div className="modal-actions mw-field full" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="mw-button"
              onClick={() => setOpenCaseModal(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="mw-button primary"
              disabled={busy}
            >
              {busy ? "Creating…" : "Open Case"}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Update Case Modal (Pre-bound to clicked case) */}
      <PortalModal
        open={Boolean(updateCaseTarget)}
        onClose={() => {
          setUpdateCaseTarget(null);
          setModalError("");
        }}
        eyebrow="Update case"
        title={
          updateCaseTarget
            ? `Update ${label(updateCaseTarget.kind)}`
            : "Update case"
        }
        subtitle={
          updateCaseTarget
            ? `Current status: ${label(updateCaseTarget.status)} · Revision ${
                updateCaseTarget.revision
              }`
            : undefined
        }
        size="md"
        busy={busy}
      >
        {updateCaseTarget && (
          <form
            className="mw-form"
            onSubmit={(e) => void handleUpdateCase(e)}
          >
            {modalError && (
              <div className="mw-banner error mw-field full" role="alert">
                {modalError}
              </div>
            )}
            <div className="mw-field full">
              <label htmlFor="update-status">New status *</label>
              <select
                id="update-status"
                required
                value={updateForm.status}
                onChange={(e) =>
                  setUpdateForm({
                    ...updateForm,
                    status: e.target.value as DeskItem["status"],
                  })
                }
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="mw-field full">
              <label htmlFor="update-notes">Reason and update *</label>
              <textarea
                id="update-notes"
                rows={4}
                required
                minLength={5}
                maxLength={4000}
                value={updateForm.notes}
                onChange={(e) =>
                  setUpdateForm({ ...updateForm, notes: e.target.value })
                }
                placeholder="Describe progress or resolution (min 5 characters)."
              />
            </div>
            <div
              className="modal-actions mw-field full"
              style={{ marginTop: 4 }}
            >
              <button
                type="button"
                className="mw-button"
                onClick={() => setUpdateCaseTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="mw-button primary"
                disabled={busy}
              >
                {busy ? "Saving…" : "Save Case Update"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>

      {/* New Announcement Modal */}
      <PortalModal
        open={announcementModalOpen}
        onClose={() => {
          setAnnouncementModalOpen(false);
          setModalError("");
        }}
        eyebrow="Academy broadcast"
        title="New announcement"
        subtitle="Publish an expiry-scoped bulletin to selected portal roles."
        size="md"
        busy={busy}
      >
        <form
          className="mw-form"
          onSubmit={(e) => void handlePublishAnnouncement(e)}
        >
          {modalError && (
            <div className="mw-banner error mw-field full" role="alert">
              {modalError}
            </div>
          )}
          <div className="mw-field">
            <label htmlFor="ann-title">Announcement title *</label>
            <input
              id="ann-title"
              required
              value={announcementForm.title}
              onChange={(e) =>
                setAnnouncementForm({
                  ...announcementForm,
                  title: e.target.value,
                })
              }
            />
          </div>
          <div className="mw-field">
            <label htmlFor="ann-expires">Expires at *</label>
            <input
              id="ann-expires"
              type="datetime-local"
              required
              value={announcementForm.expiresAt}
              onChange={(e) =>
                setAnnouncementForm({
                  ...announcementForm,
                  expiresAt: e.target.value,
                })
              }
            />
          </div>
          <div className="mw-field full">
            <label htmlFor="ann-body">Message *</label>
            <textarea
              id="ann-body"
              rows={3}
              required
              value={announcementForm.body}
              onChange={(e) =>
                setAnnouncementForm({
                  ...announcementForm,
                  body: e.target.value,
                })
              }
            />
          </div>
          <div className="mw-field full">
            <label>Audience roles *</label>
            <div className="mw-checkboxes">
              {roles.map((role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={announcementForm.roles.includes(role)}
                    onChange={(event) =>
                      setAnnouncementForm((current) => ({
                        ...current,
                        roles: event.target.checked
                          ? [...current.roles, role]
                          : current.roles.filter((value) => value !== role),
                      }))
                    }
                  />
                  {formatRoleName(role)}
                </label>
              ))}
            </div>
          </div>
          <div className="modal-actions mw-field full" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="mw-button"
              onClick={() => setAnnouncementModalOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="mw-button primary"
              disabled={busy}
            >
              {busy ? "Publishing…" : "Publish Announcement"}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Edit Operating Rules Modal */}
      <PortalModal
        open={rulesModalOpen}
        onClose={() => {
          setRulesModalOpen(false);
          setModalError("");
        }}
        eyebrow="Owner thresholds"
        title="Edit academy operating rules"
        subtitle="Configure automated SLA and escalation intervals."
        size="md"
        busy={busy}
      >
        <form className="mw-form" onSubmit={(e) => void handleSaveRules(e)}>
          {modalError && (
            <div className="mw-banner error mw-field full" role="alert">
              {modalError}
            </div>
          )}
          <div className="mw-field">
            <label htmlFor="rule-grace">Late arrival grace (0–60 mins) *</label>
            <input
              id="rule-grace"
              type="number"
              min={0}
              max={60}
              step={1}
              required
              value={rulesForm.lateGraceMinutes}
              onChange={(e) =>
                setRulesForm({ ...rulesForm, lateGraceMinutes: e.target.value })
              }
            />
          </div>
          <div className="mw-field">
            <label htmlFor="rule-boards">
              Empty boards before review (1–10) *
            </label>
            <input
              id="rule-boards"
              type="number"
              min={1}
              max={10}
              step={1}
              required
              value={rulesForm.emptyBoardClasses}
              onChange={(e) =>
                setRulesForm({
                  ...rulesForm,
                  emptyBoardClasses: e.target.value,
                })
              }
            />
          </div>
          <div className="mw-field">
            <label htmlFor="rule-followup">Follow-up window (1–168 hrs) *</label>
            <input
              id="rule-followup"
              type="number"
              min={1}
              max={168}
              step={1}
              required
              value={rulesForm.followupHours}
              onChange={(e) =>
                setRulesForm({ ...rulesForm, followupHours: e.target.value })
              }
            />
          </div>
          <div className="mw-field">
            <label htmlFor="rule-escalation">
              Escalation interval (1–168 hrs) *
            </label>
            <input
              id="rule-escalation"
              type="number"
              min={1}
              max={168}
              step={1}
              required
              value={rulesForm.escalationHours}
              onChange={(e) =>
                setRulesForm({ ...rulesForm, escalationHours: e.target.value })
              }
            />
          </div>
          <div className="mw-field full">
            <label htmlFor="rule-stagnant">
              Days before an item is considered stagnant (1–365) *
            </label>
            <input
              id="rule-stagnant"
              type="number"
              min={1}
              max={365}
              step={1}
              required
              value={rulesForm.stagnantDays}
              onChange={(e) =>
                setRulesForm({ ...rulesForm, stagnantDays: e.target.value })
              }
            />
          </div>
          <div className="mw-field full">
            <label htmlFor="rule-notes">Reason for changing rules *</label>
            <textarea
              id="rule-notes"
              rows={3}
              required
              minLength={5}
              value={rulesForm.notes}
              onChange={(e) =>
                setRulesForm({ ...rulesForm, notes: e.target.value })
              }
            />
          </div>
          <div className="modal-actions mw-field full" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="mw-button"
              onClick={() => setRulesModalOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="mw-button primary"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save Operating Rules"}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Assign Supervisor / Quota Modal */}
      <PortalModal
        open={Boolean(hierarchyTarget)}
        onClose={() => {
          setHierarchyTarget(null);
          setModalError("");
        }}
        eyebrow="Team hierarchy"
        title={
          hierarchyTarget
            ? `Supervisor & quota · ${hierarchyTarget.name}`
            : "Assign supervisor & quota"
        }
        subtitle={
          hierarchyTarget ? formatRoleName(hierarchyTarget.role) : undefined
        }
        size="md"
        busy={busy}
      >
        {hierarchyTarget && (
          <form
            className="mw-form"
            onSubmit={(e) => void handleSaveHierarchy(e)}
          >
            {modalError && (
              <div className="mw-banner error mw-field full" role="alert">
                {modalError}
              </div>
            )}
            <div className="mw-field">
              <label htmlFor="hier-head">Head administrator *</label>
              <select
                id="hier-head"
                required
                value={hierarchyForm.headId}
                onChange={(e) =>
                  setHierarchyForm({ ...hierarchyForm, headId: e.target.value })
                }
              >
                <option value="">Choose supervisor…</option>
                {hierarchyOptions.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {formatRoleName(person.role)}
                  </option>
                ))}
              </select>
            </div>
            <div className="mw-field">
              <label htmlFor="hier-quota">Monthly quota (0–1000) *</label>
              <input
                id="hier-quota"
                type="number"
                min={0}
                max={1000}
                step={1}
                required
                value={hierarchyForm.quota}
                onChange={(e) =>
                  setHierarchyForm({ ...hierarchyForm, quota: e.target.value })
                }
              />
            </div>
            <div className="mw-field full">
              <label htmlFor="hier-notes">
                Reason for assignment / quota *
              </label>
              <textarea
                id="hier-notes"
                rows={3}
                required
                minLength={5}
                value={hierarchyForm.notes}
                onChange={(e) =>
                  setHierarchyForm({ ...hierarchyForm, notes: e.target.value })
                }
              />
            </div>
            <div
              className="modal-actions mw-field full"
              style={{ marginTop: 4 }}
            >
              <button
                type="button"
                className="mw-button"
                onClick={() => setHierarchyTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="mw-button primary"
                disabled={busy}
              >
                {busy ? "Saving…" : "Save Assignment"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>

      {/* Deactivate Staff Danger Modal */}
      <PortalModal
        open={Boolean(deactivateTarget)}
        onClose={() => {
          setDeactivateTarget(null);
          setModalError("");
        }}
        eyebrow="Owner danger action"
        title={
          deactivateTarget
            ? `Deactivate ${deactivateTarget.name}?`
            : "Deactivate staff"
        }
        subtitle={
          deactivateTarget
            ? `${formatRoleName(
                deactivateTarget.role
              )} · immediately revokes active portal access`
            : undefined
        }
        size="sm"
        busy={busy}
      >
        {deactivateTarget && (
          <form
            className="mw-form"
            onSubmit={(e) => void handleDeactivateStaff(e)}
          >
            {modalError && (
              <div className="mw-banner error mw-field full" role="alert">
                {modalError}
              </div>
            )}
            <div className="mw-field full">
              <label htmlFor="deact-notes">Reason for deactivation *</label>
              <textarea
                id="deact-notes"
                rows={3}
                required
                minLength={5}
                value={deactivateForm.notes}
                onChange={(e) =>
                  setDeactivateForm({ ...deactivateForm, notes: e.target.value })
                }
              />
            </div>
            <div className="mw-field full">
              <label htmlFor="deact-confirm">
                Explicit confirmation — type <strong>DEACTIVATE</strong> *
              </label>
              <input
                id="deact-confirm"
                required
                autoComplete="off"
                placeholder="DEACTIVATE"
                value={deactivateForm.confirmText}
                onChange={(e) =>
                  setDeactivateForm({
                    ...deactivateForm,
                    confirmText: e.target.value,
                  })
                }
              />
            </div>
            <div
              className="modal-actions mw-field full"
              style={{ marginTop: 4 }}
            >
              <button
                type="button"
                className="mw-button"
                onClick={() => setDeactivateTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="mw-button primary danger"
                disabled={busy || deactivateForm.confirmText !== "DEACTIVATE"}
              >
                {busy ? "Deactivating…" : "Confirm Deactivation"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>

      <ConfirmDialog />
    </main>
  );
}
