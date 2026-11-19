"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { PolicyVersion } from "@/lib/academy/family";
import { readJson } from "@/lib/academy/web-client";

type OnboardingResponse = {
  profile: { id: string; name: string; role: string; status: string };
  versions: PolicyVersion[];
  acceptedIds: string[];
  setupRequired: boolean;
  missingKeys: string[];
};

type JsonResult = Record<string, unknown>;

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

  const currentVersions = useMemo(
    () =>
      (data?.versions ?? [])
        .filter((version) => version.published_at !== null)
        .slice()
        .sort((a, b) => a.key.localeCompare(b.key) || a.version - b.version),
    [data?.versions]
  );
  const currentIds = useMemo(
    () => currentVersions.map((version) => version.id),
    [currentVersions]
  );
  const acknowledgedOnServer = useMemo(
    () => new Set(data?.acceptedIds ?? []),
    [data?.acceptedIds]
  );
  const acknowledgedCount = useMemo(
    () =>
      currentIds.filter(
        (id) => acknowledgedOnServer.has(id) || checkedIds.includes(id)
      ).length,
    [currentIds, acknowledgedOnServer, checkedIds]
  );
  const allChecked = Boolean(
    !data?.setupRequired &&
      currentIds.length > 0 &&
      currentIds.every((id) => checkedIds.includes(id))
  );
  const allAccepted = Boolean(
    !data?.setupRequired &&
      currentIds.length > 0 &&
      currentIds.every((id) => acknowledgedOnServer.has(id))
  );
  const isParent =
    data?.profile.role.toLowerCase().replace(/[\s-]+/g, "_") === "parent";
  const canAccept = Boolean(
    isParent &&
      data?.profile.status.trim().toLowerCase() === "active" &&
      !data.setupRequired
  );

  const load = useCallback(async (): Promise<OnboardingResponse | null> => {
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
      const payload = result as unknown as OnboardingResponse;
      if (
        !payload.profile ||
        !Array.isArray(payload.versions) ||
        !Array.isArray(payload.acceptedIds)
      )
        throw new Error("Academy policies could not be loaded right now.");
      setData(payload);
      const ids = payload.versions
        .filter((version) => version.published_at !== null)
        .map((version) => version.id);
      setCheckedIds(ids.filter((id) => payload.acceptedIds.includes(id)));
      setStale(false);
      return payload;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Academy policies could not be loaded."
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

  const acceptCurrent = async () => {
    if (busy || !canAccept || stale || !allChecked || currentIds.length === 0)
      return;
    setBusy(true);
    setError("");
    setMessage("");
    const submittedIds = [...currentIds];
    try {
      const response = await fetch("/api/policies", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept", ids: submittedIds }),
      });
      const result = await readJson(response);
      if (response.status === 409) {
        setStale(true);
        throw new Error(
          messageFor(result, response.status) ||
            "One or more policies were updated. Please reload to review the latest versions."
        );
      }
      if (!response.ok || result.ok === false)
        throw new Error(messageFor(result, response.status));
      const refreshed = await load();
      if (!refreshed)
        throw new Error(
          "We could not verify your updated policy status. Please reload and check."
        );
      const refreshedCurrentIds = refreshed.versions
        .filter((version) => version.published_at !== null)
        .map((version) => version.id);
      const allSubmittedStillCurrent =
        submittedIds.length === refreshedCurrentIds.length &&
        submittedIds.every((id) => refreshedCurrentIds.includes(id));
      const allConfirmed =
        refreshedCurrentIds.length > 0 &&
        refreshedCurrentIds.every((id) => refreshed.acceptedIds.includes(id));
      if (!allSubmittedStillCurrent) {
        setStale(true);
        throw new Error(
          "A newer policy version was just published. Please reload to review the latest versions."
        );
      }
      if (!allConfirmed)
        throw new Error(
          "Not all policy acknowledgements were confirmed. Please reload before continuing."
        );
      setMessage(
        "Thank you! All academy policies have been acknowledged for your family account."
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Policy acknowledgement could not be saved."
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleAcknowledgement = (id: string, checked: boolean) => {
    if (acknowledgedOnServer.has(id) || stale) return;
    setCheckedIds((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((currentId) => currentId !== id)
    );
  };

  const noPublished = currentVersions.length === 0;

  return (
    <main className="pw-family">
      <div className="family-topline" />
      <section className="family-content">
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div className="family-heading">
            <div>
              <div className="family-eyebrow">
                <i /> FAMILY ONBOARDING
              </div>
              <h1>Review the academy policies</h1>
              <p>
                Please open each academy policy PDF below and check the box once
                you have reviewed it to unlock your Family Workspace.
              </p>
            </div>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => void load()}
              disabled={refreshing}
            >
              <RefreshCw size={14} aria-hidden="true" />{" "}
              {refreshing ? "Reloading…" : "Reload"}
            </button>
          </div>

          {error && (
            <div className="family-alert" role="alert">
              <AlertCircle size={16} />
              <p style={{ flex: 1 }}>{error}</p>
              {stale && (
                <button
                  className="family-button subtle"
                  type="button"
                  onClick={() => void load()}
                >
                  Reload policies
                </button>
              )}
            </div>
          )}

          {message && (
            <div className="family-alert success" role="status">
              <Check size={16} />
              <p>{message}</p>
            </div>
          )}

          {data?.setupRequired && (
            <div className="family-alert info" role="status">
              <ShieldCheck size={16} />
              <div>
                <strong>
                  {isParent
                    ? "Academy policies are being prepared"
                    : "Owner setup required — onboarding is paused"}
                </strong>
                <p>
                  {isParent
                    ? "Our administration team is finalizing the academy policy documents. You will be able to review and accept them here as soon as they are published."
                    : `An Owner must publish approved PDF documents for every required policy before families can complete onboarding. Missing: ${
                        (data.missingKeys ?? []).join(", ") ||
                        "required policies"
                      }.`}
                </p>
                {!isParent && (
                  <p>
                    <Link href="/policies">View policy setup status</Link>
                  </p>
                )}
              </div>
            </div>
          )}

          {data && !data.setupRequired && !canAccept && (
            <div className="family-alert info" role="status">
              <ShieldCheck size={16} />
              <p>
                You can read all academy policy documents below. Only an active
                Parent account can submit family acknowledgements.
              </p>
            </div>
          )}

          {loading && !data ? (
            <div className="family-card family-card-body">
              <div className="family-stack">
                <div className="family-skeleton" />
                <div className="family-skeleton" />
                <div className="family-skeleton" />
              </div>
            </div>
          ) : data && noPublished ? (
            <section
              className="family-card"
              aria-labelledby="empty-policies-title"
            >
              <div className="family-empty">
                <span className="family-empty-mark">
                  <FileText size={17} />
                </span>
                <strong id="empty-policies-title">
                  {data.setupRequired
                    ? "Academy policies are not published yet"
                    : "No academy policies to review"}
                </strong>
                <p>
                  {data.setupRequired
                    ? "No policy documents have been published yet. Please check back once the academy publishes them."
                    : "There are no policy documents requiring your review right now."}
                </p>
                {data.setupRequired && !isParent && (
                  <p>
                    <Link className="family-button subtle" href="/policies">
                      View policy setup status
                    </Link>
                  </p>
                )}
              </div>
            </section>
          ) : (
            data && (
              <section
                className="family-card"
                aria-labelledby="current-policies-title"
              >
                <div className="family-card-head">
                  <div>
                    <h2 id="current-policies-title">Academy policy checklist</h2>
                    <p>
                      Read each document and confirm your acknowledgement below.
                      Media-sharing consent is optional and managed separately
                      on your Family page.
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "4px 10px",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                      background: allAccepted ? "#dcfce7" : "#edf6f1",
                      color: allAccepted ? "#166534" : "#135b45",
                      border: `1px solid ${
                        allAccepted ? "#bbf7d0" : "#cfe4d6"
                      }`,
                    }}
                    role="status"
                  >
                    {allAccepted ? currentVersions.length : acknowledgedCount} of{" "}
                    {currentVersions.length} acknowledged
                  </span>
                </div>

                <div className="family-card-body">
                  {currentVersions.map((version) => {
                    const accepted = acknowledgedOnServer.has(version.id);
                    const checked = accepted || checkedIds.includes(version.id);
                    return (
                      <div className="family-checkbox" key={version.id}>
                        <input
                          id={`policy-ack-${version.id}`}
                          type="checkbox"
                          checked={checked}
                          disabled={!canAccept || stale || busy || accepted}
                          onChange={(event) =>
                            toggleAcknowledgement(
                              version.id,
                              event.target.checked
                            )
                          }
                        />
                        <label htmlFor={`policy-ack-${version.id}`}>
                          <strong>{version.title}</strong>
                          <small>
                            {version.key.replace(/_/g, " ")} · Version{" "}
                            {version.version}
                            {accepted
                              ? " · Acknowledged"
                              : " · Please review & check"}
                          </small>
                        </label>
                        {version.file_id ? (
                          <a
                            className="family-button"
                            href={`/api/files?id=${encodeURIComponent(
                              version.file_id
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileText size={13} /> Open PDF
                          </a>
                        ) : (
                          <span className="family-chip">PDF unavailable</span>
                        )}
                      </div>
                    );
                  })}

                  {data.setupRequired ? (
                    <div className="family-upload-note">
                      Acknowledgements will open as soon as the academy finishes
                      publishing all required policies.
                    </div>
                  ) : allAccepted ? (
                    <div
                      className="family-form-actions"
                      style={{
                        marginTop: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "#166534",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Check size={15} aria-hidden="true" /> All current
                        policies are acknowledged.
                      </span>
                      <Link
                        href="/family"
                        className="family-button primary"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>Continue to Family Workspace</span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </div>
                  ) : (
                    <div className="family-form-actions">
                      <button
                        type="button"
                        className="family-button primary"
                        onClick={() => void acceptCurrent()}
                        disabled={
                          !canAccept || !allChecked || stale || busy
                        }
                      >
                        {busy ? (
                          <>
                            <LoaderCircle size={14} /> Saving…
                          </>
                        ) : (
                          "Acknowledge all policies"
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )
          )}
        </div>
      </section>
    </main>
  );
}
