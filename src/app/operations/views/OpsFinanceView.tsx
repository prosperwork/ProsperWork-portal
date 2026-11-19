"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Plus,
  Settings,
} from "lucide-react";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
import { PortalModal } from "@/app/_components/PortalModal";
import {
  money,
  dateLabel,
  objectText,
  studentName,
  type ContractRow,
  type OperationsData,
  type OpsStudent,
} from "../ops-types";

export interface OpsFinanceViewProps {
  data: OperationsData;
  activeStudents: OpsStudent[];
  isActive: boolean;
  isOwner: boolean;
  canBilling: boolean;
  currencies: string[];
  busy: string;
  submitAction: (action: unknown, label: string) => Promise<boolean>;
  confirm: (options: ConfirmOptions) => void;
}

export default function OpsFinanceView({
  data,
  activeStudents,
  isActive,
  isOwner,
  canBilling,
  currencies,
  busy,
  submitAction,
  confirm,
}: OpsFinanceViewProps) {
  const currentSettings = Array.isArray(data.settings)
    ? data.settings[0]
    : data.settings;

  // Contract filter
  const [contractFilter, setContractFilter] = useState<
    "active" | "stopped" | "all"
  >("active");

  // New Billing Contract modal
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [contractStudent, setContractStudent] = useState("");
  const [contractAmount, setContractAmount] = useState("");
  const [contractCurrency, setContractCurrency] = useState("");
  const [contractTerms, setContractTerms] = useState<
    "upfront" | "after_service"
  >("upfront");
  const [contractAnchor, setContractAnchor] = useState("");
  const [contractNotes, setContractNotes] = useState("");

  // Stop Contract modal
  const [stopTarget, setStopTarget] = useState<ContractRow | null>(null);
  const [stopReason, setStopReason] = useState("");

  // Add FX Rate modal
  const [fxModalOpen, setFxModalOpen] = useState(false);
  const [fxCurrency, setFxCurrency] = useState("");
  const [fxDate, setFxDate] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [fxNotes, setFxNotes] = useState("");

  const hasHeldContracts = useMemo(
    () => data.contracts.some((c) => c.active && c.billing_hold),
    [data.contracts]
  );

  const contractCounts = useMemo(() => {
    const active = data.contracts.filter((c) => c.active).length;
    const stopped = data.contracts.filter((c) => !c.active).length;
    return { active, stopped, all: data.contracts.length };
  }, [data.contracts]);

  const filteredContracts = useMemo(() => {
    if (contractFilter === "active")
      return data.contracts.filter((c) => c.active);
    if (contractFilter === "stopped")
      return data.contracts.filter((c) => !c.active);
    return data.contracts;
  }, [data.contracts, contractFilter]);

  const createContract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "contract",
        studentId: contractStudent,
        amount: Number(contractAmount),
        currency: contractCurrency,
        terms: contractTerms,
        anchor: contractAnchor,
        notes: contractNotes.trim(),
      },
      "Billing contract saved; current payment rows reloaded."
    );
    if (saved) {
      setContractStudent("");
      setContractAmount("");
      setContractCurrency("");
      setContractAnchor("");
      setContractNotes("");
      setContractModalOpen(false);
    }
  };

  const handleConfirmStopContract = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!stopTarget) return;
    const saved = await submitAction(
      {
        action: "contract_stop",
        id: stopTarget.id,
        notes: stopReason.trim(),
      },
      "Contract stopped and records reloaded."
    );
    if (saved) {
      setStopTarget(null);
      setStopReason("");
    }
  };

  const handleGenerateInvoices = (item: ContractRow) => {
    const student = data.students.find((s) => s.id === item.student_id);
    const targetName = studentName(student);

    confirm({
      title: "Generate Due Invoices?",
      message: item.billing_hold
        ? `${targetName}'s contract is currently on a billing hold after a student pause. Held contracts do not back-charge paused months — stop the held contract and agree a new restart anchor if billing should resume.\n\nProceed to check due invoices anyway?`
        : `Generate due invoices for ${targetName} (${money(
            item.amount,
            item.currency
          )} · period ${item.next_period})?`,
      tone: item.billing_hold ? "warning" : "primary",
      confirmLabel: "Generate Invoices",
      onConfirm: async () => {
        await submitAction(
          {
            action: "generate",
            id: item.id,
          },
          "Invoice generation completed; payment records reloaded."
        );
      },
    });
  };

  const addFx = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "fx",
        currency: fxCurrency,
        date: fxDate,
        rate: Number(fxRate),
        notes: fxNotes.trim(),
      },
      "Dated FX rate saved and records reloaded."
    );
    if (saved) {
      setFxCurrency("");
      setFxDate("");
      setFxRate("");
      setFxNotes("");
      setFxModalOpen(false);
    }
  };

  if (!canBilling) return null;

  return (
    <div className="ops-view-group" role="group" aria-label="Finance work area">
      {/* Billing review after a pause warning banner at the TOP */}
      {hasHeldContracts && (
        <section
          className="ops-section span-12"
          role="alert"
          style={{
            background: "#fffbeb",
            borderColor: "#f5d08a",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <AlertTriangle
              size={18}
              color="#b45309"
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <div>
              <strong style={{ color: "#92400e", fontSize: 13, display: "block" }}>
                Billing review required after a student pause
              </strong>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  color: "#78350f",
                  lineHeight: 1.5,
                }}
              >
                One or more active contracts have a{" "}
                <strong>Billing Hold</strong>. Held contracts do not back-charge
                paused months — stop the held contract and agree a new restart
                anchor before generating invoices.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Financial Summary KPIs at the TOP */}
      <section
        className="ops-section span-12"
        aria-labelledby="financial-title"
      >
        <div className="ops-section-head">
          <div>
            <h2 id="financial-title">Financial summary</h2>
            <p>
              Service-provided currency totals. Optional profit, estimated tax
              and missing-rate details appear according to your access rules.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/finance" className="ops-btn">
              Expenses &amp; Receipts <ArrowUpRight size={13} />
            </Link>
            {isOwner && (
              <Link href="/settings?tab=finance" className="ops-btn">
                <Settings size={13} /> Tax &amp; Profit Controls{" "}
                <ArrowUpRight size={13} />
              </Link>
            )}
            <BarChart3 size={18} color="#4c8b63" />
          </div>
        </div>

        {data.financial.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Payroll</th>
                  {data.financial.some(
                    (item) =>
                      item.profit !== undefined && item.profit !== null
                  ) && <th>Profit</th>}
                  {data.financial.some(
                    (item) =>
                      item.estimatedTax !== undefined &&
                      item.estimatedTax !== null
                  ) && <th>Estimated tax</th>}
                  {data.financial.some(
                    (item) =>
                      item.missingRates !== undefined &&
                      item.missingRates !== null
                  ) && <th>Missing FX rates</th>}
                </tr>
              </thead>
              <tbody>
                {data.financial.map((item, index) => (
                  <tr key={`${item.currency}-${index}`}>
                    <td>
                      <strong>{item.currency}</strong>
                    </td>
                    <td>{money(item.income, item.currency)}</td>
                    <td>{money(item.expenses, item.currency)}</td>
                    <td>{money(item.payroll, item.currency)}</td>
                    {data.financial.some(
                      (row) => row.profit !== undefined && row.profit !== null
                    ) && (
                      <td>
                        {item.profit == null
                          ? "—"
                          : money(item.profit, item.currency)}
                      </td>
                    )}
                    {data.financial.some(
                      (row) =>
                        row.estimatedTax !== undefined &&
                        row.estimatedTax !== null
                    ) && (
                      <td>
                        {item.estimatedTax == null
                          ? "—"
                          : money(item.estimatedTax, item.currency)}
                      </td>
                    )}
                    {data.financial.some(
                      (row) =>
                        row.missingRates !== undefined &&
                        row.missingRates !== null
                    ) && <td>{objectText(item.missingRates)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ops-empty">
            <strong>No financial summary rows returned</strong>
            Totals are calculated server-side when billing and payroll records
            exist.
          </div>
        )}

        {isOwner && currentSettings && (
          <p className="ops-small" style={{ marginTop: 10 }}>
            Configured tax rate: {currentSettings.tax_percent ?? "Not set"}% ·
            Finance profit visibility:{" "}
            {currentSettings.finance_profit ? "On" : "Off"} ·{" "}
            <Link href="/settings?tab=finance" style={{ color: "#175c45", fontWeight: 700 }}>
              Edit in Settings
            </Link>
          </p>
        )}
      </section>

      {/* Billing Contracts */}
      <section className="ops-section span-8" aria-labelledby="billing-title">
        <div className="ops-section-head">
          <div>
            <h2 id="billing-title">Billing contracts</h2>
            <p>Stopping a contract preserves all historical payment records.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
              onClick={() => setContractModalOpen(true)}
            >
              <Plus size={14} /> New Billing Contract
            </button>
          </div>
        </div>

        <nav
          className="portal-tabs"
          aria-label="Contract status filter"
          style={{ marginBottom: 14 }}
        >
          {(
            [
              { id: "active", label: "Active", count: contractCounts.active },
              {
                id: "stopped",
                label: "Stopped",
                count: contractCounts.stopped,
              },
              { id: "all", label: "All", count: contractCounts.all },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`portal-tab ${
                contractFilter === tab.id ? "active" : ""
              }`}
              onClick={() => setContractFilter(tab.id)}
            >
              {tab.label}
              <span className="portal-tab-badge">{tab.count}</span>
            </button>
          ))}
        </nav>

        {filteredContracts.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Rate</th>
                  <th>Terms</th>
                  <th>Anchor</th>
                  <th>Next Period</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>
                        {studentName(
                          data.students.find(
                            (student) => student.id === item.student_id
                          )
                        )}
                      </strong>
                    </td>
                    <td>
                      {money(item.amount, item.currency)}
                      <span className="ops-small">{item.currency}</span>
                    </td>
                    <td>{item.terms.replaceAll("_", " ")}</td>
                    <td>{dateLabel(item.anchor)}</td>
                    <td>{item.next_period}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        <span
                          className={`ops-pill ${item.active ? "" : "alert"}`}
                        >
                          {item.active ? "Active" : "Stopped"}
                        </span>
                        {item.active && item.billing_hold && (
                          <span className="ops-pill alert">Billing Hold</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {item.active ? (
                        <div className="ops-actions" style={{ marginTop: 0, justifyContent: "flex-start" }}>
                          <button
                            className="ops-btn"
                            type="button"
                            onClick={() => handleGenerateInvoices(item)}
                            disabled={!isActive || Boolean(busy)}
                          >
                            Generate due invoices
                          </button>
                          <button
                            className="ops-btn danger"
                            type="button"
                            onClick={() => {
                              setStopTarget(item);
                              setStopReason("");
                            }}
                            disabled={!isActive || Boolean(busy)}
                          >
                            Stop
                          </button>
                        </div>
                      ) : (
                        <span className="ops-small">Historical</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ops-empty">
            <strong>
              No {contractFilter === "all" ? "" : `${contractFilter} `}
              contracts
            </strong>
            Use New Billing Contract above to create a contract for an active
            student.
          </div>
        )}
      </section>

      {/* FX Rates */}
      <section className="ops-section span-4" aria-labelledby="fx-title">
        <div className="ops-section-head">
          <div>
            <h2 id="fx-title">FX rates</h2>
            <p>Dated conversion rates to reporting base (NGN).</p>
          </div>
          <button
            type="button"
            className="ops-btn primary"
            disabled={!isActive || Boolean(busy)}
            onClick={() => setFxModalOpen(true)}
          >
            <Plus size={14} /> Add FX Rate
          </button>
        </div>

        {data.fx.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Date</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.fx.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.currency}</strong>
                    </td>
                    <td>{dateLabel(item.date)}</td>
                    <td>{item.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ops-empty">
            <strong>No FX rates returned</strong>
            Add a dated conversion rate using the button above.
          </div>
        )}

        <div className="ops-callout" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <CircleDollarSign size={14} color="#4c8b63" />
            <strong>Expenses &amp; Receipts</strong>
          </div>
          Record academy expenses, verify family payment receipts, and manage
          invoices directly in the{" "}
          <Link href="/finance" style={{ color: "#175c45", fontWeight: 700 }}>
            Finance workspace
          </Link>
          .
        </div>
      </section>

      {/* + New Billing Contract Modal */}
      <PortalModal
        open={contractModalOpen}
        onClose={() => {
          if (!busy) setContractModalOpen(false);
        }}
        title="New Billing Contract"
        eyebrow="Recurring Billing"
        subtitle="Establish an active tuition billing contract for an enrolled student."
        size="md"
        busy={busy === "contract"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setContractModalOpen(false)}
              disabled={busy === "contract"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-new-contract-form"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
            >
              {busy === "contract" ? "Saving…" : "Create Billing Contract"}
            </button>
          </>
        }
      >
        <form
          id="ops-new-contract-form"
          onSubmit={(event) => void createContract(event)}
        >
          <div className="ops-form-grid">
            <div className="ops-field full">
              <label htmlFor="contract-student">Active student</label>
              <select
                id="contract-student"
                value={contractStudent}
                onChange={(event) => setContractStudent(event.target.value)}
                required
              >
                <option value="">Choose student</option>
                {activeStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {studentName(student)}
                  </option>
                ))}
              </select>
            </div>
            <div className="ops-field">
              <label htmlFor="contract-amount">Amount per period</label>
              <input
                id="contract-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={contractAmount}
                onChange={(event) => setContractAmount(event.target.value)}
                required
              />
            </div>
            <div className="ops-field">
              <label htmlFor="contract-currency">Currency</label>
              <select
                id="contract-currency"
                value={contractCurrency}
                onChange={(event) => setContractCurrency(event.target.value)}
                required
              >
                <option value="">Choose currency</option>
                {currencies.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
            <div className="ops-field">
              <label htmlFor="contract-terms">Invoice timing</label>
              <select
                id="contract-terms"
                value={contractTerms}
                onChange={(event) =>
                  setContractTerms(
                    event.target.value as "upfront" | "after_service"
                  )
                }
              >
                <option value="upfront">Upfront</option>
                <option value="after_service">After service</option>
              </select>
            </div>
            <div className="ops-field">
              <label htmlFor="contract-anchor">Monthly anchor date</label>
              <input
                id="contract-anchor"
                type="date"
                value={contractAnchor}
                onChange={(event) => setContractAnchor(event.target.value)}
                required
              />
            </div>
            <div className="ops-field full" style={{ marginBottom: 0 }}>
              <label htmlFor="contract-notes">
                Reason / agreement note · at least 5 characters
              </label>
              <textarea
                id="contract-notes"
                value={contractNotes}
                onChange={(event) => setContractNotes(event.target.value)}
                minLength={5}
                maxLength={2000}
                required
              />
            </div>
          </div>
        </form>
      </PortalModal>

      {/* Stop Contract Modal */}
      <PortalModal
        open={Boolean(stopTarget)}
        onClose={() => {
          if (!busy) setStopTarget(null);
        }}
        title="Stop Billing Contract"
        eyebrow="Halt Recurring Billing"
        subtitle={
          stopTarget
            ? `Student: ${studentName(
                data.students.find((s) => s.id === stopTarget.student_id)
              )} (${money(stopTarget.amount, stopTarget.currency)})`
            : undefined
        }
        size="sm"
        busy={busy === "contract_stop"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setStopTarget(null)}
              disabled={busy === "contract_stop"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-stop-contract-form"
              className="ops-btn danger"
              disabled={
                !isActive || stopReason.trim().length < 5 || Boolean(busy)
              }
            >
              {busy === "contract_stop" ? "Stopping…" : "Stop Contract"}
            </button>
          </>
        }
      >
        <form
          id="ops-stop-contract-form"
          onSubmit={(event) => void handleConfirmStopContract(event)}
        >
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>
            Automatic invoice generation will be halted. Past payment records
            remain intact.
          </p>
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="stop-contract-reason">
              Reason for stopping · at least 5 characters
            </label>
            <textarea
              id="stop-contract-reason"
              required
              minLength={5}
              maxLength={2000}
              value={stopReason}
              onChange={(event) => setStopReason(event.target.value)}
              placeholder="e.g. Student paused / replacing with new restart anchor"
            />
          </div>
        </form>
      </PortalModal>

      {/* + Add FX Rate Modal */}
      <PortalModal
        open={fxModalOpen}
        onClose={() => {
          if (!busy) setFxModalOpen(false);
        }}
        title="Add Dated FX Rate"
        eyebrow="Currency Conversion"
        subtitle="Record an explicit conversion rate to reporting base (NGN)."
        size="md"
        busy={busy === "fx"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setFxModalOpen(false)}
              disabled={busy === "fx"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-add-fx-form"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
            >
              {busy === "fx" ? "Saving…" : "Save FX Rate"}
            </button>
          </>
        }
      >
        <form
          id="ops-add-fx-form"
          onSubmit={(event) => void addFx(event)}
        >
          <div className="ops-field">
            <label htmlFor="fx-currency">Currency</label>
            <select
              id="fx-currency"
              value={fxCurrency}
              onChange={(event) => setFxCurrency(event.target.value)}
              required
            >
              <option value="">Choose currency</option>
              {currencies
                .filter((value) => value !== "NGN")
                .map((value) => (
                  <option key={value}>{value}</option>
                ))}
            </select>
          </div>
          <div className="ops-form-grid">
            <div className="ops-field">
              <label htmlFor="fx-date">Effective date</label>
              <input
                id="fx-date"
                type="date"
                value={fxDate}
                onChange={(event) => setFxDate(event.target.value)}
                required
              />
            </div>
            <div className="ops-field">
              <label htmlFor="fx-rate">Rate to NGN</label>
              <input
                id="fx-rate"
                type="number"
                min="0.000001"
                step="any"
                value={fxRate}
                onChange={(event) => setFxRate(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="fx-notes">Source / reason · 5+ characters</label>
            <textarea
              id="fx-notes"
              value={fxNotes}
              onChange={(event) => setFxNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>
        </form>
      </PortalModal>
    </div>
  );
}
