import { NextRequest, NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { provisioningClient } from "@/lib/supabase/server";
import {
  cleanWhatsAppPhoneNumber,
  getMetaConfig,
  sendWhatsAppMessage,
} from "@/lib/meta/graph-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/whatsapp/messages?leadId=...&phone=...
 * Fetches WhatsApp message history for a lead or phone number
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active account required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId")?.trim();
    const rawPhone = searchParams.get("phone")?.trim();
    const cleanPhone = rawPhone ? cleanWhatsAppPhoneNumber(rawPhone) : "";

    if (!leadId && !cleanPhone) {
      return NextResponse.json(
        { error: "Must provide either leadId or phone query parameter." },
        { status: 400 }
      );
    }

    const db = provisioningClient();

    let query = db.from("pw_whatsapp_messages").select("*");

    if (leadId && cleanPhone) {
      const lastDigits = cleanPhone.slice(-9);
      query = query.or(
        `lead_id.eq.${leadId},phone_number.eq.${cleanPhone},phone_number.ilike.%${lastDigits}%`
      );
    } else if (leadId) {
      query = query.eq("lead_id", leadId);
    } else {
      const lastDigits = cleanPhone.slice(-9);
      query = query.or(`phone_number.eq.${cleanPhone},phone_number.ilike.%${lastDigits}%`);
    }

    const { data: messages, error } = await query.order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      messages: messages || [],
      phoneConfigured: Boolean(getMetaConfig().whatsAppPhoneNumberId),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/integrations/whatsapp/messages
 * Sends a WhatsApp message to a lead or parent via Meta Cloud API
 */
export async function POST(request: NextRequest) {
  try {
    const { profile } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active account required." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    // Handle Reset / Test Mode Action
    if (body.action === "reset") {
      const db = provisioningClient();
      const rawPhone = body.phone?.trim();
      const cleanPhone = rawPhone ? cleanWhatsAppPhoneNumber(rawPhone) : "";
      const leadId = body.leadId?.trim();

      if (leadId && cleanPhone) {
        const lastDigits = cleanPhone.slice(-9);
        await db
          .from("pw_whatsapp_messages")
          .delete()
          .or(`lead_id.eq.${leadId},phone_number.eq.${cleanPhone},phone_number.ilike.%${lastDigits}%`);
      } else if (cleanPhone) {
        const lastDigits = cleanPhone.slice(-9);
        await db
          .from("pw_whatsapp_messages")
          .delete()
          .or(`phone_number.eq.${cleanPhone},phone_number.ilike.%${lastDigits}%`);
      } else if (leadId) {
        await db.from("pw_whatsapp_messages").delete().eq("lead_id", leadId);
      }

      // Reset lead status back to "new" to allow full end-to-end testing
      if (leadId && body.resetLeadStage !== false) {
        const { data: leadRow } = await db
          .from("pw_leads")
          .select("payload")
          .eq("id", leadId)
          .maybeSingle();

        if (leadRow?.payload) {
          const p = leadRow.payload as any;
          const updated = {
            ...p,
            status: "new",
            firstResponseAt: null,
          };
          await db
            .from("pw_leads")
            .update({ payload: updated, updated_at: new Date().toISOString() })
            .eq("id", leadId);
        }
      }

      return NextResponse.json({ success: true, reset: true });
    }

    const { leadId, phone, message, buttons } = body;

    if (!phone || !message?.trim()) {
      return NextResponse.json(
        { error: "Destination phone number and message body are required." },
        { status: 400 }
      );
    }

    const sendRes = await sendWhatsAppMessage({
      to: phone,
      body: message.trim(),
      leadId: leadId || undefined,
      buttons: Array.isArray(buttons) && buttons.length > 0 ? buttons : undefined,
    });

    if (!sendRes.success) {
      return NextResponse.json(
        { error: sendRes.error || "Failed to send WhatsApp message" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: sendRes.messageId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send message" },
      { status: 500 }
    );
  }
}
