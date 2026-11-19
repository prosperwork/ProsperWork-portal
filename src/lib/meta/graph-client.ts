import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { provisioningClient } from "@/lib/supabase/server";
import { generateSmartWhatsAppAIReply } from "@/lib/ai/whatsapp-auto-reply";
import type {
  MetaConnectionStatus,
  MetaLead,
  MetaLeadFieldData,
  MetaLeadgenForm,
  MetaSyncResult,
  NormalizedLead,
  WhatsAppMessageRecord,
  WhatsAppSendMessageParams,
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
    pixelId: process.env.META_PIXEL_ID?.trim() || "808471361998730",
    adAccountId: process.env.META_AD_ACCOUNT_ID?.trim() || "act_937170145457887",
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "",
    graphVersion: process.env.META_GRAPH_API_VERSION?.trim() || "v22.0",
    whatsAppPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "1438014379400273",
    whatsAppBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || "1759883001963705",
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
  let childAge = "";
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
    } else if (
      key === "phone_number" ||
      key === "phone" ||
      key.includes("phone") ||
      key.includes("whatsapp") ||
      key.includes("mobile") ||
      key.includes("contact")
    ) {
      phone = value;
      customQuestions[field.name] = value;
    } else if (
      key.includes("child") ||
      key.includes("student") ||
      key.includes("kid") ||
      key.includes("learner")
    ) {
      childName = value;
      customQuestions[field.name] = value;
    } else if (
      key.includes("age") ||
      key.includes("how_old") ||
      key.includes("years_old")
    ) {
      childAge = value.replace(/_/g, " ").trim();
      customQuestions[field.name] = childAge;
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
      key.includes("budget")
    ) {
      let cleanVal = value.replace(/_/g, " ").trim();
      if (cleanVal.endsWith(".")) cleanVal = cleanVal.slice(0, -1);
      cleanVal = cleanVal.charAt(0).toUpperCase() + cleanVal.slice(1);
      readiness = cleanVal;
      customQuestions[field.name] = cleanVal;
    } else {
      let cleanVal = value.replace(/_/g, " ").trim();
      customQuestions[field.name] = cleanVal;
    }
  }

  // Append age to child name if available
  if (childAge) {
    if (childName && !childName.includes("Age")) {
      childName = `${childName} (Age: ${childAge})`;
    } else if (!childName) {
      childName = `Child (Age: ${childAge})`;
    }
  }

  // Construct full name if first/last were submitted separately
  if (!fullName) {
    fullName = [firstName, lastName].filter(Boolean).join(" ");
  }
  if (!fullName || fullName.includes("<test lead:")) {
    fullName = fullName.includes("<test lead:") ? "Meta Test Candidate" : "ProsperWork Meta Lead";
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

  const noteParts: string[] = [];
  if (lead.campaign_name) noteParts.push(`Campaign: ${lead.campaign_name}`);
  if (lead.ad_name) noteParts.push(`Ad: ${lead.ad_name}`);
  const finalNotes = noteParts.join(" · ") || (formName ? `Form: ${formName}` : "Meta Lead Form");

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

export interface MetaConversionParams {
  leadId?: string;
  metaLeadId?: string;
  leadName?: string;
  email?: string;
  phone?: string;
  instrument?: string;
  status: string;
  eventName?: "Schedule" | "Purchase" | "Lead" | "SubmitApplication";
  value?: number;
  currency?: string;
  actorId?: string;
}

/**
 * Fires an offline/CRM conversion event back to Meta Conversions API (CAPI).
 * Enables closed-loop Ad Optimization for paying parents & booked trials.
 */
export async function sendMetaConversionEvent(
  params: MetaConversionParams
): Promise<{ success: boolean; eventsReceived?: number; fbtraceId?: string; error?: string }> {
  const config = getMetaConfig();
  const pixelId = config.pixelId || "808471361998730";
  const accessToken = config.accessToken;

  if (!accessToken || !pixelId) {
    return {
      success: false,
      error: "Meta access token or Pixel ID is not configured.",
    };
  }

  // Determine standard Meta event name based on pipeline stage
  let eventName: "Schedule" | "Purchase" | "Lead" | "SubmitApplication" = params.eventName || "Lead";
  let defaultValue = 0;
  const currency = params.currency || "GBP";

  if (!params.eventName) {
    const st = params.status.toLowerCase();
    if (st === "trial_booked" || st === "trial_requested" || st === "trial_verified") {
      eventName = "Schedule"; // Standard Meta event for booked trials / lessons
      defaultValue = 45.0;
    } else if (st === "converted") {
      eventName = "Purchase"; // Standard Meta event for paying enrolled student
      defaultValue = params.value ?? 45.0;
    } else if (st === "contacted") {
      eventName = "Lead"; // Standard Meta event for qualified lead
    } else {
      eventName = "Lead";
    }
  } else if (params.eventName === "Schedule") {
    defaultValue = 45.0;
  } else if (params.eventName === "Purchase") {
    defaultValue = params.value ?? 45.0;
  }

  // Prepare SHA-256 hashed user data for Meta CAPI matching
  const userData: Record<string, any> = {};

  if (params.metaLeadId) {
    userData.lead_id = params.metaLeadId;
  }

  if (params.email && params.email.includes("@") && !params.email.includes("meta.com")) {
    userData.em = [createHash("sha256").update(params.email.trim().toLowerCase()).digest("hex")];
  }

  if (params.phone) {
    const digitsOnly = params.phone.replace(/[^0-9]/g, "");
    if (digitsOnly.length >= 7) {
      userData.ph = [createHash("sha256").update(digitsOnly).digest("hex")];
    }
  }

  if (params.leadName) {
    const parts = params.leadName.trim().split(/\s+/);
    if (parts[0] && !parts[0].includes("<test")) {
      userData.fn = [createHash("sha256").update(parts[0].toLowerCase()).digest("hex")];
    }
    if (parts.length > 1) {
      userData.ln = [createHash("sha256").update(parts.slice(1).join(" ").toLowerCase()).digest("hex")];
    }
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "system_generated",
        event_source_url: "https://portal.prosperworkmusic.com/leads",
        user_data: userData,
        custom_data: {
          lead_status: params.status,
          currency,
          value: params.value ?? defaultValue,
          content_name: `${params.instrument || "Piano"} Academy ${
            eventName === "Purchase" ? "Enrollment" : eventName === "Schedule" ? "Trial Booking" : "Follow-up"
          }`,
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `${GRAPH_BASE_URL}/${config.graphVersion}/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const result = await res.json().catch(() => null);
    const db = provisioningClient();

    if (res.ok && result?.events_received) {
      await db.from("pw_meta_sync_logs").insert({
        sync_type: "capi_conversion",
        form_id: params.metaLeadId || null,
        leads_found: 1,
        leads_inserted: result.events_received,
        status: "success",
        error_message: JSON.stringify({
          eventName,
          status: params.status,
          fbtrace_id: result.fbtrace_id,
          metaLeadId: params.metaLeadId,
        }),
      });

      return {
        success: true,
        eventsReceived: result.events_received,
        fbtraceId: result.fbtrace_id,
      };
    } else {
      const errMsg = result?.error?.message || "Meta CAPI event delivery failed.";
      await db.from("pw_meta_sync_logs").insert({
        sync_type: "capi_conversion",
        form_id: params.metaLeadId || null,
        leads_found: 1,
        leads_inserted: 0,
        status: "failed",
        error_message: errMsg,
      });

      return {
        success: false,
        error: errMsg,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "CAPI network error";
    return { success: false, error: message };
  }
}

/**
 * Normalizes phone numbers to standard E.164 digits for WhatsApp Cloud API.
 */
export function cleanWhatsAppPhoneNumber(raw: string): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    if (digits.startsWith("07")) {
      digits = "44" + digits.slice(1);
    } else if (digits.startsWith("08") || digits.startsWith("09")) {
      digits = "234" + digits.slice(1);
    }
  } else if (digits.startsWith("0") && digits.length === 10) {
    digits = "234" + digits.slice(1);
  }
  return digits;
}

/**
 * Sends a WhatsApp message (text or interactive buttons) via Meta WhatsApp Business Cloud API.
 */
export async function sendWhatsAppMessage(params: WhatsAppSendMessageParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const config = getMetaConfig();
  const phoneId = config.whatsAppPhoneNumberId;
  const token = config.accessToken;

  if (!phoneId || !token) {
    return {
      success: false,
      error: "WhatsApp Phone Number ID or Meta System User Access Token is not configured.",
    };
  }

  const cleanTo = cleanWhatsAppPhoneNumber(params.to);
  if (!cleanTo || cleanTo.length < 7) {
    return {
      success: false,
      error: `Invalid destination phone number: "${params.to}"`,
    };
  }

  let requestBody: any;

  if (params.buttons && params.buttons.length > 0) {
    requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: params.body },
        action: {
          buttons: params.buttons.slice(0, 3).map((b) => ({
            type: "reply",
            reply: {
              id: b.id.slice(0, 256),
              title: b.title.slice(0, 20),
            },
          })),
        },
      },
    };
    if (params.headerText) {
      requestBody.interactive.header = {
        type: "text",
        text: params.headerText.slice(0, 60),
      };
    }
    if (params.footerText) {
      requestBody.interactive.footer = {
        text: params.footerText.slice(0, 60),
      };
    }
  } else {
    requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
      type: "text",
      text: {
        preview_url: false,
        body: params.body,
      },
    };
  }

  try {
    const res = await fetch(
      `${GRAPH_BASE_URL}/${config.graphVersion}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await res.json().catch(() => null);
    const db = provisioningClient();

    if (!res.ok || data?.error) {
      const errMsg =
        data?.error?.message ||
        `Meta WhatsApp API error: HTTP ${res.status}`;
      const is24hWindow =
        data?.error?.code === 131047 ||
        errMsg.toLowerCase().includes("24 hours");

      // Auto-fallback to approved template if 24-hour service window is closed
      if (is24hWindow) {
        let recipientName = "there";
        let instrumentName = "music";

        if (params.leadId) {
          const { data: leadRow } = await db
            .from("pw_leads")
            .select("payload")
            .eq("id", params.leadId)
            .maybeSingle();
          if (leadRow?.payload) {
            const p = leadRow.payload as any;
            recipientName = p.parentName?.split(" ")?.[0] || "there";
            instrumentName = p.instrument || "music";
          }
        }

        const templatePayload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanTo,
          type: "template",
          template: {
            name: "prosperwork_lead_intro",
            language: { code: "en_GB" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: recipientName },
                  { type: "text", text: instrumentName },
                ],
              },
            ],
          },
        };

        const tRes = await fetch(
          `${GRAPH_BASE_URL}/${config.graphVersion}/${phoneId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(templatePayload),
          }
        );

        const tData = await tRes.json().catch(() => null);
        if (tRes.ok && tData?.messages?.[0]?.id) {
          const tMsgId = tData.messages[0].id;
          await db.from("pw_whatsapp_messages").insert({
            wa_message_id: tMsgId,
            lead_id: params.leadId || null,
            phone_number: cleanTo,
            direction: "outbound",
            message_type: "template",
            body: `[Template: prosperwork_lead_intro sent] Hello ${recipientName}, thank you for contacting ProsperWork Music Academy regarding ${instrumentName} lessons...`,
            status: "sent",
            metadata: { requestBody: templatePayload, responseData: tData },
          });

          return { success: true, messageId: tMsgId };
        }
      }

      // Record failed outbound attempt
      await db.from("pw_whatsapp_messages").insert({
        lead_id: params.leadId || null,
        phone_number: cleanTo,
        direction: "outbound",
        message_type: params.buttons ? "interactive" : "text",
        body: params.body,
        status: "failed",
        error_message: errMsg,
        metadata: { requestBody, responseData: data },
      });

      return { success: false, error: errMsg };
    }

    const waMsgId = data?.messages?.[0]?.id || `out_${Date.now()}`;

    // Record successful outbound message
    await db.from("pw_whatsapp_messages").insert({
      wa_message_id: waMsgId,
      lead_id: params.leadId || null,
      phone_number: cleanTo,
      direction: "outbound",
      message_type: params.buttons ? "interactive" : "text",
      body: params.body,
      status: "sent",
      metadata: { requestBody, responseData: data },
    });

    // If attached to a lead that is still "new", advance to "contacted"
    if (params.leadId) {
      const { data: leadRow } = await db
        .from("pw_leads")
        .select("id, payload")
        .eq("id", params.leadId)
        .maybeSingle();

      if (leadRow?.payload) {
        const payload = leadRow.payload as any;
        if (payload.status === "new") {
          const nowIso = new Date().toISOString();
          const updatedPayload = {
            ...payload,
            status: "contacted",
            firstResponseAt: payload.firstResponseAt || nowIso,
          };
          await db
            .from("pw_leads")
            .update({
              payload: updatedPayload,
              updated_at: nowIso,
            })
            .eq("id", params.leadId);
        }
      }
    }

    return {
      success: true,
      messageId: waMsgId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "WhatsApp delivery network error";
    return { success: false, error: msg };
  }
}

/**
 * Handles incoming WhatsApp webhook events (inbound messages and delivery status updates).
 */
export async function ingestWhatsAppWebhook(payload: any): Promise<{
  processedMessages: number;
  processedStatuses: number;
}> {
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return { processedMessages: 0, processedStatuses: 0 };
  }

  const db = provisioningClient();
  let messageCount = 0;
  let statusCount = 0;

  for (const entry of payload.entry) {
    if (!Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (change.field !== "messages" || !change.value) continue;

      const val = change.value;

      // 1. Inbound messages
      if (Array.isArray(val.messages)) {
        const contacts = Array.isArray(val.contacts) ? val.contacts : [];
        const contactMap = new Map<string, string>();
        for (const c of contacts) {
          if (c.wa_id && c.profile?.name) {
            contactMap.set(c.wa_id, c.profile.name);
          }
        }

        for (const msg of val.messages) {
          const senderPhone = cleanWhatsAppPhoneNumber(msg.from || "");
          const waMsgId = msg.id;
          const senderName = contactMap.get(msg.from) || null;
          let body = "";
          let interactiveType: string | null = null;
          let selectedButtonId: string | null = null;

          if (msg.type === "text" && msg.text?.body) {
            body = msg.text.body;
          } else if (msg.type === "interactive") {
            interactiveType = msg.interactive?.type || "button_reply";
            if (msg.interactive?.button_reply) {
              selectedButtonId = msg.interactive.button_reply.id;
              body = msg.interactive.button_reply.title || selectedButtonId;
            } else if (msg.interactive?.list_reply) {
              selectedButtonId = msg.interactive.list_reply.id;
              body = msg.interactive.list_reply.title || selectedButtonId;
            }
          } else if (msg.type === "button" && msg.button?.text) {
            body = msg.button.text;
            selectedButtonId = msg.button.payload || null;
          } else {
            body = `[${msg.type} message]`;
          }

          // Match sender to an existing lead by last 9-10 digits of phone
          let matchedLeadId: string | null = null;
          let matchedLeadPayload: any = null;

          if (senderPhone.length >= 7) {
            const lastDigits = senderPhone.slice(-9);
            const { data: leads } = await db
              .from("pw_leads")
              .select("id, payload")
              .order("created_at", { ascending: false })
              .limit(100);

            if (leads) {
              for (const l of leads) {
                const p = l.payload as any;
                const leadPhone = (p?.phone || p?.customAnswers?.whatsapp_number || "").replace(/\D/g, "");
                if (leadPhone && leadPhone.includes(lastDigits)) {
                  matchedLeadId = l.id;
                  matchedLeadPayload = p;
                  break;
                }
              }
            }
          }

          // Ingest into pw_whatsapp_messages
          await db.from("pw_whatsapp_messages").upsert(
            {
              wa_message_id: waMsgId,
              lead_id: matchedLeadId,
              phone_number: senderPhone,
              direction: "inbound",
              sender_name: senderName,
              message_type: msg.type || "text",
              body,
              interactive_type: interactiveType,
              selected_button_id: selectedButtonId,
              status: "received",
              metadata: msg,
            },
            { onConflict: "wa_message_id" }
          );

          messageCount++;

          // Automated Assistant: Check if parent wants to book a trial
          const lowerBody = body.toLowerCase();
          const isBookingTrigger =
            selectedButtonId === "pw_book_trial" ||
            lowerBody.includes("book trial") ||
            lowerBody.includes("trial lesson") ||
            lowerBody.includes("yes, i want a trial") ||
            lowerBody.includes("schedule trial");

          if (isBookingTrigger && matchedLeadId && matchedLeadPayload) {
            // Automatically advance lead stage to "trial_booked"
            const nowIso = new Date().toISOString();
            const updated = {
              ...matchedLeadPayload,
              status: "trial_booked",
              preferredSlots: matchedLeadPayload.preferredSlots?.length
                ? matchedLeadPayload.preferredSlots
                : ["WhatsApp Instant Booking Request"],
            };

            await db
              .from("pw_leads")
              .update({
                payload: updated,
                updated_at: nowIso,
              })
              .eq("id", matchedLeadId);

            // Send CAPI event for trial booking
            await sendMetaConversionEvent({
              eventName: "Schedule",
              leadId: matchedLeadId,
              metaLeadId: matchedLeadPayload.metaLeadId,
              email: matchedLeadPayload.email,
              phone: matchedLeadPayload.phone || senderPhone,
              status: "trial_booked",
            }).catch(() => null);

            // Send auto-acknowledgement reply
            await sendWhatsAppMessage({
              to: senderPhone,
              leadId: matchedLeadId,
              body: `Hello ${matchedLeadPayload.parentName || senderName || "there"}! 🎹 We have received your trial booking request for ${matchedLeadPayload.instrument || "lessons"}. An academy director is assigning the best teacher for you and will confirm your lesson time shortly!`,
            }).catch(() => null);
          } else {
            // Automated Instant Welcome & Assessment Reply
            const allowForce = Boolean(matchedLeadPayload?.force_next_welcome_reply);

            // Check if the automated welcome message itself was sent to this customer in the past 6 hours
            const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
            const { data: recentWelcome } = await db
              .from("pw_whatsapp_messages")
              .select("id")
              .eq("phone_number", senderPhone)
              .eq("direction", "outbound")
              .ilike("body", "%Welcome to ProsperWork Music Academy%")
              .gte("created_at", sixHoursAgo)
              .limit(1);

            const shouldSendWelcome = allowForce || !recentWelcome || recentWelcome.length === 0;

            if (shouldSendWelcome) {
              let rawName = matchedLeadPayload?.parentName || senderName || "there";
              if (rawName.includes("<test") || rawName.toLowerCase().includes("dummy")) {
                rawName = "there";
              }
              const cleanFirstName = rawName.trim().split(" ")[0] || "there";

              const welcomeMessage = `Hello ${cleanFirstName}! Welcome to ProsperWork Music Academy 🎵\n\nWe received your application and are so excited to help your child start a fun, confidence-building musical journey!\n\nTo match your child with the perfect expert teacher: What is your child's name, how old are they, and which musical instrument would they like to learn?`;

              await sendWhatsAppMessage({
                to: senderPhone,
                leadId: matchedLeadId || undefined,
                body: welcomeMessage,
              }).catch(() => null);

              // Disarm force flag on lead if it was active
              if (matchedLeadId && allowForce) {
                const updated = {
                  ...matchedLeadPayload,
                  force_next_welcome_reply: false,
                };
                await db
                  .from("pw_leads")
                  .update({ payload: updated, updated_at: new Date().toISOString() })
                  .eq("id", matchedLeadId);
              }
            } else {
              // Customer sent a follow-up reply! Run Strict Admissions Intake AI workflow
              const { data: pastMsgs } = await db
                .from("pw_whatsapp_messages")
                .select("direction, body")
                .eq("phone_number", senderPhone)
                .order("created_at", { ascending: false })
                .limit(6);

              const history = (pastMsgs || [])
                .reverse()
                .map((m: any) => ({
                  role: (m.direction === "outbound" ? "assistant" : "user") as "assistant" | "user",
                  content: m.body || "",
                }));

              const aiResult = await generateSmartWhatsAppAIReply({
                parentName: matchedLeadPayload?.parentName || senderName || undefined,
                senderPhone,
                incomingMessage: body,
                knownStudentName: matchedLeadPayload?.childName || matchedLeadPayload?.customAnswers?.student_name,
                knownAge: matchedLeadPayload?.customAnswers?.student_age,
                knownInstrument: matchedLeadPayload?.instrument,
                leadStage: matchedLeadPayload?.status,
                intakeComplete: Boolean(matchedLeadPayload?.intake_complete),
                history,
              });

              if (aiResult?.replyText) {
                let shouldUpdateLead = false;

                if (matchedLeadId && matchedLeadPayload) {
                  if (aiResult.studentName && aiResult.studentName !== matchedLeadPayload.childName) {
                    matchedLeadPayload.childName = aiResult.studentName;
                    shouldUpdateLead = true;
                  }

                  if (aiResult.detectedInstrument && aiResult.detectedInstrument !== matchedLeadPayload.instrument) {
                    matchedLeadPayload.instrument = aiResult.detectedInstrument;
                    shouldUpdateLead = true;
                  }

                  if (aiResult.studentAge || aiResult.studentName || aiResult.detectedInstrument) {
                    matchedLeadPayload.customAnswers = {
                      ...(matchedLeadPayload.customAnswers || {}),
                      ...(aiResult.studentAge ? { student_age: String(aiResult.studentAge) } : {}),
                      ...(aiResult.studentName ? { student_name: String(aiResult.studentName) } : {}),
                      ...(aiResult.detectedInstrument ? { instrument: String(aiResult.detectedInstrument) } : {}),
                    };
                    shouldUpdateLead = true;
                  }

                  if (aiResult.isComplete && !matchedLeadPayload.intake_complete) {
                    matchedLeadPayload.intake_complete = true;
                    if (matchedLeadPayload.status === "new") {
                      matchedLeadPayload.status = "contacted";
                    }
                    matchedLeadPayload.notes = [
                      matchedLeadPayload.notes,
                      `[Intake Completed] Student: ${aiResult.studentName || matchedLeadPayload.childName || "N/A"}, Age: ${aiResult.studentAge || "N/A"}, Instrument: ${aiResult.detectedInstrument || matchedLeadPayload.instrument || "N/A"}`
                    ].filter(Boolean).join(" | ");
                    shouldUpdateLead = true;
                  }

                  if (shouldUpdateLead) {
                    await db
                      .from("pw_leads")
                      .update({
                        payload: matchedLeadPayload,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", matchedLeadId);
                  }
                }

                // Send the AI intake reply
                await sendWhatsAppMessage({
                  to: senderPhone,
                  leadId: matchedLeadId || undefined,
                  body: aiResult.replyText,
                }).catch(() => null);
              }
            }
          }
        }
      }

      // 2. Outbound delivery status updates
      if (Array.isArray(val.statuses)) {
        for (const st of val.statuses) {
          if (st.id && st.status) {
            await db
              .from("pw_whatsapp_messages")
              .update({ status: st.status })
              .eq("wa_message_id", st.id);
            statusCount++;
          }
        }
      }
    }
  }

  return {
    processedMessages: messageCount,
    processedStatuses: statusCount,
  };
}

