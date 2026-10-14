"use client";

import { usePathname } from "next/navigation";
import PortalShell from "./PortalShell";

const operationalRoutes = new Set([
  "/", "/schedule", "/students", "/leads", "/finance", "/people", "/curriculum", "/reports",
  "/homework", "/workflows", "/operations", "/management", "/payroll", "/accounts", "/settings",
  "/family", "/learning", "/documents", "/policies", "/leave", "/hiring",
  "/communications", "/studio", "/manual", "/profile", "/onboarding",
]);

export default function PortalRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!operationalRoutes.has(pathname)) return children;
  return <PortalShell>{children}</PortalShell>;
}
