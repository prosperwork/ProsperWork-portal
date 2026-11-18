import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, sameOrigin, timingSafeSecretMatch } from "@/lib/supabase/server";
import { publicAppUrl } from "@/lib/supabase/app-url.mjs";
import { syncComplaintEmailReplies } from "@/lib/email/inbox-sync";
import { processQueuedComplaintEmails } from "@/lib/email/queue";
import { hasPermission } from "@/lib/academy/roles";

export const dynamic = "force-dynamic";

const reply = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request: Request) {
  try {
    const cronHeader = request.headers.get("x-cron-secret");
    const configuredCronSecret = process.env.ACADEMY_CRON_SECRET || process.env.CRON_SECRET;
    const isCron = timingSafeSecretMatch(cronHeader, configuredCronSecret, 32);

    if (!isCron) {
      if (!sameOrigin(request)) {
        return reply({ error: "Invalid request origin." }, 403);
      }
      const { client, profile } = await identity();
      const canManage = await hasPermission(client, profile, "complaints.manage");
      if (!profile || !canManage) {
        return reply({ error: "Administrative staff access required." }, 403);
      }
      const blocked = impersonationBlocked(profile);
      if (blocked) return blocked;
    }

    const appUrl = publicAppUrl("/").origin;
    const [syncResult, queueResult] = await Promise.all([
      syncComplaintEmailReplies(),
      processQueuedComplaintEmails(appUrl),
    ]);

    return reply({
      ok: true,
      message: `Scanned ${syncResult.scanned} emails, imported ${syncResult.imported} replies. Flushed queue: ${queueResult.sent} sent, ${queueResult.failed} failed.`,
      syncResult,
      queueResult,
    });
  } catch (err) {
    console.error("Complaint email sync error:", err);
    return reply({ error: "Failed to synchronize email replies." }, 500);
  }
}

export async function GET() {
  return reply({ error: "Use POST to trigger complaint email synchronization." }, 405);
}
