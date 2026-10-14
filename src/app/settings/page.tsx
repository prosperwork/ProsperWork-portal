"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link2, Mail, RefreshCw, Save, ShieldCheck, Check, AlertTriangle } from "lucide-react";
import FinanceSettings from "./FinanceSettings";

type Settings = {
  standardMinutes: number;
  trialMinutes: number;
  coverMinutes: number;
  rescheduleNoticeHours: number;
  adminConcurrentClasses: number;
  joinBeforeHours: number;
  joinAfterHours: number;
  payrollWeekAnchor: "not_configured" | "calendar_month" | "pay_cycle";
  advanceEligibility: "not_configured" | "owner_selected" | "previous_period_verified" | "disabled";
  vacationAutoApprove: boolean;
  adminParentQuota: number;
};
type SettingsResponse = {
  profile: { role: string; name: string };
  settings: Settings;
  revision: number;
  integrations: { livekitConfigured: boolean; smtpConfigured: boolean };
};
type EmailMessage = { id: string; category: string; status: string; subject: string; created_at: string; sent_at: string | null; attempts: number };
type SmtpTest = { status: "queued" | "sending" | "sent" | "failed" | "cancelled"; created_at: string; sent_at: string | null };
type NumberKey = "standardMinutes" | "trialMinutes" | "coverMinutes" | "rescheduleNoticeHours" | "adminConcurrentClasses" | "joinBeforeHours" | "joinAfterHours" | "adminParentQuota";

const numericFields: { key: NumberKey; title: string; detail: string; min: number; max: number; suffix: string }[] = [
  { key: "standardMinutes", title: "Standard lesson", detail: "Normally one hour; 45–60 minutes. Staff schedule individual agreed extensions separately.", min: 45, max: 60, suffix: "min" },
  { key: "trialMinutes", title: "Trial lesson", detail: "Normal trial length: 45–60 minutes.", min: 45, max: 60, suffix: "min" },
  { key: "coverMinutes", title: "Cover lesson", detail: "Normal cover length: 45–60 minutes.", min: 45, max: 60, suffix: "min" },
  { key: "rescheduleNoticeHours", title: "Reschedule notice", detail: "Minimum notice families should give; at least two hours.", min: 2, max: 72, suffix: "hrs" },
  { key: "adminConcurrentClasses", title: "Admin concurrent classes", detail: "The document allows two or three simultaneous classes.", min: 2, max: 3, suffix: "classes" },
  { key: "joinBeforeHours", title: "Early room access", detail: "How early the lesson room may open.", min: 0, max: 2, suffix: "hrs" },
  { key: "joinAfterHours", title: "Room close buffer", detail: "How long the room remains available after start.", min: 5, max: 6, suffix: "hrs" },
  { key: "adminParentQuota", title: "Parent count before PAY bonus", detail: "Threshold for the admin PAY bonus; it never caps or blocks parent access.", min: 0, max: 1000, suffix: "parents" },
];

const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
async function readJson(response: Response) { return response.json().catch(() => ({})); }

export default function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [smtpTest, setSmtpTest] = useState<SmtpTest | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const [messageError, setMessageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);

  const load = useCallback(async (): Promise<boolean> => {
    setLoading(true); setError(""); setNotice(""); setDenied(false);
    try {
      const response = await fetch("/api/settings", { credentials: "include", cache: "no-store" });
      const result = await readJson(response);
      if (response.status === 401) { window.location.assign("/login"); return false; }
      if (!response.ok) {
        if (response.status === 403) setDenied(true);
        throw new Error(result.error || (response.status === 403 ? "Settings are restricted to the academy owner." : "Settings could not be loaded."));
      }
      setData(result as SettingsResponse); setDraft(result.settings as Settings);
      if (result.profile?.role !== "super_admin") setDenied(true);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Settings could not be loaded."); return false; }
    finally { setLoading(false); }
  }, []);

  const loadEmail = useCallback(async () => {
    setEmailLoading(true); setMessageError("");
    try {
      const response = await fetch("/api/email", { credentials: "include", cache: "no-store" });
      const result = await readJson(response);
      if (!response.ok) throw new Error(result.error || "Delivery log is unavailable.");
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      setSmtpTest(result.smtpTest ?? null);
    } catch (cause) { setMessageError(cause instanceof Error ? cause.message : "Delivery log is unavailable."); setSmtpTest(null); }
    finally { setEmailLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (data?.profile.role === "super_admin") void loadEmail(); }, [data, loadEmail]);
  const owner = data?.profile.role === "super_admin";
  const changed = !!data && !!draft && JSON.stringify(data.settings) !== JSON.stringify(draft);
  const smtpStatus = !data?.integrations.smtpConfigured
    ? { detail: "SMTP credentials are not configured.", badge: "Not configured" }
    : emailLoading
      ? { detail: "Checking the saved SMTP test status…", badge: "Checking" }
      : messageError
        ? { detail: "The saved SMTP test status could not be loaded.", badge: "Unavailable" }
        : !smtpTest
          ? { detail: "No SMTP test has been recorded.", badge: "Not tested" }
          : smtpTest.status === "sent"
            ? { detail: `The SMTP server accepted the latest test email on ${dateLabel(smtpTest.sent_at ?? smtpTest.created_at)}.`, badge: "Accepted" }
            : smtpTest.status === "failed"
              ? { detail: "The latest recorded SMTP test failed.", badge: "Failed" }
              : smtpTest.status === "cancelled"
                ? { detail: "The latest recorded SMTP test was cancelled.", badge: "Cancelled" }
                : { detail: `The latest SMTP test is ${smtpTest.status}.`, badge: label(smtpTest.status) };

  function setNumber(key: NumberKey, value: string) {
    setDraft(current => current ? { ...current, [key]: value === "" ? 0 : Number(value) } : current);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !draft || !owner || !event.currentTarget.reportValidity()) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/settings", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: data.revision, settings: draft }) });
      const result = await readJson(response);
      if (response.status === 409) { await load(); setError(result.error || "These settings changed elsewhere. The latest saved values have been reloaded."); return; }
      if (!response.ok || result.ok !== true) throw new Error(result.error || "The save was not confirmed.");
      const refreshed = await load();
      if (!refreshed) {
        setNotice("");
        setError("The save was accepted, but the latest saved values could not be confirmed. Reload settings to verify.");
        return;
      }
      setNotice("Academy rules saved and reloaded. Lesson length applies to new lessons; notice, capacity and room-window rules apply immediately.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Settings could not be saved."); }
    finally { setSaving(false); }
  }
  async function verifyEmail() {
    setTesting(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/email/test", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await readJson(response);
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Verification could not be confirmed.");
      setNotice("Verification email accepted for delivery to your verified owner address.");
      await loadEmail();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Verification email could not be sent."); await loadEmail(); }
    finally { setTesting(false); }
  }

  return <main className="pw-settings">
    <div className="ps-content">
      <div className="ps-intro">
        <h1>Settings</h1>
        {data && <div className={`ps-revision ${changed ? "unsaved" : ""}`} role="status">{changed ? `Unsaved · revision ${data.revision}` : `Saved revision ${data.revision}`}</div>}
      </div>
      {error && <div className={`ps-alert ${denied ? "denied" : ""}`} role="alert"><AlertTriangle size={18} /><div><strong>{denied ? "Owner access required" : "Action needs attention"}</strong><p>{error}</p></div>{!denied && <button type="button" onClick={() => void load()} disabled={loading}>Reload settings</button>}</div>}
      {notice && <div className="ps-alert success" role="status"><Check size={18} /><div><strong>Confirmed</strong><p>{notice}</p></div></div>}
      {loading && !data && <div className="ps-loading" aria-label="Loading academy settings" aria-busy="true"><div className="ps-skeleton wide" /><div className="ps-skeleton" /><div className="ps-skeleton" /><div className="ps-skeleton" /></div>}
      {denied && !loading && <section className="ps-denied"><span><ShieldCheck size={24} /></span><h2>These controls are private</h2><p>Only the academy owner can view or change governance settings. Your existing access to the workspace is unchanged.</p><a href="/">Return to workspace</a></section>}
      {!denied && data && draft && <>
        <form onSubmit={save}>
          <div className="ps-layout" data-portal-layout="academy-settings">
            <div className="ps-stack">
              <section className="ps-card ps-setting-group" aria-labelledby="lesson-rules"><header className="ps-card-head"><div><h2 id="lesson-rules">Lesson rules</h2></div></header>
                <div className="ps-fields">{numericFields.slice(0, 7).map(field => <label className="ps-number" key={field.key}><span className="ps-number-copy"><strong>{field.title}</strong><small>{field.detail}</small></span><span className="ps-number-input"><input type="number" min={field.min} max={field.max} step="1" required value={draft[field.key]} onChange={event => setNumber(field.key, event.target.value)} aria-label={field.title} /><small>{field.suffix}</small></span></label>)}</div>
                <div className="ps-note"><span><strong>Student room window</strong> Current rule allows access up to {draft.joinBeforeHours} hour{draft.joinBeforeHours === 1 ? "" : "s"} before class and keeps the room open for {draft.joinAfterHours} hours after its start.</span></div>
              </section>
              <section className="ps-card ps-setting-group" aria-labelledby="staffing-rules"><header className="ps-card-head"><div><h2 id="staffing-rules">Staffing &amp; family access</h2></div></header>
                <label className="ps-number ps-quota"><span className="ps-number-copy"><strong>{numericFields[7].title}</strong><small>{numericFields[7].detail}</small></span><span className="ps-number-input"><input type="number" min={0} max={1000} step="1" required value={draft.adminParentQuota} onChange={event => setNumber("adminParentQuota", event.target.value)} aria-label="Admin parent quota" /><small>parents</small></span></label>
                <div className="ps-rule-row"><span><strong>Vacation payroll delegation</strong><small>When enabled, Finance submissions are automatically approved under your recorded authorization. Disable it to require your review of every batch.</small></span><label className="ps-switch"><input type="checkbox" checked={draft.vacationAutoApprove} onChange={event => setDraft(current => current ? { ...current, vacationAutoApprove: event.target.checked } : current)} /><span aria-hidden="true" /><b>{draft.vacationAutoApprove ? "On" : "Off"}</b></label></div>
              </section>
               <div className="ps-form-actions"><button className="ps-primary" type="submit" disabled={saving || !changed}>{saving ? <><RefreshCw size={15} className="ps-spin" />Saving…</> : <><Save size={15} />Save changes</>}</button></div>
            </div>
            <aside className="ps-stack">
              <section className="ps-card ps-setting-group" aria-labelledby="payroll-heading"><header className="ps-card-head"><div><h2 id="payroll-heading">Payroll foundations</h2></div></header>
                <label className="ps-select-field"><span>Week anchor</span><select value={draft.payrollWeekAnchor} onChange={event => setDraft(current => current ? { ...current, payrollWeekAnchor: event.target.value as Settings["payrollWeekAnchor"] } : current)}><option value="not_configured">Not configured</option><option value="calendar_month">Calendar month</option><option value="pay_cycle">Pay cycle</option></select></label>
                <label className="ps-select-field"><span>Advance eligibility</span><select value={draft.advanceEligibility} onChange={event => setDraft(current => current ? { ...current, advanceEligibility: event.target.value as Settings["advanceEligibility"] } : current)}><option value="not_configured">Not configured</option><option value="owner_selected">Owner selected</option><option value="previous_period_verified">Previous period verified</option><option value="disabled">Disabled</option></select></label>
                <div className="ps-caveat"><strong>Verified-attendance payroll</strong><span>These rules now drive salary calculations. Staff rates require your approval, and Finance must confirm exact course starts and weekly frequency. <a href="/payroll">Open payroll</a></span></div>
              </section>
              <section className="ps-card ps-integrations" aria-labelledby="connections-heading"><header className="ps-card-head"><div><h2 id="connections-heading">Connected services</h2><p>Configuration status only; no live test.</p></div><Link2 size={18} className="ps-muted-icon" /></header>
                <div className="ps-service"><span className="ps-service-icon"><span className={`ps-status-dot ${data.integrations.livekitConfigured ? "configured" : ""}`} /></span><span><strong>Live lesson rooms</strong><small>{data.integrations.livekitConfigured ? "Credentials configured" : "Not configured"}</small></span><em>{data.integrations.livekitConfigured ? "Configured" : "Unavailable"}</em></div>
                <div className="ps-service"><span className="ps-service-icon"><Mail size={17} /></span><span><strong>Email delivery</strong><small>{smtpStatus.detail}</small></span><em>{smtpStatus.badge}</em></div>
                <div className="ps-service-foot">No credentials are displayed or entered in this workspace.</div>
              </section>
            </aside>
          </div>
        </form>
        <section className="ps-card ps-mail-card" aria-labelledby="mail-heading"><header className="ps-card-head"><div><h2 id="mail-heading">Owner email verification</h2><p>Send to the signed-in owner’s verified address.</p></div><button className="ps-outline" type="button" onClick={() => void verifyEmail()} disabled={testing || !data.integrations.smtpConfigured}>{testing ? <><RefreshCw size={14} className="ps-spin" />Sending…</> : <><Mail size={14} />Send verification</>}</button></header>
          <div className="ps-log-head"><strong>Recent delivery log</strong><button type="button" className="ps-text-button" onClick={() => void loadEmail()}><RefreshCw size={13} />Refresh log</button></div>
          {messageError ? <div className="ps-log-state error" role="alert">{messageError}</div> : messages.length === 0 ? <div className="ps-log-state">No delivery records are available yet.</div> : <div className="ps-table-wrap"><table><thead><tr><th>Message</th><th>Category</th><th>Status</th><th>Created</th><th>Sent</th><th>Attempts</th></tr></thead><tbody>{messages.map(item => <tr key={item.id}><td>{item.subject || "Email message"}</td><td>{label(item.category)}</td><td><span className={`ps-status-pill ${item.status === "sent" ? "sent" : ""}`}>{label(item.status)}</span></td><td>{dateLabel(item.created_at)}</td><td>{item.sent_at ? dateLabel(item.sent_at) : "—"}</td><td>{item.attempts}</td></tr>)}</tbody></table></div>}
        </section>
      </>}
      {data&&<FinanceSettings role={data.profile.role}/>}
      <footer className="ps-footer"><span>ProsperWork · Music Concepts</span><span>Private academy operations</span></footer>
    </div>
  </main>;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
}
