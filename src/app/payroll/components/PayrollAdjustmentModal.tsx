"use client";

import { type FormEvent } from "react";
import { X } from "lucide-react";
import { type ModalState } from "../payroll-types";

export interface PayrollAdjustmentModalProps {
  modal: ModalState;
  modalReason: string;
  setModalReason: (reason: string) => void;
  modalBusy: boolean;
  pending: boolean;
  error: string;
  onClose: () => void;
  onSubmitModal: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export default function PayrollAdjustmentModal({
  modal,
  modalReason,
  setModalReason,
  modalBusy,
  pending,
  error,
  onClose,
  onSubmitModal,
}: PayrollAdjustmentModalProps) {
  if (!modal) return null;

  return (
    <div
      className="pr-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !modalBusy) onClose();
      }}
    >
      <form
        className="pr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-modal-title"
        onSubmit={onSubmitModal}
      >
        <h2 id="pr-modal-title">{modal.title}</h2>
        <p>{modal.description}</p>
        {modal.requireReason && (
          <label className="pr-field">
            <span>Written reason</span>
            <textarea
              autoFocus
              required
              minLength={3}
              value={modalReason}
              onChange={(event) => setModalReason(event.target.value)}
              placeholder="Explain this decision for the payroll record."
            />
          </label>
        )}
        {error && (
          <div className="pr-alert" role="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
        <div className="pr-modal-actions">
          <button
            type="button"
            className="pr-button outline"
            disabled={modalBusy}
            onClick={onClose}
          >
            <X size={13} />
            Cancel
          </button>
          <button
            type="submit"
            className="pr-button"
            disabled={
              pending ||
              modalBusy ||
              Boolean(modal.requireReason && !modalReason.trim())
            }
          >
            {modalBusy || pending ? "Saving…" : modal.submitLabel || "Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}
