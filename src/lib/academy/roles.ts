import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcademyProfile } from "../supabase/identity";

export interface RoleRow {
  code: string;
  label: string;
  department: string;
  is_system: boolean;
  is_staff: boolean;
  invitable: boolean;
  enabled: boolean;
  permissions: string[];
  updated_at?: string;
}

export interface PermissionDefinition {
  key: string;
  label: string;
  group: "workspace" | "capability";
  description: string;
}

export const WORKSPACE_PERMISSIONS: PermissionDefinition[] = [
  { key: "workspace.overview", label: "Overview", group: "workspace", description: "Main portal dashboard & command centre" },
  { key: "workspace.schedule", label: "Schedule", group: "workspace", description: "Lesson timetable and calendar" },
  { key: "workspace.students", label: "Students", group: "workspace", description: "Student roster and admission review" },
  { key: "workspace.family", label: "My Family", group: "workspace", description: "Parent portal & child enrollment" },
  { key: "workspace.complaints", label: "Complaints", group: "workspace", description: "Family feedback & support tickets" },
  { key: "workspace.leads", label: "Leads", group: "workspace", description: "Enquiries and trial pipeline" },
  { key: "workspace.finance", label: "Finance", group: "workspace", description: "Tuition billing, receipts, and expenses" },
  { key: "workspace.payroll", label: "Payroll", group: "workspace", description: "Staff salary statements and payout approvals" },
  { key: "workspace.people", label: "People", group: "workspace", description: "Staff directory and assignments" },
  { key: "workspace.curriculum", label: "Curriculum", group: "workspace", description: "Sheet music, syllabus, and lesson guides" },
  { key: "workspace.learning", label: "Learning", group: "workspace", description: "Student learning library" },
  { key: "workspace.homework", label: "Homework", group: "workspace", description: "Practice tasks and feedback" },
  { key: "workspace.reports", label: "Reports", group: "workspace", description: "Progress reports and analytics" },
  { key: "workspace.settings", label: "Settings", group: "workspace", description: "Academy rules, currencies, roles, and catalogs" },
  { key: "workspace.workflows", label: "Workflows", group: "workspace", description: "Lesson verifications and task queues" },
  { key: "workspace.operations", label: "Operations", group: "workspace", description: "Daily operations console" },
  { key: "workspace.management", label: "Management", group: "workspace", description: "Leadership oversight workspace" },
  { key: "workspace.accounts", label: "Accounts", group: "workspace", description: "Portal logins, invites, and account status" },
  { key: "workspace.documents", label: "Documents", group: "workspace", description: "Academy files and family records" },
  { key: "workspace.policies", label: "Policies", group: "workspace", description: "Legal policies and parent consent versions" },
  { key: "workspace.leave", label: "Leave", group: "workspace", description: "Time-off requests and cover planning" },
  { key: "workspace.hiring", label: "Hiring", group: "workspace", description: "Applicant pipeline and onboarding" },
  { key: "workspace.communications", label: "Communications", group: "workspace", description: "Academy email composer and outreach" },
  { key: "workspace.studio", label: "Music Studio", group: "workspace", description: "Virtual piano, metronome, and ear tools" },
  { key: "workspace.manual", label: "Staff Manual", group: "workspace", description: "SOPs and operational handbook" },
];

export const CAPABILITY_PERMISSIONS: PermissionDefinition[] = [
  { key: "complaints.manage", label: "Manage Complaints", group: "capability", description: "View all family tickets, reply, and resolve complaints" },
  { key: "complaints.create", label: "Submit Complaints", group: "capability", description: "Open new complaint tickets" },
  { key: "classroom.record", label: "Record Lessons", group: "capability", description: "Start and manage LiveKit lesson recordings" },
  { key: "classroom.grant_tools", label: "Grant Classroom Tools", group: "capability", description: "Toggle interactive classroom tools for students" },
  { key: "admissions.approve", label: "Approve Admissions", group: "capability", description: "Review and approve/reject parent-submitted child enrollments" },
  { key: "accounts.view", label: "View Accounts", group: "capability", description: "Read portal account list and login status" },
  { key: "accounts.manage", label: "Manage Accounts", group: "capability", description: "Invite, suspend, reset, or reassign accounts" },
  { key: "hiring.invite", label: "Invite Applicants", group: "capability", description: "Provision applicant portal accounts during hiring" },
  { key: "email.compose_staff", label: "Email Staff", group: "capability", description: "Send academy emails to staff members" },
  { key: "email.compose_family", label: "Email Families", group: "capability", description: "Send academy emails to parents and families" },
  { key: "email.compose_lead", label: "Email Leads", group: "capability", description: "Send academy emails to prospective leads" },
  { key: "ai.birthday", label: "AI Birthday Notes", group: "capability", description: "Generate birthday celebration messages" },
  { key: "reports.learning", label: "Learning Reports", group: "capability", description: "Access student learning progress reports" },
  { key: "operations.view", label: "Operations Feed", group: "capability", description: "Access operations timeline and metrics" },
  { key: "payroll.view", label: "View Payroll", group: "capability", description: "View own or academy payroll records" },
];

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  ...WORKSPACE_PERMISSIONS,
  ...CAPABILITY_PERMISSIONS,
];

export const roleCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{1,40}$/, "Role code must be 2-41 lowercase letters, numbers, or underscores.");

export const roleActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    code: roleCodeSchema,
    label: z.string().trim().min(2).max(80),
    department: z.string().trim().min(2).max(80).default("General"),
    isStaff: z.boolean().default(true),
    invitable: z.boolean().default(true),
    enabled: z.boolean().default(true),
    permissions: z.array(z.string().trim().regex(/^[a-z0-9_.-]{2,64}$/)).max(120),
  }).strict(),
  z.object({
    action: z.literal("delete"),
    code: roleCodeSchema,
  }).strict(),
]);

export function humanizeRoleCode(code: string): string {
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function fetchRoles(client: SupabaseClient): Promise<RoleRow[]> {
  const { data, error } = await client
    .from("pw_roles")
    .select("code,label,department,is_system,is_staff,invitable,enabled,permissions,updated_at")
    .order("is_system", { ascending: false })
    .order("label", { ascending: true });
  if (error || !data) return [];
  return (data as RoleRow[]).map((row) => ({
    ...row,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
  }));
}

export async function fetchRoleRecord(client: SupabaseClient, roleCode: string): Promise<RoleRow | null> {
  const { data, error } = await client
    .from("pw_roles")
    .select("code,label,department,is_system,is_staff,invitable,enabled,permissions,updated_at")
    .eq("code", roleCode)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as RoleRow;
  return {
    ...row,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
  };
}

export async function getRoleLabel(client: SupabaseClient, roleCode: string): Promise<string> {
  const row = await fetchRoleRecord(client, roleCode);
  return row?.label || humanizeRoleCode(roleCode);
}

export async function hasPermission(
  client: SupabaseClient,
  profile: Pick<AcademyProfile, "role" | "status"> | null | undefined,
  permission: string,
  options: { allowOnLeave?: boolean } = {},
): Promise<boolean> {
  if (!profile) return false;
  const allowedStatuses = options.allowOnLeave ? ["active", "on_leave"] : ["active"];
  if (!allowedStatuses.includes(profile.status)) return false;
  if (profile.role === "super_admin") return true;
  const row = await fetchRoleRecord(client, profile.role);
  if (!row || !row.enabled) return false;
  return row.permissions.includes(permission);
}

export async function hasAnyPermission(
  client: SupabaseClient,
  profile: Pick<AcademyProfile, "role" | "status"> | null | undefined,
  permissions: string[],
  options: { allowOnLeave?: boolean } = {},
): Promise<boolean> {
  if (!profile) return false;
  const allowedStatuses = options.allowOnLeave ? ["active", "on_leave"] : ["active"];
  if (!allowedStatuses.includes(profile.status)) return false;
  if (profile.role === "super_admin") return true;
  const row = await fetchRoleRecord(client, profile.role);
  if (!row || !row.enabled) return false;
  return permissions.some((perm) => row.permissions.includes(perm));
}

export async function fetchRoleCodesWithPermission(
  client: SupabaseClient,
  permission: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("pw_roles")
    .select("code,permissions,enabled")
    .eq("enabled", true);
  if (error || !data) return ["super_admin"];
  const codes = new Set<string>(["super_admin"]);
  for (const row of data as Array<{ code: string; permissions?: string[] }>) {
    if (Array.isArray(row.permissions) && row.permissions.includes(permission)) {
      codes.add(row.code);
    }
  }
  return Array.from(codes);
}
