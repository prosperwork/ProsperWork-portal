import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { executeDatabaseBackup } from "@/lib/backup/service";

export const maxDuration = 300; // Allow up to 5 minutes for full database dump
export const dynamic = "force-dynamic";

/**
 * Super Admin or Automated Cron endpoint to trigger database backup.
 * 
 * Supports two authentication methods:
 * 1. Bearer Token via CRON_SECRET / ACADEMY_CRON_SECRET for automated cron execution.
 * 2. Authenticated Super Admin session from the portal UI.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.ACADEMY_CRON_SECRET || process.env.CRON_SECRET;

  let isAuthorized = false;

  // 1. Check Cron Token
  if (cronSecret && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === cronSecret) {
      isAuthorized = true;
    }
  }

  // 2. Check Super Admin Session if not authorized by cron token
  if (!isAuthorized) {
    try {
      const { profile } = await identity();
      if (profile?.role === "super_admin" && profile.status === "active") {
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
      return NextResponse.json({ error: result.error || "Backup failed." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Database backup completed and uploaded to Google Drive.",
      backup: result
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal error during backup." }, { status: 500 });
  }
}

