"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Check, FileText, LoaderCircle, Plus, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import type { PolicyVersion } from "@/lib/academy/family";

type ScopedPolicyVersion = PolicyVersion & { audienceParentId?: string | null; audience_parent_id?: string | null };
type PoliciesResponse = {
  profile: { id: string; name: string; role: string; status: string };
  versions: ScopedPolicyVersion[];
  acceptedIds: string[];
  setupRequired: boolean;
  missingKeys: string[];
};
type JsonResult = Record<string, unknown>;
type DraftForm = { key: string; title: string };
const requiredKeys = ["parent_agreement", "terms_of_service", "reschedule_policy"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readJson(response: Response): Promise<JsonResult> {
  const copy = response.clone();
  try { return await response.json() as JsonResult; }
  catch { const text = await copy.text().catch(() => ""); return text ? { error: text } : {}; }
}
function roleKey(value: string) { return value.toLowerCase().replace(/[\s-]+/g, "_"); }
function messageFor(result: JsonResult, status: number) {
  if (typeof result.error === "string") return result.error;
  if (typeof result.message === "string") return result.message;
  return `The request could not be completed (${status}).`;
}
function dateLabel(value: string | null) {
  if (!value) return "Draft · not published";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date) : "Published date unavailable";
}

export default function PoliciesPage() {
  const [data, setData] = useState<PoliciesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState<DraftForm>({ key: "", title: "" });
  const [additionalKey, setAdditionalKey] = useState("");
  const [guardianAccountId, setGuardianAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pendingPolicyId, setPendingPolicyId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const profileRole = roleKey(data?.profile.role ?? "");
  const isOwner = profileRole === "owner" || profileRole === "super_admin";
  const canEdit = Boolean(isOwner && data?.profile.status.trim().toLowerCase() === "active");
  const visibleVersions = useMemo(() => (data?.versions ?? []).filter(version => isOwner || version.published_at !== null)
    .slice().sort((a, b) => b.version - a.version || b.created_at.localeCompare(a.created_at)), [data?.versions, isOwner]);

  const load = useCallback(async (): Promise<PoliciesResponse | null> => {
    setRefreshing(true); setError("");
    try {
      const response = await fetch("/api/policies", { credentials: "include", cache: "no-store" });
      const result = await readJson(response);
      if (response.status === 401) { window.location.assign("/login"); return null; }
      if (!response.ok) throw new Error(messageFor(result, response.status));
      const payload = result as unknown as PoliciesResponse;
      if (!payload.profile || !Array.isArray(payload.versions) || !Array.isArray(payload.acceptedIds)) throw new Error("The policy response was incomplete.");
      setData(payload);
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Policy versions could not be loaded.");
      return null;
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const uploadDraftPdf = async (policyId: string, selectedFile: File) => {
    const form = new FormData();
    form.set("category", "policy");
    form.set("targetId", policyId);
    form.set("file", selectedFile);
    const response = await fetch("/api/files", { method: "POST", credentials: "include", body: form });
    const result = await readJson(response);
    if (!response.ok || result.ok === false) throw new Error(messageFor(result, response.status));
  };

  const saveDraftAndUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    setBusy("draft"); setFormError(""); setMessage("");
    const extension = file?.name.toLowerCase().split(".").pop();
    if (!file || file.size > 50 * 1024 * 1024 || (file.type !== "application/pdf" && extension !== "pdf")) {
      setFormError("Choose a PDF file up to 50 MiB.");
      setBusy("");
      return;
    }
    const policyKey = (draft.key === "__additional" ? additionalKey : draft.key).trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{2,49}$/.test(policyKey)) {
      setFormError("Choose one of the required policy keys or enter a valid additional key.");
      setBusy("");
      return;
    }
    if (draft.key === "__additional" && requiredKeys.includes(policyKey)) {
      setFormError("Choose the matching required key from the policy picker instead.");
      setBusy("");
      return;
    }
    const audienceParentId = guardianAccountId.trim();
    if (audienceParentId && !uuidPattern.test(audienceParentId)) {
      setFormError("Enter a valid guardian account UUID, or leave the field blank for all families.");
      setBusy("");
      return;
    }
    try {
      let id = pendingPolicyId;
      if (!id) {
        const response = await fetch("/api/policies", {
          method: "POST", credentials: "include", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "draft", key: policyKey, title: draft.title.trim(), ...(audienceParentId ? { audienceParentId } : {}) }),
        });
        const result = await readJson(response);
        if (!response.ok || typeof result.id !== "string") throw new Error(messageFor(result, response.status));
        id = result.id;
        setPendingPolicyId(id);
      }
      await uploadDraftPdf(id, file);
      const fresh = await load();
      const version = fresh?.versions.find(item => item.id === id && Boolean(item.file_id));
      if (!version) throw new Error("The PDF upload response was received, but the policy file was not confirmed in the private policy list.");
      setDraft({ key: "", title: "" }); setAdditionalKey(""); setGuardianAccountId("");
      setFile(null);
      setPendingPolicyId(null);
      setMessage("Draft PDF attached. It remains unpublished until the Owner approves it.");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The draft PDF could not be attached.");
    } finally { setBusy(""); }
  };

  const publish = async (version: PolicyVersion) => {
    if (!canEdit || !version.file_id || version.published_at) return;
    setBusy(`publish:${version.id}`); setFormError(""); setMessage("");
    try {
      const response = await fetch("/api/policies", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "publish", id: version.id }),
      });
      const result = await readJson(response);
      if (!response.ok || result.ok === false) throw new Error(messageFor(result, response.status));
      const fresh = await load();
      if (!fresh?.versions.some(item => item.id === version.id && Boolean(item.published_at))) {
        throw new Error("The publish request returned, but this version is not marked published by the policy API. Refresh before treating it as approved.");
      }
      setMessage(`Version ${version.version} is published and available as an approved policy PDF.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The policy version was not published.");
    } finally { setBusy(""); }
  };

  return (
    <main className="pw-family">
      <div className="family-topline" />
      <section className="family-content">
        <div className="family-heading"><h1>Academy policies</h1><button className="family-button subtle" type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw size={14} /> Refresh</button></div>
        {error && <div className="family-alert" role="alert"><AlertCircle size={16} /><p>{error}</p><button className="family-button subtle" type="button" onClick={() => void load()}>Try again</button></div>}
        {message && <div className="family-alert success" role="status"><Check size={16} /><p>{message}</p></div>}
        {formError && <div className="family-alert" role="alert"><AlertCircle size={16} /><p>{formError}</p></div>}
        {data && !canEdit && isOwner && <div className="family-alert info" role="status"><ShieldCheck size={16} /><p>This Owner account is not active. Policy versions are read-only.</p></div>}
        {loading && !data ? <div className="family-grid"><div className="family-card family-card-body"><div className="family-stack"><div className="family-skeleton" /><div className="family-skeleton" /></div></div><div className="family-card family-card-body"><div className="family-skeleton" /></div></div>
          : data && <div className="family-grid policy-layout" data-portal-layout="policy-records">
            <section className="family-card family-policy-ledger" aria-labelledby="version-title">
              <div className="family-card-head"><div><h2 id="version-title">{isOwner ? "Version history" : "Approved policy PDFs"}</h2><p>{isOwner ? "Published versions stay immutable; make a new draft to update a key." : "Only published, approved versions are shown here."}</p></div><FileText size={17} color="#6a9d7b" aria-hidden="true" /></div>
              {data.setupRequired && <div className="family-card-body"><div className="family-alert info" role="status"><ShieldCheck size={16} /><p>Onboarding remains blocked until all required approved PDF keys exist. Missing: {(data.missingKeys ?? []).join(", ") || "required policy versions not confirmed"}.</p></div></div>}
              {visibleVersions.length ? <div className="family-card-body"><div className="family-policy-list">{visibleVersions.map(version => {
                const accepted = data.acceptedIds.includes(version.id);
                return <article className="family-policy" key={version.id}>
                   <div><h3>{version.title}</h3><p>{version.key.replace(/_/g, " ")} · Version {version.version} · {dateLabel(version.published_at)}</p><div className="family-policy-meta"><span className={`family-chip ${version.published_at ? "published" : ""}`}>{version.published_at ? "Owner published" : "Draft"}</span><span className="family-chip">{(version.audienceParentId ?? version.audience_parent_id) ? `Private family · ${version.audienceParentId ?? version.audience_parent_id}` : "Global · all families"}</span>{version.published_at && <span className="family-chip">{accepted ? "Accepted by this account" : "Not yet accepted"}</span>}</div></div>
                  <div className="family-report-actions">{version.file_id && <a className="family-button" href={`/api/files?id=${encodeURIComponent(version.file_id)}`} target="_blank" rel="noreferrer"><FileText size={13} /> Open private PDF</a>}{canEdit && !version.published_at && <button type="button" className="family-button primary" disabled={!version.file_id || busy === `publish:${version.id}`} onClick={() => void publish(version)}>{busy === `publish:${version.id}` ? <><LoaderCircle size={14} /> Publishing…</> : <><ShieldCheck size={13} /> Publish version</>}</button>}</div>
                </article>;
              })}</div></div> : <div className="family-empty"><span className="family-empty-mark"><FileText size={17} /></span><strong>{data.setupRequired ? "Approved policy setup is required" : "No approved policy PDFs yet"}</strong><p>{data.setupRequired ? "No approved policy versions are published. An Owner must attach and publish the academy-approved documents before onboarding can continue." : isOwner ? "Create a draft using the actual policy document, then publish it after Owner review." : "The academy has not published policy PDFs for your account yet."}</p></div>}
            </section>
            {canEdit && <details className="policy-create-disclosure">
              <summary><Plus size={14} /> {pendingPolicyId ? "Finish policy PDF upload" : "New policy"}</summary>
              <section className="family-card" aria-labelledby="draft-title">
              <div className="family-card-head"><div><h2 id="draft-title">{pendingPolicyId ? "Finish the same draft upload" : "Policy version details"}</h2></div><Plus size={17} color="#6a9d7b" aria-hidden="true" /></div>
              <form className="family-card-body" onSubmit={event => void saveDraftAndUpload(event)}>
                {pendingPolicyId && <div className="family-upload-note">Draft {pendingPolicyId} is already created. A retry will attach a PDF to this same version rather than create another draft.</div>}
                <div className="family-field"><label htmlFor="policy-key">Policy key</label><select id="policy-key" required value={draft.key} onChange={event => setDraft({ ...draft, key: event.target.value })} disabled={Boolean(pendingPolicyId)}><option value="" disabled>Select a policy key</option>{requiredKeys.map(key => <option value={key} key={key}>{key}</option>)}<option value="__additional">Additional policy</option></select><small>The three required keys are pinned above. Additional policies do not replace them.</small></div>
                {draft.key === "__additional" && <div className="family-field"><label htmlFor="policy-additional-key">Additional policy key</label><input id="policy-additional-key" required minLength={3} maxLength={50} pattern="[a-z][a-z0-9_-]{2,49}" value={additionalKey} onChange={event => setAdditionalKey(event.target.value.toLowerCase())} disabled={Boolean(pendingPolicyId)} /><small>Use lowercase letters, numbers, underscores, or hyphens.</small></div>}
                {draft.key === "parent_agreement" && <div className="family-field"><label htmlFor="policy-guardian-id">Guardian account ID <span>Owner-only · optional</span></label><input id="policy-guardian-id" type="text" autoComplete="off" value={guardianAccountId} onChange={event => setGuardianAccountId(event.target.value.trim())} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" aria-describedby="policy-guardian-help" disabled={Boolean(pendingPolicyId)} /><small id="policy-guardian-help">Leave blank for a global agreement. Enter a guardian account UUID to make this agreement private to that family.</small></div>}
                <div className="family-field"><label htmlFor="policy-title">Document title</label><input id="policy-title" required minLength={3} maxLength={150} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} disabled={Boolean(pendingPolicyId)} /><small>Use the title from the academy-approved PDF. Do not enter legal text here.</small></div>
                <div className="family-field"><label htmlFor="policy-pdf">Policy PDF</label><input id="policy-pdf" type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] ?? null)} /><small>PDF only · maximum 50 MiB · stored privately.</small></div>
                <div className="family-form-actions"><button type="submit" className="family-button primary" disabled={busy === "draft"}>{busy === "draft" ? <><LoaderCircle size={14} /> Saving…</> : pendingPolicyId ? <><Upload size={14} /> Retry PDF upload</> : <><Plus size={14} /> Create draft &amp; attach PDF</>}</button></div>
              </form>
              </section>
            </details>}
          </div>}
      </section>
    </main>
  );
}
