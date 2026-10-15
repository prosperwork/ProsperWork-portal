"use client";

import ProfileAvatar from "@/app/_components/ProfileAvatar";
import {
  accountStatuses,
  labelFor,
  type Account,
  type AccountStatus,
} from "../accounts-types";
import { AccountIcon } from "./AccountIcon";

export interface AccountListProps {
  accounts: Account[];
  visibleAccounts: Account[];
  loading: boolean;
  listError: string;
  query: string;
  viewAsPendingId: string | null;
  resendingId?: string | null;
  onQueryChange: (query: string) => void;
  onRetry: () => void;
  onStartViewAs: (target: Account) => Promise<void>;
  onResendInvite?: (target: Account) => Promise<void> | void;
  onSelectStatusChange: (account: Account, next: AccountStatus) => void;
  onRequestDelete?: (account: Account) => void;
}

export default function AccountList({
  accounts,
  visibleAccounts,
  loading,
  listError,
  query,
  viewAsPendingId,
  resendingId,
  onQueryChange,
  onRetry,
  onStartViewAs,
  onResendInvite,
  onSelectStatusChange,
}: AccountListProps) {
  return (
    <section
      className="pw-directory-card pw-record-ledger"
      aria-labelledby="directory-title"
    >
      <div className="pw-directory-heading">
        <div>
          <div className="pw-eyebrow">Workspace access</div>
          <h2 id="directory-title">People &amp; accounts</h2>
        </div>
        <span className="pw-record-count">
          {loading
            ? "…"
            : `${visibleAccounts.length} ${
                visibleAccounts.length === 1 ? "record" : "records"
              }`}
        </span>
      </div>
      <label className="pw-search">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle
            cx="8.8"
            cy="8.8"
            r="5.7"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="m13 13 4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="search"
          aria-label="Search accounts"
          placeholder="Search name, email, username or role"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>

      {loading ? (
        <div
          className="pw-account-skeletons"
          aria-label="Loading accounts"
          aria-busy="true"
        >
          {[0, 1, 2, 3].map((item) => (
            <div className="pw-account-skeleton" key={item}>
              <span />
              <div>
                <i />
                <i />
              </div>
              <b />
              <em />
            </div>
          ))}
        </div>
      ) : listError ? (
        <div className="pw-directory-empty">
          <div className="pw-empty-icon">
            <AccountIcon type="people" />
          </div>
          <strong>Couldn’t load accounts</strong>
          <p>Retry the directory request to continue.</p>
          <button type="button" className="pw-text-button" onClick={onRetry}>
            Retry directory
          </button>
        </div>
      ) : visibleAccounts.length === 0 ? (
        <div className="pw-directory-empty">
          <div className="pw-empty-icon">
            <AccountIcon type="people" />
          </div>
          <strong>
            {query ? "No matching accounts" : "No accounts to show yet"}
          </strong>
          <p>
            {query
              ? "Try another name, email, username, or role."
              : "Invited families and staff will appear here."}
          </p>
          {query && (
            <button
              type="button"
              className="pw-text-button"
              onClick={() => onQueryChange("")}
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="pw-account-list">
          {visibleAccounts.map((account) => {
            const isOwner = account.role === "super_admin";
            return (
              <article
                className={`pw-account-row ${isOwner ? "is-owner" : ""}`}
                key={account.id}
              >
                <ProfileAvatar
                  profileId={String(account.id)}
                  name={account.name}
                  size={36}
                  className="pw-account-avatar"
                />
                <div className="pw-account-main">
                  <div className="pw-account-name-line">
                    <h3>{account.name}</h3>
                    {isOwner && (
                      <span className="pw-owner-badge">
                        <AccountIcon type="shield" />
                        Owner
                      </span>
                    )}
                  </div>
                  <div className="pw-account-email">{account.email}</div>
                  <div className="pw-account-meta">
                    <span className="pw-role-chip">
                      {labelFor(account.role)}
                    </span>
                    {account.username && (
                      <span className="pw-username">@{account.username}</span>
                    )}
                  </div>
                </div>
                <div className="pw-account-side">
                  <span className={`pw-status-pill status-${account.status}`}>
                    <i />
                    {labelFor(account.status)}
                  </span>
                  <span className="pw-timezone">
                    <AccountIcon type="clock" />
                    {account.timezone || "Timezone not set"}
                  </span>
                </div>
                <div
                  className="pw-account-action"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {isOwner ? (
                    <span className="pw-protected-label">Protected</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="pw-text-button"
                        style={{
                          padding: "4px 8px",
                          fontSize: "12px",
                          fontWeight: 600,
                          borderRadius: "6px",
                          border: "1px solid #cce3d8",
                          background: "#f0fdf4",
                          color: "#166534",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                        disabled={viewAsPendingId === String(account.id)}
                        onClick={() => void onStartViewAs(account)}
                        title={`View the portal exactly as ${account.name} sees it`}
                      >
                        {viewAsPendingId === String(account.id)
                          ? "Switching…"
                          : "View as user"}
                      </button>
                      {onResendInvite && account.email && (
                        <button
                          type="button"
                          className="pw-text-button"
                          style={{
                            padding: "4px 8px",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: "6px",
                            border: "1px solid #d1d5db",
                            background: "#ffffff",
                            color: "#374151",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          disabled={resendingId === String(account.id)}
                          onClick={() => void onResendInvite(account)}
                          title={`Resend invitation email to ${account.email}`}
                        >
                          {resendingId === String(account.id) ? "Sending…" : "Resend invite"}
                        </button>
                      )}
                      <label className="pw-status-select">
                        <span className="pw-visually-hidden">
                          Change status for {account.name}
                        </span>
                        <select
                          aria-label={`Choose a new status for ${account.name}`}
                          value=""
                          onChange={(event) => {
                            const next = event.target.value as AccountStatus;
                            if (next && next !== account.status)
                              onSelectStatusChange(account, next);
                            event.currentTarget.value = "";
                          }}
                        >
                          <option value="">Manage status</option>
                          {accountStatuses
                            .filter((status) => status !== account.status)
                            .map((status) => (
                              <option value={status} key={status}>
                                {labelFor(status)}
                              </option>
                            ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="pw-directory-foot">
        <span>{accounts.length} accounts in this workspace</span>
        <span>
          <i />
          Owner-managed directory
        </span>
      </div>
    </section>
  );
}
