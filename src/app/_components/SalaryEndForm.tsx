"use client";
import { useState } from "react";
type Staff = { id: string; name: string; status: string; role: string };
export default function SalaryEndForm({ staff, ends, onSaved }: { staff: Staff[]; ends: Record<string, string | null>; onSaved: () => void }) {
  const people = staff.filter(person => person.role !== "super_admin");
  const [id, setId] = useState(""), [date, setDate] = useState(""), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "salary_end", staffId: id, endDate: date || null, reason: reason.trim() }) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "The salary end date could not be saved.");
      setMessage(`Salary end date saved.${body.salaryReviewNeeded ? ` Review ${body.salaryReviewNeeded} existing unpaid statement(s); recorded amounts were not changed.` : ""}`);
      setReason(""); onSaved();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "The change could not be saved."); }
    finally { setBusy(false); }
  }
  return <section className="pr-card"><header className="pr-card-head"><div><h2>Recurring salary end date</h2><p>Last paid day is inclusive. Fixed pay is prorated through this date; verified lesson earnings and recorded statements are preserved. Leave alone does not end pay.</p></div></header><form className="pr-card-body" onSubmit={save}><div className="pr-form-grid">
    <label className="pr-field">Staff member<select required value={id} onChange={event => { setId(event.target.value); setDate(ends[event.target.value] || ""); setMessage(""); }}><option value="">Select staff</option>{people.map(person => <option key={person.id} value={person.id}>{person.name} · {person.status}</option>)}</select></label>
    <label className="pr-field">Last paid day<input type="date" value={date} onChange={event => setDate(event.target.value)} /><small>Leave blank to resume recurring pay for an active account.</small></label>
    <label className="pr-field full">Reason<textarea required minLength={5} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
  </div>{message && <p role="status">{message}</p>}<div className="pr-actions"><button className="pr-button primary" disabled={busy || !id || reason.trim().length < 5}>{busy ? "Saving…" : "Save salary end date"}</button></div></form></section>;
}
