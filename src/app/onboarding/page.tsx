"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Check, FileText, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { PolicyVersion } from "@/lib/academy/family";

type OnboardingResponse = {
  profile: { id: string; name: string; role: string; status: string };
  versions: PolicyVersion[];
  acceptedIds: string[];
  setupRequired: boolean;
  missingKeys: string[];
};
type JsonResult = Record<string, unknown>;
async function readJson(response: Response): Promise<JsonResult> {
  const copy = response.clone();
  try { return await response.json() as JsonResult; }
  catch { const text = await copy.text().catch(() => ""); return text ? { error: text } : {}; }
}
function messageFor(result: JsonResult, status: number) {
  if (typeof result.error === "string") return result.error;
  if (typeof result.message === "string") return result.message;
  return `The request could not be completed (${status}).`;
}

export default function OnboardingPage() {
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const currentVersions = useMemo(() => (data?.versions ?? []).filter(version => version.published_at !== null)
    .slice().sort((a, b) => a.key.localeCompare(b.key) || a.version - b.version), [data?.versions]);
  const currentIds = useMemo(() => currentVersions.map(version => version.id), [currentVersions]);
  const acknowledgedOnServer = useMemo(() => new Set(data?.acceptedIds ?? []), [data?.acceptedIds]);
  const allChecked = Boolean(!data?.setupRequired && currentIds.length > 0 && currentIds.every(id => checkedIds.includes(id)));
  const allAccepted = Boolean(!data?.setupRequired && currentIds.length > 0 && currentIds.every(id => acknowledgedOnServer.has(id)));
  const isParent = data?.profile.role.toLowerCase().replace(/[\s-]+/g, "_") === "parent";
  const canAccept = Boolean(isParent && data?.profile.status.trim().toLowerCase() === "active" && !data.setupRequired);

  const load = useCallback(async (): Promise<OnboardingResponse | null> => {
    setRefreshing(true); setError("");
    try {
      const response = await fetch("/api/policies", { credentials: "include", cache: "no-store" });
      const result = await readJson(response);
      if (response.status === 401) { window.location.assign("/login"); return null; }
      if (!response.ok) throw new Error(messageFor(result, response.status));
      const payload = result as unknown as OnboardingResponse;
      if (!payload.profile || !Array.isArray(payload.versions) || !Array.isArray(payload.acceptedIds)) throw new Error("The policy response was incomplete.");
      setData(payload);
      const ids = payload.versions.filter(version => version.published_at !== null).map(version => version.id);
      setCheckedIds(ids.filter(id => payload.acceptedIds.includes(id)));
      setStale(false);
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approved policies could not be loaded.");
      return null;
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const acceptCurrent = async () => {
    if (!canAccept || stale || !allChecked || currentIds.length === 0) return;
    setBusy(true); setError(""); setMessage("");
    const submittedIds = [...currentIds];
    try {
      const response = await fetch("/api/policies", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept", ids: submittedIds }),
      });
      const result = await readJson(response);
      if (response.status === 409) {
        setStale(true);
        throw new Error(messageFor(result, response.status) || "Policy versions changed. Reload the current versions and review them again before accepting.");
      }
      if (!response.ok || result.ok === false) throw new Error(messageFor(result, response.status));
      const refreshed = await load();
      if (!refreshed) throw new Error("Acceptance returned, but the current policy status could not be verified.");
      const refreshedCurrentIds = refreshed.versions.filter(version => version.published_at !== null).map(version => version.id);
      const allSubmittedStillCurrent = submittedIds.length === refreshedCurrentIds.length && submittedIds.every(id => refreshedCurrentIds.includes(id));
      const allConfirmed = refreshedCurrentIds.length > 0 && refreshedCurrentIds.every(id => refreshed.acceptedIds.includes(id));
      if (!allSubmittedStillCurrent) {
        setStale(true);
        throw new Error("The current published policy set changed during acceptance. Reload and review the latest versions.");
      }
      if (!allConfirmed) throw new Error("The API did not confirm acceptance for every current policy version. Reload before continuing.");
      setMessage("All current published policies are acknowledged for this account.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Policy acceptance could not be confirmed.");
    } finally { setBusy(false); }
  };

  const toggleAcknowledgement = (id: string, checked: boolean) => {
    if (acknowledgedOnServer.has(id) || stale) return;
    setCheckedIds(current => checked ? [...new Set([...current, id])] : current.filter(currentId => currentId !== id));
  };

  const noPublished = currentVersions.length === 0;
  return (
    <main className="pw-family">
      <div className="family-topline" />
      <header className="family-header">
        <Link href="/" className="family-brand" aria-label="ProsperWork Academy home"><img src="/favicon-192x192.png" alt="" /><span className="family-brand-copy"><strong>ProsperWork</strong><small>Music Academy</small></span></Link>
        <nav className="family-nav" aria-label="Onboarding navigation"><Link href="/family"><ArrowLeft size={14} /> Family</Link><Link href="/policies">Policy library</Link><Link href="/learning">Lessons</Link><button type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw size={14} /> Reload</button></nav>
      </header>
      <section className="family-content">
        <div className="family-heading"><div><div className="family-eyebrow"><i /> FAMILY ONBOARDING</div><h1>Review the academy policies</h1><p>Open each current, approved PDF and acknowledge each version individually. Only the published documents listed here can be accepted.</p></div>{data && <div className="family-profile"><span className="family-avatar">{data.profile.name.split(/\s+/).map(part => part[0] ?? "").slice(0, 2).join("").toUpperCase()}</span><span className="family-profile-copy"><strong>{data.profile.name}</strong><small>{data.profile.role} · {data.profile.status}</small></span></div>}</div>
        {error && <div className="family-alert" role="alert"><AlertCircle size={16} /><p>{error}</p>{stale && <button className="family-button subtle" type="button" onClick={() => void load()}>Reload current versions</button>}</div>}
        {message && <div className="family-alert success" role="status"><Check size={16} /><p>{message}</p></div>}
        {data?.setupRequired && <div className="family-alert info" role="status"><ShieldCheck size={16} /><div><strong>Owner setup required — onboarding is blocked</strong><p>An Owner must publish approved PDF documents for every required policy key before acknowledgement can continue. Missing: {(data.missingKeys ?? []).join(", ") || "required policy versions not confirmed"}.</p><p><Link href="/policies">View policy setup status</Link></p></div></div>}
        {data && !data.setupRequired && !canAccept && <div className="family-alert info" role="status"><ShieldCheck size={16} /><p>Policy documents remain viewable, but only an active Parent account can record guardian acknowledgements.</p></div>}
        {loading && !data ? <div className="family-card family-card-body"><div className="family-stack"><div className="family-skeleton" /><div className="family-skeleton" /><div className="family-skeleton" /></div></div>
          : data && noPublished ? <section className="family-card" aria-labelledby="empty-policies-title">
            <div className="family-empty"><span className="family-empty-mark"><FileText size={17} /></span><strong id="empty-policies-title">{data.setupRequired ? "No approved policy setup is available yet" : "No current approved policies"}</strong><p>{data.setupRequired ? "No approved policy PDF versions have been published. Onboarding cannot be completed until an Owner uploads the academy-approved documents and publishes them." : "There are no published policy PDFs to review at this time. Nothing has been accepted or recorded."}</p>{data.setupRequired && <p><Link className="family-button subtle" href="/policies">View policy setup status</Link></p>}</div>
          </section> : data && <div className="family-grid">
            <section className="family-card" aria-labelledby="current-policies-title">
              <div className="family-card-head"><div><h2 id="current-policies-title">Current approved versions</h2><p>Each acknowledgement is tied to the exact published PDF version.</p></div><ShieldCheck size={17} color="#6a9d7b" aria-hidden="true" /></div>
              <div className="family-card-body">
                {currentVersions.map(version => {
                  const accepted = acknowledgedOnServer.has(version.id);
                  const checked = accepted || checkedIds.includes(version.id);
                  return <div className="family-checkbox" key={version.id}>
                    <input id={`policy-ack-${version.id}`} type="checkbox" checked={checked} disabled={!canAccept || stale || busy || accepted} onChange={event => toggleAcknowledgement(version.id, event.target.checked)} />
                    <label htmlFor={`policy-ack-${version.id}`}><strong>{version.title}</strong><small>{version.key.replace(/_/g, " ")} · Version {version.version}{accepted ? " · Already acknowledged" : " · Acknowledgement required"}</small></label>
                    {version.file_id ? <a className="family-button" href={`/api/files?id=${encodeURIComponent(version.file_id)}`} target="_blank" rel="noreferrer"><FileText size={13} /> Open private PDF</a> : <span className="family-chip">PDF unavailable</span>}
                  </div>;
                })}
                {stale && <div className="family-alert info" role="status"><p>A newer version needs review. Reload the policy list before continuing.</p><button type="button" className="family-button subtle" onClick={() => void load()}>Reload current versions</button></div>}
                {data.setupRequired
                  ? <div className="family-upload-note">Acknowledgement is unavailable until the Owner publishes all required policy keys.</div>
                  : <div className="family-form-actions"><button type="button" className="family-button primary" onClick={() => void acceptCurrent()} disabled={!canAccept || !allChecked || allAccepted || stale || busy}>
                    {busy ? <><LoaderCircle size={14} /> Recording…</> : allAccepted ? <><Check size={14} /> Already acknowledged</> : "Acknowledge all current versions"}
                  </button></div>}
                {allAccepted && <p className="family-upload-note" role="status">The policy API confirms all current versions are acknowledged. No social or media consent is included in this step.</p>}
              </div>
            </section>
            <aside className="family-stack">
              <section className="family-card"><div className="family-card-head"><div><h2>What this records</h2><p>Policy acknowledgement only.</p></div><Check size={17} color="#6a9d7b" aria-hidden="true" /></div><div className="family-card-body"><div className="family-focus">The submitted IDs are the current published policy versions returned by the API. If a version changes, the server rejects the stale set and asks you to reload.</div></div></section>
            </aside>
          </div>}
      </section>
    </main>
  );
}
