import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { syncComplaintEmailReplies } from "@/lib/email/inbox-sync";

export const dynamic = "force-dynamic";

const reply = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request: Request) {
  try {
    // Check if called via cron secret or authenticated portal session
    const cronSecret = request.headers.get("x-cron-secret");
    const isCron =
      cronSecret &&
      (cronSecret === process.env.CRON_SECRET ||
        cronSecret === process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!isCron) {
      const { profile } = await identity();
      if (!profile || profile.status !== "active") {
        return reply({ error: "Active academy session required." }, 403);
      }
    }

    const result = await syncComplaintEmailReplies();

    return reply({
      ok: true,
      message: `Scanned ${result.scanned} emails, imported ${result.imported} new replies.`,
      result,
    });
  } catch (err) {
    console.error("Complaint email sync error:", err);
    return reply(
      {
        error: "Failed to synchronize email replies.",
        detail: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}

export async function GET(request: Request) {
  // Allow GET for simple webhook/cron invocation
  return POST(request);
}

