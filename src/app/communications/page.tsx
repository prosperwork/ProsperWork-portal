"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, Mail, RefreshCw, Send, Users, X } from "lucide-react";
import ProfileAvatar from "@/app/_components/ProfileAvatar";

type Profile = { id: string; name?: string; role: string };
type Contact = { id: string; leadId: string | null; guardianId: string | null; email: string; consent: boolean; eligible: boolean; evidence: string | null; changedAt: string | null };
type Lead = { id: string; name: string; email: string };
type Campaign = { id: string; subject: string; body: string; status: string; createdAt: string; queued: number; sent: number; failed: number; cancelled: number };
type Snapshot = { profile: Profile; contacts: Contact[]; leads: Lead[]; campaigns: Campaign[] };
type Audience = "families" | "leads" | "all";
type ResultBody = { ok?: boolean; error?: string; message?: string; result?: { id?: string; recipients?: number } };

const normalizeRole = (role: string) => role.toLowerCase().replace(/[\s-]+/g, "_");
const roleLabel = (role: string) => role.replaceAll("_", " ");
const niceDate = (value: string | null) => {
  if (!value) return "No change recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : value;
};
const makeRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0;
    return (char === "x" ? random : (random & 0x3 | 0x8)).toString(16);
  });
};
async function readResult(response: Response): Promise<ResultBody> {
  const parsed = await response.json().catch(() => ({}));
  return parsed && typeof parsed === "object" ? parsed as ResultBody : {};
}
function errorMessage(response: Response, result: ResultBody) {
  return result.error || result.message || `Request failed (${response.status}).`;
}
function statusTone(status: string) {
  if (["sent", "complete", "completed"].includes(status.toLowerCase())) return "";
  if (["failed", "cancelled", "canceled"].includes(status.toLowerCase())) return "red";
  if (["queued", "pending", "sending"].includes(status.toLowerCase())) return "amber";
  return "blue";
}

export default function CommunicationsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [audience, setAudience] = useState<Audience>("families");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [sendConfirm, setSendConfirm] = useState("");
  const [requestId, setRequestId] = useState("");
  const [consentReasons, setConsentReasons] = useState<Record<string, string>>({});
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [cancelId, setCancelId] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/communications", { credentials: "include", cache: "no-store" });
      const result = await readResult(response);
      if (!response.ok || result.error) throw new Error(errorMessage(response, result));
      const data = result as unknown as Snapshot;
      if (!data.profile || !Array.isArray(data.contacts) || !Array.isArray(data.leads) || !Array.isArray(data.campaigns)) {
        throw new Error("The communications response was incomplete.");
      }
      setSnapshot(data);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Communications records could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const role = normalizeRole(snapshot?.profile.role ?? "");
  const isParent = ["parent", "guardian", "family_parent"].includes(role);
  const isOwner = ["super_admin", "owner"].includes(role);
  const isSales = role === "sales_marketing";
  const canSend = isOwner || isSales;
  const canRecordLeadConsent = isOwner || isSales;
  const contacts = snapshot?.contacts ?? [];
  const leads = snapshot?.leads ?? [];
  const campaigns = snapshot?.campaigns ?? [];

  const displayedContacts = useMemo(() => isParent
    ? contacts.filter(contact => contact.guardianId === snapshot?.profile.id && !contact.leadId)
    : contacts, [contacts, isParent, snapshot?.profile.id]);
  const effectiveAudience: Audience = isSales ? "leads" : audience;
  const recipientCount = useMemo(() => contacts.filter(contact => {
    if (!contact.consent || contact.eligible === false) return false;
    if (effectiveAudience === "families") return Boolean(contact.guardianId);
    if (effectiveAudience === "leads") return Boolean(contact.leadId);
    return Boolean(contact.guardianId || contact.leadId);
  }).length, [contacts, effectiveAudience]);

  const postAction = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/communications", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await readResult(response);
    if (!response.ok || result.ok === false || result.error) throw new Error(errorMessage(response, result));
    if (!result.result || typeof result.result.id !== "string" || typeof result.result.recipients !== "number") {
      throw new Error("The action response could not be confirmed. Refresh records before retrying.");
    }
    return result.result;
  }, []);

  const saveConsent = async (contact: Contact, enabled: boolean) => {
    if (isParent ? contact.guardianId !== snapshot?.profile.id || Boolean(contact.leadId) : !canRecordLeadConsent || !contact.leadId) return;
    if (busyRef.current) return;
    const evidence = (consentReasons[contact.id] ?? "").trim();
    if (evidence.length < 5) {
      setActionError("Add at least five characters of explicit consent evidence or reason.");
      return;
    }
    busyRef.current = true; setBusy(true); setActionError(""); setNotice("");
    try {
      await postAction({ action: "consent", ...(isParent ? {} : contact.leadId ? { leadId: contact.leadId } : {}), enabled, reason: evidence });
      setConsentReasons(current => ({ ...current, [contact.id]: "" }));
      await load(true);
      setNotice(`Marketing consent ${enabled ? "recorded" : "withdrawn"}.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Consent could not be updated.");
    } finally { busyRef.current = false; setBusy(false); }
  };

  const saveLeadConsent = async (lead: Lead, enabled: boolean) => {
    if (!canRecordLeadConsent || busyRef.current) return;
    const key = `lead:${lead.id}`;
    const evidence = (consentReasons[key] ?? "").trim();
    if (evidence.length < 5) { setActionError("Add explicit consent evidence of at least five characters before saving."); return; }
    busyRef.current = true; setBusy(true); setActionError(""); setNotice("");
    try {
      await postAction({ action: "consent", leadId: lead.id, enabled, reason: evidence });
      setConsentReasons(current => ({ ...current, [key]: "" }));
      await load(true);
      setNotice(`Lead marketing consent ${enabled ? "recorded" : "withdrawn"}.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Lead consent could not be updated.");
    } finally { busyRef.current = false; setBusy(false); }
  };

  const startNewMessage = () => {
    setSubject(""); setBody(""); setReason(""); setSendConfirm(""); setRequestId("");
    setActionError(""); setNotice("");
  };
  const submitCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || busyRef.current) return;
    if (sendConfirm !== "SEND") { setActionError("Type SEND exactly to authorize this campaign."); return; }
    if (reason.trim().length < 5) { setActionError("A campaign reason of at least five characters is required."); return; }
    if (recipientCount < 1) { setActionError("There are no consented contacts in this audience."); return; }
    const stableRequestId = requestId || makeRequestId();
    setRequestId(stableRequestId);
    busyRef.current = true; setBusy(true); setActionError(""); setNotice("");
    try {
      const result = await postAction({
        action: "campaign", requestId: stableRequestId, subject: subject.trim(), body: body.trim(),
        audience: effectiveAudience, confirm: "SEND", reason: reason.trim(),
      });
      await load(true);
      setNotice(`Campaign request accepted for ${result.recipients} eligible recipient${result.recipients === 1 ? "" : "s"}. Stored campaign status is shown in history when the refresh completes.`);
      startNewMessage();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Campaign could not be submitted. The same request ID is retained for a safe retry.");
    } finally { busyRef.current = false; setBusy(false); }
  };

  const cancelCampaign = async (campaign: Campaign) => {
    if (busyRef.current) return;
    const why = (cancelReasons[campaign.id] ?? "").trim();
    if (why.length < 5) { setActionError("A cancellation reason of at least five characters is required."); return; }
    busyRef.current = true; setBusy(true); setActionError(""); setNotice("");
    try {
      const result = await postAction({ action: "cancel", id: campaign.id, reason: why });
      await load(true);
      setCancelId(""); setCancelReasons(current => ({ ...current, [campaign.id]: "" }));
      setNotice(`Campaign cancellation recorded (${result.recipients} recipient${result.recipients === 1 ? "" : "s"} affected). Stored status has been refreshed.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Campaign could not be cancelled.");
    } finally { busyRef.current = false; setBusy(false); }
  };

  if (loading && !snapshot) return <main className="cm-page"><div className="cm-shell"><div className="cm-skeleton" style={{ marginTop: 30 }} /><div className="cm-skeleton" style={{ marginTop: 15 }} /></div></main>;

  return <main className="cm-page">
    <div className="cm-shell">
      <section className="cm-heading">
        <div><h1>Consent &amp; campaigns</h1></div>
        <button type="button" className="cm-link" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={14} /> {refreshing ? "Refreshing" : "Refresh"}</button>
      </section>
      {loadError && <div className="cm-alert error" role="alert">{loadError}<button type="button" className="cm-btn" onClick={() => void load()}>Retry</button></div>}
      {actionError && <div className="cm-alert error" role="alert">{actionError}</div>}
      {notice && <div className="cm-alert" role="status"><Check size={16} />{notice}</div>}
      {refreshing && snapshot && <div className="cm-alert" role="status"><RefreshCw size={15} />Refreshing stored records…</div>}
      <div className="cm-banner"><span className="cm-banner-icon"><Mail size={17} /></span><div><strong>Email only · WhatsApp provider unavailable</strong><span>Referral source and media-sharing consent are never treated as marketing permission.</span></div></div>
      <div className="cm-layout" data-portal-layout="communications" data-cm-compose={canSend ? "true" : "false"}>
        {canSend && <div className="cm-stack">
          <section className="cm-card">
            <div className="cm-card-head"><div><h2>Prepare an email campaign</h2></div></div>
            <form onSubmit={event => void submitCampaign(event)}>
              <div className="cm-form">
                <div className="cm-field"><label htmlFor="cm-audience">Audience</label><select id="cm-audience" value={effectiveAudience} onChange={event => setAudience(event.target.value as Audience)} disabled={isSales}><>{isSales ? <option value="leads">Your leads</option> : <><option value="families">Families</option><option value="leads">Leads</option>{isOwner && <option value="all">All consented contacts</option>}</>}</></select><small>{isSales ? "Sales campaigns are limited to your own leads returned by the server." : "Audience size is calculated from consented contacts, not total profiles."}</small></div>
                <div className="cm-field"><label htmlFor="cm-subject">Subject</label><input id="cm-subject" required maxLength={160} value={subject} onChange={event => setSubject(event.target.value)} placeholder="A specific, useful subject" /></div>
                <div className="cm-field full"><label htmlFor="cm-body">Email message</label><textarea id="cm-body" required minLength={5} maxLength={5000} value={body} onChange={event => setBody(event.target.value)} placeholder="Write the message families or leads have explicitly agreed to receive." /><small>{body.length}/5000 characters</small></div>
                <div className="cm-field full"><label htmlFor="cm-reason">Reason for sending</label><textarea id="cm-reason" required minLength={5} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Campaign purpose and why this audience should receive it." /></div>
              </div>
              <div className="cm-recipient-summary"><Users size={14} /><strong>{recipientCount}</strong> eligible recipient{recipientCount === 1 ? "" : "s"} with recorded marketing consent</div>
              <label className="cm-send-check"><input type="checkbox" checked={sendConfirm === "SEND"} onChange={event => setSendConfirm(event.target.checked ? "SEND" : "")} /> I have reviewed the audience and message.</label>
              <div className="cm-field" style={{ maxWidth: 240, marginTop: 11 }}><label htmlFor="cm-type-send">Type SEND to confirm</label><input id="cm-type-send" value={sendConfirm} onChange={event => setSendConfirm(event.target.value)} autoComplete="off" /></div>
              <div className="cm-actions"><button type="submit" className="cm-btn primary" disabled={busy || !subject.trim() || body.trim().length < 5 || reason.trim().length < 5 || sendConfirm !== "SEND" || recipientCount < 1}><Send size={14} />{busy ? "Submitting…" : "Send campaign"}</button><button type="button" className="cm-btn" onClick={startNewMessage} disabled={busy}><X size={14} /> New message</button><span className="cm-hint">Retries retain the same request ID. It changes only after a successful send or when you start a new message.</span></div>
            </form>
          </section>
        </div>}
        <aside className="cm-stack">
          <section className="cm-card"><div className="cm-card-head"><div><h2>Eligible audience</h2><p>Counts use consented contact records returned for your account.</p></div></div><div className="cm-list">{(["families", "leads", "all"] as Audience[]).filter(item => isOwner || item !== "all").map(item => {
            const count = contacts.filter(contact => contact.consent && (item === "families" ? Boolean(contact.guardianId) : item === "leads" ? Boolean(contact.leadId) : Boolean(contact.guardianId || contact.leadId))).length;
            return <div className="cm-row" key={item}><div><h3>{item === "all" ? "All consented contacts" : item}</h3><p>Explicit marketing permission</p></div><span className="cm-count">{count}</span></div>;
          })}</div></section>
          {isParent && <div className="cm-note"><strong>Your choice is yours</strong>Only the guardian's own marketing consent is shown and can be changed here. This action does not update a child's media-sharing preference.</div>}
        </aside>
      </div>
      <div className="cm-record-workarea">
          <section className="cm-flat-section">
            <div className="cm-card-head"><div><h2>{isParent ? "Your marketing preference" : "Marketing consent records"}</h2><p>{isParent ? "Change your own guardian marketing preference at any time." : "Consent evidence is recorded deliberately. Do not infer it from referrals or media permission."}</p></div><span className="cm-count">{displayedContacts.length} contacts</span></div>
            {displayedContacts.length ? <div className="cm-list">{displayedContacts.map(contact => <article className="cm-row" key={contact.id}>
              <div className="pw-person-inline"><ProfileAvatar profileId={contact.guardianId} name={contact.email} size={32} /><div><h3>{contact.email}</h3><p>{contact.guardianId ? "Family contact" : "Lead contact"} · Updated {niceDate(contact.changedAt)}</p><div className="cm-row-meta"><span className={`cm-pill ${contact.consent ? "" : "red"}`}>{contact.consent ? "Marketing consented" : "No marketing consent"}</span>{contact.evidence && <span className="cm-pill blue">Evidence on file</span>}</div>{contact.evidence && <p style={{ marginTop: 7 }}>Evidence: {contact.evidence}</p>}</div></div>
                {(isParent || (canRecordLeadConsent && Boolean(contact.leadId))) && <div className="cm-consent-edit"><label className="cm-consent-toggle"><input type="checkbox" checked={contact.consent} disabled={busy} onChange={event => void saveConsent(contact, event.target.checked)} /><span>{contact.consent ? "Withdraw marketing consent" : "Record marketing consent"}</span></label><textarea aria-label={`Reason or evidence for ${contact.email}`} value={consentReasons[contact.id] ?? ""} onChange={event => setConsentReasons(current => ({ ...current, [contact.id]: event.target.value }))} placeholder={isParent ? "Reason for changing this preference" : "Explicit evidence source, such as consent captured on a dated form"} maxLength={2000} /></div>}
            </article>)}</div> : <div className="cm-empty"><strong>{isParent ? "No guardian marketing preference returned" : "No contact records returned"}</strong>{isParent ? "Your authenticated profile may not have a marketing contact attached." : "Only contacts in this authorized communications scope are shown."}</div>}
          </section>
          {!isParent && <section className="cm-flat-section">
            <div className="cm-card-head"><div><h2>Lead consent evidence</h2><p>Record permission only after receiving explicit marketing consent from that lead.</p></div><span className="cm-count">{leads.length} leads</span></div>
            {canRecordLeadConsent ? leads.length ? <div className="cm-list">{leads.map(lead => {
              const contact = contacts.find(item => item.leadId === lead.id);
              const key = `lead:${lead.id}`;
              return <article className="cm-row" key={lead.id}><div className="pw-person-inline"><ProfileAvatar name={lead.name || "Lead"} size={32} /><div><h3>{lead.name || "Lead"} <span className="cm-hint">· {lead.email}</span></h3><div className="cm-row-meta"><span className={`cm-pill ${contact?.consent ? "" : "red"}`}>{contact?.consent ? "Marketing consented" : "No marketing consent"}</span>{contact?.changedAt && <span className="cm-pill blue">Updated {niceDate(contact.changedAt)}</span>}</div>{contact?.evidence && <p style={{ marginTop: 7 }}>Evidence: {contact.evidence}</p>}<div className="cm-consent-edit"><label className="cm-consent-toggle"><input type="checkbox" checked={contact?.consent ?? false} disabled={busy} onChange={event => void saveLeadConsent(lead, event.target.checked)} /><span>{contact?.consent ? "Withdraw lead marketing consent" : "Record explicit lead consent"}</span></label><textarea aria-label={`Consent evidence for ${lead.name}`} value={consentReasons[key] ?? ""} onChange={event => setConsentReasons(current => ({ ...current, [key]: event.target.value }))} placeholder="Evidence source and date; referrals or media consent do not count" maxLength={2000} /></div></div></div></article>;
            })}</div> : <div className="cm-empty"><strong>No leads in this scope</strong>Lead records are limited to your authorized account.</div> : <div className="cm-empty"><strong>Lead consent is read-only for this role</strong>Only the owner and Sales can record lead marketing permission.</div>}
          </section>}
          {canSend && <section className="cm-flat-section">
            <div className="cm-card-head"><div><h2>Campaign history</h2><p>Stored status and delivery counts returned by the communications service.</p></div><span className="cm-count">{campaigns.length} campaigns</span></div>
            {campaigns.length ? <div className="cm-list">{campaigns.map(campaign => <article className="cm-row" key={campaign.id}><div><h3>{campaign.subject}</h3><p>{campaign.body}</p><div className="cm-row-meta"><span className={`cm-pill ${statusTone(campaign.status)}`}>{campaign.status.replaceAll("_", " ")}</span><span className="cm-pill blue">Created {niceDate(campaign.createdAt)}</span><span className="cm-pill">Queued {campaign.queued}</span><span className="cm-pill">Sent {campaign.sent}</span><span className={`cm-pill ${campaign.failed ? "red" : ""}`}>Failed {campaign.failed}</span><span className="cm-pill">Cancelled {campaign.cancelled}</span></div>
                {campaign.status.toLowerCase() === "queued" && <div className="cm-cancel-box" style={{ marginTop: 12 }}><textarea aria-label={`Cancellation reason for ${campaign.subject}`} maxLength={2000} placeholder="Reason required to cancel queued campaign" value={cancelReasons[campaign.id] ?? ""} onChange={event => setCancelReasons(current => ({ ...current, [campaign.id]: event.target.value }))} /><button type="button" className="cm-btn danger" disabled={busy || (cancelReasons[campaign.id] ?? "").trim().length < 5} onClick={() => { setCancelId(campaign.id); void cancelCampaign(campaign); }}>{busy && cancelId === campaign.id ? "Cancelling…" : "Cancel queued campaign"}</button></div>}
              </div></article>)}</div> : <div className="cm-empty"><strong>No campaigns yet</strong>Campaign status appears here after the service accepts a message.</div>}
          </section>}
          </div>
      <footer className="cm-footer"><span>ProsperWork Music Concepts · live, account-scoped communications</span><span>{snapshot ? `Signed in as ${snapshot.profile.name || roleLabel(snapshot.profile.role)}` : "Communications"}</span></footer>
    </div>
  </main>;
}

