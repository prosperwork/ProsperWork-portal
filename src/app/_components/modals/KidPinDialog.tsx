"use client";

import { useState } from "react";
import { LockKeyhole, X } from "lucide-react";

export default function KidPinDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  return (
    <div className="overlay">
      <section
        className="modal pin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="pin-title">Parent check</h2>
            <p>Enter the family PIN to open Kid Mode.</p>
          </div>
          <button className="close-btn" aria-label="Cancel" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(pin);
          }}
        >
          <div className="field">
            <label htmlFor="kid-pin">Family PIN</label>
            <input
              id="kid-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              required
              minLength={4}
              maxLength={8}
            />
          </div>
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn" type="submit">
              <LockKeyhole size={14} />
              Unlock
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
