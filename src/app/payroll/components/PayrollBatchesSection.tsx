"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  FileText,
} from "lucide-react";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import {
  dateLabel,
  label,
  money,
  type Batch,
  type PayrollData,
  type PayrollItem,
  type Statement,
} from "../payroll-types";

export interface PayrollBatchesSectionProps {
  data: PayrollData;
  role: string;
  owner: boolean;
  pending: boolean;
  canSubmitOnDate: boolean;
  payrollAccess: boolean;
  openDecision: (
    title: string,
    description: string,
    action: Record<string, unknown>,
    submitLabel?: string,
    requireReason?: boolean
  ) => void;
  onSetAdjustForm: (statement: Statement, batch?: Batch) => void;
  onSetPaidForm: (statement: Statement, batch?: Batch) => void;
}

export function renderPayrollItems(items: PayrollItem[], currency: string) {
  if (!items.length) {
    return (
      <div className="pr-earning">
        <div className="pr-earning-label">
          <strong>No earning lines</strong>
          <small>
            No verified attendance or approved earnings were returned for this
            statement.
          </small>
        </div>
        <span className="pr-earning-amount">—</span>
      </div>
    );
  }
  return items.map((item, index) => {
    const detail = item.data ?? {};
    const kind = label(item.kind);
    const who = detail.studentName ? ` · ${detail.studentName}` : "";
    const lessonDate = detail.startsAt
      ? dateLabel(detail.startsAt.slice(0, 10))
      : detail.startDate
        ? `Start ${dateLabel(detail.startDate)}`
        : "";
    const week = detail.weekTier ? `Week ${detail.weekTier}` : "";
    const frequency = detail.weeklyFrequency
      ? `${detail.weeklyFrequency}× weekly`
      : "";
    const context = [lessonDate, week, frequency].filter(Boolean).join(" · ");
    return (
      <div className="pr-earning" key={`${item.sourceKey}-${index}`}>
        <div className="pr-earning-label">
          <strong>
            {kind}
            {who}
          </strong>
          <small>
            {context || detail.reason || `Verified source · ${item.sourceKey}`}
          </small>
        </div>
        <span className="pr-earning-amount">
          {money(item.amount, currency)}
        </span>
      </div>
    );
  });
}

export function renderHistoricalStatementItem(
  statement: Statement,
  batch: Batch | undefined,
  payrollAccess: boolean,
  owner: boolean,
  onSetAdjustForm?: (statement: Statement, batch?: Batch) => void,
  onSetPaidForm?: (statement: Statement, batch?: Batch) => void
) {
  return (
    <article
      className="pr-statement"
      key={`${statement.id}-${batch?.id ?? "wallet"}`}
    >
      <div className="pr-statement-top">
        <div className="pr-person">
          <ProfileAvatar
            profileId={String(statement.staff_id)}
            name={statement.staff_name}
            size={34}
            className="pr-person-mark"
          />
          <span>
            <h3>{statement.staff_name}</h3>
            <p>
              {label(statement.role)} · {dateLabel(batch?.pay_date)}
              {batch ? ` · ${label(batch.status)}` : ""}
            </p>
          </span>
        </div>
        <div className={`pr-net ${statement.net < 0 ? "is-debt" : ""}`}>
          {money(statement.net, statement.currency)}
          <small>
            {statement.net < 0
              ? "Debt carried forward · not a bank transfer"
              : `${statement.currency} · ${
                  statement.paid_at
                    ? `Paid ${dateLabel(statement.paid_at)}`
                    : "Net statement"
                }`}
          </small>
        </div>
      </div>
      <div className="pr-item-list">
        {renderPayrollItems(statement.items, statement.currency)}
        {statement.adjustments?.map((adjustment) => (
          <div className="pr-earning adjustment" key={adjustment.id}>
            <div className="pr-earning-label">
              <strong>{label(adjustment.kind)}</strong>
              <small>{adjustment.reason}</small>
            </div>
            <span className="pr-earning-amount">
              {money(adjustment.amount, statement.currency)}
            </span>
          </div>
        ))}
      </div>
      {statement.transfer_reference && statement.net >= 0 && (
        <div className="pr-table-small">
          Transfer reference: {statement.transfer_reference}
        </div>
      )}
      {payrollAccess && batch && batch.status !== "paid" && (
        <div className="pr-action-row">
          {owner && batch.status === "draft" && onSetAdjustForm && (
            <button
              type="button"
              className="pr-button outline small"
              onClick={() => onSetAdjustForm(statement, batch)}
            >
              Adjust draft
            </button>
          )}
          {owner &&
            batch.status === "approved" &&
            !statement.paid_at &&
            statement.net > 0 &&
            onSetPaidForm && (
              <button
                type="button"
                className="pr-button secondary small"
                onClick={() => onSetPaidForm(statement, batch)}
              >
                Record completed transfer
              </button>
            )}
        </div>
      )}
    </article>
  );
}

type BatchStatusFilter = "all" | "draft" | "submitted" | "approved" | "paid";

export default function PayrollBatchesSection({
  data,
  role,
  owner,
  pending,
  canSubmitOnDate,
  payrollAccess,
  openDecision,
  onSetAdjustForm,
  onSetPaidForm,
}: PayrollBatchesSectionProps) {
  const [statusFilter, setStatusFilter] = useState<BatchStatusFilter>("all");
  const [expandedOverrides, setExpandedOverrides] = useState<
    Record<string, boolean>
  >({});

  const filterCounts = useMemo(
    () => ({
      all: data.batches.length,
      draft: data.batches.filter((b) => b.status === "draft").length,
      submitted: data.batches.filter((b) => b.status === "submitted").length,
      approved: data.batches.filter((b) => b.status === "approved").length,
      paid: data.batches.filter((b) => b.status === "paid").length,
    }),
    [data.batches]
  );

  const visibleBatches = useMemo(() => {
    if (statusFilter === "all") return data.batches;
    return data.batches.filter((b) => b.status === statusFilter);
  }, [data.batches, statusFilter]);

  const isBatchExpanded = (batch: Batch, index: number) => {
    const key = String(batch.id);
    if (key in expandedOverrides) return expandedOverrides[key];
    // Expand the first batch or any active non-paid batch by default; collapse older paid batches
    return index === 0 || batch.status !== "paid";
  };

  const toggleBatch = (batch: Batch, index: number) => {
    const key = String(batch.id);
    const current = isBatchExpanded(batch, index);
    setExpandedOverrides((prev) => ({ ...prev, [key]: !current }));
  };

  return (
    <section className="pr-card">
      <header className="pr-card-head">
        <div>
          <h2>Pay batches</h2>
        </div>
        <FileCheck2 size={17} color="#54856a" />
      </header>
      <div className="pr-card-body">
        {data.batches.length > 0 && (
          <div
            className="portal-tabs"
            role="tablist"
            aria-label="Filter pay batches by status"
          >
            {(
              [
                { key: "all", label: "All" },
                { key: "draft", label: "Draft" },
                { key: "submitted", label: "Submitted" },
                { key: "approved", label: "Approved" },
                { key: "paid", label: "Paid" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.key}
                type="button"
                role="tab"
                aria-selected={statusFilter === pill.key}
                className={`portal-tab ${
                  statusFilter === pill.key ? "active" : ""
                }`}
                onClick={() => setStatusFilter(pill.key)}
              >
                {pill.label}
                <span className="portal-tab-badge">
                  {filterCounts[pill.key]}
                </span>
              </button>
            ))}
          </div>
        )}

        {!data.batches.length ? (
          <div className="pr-empty">
            <span className="pr-empty-icon">
              <FileText size={17} />
            </span>
            <strong>No saved batches</strong>
            <p>
              Generate a draft from a clear verified-attendance preview in Run
              overview.
            </p>
          </div>
        ) : !visibleBatches.length ? (
          <div className="pr-empty">
            <span className="pr-empty-icon">
              <FileText size={17} />
            </span>
            <strong>No {label(statusFilter).toLowerCase()} batches</strong>
            <p>Switch status tabs to view batches in other stages.</p>
          </div>
        ) : (
          <div className="pr-stack">
            {visibleBatches.map((batch, index) => {
              const expanded = isBatchExpanded(batch, index);
              return (
                <section className="pr-card" key={batch.id}>
                  <header
                    className="pr-card-head"
                    style={{ cursor: "pointer" }}
                    onClick={() => toggleBatch(batch, index)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                      }}
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={
                          expanded ? "Collapse batch" : "Expand batch"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBatch(batch, index);
                        }}
                        style={{
                          border: "1px solid var(--line)",
                          background: "var(--white)",
                          borderRadius: 7,
                          width: 26,
                          height: 26,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--muted)",
                          flexShrink: 0,
                        }}
                      >
                        {expanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </button>
                      <div>
                        <h2>{dateLabel(batch.pay_date)} pay batch</h2>
                        <p>
                          Revision {batch.revision} · Created{" "}
                          {dateLabel(batch.created_at)} ·{" "}
                          {batch.statements.length} statement
                          {batch.statements.length === 1 ? "" : "s"}
                          {batch.approval_mode
                            ? ` · ${label(batch.approval_mode)}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`pr-pill ${batch.status}`}>
                      {label(batch.status)}
                    </span>
                  </header>

                  {expanded && (
                    <>
                      {batch.status === "draft" && (
                        <div className="pr-card-body">
                          <div className="pr-action-row">
                            {(role === "finance" || payrollAccess || owner) &&
                              canSubmitOnDate && (
                                <button
                                  type="button"
                                  className="pr-button"
                                  onClick={() =>
                                    openDecision(
                                      "Submit pay batch for approval?",
                                      "Hand this prepared batch over for final approval and payout. Submission does not transfer money.",
                                      {
                                        action: "batch",
                                        id: batch.id,
                                        decision: "submit",
                                      },
                                      "Submit batch",
                                      false
                                    )
                                  }
                                  disabled={pending}
                                >
                                  Submit batch
                                </button>
                              )}
                            {(role === "finance" || payrollAccess || owner) &&
                              !canSubmitOnDate && (
                                <span className="pr-subtitle">
                                  Batch can be submitted on or after{" "}
                                  {dateLabel(batch.pay_date)}.
                                </span>
                              )}
                          </div>
                        </div>
                      )}

                      {batch.status === "submitted" && owner && (
                        <div className="pr-card-body">
                          <div className="pr-action-row">
                            <button
                              type="button"
                              className="pr-button secondary"
                              onClick={() =>
                                openDecision(
                                  "Approve pay batch?",
                                  "Approval authorizes Finance to carry out transfers manually. It does not send a payment.",
                                  {
                                    action: "batch",
                                    id: batch.id,
                                    decision: "approve",
                                  },
                                  "Approve batch",
                                  false
                                )
                              }
                              disabled={pending}
                            >
                              <Check size={13} />
                              Approve batch
                            </button>
                            <button
                              type="button"
                              className="pr-button danger"
                              onClick={() =>
                                openDecision(
                                  "Return batch to Finance?",
                                  "A written reason is required so Finance can correct and resubmit this batch.",
                                  {
                                    action: "batch",
                                    id: batch.id,
                                    decision: "reject",
                                  },
                                  "Return with reason",
                                  true
                                )
                              }
                              disabled={pending}
                            >
                              Return to Finance
                            </button>
                          </div>
                        </div>
                      )}

                      {batch.status === "submitted" && !owner && (
                        <div className="pr-card-body">
                          <p className="pr-status-note">
                            Awaiting owner approval
                            {batch.approval_mode === "vacation_delegation"
                              ? " · server reports vacation delegation for this run"
                              : ""}
                            .
                          </p>
                        </div>
                      )}

                      {batch.status === "approved" && (
                        <div className="pr-card-body">
                          <p className="pr-status-note">
                            Approved · owner may record a completed transfer.
                          </p>
                        </div>
                      )}

                      {batch.statements.map((statement) =>
                        renderHistoricalStatementItem(
                          statement,
                          batch,
                          payrollAccess,
                          owner,
                          onSetAdjustForm,
                          onSetPaidForm
                        )
                      )}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
