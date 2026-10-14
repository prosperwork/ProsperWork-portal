import type { ExtrasData } from "./OperationsExtras";

export type JsonRecord = Record<string, unknown>;

export type OpsProfile = {
  id: string;
  name: string;
  role: string;
  status: string;
  timezone: string;
};

export type OpsStudent = {
  id: string;
  payload: JsonRecord;
  teacher_id: string | null;
  admin_id: string | null;
  parent_id?: string | null;
};

export type OpsStaff = {
  id: string;
  name: string;
  role: string;
  status: string;
  timezone: string;
};

export type ContractRow = {
  id: string;
  student_id: string;
  amount: number;
  currency: string;
  terms: string;
  anchor: string;
  next_period: number;
  active: boolean;
  created_at: string;
  billing_hold: boolean;
};

export type FxRow = {
  id: string;
  currency: string;
  date: string;
  rate: number;
  notes: string;
  approved_by: string | null;
  created_at: string;
};

export type SettingsRow = {
  tax_percent?: number;
  finance_profit?: boolean;
  referral_percent?: number;
};

export type AvailabilityRow = {
  id: string;
  staff_id: string;
  weekday: number;
  from_time: string;
  to_time: string;
};

export type SeriesRow = {
  id: string;
  student_id: string;
  weekday: number;
  local_time: string;
  zone: string;
  minutes: number;
  starts_on: string;
  weeks: number;
  created_at?: string;
};

export type PauseRow = {
  id: string;
  student_id: string;
  resume_on: string | null;
  reason: string;
  active: boolean;
  last_error: string | null;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  parent_id: string;
  student_id: string;
  payload: JsonRecord;
  dueBucket: string;
  overdueDays: number;
  verified_at: string | null;
};

export type QualityRow = {
  staffId: string;
  name: string;
  activeStudents: number;
  verifiedLessons: number;
  missedLessons: number;
  emptyBoards: number;
  score: number | null;
};

export type ObservationRow = {
  id: string;
  staff_id: string;
  reviewer_id: string;
  kind: string;
  score: number;
  notes: string;
  created_at: string;
};

export type LeadRow = {
  id: string;
  owner_id: string | null;
  payload: JsonRecord;
  trial_student_id: string | null;
  trial_lesson_id: string | null;
  trial_verified_at: string | null;
  converted_at: string | null;
  followupAt: string | null;
  ageMinutes: number;
};

export type FinancialRow = {
  currency: string;
  income: number;
  expenses: number;
  payroll: number;
  profit?: number | null;
  estimatedTax?: number | null;
  missingRates?: unknown;
};

export type EventRow = {
  id: string;
  action: string;
  subject: string | null;
  actor: string | null;
  notes: string;
  created_at: string;
};

export type OperationsView =
  | "finance"
  | "academy"
  | "team"
  | "leads"
  | "records"
  | "referrals"
  | "media";

export type OperationsData = ExtrasData & {
  profile: OpsProfile;
  contracts: ContractRow[];
  fx: FxRow[];
  settings: SettingsRow | SettingsRow[] | null;
  availability: AvailabilityRow[];
  series: SeriesRow[];
  pauses: PauseRow[];
  students: OpsStudent[];
  staff: OpsStaff[];
  payments: PaymentRow[];
  quality: QualityRow[];
  observations: ObservationRow[];
  leads: LeadRow[];
  financial: FinancialRow[];
  events: EventRow[];
};

export const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const roleLabels: Record<string, string> = {
  super_admin: "Owner",
  finance: "Finance",
  head_admin: "Head Admin",
  admin: "Admin",
  teacher: "Teacher",
  qc: "Quality Control",
  sales_marketing: "Sales & Marketing",
  parent: "Parent",
  student: "Student",
  social_media: "Social Media",
};

export const text = (value: unknown, fallback = "—") =>
  typeof value === "string" && value.trim() ? value : fallback;

export const isoToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
};

export const localDateTimeMinimum = () => {
  const now = new Date(Date.now() + 60_000);
  now.setSeconds(0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export const studentName = (student?: OpsStudent | null) =>
  student ? text(student.payload.name, "Unnamed student") : "Unnamed student";

export const studentStatus = (student?: OpsStudent | null) =>
  student ? text(student.payload.status, "unknown") : "unknown";

export const roleName = (role: string) =>
  roleLabels[role] ?? role.replaceAll("_", " ");

export const staffName = (staff: OpsStaff[], id: string | null | undefined) =>
  staff.find((person) => person.id === id)?.name ?? "Unassigned";

export function dateLabel(value: string | null | undefined, timezone?: string) {
  if (!value) return "Not recorded";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: value.includes("T") ? "short" : undefined,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(parsed);
  } catch {
    return parsed.toLocaleDateString();
  }
}

export function money(value: unknown, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  const code = currency.match(/^[A-Z]{3}/)?.[0] ?? currency;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString()}`;
  }
}

export function objectText(value: unknown) {
  if (Array.isArray(value))
    return value.length ? value.map((item) => String(item)).join(", ") : "None";
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

