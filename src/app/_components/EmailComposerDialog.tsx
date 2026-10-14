"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Send, X } from "lucide-react";

export type PortalEmailTarget = {
  recipientType: "staff" | "family" | "lead";
  recipientId: string;
  name: string;
  email: string;
};

const senderOptions = [
  { value: "admin", label: "Admin · admin@prosperworkmusic.com" },
  { value: "admissions", label: "Admissions · admissions@prosperworkmusic.com" },
  { value: "support", label: "Support · support@prosperworkmusic.com" },
  { value: "payments", label: "Payments · payments@prosperworkmusic.com" },
  { value: "contact", label: "Contact · contact@prosperworkmusic.com" },
] as const;

function defaultSender(target: PortalEmailTarget) {
  if (target.recipientType === "lead") return "admissions";
  if (target.recipientType === "family") return "support";
  return "admin";
}

export default function EmailComposerDialog({
  target,
  onClose,
  onSent,
}: {
  target: PortalEmailTarget;
  onClose: () => void;
  onSent: () => void;
}) {
  const [fromCategory, setFromCategory] = useState<string>(defaultSender(target));
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !message.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/email/compose", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientType: target.recipientType,
          recipientId: target.recipientId,
          fromCategory,
          subject,
          message,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The email could not be sent.");
      onSent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The email could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(event) => { if (!sending && event.target === event.currentTarget) onClose(); }}>
      <section className="modal email-compose-modal" role="dialog" aria-modal="true" aria-labelledby="email-compose-title">
        <div className="modal-head">
          <div>
            <h2 id="email-compose-title">Compose email</h2>
            <p>Send through ProsperWork email. Replies go to info@prosperworkmusic.com.</p>
          </div>
          <button className="close-btn" type="button" aria-label="Close email composer" onClick={onClose} disabled={sending}><X size={16} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="portal-email-to">To</label>
              <input id="portal-email-to" value={`${target.name} <${target.email}>`} readOnly />
            </div>
            <div className="field">
              <label htmlFor="portal-email-from">From</label>
              <select id="portal-email-from" value={fromCategory} onChange={(event) => setFromCategory(event.target.value)}>
                {senderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="portal-email-subject">Subject</label>
              <input id="portal-email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} required autoFocus />
            </div>
            <div className="field full">
              <label htmlFor="portal-email-message">Message</label>
              <textarea id="portal-email-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={10000} rows={8} required />
              <small>Plain text email · {message.length}/10,000 characters</small>
            </div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={sending}>Cancel</button>
            <button type="submit" className="btn" disabled={sending || !subject.trim() || !message.trim()}>
              {sending ? <LoaderCircle size={14} className="email-send-spinner" /> : <Send size={14} />}
              {sending ? "Sending…" : "Send email"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
