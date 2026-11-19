"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { PolicyVersion } from "@/lib/academy/family";
import { readJson } from "@/lib/academy/web-client";
import { PortalModal } from "@/app/_components/PortalModal";
import { useConfirmModal } from "@/app/_components/ConfirmModal";

type ScopedPolicyVersion = PolicyVersion & {
  audienceParentId?: string | null;
  audience_parent_id?: string | null;
};
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
const keyLabels: Record<string, string> = {
  parent_agreement: "Parent Agreement",
  terms_of_service: "Terms of Service",
  reschedule_policy: "Reschedule Policy",
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function roleKey(value: string) {
  return value.toLowerCase().replace(/[\s-]+/g, "_");
}
function messageFor(result: JsonResult, status: number) {
  if (typeof result.error === "string") return result.error;
  if (typeof result.message === "string") return result.message;
  return `The request could not be completed (${status}).`;
}
function dateLabel(value: string | null) {
  if (!value) return "Draft · not published";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
    : "Published date unavailable";
}

export default function PoliciesPage() {
  const [data, setData] = useState<PoliciesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<
    "all" | "published" | "drafts"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [draft, setDraft] = useState<DraftForm>({ key: "", title: "" });
  const [additionalKey, setAdditionalKey] = useState("");
  const [guardianAccountId, setGuardianAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pendingPolicyId, setPendingPolicyId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const { confirm, ConfirmDialog } = useConfirmModal();

  const profileRole = roleKey(data?.profile.role ?? "");
  const isOwner = profileRole === "owner" || profileRole === "super_admin";
  const canEdit = Boolean(
    isOwner && data?.profile.status.trim().toLowerCase() === "active"
  );

  const visibleVersions = useMemo(
    () =>
      (data?.versions ?? [])
        .filter((version) => isOwner || version.published_at !== null)
        .slice()
        .sort(
          (a, b) => b.version - a.version || b.created_at.localeCompare(a.created_at)
        ),
    [data?.versions, isOwner]
  );

  const counts = useMemo(() => {
    const published = visibleVersions.filter((v) => v.published_at !== null).length;
    const drafts = visibleVersions.filter((v) => v.published_at === null).length;
    return { all: visibleVersions.length, published, drafts };
  }, [visibleVersions]);

  const filteredVersions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleVersions.filter((version) => {
      if (isOwner) {
        if (statusFilter === "published" && !version.published_at) return false;
        if (statusFilter === "drafts" && version.published_at) return false;
      }
      if (q) {
        const hay = [
          version.title,
          version.key,
          version.key.replace(/_/g, " "),
          `v${version.version}`,
          `version ${version.version}`,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [visibleVersions, isOwner, statusFilter, searchQuery]);

  const load = useCallback(async (): Promise<PoliciesResponse | null> => {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/policies", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await readJson(response);
      if (response.status === 401) {
        window.location.assign("/login");
        return null;
      }
      if (!response.ok) throw new Error(messageFor(result, response.status));
      const payload = result as unknown as PoliciesResponse;
      if (
        !payload.profile ||
        !Array.isArray(payload.versions) ||
        !Array.isArray(payload.acceptedIds)
      ) {
        throw new Error("The policy response was incomplete.");
      }
      setData(payload);
      return payload;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Policy versions could not be loaded."
      );
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openModalForKey = (presetKey?: string) => {
    setFormError("");
    if (presetKey && !pendingPolicyId) {
      setDraft({
        key: presetKey,
        title: keyLabels[presetKey] ? `ProsperWork ${keyLabels[presetKey]}` : "",
      });
      setAdditionalKey("");
      setGuardianAccountId("");
      setFile(null);
    }
    setModalOpen(true);
  };

  const resetPendingDraft = () => {
    setPendingPolicyId(null);
    setDraft({ key: "", title: "" });
    setAdditionalKey("");
    setGuardianAccountId("");
    setFile(null);
    setFormError("");
  };

  const uploadDraftPdf = async (policyId: string, selectedFile: File) => {
    const form = new FormData();
    form.set("category", "policy");
    form.set("targetId", policyId);
    form.set("file", selectedFile);
    const response = await fetch("/api/files", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const result = await readJson(response);
    if (!response.ok || result.ok === false)
      throw new Error(messageFor(result, response.status));
  };

  const saveDraftAndUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    setBusy("draft");
    setFormError("");
    setMessage("");
    const extension = file?.name.toLowerCase().split(".").pop();
    if (
      !file ||
      file.size > 50 * 1024 * 1024 ||
      (file.type !== "application/pdf" && extension !== "pdf")
    ) {
      setFormError("Choose a PDF file up to 50 MiB.");
      setBusy("");
      return;
    }
    const policyKey = (
      draft.key === "__additional" ? additionalKey : draft.key
    )
      .trim()
      .toLowerCase();
    if (!/^[a-z][a-z0-9_-]{2,49}$/.test(policyKey)) {
      setFormError(
        "Choose one of the required policy keys or enter a valid additional key."
      );
      setBusy("");
      return;
    }
    if (draft.key === "__additional" && requiredKeys.includes(policyKey)) {
      setFormError(
        "Choose the matching required key from the policy picker instead."
      );
      setBusy("");
      return;
    }
    const audienceParentId = guardianAccountId.trim();
    if (audienceParentId && !uuidPattern.test(audienceParentId)) {
      setFormError(
        "Enter a valid guardian account UUID, or leave the field blank for all families."
      );
      setBusy("");
      return;
    }
    try {
      let id = pendingPolicyId;
      if (!id) {
        const response = await fetch("/api/policies", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "draft",
            key: policyKey,
            title: draft.title.trim(),
            ...(audienceParentId ? { audienceParentId } : {}),
          }),
        });
        const result = await readJson(response);
        if (!response.ok || typeof result.id !== "string")
          throw new Error(messageFor(result, response.status));
        id = result.id;
        setPendingPolicyId(id);
      }
      await uploadDraftPdf(id, file);
      const fresh = await load();
      const version = fresh?.versions.find(
        (item) => item.id === id && Boolean(item.file_id)
      );
      if (!version)
        throw new Error(
          "The PDF upload response was received, but the policy file was not confirmed in the private policy list."
        );
      setDraft({ key: "", title: "" });
      setAdditionalKey("");
      setGuardianAccountId("");
      setFile(null);
      setPendingPolicyId(null);
      setModalOpen(false);
      setMessage(
        "Draft PDF attached. It remains unpublished until the Owner approves and publishes it."
      );
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "The draft PDF could not be attached."
      );
    } finally {
      setBusy("");
    }
  };

  const executePublish = async (version: PolicyVersion) => {
    if (!canEdit || !version.file_id || version.published_at) return;
    setBusy(`publish:${version.id}`);
    setFormError("");
    setMessage("");
    try {
      const response = await fetch("/api/policies", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "publish", id: version.id }),
      });
      const result = await readJson(response);
      if (!response.ok || result.ok === false)
        throw new Error(messageFor(result, response.status));
      const fresh = await load();
      if (
        !fresh?.versions.some(
          (item) => item.id === version.id && Boolean(item.published_at)
        )
      ) {
        throw new Error(
          "The publish request returned, but this version is not marked published by the policy API. Refresh before treating it as approved."
        );
      }
      setMessage(
        `Version ${version.version} of "${version.title}" is now published and active.`
      );
    } catch (cause) {
      const errMsg =
        cause instanceof Error
          ? cause.message
          : "The policy version was not published.";
      setFormError(errMsg);
      throw new Error(errMsg);
    } finally {
      setBusy("");
    }
  };

  const requestPublish = (version: PolicyVersion) => {
    confirm({
      title: "Publish Policy Version?",
      message: `Publishing "${version.title}" (v${version.version} · ${version.key.replace(
        /_/g,
        " "
      )}) makes this legal PDF permanently immutable and active for families.\n\nIf changes are needed later, you must upload and publish a new version. Proceed?`,
      tone: "warning",
      confirmLabel: "Publish Permanently",
      onConfirm: async () => {
        await executePublish(version);
      },
    });
  };

  return (
    <main className="pw-family">
      <div className="family-topline" />
      <section className="family-content">
        <div className="family-heading">
          <div>
            <h1>Academy policies</h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="family-button subtle"
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
            >
              <RefreshCw size={14} /> Refresh
            </button>
            {canEdit && (
              <button
                className="family-button primary"
                type="button"
                onClick={() => openModalForKey()}
              >
                <Plus size={14} />
                {pendingPolicyId
                  ? "Finish Policy PDF Upload"
                  : "New Policy Version"}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="family-alert" role="alert">
            <AlertCircle size={16} />
            <p>{error}</p>
            <button
              className="family-button subtle"
              type="button"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}
        {message && (
          <div className="family-alert success" role="status">
            <Check size={16} />
            <p>{message}</p>
          </div>
        )}
        {formError && !modalOpen && (
          <div className="family-alert" role="alert">
            <AlertCircle size={16} />
            <p>{formError}</p>
          </div>
        )}
        {data && !canEdit && isOwner && (
          <div className="family-alert info" role="status">
            <ShieldCheck size={16} />
            <p>
              This Owner account is not active. Policy versions are read-only.
            </p>
          </div>
        )}

        {loading && !data ? (
          <div className="family-card family-card-body">
            <div className="family-stack" style={{ paddingTop: 18 }}>
              <div className="family-skeleton" />
              <div className="family-skeleton" />
            </div>
          </div>
        ) : (
          data && (
            <div
              className="family-grid policy-layout"
              data-portal-layout="policy-records"
              style={{ gridTemplateColumns: "1fr" }}
            >
              <section
                className="family-card family-policy-ledger"
                aria-labelledby="version-title"
              >
                <div className="family-card-head">
                  <div>
                    <h2 id="version-title">
                      {isOwner ? "Version history" : "Approved policy PDFs"}
                    </h2>
                    <p>
                      {isOwner
                        ? "Published versions stay immutable; create a new draft version to supersede an active key."
                        : "Only published, approved versions are shown here."}
                    </p>
                  </div>
                  <FileText size={17} color="#6a9d7b" aria-hidden="true" />
                </div>

                {data.setupRequired && (
                  <div className="family-card-body" style={{ paddingBottom: 8 }}>
                    <div
                      className="family-alert info"
                      role="status"
                      style={{
                        flexDirection: "column",
                        alignItems: "stretch",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                        <p style={{ margin: 0 }}>
                          Onboarding remains blocked until all required approved
                          PDF keys exist. Missing:{" "}
                          <strong>
                            {(data.missingKeys ?? [])
                              .map((k) => keyLabels[k] || k)
                              .join(", ") ||
                              "required policy versions not confirmed"}
                          </strong>
                          .
                        </p>
                      </div>
                      {canEdit && (data.missingKeys ?? []).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {data.missingKeys.map((missingKey) => (
                            <button
                              key={missingKey}
                              type="button"
                              className="family-button primary"
                              onClick={() => openModalForKey(missingKey)}
                            >
                              <Upload size={13} /> Upload{" "}
                              {keyLabels[missingKey] ||
                                missingKey.replace(/_/g, " ")}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Filter Tabs & Search Bar */}
                <div
                  className="family-card-body"
                  style={{
                    paddingBottom: 12,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  {isOwner ? (
                    <nav
                      className="portal-tabs"
                      aria-label="Policy status filters"
                      style={{ marginBottom: 0, borderBottom: 0, paddingBottom: 0 }}
                    >
                      {(
                        [
                          { id: "all", label: "All", count: counts.all },
                          {
                            id: "published",
                            label: "Published",
                            count: counts.published,
                          },
                          {
                            id: "drafts",
                            label: "Drafts",
                            count: counts.drafts,
                          },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`portal-tab ${
                            statusFilter === tab.id ? "active" : ""
                          }`}
                          onClick={() => setStatusFilter(tab.id)}
                        >
                          {tab.label}
                          <span className="portal-tab-badge">{tab.count}</span>
                        </button>
                      ))}
                    </nav>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--fam-muted)" }}>
                      {filteredVersions.length} approved document
                      {filteredVersions.length === 1 ? "" : "s"}
                    </span>
                  )}

                  <div className="search" style={{ maxWidth: 300 }}>
                    <Search size={14} />
                    <input
                      type="search"
                      placeholder="Search by title, key, or version…"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                </div>

                {filteredVersions.length ? (
                  <div className="family-card-body">
                    <div className="family-policy-list">
                      {filteredVersions.map((version) => {
                        const accepted = data.acceptedIds.includes(version.id);
                        return (
                          <article className="family-policy" key={version.id}>
                            <div>
                              <h3>{version.title}</h3>
                              <p>
                                {version.key.replace(/_/g, " ")} · Version{" "}
                                {version.version} ·{" "}
                                {dateLabel(version.published_at)}
                              </p>
                              <div className="family-policy-meta">
                                <span
                                  className={`family-chip ${
                                    version.published_at ? "published" : ""
                                  }`}
                                >
                                  {version.published_at
                                    ? "Owner published"
                                    : "Draft"}
                                </span>
                                <span className="family-chip">
                                  {version.audienceParentId ??
                                  version.audience_parent_id
                                    ? `Private family · ${
                                        version.audienceParentId ??
                                        version.audience_parent_id
                                      }`
                                    : "Global · all families"}
                                </span>
                                {version.published_at && (
                                  <span className="family-chip">
                                    {accepted
                                      ? "Accepted by this account"
                                      : "Not yet accepted"}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="family-report-actions">
                              {version.file_id && (
                                <a
                                  className="family-button"
                                  href={`/api/files?id=${encodeURIComponent(
                                    version.file_id
                                  )}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <FileText size={13} /> Open private PDF
                                </a>
                              )}
                              {canEdit && !version.published_at && (
                                <button
                                  type="button"
                                  className="family-button primary"
                                  disabled={
                                    !version.file_id ||
                                    busy === `publish:${version.id}`
                                  }
                                  onClick={() => requestPublish(version)}
                                >
                                  {busy === `publish:${version.id}` ? (
                                    <>
                                      <LoaderCircle size={14} /> Publishing…
                                    </>
                                  ) : (
                                    <>
                                      <ShieldCheck size={13} /> Publish version
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="family-empty">
                    <span className="family-empty-mark">
                      <FileText size={17} />
                    </span>
                    <strong>
                      {searchQuery || statusFilter !== "all"
                        ? "No policy versions match your filter"
                        : data.setupRequired
                        ? "Approved policy setup is required"
                        : "No approved policy PDFs yet"}
                    </strong>
                    <p>
                      {searchQuery || statusFilter !== "all"
                        ? "Try clearing your search or switching status tabs."
                        : data.setupRequired
                        ? "No approved policy versions are published. An Owner must attach and publish the academy-approved documents before onboarding can continue."
                        : isOwner
                        ? "Use New Policy Version above to upload an academy-approved PDF draft, then publish it."
                        : "The academy has not published policy PDFs for your account yet."}
                    </p>
                  </div>
                )}
              </section>
            </div>
          )
        )}
      </section>

      {/* + New Policy Version Modal */}
      <PortalModal
        open={modalOpen}
        onClose={() => {
          if (busy !== "draft") setModalOpen(false);
        }}
        title={
          pendingPolicyId
            ? "Finish Policy PDF Upload"
            : "Create New Policy Version"
        }
        eyebrow="Owner Policy Control"
        subtitle="Attach the official academy-approved PDF. Drafts remain unpublished until explicitly approved."
        size="md"
        busy={busy === "draft"}
        footer={
          <>
            {pendingPolicyId && (
              <button
                type="button"
                className="family-button subtle"
                onClick={resetPendingDraft}
                disabled={busy === "draft"}
              >
                <RotateCcw size={13} /> Reset Draft
              </button>
            )}
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setModalOpen(false)}
              disabled={busy === "draft"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-policy-form"
              className="family-button primary"
              disabled={busy === "draft"}
            >
              {busy === "draft" ? (
                <>
                  <LoaderCircle size={14} /> Saving…
                </>
              ) : pendingPolicyId ? (
                <>
                  <Upload size={14} /> Retry PDF upload
                </>
              ) : (
                <>
                  <Plus size={14} /> Create draft &amp; attach PDF
                </>
              )}
            </button>
          </>
        }
      >
        <form
          id="new-policy-form"
          onSubmit={(event) => void saveDraftAndUpload(event)}
        >
          {pendingPolicyId && (
            <div className="family-upload-note">
              Draft <code>{pendingPolicyId}</code> is already created. Retrying
              will attach the PDF to this same version rather than creating a
              duplicate draft, or click <strong>Reset Draft</strong> below to
              start fresh.
            </div>
          )}

          {formError && (
            <div className="family-inline-error" role="alert">
              {formError}
            </div>
          )}

          <div className="family-field">
            <label htmlFor="policy-key">Policy key</label>
            <select
              id="policy-key"
              required
              value={draft.key}
              onChange={(event) =>
                setDraft({ ...draft, key: event.target.value })
              }
              disabled={Boolean(pendingPolicyId)}
            >
              <option value="" disabled>
                Select a policy key
              </option>
              {requiredKeys.map((key) => (
                <option value={key} key={key}>
                  {keyLabels[key] || key} ({key})
                </option>
              ))}
              <option value="__additional">Additional policy</option>
            </select>
            <small>
              The three required keys are pinned above. Additional policies do
              not replace them.
            </small>
          </div>

          {draft.key === "__additional" && (
            <div className="family-field">
              <label htmlFor="policy-additional-key">
                Additional policy key
              </label>
              <input
                id="policy-additional-key"
                required
                minLength={3}
                maxLength={50}
                pattern="[a-z][a-z0-9_-]{2,49}"
                value={additionalKey}
                onChange={(event) =>
                  setAdditionalKey(event.target.value.toLowerCase())
                }
                disabled={Boolean(pendingPolicyId)}
                placeholder="e.g. recital_consent_policy"
              />
              <small>
                Use lowercase letters, numbers, underscores, or hyphens.
              </small>
            </div>
          )}

          {draft.key === "parent_agreement" && (
            <div className="family-field">
              <label htmlFor="policy-guardian-id">
                Guardian account ID <span>Owner-only · optional</span>
              </label>
              <input
                id="policy-guardian-id"
                type="text"
                autoComplete="off"
                value={guardianAccountId}
                onChange={(event) =>
                  setGuardianAccountId(event.target.value.trim())
                }
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                aria-describedby="policy-guardian-help"
                disabled={Boolean(pendingPolicyId)}
                placeholder="Optional UUID — leave blank for all families"
              />
              <small id="policy-guardian-help">
                Leave blank for a global agreement. Paste a specific guardian
                account UUID (from Accounts or Families) to scope this agreement
                privately to one family.
              </small>
            </div>
          )}

          <div className="family-field">
            <label htmlFor="policy-title">Document title</label>
            <input
              id="policy-title"
              required
              minLength={3}
              maxLength={150}
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
              disabled={Boolean(pendingPolicyId)}
              placeholder="e.g. ProsperWork Terms of Service (2026)"
            />
            <small>
              Use the title from the academy-approved PDF. Do not enter legal
              text here.
            </small>
          </div>

          <div className="family-field" style={{ marginBottom: 0 }}>
            <label htmlFor="policy-pdf">Policy PDF</label>
            <input
              id="policy-pdf"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <small>PDF only · maximum 50 MiB · stored privately.</small>
          </div>
        </form>
      </PortalModal>

      <ConfirmDialog />
    </main>
  );
}
