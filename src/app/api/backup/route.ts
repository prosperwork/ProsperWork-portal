import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, sameOrigin, timingSafeSecretMatch } from "@/lib/supabase/server";
import { executeDatabaseBackup } from "@/lib/backup/service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.ACADEMY_CRON_SECRET || process.env.CRON_SECRET;

  let isAuthorized = false;

  // 1. Constant-time Bearer token verification for automated cron execution
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (timingSafeSecretMatch(token, cronSecret, 32)) {
      isAuthorized = true;
    }
  }

  // 2. Authenticated Super Admin session (requires sameOrigin CSRF check & non-impersonated session)
  if (!isAuthorized) {
    if (!sameOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    try {
      const { profile } = await identity();
      const blocked = impersonationBlocked(profile);
      if (blocked) return blocked;
      if ((profile?.role === "super_admin" || profile?.role === "owner") && profile.status === "active") {
        isAuthorized = true;
      }
    } catch {
      // not authenticated
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized access." }, { status: 401 });
  }

  try {
    const result = await executeDatabaseBackup();
    if (!result.success) {
      return NextResponse.json({ error: "Backup failed." }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Database backup completed and uploaded to Google Drive.",
        backup: result,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    console.error("POST /api/backup error:", err);
    return NextResponse.json({ error: "Internal error during backup." }, { status: 500 });
  }
}
