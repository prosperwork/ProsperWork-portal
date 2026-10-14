import type { Role } from "@/lib/types";

export type AccountStatus =
  | "active"
  | "on_leave"
  | "paused"
  | "restricted"
  | "applicant"
  | "pending";

export type Account = {
  id: string | number;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  timezone: string;
  username: string;
};

export const invitationRoles = [
  "general_manager",
  "head_admin",
  "admin",
  "hr",
  "qc",
  "teacher",
  "parent",
  "student",
  "finance",
  "sales_marketing",
  "social_media",
] as const satisfies readonly Exclude<Role, "super_admin">[];

export const accountStatuses: AccountStatus[] = [
  "active",
  "on_leave",
  "paused",
  "restricted",
  "applicant",
  "pending",
];

export function labelFor(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
