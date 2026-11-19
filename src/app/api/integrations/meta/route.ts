import { NextRequest, NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { hasPermission } from "@/lib/academy/roles";
import { provisioningClient, sameOrigin } from "@/lib/supabase/server";
import {
  fetchPageLeadForms,
  getMetaConfig,
  syncExistingMetaLeads,
  verifyMetaConnection,
} from "@/lib/meta/graph-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/meta
 * Retrieves Meta integration status, forms, sync history, and diagnostic info
 */
export async function GET(request: NextRequest) {
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active account required." }, { status: 401 });
    }

    const canManageLeads =
      ["super_admin", "owner", "admin", "general_manager"].includes(profile.role) ||
      (await hasPermission(client, profile, "workspace.leads"));

    if (!canManageLeads) {
      return NextResponse.json(
        { error: "Administrator or admissions access required." },
        { status: 403 }
      );
    }

    const db = provisioningClient();
    const config = getMetaConfig();

    // 1. Check live connection
    const connection = await verifyMetaConnection();

    // 2. Fetch cached forms & sync logs
    const [formsRes, logsRes, leadsCountRes, fbCountRes, igCountRes] =
      await Promise.all([
        db.from("pw_meta_forms").select("*").order("name"),
        db.from("pw_meta_sync_logs").select("*").order("created_at", { ascending: false }).limit(15),
        db.from("pw_meta_leads").select("id", { count: "exact", head: true }),
        db.from("pw_meta_leads").select("id", { count: "exact", head: true }).eq("platform", "fb"),
        db.from("pw_meta_leads").select("id", { count: "exact", head: true }).eq("platform", "ig"),
      ]);

    // 3. Resolve public webhook URL
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const webhookUrl = `${proto}://${host}/api/integrations/meta/webhook`;

    return NextResponse.json({
      ok: true,
      config: {
        appId: config.appId ? `${config.appId.slice(0, 4)}***` : "",
        pageId: config.pageId,
        portfolioId: config.portfolioId,
        hasAccessToken: Boolean(config.accessToken),
        hasAppSecret: Boolean(config.appSecret),
        hasVerifyToken: Boolean(config.verifyToken),
        graphVersion: config.graphVersion,
        webhookUrl,
      },
      connection,
      forms: formsRes.data || [],
      syncLogs: logsRes.data || [],
      stats: {
        totalLeads: leadsCountRes.count || 0,
        facebookLeads: fbCountRes.count || 0,
        instagramLeads: igCountRes.count || 0,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Meta integration data." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/integrations/meta
 * Executes administrator integration actions (Manual Sync, Form Discovery, Verification)
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

    const isOwnerOrAdmin =
      ["super_admin", "owner", "admin"].includes(profile.role) ||
      (await hasPermission(client, profile, "workspace.leads"));

    if (!isOwnerOrAdmin) {
      return NextResponse.json(
        { error: "Administrator authorization required." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || "sync";

    if (action === "sync") {
      const formId = body.formId ? String(body.formId) : undefined;
      const limit = body.limit ? Number(body.limit) : 500;

      const result = await syncExistingMetaLeads({
        formId,
        limitPerForm: limit,
        actorId: profile.id,
      });

      return NextResponse.json({
        ok: result.status !== "failed",
        ...result,
      });
    }

    if (action === "fetch_forms") {
      const forms = await fetchPageLeadForms();
      return NextResponse.json({
        ok: true,
        forms,
      });
    }

    if (action === "subscribe_page") {
      const { subscribePageToWebhooks } = await import("@/lib/meta/graph-client");
      const res = await subscribePageToWebhooks();
      return NextResponse.json({
        ok: res.success,
        ...res,
      });
    }

    if (action === "verify") {
      const connection = await verifyMetaConnection();
      return NextResponse.json({
        ok: true,
        connection,
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to execute Meta action." },
      { status: 500 }
    );
  }
}
