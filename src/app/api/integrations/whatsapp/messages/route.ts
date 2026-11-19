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

    // Dynamically fetch active catalog instruments
    const { data: instrumentRows } = await db
      .from("pw_catalog_items")
      .select("label, code")
      .eq("catalog", "instruments")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });

    const instruments = (instrumentRows || []).map((x: any) => x.label || x.code);

    // Dynamically fetch admin contacts, pricing, and school info from database settings
    const { data: settingsRow } = await db
      .from("pw_settings")
      .select("settings")
      .eq("singleton", true)
      .maybeSingle();

    const settings = (settingsRow?.settings as any) || {};
    const adminContacts: Array<{ name: string; phone: string; role?: string }> =
      Array.isArray(settings.adminContacts) ? settings.adminContacts : [];

    const pricing = settings.pricing || null;
    const schoolPhone = settings.schoolPhone || process.env.WHATSAPP_DISPLAY_PHONE || "";

    let manualTakeover = false;
    if (leadId) {
      const { data: leadRow } = await db
        .from("pw_leads")
        .select("payload")
        .eq("id", leadId)
        .maybeSingle();
      if (leadRow?.payload) {
        const p = leadRow.payload as any;
        manualTakeover = Boolean(p.manual_takeover || p.ai_disabled);
      }
    }

    return NextResponse.json({
      messages: messages || [],
      phoneConfigured: Boolean(getMetaConfig().whatsAppPhoneNumberId),
      admins: adminContacts,
      instruments,
      pricing,
      schoolPhone,
      manualTakeover,
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

    // Handle Re-arm / Test Mode Action (Preserves entire chat history!)
    if (body.action === "reset") {
      const db = provisioningClient();
      const rawPhone = body.phone?.trim();
      const cleanPhone = rawPhone ? cleanWhatsAppPhoneNumber(rawPhone) : "";
      const leadId = body.leadId?.trim();

      // Arm force_next_welcome_reply on the lead WITHOUT deleting any messages
      if (leadId) {
        const { data: leadRow } = await db
          .from("pw_leads")
          .select("payload")
          .eq("id", leadId)
          .maybeSingle();

        if (leadRow?.payload) {
          const p = leadRow.payload as any;
          const updated = {
            ...p,
            force_next_welcome_reply: true,
            manual_takeover: false,
            ai_disabled: false,
            status: body.resetLeadStage === true ? "new" : p.status,
            firstResponseAt: body.resetLeadStage === true ? null : p.firstResponseAt,
          };
          await db
            .from("pw_leads")
            .update({ payload: updated, updated_at: new Date().toISOString() })
            .eq("id", leadId);
        }
      }

      return NextResponse.json({ success: true, rearmed: true });
    }

    // Handle Manual Toggle of AI (On / Off)
    if (body.action === "toggle_ai") {
      const db = provisioningClient();
      const leadId = body.leadId?.trim();
      const enable = Boolean(body.enable);
      if (!leadId) {
        return NextResponse.json({ error: "leadId is required" }, { status: 400 });
      }
      const { data: leadRow } = await db
        .from("pw_leads")
        .select("payload")
        .eq("id", leadId)
        .maybeSingle();

      if (leadRow?.payload) {
        const p = leadRow.payload as any;
        const updated = {
          ...p,
          manual_takeover: !enable,
          ai_disabled: !enable,
        };
        await db
          .from("pw_leads")
          .update({ payload: updated, updated_at: new Date().toISOString() })
          .eq("id", leadId);
      }
      return NextResponse.json({ success: true, aiEnabled: enable });
    }

    // Handle Direct Admin Assignment Action
    if (body.action === "assign_owner") {
      const db = provisioningClient();
      const leadId = body.leadId?.trim();
      const owner = body.owner?.trim();
      if (!leadId || !owner) {
        return NextResponse.json(
          { error: "leadId and owner are required." },
          { status: 400 }
        );
      }

      const { data: leadRow } = await db
        .from("pw_leads")
        .select("payload")
        .eq("id", leadId)
        .maybeSingle();

      if (leadRow?.payload) {
        const p = leadRow.payload as any;
        const updated = {
          ...p,
          owner,
        };
        await db
          .from("pw_leads")
          .update({
            payload: updated,
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }

      return NextResponse.json({ success: true, owner });
    }

    const { leadId, phone, message, buttons, assignOwner } = body;

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
      senderName: profile.name || "Administrator",
      senderType: "manual",
    });

    if (!sendRes.success) {
      return NextResponse.json(
        { error: sendRes.error || "Failed to send WhatsApp message" },
        { status: 400 }
      );
    }

    // When a manual person sends a message, permanently disable AI for this lead and update owner if provided
    if (leadId) {
      const db = provisioningClient();
      const { data: leadRow } = await db
        .from("pw_leads")
        .select("payload")
        .eq("id", leadId)
        .maybeSingle();

      if (leadRow?.payload) {
        const p = leadRow.payload as any;
        const updated = {
          ...p,
          manual_takeover: true,
          ai_disabled: true,
          manual_contacted_at: new Date().toISOString(),
          manual_contacted_by: profile.name || "Administrator",
          ...(assignOwner ? { owner: assignOwner.trim() } : {}),
        };
        await db
          .from("pw_leads")
          .update({
            payload: updated,
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }
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
