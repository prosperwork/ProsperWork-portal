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
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import ProfileAvatar from "@/app/_components/ProfileAvatar";

type Staff = {
  id: string;
  name: string;
  role: string;
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
  profile: { id: string; name: string; role: string; status: string };
  staff: Staff[];
  items: DeskItem[];
  announcements: Announcement[];
  quality: QualityRow[];
  rules?: RuleSettings | null;
  lessons?: ScheduledLesson[];
  students: { id: string; payload: Record<string, unknown> }[];
  leads: { id: string; payload: Record<string, unknown> }[];
};
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  full?: boolean;
  hint?: string;
  min?: number;
  max?: number;
};
type ActionKind =
  | "rules"
  | "create"
  | "update"
  | "hierarchy"
  | "announcement"
  | "announcement_archive"
  | "emergency_cover"
  | "deactivate"
  | "preview";
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
const actionOptions: { value: ActionKind; label: string }[] = [
  { value: "rules", label: "Owner · management thresholds" },
  { value: "create", label: "Open a case" },
  { value: "update", label: "Update a case" },
  { value: "hierarchy", label: "Owner · hierarchy & quota" },
  { value: "announcement", label: "Publish announcement" },
  { value: "announcement_archive", label: "Archive announcement" },
  { value: "emergency_cover", label: "One-class emergency cover" },
  { value: "deactivate", label: "Deactivate staff" },
  { value: "preview", label: "Read-only profile preview" },
];
const label = (value: string) => value.replaceAll("_", " ");
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

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={`mw-field${field.full ? " full" : ""}`}>
      <label htmlFor={`mw-${field.name}`}>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      {field.type === "textarea" ? (
        <textarea
          id={`mw-${field.name}`}
          required={field.required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={field.name === "notes" ? 4000 : 4000}
          placeholder={field.hint}
        />
      ) : field.type === "select" ? (
        <select
          id={`mw-${field.name}`}
          required={field.required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`mw-${field.name}`}
          type={field.type || "text"}
          required={field.required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          min={field.type === "number" ? String(field.min ?? 0) : undefined}
          max={field.type === "number" ? String(field.max ?? 1000) : undefined}
          step={field.type === "number" ? "1" : undefined}
          placeholder={field.hint}
        />
      )}
      {field.hint && field.type !== "textarea" && (
        <span className="mw-hint">{field.hint}</span>
      )}
    </div>
  );
}
function RecordTag({
  children,
  status = "",
}: {
  children: ReactNode;
  status?: string;
}) {
  const tone = ["completed", "active"].includes(status)
    ? ""
    : ["cancelled", "inactive"].includes(status)
    ? "red"
    : ["open", "in_progress", "pending"].includes(status)
    ? "amber"
    : "";
  return <span className={`mw-tag ${tone}`}>{children}</span>;
}

export default function ManagementPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ActionKind | "">("");
  const [kind, setKind] = useState(kinds[0]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [announcementRoles, setAnnouncementRoles] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [confirmText, setConfirmText] = useState("");

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

  const staff = snapshot?.staff || [];
  const activeStaff = staff.filter((person) => person.status === "active");
  const students = snapshot?.students || [];
  const leads = snapshot?.leads || [];
  const lessons = snapshot?.lessons || [];
  const pendingLessons = lessons.filter((lesson) => {
    const status = String(lesson.payload.status || "").toLowerCase();
    return status === "scheduled" && !!lesson.student_id;
  });
  const staffChoices = activeStaff.map((person) => ({
    value: person.id,
    label: `${person.name} · ${label(person.role)}`,
  }));
  const itemChoices = (snapshot?.items || []).map((item) => ({
    value: item.id,
    label: `${label(item.kind)} · ${item.id.slice(0, 8)} · ${item.status}`,
  }));
  const currentRole = snapshot?.profile.role || "";
  const ownerActions = currentRole === "super_admin";
  const managementActions = [
    "super_admin",
    "head_admin",
    "admin",
    "general_manager",
    "sales_marketing",
    "qc",
  ].includes(currentRole);
  const visibleKinds =
    currentRole === "sales_marketing"
      ? ["trial_request", "callback", "nursery", "winback", "exit_feedback"]
      : currentRole === "qc"
      ? ["shadow_request", "personal_teaching"]
      : currentRole === "head_admin"
      ? kinds
      : kinds;
  const visibleActions = actionOptions.filter((option) => {
    if (option.value === "create" || option.value === "update")
      return managementActions;
    if (
      option.value === "hierarchy" ||
      option.value === "deactivate" ||
      option.value === "rules"
    )
      return ownerActions;
    if (
      option.value === "announcement" ||
      option.value === "announcement_archive"
    )
      return ownerActions || currentRole === "head_admin";
    if (option.value === "emergency_cover")
      return ownerActions || ["head_admin", "admin"].includes(currentRole);
    if (option.value === "preview")
      return ownerActions || currentRole === "head_admin";
    return false;
  });
  const hierarchyOptions = staff
    .filter(
      (person) => person.role === "head_admin" && person.status === "active"
    )
    .map((person) => ({ value: person.id, label: person.name }));
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

  const createFields: Field[] = [
    {
      name: "kind",
      label: "Case type",
      type: "select",
      required: true,
      options: visibleKinds.map((value) => ({ value, label: label(value) })),
    },
    {
      name: "assignedTo",
      label: "Owner / follow-through",
      type: "select",
      required: true,
      options: staffChoices,
    },
    {
      name: "studentId",
      label: "Linked student",
      type: "select",
      options: students.map((row) => ({
        value: row.id,
        label: payloadName(row.payload, row.id),
      })),
    },
    {
      name: "leadId",
      label: "Linked lead",
      type: "select",
      options: leads.map((row) => ({
        value: row.id,
        label: payloadName(row.payload, row.id),
      })),
    },
    {
      name: "staffId",
      label: "Staff member involved (optional)",
      type: "select",
      options: staffChoices,
    },
    {
      name: "at",
      label: "Follow-up date and time",
      type: "datetime-local",
      required: true,
    },
    {
      name: "slots",
      label:
        "Preferred / proposed slots (one ISO date-time or local date-time per line)",
      type: "textarea",
      full: true,
      hint: "For trial requests, add the family's preferred slots here.",
    },
    {
      name: "notes",
      label: "Reason and case notes",
      type: "textarea",
      required: true,
      full: true,
      hint: "At least 5 characters. Keep sensitive family details out.",
    },
  ];
  const fieldsForAction = (): Field[] => {
    switch (action) {
      case "rules":
        return [
          {
            name: "stagnantDays",
            label: "Days before an item is considered stagnant",
            type: "number",
            required: true,
            min: 1,
            max: 365,
            hint: "1–365",
          },
          {
            name: "emptyBoardClasses",
            label: "Consecutive empty boards before review",
            type: "number",
            required: true,
            min: 1,
            max: 10,
            hint: "1–10 classes",
          },
          {
            name: "followupHours",
            label: "Follow-up interval",
            type: "number",
            required: true,
            min: 1,
            max: 168,
            hint: "1–168 hours",
          },
          {
            name: "escalationHours",
            label: "Escalation interval",
            type: "number",
            required: true,
            min: 1,
            max: 168,
            hint: "1–168 hours",
          },
          {
            name: "lateGraceMinutes",
            label: "Late arrival grace period",
            type: "number",
            required: true,
            min: 0,
            max: 60,
            hint: "0–60 minutes",
          },
          {
            name: "notes",
            label: "Reason for changing owner rules",
            type: "textarea",
            required: true,
            full: true,
          },
        ];
      case "create":
        return createFields;
      case "update":
        return [
          {
            name: "id",
            label: "Case record",
            type: "select",
            required: true,
            options: itemChoices,
          },
          {
            name: "status",
            label: "New status",
            type: "select",
            required: true,
            options: ["open", "in_progress", "completed", "cancelled"].map(
              (value) => ({ value, label: label(value) })
            ),
          },
          {
            name: "notes",
            label: "Reason and update",
            type: "textarea",
            required: true,
            full: true,
          },
        ];
      case "hierarchy":
        return [
          {
            name: "adminId",
            label: "Administrator",
            type: "select",
            required: true,
            options: staff
              .filter(
                (person) =>
                  person.role === "admin" && person.status === "active"
              )
              .map((person) => ({ value: person.id, label: person.name })),
          },
          {
            name: "headId",
            label: "Head administrator",
            type: "select",
            required: true,
            options: hierarchyOptions,
          },
          {
            name: "quota",
            label: "Monthly quota",
            type: "number",
            required: true,
            hint: "0–1000",
          },
          {
            name: "notes",
            label: "Reason for this assignment / quota",
            type: "textarea",
            required: true,
            full: true,
          },
        ];
      case "announcement":
        return [
          { name: "title", label: "Announcement title", required: true },
          {
            name: "expiresAt",
            label: "Expires at",
            type: "datetime-local",
            required: true,
          },
          {
            name: "body",
            label: "Message",
            type: "textarea",
            required: true,
            full: true,
          },
        ];
      case "announcement_archive":
        return [
          {
            name: "id",
            label: "Announcement",
            type: "select",
            required: true,
            options: (snapshot?.announcements || []).map((row) => ({
              value: row.id,
              label: row.title,
            })),
          },
          {
            name: "notes",
            label: "Reason for archiving",
            type: "textarea",
            required: true,
            full: true,
          },
        ];
      case "emergency_cover":
        return [
          {
            name: "lessonId",
            label: "Scheduled lesson requiring cover",
            type: "select",
            required: true,
            hint: "Only actual scheduled lessons returned in your account-scoped management snapshot appear here.",
            options: pendingLessons.map((lesson) => {
              const student = students.find(
                (row) => row.id === lesson.student_id
              );
              const start = lesson.payload.startsAt || lesson.payload.starts_at;
              return {
                value: lesson.id,
                label: `${
                  student
                    ? payloadName(student.payload, "Student")
                    : "Scheduled lesson"
                } · ${
                  start ? new Date(String(start)).toLocaleString() : lesson.id
                }`,
              };
            }),
          },
          {
            name: "teacherId",
            label: "Cover teacher",
            type: "select",
            required: true,
            options: activeStaff
              .filter((person) => ["teacher", "qc"].includes(person.role))
              .map((person) => ({
                value: person.id,
                label: `${person.name}${
                  person.role === "qc" ? " · QC tutor" : ""
                }`,
              })),
          },
          {
            name: "adminId",
            label: "Coordinating administrator",
            type: "select",
            required: true,
            options: staff
              .filter(
                (person) =>
                  ["admin", "head_admin", "super_admin"].includes(
                    person.role
                  ) && person.status === "active"
              )
              .map((person) => ({ value: person.id, label: person.name })),
          },
          {
            name: "notes",
            label: "Reason for emergency cover",
            type: "textarea",
            required: true,
            full: true,
          },
        ];
      case "deactivate":
        return [
          {
            name: "staffId",
            label: "Staff account",
            type: "select",
            required: true,
            options: activeStaff.map((person) => ({
              value: person.id,
              label: `${person.name} · ${label(person.role)}`,
            })),
          },
          {
            name: "notes",
            label: "Reason for deactivation",
            type: "textarea",
            required: true,
            full: true,
          },
        ];
      case "preview":
        return [
          {
            name: "staffId",
            label: "Staff profile to inspect",
            type: "select",
            required: true,
            options: staff.map((person) => ({
              value: person.id,
              label: `${person.name} · ${label(person.role)}`,
            })),
          },
          {
            name: "notes",
            label: "Reason for preview",
            type: "textarea",
            required: true,
            full: true,
          },
        ];
      default:
        return [];
    }
  };
  const fields = fieldsForAction();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError("");
    setNotice("");
    setPreview(null);
    if (!action) return;
    if (
      (action === "rules" ||
        action === "create" ||
        action === "update" ||
        action === "hierarchy" ||
        action === "announcement_archive" ||
        action === "emergency_cover" ||
        action === "deactivate" ||
        action === "preview") &&
      (values.notes || "").trim().length < 5
    ) {
      setActionError("A written reason of at least 5 characters is required.");
      return;
    }
    if (action === "deactivate" && confirmText !== "DEACTIVATE") {
      setActionError("Type DEACTIVATE exactly to confirm this account change.");
      return;
    }
    let payload: Record<string, unknown>;
    if (action === "rules") {
      payload = {
        action,
        stagnantDays: Number(values.stagnantDays),
        emptyBoardClasses: Number(values.emptyBoardClasses),
        followupHours: Number(values.followupHours),
        escalationHours: Number(values.escalationHours),
        lateGraceMinutes: Number(values.lateGraceMinutes),
        notes: values.notes?.trim(),
      };
    } else if (action === "create") {
      const rawSlots = (values.slots || "")
        .split(/\n/)
        .map((value) => value.trim())
        .filter(Boolean);
      const slots = rawSlots.map((value) => {
        const parsed = /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)
          ? new Date(value).toISOString()
          : value;
        return parsed;
      });
      payload = {
        action,
        kind:
          values.kind || (visibleKinds.includes(kind) ? kind : visibleKinds[0]),
        assignedTo: values.assignedTo,
        at: toISO(values.at || ""),
        slots,
        notes: values.notes?.trim(),
        ...(values.studentId ? { studentId: values.studentId } : {}),
        ...(values.leadId ? { leadId: values.leadId } : {}),
        ...(values.staffId ? { staffId: values.staffId } : {}),
      };
    } else if (action === "update") {
      const item = snapshot?.items.find((row) => row.id === values.id);
      if (!item) {
        setActionError("Select an existing case from the current snapshot.");
        return;
      }
      if (
        item.kind === "trial_request" &&
        values.status === "completed" &&
        !hasScheduledTrial(item)
      ) {
        setActionError(
          "Schedule the trial through Operations before completing this task. The linked scheduled lesson must be present in the authorized snapshot."
        );
        return;
      }
      payload = {
        action,
        id: values.id,
        revision: item.revision,
        status: values.status,
        notes: values.notes?.trim(),
      };
    } else if (action === "hierarchy") {
      payload = {
        action,
        adminId: values.adminId,
        headId: values.headId,
        quota: Number(values.quota),
        notes: values.notes?.trim(),
      };
    } else if (action === "announcement") {
      if (!announcementRoles.length) {
        setActionError("Choose at least one audience role.");
        return;
      }
      payload = {
        action,
        title: values.title?.trim(),
        body: values.body?.trim(),
        roles: announcementRoles,
        expiresAt: toISO(values.expiresAt || ""),
      };
    } else if (action === "announcement_archive") {
      payload = { action, id: values.id, notes: values.notes?.trim() };
    } else if (action === "emergency_cover") {
      payload = {
        action,
        lessonId: values.lessonId?.trim(),
        teacherId: values.teacherId,
        adminId: values.adminId,
        notes: values.notes?.trim(),
      };
    } else if (action === "deactivate") {
      payload = {
        action,
        staffId: values.staffId,
        confirm: "DEACTIVATE",
        notes: values.notes?.trim(),
      };
    } else {
      payload = {
        action,
        staffId: values.staffId,
        notes: values.notes?.trim(),
      };
    }
    setBusy(true);
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
      if (action === "preview") {
        setPreview(
          (result.result && typeof result.result === "object"
            ? result.result
            : result) as Record<string, unknown>
        );
        setNotice(
          "Read-only profile preview loaded. This is not a real target session; your sign-in remains unchanged."
        );
      } else {
        setNotice(
          "Change submitted. The authorized snapshot has been refreshed."
        );
        setValues({});
        setConfirmText("");
        setAnnouncementRoles([]);
        await reload();
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "That action could not be completed."
      );
    } finally {
      setBusy(false);
    }
  };

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
          <div className="mw-intro-actions">
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
              <AlertCircle size={14} /> Complaints & Support
            </Link>
            <button
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
        {actionError && (
          <div className="mw-banner error" role="alert">
            {actionError}
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
            <section className="mw-card mw-action-card">
              <div className="mw-section-head">
                <h2>Management actions</h2>
              </div>
              <details className="mw-action-details">
                <summary>Start an action</summary>
                <div className="mw-field">
                  <label htmlFor="mw-action">Workflow action</label>
                  <select
                    id="mw-action"
                    value={
                      visibleActions.some((option) => option.value === action)
                        ? action
                        : ""
                    }
                    onChange={(event) => {
                      const next = event.target.value as ActionKind | "";
                      setAction(next);
                      setValues(
                        next === "rules" && snapshot?.rules
                          ? {
                              stagnantDays: String(
                                snapshot.rules.stagnant_days
                              ),
                              emptyBoardClasses: String(
                                snapshot.rules.empty_board_classes
                              ),
                              followupHours: String(
                                snapshot.rules.followup_hours
                              ),
                              escalationHours: String(
                                snapshot.rules.escalation_hours
                              ),
                              lateGraceMinutes: String(
                                snapshot.rules.late_grace_minutes
                              ),
                            }
                          : {}
                      );
                      setActionError("");
                      setPreview(null);
                    }}
                  >
                    <option value="">Select workflow…</option>
                    {visibleActions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {action === "create" && (
                  <div className="mw-field" style={{ marginTop: 13 }}>
                    <label htmlFor="mw-kind">Case workflow</label>
                    <select
                      id="mw-kind"
                      value={
                        visibleKinds.includes(kind)
                          ? kind
                          : visibleKinds[0] || ""
                      }
                      onChange={(event) => {
                        setKind(event.target.value);
                        setValues((current) => ({
                          ...current,
                          kind: event.target.value,
                        }));
                      }}
                    >
                      <option value="">Choose case type…</option>
                      {visibleKinds.map((value) => (
                        <option key={value} value={value}>
                          {label(value)}
                        </option>
                      ))}
                    </select>
                    <span className="mw-hint">
                      Sales handles trial requests, callbacks, nursery, winback
                      and exit feedback. Head Admin coordinates priority,
                      disputes and reports. QC manages shadowing and personal
                      teaching. Server-side permissions remain authoritative.
                    </span>
                    {(kind === "trial_request" ||
                      values.kind === "trial_request") && (
                      <Link className="mw-link" href="/operations">
                        Schedule and assign the trial in Operations
                      </Link>
                    )}
                  </div>
                )}
                <form
                  className="mw-form"
                  onSubmit={(event) => void submit(event)}
                >
                  {fields.map((field) =>
                    field.name === "kind" ? null : (
                      <FieldControl
                        key={field.name}
                        field={field}
                        value={values[field.name] || ""}
                        onChange={(value) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: value,
                          }))
                        }
                      />
                    )
                  )}
                  {action === "announcement" && (
                    <div className="mw-field full">
                      <label>Audience roles *</label>
                      <div className="mw-checkboxes">
                        {roles.map((role) => (
                          <label key={role}>
                            <input
                              type="checkbox"
                              checked={announcementRoles.includes(role)}
                              onChange={(event) =>
                                setAnnouncementRoles((current) =>
                                  event.target.checked
                                    ? [...current, role]
                                    : current.filter((value) => value !== role)
                                )
                              }
                            />
                            {label(role)}
                          </label>
                        ))}
                      </div>
                      <span className="mw-hint">
                        Announcements are expiry-scoped, not permanent notices.
                      </span>
                    </div>
                  )}
                  {action === "deactivate" && (
                    <div className="mw-field full">
                      <label htmlFor="mw-confirm">
                        Explicit confirmation — type DEACTIVATE
                      </label>
                      <input
                        id="mw-confirm"
                        value={confirmText}
                        onChange={(event) => setConfirmText(event.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  )}
                  {action === "preview" && (
                    <div className="mw-field full">
                      <span className="mw-hint">
                        Preview is read-only and does not switch authentication
                        roles or create a target session.
                      </span>
                    </div>
                  )}
                  <div className="mw-actions mw-field full">
                    <button
                      className={`mw-button primary${
                        action === "deactivate" ? " danger" : ""
                      }`}
                      disabled={busy || !action}
                      type="submit"
                    >
                      {busy
                        ? "Submitting…"
                        : action === "preview"
                        ? "Open read-only preview"
                        : action === "deactivate"
                        ? "Confirm staff deactivation"
                        : "Submit action"}
                    </button>
                    {action !== "preview" && (
                      <span className="mw-hint">
                        A reason is required for every change.
                      </span>
                    )}
                  </div>
                </form>
                {preview && (
                  <div className="mw-preview" aria-live="polite">
                    <strong>Read-only target profile preview</strong>
                    <p>
                      Not a real target session. Authentication has not changed.
                      Snapshot projection:{" "}
                      {Object.keys(preview).join(", ") ||
                        "profile, students and lessons"}
                      .
                    </p>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        fontSize: 11,
                      }}
                    >
                      {JSON.stringify(preview, null, 2)}
                    </pre>
                  </div>
                )}
              </details>
            </section>
            <section className="mw-card mw-casework-card mw-record-ledger">
              <div className="mw-section-head">
                <h2>Management cases</h2>
                <span className="mw-count">
                  {snapshot?.items.length || 0} records
                </span>
              </div>
              {(snapshot?.items || []).length ? (
                <div>
                  {snapshot?.items.map((item) => {
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
                        <div>
                          <h3>
                            {label(item.kind)}{" "}
                            <span className="mw-hint">
                              · {item.id.slice(0, 8)}
                            </span>
                          </h3>
                          <p>{item.notes}</p>
                          <div className="mw-meta">
                            <RecordTag status={item.status}>
                              {label(item.status)}
                            </RecordTag>
                            {item.student_id && (
                              <RecordTag>
                                Student {item.student_id.slice(0, 8)}
                              </RecordTag>
                            )}
                            {item.lead_id && (
                              <RecordTag>
                                Lead {item.lead_id.slice(0, 8)}
                              </RecordTag>
                            )}
                            {item.staff_id && (
                              <RecordTag>
                                Staff {item.staff_id.slice(0, 8)}
                              </RecordTag>
                            )}
                            {item.assigned_to && (
                              <RecordTag>
                                Assigned{" "}
                                {staff.find(
                                  (person) => person.id === item.assigned_to
                                )?.name || item.assigned_to.slice(0, 8)}
                              </RecordTag>
                            )}
                            {item.due_at && (
                              <RecordTag>
                                {new Date(item.due_at).toLocaleString()}
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
                  <strong>No management cases in this scope</strong>
                  <span>New cases will appear here.</span>
                </div>
              )}
            </section>
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
                    <span className="mw-count">Owner controls</span>
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
                            Grace period before a lesson is flagged late.
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
                            Alerts when notes are missing for consecutive
                            lessons.
                          </p>
                        </div>
                      </div>
                      <div className="mw-rule-item">
                        <div className="mw-rule-icon">
                          <PhoneCall size={15} />
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
                            Target window to contact prospective trial
                            applicants.
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
                            Unresolved items escalate to leadership after 24h.
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
                            Flags stagnant records without activity for 30 days.
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
              <section className="mw-support-section">
                <div className="mw-section-head">
                  <div>
                    <h2>Team &amp; Hierarchy</h2>
                    <p>Active staff, roles, and assigned student capacity.</p>
                  </div>
                  <span className="mw-count">
                    {staff.length} {staff.length === 1 ? "member" : "members"}
                  </span>
                </div>
                {staff.length ? (
                  staff.map((person) => {
                    const headName = person.head_admin_id
                      ? staff.find((row) => row.id === person.head_admin_id)
                          ?.name || person.head_admin_id.slice(0, 8)
                      : null;
                    return (
                      <article className="mw-record" key={person.id}>
                        <div className="pw-person-inline">
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
                              <span className="mw-pill-active">
                                <CheckCircle2 size={11} />{" "}
                                {person.status === "active"
                                  ? "Active"
                                  : label(person.status)}
                              </span>
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
                            <div className="mw-meta" style={{ marginTop: 6 }}>
                              <span className="mw-sub-tag">
                                {person.quota === 0 || person.quota === null
                                  ? "Capacity: Unlimited"
                                  : `Capacity: ${person.quota} students`}
                              </span>
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
              <section className="mw-support-section">
                <div className="mw-section-head">
                  <div>
                    <h2>Academy Announcements</h2>
                    <p>
                      Active bulletins published for teachers, staff, or
                      families.
                    </p>
                  </div>
                  <span className="mw-count">
                    {snapshot?.announcements.length || 0} active
                  </span>
                </div>
                {(snapshot?.announcements || []).length ? (
                  snapshot?.announcements.map((item) => (
                    <article className="mw-record" key={item.id}>
                      <div>
                        <h3>{item.title}</h3>
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
                    <Sparkles size={14} />
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
                        <p>Enrolled Student · ID {row.id.slice(0, 8)}</p>
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
                        <p>Prospective Lead · ID {row.id.slice(0, 8)}</p>
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
    </main>
  );
}
