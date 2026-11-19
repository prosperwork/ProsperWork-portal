"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { PortalModal } from "@/app/_components/PortalModal";
import { clearAcademyCache } from "@/lib/storage";
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
 * 1. Directory inspection with real-time text query & role/status pill filtering.
 * 2. New account invitations via modal with workspace role delegation and timezone binding.
 * 3. Lifecycle status transitions (Active, Paused, On Leave, Restricted).
 * 4. Audit-guarded permanent account purge with blocker detection.
 * 5. Impersonation ("View As User") for debugging and parental assistance.
 */
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [statusPending, setStatusPending] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusChange, setStatusChange] = useState<{
    account: Account;
    next: AccountStatus;
  } | null>(null);
  const [viewAsPendingId, setViewAsPendingId] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteBlockers, setDeleteBlockers] = useState<string[]>([]);
  const [deleteReason, setDeleteReason] = useState("");

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
      clearAcademyCache();
      if (target.status === "pending") {
        window.location.assign(
          ["parent", "student"].includes(target.role)
            ? "/onboarding"
            : "/access-pending"
        );
      } else if (target.role === "parent") {
        window.location.assign("/family");
      } else if (target.role === "student") {
        window.location.assign("/learning");
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
      setSuccessMessage(
        data.message ||
          `Invitation email resent to ${target.name} (${target.email}).`
      );
    } catch (err) {
      setMutationError(
        err instanceof Error ? err.message : "Failed to resend invitation."
      );
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
    setInviteError("");
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
      setInviteModalOpen(false);
      await loadAccounts();
      return true;
    } catch (error) {
      setInviteError(
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
    if (
      !statusChange ||
      statusChange.account.role === "super_admin" ||
      statusChange.account.role === "owner"
    )
      return;
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

  const applyPurgeAccount = async () => {
    if (!accountToDelete) return;
    setDeletePending(true);
    setMutationError("");
    setDeleteBlockers([]);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id: accountToDelete.id,
          reason: deleteReason || "Permanent purge requested by Super Admin",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.blockers) {
        setDeleteBlockers(result.blockers);
        throw new Error(
          result.error || "Account deletion blocked by protected records."
        );
      }
      if (!response.ok || result.error || result.ok !== true) {
        throw new Error(result.error || "Unable to permanently purge account.");
      }
      setSuccessMessage(
        result.message || `${accountToDelete.name} was permanently purged.`
      );
      setAccountToDelete(null);
      setDeleteReason("");
      await loadAccounts();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Purge failed.");
    } finally {
      setDeletePending(false);
    }
  };

  useEffect(() => {
    if (!statusChange && !accountToDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (accountToDelete && !deletePending) {
        setAccountToDelete(null);
        setDeleteBlockers([]);
        setMutationError("");
      } else if (statusChange && !statusPending) {
        setStatusChange(null);
        setMutationError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [statusChange, statusPending, accountToDelete, deletePending]);

  const activeCount = accounts.filter(
    (account) => account.status === "active"
  ).length;
  const nonActiveCount = accounts.length - activeCount;

  return (
    <main className="pw-accounts-page">
      <div className="pw-accounts-topline" />

      <div className="pw-accounts-content">
        <div
          className="pw-page-intro"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1>Account directory</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {authorized && (
              <button
                type="button"
                className="pw-primary-button"
                style={{
                  width: "auto",
                  padding: "10px 16px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onClick={() => {
                  setInviteError("");
                  setInviteModalOpen(true);
                }}
              >
                <UserPlus size={15} aria-hidden="true" />
                + Invite User
              </button>
            )}
            <div className="pw-owner-seal">
              <AccountIcon type="shield" />
              <span>
                OWNER ACCESS
                <br />
                <strong>RESTRICTED</strong>
              </span>
            </div>
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
            <div
              className="pw-initial-loading-grid"
              style={{ gridTemplateColumns: "1fr" }}
            >
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

            {mutationError && !statusChange && !accountToDelete && (
              <div
                className="pw-inline-alert error"
                role="alert"
                style={{ marginBottom: 14 }}
              >
                <span className="pw-alert-dot" />
                {mutationError}
              </div>
            )}

            {successMessage && (
              <div
                className="pw-inline-alert success"
                role="status"
                style={{ marginBottom: 14 }}
              >
                <span className="pw-alert-dot" />
                {successMessage}
              </div>
            )}

            <div style={{ width: "100%" }} data-portal-layout="directory">
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
                onSelectStatusChange={(account, next) => {
                  setMutationError("");
                  setStatusChange({ account, next });
                }}
                onRequestDelete={(account) => {
                  setMutationError("");
                  setDeleteBlockers([]);
                  setDeleteReason("");
                  setAccountToDelete(account);
                }}
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

      <PortalModal
        open={inviteModalOpen}
        onClose={() => {
          setInviteModalOpen(false);
          setInviteError("");
        }}
        eyebrow="Bring someone in"
        title="Invite an account"
        subtitle="Send a secure invitation and assign the right workspace role."
        size="md"
        busy={invitePending}
      >
        <AccountInviteForm
          invitePending={invitePending}
          loading={loading}
          inviteError={inviteError}
          onCancel={() => {
            setInviteModalOpen(false);
            setInviteError("");
          }}
          onInvite={handleInvite}
        />
      </PortalModal>

      <AccountModals
        statusChange={statusChange}
        statusPending={statusPending}
        mutationError={mutationError}
        onCancelStatusChange={() => {
          setStatusChange(null);
          setMutationError("");
        }}
        onConfirmStatusChange={applyStatusChange}
        accountToDelete={accountToDelete}
        deletePending={deletePending}
        deleteBlockers={deleteBlockers}
        deleteReason={deleteReason}
        onDeleteReasonChange={setDeleteReason}
        onCancelDelete={() => {
          setAccountToDelete(null);
          setDeleteBlockers([]);
          setMutationError("");
        }}
        onConfirmDelete={applyPurgeAccount}
      />
    </main>
  );
}
