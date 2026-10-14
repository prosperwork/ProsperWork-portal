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
  mutationError?: string;
  onCancelStatusChange: () => void;
  onConfirmStatusChange: () => Promise<void>;
}

export default function AccountModals({
  statusChange,
  statusPending,
  mutationError,
  onCancelStatusChange,
  onConfirmStatusChange,
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
    </>
  );
}
