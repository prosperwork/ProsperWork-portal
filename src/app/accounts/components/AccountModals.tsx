"use client";

import { labelFor, type Account, type AccountStatus } from "../accounts-types";
import { AccountIcon } from "./AccountIcon";

export interface AccountModalsProps {
  statusChange: {
    account: Account;
    next: AccountStatus;
  } | null;
  statusPending: boolean;
  mutationError?: string;
  onCancelStatusChange: () => void;
  onConfirmStatusChange: () => Promise<void>;
  accountToDelete?: Account | null;
  deletePending?: boolean;
  deleteBlockers?: string[];
  deleteReason?: string;
  onDeleteReasonChange?: (reason: string) => void;
  onCancelDelete?: () => void;
  onConfirmDelete?: () => Promise<void>;
}

export default function AccountModals({
  statusChange,
  statusPending,
  mutationError,
  onCancelStatusChange,
  onConfirmStatusChange,
  accountToDelete,
  deletePending = false,
  deleteBlockers = [],
  deleteReason = "",
  onDeleteReasonChange,
  onCancelDelete,
  onConfirmDelete,
}: AccountModalsProps) {
  return (
    <>
      {statusChange && (
        <div
          className="pw-confirm-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !statusPending)
              onCancelStatusChange();
          }}
        >
          <section
            className="pw-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="status-dialog-title"
            aria-describedby="status-dialog-description"
          >
            <div className="pw-confirm-icon">
              <AccountIcon type="shield" />
            </div>
            <div className="pw-eyebrow">Confirm account change</div>
            <h2 id="status-dialog-title">Update this account’s status?</h2>
            <p id="status-dialog-description">
              <strong>{statusChange.account.name}</strong> will be marked{" "}
              <strong>{labelFor(statusChange.next)}</strong>. This changes their
              workspace access status.
            </p>
            {mutationError && (
              <div className="pw-inline-alert error" role="alert">
                <span className="pw-alert-dot" />
                {mutationError}
              </div>
            )}
            <div className="pw-confirm-actions">
              <button
                className="pw-outline-button"
                type="button"
                autoFocus
                onClick={onCancelStatusChange}
                disabled={statusPending}
              >
                Cancel
              </button>
              <button
                className="pw-primary-button"
                type="button"
                onClick={() => void onConfirmStatusChange()}
                disabled={statusPending}
              >
                {statusPending ? "Updating…" : "Confirm status change"}
              </button>
            </div>
          </section>
        </div>
      )}

      {accountToDelete && onCancelDelete && onConfirmDelete && (
        <div
          className="pw-confirm-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletePending)
              onCancelDelete();
          }}
        >
          <section
            className="pw-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
          >
            <div className="pw-confirm-icon" style={{ background: "#fee2e2", color: "#991b1b" }}>
              <AccountIcon type="shield" />
            </div>
            <div className="pw-eyebrow" style={{ color: "#991b1b" }}>Irreversible Audit Action</div>
            <h2 id="delete-dialog-title">Permanently purge account?</h2>
            <p id="delete-dialog-description">
              Purging <strong>{accountToDelete.name}</strong> ({accountToDelete.email}) permanently removes their identity and credentials. This action is irreversible and recorded in the audit ledger.
            </p>

            {deleteBlockers.length > 0 && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  color: "#991b1b",
                  fontSize: "12px",
                  margin: "10px 0",
                  textAlign: "left",
                }}
              >
                <strong>Deletion Blocked:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
                  {deleteBlockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {deleteBlockers.length === 0 && (
              <label style={{ display: "block", textAlign: "left", margin: "12px 0", fontSize: "12px" }}>
                <span style={{ fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                  Audit Reason (optional)
                </span>
                <input
                  type="text"
                  maxLength={500}
                  placeholder="e.g. Test account duplicate cleanup"
                  value={deleteReason}
                  onChange={(e) => onDeleteReasonChange?.(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "12px",
                  }}
                />
              </label>
            )}

            {mutationError && (
              <div className="pw-inline-alert error" role="alert">
                <span className="pw-alert-dot" />
                {mutationError}
              </div>
            )}

            <div className="pw-confirm-actions">
              <button
                className="pw-outline-button"
                type="button"
                autoFocus
                onClick={onCancelDelete}
                disabled={deletePending}
              >
                Cancel
              </button>
              {deleteBlockers.length === 0 && (
                <button
                  className="pw-primary-button"
                  type="button"
                  style={{ background: "#dc2626", borderColor: "#b91c1c" }}
                  onClick={() => void onConfirmDelete()}
                  disabled={deletePending}
                >
                  {deletePending ? "Purging…" : "Permanently Purge"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
