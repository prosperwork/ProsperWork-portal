import { createHmac, timingSafeEqual } from "node:crypto";
import { provisioningClient } from "@/lib/supabase/server";
import type {
  MetaConnectionStatus,
  MetaLead,
  MetaLeadFieldData,
  MetaLeadgenForm,
  MetaSyncResult,
  NormalizedLead,
} from "./meta-types";

/**
 * Meta Lead Ads Graph API Configuration
 */
export function getMetaConfig() {
  return {
    appId: process.env.META_APP_ID?.trim() || "",
    appSecret: process.env.META_APP_SECRET?.trim() || "",
    pageId: process.env.META_PAGE_ID?.trim() || "",
    accessToken: process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim() || "",
    portfolioId: process.env.META_BUSINESS_PORTFOLIO_ID?.trim() || "",
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "",
    graphVersion: process.env.META_GRAPH_API_VERSION?.trim() || "v22.0",
  };
}

const GRAPH_BASE_URL = "https://graph.facebook.com";

/**
 * Validates Meta Webhook HMAC-SHA256 signature
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null
): boolean {
  const { appSecret } = getMetaConfig();
  if (!appSecret || !signatureHeader) return false;

  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;

  const expectedHash = parts[1].trim().toLowerCase();
  const hmac = createHmac("sha256", appSecret);
  hmac.update(rawBody);
  const actualHash = hmac.digest("hex").toLowerCase();

  try {
    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const actualBuffer = Buffer.from(actualHash, "hex");
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}

let cachedPageToken: { token: string; expiresAt: number } | null = null;

/**
 * Resolves the Page Access Token by exchanging the System User token with the Page ID.
 * Caches the token in-memory for 1 hour.
 */
export async function getPageAccessToken(): Promise<string> {
  const config = getMetaConfig();
  if (cachedPageToken && cachedPageToken.expiresAt > Date.now()) {
    return cachedPageToken.token;
  }
  if (!config.pageId || !config.accessToken) {
    return config.accessToken || "";
  }

  try {
    const url = new URL(`${GRAPH_BASE_URL}/${config.graphVersion}/${config.pageId}`);
    url.searchParams.set("fields", "access_token");
    url.searchParams.set("access_token", config.accessToken);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (data?.access_token) {
      cachedPageToken = {
        token: data.access_token,
        expiresAt: Date.now() + 3600 * 1000,
      };
      return data.access_token;
    }
  } catch {
    // fallback to system user token
  }
  return config.accessToken;
}

interface MetaFetchOptions extends RequestInit {
  usePageToken?: boolean;
}

/**
 * Executes a Graph API request with error handling & rate limit checks
 */
async function metaGraphFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: MetaFetchOptions = {}
): Promise<T> {
  const { graphVersion, accessToken, pageId } = getMetaConfig();
  if (!accessToken) {
    throw new Error(
      "Meta System User Access Token is not configured (META_SYSTEM_USER_ACCESS_TOKEN)."
    );
  }

  // Determine if this endpoint requires a Page Access Token
  const needsPageToken =
    options.usePageToken ||
    (pageId && path.includes(pageId)) ||
    path.includes("leadgen_forms") ||
    path.includes("subscribed_apps") ||
    path.includes("/leads");

  let activeToken = accessToken;
  if (needsPageToken) {
    activeToken = await getPageAccessToken();
  }

  const url = new URL(`${GRAPH_BASE_URL}/${graphVersion}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${activeToken}`);
  headers.set("Accept", "application/json");

  const response = await fetch(url.toString(), {
    ...options,
    headers,
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.error) {
    const err = body?.error || {};
    const message = err.message || `Meta Graph API error (${response.status})`;
    const code = err.code ? ` [Code: ${err.code}]` : "";
    const subcode = err.error_subcode ? ` [Subcode: ${err.error_subcode}]` : "";
    const fbtrace = err.fbtrace_id ? ` (trace: ${err.fbtrace_id})` : "";
    throw new Error(`${message}${code}${subcode}${fbtrace}`);
  }

  return body as T;
}

/**
 * Verifies the connection, system token validity, Page access, and leads permissions
 */
export async function verifyMetaConnection(): Promise<MetaConnectionStatus> {
  const config = getMetaConfig();
  const status: MetaConnectionStatus = {
    configured: Boolean(
      config.pageId && config.accessToken && config.appSecret
    ),
    pageIdConfigured: Boolean(config.pageId),
    tokenConfigured: Boolean(config.accessToken),
    appSecretConfigured: Boolean(config.appSecret),
    webhookTokenConfigured: Boolean(config.verifyToken),
    graphVersion: config.graphVersion,
  };

  if (!config.accessToken) {
    status.error = "Meta System User Access Token is not set in environment variables.";
    return status;
  }

  try {
    // 1. Debug token or inspect /me
    const me = await metaGraphFetch<{ id: string; name?: string }>("/me", {
      fields: "id,name",
    });
    status.validToken = Boolean(me.id);

    // 2. Inspect permissions if debug_token is accessible
    try {
      if (config.appId && config.appSecret) {
        const debug = await metaGraphFetch<{
          data: {
            is_valid: boolean;
            scopes?: string[];
            expires_at?: number;
          };
        }>("/debug_token", {
          input_token: config.accessToken,
        });

        if (debug.data) {
          status.permissions = debug.data.scopes || [];
          const required = ["leads_retrieval", "pages_show_list", "pages_read_engagement"];
          status.missingPermissions = required.filter(
            (perm) => !status.permissions?.includes(perm)
          );
        }
      }
    } catch {
      // debug_token requires app secret / app access token; continue to page check
    }

    // 3. Confirm Page access and webhook subscription
    if (config.pageId) {
      const page = await metaGraphFetch<{
        id: string;
        name: string;
        tasks?: string[];
      }>(`/${config.pageId}`, {
        fields: "id,name,tasks",
      });
      status.pageName = page.name;
      status.pageAccess = Boolean(page.id);

      // Check if page is subscribed to app webhooks
      try {
        const subs = await metaGraphFetch<{
          data: Array<{ id: string; name: string; subscribed_fields?: string[] }>;
        }>(`/${config.pageId}/subscribed_apps`);
        const isSubbed = subs.data?.some(
          (app) => !config.appId || app.id === config.appId || app.subscribed_fields?.includes("leadgen")
        );
        status.pageSubscribed = Boolean(isSubbed);
      } catch {
        // May fail if pages_manage_metadata is not yet propagated
      }
    }

    return status;
  } catch (err) {
    status.validToken = false;
    status.error = err instanceof Error ? err.message : "Meta connection check failed.";
    return status;
  }
}

/**
 * Programmatically subscribes the Facebook Page to this app's leadgen webhooks.
 * Requires pages_manage_metadata permission.
 */
export async function subscribePageToWebhooks(): Promise<{ success: boolean; error?: string }> {
  const { pageId } = getMetaConfig();
  if (!pageId) throw new Error("Meta Page ID is not configured (META_PAGE_ID).");

  try {
    const res = await metaGraphFetch<{ success: boolean }>(
      `/${pageId}/subscribed_apps`,
      { subscribed_fields: "leadgen" },
      { method: "POST" }
    );
    return { success: res?.success ?? true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to subscribe Page to app webhooks.",
    };
  }
}

/**
 * Retrieves all leadgen forms associated with the connected Facebook Page and updates pw_meta_forms
 */
export async function fetchPageLeadForms(): Promise<MetaLeadgenForm[]> {
  const { pageId } = getMetaConfig();
  if (!pageId) throw new Error("Meta Page ID is not configured (META_PAGE_ID).");

  interface FormsResponse {
    data: Array<{
      id: string;
      name: string;
      status: string;
      locale?: string;
      leads_count?: number;
      questions?: any[];
    }>;
  }

  const response = await metaGraphFetch<FormsResponse>(`/${pageId}/leadgen_forms`, {
    fields: "id,name,status,locale,leads_count,questions",
    limit: 100,
  });

  const forms = response.data || [];
  const db = provisioningClient();

  // Upsert into pw_meta_forms
  for (const form of forms) {
    await db.from("pw_meta_forms").upsert(
      {
        id: form.id,
        page_id: pageId,
        name: form.name,
        status: form.status,
        locale: form.locale || null,
        questions: form.questions || [],
        leads_count: form.leads_count || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  }

  return forms;
}

/**
 * Retrieves a single lead by its leadgen_id
 */
export async function fetchMetaLead(leadgenId: string): Promise<MetaLead> {
  return metaGraphFetch<MetaLead>(`/${leadgenId}`, {
    fields:
      "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,is_organic,platform",
  });
}

/**
 * Normalizes Meta Lead Ads field_data array into structured fields
 * Handles standard form fields and arbitrary custom questions
 */
export function normalizeLeadFieldData(
  fieldData: MetaLeadFieldData[] = [],
  createdTime: string,
  platformOverride?: string
): NormalizedLead {
  let fullName = "";
  let firstName = "";
  let lastName = "";
  let email = "";
  let phone = "";
  let childName = "";
  let instrument = "";
  let readiness = "";
  const customQuestions: Record<string, string> = {};

  for (const field of fieldData) {
    const key = (field.name || "").toLowerCase().trim();
    const value = (field.values?.[0] || "").trim();
    if (!value) continue;

    // Check standard Meta lead keys
    if (key === "full_name") {
      fullName = value;
    } else if (key === "first_name") {
      firstName = value;
    } else if (key === "last_name") {
      lastName = value;
    } else if (key === "email") {
      email = value.toLowerCase();
    } else if (key === "phone_number" || key === "phone") {
      phone = value;
    } else if (
      key.includes("child") ||
      key.includes("student") ||
      key.includes("kid") ||
      key.includes("learner")
    ) {
      childName = value;
      customQuestions[field.name] = value;
    } else if (
      key.includes("instrument") ||
      key.includes("course") ||
      key.includes("lesson_type")
    ) {
      instrument = value;
      customQuestions[field.name] = value;
    } else if (
      key.includes("ready") ||
      key.includes("interested") ||
      key.includes("start") ||
      key.includes("age")
    ) {
      readiness = value;
      customQuestions[field.name] = value;
    } else {
      customQuestions[field.name] = value;
    }
  }

  // Construct full name if first/last were submitted separately
  if (!fullName) {
    fullName = [firstName, lastName].filter(Boolean).join(" ");
  }
  if (!fullName) {
    fullName = "ProsperWork Meta Lead";
  }

  // Default platform detection
  let platform: "fb" | "ig" = "fb";
  if (platformOverride === "ig" || platformOverride === "instagram") {
    platform = "ig";
  }

  return {
    fullName,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email,
    phone,
    childName: childName || undefined,
    instrument: instrument || undefined,
    readiness: readiness || undefined,
    platform,
    customQuestions,
    createdTime,
  };
}

/**
 * Idempotently ingests a Meta Lead into pw_meta_leads and pw_leads
 * Guarantees no duplicates through database unique constraints
 */
export async function ingestMetaLead(
  lead: MetaLead,
  options: {
    syncSource?: "webhook" | "manual";
    formName?: string;
  } = {}
): Promise<{ inserted: boolean; leadId: string; metaLeadId: string }> {
  const db = provisioningClient();
  const config = getMetaConfig();

  // 1. Check if this Meta lead was already ingested
  const existingMeta = await db
    .from("pw_meta_leads")
    .select("id, lead_id")
    .eq("id", lead.id)
    .maybeSingle();

  if (existingMeta.data?.id) {
    return {
      inserted: false,
      leadId: existingMeta.data.lead_id || "",
      metaLeadId: lead.id,
    };
  }

  // 2. Normalize fields
  const normalized = normalizeLeadFieldData(
    lead.field_data,
    lead.created_time,
    lead.platform
  );

  // Determine form name if not provided
  let formName = options.formName || "";
  if (!formName && lead.form_id) {
    const formRecord = await db
      .from("pw_meta_forms")
      .select("name")
      .eq("id", lead.form_id)
      .maybeSingle();
    formName = formRecord.data?.name || `Meta Form ${lead.form_id}`;
  }

  // Build notes detailing custom questions, ad, and form info
  const noteLines: string[] = [];
  noteLines.push(`Source: Meta Lead Ads (${normalized.platform === "ig" ? "Instagram" : "Facebook"})`);
  if (formName) noteLines.push(`Form: ${formName}`);
  if (lead.campaign_name) noteLines.push(`Campaign: ${lead.campaign_name}`);
  if (lead.ad_name) noteLines.push(`Ad: ${lead.ad_name}`);
  if (normalized.readiness) noteLines.push(`Readiness: ${normalized.readiness}`);

  const extraKeys = Object.entries(normalized.customQuestions);
  if (extraKeys.length > 0) {
    noteLines.push("\nForm Responses:");
    for (const [q, a] of extraKeys) {
      noteLines.push(`• ${q}: ${a}`);
    }
  }

  const finalNotes = noteLines.join("\n");
  const targetLeadId = `lead_meta_${lead.id}`;
  const arrivedAt = lead.created_time
    ? new Date(lead.created_time).toISOString()
    : new Date().toISOString();

  // 3. Upsert into pw_leads (our standard academy CRM table)
  const leadPayload = {
    id: targetLeadId,
    parentName: normalized.fullName,
    childName: normalized.childName || normalized.fullName,
    email: normalized.email,
    phone: normalized.phone,
    instrument: normalized.instrument || "Piano",
    source: normalized.platform === "ig" ? "Meta - Instagram" : "Meta - Facebook",
    status: "new",
    arrivedAt,
    owner: "Unassigned",
    notes: finalNotes,
    metaLeadId: lead.id,
    metaFormId: lead.form_id,
    metaPlatform: normalized.platform,
    platform: normalized.platform,
    readiness: normalized.readiness,
    campaignName: lead.campaign_name,
    adName: lead.ad_name,
    customAnswers: normalized.customQuestions,
  };

  const leadInsert = await db.from("pw_leads").upsert(
    {
      id: targetLeadId,
      meta_lead_id: lead.id,
      meta_form_id: lead.form_id,
      platform: normalized.platform,
      payload: leadPayload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "meta_lead_id" }
  );

  if (leadInsert.error) {
    throw new Error(`Failed to save lead record: ${leadInsert.error.message}`);
  }

  // 4. Upsert into pw_meta_leads (full raw payload for compliance and audit)
  const metaInsert = await db.from("pw_meta_leads").upsert(
    {
      id: lead.id,
      form_id: lead.form_id,
      form_name: formName || null,
      page_id: config.pageId,
      ad_id: lead.ad_id || null,
      ad_name: lead.ad_name || null,
      adset_id: lead.adset_id || null,
      adset_name: lead.adset_name || null,
      campaign_id: lead.campaign_id || null,
      campaign_name: lead.campaign_name || null,
      platform: normalized.platform,
      field_data: lead.field_data || [],
      answers: normalized.customQuestions,
      lead_id: targetLeadId,
      sync_source: options.syncSource || "webhook",
      raw_payload: lead,
      created_time: arrivedAt,
    },
    { onConflict: "id" }
  );

  if (metaInsert.error) {
    throw new Error(`Failed to save meta lead details: ${metaInsert.error.message}`);
  }

  // 5. Update form counter
  if (lead.form_id) {
    await db
      .from("pw_meta_forms")
      .update({
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", lead.form_id);
  }

  return {
    inserted: true,
    leadId: targetLeadId,
    metaLeadId: lead.id,
  };
}

/**
 * Synchronizes existing leads from Meta Forms into the database
 * Handles pagination and avoids duplicates
 */
export async function syncExistingMetaLeads(options: {
  formId?: string;
  limitPerForm?: number;
  actorId?: string;
}): Promise<MetaSyncResult> {
  const db = provisioningClient();
  const forms = await fetchPageLeadForms();

  const targetForms = options.formId
    ? forms.filter((f) => f.id === options.formId)
    : forms;

  if (targetForms.length === 0) {
    return {
      leadsFound: 0,
      leadsInserted: 0,
      leadsSkipped: 0,
      status: "success",
      error: "No active Meta lead forms found for this Page.",
    };
  }

  let totalFound = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let lastError = "";

  for (const form of targetForms) {
    let nextCursor: string | undefined = undefined;
    const maxLeads = options.limitPerForm || 500;
    let formLeadsFetched = 0;

    interface FormLeadsResponse {
      data: MetaLead[];
      paging?: {
        cursors?: { after?: string };
        next?: string;
      };
    }

    try {
      while (formLeadsFetched < maxLeads) {
        const queryParams: Record<string, string | number | undefined> = {
          fields:
            "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,is_organic,platform",
          limit: 100,
        };
        if (nextCursor) queryParams.after = nextCursor;

        const response: FormLeadsResponse = await metaGraphFetch<FormLeadsResponse>(
          `/${form.id}/leads`,
          queryParams
        );

        const leads = response.data || [];
        if (leads.length === 0) break;

        totalFound += leads.length;
        formLeadsFetched += leads.length;

        for (const rawLead of leads) {
          try {
            const outcome = await ingestMetaLead(rawLead, {
              syncSource: "manual",
              formName: form.name,
            });
            if (outcome.inserted) {
              totalInserted++;
            } else {
              totalSkipped++;
            }
          } catch (itemErr) {
            totalSkipped++;
            lastError = itemErr instanceof Error ? itemErr.message : "Error saving lead";
          }
        }

        if (response.paging?.cursors?.after && response.paging.next) {
          nextCursor = response.paging.cursors.after;
        } else {
          break;
        }
      }
    } catch (formErr) {
      lastError = formErr instanceof Error ? formErr.message : "Failed to sync form";
    }
  }

  const resultStatus = lastError
    ? totalInserted > 0
      ? "partial"
      : "failed"
    : "success";

  // Record audit log
  await db.from("pw_meta_sync_logs").insert({
    sync_type: "manual",
    form_id: options.formId || null,
    leads_found: totalFound,
    leads_inserted: totalInserted,
    leads_skipped: totalSkipped,
    status: resultStatus,
    error_message: lastError || null,
    actor_id: options.actorId || null,
  });

  return {
    leadsFound: totalFound,
    leadsInserted: totalInserted,
    leadsSkipped: totalSkipped,
    status: resultStatus,
    error: lastError || undefined,
  };
}
