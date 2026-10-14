"use client";
import { useState, useMemo, type FormEvent } from "react";
import { operationsAction } from "@/lib/academy/operations";
type Rules = {
  tax_percent?: number;
  finance_profit?: boolean;
  referral_percent?: number;
};
export type ExtrasStudent = { id: string; payload: Record<string, unknown> };
export type ExtrasData = {
  profile: { role: string; id: string; status: string };
  settings: Rules | Rules[] | null;
  files: { id: string; original_name: string; category: string }[];
  referrals: { id: string; lead_id: string; created_at: string }[];
  credits: {
    id: string;
    amount: number;
    remaining: number;
    currency: string;
  }[];
  media: {
    id: string;
    student_id: string;
    status: string;
    notes: string;
    submitted_by: string;
    published_url: string | null;
  }[];
};

export default function OperationsExtras({
  data,
  students = [],
  view,
}: {
  data: ExtrasData;
  students?: ExtrasStudent[];
  view: "referrals" | "media";
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [file, setFile] = useState(""),
    [safe, setSafe] = useState(false),
    [url, setUrl] = useState(""),
    [downloadProgress, setDownloadProgress] = useState("");
  const rules = Array.isArray(data.settings) ? data.settings[0] : data.settings;
  const [percent, setPercent] = useState(String(rules?.referral_percent ?? 0));
  const r = data.profile.role,
    owner = r === "super_admin",
    guardian = ["parent", "student"].includes(r),
    reviewer = ["super_admin", "qc", "admin", "head_admin"].includes(r),
    isSocial = r === "social_media" || owner;

  async function submit(body: unknown) {
    const parsed = operationsAction.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await res.json();
      if (!res.ok) throw Error(result.error || "The workflow is blocked.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  }

  function referral(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void submit({
      action: "referral",
      parentName: form.get("parentName"),
      email: form.get("email"),
      phone: form.get("phone"),
      childName: form.get("childName"),
      instrument: form.get("instrument"),
      contactConsent: form.get("consent") === "on",
      notes: form.get("notes"),
    });
  }

  // Approved, consented media items for compilation and bulk download
  const approvedMedia = useMemo(() => {
    return (data.media || []).filter((m) => {
      if (m.status !== "approved" && m.status !== "published") return false;
      const student = students.find((s) => s.id === m.student_id);
      return student ? Boolean(student.payload.consent) : true;
    });
  }, [data.media, students]);

  // Bulk download function: triggers sequential downloads for approved media
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
      // Brief pause between browser download requests to prevent browser throttling
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    setDownloadProgress(`Completed ${approvedMedia.length} file downloads.`);
    setTimeout(() => setDownloadProgress(""), 4000);
  }

  return (
    <>
      {error && (
        <p className="ops-alert" role="alert">
          {error}
        </p>
      )}
      {view === "referrals" && (r === "parent" || owner || r === "finance") && (
        <section className="ops-card ops-extra">
          <h2>Qualifying referrals</h2>
          <p>
            Credit follows the first verified payment and applies to a future
            invoice in the same currency.
          </p>
          {owner && (
            <form
              className="ops-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit({
                  action: "finance_settings",
                  taxPercent: Number(rules?.tax_percent ?? 0),
                  financeProfit: !!rules?.finance_profit,
                  referralPercent: Number(percent),
                });
              }}
            >
              <label>
                One-time percentage of the referred child’s monthly contract fee
                (0 disables)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  required
                />
              </label>
              <button className="btn primary" disabled={busy}>
                Save referral rule
              </button>
            </form>
          )}
          {r === "parent" && (
            <form className="ops-form" onSubmit={referral}>
              <label>
                Referred parent name
                <input name="parentName" maxLength={120} required />
              </label>
              <label>
                Referred parent email
                <input name="email" type="email" required />
              </label>
              <label>
                Phone
                <input name="phone" maxLength={40} />
              </label>
              <label>
                Child name
                <input name="childName" required maxLength={120} />
              </label>
              <label>
                Instrument
                <input name="instrument" required maxLength={120} />
              </label>
              <label>
                Referral notes
                <textarea
                  name="notes"
                  required
                  minLength={5}
                  maxLength={2000}
                />
              </label>
              <label>
                <input name="consent" type="checkbox" required /> I have
                permission to share these contact details with ProsperWork
                Admissions.
              </label>
              <button className="btn primary" disabled={busy}>
                Send referral to Sales
              </button>
            </form>
          )}
          <p>{data.referrals?.length || 0} recorded referrals</p>
          {(data.credits || []).map((c) => (
            <p key={c.id}>
              Earned: {Number(c.amount).toFixed(2)} {c.currency} · remaining
              invoice credit: {Number(c.remaining).toFixed(2)} {c.currency}
            </p>
          ))}
        </section>
      )}
      {view === "media" && (
        <section className="ops-card ops-extra">
          <h2>Private media and safety review</h2>
          <p>
            Access follows current guardian consent and recorded safety review.
            Withdrawal blocks new downloads; already-published posts need
            separate removal.
          </p>

          {/* Social Media & Owner Download Gateway Panel */}
          {isSocial && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 10,
                padding: "16px 20px",
                marginBottom: 20,
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
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  >
                    Social Media Download Gateway
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "#15803d",
                      lineHeight: 1.4,
                    }}
                  >
                    {approvedMedia.length} verified practice/performance videos
                    and birthday compilations are cleared with active guardian
                    consent for promotional broadcasting.
                  </p>
                </div>
                {approvedMedia.length > 0 && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void downloadAllApproved()}
                    style={{ background: "#15803d", borderColor: "#166534" }}
                  >
                    Batch Download Cleared Media ({approvedMedia.length})
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

          {r !== "social_media" && (data.files || []).length > 0 && (
            <form
              className="ops-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit({
                  action: "media_submit",
                  fileId: file,
                  notes: reason,
                });
              }}
            >
              <label>
                Actual uploaded practice/homework file
                <select
                  value={file}
                  onChange={(e) => setFile(e.target.value)}
                  required
                >
                  <option value="">Choose private media</option>
                  {data.files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.original_name} · {f.category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Submission or next-action reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={5}
                  maxLength={2000}
                  required
                />
              </label>
              <button className="btn primary" disabled={busy}>
                Submit for independent review
              </button>
            </form>
          )}
          {!data.files?.length &&
            !["social_media", "finance", "sales_marketing"].includes(r) && (
              <p>
                <a href="/studio">Record or upload actual practice media</a>{" "}
                before submitting it here.
              </p>
            )}
          {data.media?.length > 0 && (
            <>
              <label>
                Reason for the next review, publication or withdrawal
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={5}
                  maxLength={2000}
                />
              </label>
              {reviewer && (
                <label>
                  <input
                    type="checkbox"
                    checked={safe}
                    onChange={(e) => setSafe(e.target.checked)}
                  />{" "}
                  I checked child safety, guardian permission and suitability
                  for public sharing.
                </label>
              )}
              {(owner || r === "social_media") && (
                <label>
                  Actual published HTTPS URL
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </label>
              )}
            </>
          )}
          {(data.media || []).map((m) => {
            const student = students.find((s) => s.id === m.student_id);
            const studentLabel = student
              ? String(student.payload.name || m.student_id)
              : m.student_id;
            const hasConsent = student
              ? Boolean(student.payload.consent)
              : false;
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
                  <h3 style={{ margin: 0 }}>
                    {m.status.toUpperCase()} · {studentLabel}
                  </h3>
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
                <p style={{ marginTop: 8 }}>{m.notes}</p>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                    margin: "10px 0",
                  }}
                >
                  {m.status !== "withdrawn" && (
                    <a
                      href={"/api/media?id=" + m.id}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ops-btn"
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        textDecoration: "none",
                      }}
                    >
                      Preview media
                    </a>
                  )}
                  {m.status !== "withdrawn" && (
                    <a
                      href={"/api/media?id=" + m.id + "&download=true"}
                      className="ops-btn primary"
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        textDecoration: "none",
                      }}
                    >
                      Download file
                    </a>
                  )}
                </div>
                {m.published_url && (
                  <p>
                    <a
                      href={m.published_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {m.status === "withdrawn"
                        ? "Remove this external publication"
                        : "Published URL"}
                    </a>
                  </p>
                )}
                <div className="ops-actions">
                  {reviewer &&
                    m.status === "pending" &&
                    m.submitted_by !== data.profile.id && (
                      <>
                        <button
                          className="btn secondary"
                          disabled={busy || !safe}
                          onClick={() =>
                            void submit({
                              action: "media_review",
                              id: m.id,
                              approve: true,
                              safetyChecked: safe,
                              notes: reason,
                            })
                          }
                        >
                          Approve
                        </button>
                        <button
                          className="btn secondary"
                          disabled={busy || !safe}
                          onClick={() =>
                            void submit({
                              action: "media_review",
                              id: m.id,
                              approve: false,
                              safetyChecked: safe,
                              notes: reason,
                            })
                          }
                        >
                          Reject
                        </button>
                      </>
                    )}
                  {(owner || r === "social_media") &&
                    m.status === "approved" && (
                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() =>
                          void submit({
                            action: "media_publish",
                            id: m.id,
                            url,
                            notes: reason,
                          })
                        }
                      >
                        Record actual publication
                      </button>
                    )}
                  {(guardian || reviewer) && m.status !== "withdrawn" && (
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        void submit({
                          action: "media_withdraw",
                          id: m.id,
                          notes: reason,
                        })
                      }
                    >
                      Withdraw permission
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!data.media?.length && <p>No accessible media-review records.</p>}
        </section>
      )}
    </>
  );
}
