import type { HomeworkItem, Lesson, Payment, Role } from "@/lib/types";
export type { HomeworkItem, Lesson, Payment, Role };

export type Profile = { id: string; name: string; role: Role; status: string };

export type WorkflowHomeworkItem = HomeworkItem & { feedback?: string };

export type FileMetadata = {
  id: string;
  category: "receipt" | "homework";
  target_id: string;
  original_name: string;
  mime: string;
  bytes: number;
  created_at: string;
  complete: boolean;
};

export type RescheduleRequest = {
  id: string;
  lesson_id: string;
  student_id: string;
  requested_by: string;
  slots: string[];
  reason: string;
  status: "pending" | "approved" | "rejected";
  teacher_approved: boolean;
  admin_approved: boolean;
  selected_slot?: string;
  decision_note?: string;
  created_at: string;
  counter_slots?: string[];
  counter_reason?: string;
  counter_accepted_at?: string | null;
};

export type WorkflowData = {
  profile: Profile;
  payments: Payment[];
  homework: WorkflowHomeworkItem[];
  lessons: Lesson[];
  requests: RescheduleRequest[];
  files: FileMetadata[];
};

export type ManagementAssignments = {
  profile?: { id: string };
  lessons?: { id: string; teacher_id: string | null }[];
};

export const roleLabel = (role: string) => role.replace(/_/g, " ");
export const receiptRoles = [
  "parent",
  "finance",
  "super_admin",
  "general_manager",
];
export const maxReceiptBytes = 10 * 1024 * 1024;
export const maxHomeworkBytes = 50 * 1024 * 1024;

export const dateLabel = (value?: string) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const zonedDateLabel = (value: string, timezone: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: "UTC",
    }).format(date);
  }
};

export const lessonTimeLabel = (
  value: string,
  timezone: string,
  role?: Role
) => {
  const zone = timezone || "UTC";
  const studentTime = `Child local (${zone}): ${zonedDateLabel(value, zone)}`;
  return role === "parent" || role === "student"
    ? studentTime
    : `${studentTime} | Africa/Lagos (WAT): ${zonedDateLabel(
        value,
        "Africa/Lagos"
      )}`;
};

export const bytesLabel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const localDateTime = (date: Date) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
};

export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="wf-empty">
      <span className="wf-empty-mark" aria-hidden="true">
        PW
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
