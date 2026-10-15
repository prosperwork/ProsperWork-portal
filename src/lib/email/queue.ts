import { randomUUID } from "node:crypto";
import { provisioningClient } from "@/lib/supabase/server";
import { deliverEmail } from "@/lib/email/transport.mjs";

export interface QueueEmailParams {
  id?: string;
  recipientId: string;
  email: string;
  subject: string;
  template: string;
  payload: Record<string, any>;
  appUrl: string;
}

/**
 * Attempts immediate delivery. If rate-limited or temporarily rejected,
 * automatically persists the message in pw_emails for guaranteed retry.
 */
export async function sendOrQueueEmail(params: QueueEmailParams): Promise<{
  delivered: boolean;
  queued: boolean;
  error?: string;
}> {
  const jobId = params.id || randomUUID();
  const job = {
    id: jobId,
    lease_id: randomUUID(),
    category: "complaints",
    email: params.email,
    subject: params.subject,
    template: params.template,
    payload: params.payload,
  };

  try {
    await deliverEmail(job, params.appUrl);
    return { delivered: true, queued: false };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(
      `Direct email delivery failed for ${params.email} (${params.template}). Queuing for automatic retry:`,
      errorMsg
    );

    // Save into pw_emails queue so the message is never lost
    try {
      const adminClient = provisioningClient();
      const dedupKey = `complaint:${jobId}:${Date.now()}`;
      // Schedule fast retry for network hiccups (1 min), staggered (15 mins) for rate-limits
      const isRateLimit =
        errorMsg.toLowerCase().includes("too many") ||
        errorMsg.toLowerCase().includes("limit") ||
        errorMsg.toLowerCase().includes("554") ||
        errorMsg.toLowerCase().includes("451");
      const retryAt = new Date(Date.now() + (isRateLimit ? 15 : 1) * 60 * 1000).toISOString();

      await adminClient.from("pw_emails").insert({
        dedup_key: dedupKey,
        recipient_id: params.recipientId,
        category: "support",
        subject: params.subject,
        template: params.template,
        payload: {
          ...params.payload,
          targetEmail: params.email,
        },
        status: "queued",
        scheduled_at: retryAt,
        last_error: errorMsg,
      });

      return { delivered: false, queued: true, error: errorMsg };
    } catch (queueErr) {
      console.error("Failed to enqueue email job in pw_emails:", queueErr);
      return { delivered: false, queued: false, error: errorMsg };
    }
  }
}

/**
 * Flushes and delivers any pending complaint emails in the queue
 * whose retry timer has matured.
 */
export async function processQueuedComplaintEmails(appUrl: string): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0 };
  const adminClient = provisioningClient();

  try {
    const { data: pending, error } = await adminClient
      .from("pw_emails")
      .select("*")
      .eq("status", "queued")
      .in("template", [
        "parent_complaint_acknowledgement",
        "parent_complaint_alert",
        "complaint_reply_alert",
        "parent_complaint_resolved",
      ])
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(3); // Strict batch limit of 3 to prevent email floods

    if (error || !pending || pending.length === 0) {
      return stats;
    }

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];

      // Introduce a 5-second pacing gap between emails to respect Spacemail flood protection
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      stats.processed++;
      const payload = item.payload as any;
      const targetEmail =
        payload.targetEmail ||
        payload.parentEmail ||
        payload.email ||
        "support@prosperworkmusic.com";

      const job = {
        id: item.id,
        lease_id: randomUUID(),
        category: "complaints",
        email: targetEmail,
        subject: item.subject,
        template: item.template,
        payload,
      };

      try {
        await deliverEmail(job, appUrl);
        await adminClient
          .from("pw_emails")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", item.id);
        stats.sent++;
      } catch (sendErr: any) {
        stats.failed++;
        const nextAttempts = (item.attempts || 0) + 1;
        const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);

        // Stagger retry with jitter (15 to 30 mins) so emails never wake up at the exact same instant
        const staggerMinutes = 15 + Math.floor(Math.random() * 15);
        await adminClient
          .from("pw_emails")
          .update({
            attempts: nextAttempts,
            status: nextAttempts >= 5 ? "failed" : "queued",
            scheduled_at: new Date(Date.now() + staggerMinutes * 60 * 1000).toISOString(),
            last_error: errMsg,
          })
          .eq("id", item.id);

        // If throttled by server rate limits, stop processing remaining items in this batch immediately
        if (
          errMsg.toLowerCase().includes("too many") ||
          errMsg.toLowerCase().includes("limit") ||
          errMsg.toLowerCase().includes("451") ||
          errMsg.toLowerCase().includes("554")
        ) {
          console.warn("Mail server reported rate limit during queue flush. Pausing remaining items.");
          break;
        }
      }
    }
  } catch (err) {
    console.error("Error processing queued complaint emails:", err);
  }

  return stats;
}

