import { NextRequest, NextResponse } from "next/server";
import {
  fetchMetaLead,
  getMetaConfig,
  ingestMetaLead,
  ingestWhatsAppWebhook,
  verifyMetaSignature,
} from "@/lib/meta/graph-client";
import { provisioningClient } from "@/lib/supabase/server";
import type { MetaWebhookPayload } from "@/lib/meta/meta-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/meta/webhook
 * Handles Meta Webhook Verification Challenge for both Page (Leads) & WhatsApp
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const config = getMetaConfig();

  if (mode === "subscribe" && token && challenge) {
    if (token === config.verifyToken) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden: Verify token mismatch", { status: 403 });
  }

  return new Response("Invalid request parameters", { status: 400 });
}

/**
 * POST /api/integrations/meta/webhook
 * Receives Meta "leadgen" Webhook Events AND WhatsApp Inbound Messages in Real-Time
 */
export async function POST(request: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Cannot read request body" }, { status: 400 });
  }

  const signature = request.headers.get("x-hub-signature-256");

  // 1. Verify HMAC-SHA256 signature using Meta App Secret
  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json(
      { error: "Invalid or missing webhook signature" },
      { status: 401 }
    );
  }

  // 2. Parse payload
  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // 3. Handle WhatsApp Business Account Events
  if (payload.object === "whatsapp_business_account") {
    try {
      const waResult = await ingestWhatsAppWebhook(payload);
      return NextResponse.json({
        ok: true,
        type: "whatsapp",
        messages: waResult.processedMessages,
        statuses: waResult.processedStatuses,
      });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "WhatsApp webhook error" },
        { status: 500 }
      );
    }
  }

  // 4. Handle Meta Page (Lead Ads) Events
  if (payload.object !== "page" || !Array.isArray(payload.entry)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const db = provisioningClient();
  let processedCount = 0;
  let errorCount = 0;

  for (const entry of payload.entry) {
    if (!Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;

      const { leadgen_id, form_id } = change.value;

      try {
        // Fetch full lead details directly via Meta Graph API
        const fullLead = await fetchMetaLead(leadgen_id);
        
        // Ensure form_id is attached if missing from lead object
        if (!fullLead.form_id && form_id) {
          fullLead.form_id = form_id;
        }

        // Ingest into database idempotently
        await ingestMetaLead(fullLead, { syncSource: "webhook" });
        processedCount++;
      } catch (err) {
        errorCount++;
        // Log non-PII diagnostic in pw_meta_sync_logs
        await db.from("pw_meta_sync_logs").insert({
          sync_type: "webhook",
          form_id: form_id || null,
          leads_found: 1,
          leads_inserted: 0,
          leads_skipped: 1,
          status: "failed",
          error_message: err instanceof Error ? err.message : "Webhook lead ingestion error",
        });
      }
    }
  }

  // Record successful sync log if leads were processed
  if (processedCount > 0) {
    await db.from("pw_meta_sync_logs").insert({
      sync_type: "webhook",
      leads_found: processedCount,
      leads_inserted: processedCount,
      leads_skipped: 0,
      status: errorCount > 0 ? "partial" : "success",
    });
  }

  // Promptly return 200 OK to acknowledge Meta delivery
  return NextResponse.json({
    ok: true,
    received: true,
    processed: processedCount,
    errors: errorCount,
  });
}

