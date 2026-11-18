import {
  Activity, AlertCircle, BookOpen, BriefcaseBusiness, CalendarDays, ClipboardList,
  FileText, GraduationCap, Heart, LayoutDashboard, MessageSquare,
  Music2, Settings2, ShieldCheck, Users, Wallet,
} from "lucide-react";
import type { Role } from "@/lib/types";

export type PortalNavigationItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: string;
  roles: Role[];
};

const staffRoles: Role[] = ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc", "teacher", "finance", "sales_marketing", "social_media"];
const internalStaffRoles: Role[] = ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc", "teacher", "finance", "sales_marketing", "social_media"];

export const legacyWorkspaceRoutes = {
  overview: { href: "/", permission: "workspace.overview", roles: internalStaffRoles },
  schedule: { href: "/schedule", permission: "workspace.schedule", roles: ["super_admin", "general_manager", "head_admin", "admin", "qc", "teacher", "parent", "student"] },
  families: { href: "/students", permission: "workspace.students", roles: ["super_admin", "general_manager", "head_admin", "admin", "qc", "teacher", "sales_marketing"] },
  leads: { href: "/leads", permission: "workspace.leads", roles: ["super_admin", "general_manager", "head_admin", "admin", "sales_marketing"] },
  finance: { href: "/finance", permission: "workspace.finance", roles: ["super_admin", "general_manager", "finance"] },
  payroll: { href: "/payroll", permission: "workspace.payroll", roles: ["super_admin", "finance", "teacher", "admin", "head_admin", "hr", "qc", "sales_marketing", "social_media"] },
  people: { href: "/people", permission: "workspace.people", roles: ["super_admin", "general_manager", "head_admin", "hr", "qc"] },
  curriculum: { href: "/curriculum", permission: "workspace.curriculum", roles: ["super_admin", "general_manager", "head_admin", "qc", "teacher", "social_media"] },
  learning: { href: "/learning", permission: "workspace.learning", roles: ["super_admin", "general_manager", "head_admin", "admin", "qc", "teacher", "parent", "student"] },
  reports: { href: "/reports", permission: "workspace.reports", roles: ["super_admin", "general_manager", "head_admin", "hr", "qc", "finance"] },
  settings: { href: "/settings", permission: "workspace.settings", roles: ["super_admin", "owner"] },
} satisfies Record<string, { href: string; permission: string; roles: Role[] }>;

export type LegacyWorkspaceView = keyof typeof legacyWorkspaceRoutes;
export const legacyWorkspaceAccess = Object.fromEntries(
  Object.entries(legacyWorkspaceRoutes).map(([view, route]) => [view, route.roles]),
) as Record<LegacyWorkspaceView, Role[]>;
export const legacyViewForPath = Object.fromEntries(
  Object.entries(legacyWorkspaceRoutes).map(([view, route]) => [route.href, view]),
) as Record<string, LegacyWorkspaceView>;

export function hasWorkspaceAccess(
  item: { permission?: string; roles: Role[] } | undefined,
  profile: { role: Role; permissions?: string[] } | null | undefined,
): boolean {
  if (!item || !profile) return false;
  if (profile.role === "super_admin" || profile.role === "owner") return true;
  if (Array.isArray(profile.permissions) && item.permission) {
    return profile.permissions.includes(item.permission);
  }
  return item.roles.includes(profile.role);
}

export const portalNavigation: PortalNavigationItem[] = [
  { href: "/family", label: "My Family", icon: Users, permission: "workspace.family", roles: ["parent", "super_admin"] },
  { href: legacyWorkspaceRoutes.overview.href, label: "Overview", icon: LayoutDashboard, permission: legacyWorkspaceRoutes.overview.permission, roles: legacyWorkspaceRoutes.overview.roles },
  { href: legacyWorkspaceRoutes.schedule.href, label: "Schedule", icon: CalendarDays, permission: legacyWorkspaceRoutes.schedule.permission, roles: legacyWorkspaceRoutes.schedule.roles },
  { href: legacyWorkspaceRoutes.families.href, label: "Families & students", icon: Users, permission: legacyWorkspaceRoutes.families.permission, roles: legacyWorkspaceRoutes.families.roles },
  { href: "/complaints", label: "Complaints & Support", icon: AlertCircle, permission: "workspace.complaints", roles: ["super_admin", "general_manager", "head_admin", "admin", "qc", "parent"] },
  { href: legacyWorkspaceRoutes.leads.href, label: "Leads", icon: Heart, permission: legacyWorkspaceRoutes.leads.permission, roles: legacyWorkspaceRoutes.leads.roles },
  { href: legacyWorkspaceRoutes.finance.href, label: "Finance & receipts", icon: Wallet, permission: legacyWorkspaceRoutes.finance.permission, roles: legacyWorkspaceRoutes.finance.roles },
  { href: legacyWorkspaceRoutes.payroll.href, label: "Payroll", icon: Wallet, permission: legacyWorkspaceRoutes.payroll.permission, roles: legacyWorkspaceRoutes.payroll.roles },
  { href: legacyWorkspaceRoutes.people.href, label: "People & staff", icon: Users, permission: legacyWorkspaceRoutes.people.permission, roles: legacyWorkspaceRoutes.people.roles },
  { href: legacyWorkspaceRoutes.curriculum.href, label: "Curriculum", icon: BookOpen, permission: legacyWorkspaceRoutes.curriculum.permission, roles: legacyWorkspaceRoutes.curriculum.roles },
  { href: legacyWorkspaceRoutes.learning.href, label: "Lesson boards", icon: GraduationCap, permission: legacyWorkspaceRoutes.learning.permission, roles: legacyWorkspaceRoutes.learning.roles },
  { href: "/homework", label: "Homework", icon: ClipboardList, permission: "workspace.homework", roles: ["super_admin", "general_manager", "head_admin", "admin", "qc", "teacher", "parent", "student"] },
  { href: legacyWorkspaceRoutes.reports.href, label: "Audit & reports", icon: ClipboardList, permission: legacyWorkspaceRoutes.reports.permission, roles: legacyWorkspaceRoutes.reports.roles },
  { href: legacyWorkspaceRoutes.settings.href, label: "Settings", icon: Settings2, permission: legacyWorkspaceRoutes.settings.permission, roles: legacyWorkspaceRoutes.settings.roles },
  { href: "/workflows", label: "Workflows", icon: Activity, permission: "workspace.workflows", roles: ["super_admin", "general_manager", "head_admin", "admin", "teacher", "qc"] },
  { href: "/operations", label: "Operations", icon: ClipboardList, permission: "workspace.operations", roles: ["super_admin", "general_manager", "head_admin", "admin", "teacher", "qc", "finance", "sales_marketing", "social_media"] },
  { href: "/management", label: "Management", icon: ShieldCheck, permission: "workspace.management", roles: ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc", "sales_marketing"] },
  { href: "/accounts", label: "Accounts", icon: Users, permission: "workspace.accounts", roles: ["super_admin", "general_manager", "head_admin", "hr"] },
  { href: "/documents", label: "Invoices & receipts", icon: FileText, permission: "workspace.documents", roles: ["super_admin", "general_manager", "head_admin", "admin", "finance", "parent"] },
  { href: "/policies", label: "Policies", icon: ShieldCheck, permission: "workspace.policies", roles: ["super_admin", "general_manager", "head_admin", "admin", "hr"] },
  { href: "/leave", label: "Leave", icon: CalendarDays, permission: "workspace.leave", roles: staffRoles },
  { href: "/hiring", label: "Hiring", icon: BriefcaseBusiness, permission: "workspace.hiring", roles: ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc"] },
  { href: "/communications", label: "Communications", icon: MessageSquare, permission: "workspace.communications", roles: ["super_admin", "sales_marketing"] },
  { href: "/studio", label: "Studio", icon: Music2, permission: "workspace.studio", roles: ["super_admin", "head_admin", "admin", "teacher", "qc", "parent", "student"] },
  { href: "/manual", label: "Manual usage", icon: BookOpen, permission: "workspace.manual", roles: internalStaffRoles },
];
