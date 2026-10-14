import { NextResponse } from "next/server";
import{publicAppUrl}from"@/lib/supabase/app-url.mjs";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
import { automationClient } from "@/lib/supabase/automation";
import { deliverEmail, safeEmailError } from "@/lib/email/transport.mjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { client, user, profile } = await identity();
    if (profile?.role !== "super_admin" || profile.status !== "active" || !user?.email_confirmed_at)
      return NextResponse.json({ error: "Verified Super Admin access is required." }, { status: 403 });
    if (!process.env.SMTP_PASSWORD) return NextResponse.json({ error: "SMTP is not configured." }, { status: 503 });
    const queued = await client.rpc("pw_queue_owner_test");
    if (queued.error) return NextResponse.json({ error: queued.error.code === "PW429" ? "Wait one minute before sending another test." : "The email could not be queued." }, { status: queued.error.code === "PW429" ? 429 : 503 });
    const worker = automationClient();
    const claim = await worker.rpc("pw_claim_emails", { p_id: queued.data });
    const job = claim.data?.[0];
    if (claim.error || !job) return NextResponse.json({ error: "Your verification email is queued. Check delivery history shortly." }, { status: 409 });
    let failure: string | null = null;
    try { await deliverEmail(job, publicAppUrl("/").origin); }
    catch (error) { failure = safeEmailError(error); }
    const recorded = await worker.rpc("pw_finish_email", { p_id: job.id, p_lease: job.lease_id, p_success: !failure, p_error: failure });
    if (failure) return NextResponse.json({ error: failure === "EAUTH" ? "SMTP rejected the mailbox login. Check SMTP_PASSWORD in Secrets." : "SMTP delivery failed. The queue will retry; check delivery history." }, { status: 502 });
    if (recorded.error) return NextResponse.json({ error: "SMTP accepted the email, but its delivery record could not be updated." }, { status: 503 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "The verification email could not be sent." }, { status: 503 }); }
}
