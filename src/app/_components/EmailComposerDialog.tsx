"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LoaderCircle, Send, X } from "lucide-react";
import { useCatalogs } from "@/lib/academy/use-academy-config";

export type PortalEmailTarget = {
  recipientType: "staff" | "family" | "lead";
  recipientId: string;
  name: string;
  email: string;
};

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
  const { config } = useCatalogs();
  const [fromCategory, setFromCategory] = useState<string>(defaultSender(target));
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const senderOptions = useMemo(() => {
    const e = config.emails;
    return [
      { value: "admissions", label: `Admissions · ${e.admissions}` },
      { value: "support", label: `Support · ${e.support}` },
      { value: "fees", label: `Fees & Tuition · ${e.fees}` },
      { value: "contact", label: `General Communications · ${e.info}` },
      { value: "admin", label: "Administration · admin@prosperworkmusic.com" },
      { value: "finance", label: `Finance · ${e.fees}` },
      { value: "technical", label: "Technical Support · tech@prosperworkmusic.com" },
      { value: "management", label: `Management · ${e.info}` },
    ];
  }, [config.emails]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sending, onClose]);

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
