"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "@/lib/types";
import { labelFor, type Account, type AccountStatus } from "./accounts-types";
import { AccountIcon } from "./components/AccountIcon";
import AccountInviteForm from "./components/AccountInviteForm";
import AccountList from "./components/AccountList";
import AccountModals from "./components/AccountModals";

/**
 * ============================================================================
 * PROSPERWORK MUSIC ACADEMY - ACCOUNTS DIRECTORY
 * ============================================================================
 * Super Admin restricted account directory and identity management:
 * 1. Directory inspection with real-time text query filtering.
 * 2. New account invitations with workspace role delegation and timezone binding.
 * 3. Lifecycle status transitions (Active, Paused, On Leave, Restricted).
 * 4. Audit-guarded permanent account purge with blocker detection.
 * 5. Impersonation ("View As User") for debugging and parental assistance.
 */
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusChange, setStatusChange] = useState<{
    account: Account;
    next: AccountStatus;
  } | null>(null);
  const [viewAsPendingId, setViewAsPendingId] = useState<string | null>(null);

  const startViewAs = async (target: Account) => {
    setViewAsPendingId(String(target.id));
    setMutationError("");
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "view_as",
          targetId: String(target.id),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to switch view.");
      if (target.status === "pending") {
        window.location.assign("/access-pending");
      } else if (["parent", "student"].includes(target.role)) {
        window.location.assign("/onboarding");
      } else {
        window.location.assign("/");
      }
    } catch (err) {
      setMutationError(
        err instanceof Error ? err.message : "Unable to switch view."
      );
      setViewAsPendingId(null);
    }
  };

  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleResendInvite = async (target: Account) => {
    if (!target.email) return;
    setResendingId(String(target.id));
    setMutationError("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_invite", id: target.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to resend invitation.");
      }
      setSuccessMessage(data.message || `Invitation email resent to ${target.name} (${target.email}).`);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to resend invitation.");
    } finally {
      setResendingId(null);
    }
  };

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const response = await fetch("/api/accounts", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) setAuthorized(false);
        throw new Error(
          data.error ||
            (response.status === 403
              ? "This area is restricted to active Super Admin accounts."
              : "We couldn’t load the account directory.")
        );
      }
      if (!Array.isArray(data.accounts))
        throw new Error(
          "The account directory returned an unexpected response."
        );
      setAccounts(data.accounts as Account[]);
      setAuthorized(true);
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : "We couldn’t load the account directory."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const visibleAccounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return accounts;
    return accounts.filter((account) =>
      [
        account.name,
        account.email,
        account.username,
        account.role,
        account.status,
        account.timezone,
      ].some((value) => value?.toLowerCase().includes(normalized))
    );
  }, [accounts, query]);

  async function handleInvite(accountData: {
    name: string;
    email: string;
    role: Exclude<Role, "super_admin">;
    timezone: string;
  }): Promise<boolean> {
    setMutationError("");
    setSuccessMessage("");
    setInvitePending(true);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          account: accountData,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error || result.ok !== true) {
        throw new Error(
          result.error || "The invitation was not confirmed. Please try again."
        );
      }
      setSuccessMessage(`Invitation sent to ${accountData.email}.`);
      await loadAccounts();
      return true;
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "We couldn’t send the invitation."
      );
      return false;
    } finally {
      setInvitePending(false);
    }
  }

  async function applyStatusChange() {
    if (!statusChange || statusChange.account.role === "super_admin") return;
    setMutationError("");
    setSuccessMessage("");
    setStatusPending(true);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          id: statusChange.account.id,
          status: statusChange.next,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error || result.ok !== true) {
        throw new Error(
          result.error ||
            "The status change was not confirmed. Please try again."
        );
      }
      setSuccessMessage(
        `${statusChange.account.name} is now marked ${labelFor(
          statusChange.next
        )}.`
      );
      setStatusChange(null);
      await loadAccounts();
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "We couldn’t update this account."
      );
    } finally {
      setStatusPending(false);
    }
  }

  useEffect(() => {
    if (!statusChange) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !statusPending) {
        setStatusChange(null);
        setMutationError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [statusChange, statusPending]);

  const activeCount = accounts.filter(
    (account) => account.status === "active"
  ).length;
  const nonActiveCount = accounts.length - activeCount;

  return (
    <main className="pw-accounts-page">
      <div className="pw-accounts-topline" />

      <div className="pw-accounts-content">
        <div className="pw-page-intro">
          <div>
            <h1>Account directory</h1>
          </div>
          <div className="pw-owner-seal">
            <AccountIcon type="shield" />
            <span>
              OWNER ACCESS
              <br />
              <strong>RESTRICTED</strong>
            </span>
          </div>
        </div>

        {listError && (
          <div
            className={`pw-alert ${authorized ? "is-error" : "is-denied"}`}
            role="alert"
          >
            <div className="pw-alert-icon">
              <AccountIcon type="shield" />
            </div>
            <div className="pw-alert-copy">
              <strong>
                {authorized ? "Directory unavailable" : "Owner access required"}
              </strong>
              <p>{listError}</p>
            </div>
            <button
              type="button"
              className="pw-outline-button"
              onClick={() => void loadAccounts()}
              disabled={loading}
            >
              {loading ? "Retrying…" : "Try again"}
            </button>
          </div>
        )}

        {loading && !authorized && !listError && (
          <div
            className="pw-initial-loading"
            aria-label="Loading owner account directory"
            aria-busy="true"
          >
            <div className="pw-initial-loading-title">
              <span />
              <i />
              <i />
            </div>
            <div className="pw-initial-loading-grid">
              <div className="pw-initial-loading-form">
                <i />
                <b />
                <b />
                <b />
                <em />
              </div>
              <div className="pw-initial-loading-list">
                {[0, 1, 2].map((item) => (
                  <div key={item}>
                    <span />
                    <i />
                    <i />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {authorized && (
          <>
            <p className="pw-directory-summary" aria-live="polite">
              {loading
                ? "Loading accounts…"
                : `${accounts.length} accounts · ${activeCount} active · ${nonActiveCount} needing attention`}
            </p>

            <div className="pw-account-columns" data-portal-layout="directory">
              <AccountInviteForm
                invitePending={invitePending}
                loading={loading}
                mutationError={mutationError}
                successMessage={successMessage}
                onInvite={handleInvite}
              />

              <AccountList
                accounts={accounts}
                visibleAccounts={visibleAccounts}
                loading={loading}
                listError={listError}
                query={query}
                viewAsPendingId={viewAsPendingId}
                resendingId={resendingId}
                onQueryChange={setQuery}
                onRetry={() => void loadAccounts()}
                onStartViewAs={startViewAs}
                onResendInvite={handleResendInvite}
                onSelectStatusChange={(account, next) =>
                  setStatusChange({ account, next })
                }
              />
            </div>
          </>
        )}

        <footer className="pw-accounts-footer">
          <span>ProsperWork · Private music academy workspace</span>
          <a href="/">
            Return to workspace <span aria-hidden="true">↗</span>
          </a>
        </footer>
      </div>

      <AccountModals
        statusChange={statusChange}
        statusPending={statusPending}
        mutationError={mutationError}
        onCancelStatusChange={() => {
          setStatusChange(null);
          setMutationError("");
        }}
        onConfirmStatusChange={applyStatusChange}
      />
    </main>
  );
}
