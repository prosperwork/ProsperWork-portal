"use client";

import { useEffect, useState } from "react";
import { labelFor, type Account, type AccountStatus } from "../accounts-types";
import { AccountIcon } from "./AccountIcon";

export interface AccountModalsProps {
  statusChange: {
    account: Account;
    next: AccountStatus;
  } | null;
  statusPending: boolean;
  onCancelStatusChange: () => void;
  onConfirmStatusChange: () => Promise<void>;

  accountToDelete: Account | null;
  deletePending: boolean;
  deleteBlockers: string[] | null;
  mutationError: string;
  onCancelDelete: () => void;
  onConfirmDelete: (reason: string) => Promise<void>;
}

export default function AccountModals({
  statusChange,
  statusPending,
  onCancelStatusChange,
  onConfirmStatusChange,
  accountToDelete,
  deletePending,
  deleteBlockers,
  mutationError,
  onCancelDelete,
  onConfirmDelete,
}: AccountModalsProps) {
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  useEffect(() => {
    if (!accountToDelete) {
      setDeleteConfirmation("");
      setDeleteReason("");
    }
  }, [accountToDelete]);

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
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)"
                )
              );
              const first = buttons[0];
              const last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
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

      {accountToDelete && (
        <div
          className="pw-confirm-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletePending) {
              onCancelDelete();
            }
          }}
        >
          <section
            className="pw-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            style={{ maxWidth: "520px" }}
          >
            <div
              className="pw-confirm-icon"
              style={{ background: "#fef2f2", color: "#b91c1c" }}
            >
              <AccountIcon type="shield" />
            </div>
            <div className="pw-eyebrow" style={{ color: "#b91c1c" }}>
              Controlled Permanent Deletion · Owner Only
            </div>
            <h2 id="delete-dialog-title">Permanently purge this account?</h2>
            <p id="delete-dialog-description">
              You are about to irreversibly delete the account for{" "}
              <strong>{accountToDelete.name}</strong> ({accountToDelete.email},{" "}
              <em>{labelFor(accountToDelete.role)}</em>).
            </p>

            <div
              style={{
                fontSize: "12px",
                lineHeight: "1.5",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "#991b1b",
                marginBottom: "14px",
              }}
            >
              <strong>Safeguard policy:</strong> If this account is linked to
              verified lesson attendance, completed classes, invoices, payments,
              or payroll history, the database will refuse permanent deletion to
              protect historical audit records. In such cases, use{" "}
              <strong>Restricted</strong> or <strong>Paused</strong> status
              instead.
            </div>

            {deleteBlockers && deleteBlockers.length > 0 && (
              <div
                className="pw-inline-alert error"
                role="alert"
                style={{ marginBottom: "14px", textAlign: "left" }}
              >
                <span className="pw-alert-dot" />
                <div>
                  <strong>Deletion Blocked by Historical Records:</strong>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    {deleteBlockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {mutationError && (
              <div
                className="pw-inline-alert error"
                role="alert"
                style={{ marginBottom: "14px" }}
              >
                <span className="pw-alert-dot" />
                {mutationError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "16px",
                textAlign: "left",
              }}
            >
              <label
                style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}
              >
                Audited Reason for Deletion
                <input
                  type="text"
                  placeholder="e.g. Test account cleanup / applicant withdrawal"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: "4px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    boxSizing: "border-box",
                  }}
                  disabled={deletePending}
                />
              </label>

              <label
                style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}
              >
                Type <code>DELETE</code> to confirm
                <input
                  type="text"
                  placeholder="DELETE"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: "4px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    boxSizing: "border-box",
                  }}
                  disabled={deletePending}
                />
              </label>
            </div>

            <div className="pw-confirm-actions">
              <button
                className="pw-outline-button"
                type="button"
                onClick={onCancelDelete}
                disabled={deletePending}
              >
                Cancel
              </button>
              <button
                className="pw-primary-button"
                type="button"
                style={{ background: "#dc2626", borderColor: "#b91c1c" }}
                onClick={() => void onConfirmDelete(deleteReason)}
                disabled={
                  deletePending ||
                  deleteConfirmation.trim().toUpperCase() !== "DELETE"
                }
              >
                {deletePending ? "Purging…" : "Purge Account Permanently"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
