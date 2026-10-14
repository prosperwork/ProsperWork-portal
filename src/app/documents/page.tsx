"use client";

import { useCallback, useEffect, useState } from "react";
import { FileDown, RefreshCw } from "lucide-react";

type Payment = { id: string; studentName: string; currency: string; grossAmount: number; referralDiscount: number; netAmount: number; status: string; dueDate: string };

export default function DocumentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing-documents", { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Documents could not be loaded.");
      setPayments(body.payments);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Documents could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function download(payment: Payment, kind: "invoice" | "receipt") {
    const key = `${payment.id}:${kind}`;
    setBusy(key);
    setError("");
    try {
      const response = await fetch(`/api/reports?kind=${kind}&id=${encodeURIComponent(payment.id)}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The document could not be downloaded.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `prosperwork-${kind}-${payment.id}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be downloaded.");
    } finally {
      setBusy("");
    }
  }

  return <main className="document-page">
    <header className="document-heading"><h1>Billing documents</h1>
      <button className="document-refresh" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />{loading ? "Loading" : "Refresh"}</button>
    </header>
    {error && <div className="document-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()} disabled={loading}>Retry</button></div>}
    <section className="document-ledger document-record-ledger" aria-label="Billing documents">
      {loading && !payments.length ? <div className="document-skeleton" aria-label="Loading records"><i /><i /><i /></div>
        : payments.length ? <div className="document-table-scroll"><table className="document-table"><thead><tr><th>Student / payment</th><th>Amount</th><th>Due</th><th>Status</th><th>Available files</th></tr></thead>
          <tbody>{payments.map(payment => <tr key={payment.id}>
            <td><strong>{payment.studentName}</strong><small>Invoice {payment.id.slice(0, 8)}</small></td>
             <td><strong>{payment.currency} {payment.netAmount.toFixed(2)}</strong><small>{payment.status === "paid" ? "Paid" : "Payable"}</small>{payment.referralDiscount > 0 && <small>Original: {payment.currency} {payment.grossAmount.toFixed(2)} · Discount: {payment.currency} {payment.referralDiscount.toFixed(2)}</small>}</td>
            <td>{payment.dueDate}</td>
            <td><span className={`document-status ${payment.status}`}>{payment.status.replaceAll("_", " ")}</span></td>
            <td><div className="document-actions">
              <button type="button" onClick={() => void download(payment, "invoice")} disabled={!!busy}><FileDown size={14} />{busy === `${payment.id}:invoice` ? "Preparing" : "Invoice PDF"}</button>
              {payment.status === "paid" && <button type="button" onClick={() => void download(payment, "receipt")} disabled={!!busy}><FileDown size={14} />{busy === `${payment.id}:receipt` ? "Preparing" : "Verified receipt"}</button>}
            </div></td>
          </tr>)}</tbody></table></div>
        : <div className="document-empty"><strong>No billing documents</strong><p>Documents will appear when billing records are available to this account.</p></div>}
    </section>
  </main>;
}
