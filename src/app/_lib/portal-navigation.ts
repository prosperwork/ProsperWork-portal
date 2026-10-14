import {
  Activity, BookOpen, BriefcaseBusiness, CalendarDays, ClipboardList,
  FileText, GraduationCap, Heart, LayoutDashboard, MessageSquare,
  Music2, Settings2, ShieldCheck, Users, Wallet,
} from "lucide-react";
import type { Role } from "@/lib/types";

export type PortalNavigationItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
};

const allRoles: Role[] = ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc", "teacher", "parent", "student", "finance", "sales_marketing", "social_media"];
const staffRoles: Role[] = ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc", "teacher", "finance"];
const internalStaffRoles: Role[] = ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc", "teacher", "finance", "sales_marketing", "social_media"];

export const legacyWorkspaceRoutes = {
  overview: { href: "/", roles: internalStaffRoles },
  schedule: { href: "/schedule", roles: ["super_admin", "general_manager", "head_admin", "admin", "qc", "teacher", "parent", "student"] },
  families: { href: "/students", roles: ["super_admin", "general_manager", "head_admin", "admin", "qc", "teacher", "sales_marketing"] },
  leads: { href: "/leads", roles: ["super_admin", "general_manager", "head_admin", "admin", "sales_marketing"] },
  finance: { href: "/finance", roles: ["super_admin", "general_manager", "finance"] },
  payroll: { href: "/payroll", roles: ["super_admin", "general_manager", "finance", "teacher", "admin", "head_admin", "hr", "sales_marketing", "social_media"] },
  people: { href: "/people", roles: ["super_admin", "general_manager", "head_admin", "hr", "qc"] },
  curriculum: { href: "/curriculum", roles: ["super_admin", "general_manager", "head_admin", "qc", "teacher", "social_media"] },
  learning: { href: "/learning", roles: ["super_admin", "general_manager", "head_admin", "admin", "qc", "teacher", "parent", "student"] },
  reports: { href: "/reports", roles: ["super_admin", "general_manager", "head_admin", "hr", "qc", "finance"] },
  settings: { href: "/settings", roles: ["super_admin", "general_manager"] },
} satisfies Record<string, { href: string; roles: Role[] }>;

export type LegacyWorkspaceView = keyof typeof legacyWorkspaceRoutes;
export const legacyWorkspaceAccess = Object.fromEntries(
  Object.entries(legacyWorkspaceRoutes).map(([view, route]) => [view, route.roles]),
) as Record<LegacyWorkspaceView, Role[]>;
export const legacyViewForPath = Object.fromEntries(
  Object.entries(legacyWorkspaceRoutes).map(([view, route]) => [route.href, view]),
) as Record<string, LegacyWorkspaceView>;

export const portalNavigation: PortalNavigationItem[] = [
  { href: "/family", label: "My Family", icon: Users, roles: ["parent", "super_admin", "general_manager", "head_admin", "admin"] },
  { href: legacyWorkspaceRoutes.overview.href, label: "Overview", icon: LayoutDashboard, roles: legacyWorkspaceRoutes.overview.roles },
  { href: legacyWorkspaceRoutes.schedule.href, label: "Schedule", icon: CalendarDays, roles: legacyWorkspaceRoutes.schedule.roles },
  { href: legacyWorkspaceRoutes.families.href, label: "Families & students", icon: Users, roles: legacyWorkspaceRoutes.families.roles },
  { href: legacyWorkspaceRoutes.leads.href, label: "Leads", icon: Heart, roles: legacyWorkspaceRoutes.leads.roles },
  { href: legacyWorkspaceRoutes.finance.href, label: "Finance & receipts", icon: Wallet, roles: legacyWorkspaceRoutes.finance.roles },
  { href: legacyWorkspaceRoutes.payroll.href, label: "Payroll", icon: Wallet, roles: legacyWorkspaceRoutes.payroll.roles },
  { href: legacyWorkspaceRoutes.people.href, label: "People & staff", icon: Users, roles: legacyWorkspaceRoutes.people.roles },
  { href: legacyWorkspaceRoutes.curriculum.href, label: "Curriculum", icon: BookOpen, roles: legacyWorkspaceRoutes.curriculum.roles },
  { href: legacyWorkspaceRoutes.learning.href, label: "Lesson boards", icon: GraduationCap, roles: legacyWorkspaceRoutes.learning.roles },
  { href: "/homework", label: "Homework", icon: ClipboardList, roles: ["super_admin", "general_manager", "head_admin", "admin", "qc", "teacher", "parent", "student"] },
  { href: legacyWorkspaceRoutes.reports.href, label: "Audit & reports", icon: ClipboardList, roles: legacyWorkspaceRoutes.reports.roles },
  { href: legacyWorkspaceRoutes.settings.href, label: "Settings", icon: Settings2, roles: legacyWorkspaceRoutes.settings.roles },
  { href: "/workflows", label: "Workflows", icon: Activity, roles: ["super_admin", "general_manager", "head_admin", "admin", "teacher", "qc"] },
  { href: "/operations", label: "Operations", icon: ClipboardList, roles: ["super_admin", "general_manager", "head_admin", "admin", "teacher", "qc", "finance", "sales_marketing", "social_media"] },
  { href: "/management", label: "Management", icon: ShieldCheck, roles: ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc", "sales_marketing"] },
  { href: "/accounts", label: "Accounts", icon: Users, roles: ["super_admin"] },
  { href: "/documents", label: "Invoices & receipts", icon: FileText, roles: ["super_admin", "general_manager", "head_admin", "admin", "finance", "parent"] },
  { href: "/policies", label: "Policies", icon: ShieldCheck, roles: ["super_admin", "general_manager", "head_admin", "admin", "hr"] },
  { href: "/leave", label: "Leave", icon: CalendarDays, roles: staffRoles },
  { href: "/hiring", label: "Hiring", icon: BriefcaseBusiness, roles: ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc", "sales_marketing", "social_media"] },
  { href: "/communications", label: "Communications", icon: MessageSquare, roles: ["super_admin", "sales_marketing"] },
  { href: "/studio", label: "Studio", icon: Music2, roles: ["super_admin", "head_admin", "admin", "teacher", "qc", "parent", "student"] },
  { href: "/manual", label: "Manual usage", icon: BookOpen, roles: internalStaffRoles },
];
