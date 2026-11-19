"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  Banknote,
  CalendarDays,
  Clock3,
  FileCheck2,
  FileDown,
  LockKeyhole,
  Plus,
} from "lucide-react";
import { useConfirmModal } from "../ConfirmModal";
import {
  Empty,
  formatMoney,
  niceDate,
  Pill,
  SectionTitle,
  todayKey,
} from "../../_lib/portal-formatters";
import type { FormKind } from "../modals/ActionModal";
import type { AcademyData, Currency, Payment, Role } from "@/lib/types";

export default function FinanceView({
  data,
  role,
  query,
  searchBar,
  financeAccess,
  parentAccess,
  superAdmin,
  fx,
  currencyCatalog,
  headerActions,
  setPaymentStatus,
  notify,
}: {
  data: AcademyData;
  role: Role;
  query: string;
  searchBar: (placeholder: string) => ReactNode;
  financeAccess: boolean;
  parentAccess: boolean;
  superAdmin: boolean;
  fx: Record<Currency, number>;
  currencyCatalog: { code: Currency; name: string }[];
  headerActions: (label: string, kind: FormKind, icon?: ReactNode) => ReactNode;
  setPaymentStatus: (
    payment: Payment,
    status: Payment["status"]
  ) => Promise<void>;
  notify: (msg: string) => void;
}) {
  const { confirm, ConfirmDialog, busy } = useConfirmModal();
  const [downloadingKey, setDownloadingKey] = useState("");

  async function downloadBillingPdf(
    payment: Payment,
    kind: "invoice" | "receipt"
  ) {
    const key = `${payment.id}:${kind}`;
    setDownloadingKey(key);
    try {
      const response = await fetch(
        `/api/reports?kind=${kind}&id=${encodeURIComponent(payment.id)}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Could not download ${kind} PDF.`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `prosperwork-${kind}-${payment.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : `Could not download ${kind} PDF.`
      );
    } finally {
      setDownloadingKey("");
    }
  }

  const statusButton = (
    label: string,
    onClick: () => void,
    tone = "ghost",
    disabled = false
  ) => (
    <button
      type="button"
      className={`btn small ${tone}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );

  const normalizedQuery = query.trim().toLowerCase();
  const allCurrencies: Currency[] = [
    ...new Set([
      ...currencyCatalog.map((c) => c.code),
      ...data.payments.map((p) => p.currency),
      ...data.expenses.map((e) => e.currency),
    ]),
  ];
  const payments = data.payments.filter((payment) =>
    `${payment.parentName} ${payment.studentName} ${payment.status} ${payment.currency}`
      .toLowerCase()
      .includes(normalizedQuery)
  );
  const expenses = data.expenses.filter((expense) =>
    `${expense.title} ${expense.category} ${expense.currency} ${expense.date}`
      .toLowerCase()
      .includes(normalizedQuery)
  );
  const due = data.payments.filter((payment) => payment.status !== "paid");
  const overdue = due.filter((payment) => payment.dueDate < todayKey()).length;
  const dueSoon = due.filter((payment) => payment.dueDate >= todayKey()).length;

  const currencyRows = allCurrencies.map((currency) => {
    const subtotal = due
      .filter((payment) => payment.currency === currency)
      .reduce(
        (sum, payment) =>
          sum + payment.amount - (payment.referralDiscount || 0),
        0
      );
    return { currency, subtotal, rate: fx[currency] };
  });
  const nonZeroCurrencies = currencyRows.filter((row) => row.subtotal !== 0);
  const visibleCurrencyRows =
    nonZeroCurrencies.length > 0
      ? nonZeroCurrencies
      : currencyRows.some((row) => row.currency === "NGN")
      ? currencyRows.filter((row) => row.currency === "NGN")
      : currencyRows.slice(0, 1);

  return (
    <>
      <div className="toolbar">
        {searchBar("Find family, student or currency")}
        {financeAccess && (
          <>
            {headerActions("New billing record", "payment", <Plus size={14} />)}
            {headerActions(
              "Log expense",
              "expense",
              <ArrowDownRight size={14} />
            )}
          </>
        )}
      </div>
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            Overdue balances{" "}
            <span className="stat-icon">
              <Clock3 size={15} />
            </span>
          </div>
          <div className="stat-value">{overdue}</div>
          <div className="stat-foot">Respect each family's terms</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Due today & ahead{" "}
            <span className="stat-icon">
              <CalendarDays size={15} />
            </span>
          </div>
          <div className="stat-value">{dueSoon}</div>
          <div className="stat-foot">Upcoming payment records</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Receipt review{" "}
            <span className="stat-icon">
              <FileCheck2 size={15} />
            </span>
          </div>
          <div className="stat-value">
            {
              data.payments.filter(
                (payment) => payment.status === "receipt_uploaded"
              ).length
            }
          </div>
          <div className="stat-foot">Awaiting finance verification</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Recorded expenses{" "}
            <span className="stat-icon">
              <Banknote size={15} />
            </span>
          </div>
          <div className="stat-value">{data.expenses.length}</div>
          <div className="stat-foot">Tax/category notes retained</div>
        </div>
      </div>
      {superAdmin && (
        <section className="card section-card" style={{ marginBottom: 15 }}>
          <SectionTitle
            title="Currency subtotals · executive view"
            detail="Source-currency totals are recorded amounts. Foreign-currency conversions require configured rates."
          />
          <div className="split-cards">
            {visibleCurrencyRows.map(({ currency, subtotal, rate }) => (
              <div className="metric-row" key={currency}>
                <span>{currency} outstanding</span>
                <strong>
                  {formatMoney(subtotal, currency)} ·{" "}
                  {currency === "NGN"
                    ? "Native currency"
                    : Number.isFinite(rate)
                    ? `${formatMoney(subtotal * rate, "NGN")} eq.`
                    : "NGN rate not configured"}
                </strong>
              </div>
            ))}
          </div>
          <div className="locked" style={{ marginTop: 10 }}>
            <LockKeyhole size={15} /> Profit and margin remain available only to
            Super Admin.
          </div>
        </section>
      )}
      <section className="card section-card">
        <SectionTitle
          title={
            parentAccess
              ? "Family billing & terms"
              : "Billing and receipt ledger"
          }
          detail="Upfront and after-service terms · referral discounts retained · receipt verification auditable."
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Family / student</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Terms & referral</th>
                <th>Receipt / state</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <strong>{payment.parentName}</strong>
                    <div className="table-small">{payment.studentName}</div>
                  </td>
                  <td>
                    <strong>
                      {formatMoney(payment.amount, payment.currency)}
                    </strong>
                    <div className="table-small">
                      Discount{" "}
                      {formatMoney(payment.referralDiscount, payment.currency)}
                    </div>
                  </td>
                  <td>
                    {niceDate(payment.dueDate, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    {payment.terms.replace("_", " ")}
                    <div className="table-small">
                      Billing arrangement; not proof of policy acceptance
                    </div>
                  </td>
                  <td>
                    <Pill>{payment.status.replace("_", " ")}</Pill>
                    <div className="table-small">
                      {payment.receiptName || "No receipt attached"}
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      {payment.status === "due" && role === "parent" && (
                        <a
                          className="btn secondary small"
                          href={`/workflows?paymentId=${encodeURIComponent(
                            payment.id
                          )}`}
                        >
                          Upload receipt
                        </a>
                      )}
                      {payment.status === "receipt_uploaded" &&
                        financeAccess &&
                        statusButton(
                          "Verify receipt",
                          () =>
                            confirm({
                              title: "Verify payment receipt?",
                              message: `Confirm that the receipt for ${payment.parentName} (${payment.studentName}, ${formatMoney(payment.amount, payment.currency)}) has been verified and mark this billing entry as paid.`,
                              confirmLabel: "Verify & mark paid",
                              tone: "primary",
                              onConfirm: () => setPaymentStatus(payment, "paid"),
                            }),
                          "secondary",
                          busy
                        )}
                      {financeAccess && payment.status === "paid" && (
                        <span className="table-small">Verified</span>
                      )}
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={Boolean(downloadingKey)}
                        onClick={() => void downloadBillingPdf(payment, "invoice")}
                      >
                        <FileDown size={13} />
                        {downloadingKey === `${payment.id}:invoice`
                          ? "Preparing…"
                          : "Invoice PDF"}
                      </button>
                      {payment.status === "paid" && (
                        <button
                          type="button"
                          className="btn secondary small"
                          disabled={Boolean(downloadingKey)}
                          onClick={() =>
                            void downloadBillingPdf(payment, "receipt")
                          }
                        >
                          <FileDown size={13} />
                          {downloadingKey === `${payment.id}:receipt`
                            ? "Preparing…"
                            : "Receipt PDF"}
                        </button>
                      )}
                      {role === "parent" && (
                        <Link className="btn ghost small" href="/policies">
                          Digital terms
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payments.length && (
            <Empty
              title="No billing records"
              detail="Records appear here when billing is added to the academy database."
            />
          )}
        </div>
      </section>
      {financeAccess && (
        <section className="card section-card" style={{ marginTop: 15 }}>
          <SectionTitle
            title="Expense ledger"
            detail="Category, date and source currency remain attached."
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>NGN equivalent</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{niceDate(expense.date)}</td>
                    <td>
                      <strong>{expense.title}</strong>
                    </td>
                    <td>{expense.category}</td>
                    <td>{formatMoney(expense.amount, expense.currency)}</td>
                    <td>
                      {formatMoney(
                        expense.amount * fx[expense.currency],
                        "NGN"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!expenses.length && (
              <Empty
                title="No matching expenses"
                detail={
                  normalizedQuery
                    ? "Try a different search term or clear the filter."
                    : "Log an academy expense using the toolbar action above."
                }
              />
            )}
          </div>
          <div className="table-small" style={{ marginTop: 9 }}>
            Exchange rates and currency catalogs are managed in{" "}
            <Link href="/settings" className="subtle-link">
              Academy Settings
            </Link>
            .
          </div>
        </section>
      )}
      <ConfirmDialog />
    </>
  );
}
