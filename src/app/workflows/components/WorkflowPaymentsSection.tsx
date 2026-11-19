"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { PortalModal } from "@/app/_components/PortalModal";
import {
  bytesLabel,
  dateLabel,
  Empty,
  maxReceiptBytes,
  type FileMetadata,
  type Payment,
  type WorkflowData,
} from "../workflow-types";

export interface WorkflowPaymentsSectionProps {
  data: WorkflowData;
  canSeeReceipts: boolean;
  isFamily: boolean;
  isHomeworkRoute: boolean;
  initialPaymentId?: string;
  busy: string;
  filesFor: (
    category: "receipt" | "homework",
    targetId: string
  ) => FileMetadata[];
  submitReceipt: (
    event: FormEvent<HTMLFormElement>,
    id: string
  ) => Promise<boolean>;
  setActionError: (msg: string) => void;
}

export default function WorkflowPaymentsSection({
  data,
  canSeeReceipts,
  isFamily,
  isHomeworkRoute,
  initialPaymentId = "",
  busy,
  filesFor,
  submitReceipt,
  setActionError,
}: WorkflowPaymentsSectionProps) {
  const [uploadTarget, setUploadTarget] = useState<Payment | null>(null);

  useEffect(() => {
    if (!initialPaymentId) return;
    const match = data.payments.find(
      (payment) => payment.id === initialPaymentId && payment.status === "due"
    );
    if (match && data.profile.role === "parent") {
      setUploadTarget(match);
    }
  }, [initialPaymentId, data.payments, data.profile.role]);

  if (isHomeworkRoute || !canSeeReceipts) {
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
                    {isFamily
                      ? `Invoice #${payment.id.slice(0, 8)} · `
                      : "Payment record · "}
                    {payment.currency} {payment.amount.toFixed(2)} · due{" "}
                    {dateLabel(payment.dueDate)}
                  </div>
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
                    payment.status === "due" && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          className="wf-button secondary"
                          type="button"
                          onClick={() => {
                            setActionError("");
                            setUploadTarget(payment);
                          }}
                        >
                          <Upload size={13} /> Upload receipt
                        </button>
                      </div>
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

      {/* Upload Receipt Modal */}
      <PortalModal
        open={Boolean(uploadTarget)}
        onClose={() => setUploadTarget(null)}
        eyebrow="Payment proof"
        title="Upload payment receipt"
        subtitle={
          uploadTarget
            ? `Invoice #${uploadTarget.id.slice(0, 8)} · ${
                uploadTarget.studentName
              } · ${uploadTarget.currency} ${uploadTarget.amount.toFixed(
                2
              )} · due ${dateLabel(uploadTarget.dueDate)}`
            : undefined
        }
        size="md"
        busy={busy === "receipt"}
      >
        {uploadTarget && (
          <form
            className="wf-form"
            style={{ padding: 0, border: "none", background: "transparent" }}
            onSubmit={async (event) => {
              const ok = await submitReceipt(event, uploadTarget.id);
              if (ok) setUploadTarget(null);
            }}
          >
            <div className="wf-form-grid">
              <div className="wf-field full">
                <label htmlFor={`receipt-file-${uploadTarget.id}`}>
                  Receipt file (PDF, PNG, or JPEG · Max{" "}
                  {maxReceiptBytes / (1024 * 1024)}MB)
                </label>
                <input
                  className="wf-file"
                  id={`receipt-file-${uploadTarget.id}`}
                  name="receiptFile"
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                />
              </div>
              <div className="wf-field full">
                <label htmlFor={`receipt-note-${uploadTarget.id}`}>
                  Note <span aria-hidden="true">(optional)</span>
                </label>
                <input
                  id={`receipt-note-${uploadTarget.id}`}
                  name="receiptNote"
                  type="text"
                  maxLength={400}
                  placeholder="Reference for this payment"
                />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button
                className="wf-button secondary"
                type="button"
                onClick={() => setUploadTarget(null)}
                disabled={busy === "receipt"}
              >
                Cancel
              </button>
              <button className="wf-button" type="submit" disabled={!!busy}>
                {busy === "receipt" ? "Uploading…" : "Submit receipt"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>
    </section>
  );
}
