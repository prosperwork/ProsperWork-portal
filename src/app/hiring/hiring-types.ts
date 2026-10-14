import { hiringRoles, type HiringCase, type HiringDirectory, type HiringEvent, type HiringFile, type HiringReview } from "@/lib/academy/hiring";

export type HiringProfile = {
  id: string;
  name: string;
  role: string;
  status: string;
  timezone: string;
  email?: string;
};

export type HiringHandoff = {
  id: string;
  staff_id: string;
  name: string;
  role: string;
  stage: string;
  start_date: string | null;
  timezone: string;
  finalized_at: string | null;
};

export type HiringData = {
  profile: HiringProfile;
  cases: HiringCase[];
  reviews: HiringReview[];
  events: HiringEvent[];
  directory: HiringDirectory[];
  files: HiringFile[];
  handoffs: HiringHandoff[];
  serverNow: string;
};

export type HiringRole = typeof hiringRoles[number];
export type ReviewKind = "hr_interview" | "department_interview" | "audition" | "training";
export type JsonResult = Record<string, unknown>;
export type PendingUpload = { beforeIds: string[]; fileName: string; fileId?: string };

export const roleLabels: Record<string, string> = {
  super_admin: "Owner",
  teacher: "Teacher",
  admin: "Admin",
  head_admin: "Head Admin",
  qc: "Quality Control",
  hr: "Human Resources",
  finance: "Finance",
  sales_marketing: "Sales & Marketing",
  social_media: "Social Media",
};

export const reviewLabels: Record<ReviewKind, string> = {
  hr_interview: "HR interview",
  department_interview: "Department interview",
  audition: "Teacher audition",
  training: "Training",
};

export const uploadTypes =
  "application/pdf,image/png,image/jpeg,video/mp4,video/webm,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/webm";
export const maxFileBytes = 50 * 1024 * 1024;

export function roleKey(value: string) {
  return value.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

export function roleLabel(value: string) {
  return roleLabels[roleKey(value)] ?? value.replace(/[_-]/g, " ");
}

export function titleCase(value: string) {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (part) => part.toUpperCase());
}

export function formatDate(value: string | null, timezone?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
}

export function expectedSupervisor(role: string) {
  switch (role) {
    case "teacher":
      return "qc";
    case "admin":
      return "head_admin";
    case "qc":
    case "hr":
    case "head_admin":
      return "super_admin";
    default:
      return role;
  }
}

