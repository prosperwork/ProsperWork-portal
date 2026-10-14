"use client";

import { useCallback, useEffect, useState } from "react";
import { hiringRoles } from "../../lib/academy/hiring";

type Profile = {
  id: string | number;
  name: string;
  email: string;
  role: string;
  status: string;
  timezone: string;
  impersonated?: boolean;
};

function BrandMark() {
  return (
    <span className="auth-brand-mark" aria-hidden="true">
      <img src="/favicon-192x192.png" alt="" width={36} height={36} />
    </span>
  );
}

export default function AccessPendingPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const hiringApplicant = Boolean(
    profile?.status === "applicant" &&
      hiringRoles.includes(profile.role as (typeof hiringRoles)[number])
  );

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "We couldn’t check your access status.");
      if (!data.profile) {
        window.location.replace("/login");
        return;
      }
      setProfile(data.profile);
      setCheckedAt(new Date());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We couldn’t check your access status."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function exitViewAs() {
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exit_view_as" }),
      });
      if (res.ok) {
        window.location.assign("/accounts");
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error)
        throw new Error(
          data.error || "Sign out did not complete. Please try again."
        );
      window.location.assign("/login");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Sign out did not complete. Please try again."
      );
      setPending(false);
    }
  }

  return (
    <main className="auth-root">
      <div className="auth-noise" aria-hidden="true" />
      <a
        className="auth-brand auth-login-brand"
        href="/login"
        aria-label="ProsperWork"
      >
        <BrandMark />
        <span className="auth-brand-copy">
          <span className="auth-brand-name">ProsperWork</span>
          <span className="auth-brand-caption">Music Concepts</span>
        </span>
      </a>
      <div className="auth-layout auth-login-layout">
        <section className="auth-main auth-login-main">
          <div className="auth-panel pending-panel">
            <a
              className="auth-mobile-brand"
              href="/login"
              aria-label="ProsperWork"
            >
              <BrandMark />
              <span className="auth-brand-copy">
                <span className="auth-brand-name">ProsperWork</span>
                <span className="auth-brand-caption">Music Concepts</span>
              </span>
            </a>
            <div className="pending-symbol" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 7v5l3.5 2M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <header className="auth-panel-heading">
              <div className="auth-overline">Account access</div>
              <h2>
                {hiringApplicant
                  ? "Your applicant account is in review."
                  : "We’re getting your space ready."}
              </h2>
              <p>
                {hiringApplicant
                  ? "Use the private onboarding link below to review current academy documents and record your own acceptance. Staff access remains unavailable until the Owner activates your account."
                  : "Your account is waiting for activation by the ProsperWork team. Once approved, you’ll be able to see your lessons and family records here."}
              </p>
            </header>
            {error && (
              <div className="auth-feedback error" role="alert">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M10 6v4m0 3h.01M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}
            <div className="pending-status" role="status">
              <span className="pending-status-dot" />
              {loading
                ? "Checking your account…"
                : profile?.status
                ? `Current status: ${profile.status.replace(/[_-]/g, " ")}`
                : "Activation pending"}
            </div>
            <div className="pending-details">
              <div className="pending-detail">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M4 6.5 10 11l6-4.5M5 4h10a1 1 0 0 1 1 1v10H4V5a1 1 0 0 1 1-1Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  {profile?.email ? (
                    <>
                      We’ll connect this workspace to{" "}
                      <span className="auth-pending-email">
                        {profile.email}
                      </span>
                      .
                    </>
                  ) : (
                    "Your account is signed in and awaiting staff review."
                  )}
                </span>
              </div>
              <div className="pending-detail">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M10 2.5 4 5v4.5c0 3.3 2.2 6.1 6 8 3.8-1.9 6-4.7 6-8V5l-6-2.5Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <path
                    d="m7.5 9.8 1.6 1.6 3.5-3.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  {hiringApplicant
                    ? "Applicant accounts have no staff permissions. The Owner activates the profile only after the hiring handoff is complete."
                    : "For your family’s privacy, staff verify every account before opening access to student information."}
                </span>
              </div>
            </div>
            <div className="pending-actions">
              {hiringApplicant && (
                <a className="auth-submit" href="/hiring">
                  Continue private applicant onboarding
                </a>
              )}
              <button
                className="auth-submit"
                type="button"
                onClick={() => void refreshStatus()}
                disabled={loading || pending}
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M16.3 8A6.5 6.5 0 0 0 5 5.3L3.5 7M3.5 7V3.8M3.5 7h3.2M3.7 12a6.5 6.5 0 0 0 11.3 2.7l1.5-1.7m0 0v3.2m0-3.2h-3.2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {loading ? "Checking…" : "Refresh access status"}
              </button>
              {profile?.impersonated && (
                <button
                  className="auth-submit"
                  type="button"
                  style={{ background: "#b45309", borderColor: "#b45309" }}
                  onClick={() => void exitViewAs()}
                  disabled={pending}
                >
                  Exit Preview &amp; Return to Accounts
                </button>
              )}
              <button
                className="auth-secondary"
                type="button"
                onClick={() => void signOut()}
                disabled={pending}
              >
                {pending ? "Signing out…" : "Sign out"}
              </button>
            </div>
            {checkedAt && (
              <p className="auth-status-meta">
                Last checked at{" "}
                {checkedAt.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
