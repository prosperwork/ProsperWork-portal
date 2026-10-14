"use client";

import { useState, type FormEvent } from "react";
import {
  bytesLabel,
  dateLabel,
  Empty,
  maxReceiptBytes,
  receiptRoles,
  type FileMetadata,
  type Payment,
  type WorkflowData,
} from "../workflow-types";

export interface WorkflowPaymentsSectionProps {
  data: WorkflowData;
  isFamily: boolean;
  isHomeworkRoute: boolean;
  busy: string;
  filesFor: (
    category: "receipt" | "homework",
    targetId: string
  ) => FileMetadata[];
  submitReceipt: (
    event: FormEvent<HTMLFormElement>,
    id: string
  ) => Promise<void>;
  setActionError: (msg: string) => void;
}

export default function WorkflowPaymentsSection({
  data,
  isFamily,
  isHomeworkRoute,
  busy,
  filesFor,
  submitReceipt,
  setActionError,
}: WorkflowPaymentsSectionProps) {
  const [paymentId, setPaymentId] = useState("");

  if (isHomeworkRoute || !receiptRoles.includes(data.profile.role)) {
    return null;
  }

  return (
    <section className="wf-card" aria-labelledby="payments-heading">
      <header className="wf-card-head">
        <div className="wf-head-copy">
          <div>
            <h2 id="payments-heading">Payments &amp; receipts</h2>
          </div>
        </div>
        <span className="wf-count">{data.payments.length} listed</span>
      </header>
      {data.payments.length ? (
        <div className="wf-records">
          {data.payments.map((payment) => {
            const files = filesFor("receipt", payment.id);
            return (
              <article className="wf-record" key={payment.id}>
                <div className="wf-record-main">
                  <div className="wf-record-title">
                    {payment.studentName}
                    <span
                      className={`wf-pill ${
                        payment.status === "paid"
                          ? "good"
                          : payment.status === "receipt_uploaded"
                          ? "wait"
                          : ""
                      }`}
                    >
                      {payment.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="wf-record-meta">
                    Payment record · {payment.currency}{" "}
                    {payment.amount.toFixed(2)} · due{" "}
                    {dateLabel(payment.dueDate)}
                  </div>
                  {isFamily && (
                    <div className="wf-record-meta">
                      Invoice {payment.id.slice(0, 8)} · {payment.studentName} ·{" "}
                      {payment.currency} {payment.amount.toFixed(2)}
                    </div>
                  )}
                  {files.map((file) => (
                    <p className="wf-record-meta" key={file.id}>
                      <a
                        className="wf-link"
                        href={`/api/files?id=${encodeURIComponent(file.id)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {file.original_name}
                      </a>{" "}
                      · {bytesLabel(file.bytes)} · {dateLabel(file.created_at)}
                    </p>
                  ))}
                  {!files.length && payment.receiptName && (
                    <div className="wf-record-meta">
                      Receipt recorded: {payment.receiptName}
                    </div>
                  )}
                  {data.profile.role === "parent" &&
                    payment.status === "due" &&
                    paymentId !== payment.id && (
                      <button
                        className="wf-button secondary"
                        type="button"
                        onClick={() => {
                          setActionError("");
                          setPaymentId(payment.id);
                        }}
                      >
                        Upload receipt for this payment
                      </button>
                    )}
                  {data.profile.role === "parent" &&
                    paymentId === payment.id &&
                    payment.status === "due" && (
                      <form
                        className="wf-form"
                        onSubmit={(event) =>
                          void submitReceipt(event, payment.id)
                        }
                      >
                        <div className="wf-form-grid">
                          <div className="wf-field full">
                            <span className="wf-help">
                              Invoice {payment.id.slice(0, 8)} ·{" "}
                              {payment.studentName} · {payment.currency}{" "}
                              {payment.amount.toFixed(2)} · due{" "}
                              {dateLabel(payment.dueDate)} (Max{" "}
                              {maxReceiptBytes / (1024 * 1024)}MB)
                            </span>
                          </div>
                          <div className="wf-field full">
                            <label htmlFor={`receipt-file-${payment.id}`}>
                              Receipt file
                            </label>
                            <input
                              className="wf-file"
                              id={`receipt-file-${payment.id}`}
                              name="receiptFile"
                              type="file"
                              required
                              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                            />
                          </div>
                          <div className="wf-field full">
                            <label htmlFor={`receipt-note-${payment.id}`}>
                              Note <span aria-hidden="true">(optional)</span>
                            </label>
                            <input
                              id={`receipt-note-${payment.id}`}
                              name="receiptNote"
                              type="text"
                              maxLength={400}
                              placeholder="Reference for this payment"
                            />
                          </div>
                        </div>
                        <div className="wf-form-actions">
                          <button
                            className="wf-button"
                            type="submit"
                            disabled={!!busy}
                          >
                            {busy === "receipt"
                              ? "Uploading…"
                              : "Submit receipt"}
                          </button>
                          <button
                            className="wf-button secondary"
                            type="button"
                            onClick={() => setPaymentId("")}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No payment records to show"
          detail="When a payment is shared with this account, its current status will appear here."
        />
      )}
    </section>
  );
}
