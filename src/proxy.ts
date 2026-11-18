import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { publicAppUrl } from "./lib/supabase/app-url.mjs";
import { parseViewAsCookie } from "./lib/supabase/server";

const PROTECTED_PATHS = new Set([
  "/",
  "/schedule",
  "/students",
  "/leads",
  "/finance",
  "/people",
  "/curriculum",
  "/reports",
  "/homework",
  "/workflows",
  "/accounts",
  "/settings",
  "/classroom",
  "/payroll",
  "/learning",
  "/documents",
  "/family",
  "/policies",
  "/onboarding",
  "/kid",
  "/studio",
  "/leave",
  "/hiring",
  "/operations",
  "/management",
  "/communications",
  "/manual",
  "/complaints",
  "/history",
  "/profile",
]);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          for (const { name, value } of values) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of values) response.cookies.set(name, value, options);
        },
      },
    },
  );
  const { data: { user } } = await client.auth.getUser();

  // Enforce read-only View-As mode across mutating API endpoints ONLY when a verified
  // signed pw_view_as cookie is active for the authenticated super_admin.
  if (
    pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    pathname !== "/api/accounts" &&
    pathname !== "/api/auth" &&
    user &&
    request.cookies.has("pw_view_as")
  ) {
    const verifiedTarget = parseViewAsCookie(request.cookies.get("pw_view_as")?.value, user.id);
    if (verifiedTarget) {
      return NextResponse.json(
        { error: "View-As mode is read-only. Exit View-As before making changes." },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }

  if (PROTECTED_PATHS.has(pathname)) {
    let destination: string | null = null;
    if (!user) {
      destination = pathname !== "/"
        ? `/login?next=${encodeURIComponent(pathname + request.nextUrl.search)}`
        : "/login";
    } else {
      let targetId = user.id;
      const { data: realUser } = await client.from("pw_profiles").select("id,status,role").eq("id", user.id).single();
      const verifiedViewAs = realUser?.role === "super_admin" && realUser.status === "active"
        ? parseViewAsCookie(request.cookies.get("pw_view_as")?.value, user.id)
        : null;
      if (verifiedViewAs) {
        targetId = verifiedViewAs;
      }
      const data = targetId === user.id
        ? realUser
        : (await client.from("pw_profiles").select("status,role").eq("id", targetId).single()).data;

      if (
        !data ||
        (
          !["active", "on_leave"].includes(data.status) &&
          !(pathname === "/hiring" && data.status === "applicant" && !["parent", "student"].includes(data.role))
        )
      ) {
        destination = "/access-pending";
      } else if (
        ["parent", "student"].includes(data.role) &&
        pathname !== "/onboarding" &&
        !(pathname === "/kid" && data.role === "student" && request.cookies.has("pw-kid-parent"))
      ) {
        if (targetId !== user.id) {
          let policyOwnerId = targetId;
          if (data.role === "student") {
            const { data: studentLink } = await client
              .from("pw_students")
              .select("parent_id")
              .eq("student_user_id", targetId)
              .limit(1)
              .maybeSingle();
            if (studentLink?.parent_id) policyOwnerId = studentLink.parent_id;
          }
          const { count: currentCount } = await client
            .from("pw_policy_versions")
            .select("id", { count: "exact", head: true })
            .not("published_at", "is", null);
          if (!currentCount || currentCount < 3) {
            destination = "/onboarding";
          } else {
            const { count: acceptedCount } = await client
              .from("pw_policy_acceptances")
              .select("policy_id", { count: "exact", head: true })
              .eq("parent_id", policyOwnerId);
            if (!acceptedCount || acceptedCount < 3) destination = "/onboarding";
          }
        } else {
          const policy = await client.rpc("pw_policy_ready");
          if (policy.error || !policy.data) destination = "/onboarding";
        }
      }
    }
    if (destination) {
      let targetUrl: URL;
      try {
        targetUrl = publicAppUrl(destination);
      } catch {
        targetUrl = new URL(destination, request.nextUrl.origin);
      }
      const redirect = NextResponse.redirect(targetUrl);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/",
    "/schedule",
    "/students",
    "/leads",
    "/finance",
    "/people",
    "/curriculum",
    "/reports",
    "/homework",
    "/workflows",
    "/accounts",
    "/settings",
    "/classroom",
    "/payroll",
    "/learning",
    "/documents",
    "/family",
    "/policies",
    "/onboarding",
    "/kid",
    "/studio",
    "/leave",
    "/hiring",
    "/operations",
    "/management",
    "/communications",
    "/manual",
    "/complaints",
    "/history",
    "/profile",
    "/login",
    "/access-pending",
    "/reset-password",
    "/api/:path*",
  ],
};
