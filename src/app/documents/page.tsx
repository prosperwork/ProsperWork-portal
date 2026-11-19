"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileDown,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
import { Empty, Pill, formatMoney, niceDate } from "../_lib/portal-formatters";
import type { Currency } from "@/lib/types";

type Payment = {
  id: string;
  studentName: string;
  currency: string;
  grossAmount: number;
  referralDiscount: number;
  netAmount: number;
  status: string;
  dueDate: string;
};

type DocFilter = "all" | "paid" | "due" | "overdue";

function formatCurrencySafe(amount: number, currency: string): string {
  try {
    return formatMoney(amount, currency as Currency);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function isPaymentOverdue(payment: Payment): boolean {
  const status = payment.status.toLowerCase();
  if (status === "paid") return false;
  if (status === "overdue") return true;
  if (!payment.dueDate) return false;
  const dueMs = Date.parse(payment.dueDate);
  if (!Number.isFinite(dueMs)) return false;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return dueMs < todayStart.getTime();
}

function paymentBucket(payment: Payment): "paid" | "overdue" | "due" {
  if (payment.status.toLowerCase() === "paid") return "paid";
  if (isPaymentOverdue(payment)) return "overdue";
  return "due";
}

export default function DocumentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing-documents", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Documents could not be loaded.");
      setPayments(Array.isArray(body.payments) ? body.payments : []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Documents could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const paidByCurrency = new Map<string, number>();
    const dueByCurrency = new Map<string, number>();
    let paidCount = 0;
    let dueCount = 0;
    let overdueCount = 0;

    for (const p of payments) {
      const bucket = paymentBucket(p);
      if (bucket === "paid") {
        paidCount += 1;
        paidByCurrency.set(
          p.currency,
          (paidByCurrency.get(p.currency) ?? 0) + p.netAmount
        );
      } else {
        dueByCurrency.set(
          p.currency,
          (dueByCurrency.get(p.currency) ?? 0) + p.netAmount
        );
        if (bucket === "overdue") overdueCount += 1;
        else dueCount += 1;
      }
    }

    const formatMap = (map: Map<string, number>) => {
      if (map.size === 0) return "None";
      return Array.from(map.entries())
        .map(([cur, amt]) => formatCurrencySafe(amt, cur))
        .join(" · ");
    };

    return {
      total: payments.length,
      paidCount,
      dueCount,
      overdueCount,
      paidSummary: formatMap(paidByCurrency),
      outstandingSummary: formatMap(dueByCurrency),
    };
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return payments.filter((payment) => {
      const bucket = paymentBucket(payment);
      if (statusFilter === "paid" && bucket !== "paid") return false;
      if (statusFilter === "due" && bucket !== "due") return false;
      if (statusFilter === "overdue" && bucket !== "overdue") return false;
      if (q) {
        const hay = [
          payment.studentName,
          payment.id,
          payment.currency,
          payment.status,
          payment.dueDate,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [payments, statusFilter, searchQuery]);

  async function download(payment: Payment, kind: "invoice" | "receipt") {
    const key = `${payment.id}:${kind}`;
    if (busyIds[key]) return;
    setBusyIds((prev) => ({ ...prev, [key]: true }));
    setError("");
    try {
      const response = await fetch(
        `/api/reports?kind=${kind}&id=${encodeURIComponent(payment.id)}`,
        { credentials: "include", cache: "no-store" }
      );
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
      setError(
        cause instanceof Error
          ? cause.message
          : "The document could not be downloaded."
      );
    } finally {
      setBusyIds((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  return (
    <main className="page-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Billing &amp; Receipts</span>
          <h1>Billing Documents</h1>
          <p className="page-subtitle">
            Download official invoices and verified payment receipts for your
            account.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="btn ghost"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="form-error"
          role="alert"
          style={{
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void load()}
            disabled={loading}
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Stat Cards */}
      <div
        className="stat-grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        <div className="card stat-card">
          <div className="stat-top">
            Total Paid
            <span
              className="stat-icon"
              style={{ background: "#d1fae5", color: "#059669" }}
            >
              <CheckCircle2 size={15} />
            </span>
          </div>
          <div
            className="stat-value"
            style={{ fontSize: 20, color: "#065f46" }}
          >
            {summary.paidSummary}
          </div>
          <div className="stat-foot">
            {summary.paidCount} verified receipt
            {summary.paidCount === 1 ? "" : "s"} available
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            Outstanding
            <span
              className="stat-icon"
              style={{ background: "#fef3c7", color: "#d97706" }}
            >
              <Clock size={15} />
            </span>
          </div>
          <div
            className="stat-value"
            style={{
              fontSize: 20,
              color: summary.overdueCount > 0 ? "#b91c1c" : "#b45309",
            }}
          >
            {summary.outstandingSummary}
          </div>
          <div className="stat-foot">
            {summary.dueCount} upcoming · {summary.overdueCount} overdue
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            Billing Records
            <span className="stat-icon">
              <FileText size={15} />
            </span>
          </div>
          <div className="stat-value" style={{ fontSize: 20 }}>
            {summary.total}
          </div>
          <div className="stat-foot">
            Invoices &amp; receipts in your scope
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <section className="card section-card">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <nav
            className="portal-tabs"
            aria-label="Filter billing documents by status"
            style={{ marginBottom: 0, borderBottom: 0, paddingBottom: 0 }}
          >
            {(
              [
                { id: "all", label: "All", count: summary.total },
                { id: "paid", label: "Paid", count: summary.paidCount },
                { id: "due", label: "Due", count: summary.dueCount },
                {
                  id: "overdue",
                  label: "Overdue",
                  count: summary.overdueCount,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`portal-tab ${
                  statusFilter === tab.id ? "active" : ""
                }`}
                onClick={() => setStatusFilter(tab.id)}
              >
                {tab.label}
                <span className="portal-tab-badge">{tab.count}</span>
              </button>
            ))}
          </nav>

          <div className="search" style={{ maxWidth: 280 }}>
            <Search size={14} />
            <input
              type="search"
              placeholder="Search student, invoice #, currency…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        {loading && !payments.length ? (
          <div className="document-skeleton" aria-label="Loading records">
            <i />
            <i />
            <i />
          </div>
        ) : filteredPayments.length ? (
          <div className="document-table-scroll">
            <table className="document-table">
              <thead>
                <tr>
                  <th>Student / Invoice</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Available Files</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => {
                  const bucket = paymentBucket(payment);
                  const invoiceKey = `${payment.id}:invoice`;
                  const receiptKey = `${payment.id}:receipt`;
                  const invoiceBusy = Boolean(busyIds[invoiceKey]);
                  const receiptBusy = Boolean(busyIds[receiptKey]);

                  return (
                    <tr key={payment.id}>
                      <td>
                        <strong>{payment.studentName}</strong>
                        <small>Invoice #{payment.id.slice(0, 8)}</small>
                      </td>
                      <td>
                        <strong>
                          {formatCurrencySafe(
                            payment.netAmount,
                            payment.currency
                          )}
                        </strong>
                        <small>
                          {payment.status === "paid" ? "Paid" : "Payable"}
                        </small>
                        {payment.referralDiscount > 0 && (
                          <small>
                            Original:{" "}
                            {formatCurrencySafe(
                              payment.grossAmount,
                              payment.currency
                            )}{" "}
                            · Discount:{" "}
                            {formatCurrencySafe(
                              payment.referralDiscount,
                              payment.currency
                            )}
                          </small>
                        )}
                      </td>
                      <td>
                        {niceDate(payment.dueDate, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td>
                        <Pill
                          tone={
                            bucket === "paid"
                              ? "green"
                              : bucket === "overdue"
                              ? "red"
                              : "amber"
                          }
                        >
                          {bucket === "overdue"
                            ? "Overdue"
                            : payment.status.replaceAll("_", " ")}
                        </Pill>
                      </td>
                      <td>
                        <div className="document-actions">
                          <button
                            type="button"
                            onClick={() => void download(payment, "invoice")}
                            disabled={invoiceBusy}
                          >
                            <FileDown size={14} />
                            {invoiceBusy ? "Preparing…" : "Invoice PDF"}
                          </button>
                          {payment.status === "paid" && (
                            <button
                              type="button"
                              onClick={() => void download(payment, "receipt")}
                              disabled={receiptBusy}
                            >
                              <FileDown size={14} />
                              {receiptBusy ? "Preparing…" : "Verified receipt"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              payments.length === 0
                ? "No billing documents"
                : "No documents match your filter"
            }
            detail={
              payments.length === 0
                ? "Documents will appear when billing records are available to this account."
                : "Try clearing your search or switching status tabs."
            }
          />
        )}
      </section>
    </main>
  );
}
