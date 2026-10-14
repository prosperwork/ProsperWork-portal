"use client";

import { ChangeEvent, type FormEvent } from "react";
import { CircleDollarSign, Plus } from "lucide-react";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import CurrencySelect from "@/lib/academy/CurrencySelect";
import {
  dateLabel,
  label,
  money,
  type PayrollData,
  type Rate,
  type RateDraft,
  type Staff,
} from "../payroll-types";

export interface PayrollRatesSectionProps {
  data: PayrollData;
  activeStaff: Staff[];
  owner: boolean;
  pending: boolean;
  rateForm: RateDraft;
  setRateForm: React.Dispatch<React.SetStateAction<RateDraft>>;
  onSubmitRate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  openDecision: (
    title: string,
    description: string,
    action: Record<string, unknown>,
    submitLabel?: string,
    requireReason?: boolean
  ) => void;
}

export function RateInputs({
  value,
  onChange,
  initialOnly,
}: {
  value: RateDraft;
  onChange: (next: RateDraft) => void;
  initialOnly: boolean;
}) {
  const change =
    (key: keyof RateDraft) =>
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      onChange({
        ...value,
        [key]:
          event.target.type === "checkbox"
            ? (event.target as HTMLInputElement).checked
            : event.target.value,
      } as RateDraft);

  return (
    <>
      <label className="pr-field">
        <span>
          {initialOnly ? "Initial agreement effective date" : "Effective date"}
        </span>
        <input
          type="date"
          required
          value={value.effectiveFrom}
          onChange={change("effectiveFrom")}
        />
        <small className="pr-subtitle">
          {initialOnly
            ? "Use the agreed start date; past dates require the confirmation below."
            : "Raises must use a future date. Past dates are only for initial agreements."}
        </small>
      </label>
      <label className="pr-field">
        <span>Currency</span>
        <CurrencySelect
          required
          value={value.currency}
          onChange={(currency) => onChange({ ...value, currency })}
        />
      </label>
      <div className="pr-form-grid">
        <label className="pr-field">
          <span>Monthly student rate</span>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={value.monthlyStudentRate}
            onChange={change("monthlyStudentRate")}
          />
        </label>
        <label className="pr-field">
          <span>Trial lesson rate</span>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={value.trialRate}
            onChange={change("trialRate")}
          />
        </label>
        <label className="pr-field">
          <span>Cover lesson rate</span>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={value.coverRate}
            onChange={change("coverRate")}
          />
        </label>
        <label className="pr-field">
          <span>Base salary</span>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={value.baseSalary}
            onChange={change("baseSalary")}
          />
        </label>
        <label className="pr-field">
          <span>Admin extra-parent rate</span>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={value.adminExtraParentRate}
            onChange={change("adminExtraParentRate")}
          />
        </label>
        <label className="pr-field">
          <span>Admin quota</span>
          <input
            type="number"
            min="0"
            step="1"
            required
            value={value.adminQuota}
            onChange={change("adminQuota")}
          />
        </label>
      </div>
      <label className="pr-field">
        <span>Management salary · first period policy</span>
        <select
          required
          value={value.managementFirstPeriod}
          onChange={(event) =>
            onChange({
              ...value,
              managementFirstPeriod: event.target
                .value as RateDraft["managementFirstPeriod"],
            })
          }
        >
          <option value="">Choose the agreed treatment</option>
          <option value="full_month">Full month</option>
          <option value="manual_adjustment">Manual adjustment</option>
        </select>
        <small className="pr-subtitle">
          This choice is required for owner approval. The app does not estimate
          or assume a partial-month proration.
        </small>
      </label>
      <label className="pr-check">
        <input
          type="checkbox"
          checked={value.advanceEligible}
          onChange={change("advanceEligible")}
        />
        <span>
          Mark this staff member eligible for advances, subject to academy
          rules.
        </span>
      </label>
      <label className="pr-field">
        <span>Agreement / proposal reason</span>
        <textarea
          required
          minLength={3}
          value={value.reason}
          onChange={change("reason")}
          placeholder="Document the agreement or reason for a future raise."
        />
      </label>
    </>
  );
}

export default function PayrollRatesSection({
  data,
  activeStaff,
  owner,
  pending,
  rateForm,
  setRateForm,
  onSubmitRate,
  openDecision,
}: PayrollRatesSectionProps) {
  return (
    <div className="pr-layout">
      <div className="pr-stack">
        <section className="pr-card">
          <header className="pr-card-head">
            <div>
              <h2>Pay-term proposals</h2>
              <p>
                Initial agreements and future-only raises require owner review
                before they take effect.
              </p>
            </div>
            <span className="pr-tab-count">{data.rateProposals.length}</span>
          </header>
          {data.rateProposals.length ? (
            data.rateProposals.map((proposal) => (
              <article className="pr-proposal" key={proposal.id}>
                <div className="pr-proposal-top">
                  <span>
                    <h3>
                      {data.staff.find(
                        (person) =>
                          String(person.id) === String(proposal.staff_id)
                      )?.name || `Staff ${proposal.staff_id}`}
                    </h3>
                    <p>
                      Effective {dateLabel(proposal.effective_from)} ·{" "}
                      {proposal.reason || "No proposal note"}
                    </p>
                  </span>
                  <span className={`pr-pill ${proposal.status || "submitted"}`}>
                    {label(proposal.status || "pending")}
                  </span>
                </div>
                <div className="pr-proposal-terms">
                  <span>
                    Monthly student{" "}
                    {money(
                      proposal.terms.monthlyStudentRate,
                      proposal.terms.currency
                    )}
                  </span>
                  <span>
                    Trial{" "}
                    {money(proposal.terms.trialRate, proposal.terms.currency)}
                  </span>
                  <span>
                    Cover{" "}
                    {money(proposal.terms.coverRate, proposal.terms.currency)}
                  </span>
                  <span>
                    Base salary{" "}
                    {money(proposal.terms.baseSalary, proposal.terms.currency)}
                  </span>
                  <span>
                    Admin extra parent{" "}
                    {money(
                      proposal.terms.adminExtraParentRate,
                      proposal.terms.currency
                    )}
                  </span>
                  <span>Quota {proposal.terms.adminQuota}</span>
                  <span>
                    Advances{" "}
                    {proposal.terms.advanceEligible
                      ? "Eligible"
                      : "Not eligible"}
                  </span>
                  <span>
                    First management period:{" "}
                    {proposal.managementFirstPeriod
                      ? label(proposal.managementFirstPeriod)
                      : "Policy not returned"}
                  </span>
                </div>
                {owner &&
                (!proposal.status || proposal.status === "pending") ? (
                  <div className="pr-action-row">
                    <button
                      type="button"
                      className="pr-button secondary small"
                      onClick={() =>
                        openDecision(
                          "Approve pay terms?",
                          "Review the explicit management first-period policy before approval. No prorated salary is estimated.",
                          {
                            action: "decide_rate",
                            id: proposal.id,
                            decision: "approve",
                          },
                          "Approve terms",
                          false
                        )
                      }
                      disabled={pending || !proposal.managementFirstPeriod}
                      title={
                        !proposal.managementFirstPeriod
                          ? "Cannot approve until the explicit first-period policy is returned."
                          : undefined
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="pr-button danger small"
                      onClick={() =>
                        openDecision(
                          "Reject pay terms?",
                          "A written rejection reason is required for the proposal record.",
                          {
                            action: "decide_rate",
                            id: proposal.id,
                            decision: "reject",
                          },
                          "Reject with reason",
                          true
                        )
                      }
                      disabled={pending}
                    >
                      Reject with reason
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="pr-empty">
              <span className="pr-empty-icon">
                <CircleDollarSign size={17} />
              </span>
              <strong>No pay proposals yet</strong>
              <p>
                There are no pending or historical proposals in the server
                response. Approved terms are listed separately below.
              </p>
            </div>
          )}
        </section>

        <section className="pr-card">
          <header className="pr-card-head">
            <div>
              <h2>Approved pay terms</h2>
              <p>
                Effective terms from the payroll service; each staff member
                keeps their own currency.
              </p>
            </div>
          </header>
          {data.rates.length ? (
            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Effective from</th>
                    <th>Monthly student</th>
                    <th>Trial / cover</th>
                    <th>Base</th>
                    <th>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rates.map((rate) => {
                    const person = data.staff.find(
                      (row) => String(row.id) === String(rate.staff_id)
                    );
                    const name = person?.name || `Staff ${rate.staff_id}`;
                    return (
                      <tr key={rate.id}>
                        <td>
                          <div className="pw-person-inline">
                            <ProfileAvatar
                              profileId={String(rate.staff_id)}
                              name={name}
                              size={30}
                            />
                            <strong>{name}</strong>
                          </div>
                        </td>
                        <td>{dateLabel(rate.effective_from)}</td>
                        <td>
                          {money(
                            rate.terms.monthlyStudentRate,
                            rate.terms.currency
                          )}
                        </td>
                        <td>
                          {money(rate.terms.trialRate, rate.terms.currency)} /{" "}
                          {money(rate.terms.coverRate, rate.terms.currency)}
                        </td>
                        <td>
                          {money(rate.terms.baseSalary, rate.terms.currency)}
                        </td>
                        <td>{rate.terms.currency}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pr-empty">
              <span className="pr-empty-icon">
                <CircleDollarSign size={17} />
              </span>
              <strong>No approved rates yet</strong>
              <p>
                Terms appear after an owner-approved proposal. No placeholder
                salary rows are created.
              </p>
            </div>
          )}
        </section>
      </div>

      <aside className="pr-stack">
        <section className="pr-card">
          <header className="pr-card-head">
            <div>
              <h2>Propose pay terms</h2>
              <p>
                Record a documented agreement. Owner approval is required before
                these terms are active.
              </p>
            </div>
            <Plus size={17} color="#54856a" />
          </header>
          <div className="pr-card-body">
            {activeStaff.length === 0 ? (
              <div className="pr-empty">
                <strong>No active staff available</strong>
                <p>Set up staff accounts before creating a proposal.</p>
              </div>
            ) : (
              <form className="pr-form" onSubmit={onSubmitRate}>
                <label className="pr-field">
                  <span>Staff member</span>
                  <select
                    required
                    value={rateForm.staffId}
                    onChange={(event) =>
                      setRateForm({ ...rateForm, staffId: event.target.value })
                    }
                  >
                    <option value="">Select staff</option>
                    {activeStaff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {label(person.role)}
                      </option>
                    ))}
                  </select>
                </label>
                <RateInputs
                  value={rateForm}
                  onChange={setRateForm}
                  initialOnly={false}
                />
                <label className="pr-check">
                  <input
                    type="checkbox"
                    checked={rateForm.initialAgreed}
                    onChange={(event) =>
                      setRateForm({
                        ...rateForm,
                        initialAgreed: event.target.checked,
                      })
                    }
                  />
                  <span>
                    Confirm initial pay agreement only if this is first-time
                    onboarding. Past dates are permitted only to record the
                    initial agreement. Raises must use a future effective date.
                  </span>
                </label>
                <button className="pr-button" type="submit" disabled={pending}>
                  <Plus size={14} />
                  Submit terms for owner approval
                </button>
              </form>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
