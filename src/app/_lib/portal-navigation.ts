import {
  Activity,
  AlertCircle,
  Banknote,
  BarChart3,
  BookMarked,
  BookOpen,
  Briefcase,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  FileCheck2,
  FileText,
  GraduationCap,
  Heart,
  HelpCircle,
  Home,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Music2,
  Settings2,
  ShieldCheck,
  Sliders,
  Wallet,
} from "lucide-react";
import type { Role } from "@/lib/types";

export type PortalNavigationGroup =
  | "Workspace"
  | "Teaching & Learning"
  | "Families & Growth"
  | "Finance & Payroll"
  | "Staff & Governance";

export const portalNavigationGroups: PortalNavigationGroup[] = [
  "Workspace",
  "Teaching & Learning",
  "Families & Growth",
  "Finance & Payroll",
  "Staff & Governance",
];

export type PortalNavigationItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  group: PortalNavigationGroup;
  permission: string;
  roles: Role[];
  /** When true, only explicitly listed roles see this item (not even super_admin). */
  strictRoles?: boolean;
  /** Roles that always have access regardless of custom permission lists. */
  alwaysAllowRoles?: Role[];
};

const staffRoles: Role[] = [
  "super_admin",
  "general_manager",
  "head_admin",
  "admin",
  "hr",
  "qc",
  "teacher",
  "finance",
  "sales_marketing",
  "social_media",
];

export const legacyWorkspaceRoutes = {
  overview: { href: "/", permission: "workspace.overview", roles: staffRoles },
  schedule: {
    href: "/schedule",
    permission: "workspace.schedule",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "qc",
      "teacher",
      "parent",
      "student",
    ],
  },
  families: {
    href: "/students",
    permission: "workspace.students",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "qc",
      "teacher",
      "sales_marketing",
    ],
  },
  leads: {
    href: "/leads",
    permission: "workspace.leads",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "sales_marketing",
    ],
  },
  finance: {
    href: "/finance",
    permission: "workspace.finance",
    roles: ["super_admin", "general_manager", "finance"],
  },
  payroll: {
    href: "/payroll",
    permission: "workspace.payroll",
    roles: [
      "super_admin",
      "finance",
      "teacher",
      "admin",
      "head_admin",
      "hr",
      "qc",
      "sales_marketing",
      "social_media",
    ],
  },
  people: {
    href: "/people",
    permission: "workspace.people",
    roles: ["super_admin", "general_manager", "head_admin", "hr", "qc"],
  },
  curriculum: {
    href: "/learning",
    permission: "workspace.curriculum",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "qc",
      "teacher",
      "social_media",
    ],
  },
  learning: {
    href: "/learning",
    permission: "workspace.learning",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "qc",
      "teacher",
      "parent",
      "student",
    ],
  },
  reports: {
    href: "/reports",
    permission: "workspace.reports",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "hr",
      "qc",
      "finance",
    ],
  },
  settings: {
    href: "/settings",
    permission: "workspace.settings",
    roles: ["super_admin", "owner"],
  },
} satisfies Record<string, { href: string; permission: string; roles: Role[] }>;

export type LegacyWorkspaceView = keyof typeof legacyWorkspaceRoutes;
export const legacyWorkspaceAccess = Object.fromEntries(
  Object.entries(legacyWorkspaceRoutes).map(([view, route]) => [
    view,
    route.roles,
  ])
) as Record<LegacyWorkspaceView, Role[]>;
export const legacyViewForPath = Object.fromEntries(
  Object.entries(legacyWorkspaceRoutes).map(([view, route]) => [
    route.href,
    view,
  ])
) as Record<string, LegacyWorkspaceView>;

export function hasWorkspaceAccess(
  item:
    | {
        permission?: string;
        roles: Role[];
        strictRoles?: boolean;
        alwaysAllowRoles?: Role[];
      }
    | undefined,
  profile: { role: Role; permissions?: string[] } | null | undefined
): boolean {
  if (!item || !profile) return false;
  if (item.strictRoles) {
    return item.roles.includes(profile.role);
  }
  if (profile.role === "super_admin" || profile.role === "owner") return true;
  if (item.alwaysAllowRoles?.includes(profile.role)) return true;
  if (Array.isArray(profile.permissions) && item.permission) {
    return profile.permissions.includes(item.permission);
  }
  return item.roles.includes(profile.role);
}

export const portalNavigation: PortalNavigationItem[] = [
  // Workspace
  {
    href: "/family",
    label: "My Family",
    icon: Home,
    group: "Workspace",
    permission: "workspace.family",
    roles: ["parent"],
    strictRoles: true,
  },
  {
    href: legacyWorkspaceRoutes.overview.href,
    label: "Overview",
    icon: LayoutDashboard,
    group: "Workspace",
    permission: legacyWorkspaceRoutes.overview.permission,
    roles: legacyWorkspaceRoutes.overview.roles,
  },
  {
    href: legacyWorkspaceRoutes.schedule.href,
    label: "Schedule",
    icon: CalendarDays,
    group: "Workspace",
    permission: legacyWorkspaceRoutes.schedule.permission,
    roles: legacyWorkspaceRoutes.schedule.roles,
  },
  {
    href: "/workflows",
    label: "Requests & Receipts",
    icon: Activity,
    group: "Workspace",
    permission: "workspace.workflows",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "teacher",
      "qc",
      "parent",
      "student",
    ],
    alwaysAllowRoles: ["parent", "student"],
  },
  {
    href: "/manual",
    label: "User Manual",
    icon: HelpCircle,
    group: "Workspace",
    permission: "workspace.manual",
    roles: [...staffRoles, "parent", "student"],
    alwaysAllowRoles: ["parent", "student"],
  },

  // Teaching & Learning
  {
    href: legacyWorkspaceRoutes.learning.href,
    label: "Lesson boards",
    icon: BookOpen,
    group: "Teaching & Learning",
    permission: legacyWorkspaceRoutes.learning.permission,
    roles: legacyWorkspaceRoutes.learning.roles,
  },
  {
    href: "/homework",
    label: "Homework",
    icon: BookMarked,
    group: "Teaching & Learning",
    permission: "workspace.homework",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "qc",
      "teacher",
      "parent",
      "student",
    ],
  },
  {
    href: "/studio",
    label: "Studio",
    icon: Music2,
    group: "Teaching & Learning",
    permission: "workspace.studio",
    roles: [
      "super_admin",
      "head_admin",
      "admin",
      "teacher",
      "qc",
      "parent",
      "student",
    ],
  },

  // Families & Growth
  {
    href: legacyWorkspaceRoutes.families.href,
    label: "Families & students",
    icon: GraduationCap,
    group: "Families & Growth",
    permission: legacyWorkspaceRoutes.families.permission,
    roles: legacyWorkspaceRoutes.families.roles,
  },
  {
    href: legacyWorkspaceRoutes.leads.href,
    label: "Leads",
    icon: Heart,
    group: "Families & Growth",
    permission: legacyWorkspaceRoutes.leads.permission,
    roles: legacyWorkspaceRoutes.leads.roles,
  },
  {
    href: "/complaints",
    label: "Complaints & Support",
    icon: AlertCircle,
    group: "Families & Growth",
    permission: "workspace.complaints",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "qc",
      "parent",
    ],
  },
  {
    href: "/communications",
    label: "Communications",
    icon: MessageSquare,
    group: "Families & Growth",
    permission: "workspace.communications",
    roles: ["super_admin", "sales_marketing"],
  },

  // Finance & Payroll
  {
    href: legacyWorkspaceRoutes.finance.href,
    label: "Finance & receipts",
    icon: Wallet,
    group: "Finance & Payroll",
    permission: legacyWorkspaceRoutes.finance.permission,
    roles: legacyWorkspaceRoutes.finance.roles,
  },
  {
    href: legacyWorkspaceRoutes.payroll.href,
    label: "Payroll",
    icon: Banknote,
    group: "Finance & Payroll",
    permission: legacyWorkspaceRoutes.payroll.permission,
    roles: legacyWorkspaceRoutes.payroll.roles,
  },
  {
    href: "/documents",
    label: "Invoices & receipts",
    icon: FileText,
    group: "Finance & Payroll",
    permission: "workspace.documents",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "finance",
      "parent",
    ],
  },

  // Staff & Governance
  {
    href: legacyWorkspaceRoutes.people.href,
    label: "People & staff",
    icon: Briefcase,
    group: "Staff & Governance",
    permission: legacyWorkspaceRoutes.people.permission,
    roles: legacyWorkspaceRoutes.people.roles,
  },
  {
    href: "/hiring",
    label: "Hiring",
    icon: BriefcaseBusiness,
    group: "Staff & Governance",
    permission: "workspace.hiring",
    roles: ["super_admin", "general_manager", "head_admin", "admin", "hr", "qc"],
  },
  {
    href: "/leave",
    label: "Leave",
    icon: CalendarClock,
    group: "Staff & Governance",
    permission: "workspace.leave",
    roles: staffRoles,
  },
  {
    href: "/operations",
    label: "Operations",
    icon: Sliders,
    group: "Staff & Governance",
    permission: "workspace.operations",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "teacher",
      "qc",
      "finance",
      "sales_marketing",
      "social_media",
    ],
  },
  {
    href: "/management",
    label: "Management",
    icon: ShieldCheck,
    group: "Staff & Governance",
    permission: "workspace.management",
    roles: [
      "super_admin",
      "general_manager",
      "head_admin",
      "admin",
      "hr",
      "qc",
      "sales_marketing",
    ],
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: KeyRound,
    group: "Staff & Governance",
    permission: "workspace.accounts",
    roles: ["super_admin", "general_manager", "head_admin", "hr"],
  },
  {
    href: "/policies",
    label: "Policies",
    icon: FileCheck2,
    group: "Staff & Governance",
    permission: "workspace.policies",
    roles: ["super_admin", "general_manager", "head_admin", "admin", "hr"],
  },
  {
    href: legacyWorkspaceRoutes.reports.href,
    label: "Audit & reports",
    icon: BarChart3,
    group: "Staff & Governance",
    permission: legacyWorkspaceRoutes.reports.permission,
    roles: legacyWorkspaceRoutes.reports.roles,
  },
  {
    href: legacyWorkspaceRoutes.settings.href,
    label: "Settings",
    icon: Settings2,
    group: "Staff & Governance",
    permission: legacyWorkspaceRoutes.settings.permission,
    roles: legacyWorkspaceRoutes.settings.roles,
  },
];
