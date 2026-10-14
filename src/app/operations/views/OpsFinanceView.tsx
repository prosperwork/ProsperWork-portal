"use client";

import { useState, type FormEvent } from "react";
import { BarChart3, CircleDollarSign, ShieldCheck } from "lucide-react";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
import {
  money,
  dateLabel,
  objectText,
  studentName,
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

  const [contractStudent, setContractStudent] = useState("");
  const [contractAmount, setContractAmount] = useState("");
  const [contractCurrency, setContractCurrency] = useState("");
  const [contractTerms, setContractTerms] = useState<
    "upfront" | "after_service"
  >("upfront");
  const [contractAnchor, setContractAnchor] = useState("");
  const [contractNotes, setContractNotes] = useState("");
  const [stopNotes, setStopNotes] = useState<Record<string, string>>({});

  const [fxCurrency, setFxCurrency] = useState("");
  const [fxDate, setFxDate] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [fxNotes, setFxNotes] = useState("");

  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");

  const [taxPercent, setTaxPercent] = useState(
    currentSettings?.tax_percent !== undefined
      ? String(currentSettings.tax_percent)
      : ""
  );
  const [financeProfit, setFinanceProfit] = useState(
    Boolean(currentSettings?.finance_profit)
  );

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
        notes: contractNotes,
      },
      "Billing contract saved; current payment rows reloaded."
    );
    if (saved) {
      setContractStudent("");
      setContractAmount("");
      setContractCurrency("");
      setContractAnchor("");
      setContractNotes("");
    }
  };

  const addFx = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "fx",
        currency: fxCurrency,
        date: fxDate,
        rate: Number(fxRate),
        notes: fxNotes,
      },
      "Dated FX rate saved and records reloaded."
    );
    if (saved) {
      setFxCurrency("");
      setFxDate("");
      setFxRate("");
      setFxNotes("");
    }
  };

  const addExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "expense",
        title: expenseTitle,
        amount: Number(expenseAmount),
        currency: expenseCurrency,
        date: expenseDate,
        category: expenseCategory,
        notes: expenseNotes,
      },
      "Expense saved and financial records reloaded."
    );
    if (saved) {
      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseCurrency("");
      setExpenseDate("");
      setExpenseCategory("");
      setExpenseNotes("");
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAction(
      {
        action: "finance_settings",
        taxPercent: Number(taxPercent),
        financeProfit,
        referralPercent: Number(currentSettings?.referral_percent ?? 0),
      },
      "Finance settings saved and reloaded."
    );
  };

  const handleStopContract = (item: (typeof data.contracts)[0]) => {
    const student = data.students.find((s) => s.id === item.student_id);
    const targetName = studentName(student);
    const note = (stopNotes[item.id] ?? "").trim();

    confirm({
      title: "Stop Billing Contract?",
      message: `Are you sure you want to stop the billing contract for ${targetName}? Automatic invoice generation will be halted. Reason: "${note}"`,
      tone: "danger",
      confirmLabel: "Stop Contract",
      onConfirm: async () => {
        await submitAction(
          {
            action: "contract_stop",
            id: item.id,
            notes: note,
          },
          "Contract stopped and records reloaded."
        );
      },
    });
  };

  return (
    <div className="ops-view-group" role="group" aria-label="Finance work area">
      {canBilling && (
        <section className="ops-section span-8" aria-labelledby="billing-title">
          <div className="ops-section-head">
            <div>
              <h2 id="billing-title">Billing contracts</h2>
            </div>
            <CircleDollarSign size={18} color="#4c8b63" />
          </div>
          <details className="ops-create-record">
            <summary>Create billing contract</summary>
            <form onSubmit={(event) => void createContract(event)}>
              <div className="ops-form-grid">
                <div className="ops-field">
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
                    onChange={(event) =>
                      setContractCurrency(event.target.value)
                    }
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
                <div className="ops-field full">
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
              <div className="ops-actions">
                <button
                  className="ops-btn primary"
                  type="submit"
                  disabled={!isActive || Boolean(busy)}
                >
                  Create billing contract
                </button>
              </div>
            </form>
          </details>
          <div className="ops-section-head" style={{ marginTop: 20 }}>
            <div>
              <h2>Saved contracts</h2>
              <p>Stopping a contract preserves past payment records.</p>
            </div>
          </div>
          {data.contracts.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Rate</th>
                    <th>Terms</th>
                    <th>Anchor</th>
                    <th>Periods</th>
                    <th>Status / actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contracts.map((item) => (
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
                        <span
                          className={`ops-pill ${item.active ? "" : "alert"}`}
                        >
                          {item.active ? "Active" : "Stopped"}
                        </span>
                        {item.active && (
                          <div className="ops-actions">
                            <button
                              className="ops-btn"
                              type="button"
                              onClick={() =>
                                void submitAction(
                                  {
                                    action: "generate",
                                    id: item.id,
                                  },
                                  "Invoice generation completed; payment records reloaded."
                                )
                              }
                              disabled={!isActive || Boolean(busy)}
                            >
                              Generate due invoices
                            </button>
                            <input
                              aria-label={`Reason to stop ${studentName(
                                data.students.find(
                                  (student) => student.id === item.student_id
                                )
                              )} contract`}
                              placeholder="Stop reason · 5+ chars"
                              value={stopNotes[item.id] ?? ""}
                              onChange={(event) =>
                                setStopNotes((previous) => ({
                                  ...previous,
                                  [item.id]: event.target.value,
                                }))
                              }
                            />
                            <button
                              className="ops-btn danger"
                              type="button"
                              onClick={() => handleStopContract(item)}
                              disabled={
                                !isActive ||
                                (stopNotes[item.id] ?? "").trim().length < 5 ||
                                Boolean(busy)
                              }
                            >
                              Stop
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <strong>No contracts returned</strong>Create a contract from an
              actual active student above.
            </div>
          )}
        </section>
      )}

      {canBilling && (
        <section className="ops-section span-4" aria-labelledby="fx-title">
          <div className="ops-section-head">
            <div>
              <h2 id="fx-title">FX rates</h2>
            </div>
          </div>
          <details className="ops-create-record">
            <summary>Add dated rate</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addFx(event);
              }}
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
                  <label htmlFor="fx-rate">Rate to base</label>
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
              <div className="ops-field">
                <label htmlFor="fx-notes">
                  Source / reason · 5+ characters
                </label>
                <textarea
                  id="fx-notes"
                  value={fxNotes}
                  onChange={(event) => setFxNotes(event.target.value)}
                  minLength={5}
                  maxLength={2000}
                  required
                />
              </div>
              <div className="ops-actions">
                <button
                  className="ops-btn primary"
                  type="submit"
                  disabled={!isActive || Boolean(busy)}
                >
                  Save FX rate
                </button>
              </div>
            </form>
          </details>
          {data.fx.length ? (
            <div className="ops-table-wrap" style={{ marginTop: 12 }}>
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
                      <td>{item.currency}</td>
                      <td>{dateLabel(item.date)}</td>
                      <td>{item.rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <strong>No FX rates returned</strong>Enter a dated rate above.
            </div>
          )}
        </section>
      )}

      {canBilling && (
        <section className="ops-section span-6" aria-labelledby="expense-title">
          <div className="ops-section-head">
            <div>
              <h2 id="expense-title">Expenses</h2>
            </div>
          </div>
          <details className="ops-create-record">
            <summary>Record an expense</summary>
            <form onSubmit={(event) => void addExpense(event)}>
              <div className="ops-form-grid">
                <div className="ops-field">
                  <label htmlFor="expense-title-input">Expense title</label>
                  <input
                    id="expense-title-input"
                    value={expenseTitle}
                    onChange={(event) => setExpenseTitle(event.target.value)}
                    maxLength={120}
                    required
                  />
                </div>
                <div className="ops-field">
                  <label htmlFor="expense-category">Category</label>
                  <input
                    id="expense-category"
                    value={expenseCategory}
                    onChange={(event) => setExpenseCategory(event.target.value)}
                    maxLength={100}
                    required
                  />
                </div>
                <div className="ops-field">
                  <label htmlFor="expense-amount">Amount</label>
                  <input
                    id="expense-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={expenseAmount}
                    onChange={(event) => setExpenseAmount(event.target.value)}
                    required
                  />
                </div>
                <div className="ops-field">
                  <label htmlFor="expense-currency">Currency</label>
                  <select
                    id="expense-currency"
                    value={expenseCurrency}
                    onChange={(event) => setExpenseCurrency(event.target.value)}
                    required
                  >
                    <option value="">Choose currency</option>
                    {currencies.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div className="ops-field">
                  <label htmlFor="expense-date">Date</label>
                  <input
                    id="expense-date"
                    type="date"
                    value={expenseDate}
                    onChange={(event) => setExpenseDate(event.target.value)}
                    required
                  />
                </div>
                <div className="ops-field full">
                  <label htmlFor="expense-notes">
                    Reason / receipt reference · 5+ characters
                  </label>
                  <textarea
                    id="expense-notes"
                    value={expenseNotes}
                    onChange={(event) => setExpenseNotes(event.target.value)}
                    minLength={5}
                    maxLength={2000}
                    required
                  />
                </div>
              </div>
              <div className="ops-actions">
                <button
                  className="ops-btn primary"
                  type="submit"
                  disabled={!isActive || Boolean(busy)}
                >
                  Save expense
                </button>
              </div>
            </form>
          </details>
        </section>
      )}

      {isOwner && (
        <section
          className="ops-section span-6"
          aria-labelledby="finance-settings-title"
        >
          <div className="ops-section-head">
            <div>
              <h2 id="finance-settings-title">Owner finance controls</h2>
            </div>
            <ShieldCheck size={17} color="#4c8b63" />
          </div>
          <details className="ops-create-record">
            <summary>Edit finance controls</summary>
            <form onSubmit={(event) => void saveSettings(event)}>
              <div className="ops-field">
                <label htmlFor="tax-percent">Estimated tax percentage</label>
                <input
                  id="tax-percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxPercent}
                  onChange={(event) => setTaxPercent(event.target.value)}
                  required
                />
              </div>
              <label className="ops-check">
                <input
                  type="checkbox"
                  checked={financeProfit}
                  onChange={(event) => setFinanceProfit(event.target.checked)}
                />{" "}
                Allow Finance to see actual profit in financial summaries
              </label>
              <div className="ops-actions">
                <button
                  className="ops-btn primary"
                  type="submit"
                  disabled={!isActive || Boolean(busy)}
                >
                  Save finance controls
                </button>
              </div>
            </form>
          </details>
          <p className="ops-small">
            Current saved tax: {currentSettings?.tax_percent ?? "Not returned"}%
            · Finance profit access:{" "}
            {currentSettings?.finance_profit === true
              ? "On"
              : currentSettings?.finance_profit === false
              ? "Off"
              : "Not returned"}
          </p>
        </section>
      )}

      {canBilling && (
        <section
          className="ops-section span-12"
          aria-labelledby="financial-title"
        >
          <div className="ops-section-head">
            <div>
              <h2 id="financial-title">Financial summary</h2>
              <p>
                Service-provided currency rows. Optional profit, estimated tax
                and missing-rate details appear only when returned by native
                access rules.
              </p>
            </div>
            <BarChart3 size={18} color="#4c8b63" />
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
              Totals are not estimated in the browser.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
