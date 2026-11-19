"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, CircleDollarSign, Plus } from "lucide-react";
import { PortalModal } from "@/app/_components/PortalModal";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import CurrencySelect from "@/lib/academy/CurrencySelect";
import {
  dateLabel,
  label,
  money,
  type PayrollData,
  type RateDraft,
  type Staff,
} from "../payroll-types";

export function classifyStaffPayRole(
  staff?: Staff | null
): "teacher" | "admin" | "management" | "unknown" {
  if (!staff) return "unknown";
  const r = staff.role.toLowerCase().trim();
  if (
    r === "teacher" ||
    staff.department === "Music Education" ||
    r.includes("teacher")
  ) {
    return "teacher";
  }
  if (r === "admin" || r === "head_admin") {
    return "admin";
  }
  return "management";
}

export function applyRoleDefaultsToRateDraft(
  current: RateDraft,
  staff?: Staff | null
): RateDraft {
  const kind = classifyStaffPayRole(staff);
  if (kind === "teacher") {
    return {
      ...current,
      baseSalary: current.baseSalary || "0",
      adminExtraParentRate: current.adminExtraParentRate || "0",
      adminQuota: current.adminQuota || "0",
      managementFirstPeriod: current.managementFirstPeriod || "full_month",
    };
  }
  if (kind === "admin") {
    return {
      ...current,
      monthlyStudentRate: current.monthlyStudentRate || "0",
      trialRate: current.trialRate || "0",
      coverRate: current.coverRate || "0",
    };
  }
  if (kind === "management") {
    return {
      ...current,
      monthlyStudentRate: current.monthlyStudentRate || "0",
      trialRate: current.trialRate || "0",
      coverRate: current.coverRate || "0",
      adminExtraParentRate: current.adminExtraParentRate || "0",
      adminQuota: current.adminQuota || "0",
    };
  }
  return current;
}

export interface PayrollRatesSectionProps {
  data: PayrollData;
  activeStaff: Staff[];
  owner: boolean;
  pending: boolean;
  rateForm: RateDraft;
  setRateForm: React.Dispatch<React.SetStateAction<RateDraft>>;
  formError?: string;
  onClearFormError?: () => void;
  onSubmitRate: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
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
  selectedStaff,
}: {
  value: RateDraft;
  onChange: (next: RateDraft) => void;
  initialOnly: boolean;
  selectedStaff?: Staff | null;
}) {
  const [showAllFields, setShowAllFields] = useState(false);

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

  const payKind = classifyStaffPayRole(selectedStaff);
  const showTeacherFields =
    showAllFields || payKind === "teacher" || payKind === "unknown";
  const showCoverField =
    showTeacherFields || selectedStaff?.role.toLowerCase() === "qc";
  const showBaseSalary =
    showAllFields ||
    payKind === "admin" ||
    payKind === "management" ||
    payKind === "unknown";
  const showAdminFields =
    showAllFields || payKind === "admin" || payKind === "unknown";
  const showManagementPolicy =
    showAllFields ||
    payKind === "admin" ||
    payKind === "management" ||
    payKind === "unknown";

  return (
    <>
      <div className="pr-form-grid">
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
              ? "Agreed start date; past dates require confirmation."
              : "Raises must use a future date."}
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
      </div>

      {selectedStaff && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "7px 10px",
            borderRadius: 8,
            background: "#f4f8f5",
            border: "1px solid var(--line)",
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          <span>
            Showing{" "}
            <strong style={{ color: "var(--ink)" }}>
              {payKind === "teacher"
                ? "Teacher"
                : payKind === "admin"
                  ? "Admin"
                  : "Management"}
            </strong>{" "}
            pay fields for {selectedStaff.name}. Unused fields default to 0.
          </span>
          <button
            type="button"
            className="pr-button outline small"
            style={{ padding: "3px 8px", fontSize: 11 }}
            onClick={() => setShowAllFields((prev) => !prev)}
          >
            {showAllFields ? "Role fields only" : "Show all fields"}
          </button>
        </div>
      )}

      <div className="pr-form-grid">
        {showTeacherFields && (
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
        )}
        {showTeacherFields && (
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
        )}
        {showCoverField && (
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
        )}
        {showBaseSalary && (
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
        )}
        {showAdminFields && (
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
        )}
        {showAdminFields && (
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
        )}
      </div>

      {showManagementPolicy && (
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
            This choice is required for owner approval. The app does not
            estimate or assume a partial-month proration.
          </small>
        </label>
      )}

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
          rows={3}
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
  formError,
  onClearFormError,
  onSubmitRate,
  openDecision,
}: PayrollRatesSectionProps) {
  const [proposeModalOpen, setProposeModalOpen] = useState(false);

  const selectedStaff =
    activeStaff.find((s) => String(s.id) === rateForm.staffId) ?? null;

  const handleRateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    const ok = await onSubmitRate(event);
    if (ok) {
      setProposeModalOpen(false);
    }
  };

  return (
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="pr-tab-count">{data.rateProposals.length}</span>
            <button
              type="button"
              className="pr-button small"
              disabled={activeStaff.length === 0}
              onClick={() => {
                onClearFormError?.();
                setProposeModalOpen(true);
              }}
            >
              <Plus size={13} />+ Propose Pay Terms
            </button>
          </div>
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
              Effective terms from the payroll service; each staff member keeps
              their own currency.
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

      {/* Propose Pay Terms Modal */}
      <PortalModal
        open={proposeModalOpen}
        onClose={() => {
          setProposeModalOpen(false);
          onClearFormError?.();
        }}
        eyebrow="Compensation proposal"
        title="Propose pay terms"
        subtitle="Record a documented agreement. Owner approval is required before these terms take effect."
        size="lg"
        busy={pending}
      >
        {activeStaff.length === 0 ? (
          <div className="pr-empty">
            <strong>No active staff available</strong>
            <p>Set up staff accounts before creating a proposal.</p>
          </div>
        ) : (
          <form className="pr-form" onSubmit={handleRateSubmit}>
            {formError && (
              <div className="pr-alert" role="alert">
                <AlertCircle size={15} />
                <p>{formError}</p>
              </div>
            )}
            <label className="pr-field">
              <span>Staff member</span>
              <select
                required
                value={rateForm.staffId}
                onChange={(event) => {
                  const nextStaffId = event.target.value;
                  const staff =
                    activeStaff.find((s) => String(s.id) === nextStaffId) ??
                    null;
                  setRateForm((prev) =>
                    applyRoleDefaultsToRateDraft(
                      { ...prev, staffId: nextStaffId },
                      staff
                    )
                  );
                }}
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
              selectedStaff={selectedStaff}
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
                onboarding. Past dates are permitted only to record the initial
                agreement. Raises must use a future effective date.
              </span>
            </label>

            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="pr-button outline"
                onClick={() => setProposeModalOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button className="pr-button" type="submit" disabled={pending}>
                <Plus size={14} />
                {pending ? "Submitting…" : "Submit terms for owner approval"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>
    </div>
  );
}
