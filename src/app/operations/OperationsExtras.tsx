"use client";

import { useState, useMemo, useEffect, useRef, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Plus,
  Settings,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { operationsAction } from "@/lib/academy/operations";
import { PortalModal } from "@/app/_components/PortalModal";

type Rules = {
  tax_percent?: number;
  finance_profit?: boolean;
  referral_percent?: number;
};
export type ExtrasStudent = { id: string; payload: Record<string, unknown> };
export type ExtrasMediaItem = {
  id: string;
  student_id: string;
  status: string;
  notes: string;
  submitted_by: string;
  published_url: string | null;
};
export type ExtrasData = {
  profile: {
    role: string;
    id: string;
    status: string;
    department?: string;
    permissions?: string[];
  };
  settings: Rules | Rules[] | null;
  files: { id: string; original_name: string; category: string }[];
  referrals: { id: string; lead_id: string; created_at: string }[];
  credits: {
    id: string;
    amount: number;
    remaining: number;
    currency: string;
  }[];
  media: ExtrasMediaItem[];
};

function shortDate(value: string) {
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d)
    : value;
}

export default function OperationsExtras({
  data,
  students = [],
  view,
  onRefresh,
}: {
  data: ExtrasData;
  students?: ExtrasStudent[];
  view: "referrals" | "media";
  onRefresh?: () => Promise<unknown>;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const downloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // + Refer a Family modal state
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [refParentName, setRefParentName] = useState("");
  const [refEmail, setRefEmail] = useState("");
  const [refPhone, setRefPhone] = useState("");
  const [refChildName, setRefChildName] = useState("");
  const [refInstrument, setRefInstrument] = useState("");
  const [refNotes, setRefNotes] = useState("");
  const [refConsent, setRefConsent] = useState(false);

  // + Submit Media for Review modal state
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitFileId, setSubmitFileId] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");

  // Per-card Review (Approve / Reject) modal state
  const [reviewTarget, setReviewTarget] = useState<ExtrasMediaItem | null>(null);
  const [reviewApprove, setReviewApprove] = useState(true);
  const [reviewSafe, setReviewSafe] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");

  // Per-card Record Publication modal state
  const [publishTarget, setPublishTarget] = useState<ExtrasMediaItem | null>(
    null
  );
  const [publishUrl, setPublishUrl] = useState("");
  const [publishNotes, setPublishNotes] = useState("");

  // Per-card Withdraw Permission modal state
  const [withdrawTarget, setWithdrawTarget] = useState<ExtrasMediaItem | null>(
    null
  );
  const [withdrawNotes, setWithdrawNotes] = useState("");

  // Modal-specific error
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (downloadTimerRef.current) {
        clearTimeout(downloadTimerRef.current);
        downloadTimerRef.current = null;
      }
    };
  }, []);

  const rules = Array.isArray(data.settings) ? data.settings[0] : data.settings;
  const r = data.profile.role;
  const isActive = data.profile.status === "active";
  const owner = r === "super_admin" || r === "owner";
  const guardian = ["parent", "student"].includes(r);
  const perms = useMemo(
    () => new Set(data.profile.permissions ?? []),
    [data.profile.permissions]
  );
  const canViewReferrals =
    r === "parent" ||
    owner ||
    r === "finance" ||
    r === "sales_marketing" ||
    perms.has("workspace.leads") ||
    perms.has("workspace.finance");
  const reviewer =
    owner ||
    perms.has("workspace.curriculum") ||
    perms.has("workspace.management") ||
    ["super_admin", "qc", "admin", "head_admin"].includes(r);
  const isSocial =
    r === "social_media" || owner || perms.has("workspace.curriculum");

  async function submit(
    body: unknown,
    successMessage: string
  ): Promise<boolean> {
    const parsed = operationsAction.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || "Check the form details.";
      setModalError(msg);
      return false;
    }
    setBusy(true);
    setModalError("");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/operations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "The workflow is blocked.");
      if (onRefresh) {
        await onRefresh();
      }
      setNotice(successMessage);
      return true;
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function handleReferralSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await submit(
      {
        action: "referral",
        parentName: refParentName.trim(),
        email: refEmail.trim(),
        phone: refPhone.trim(),
        childName: refChildName.trim(),
        instrument: refInstrument.trim(),
        contactConsent: refConsent,
        notes: refNotes.trim(),
      },
      "Referral sent to Sales and records refreshed."
    );
    if (ok) {
      setRefParentName("");
      setRefEmail("");
      setRefPhone("");
      setRefChildName("");
      setRefInstrument("");
      setRefNotes("");
      setRefConsent(false);
      setReferralModalOpen(false);
    }
  }

  async function handleMediaSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await submit(
      {
        action: "media_submit",
        fileId: submitFileId,
        notes: submitNotes.trim(),
      },
      "Media submitted for independent safety review."
    );
    if (ok) {
      setSubmitFileId("");
      setSubmitNotes("");
      setSubmitModalOpen(false);
    }
  }

  async function handleMediaReview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reviewTarget) return;
    const ok = await submit(
      {
        action: "media_review",
        id: reviewTarget.id,
        approve: reviewApprove,
        safetyChecked: reviewSafe,
        notes: reviewNotes.trim(),
      },
      reviewApprove
        ? "Media approved for promotional use."
        : "Media rejected and returned."
    );
    if (ok) {
      setReviewTarget(null);
      setReviewSafe(false);
      setReviewNotes("");
    }
  }

  async function handleMediaPublish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!publishTarget) return;
    const ok = await submit(
      {
        action: "media_publish",
        id: publishTarget.id,
        url: publishUrl.trim(),
        notes: publishNotes.trim(),
      },
      "Published URL recorded."
    );
    if (ok) {
      setPublishTarget(null);
      setPublishUrl("");
      setPublishNotes("");
    }
  }

  async function handleMediaWithdraw(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!withdrawTarget) return;
    const ok = await submit(
      {
        action: "media_withdraw",
        id: withdrawTarget.id,
        notes: withdrawNotes.trim(),
      },
      "Media permission withdrawn and downloads blocked."
    );
    if (ok) {
      setWithdrawTarget(null);
      setWithdrawNotes("");
    }
  }

  const approvedMedia = useMemo(() => {
    return (data.media || []).filter((m) => {
      if (m.status !== "approved" && m.status !== "published") return false;
      const student = students.find((s) => s.id === m.student_id);
      return student ? Boolean(student.payload.consent) : true;
    });
  }, [data.media, students]);

  async function downloadAllApproved() {
    if (!approvedMedia.length) return;
    setDownloadProgress(`Preparing ${approvedMedia.length} downloads…`);
    for (let i = 0; i < approvedMedia.length; i++) {
      const item = approvedMedia[i];
      setDownloadProgress(`Downloading ${i + 1} of ${approvedMedia.length}…`);
      const link = document.createElement("a");
      link.href = `/api/media?id=${encodeURIComponent(item.id)}&download=true`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (!mountedRef.current) return;
    }
    if (!mountedRef.current) return;
    setDownloadProgress(`Completed ${approvedMedia.length} file downloads.`);
    if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
    downloadTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setDownloadProgress("");
      downloadTimerRef.current = null;
    }, 4000);
  }

  const studentLabelFor = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    return student ? String(student.payload.name || studentId) : studentId;
  };

  return (
    <>
      {error && (
        <div className="ops-notice ops-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="ops-notice" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {/* REFERRALS VIEW */}
      {view === "referrals" && canViewReferrals && (
        <section className="ops-section" style={{ marginTop: 4 }}>
          <div className="ops-section-head">
            <div>
              <h2>Qualifying referrals &amp; invoice credits</h2>
              <p>
                Credit follows the referred family&apos;s first verified payment
                and applies to a future invoice in the same currency.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {owner && (
                <Link href="/settings?tab=finance" className="ops-btn">
                  <Settings size={13} /> Referral Rule (
                  {rules?.referral_percent ?? 0}%) <ArrowUpRight size={13} />
                </Link>
              )}
              {r === "parent" && (
                <button
                  type="button"
                  className="ops-btn primary"
                  disabled={!isActive || busy}
                  onClick={() => {
                    setModalError("");
                    setReferralModalOpen(true);
                  }}
                >
                  <Plus size={14} /> Refer a Family
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div className="ops-callout">
              <span className="ops-small" style={{ marginTop: 0 }}>
                Recorded referrals
              </span>
              <strong style={{ fontSize: 22, color: "#143c2b" }}>
                {data.referrals?.length || 0}
              </strong>
            </div>
            <div className="ops-callout">
              <span className="ops-small" style={{ marginTop: 0 }}>
                Credit records
              </span>
              <strong style={{ fontSize: 22, color: "#143c2b" }}>
                {data.credits?.length || 0}
              </strong>
            </div>
            {rules?.referral_percent !== undefined && (
              <div className="ops-callout">
                <span className="ops-small" style={{ marginTop: 0 }}>
                  Configured referral bonus
                </span>
                <strong style={{ fontSize: 22, color: "#143c2b" }}>
                  {rules.referral_percent}%
                </strong>
              </div>
            )}
          </div>

          {(data.credits || []).length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#143c2b" }}>
                Referral credits
              </h3>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Credit ID</th>
                      <th>Earned</th>
                      <th>Remaining</th>
                      <th>Currency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.credits.map((c) => (
                      <tr key={c.id}>
                        <td>{c.id.slice(0, 8)}</td>
                        <td>
                          <strong>
                            {Number(c.amount).toFixed(2)} {c.currency}
                          </strong>
                        </td>
                        <td>
                          {Number(c.remaining).toFixed(2)} {c.currency}
                        </td>
                        <td>{c.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(data.referrals || []).length > 0 ? (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#143c2b" }}>
                Submitted referrals
              </h3>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Referral ID</th>
                      <th>Linked Lead</th>
                      <th>Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referrals.map((ref) => (
                      <tr key={ref.id}>
                        <td>
                          <strong>{ref.id.slice(0, 8)}</strong>
                        </td>
                        <td>{ref.lead_id}</td>
                        <td>{shortDate(ref.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="ops-empty">
              <strong>No referrals recorded yet</strong>
              {r === "parent"
                ? "Use Refer a Family above to introduce a friend to ProsperWork Admissions."
                : "Submitted family referrals and resulting credits appear here."}
            </div>
          )}
        </section>
      )}

      {/* MEDIA STUDIO VIEW */}
      {view === "media" && (
        <section className="ops-section" style={{ marginTop: 4 }}>
          <div className="ops-section-head">
            <div>
              <h2>Private media &amp; safety review</h2>
              <p>
                Access follows current guardian consent and recorded safety
                review. Withdrawal blocks new downloads immediately.
              </p>
            </div>
            {r !== "social_media" && (data.files || []).length > 0 && (
              <button
                type="button"
                className="ops-btn primary"
                disabled={!isActive || busy}
                onClick={() => {
                  setModalError("");
                  setSubmitFileId("");
                  setSubmitNotes("");
                  setSubmitModalOpen(true);
                }}
              >
                <Upload size={14} /> Submit Media for Review
              </button>
            )}
          </div>

          {/* Social Media & Owner Download Gateway Panel */}
          {isSocial && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 10,
                padding: "16px 20px",
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: "0 0 4px",
                      color: "#166534",
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    Social Media Download Gateway
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      color: "#15803d",
                      lineHeight: 1.4,
                    }}
                  >
                    {approvedMedia.length} verified practice/performance video
                    {approvedMedia.length === 1 ? "" : "s"} cleared with active
                    guardian consent for promotional broadcasting.
                  </p>
                </div>
                {approvedMedia.length > 0 && (
                  <button
                    type="button"
                    className="ops-btn primary"
                    onClick={() => void downloadAllApproved()}
                    style={{ background: "#15803d", borderColor: "#166534" }}
                  >
                    <Download size={14} /> Batch Download Cleared Media (
                    {approvedMedia.length})
                  </button>
                )}
              </div>
              {downloadProgress && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#166534",
                  }}
                  role="status"
                >
                  {downloadProgress}
                </div>
              )}
            </div>
          )}

          {!data.files?.length &&
            !["social_media", "finance", "sales_marketing"].includes(r) && (
              <div className="ops-callout" style={{ marginBottom: 16 }}>
                No unsubmitted practice/homework files available.{" "}
                <Link
                  href="/studio"
                  style={{ color: "#175c45", fontWeight: 700 }}
                >
                  Record or upload practice media in Studio
                </Link>{" "}
                before submitting it for review.
              </div>
            )}

          {(data.media || []).length > 0 ? (
            <div>
              {data.media.map((m) => {
                const student = students.find((s) => s.id === m.student_id);
                const label = studentLabelFor(m.student_id);
                const hasConsent = student
                  ? Boolean(student.payload.consent)
                  : false;
                const canReviewThis =
                  reviewer &&
                  m.status === "pending" &&
                  m.submitted_by !== data.profile.id;
                const canPublishThis =
                  (owner || r === "social_media") && m.status === "approved";
                const canWithdrawThis =
                  (guardian || reviewer) && m.status !== "withdrawn";

                return (
                  <article className="ops-record" key={m.id}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <strong style={{ fontSize: 14, color: "#143c2b" }}>
                          {label}
                        </strong>
                        <span
                          className={`ops-pill ${
                            m.status === "withdrawn" || m.status === "rejected"
                              ? "alert"
                              : ""
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>
                      {hasConsent ? (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: "#dcfce7",
                            color: "#15803d",
                            fontWeight: 600,
                          }}
                        >
                          Guardian Consent Verified
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: "#fee2e2",
                            color: "#991b1b",
                            fontWeight: 600,
                          }}
                        >
                          No Consent / Private
                        </span>
                      )}
                    </div>

                    <p
                      style={{
                        margin: "8px 0 10px",
                        fontSize: 12.5,
                        color: "#465a4d",
                      }}
                    >
                      {m.notes}
                    </p>

                    {m.published_url && (
                      <p style={{ margin: "0 0 10px", fontSize: 12 }}>
                        <a
                          href={m.published_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#175c45",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <ExternalLink size={12} />
                          {m.status === "withdrawn"
                            ? "Remove this external publication"
                            : "Published URL"}
                        </a>
                      </p>
                    )}

                    <div
                      className="ops-actions"
                      style={{ justifyContent: "flex-start", marginTop: 6 }}
                    >
                      {m.status !== "withdrawn" && (
                        <>
                          <a
                            href={"/api/media?id=" + encodeURIComponent(m.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ops-btn"
                          >
                            Preview media
                          </a>
                          <a
                            href={
                              "/api/media?id=" +
                              encodeURIComponent(m.id) +
                              "&download=true"
                            }
                            className="ops-btn"
                          >
                            <Download size={13} /> Download
                          </a>
                        </>
                      )}

                      {canReviewThis && (
                        <button
                          type="button"
                          className="ops-btn primary"
                          disabled={!isActive || busy}
                          onClick={() => {
                            setModalError("");
                            setReviewTarget(m);
                            setReviewApprove(true);
                            setReviewSafe(false);
                            setReviewNotes("");
                          }}
                        >
                          <ShieldCheck size={13} /> Review (Approve / Reject)
                        </button>
                      )}

                      {canPublishThis && (
                        <button
                          type="button"
                          className="ops-btn primary"
                          disabled={!isActive || busy}
                          onClick={() => {
                            setModalError("");
                            setPublishTarget(m);
                            setPublishUrl("");
                            setPublishNotes("");
                          }}
                        >
                          Record Publication
                        </button>
                      )}

                      {canWithdrawThis && (
                        <button
                          type="button"
                          className="ops-btn danger"
                          disabled={!isActive || busy}
                          onClick={() => {
                            setModalError("");
                            setWithdrawTarget(m);
                            setWithdrawNotes("");
                          }}
                        >
                          Withdraw Permission
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="ops-empty">
              <strong>No accessible media-review records</strong>
              Submitted practice or performance files awaiting review appear
              here.
            </div>
          )}
        </section>
      )}

      {/* + Refer a Family Modal */}
      <PortalModal
        open={referralModalOpen}
        onClose={() => {
          if (!busy) setReferralModalOpen(false);
        }}
        title="Refer a Family to ProsperWork"
        eyebrow="Family Referral"
        subtitle="Referral credits apply after the referred family completes their first verified payment."
        size="md"
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setReferralModalOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-referral-form"
              className="ops-btn primary"
              disabled={!isActive || busy}
            >
              {busy ? "Sending…" : "Send Referral to Sales"}
            </button>
          </>
        }
      >
        <form
          id="ops-referral-form"
          onSubmit={(e) => void handleReferralSubmit(e)}
        >
          <div className="ops-form-grid">
            <div className="ops-field">
              <label htmlFor="ref-parent-name">Referred parent name</label>
              <input
                id="ref-parent-name"
                maxLength={120}
                required
                value={refParentName}
                onChange={(e) => setRefParentName(e.target.value)}
              />
            </div>
            <div className="ops-field">
              <label htmlFor="ref-parent-email">Referred parent email</label>
              <input
                id="ref-parent-email"
                type="email"
                required
                value={refEmail}
                onChange={(e) => setRefEmail(e.target.value)}
              />
            </div>
            <div className="ops-field">
              <label htmlFor="ref-phone">Phone (optional)</label>
              <input
                id="ref-phone"
                maxLength={40}
                value={refPhone}
                onChange={(e) => setRefPhone(e.target.value)}
              />
            </div>
            <div className="ops-field">
              <label htmlFor="ref-child-name">Child name</label>
              <input
                id="ref-child-name"
                required
                maxLength={120}
                value={refChildName}
                onChange={(e) => setRefChildName(e.target.value)}
              />
            </div>
            <div className="ops-field full">
              <label htmlFor="ref-instrument">Instrument</label>
              <input
                id="ref-instrument"
                required
                maxLength={120}
                value={refInstrument}
                onChange={(e) => setRefInstrument(e.target.value)}
                placeholder="e.g. Piano, Violin, Guitar"
              />
            </div>
            <div className="ops-field full">
              <label htmlFor="ref-notes">Referral notes · 5+ characters</label>
              <textarea
                id="ref-notes"
                required
                minLength={5}
                maxLength={2000}
                value={refNotes}
                onChange={(e) => setRefNotes(e.target.value)}
              />
            </div>
          </div>

          <label className="ops-check">
            <input
              type="checkbox"
              required
              checked={refConsent}
              onChange={(e) => setRefConsent(e.target.checked)}
            />
            I have permission to share these contact details with ProsperWork
            Admissions.
          </label>

          {modalError && (
            <div className="ops-alert" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
              {modalError}
            </div>
          )}
        </form>
      </PortalModal>

      {/* + Submit Media for Review Modal */}
      <PortalModal
        open={submitModalOpen}
        onClose={() => {
          if (!busy) setSubmitModalOpen(false);
        }}
        title="Submit Media for Safety Review"
        eyebrow="Media Studio"
        subtitle="Select an uploaded practice or homework file for independent safety and consent review."
        size="md"
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setSubmitModalOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-media-submit-form"
              className="ops-btn primary"
              disabled={!isActive || busy}
            >
              {busy ? "Submitting…" : "Submit for Independent Review"}
            </button>
          </>
        }
      >
        <form
          id="ops-media-submit-form"
          onSubmit={(e) => void handleMediaSubmit(e)}
        >
          <div className="ops-field">
            <label htmlFor="media-submit-file">
              Uploaded practice / homework file
            </label>
            <select
              id="media-submit-file"
              value={submitFileId}
              onChange={(e) => setSubmitFileId(e.target.value)}
              required
            >
              <option value="">Choose private media</option>
              {(data.files || []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.original_name} · {f.category}
                </option>
              ))}
            </select>
          </div>
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="media-submit-notes">
              Submission notes · 5+ characters
            </label>
            <textarea
              id="media-submit-notes"
              value={submitNotes}
              onChange={(e) => setSubmitNotes(e.target.value)}
              minLength={5}
              maxLength={2000}
              required
              placeholder="Describe the recording and intended promotional use…"
            />
          </div>
          {modalError && (
            <div className="ops-alert" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
              {modalError}
            </div>
          )}
        </form>
      </PortalModal>

      {/* Per-card Review (Approve / Reject) Modal */}
      <PortalModal
        open={Boolean(reviewTarget)}
        onClose={() => {
          if (!busy) setReviewTarget(null);
        }}
        title="Review Media Submission"
        eyebrow="Independent Safety Review"
        subtitle={
          reviewTarget
            ? `Student: ${studentLabelFor(reviewTarget.student_id)}`
            : undefined
        }
        size="md"
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setReviewTarget(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-media-review-form"
              className={reviewApprove ? "ops-btn primary" : "ops-btn danger"}
              disabled={
                !isActive ||
                !reviewSafe ||
                reviewNotes.trim().length < 5 ||
                busy
              }
            >
              {busy
                ? "Saving…"
                : reviewApprove
                ? "Approve Media"
                : "Reject Media"}
            </button>
          </>
        }
      >
        <form
          id="ops-media-review-form"
          onSubmit={(e) => void handleMediaReview(e)}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              className={`portal-tab ${reviewApprove ? "active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setReviewApprove(true)}
            >
              Approve
            </button>
            <button
              type="button"
              className={`portal-tab ${!reviewApprove ? "active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setReviewApprove(false)}
            >
              Reject
            </button>
          </div>

          <label className="ops-check" style={{ marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={reviewSafe}
              onChange={(e) => setReviewSafe(e.target.checked)}
              required
            />
            I checked child safety, active guardian permission, and suitability
            for public sharing.
          </label>

          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="media-review-notes">
              Review decision notes · 5+ characters
            </label>
            <textarea
              id="media-review-notes"
              required
              minLength={5}
              maxLength={2000}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Record your safety and quality review observations…"
            />
          </div>

          {modalError && (
            <div className="ops-alert" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
              {modalError}
            </div>
          )}
        </form>
      </PortalModal>

      {/* Per-card Record Publication Modal */}
      <PortalModal
        open={Boolean(publishTarget)}
        onClose={() => {
          if (!busy) setPublishTarget(null);
        }}
        title="Record Publication"
        eyebrow="Social Media Broadcast"
        subtitle={
          publishTarget
            ? `Student: ${studentLabelFor(publishTarget.student_id)}`
            : undefined
        }
        size="sm"
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setPublishTarget(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-media-publish-form"
              className="ops-btn primary"
              disabled={
                !isActive ||
                !publishUrl.startsWith("https://") ||
                publishNotes.trim().length < 5 ||
                busy
              }
            >
              {busy ? "Recording…" : "Record Publication"}
            </button>
          </>
        }
      >
        <form
          id="ops-media-publish-form"
          onSubmit={(e) => void handleMediaPublish(e)}
        >
          <div className="ops-field">
            <label htmlFor="media-publish-url">Published HTTPS URL</label>
            <input
              id="media-publish-url"
              type="url"
              required
              value={publishUrl}
              onChange={(e) => setPublishUrl(e.target.value)}
              placeholder="https://instagram.com/p/…"
            />
          </div>
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="media-publish-notes">
              Publication note · 5+ characters
            </label>
            <textarea
              id="media-publish-notes"
              required
              minLength={5}
              maxLength={2000}
              value={publishNotes}
              onChange={(e) => setPublishNotes(e.target.value)}
              placeholder="Channel and publication date…"
            />
          </div>
          {modalError && (
            <div className="ops-alert" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
              {modalError}
            </div>
          )}
        </form>
      </PortalModal>

      {/* Per-card Withdraw Permission Modal */}
      <PortalModal
        open={Boolean(withdrawTarget)}
        onClose={() => {
          if (!busy) setWithdrawTarget(null);
        }}
        title="Withdraw Media Permission"
        eyebrow="Revoke Access"
        subtitle={
          withdrawTarget
            ? `Student: ${studentLabelFor(withdrawTarget.student_id)}`
            : undefined
        }
        size="sm"
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setWithdrawTarget(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-media-withdraw-form"
              className="ops-btn danger"
              disabled={!isActive || withdrawNotes.trim().length < 5 || busy}
            >
              {busy ? "Withdrawing…" : "Withdraw Permission"}
            </button>
          </>
        }
      >
        <form
          id="ops-media-withdraw-form"
          onSubmit={(e) => void handleMediaWithdraw(e)}
        >
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>
            Withdrawing permission immediately blocks new portal previews and
            downloads. Any already-published external posts require separate
            takedown.
          </p>
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="media-withdraw-notes">
              Withdrawal reason · 5+ characters
            </label>
            <textarea
              id="media-withdraw-notes"
              required
              minLength={5}
              maxLength={2000}
              value={withdrawNotes}
              onChange={(e) => setWithdrawNotes(e.target.value)}
              placeholder="Explain why sharing permission is being withdrawn…"
            />
          </div>
          {modalError && (
            <div className="ops-alert" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
              {modalError}
            </div>
          )}
        </form>
      </PortalModal>
    </>
  );
}
