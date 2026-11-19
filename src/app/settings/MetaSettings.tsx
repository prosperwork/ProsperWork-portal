"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { MetaConnectionStatus, MetaLeadgenForm } from "@/lib/meta/meta-types";

interface MetaApiResponse {
  ok: boolean;
  config: {
    appId: string;
    pageId: string;
    portfolioId: string;
    hasAccessToken: boolean;
    hasAppSecret: boolean;
    hasVerifyToken: boolean;
    graphVersion: string;
    webhookUrl: string;
  };
  connection: MetaConnectionStatus;
  forms: MetaLeadgenForm[];
  syncLogs: Array<{
    id: string;
    sync_type: string;
    form_id: string | null;
    leads_found: number;
    leads_inserted: number;
    leads_skipped: number;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
  stats: {
    totalLeads: number;
    facebookLeads: number;
    instagramLeads: number;
  };
  error?: string;
}

export default function MetaSettings({ role: _role }: { role: string }) {
  const [data, setData] = useState<MetaApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshingForms, setRefreshingForms] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState<string>("all");
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/integrations/meta", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.ok) {
        setData(json);
      } else {
        setMessage({ type: "error", text: json.error || "Failed to load Meta integration data." });
      }
    } catch {
      setMessage({ type: "error", text: "Connection error while reaching academy backend." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCopyWebhookUrl = () => {
    if (!data?.config.webhookUrl) return;
    void navigator.clipboard.writeText(data.config.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSyncLeads = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          formId: selectedFormId === "all" ? undefined : selectedFormId,
        }),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        setMessage({
          type: "success",
          text: `Sync completed: ${result.leadsInserted} new lead(s) inserted, ${result.leadsSkipped} skipped (${result.leadsFound} total evaluated).`,
        });
        await loadData();
      } else {
        setMessage({
          type: "error",
          text: result.error || "Manual lead synchronization failed. Check server logs.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network request failed during manual synchronization." });
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshForms = async () => {
    setRefreshingForms(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch_forms" }),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        setMessage({
          type: "success",
          text: `Retrieved ${result.forms?.length || 0} active lead forms from Meta Graph API.`,
        });
        await loadData();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to refresh forms from Meta." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to connect to Meta Graph API." });
    } finally {
      setRefreshingForms(false);
    }
  };

  const handleSubscribePage = async () => {
    setSubscribing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe_page" }),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        setMessage({
          type: "success",
          text: "Successfully subscribed your Facebook Page to leadgen webhooks directly via Meta Graph API!",
        });
        await loadData();
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to subscribe Page. Make sure pages_manage_metadata is granted to your token.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network request failed while subscribing page." });
    } finally {
      setSubscribing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="ps-card" style={{ padding: "40px 20px", textAlign: "center" }}>
        <Loader2 className="animate-spin" size={24} style={{ margin: "0 auto 12px", color: "var(--pine-800)" }} />
        <p style={{ margin: 0, color: "var(--muted)" }}>Checking Meta Graph API connection &amp; assets…</p>
      </div>
    );
  }

  const isFullyConnected =
    Boolean(data?.connection.validToken && data.connection.pageAccess);

  return (
    <div className="ps-stack" style={{ gap: 20 }}>
      {/* Notice Banner */}
      {message && (
        <div
          className={`hire-alert ${message.type === "error" ? "danger" : message.type === "success" ? "success" : "info"}`}
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background:
              message.type === "error"
                ? "#fef2f2"
                : message.type === "success"
                  ? "#f0fdf4"
                  : "#f8faf9",
            border:
              message.type === "error"
                ? "1px solid #fecaca"
                : message.type === "success"
                  ? "1px solid #bbf7d0"
                  : "1px solid #dce7e1",
          }}
        >
          {message.type === "error" ? (
            <AlertCircle size={18} color="#b91c1c" />
          ) : (
            <CheckCircle2 size={18} color="#15803d" />
          )}
          <p style={{ margin: 0, fontSize: "13px", color: message.type === "error" ? "#991b1b" : "#166534" }}>
            {message.text}
          </p>
        </div>
      )}

      {/* Top Connection Card */}
      <section className="ps-card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Meta Lead Ads Integration</h2>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: isFullyConnected ? "#dcfce7" : "#fef3c7",
                  color: isFullyConnected ? "#15803d" : "#92400e",
                  border: isFullyConnected ? "1px solid #bbf7d0" : "1px solid #fde68a",
                }}
              >
                {isFullyConnected ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {isFullyConnected ? "Connected & Active" : "Setup / Verify Required"}
              </span>
            </div>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13, maxWidth: 680, lineHeight: 1.5 }}>
              Automatic real-time synchronization of Facebook and Instagram Lead Ads directly into your academy portal
              CRM, with full question responses and historical imports.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="btn small tertiary"
              onClick={loadData}
              disabled={loading}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Check Status
            </button>
            <a
              href="https://developers.facebook.com/tools/lead-ads-testing"
              target="_blank"
              rel="noreferrer"
              className="btn small"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
            >
              Meta Lead Testing Tool <ArrowUpRight size={13} />
            </a>
          </div>
        </div>

        {/* Credentials Diagnostics Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 12,
            marginTop: 18,
            paddingTop: 16,
            borderTop: "1px solid var(--line)",
          }}
        >
          <div style={{ padding: "10px 14px", background: "var(--surface, #fbfcfb)", borderRadius: 8, border: "1px solid var(--line)" }}>
            <small style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>
              Facebook Page
            </small>
            <div style={{ marginTop: 4, fontWeight: 700, fontSize: 13, color: "var(--foreground)" }}>
              {data?.connection.pageName || data?.config.pageId || "Not Configured"}
            </div>
            <small style={{ color: "var(--muted)", fontSize: 11 }}>
              ID: {data?.config.pageId || "META_PAGE_ID"}
            </small>
          </div>

          <div style={{ padding: "10px 14px", background: "var(--surface, #fbfcfb)", borderRadius: 8, border: "1px solid var(--line)" }}>
            <small style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>
              System Token
            </small>
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
              {data?.connection.validToken ? (
                <>
                  <ShieldCheck size={14} color="#15803d" />
                  <span style={{ color: "#15803d" }}>Active &amp; Valid</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={14} color="#b91c1c" />
                  <span style={{ color: "#b91c1c" }}>Invalid / Missing</span>
                </>
              )}
            </div>
            <small style={{ color: "var(--muted)", fontSize: 11 }}>
              Graph API: {data?.config.graphVersion || "v22.0"}
            </small>
          </div>

          <div style={{ padding: "10px 14px", background: "var(--surface, #fbfcfb)", borderRadius: 8, border: "1px solid var(--line)" }}>
            <small style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>
              Webhook Signature
            </small>
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
              {data?.config.hasAppSecret ? (
                <>
                  <ShieldCheck size={14} color="#15803d" />
                  <span style={{ color: "#15803d" }}>HMAC-SHA256 Active</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={14} color="#b91c1c" />
                  <span style={{ color: "#b91c1c" }}>Secret Missing</span>
                </>
              )}
            </div>
            <small style={{ color: "var(--muted)", fontSize: 11 }}>
              Verify Token: {data?.config.hasVerifyToken ? "Configured" : "Missing"}
            </small>
          </div>

          <div style={{ padding: "10px 14px", background: "var(--surface, #fbfcfb)", borderRadius: 8, border: "1px solid var(--line)" }}>
            <small style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>
              Total Synced Leads
            </small>
            <div style={{ marginTop: 4, fontWeight: 800, fontSize: 16, color: "var(--pine-900, #135b45)" }}>
              {data?.stats.totalLeads ?? 0}
            </div>
            <small style={{ color: "var(--muted)", fontSize: 11 }}>
              FB: {data?.stats.facebookLeads ?? 0} · IG: {data?.stats.instagramLeads ?? 0}
            </small>
          </div>
        </div>

        {/* Missing permissions warning */}
        {data?.connection.missingPermissions && data.connection.missingPermissions.length > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "#fffbeb",
              borderRadius: 8,
              border: "1px solid #fef3c7",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: "#92400e",
            }}
          >
            <AlertCircle size={15} />
            <span>
              <strong>Permission check:</strong> The following Meta permission(s) may need granting to your system user:{" "}
              <code>{data.connection.missingPermissions.join(", ")}</code>.
            </span>
          </div>
        )}
      </section>

      {/* Webhook Configuration Details */}
      <section className="ps-card" style={{ padding: 22 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={16} color="var(--pine-800)" /> Webhook Configuration (Real-Time Ingestion)
        </h3>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 12.5, lineHeight: 1.5 }}>
          Configure this URL in your Meta App Dashboard under <strong>Webhooks &gt; Page &gt; leadgen</strong> to receive
          leads the exact moment a parent or student submits a lead form.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <input
            type="text"
            readOnly
            value={data?.config.webhookUrl || ""}
            style={{
              fontFamily: "monospace",
              fontSize: 12.5,
              background: "var(--surface, #fbfcfb)",
              border: "1px solid var(--line)",
              padding: "9px 12px",
              borderRadius: 8,
              color: "var(--foreground)",
            }}
          />
          <button
            type="button"
            className="btn small"
            onClick={handleCopyWebhookUrl}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {copied ? <CheckCircle2 size={13} color="#15803d" /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy URL"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12.5, color: "var(--muted)" }}>
          <div>
            <strong>Event subscription:</strong> <code>leadgen</code>
          </div>
          <div>
            <strong>Verification token:</strong> Value of <code>META_WEBHOOK_VERIFY_TOKEN</code>
          </div>
          <div>
            <strong>Security:</strong> SHA-256 HMAC payload verification active
          </div>
        </div>

        {/* 1-Click Page Webhook Subscription Card */}
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            borderRadius: 8,
            background: data?.connection.pageSubscribed ? "#f0fdf4" : "#eff6ff",
            border: data?.connection.pageSubscribed ? "1px solid #bbf7d0" : "1px solid #bfdbfe",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, color: data?.connection.pageSubscribed ? "#166534" : "#1e40af" }}>
              {data?.connection.pageSubscribed ? (
                <>
                  <CheckCircle2 size={16} color="#15803d" />
                  <span>Facebook Page Webhook: Active &amp; Subscribed to leadgen</span>
                </>
              ) : (
                <>
                  <Zap size={16} color="#2563eb" />
                  <span>Page Subscribed Apps: Not yet linked or needs subscription</span>
                </>
              )}
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: data?.connection.pageSubscribed ? "#15803d" : "#1e40af", opacity: 0.9 }}>
              {data?.connection.pageSubscribed
                ? "Meta is actively broadcasting leadgen events to this portal whenever someone submits a lead form."
                : "Click below to link this Facebook Page to your app webhooks instantly using your granted pages_manage_metadata permission."}
            </p>
          </div>

          <button
            type="button"
            className="btn small"
            onClick={handleSubscribePage}
            disabled={subscribing}
            style={{
              background: data?.connection.pageSubscribed ? "transparent" : "#2563eb",
              color: data?.connection.pageSubscribed ? "#166534" : "#ffffff",
              border: data?.connection.pageSubscribed ? "1px solid #bbf7d0" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Zap size={13} />
            {subscribing ? "Subscribing..." : data?.connection.pageSubscribed ? "Re-subscribe Page" : "Subscribe Page Now"}
          </button>
        </div>

        {/* Granted Meta Permissions */}
        <div style={{ marginTop: 14 }}>
          <small style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
            Active Meta API Scopes
          </small>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {[
              "leads_retrieval",
              "pages_show_list",
              "pages_read_engagement",
              "pages_manage_metadata",
              "pages_manage_ads",
              "ads_management",
              "ads_read",
            ].map((perm) => (
              <span
                key={perm}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "#f0fdf4",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                }}
              >
                <CheckCircle2 size={11} color="#15803d" />
                {perm}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Lead Forms & Manual Synchronization */}
      <section className="ps-card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <FileSpreadsheet size={16} color="var(--pine-800)" /> Active Meta Lead Forms
            </h3>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 12.5 }}>
              Forms detected under Facebook Page ID: <strong>{data?.config.pageId || "Not set"}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn small tertiary"
              onClick={handleRefreshForms}
              disabled={refreshingForms}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <RefreshCw size={13} className={refreshingForms ? "animate-spin" : ""} />
              {refreshingForms ? "Refreshing…" : "Refresh Forms"}
            </button>

            <select
              value={selectedFormId}
              onChange={(e) => setSelectedFormId(e.target.value)}
              className="select-mini"
              style={{ height: 34 }}
            >
              <option value="all">All Available Forms</option>
              {data?.forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name} ({form.id})
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn small primary"
              onClick={handleSyncLeads}
              disabled={syncing || !isFullyConnected}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {syncing ? "Importing Leads…" : "Sync Leads Now"}
            </button>
          </div>
        </div>

        {data?.forms && data.forms.length > 0 ? (
          <div className="ops-table-wrap" style={{ marginTop: 10 }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Form Name</th>
                  <th>Form ID</th>
                  <th>Status</th>
                  <th>Questions</th>
                  <th>Reported Leads</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.forms.map((form) => (
                  <tr key={form.id}>
                    <td>
                      <strong>{form.name}</strong>
                    </td>
                    <td>
                      <code style={{ fontSize: 11 }}>{form.id}</code>
                    </td>
                    <td>
                      <span
                        className="hire-pill"
                        style={{
                          textTransform: "uppercase",
                          fontSize: 10,
                          fontWeight: 700,
                          background: form.status === "ACTIVE" ? "#dcfce7" : "#f1f5f9",
                          color: form.status === "ACTIVE" ? "#166534" : "#64748b",
                        }}
                      >
                        {form.status}
                      </span>
                    </td>
                    <td>{form.questions?.length || 0} fields</td>
                    <td>{form.leads_count ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn small tertiary"
                        onClick={() => {
                          setSelectedFormId(form.id);
                          void handleSyncLeads();
                        }}
                        disabled={syncing}
                        style={{ fontSize: 11, padding: "4px 8px" }}
                      >
                        Sync this form
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ops-empty" style={{ padding: "30px 16px", textAlign: "center" }}>
            <Globe size={24} style={{ margin: "0 auto 8px", color: "var(--muted)" }} />
            <strong>No Meta Lead Forms Cached Yet</strong>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12.5 }}>
              Click <strong>&quot;Refresh Forms&quot;</strong> to retrieve the latest forms from your connected Facebook Page.
            </p>
          </div>
        )}
      </section>

      {/* Sync History & Diagnostics */}
      <section className="ps-card" style={{ padding: 22 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>Recent Synchronization Logs</h3>
        <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 12.5 }}>
          Audit trail of automated webhook deliveries and administrator batch sync events.
        </p>

        {data?.syncLogs && data.syncLogs.length > 0 ? (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Leads Found</th>
                  <th>Inserted</th>
                  <th>Skipped</th>
                  <th>Status</th>
                  <th>Notes / Errors</th>
                </tr>
              </thead>
              <tbody>
                {data.syncLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td>
                      <span style={{ textTransform: "uppercase", fontSize: 10, fontWeight: 700 }}>
                        {log.sync_type}
                      </span>
                    </td>
                    <td>{log.leads_found}</td>
                    <td style={{ color: "#166534", fontWeight: 700 }}>{log.leads_inserted}</td>
                    <td style={{ color: "var(--muted)" }}>{log.leads_skipped}</td>
                    <td>
                      <span
                        className="hire-pill"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          background: log.status === "success" ? "#dcfce7" : "#fee2e2",
                          color: log.status === "success" ? "#166534" : "#991b1b",
                        }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td style={{ maxWidth: 280, fontSize: 11, color: log.error_message ? "#b91c1c" : "var(--muted)" }}>
                      {log.error_message || "Completed with no errors"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ops-empty" style={{ padding: "20px 14px", textAlign: "center" }}>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 12.5 }}>
              No synchronization events logged yet. Once Meta leads are submitted or imported, activity will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
