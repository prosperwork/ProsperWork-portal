import type { ReactNode } from "react";
import BrandEmblem from "../_components/BrandEmblem";
import type { AppView, Currency, LessonStatus, Role } from "@/lib/types";

export const roles: { id: Role; label: string }[] = [
  { id: "super_admin", label: "Super Admin" },
  { id: "general_manager", label: "General Manager · future" },
  { id: "head_admin", label: "Head Admin" },
  { id: "admin", label: "Regular Admin" },
  { id: "hr", label: "HR" },
  { id: "qc", label: "QC Supervisor" },
  { id: "teacher", label: "Teacher" },
  { id: "parent", label: "Parent" },
  { id: "student", label: "Student" },
  { id: "finance", label: "Finance" },
  { id: "sales_marketing", label: "Marketing & Sales" },
  { id: "social_media", label: "Social Media" },
];

export const roleNames: Record<Role, string> = Object.fromEntries(
  roles.map((r) => [r.id, r.label])
) as Record<Role, string>;

export const titles: Record<AppView, { title: string; sub: string }> = {
  overview: {
    title: "Overview",
    sub: "Academy activity and records available to your account.",
  },
  schedule: {
    title: "Schedule",
    sub: "Classes, confirmations and attendance.",
  },
  families: {
    title: "Families & students",
    sub: "Learner profiles, billing and next steps.",
  },
  leads: { title: "Leads", sub: "Enquiries, follow-ups and trial status." },
  finance: {
    title: "Finance",
    sub: "Payments, expenses and receipt verification.",
  },
  payroll: {
    title: "Payroll",
    sub: "Verified attendance, pay statements and approvals.",
  },
  people: {
    title: "People & staff",
    sub: "Staff assignments, capacity and quality records.",
  },
  curriculum: { title: "Curriculum", sub: "Shared teaching resources." },
  learning: {
    title: "Learning",
    sub: "Lesson notes, practice tasks and feedback.",
  },
  reports: {
    title: "Audit & reports",
    sub: "Saved changes and operational reporting.",
  },
  settings: {
    title: "Settings",
    sub: "Academy rules and service configuration.",
  },
};

export const statuses: LessonStatus[] = [
  "scheduled",
  "teacher_done",
  "completed",
  "missed",
  "cancelled",
  "rescheduled",
];

export const todayKey = () => new Date().toISOString().slice(0, 10);

export const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;

export const niceDate = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
) => new Intl.DateTimeFormat("en", options).format(new Date(date));

export const fullDate = (date: string) =>
  new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date ? new Date(date) : new Date());

export const formatMoney = (amount: number, currency: Currency) =>
  Number.isFinite(amount)
    ? new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : "Rate configuration required";

export const timeAt = (date: string, timezone?: string) => {
  try {
    return new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || undefined,
    }).format(new Date(date));
  } catch {
    return new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(date));
  }
};

export const statusTone = (status: string) => {
  if (
    [
      "completed",
      "paid",
      "approved",
      "active",
      "converted",
      "reviewed",
      "teacher_done",
      "trial_verified",
    ].includes(status)
  )
    return "green";
  if (
    [
      "missed",
      "due",
      "new",
      "pending_approval",
      "applicant",
      "receipt_uploaded",
      "trial_requested",
    ].includes(status)
  )
    return "amber";
  if (["cancelled", "paused", "restricted", "inactive"].includes(status))
    return "red";
  return "blue";
};

export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {detail && (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            {detail}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`pill ${tone || statusTone(String(children).toLowerCase())}`}
    >
      {children}
    </span>
  );
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <BrandEmblem className="empty-state-emblem" />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function birthdayDaysAway(
  dob: string | null | undefined,
  timezone: string
): number {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return -1;
  try {
    const [y, m, d] = dob.split("-").map(Number);
    const now = new Date();
    const nowParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const curYear = Number(nowParts.find((p) => p.type === "year")?.value);
    const curMonth = Number(nowParts.find((p) => p.type === "month")?.value);
    const curDay = Number(nowParts.find((p) => p.type === "day")?.value);
    const todayNum = curMonth * 100 + curDay;
    const bdayNum = m * 100 + d;
    const targetYear = bdayNum >= todayNum ? curYear : curYear + 1;
    const bdayDate = new Date(Date.UTC(targetYear, m - 1, d));
    const todayDate = new Date(Date.UTC(curYear, curMonth - 1, curDay));
    return Math.round(
      (bdayDate.getTime() - todayDate.getTime()) / (24 * 3600 * 1000)
    );
  } catch {
    return -1;
  }
}
