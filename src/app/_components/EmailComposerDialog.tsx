"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Send, X } from "lucide-react";
import { ACADEMY_EMAILS } from "@/lib/email/config";

export type PortalEmailTarget = {
  recipientType: "staff" | "family" | "lead";
  recipientId: string;
  name: string;
  email: string;
};

const senderOptions = [
  { value: "admissions", label: `Admissions · ${ACADEMY_EMAILS.communications.admissions}` },
  { value: "support", label: `Support · ${ACADEMY_EMAILS.communications.support}` },
  { value: "students", label: `Students · ${ACADEMY_EMAILS.communications.students}` },
  { value: "registration", label: `Registration · ${ACADEMY_EMAILS.communications.registration}` },
  { value: "fees", label: `Fees & Tuition · ${ACADEMY_EMAILS.communications.fees}` },
  { value: "contact", label: `General Communications · ${ACADEMY_EMAILS.communications.primary}` },
  { value: "admin", label: `Administration · ${ACADEMY_EMAILS.adminTech.admin}` },
  { value: "finance", label: `Finance · ${ACADEMY_EMAILS.adminTech.finance}` },
  { value: "billing", label: `Billing · ${ACADEMY_EMAILS.adminTech.billing}` },
  { value: "technical", label: `Technical Support · ${ACADEMY_EMAILS.adminTech.tech}` },
  { value: "official", label: `Official Academy · ${ACADEMY_EMAILS.leadership.official}` },
  { value: "management", label: `Management · ${ACADEMY_EMAILS.leadership.management}` },
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
      if (!response.ok) {
        throw new Error(result.error || "The email could not be sent.");
      }
      onSent();
      onClose();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The email could not be sent.");
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
            <p>Send through official ProsperWork email. Responses route to the assigned mailbox.</p>
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
