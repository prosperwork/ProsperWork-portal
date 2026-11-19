import { NextRequest, NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { hasPermission } from "@/lib/academy/roles";
import { sameOrigin } from "@/lib/supabase/server";
import { sendMetaConversionEvent } from "@/lib/meta/graph-client";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/meta/conversions
 * Dispatches an offline/CRM conversion event to Meta Conversions API (CAPI)
 * Whenever a lead moves to Trial Booked, Converted, or Contacted.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active account required." }, { status: 401 });
    }

    const canManageLeads =
      ["super_admin", "owner", "admin", "general_manager", "sales_marketing"].includes(
        profile.role
      ) || (await hasPermission(client, profile, "workspace.leads"));

    if (!canManageLeads) {
      return NextResponse.json(
        { error: "Insufficient permissions to update lead pipeline." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.status) {
      return NextResponse.json(
        { error: "Missing required conversion parameters (status)." },
        { status: 400 }
      );
    }

    const result = await sendMetaConversionEvent({
      leadId: body.leadId,
      metaLeadId: body.metaLeadId,
      leadName: body.leadName,
      email: body.email,
      phone: body.phone,
      instrument: body.instrument,
      status: body.status,
      value: body.value,
      currency: body.currency,
      actorId: profile.id,
    });

    return NextResponse.json({
      ok: result.success,
      eventsReceived: result.eventsReceived,
      fbtraceId: result.fbtraceId,
      error: result.error,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while sending conversion to Meta.",
      },
      { status: 500 }
    );
  }
}
