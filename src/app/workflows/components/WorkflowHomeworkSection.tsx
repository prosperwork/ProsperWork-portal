"use client";

import { useMemo, useState, type FormEvent } from "react";
import { MessageSquareCheck, Plus, Upload } from "lucide-react";
import { PortalModal } from "@/app/_components/PortalModal";
import {
  bytesLabel,
  dateLabel,
  Empty,
  maxHomeworkBytes,
  type FileMetadata,
  type HomeworkItem,
  type WorkflowData,
  type WorkflowHomeworkItem,
} from "../workflow-types";

type HomeworkFilter = "all" | "assigned" | "submitted" | "reviewed";

export interface WorkflowHomeworkSectionProps {
  data: WorkflowData;
  canViewHomework: boolean;
  canAssignHomework: boolean;
  isReviewer: boolean;
  isFamily: boolean;
  isHomeworkRoute: boolean;
  assignedHomework: HomeworkItem[];
  busy: string;
  filesFor: (
    category: "receipt" | "homework",
    targetId: string
  ) => FileMetadata[];
  onOpenAssignModal?: () => void;
  submitHomework: (
    homeworkId: string,
    file: File | null,
    note: string
  ) => Promise<boolean>;
  review: (item: HomeworkItem, feedbackText: string) => Promise<boolean>;
}

export default function WorkflowHomeworkSection({
  data,
  canViewHomework,
  canAssignHomework,
  isReviewer,
  isFamily,
  isHomeworkRoute,
  assignedHomework,
  busy,
  filesFor,
  onOpenAssignModal,
  submitHomework,
  review,
}: WorkflowHomeworkSectionProps) {
  const [statusFilter, setStatusFilter] = useState<HomeworkFilter>("all");

  // Submit Practice modal state
  const [submitTarget, setSubmitTarget] = useState<WorkflowHomeworkItem | null>(
    null
  );
  const [practiceNote, setPracticeNote] = useState("");
  const [practiceFile, setPracticeFile] = useState<File | null>(null);

  // Review & Give Feedback modal state
  const [reviewTarget, setReviewTarget] = useState<WorkflowHomeworkItem | null>(
    null
  );
  const [feedbackText, setFeedbackText] = useState("");

  const counts = useMemo(
    () => ({
      all: data.homework.length,
      assigned: data.homework.filter((h) => h.status === "assigned").length,
      submitted: data.homework.filter((h) => h.status === "submitted").length,
      reviewed: data.homework.filter((h) => h.status === "reviewed").length,
    }),
    [data.homework]
  );

  const visibleHomework = useMemo(() => {
    if (statusFilter === "all") return data.homework;
    return data.homework.filter((item) => item.status === statusFilter);
  }, [data.homework, statusFilter]);

  if (!canViewHomework) return null;

  const handleSubmitPractice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submitTarget) return;
    const ok = await submitHomework(
      submitTarget.id,
      practiceFile,
      practiceNote.trim()
    );
    if (ok) {
      setSubmitTarget(null);
      setPracticeNote("");
      setPracticeFile(null);
    }
  };

  const handleSubmitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewTarget) return;
    const ok = await review(reviewTarget, feedbackText.trim());
    if (ok) {
      setReviewTarget(null);
      setFeedbackText("");
    }
  };

  return (
    <section className="wf-card" aria-labelledby="homework-heading">
      <header className="wf-card-head">
        <div className="wf-head-copy">
          <div>
            <h2 id="homework-heading">Homework &amp; feedback</h2>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="wf-count">{assignedHomework.length} assigned</span>
          {canAssignHomework && onOpenAssignModal && !isHomeworkRoute && (
            <button
              type="button"
              className="wf-button"
              onClick={onOpenAssignModal}
            >
              <Plus size={13} />+ Assign Homework
            </button>
          )}
        </div>
      </header>

      {data.homework.length > 0 && (
        <div
          className="portal-tabs"
          role="tablist"
          aria-label="Filter homework by status"
          style={{ padding: "0 18px 10px", marginBottom: 0 }}
        >
          {(
            [
              { key: "all", label: "All" },
              { key: "assigned", label: "Assigned" },
              { key: "submitted", label: "Submitted" },
              { key: "reviewed", label: "Reviewed" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.key}
              className={`portal-tab ${
                statusFilter === tab.key ? "active" : ""
              }`}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
              <span className="portal-tab-badge">{counts[tab.key]}</span>
            </button>
          ))}
        </div>
      )}

      {visibleHomework.length ? (
        <div className="wf-records">
          {visibleHomework.map((item) => {
            const attached = filesFor("homework", item.id);
            return (
              <article className="wf-record" key={item.id}>
                <div className="wf-record-main">
                  <div className="wf-record-title">
                    {item.studentName} · {item.title}
                    <span
                      className={`wf-pill ${
                        item.status === "reviewed"
                          ? "good"
                          : item.status === "submitted"
                            ? "wait"
                            : ""
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="wf-record-meta">
                    Due {dateLabel(item.dueDate)} · {item.teacherName}
                  </div>
                  {item.note && (
                    <p className="wf-record-note">
                      <strong>Assignment guidance:</strong> {item.note}
                    </p>
                  )}
                  {item.submissionNote && (
                    <p className="wf-record-note">
                      <strong>Practice reflection:</strong>{" "}
                      {item.submissionNote}
                    </p>
                  )}
                  {item.status === "reviewed" && item.feedback && (
                    <p className="wf-record-note">
                      <strong>Teacher feedback:</strong> {item.feedback}
                    </p>
                  )}
                  {attached.map((file) => (
                    <p className="wf-record-meta" key={file.id}>
                      <a
                        className="wf-link"
                        href={`/api/files?id=${encodeURIComponent(file.id)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {file.original_name}
                      </a>{" "}
                      · {bytesLabel(file.bytes)}
                    </p>
                  ))}
                  {item.mediaName && !attached.length && (
                    <p className="wf-record-meta">
                      Attachment: {item.mediaName}
                    </p>
                  )}

                  {/* Contextual Modal Triggers */}
                  <div
                    className="wf-review-actions"
                    style={{ marginTop: 10, display: "flex", gap: 8 }}
                  >
                    {isFamily && item.status === "assigned" && (
                      <button
                        type="button"
                        className="wf-button"
                        disabled={!!busy}
                        onClick={() => {
                          setPracticeNote("");
                          setPracticeFile(null);
                          setSubmitTarget(item);
                        }}
                      >
                        <Upload size={13} /> Submit Practice
                      </button>
                    )}

                    {isReviewer && item.status === "submitted" && (
                      <button
                        type="button"
                        className="wf-button"
                        disabled={!!busy}
                        onClick={() => {
                          setFeedbackText("");
                          setReviewTarget(item);
                        }}
                      >
                        <MessageSquareCheck size={13} /> Review &amp; Give
                        Feedback
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            data.homework.length
              ? `No ${statusFilter} homework`
              : "No homework has been shared"
          }
          detail={
            data.homework.length
              ? "Switch status tabs above to view other assignments."
              : "Assigned practice and submitted work will appear here when available."
          }
        />
      )}

      {/* Submit Practice Modal */}
      <PortalModal
        open={Boolean(submitTarget)}
        onClose={() => setSubmitTarget(null)}
        eyebrow="Student practice submission"
        title={submitTarget ? submitTarget.title : "Submit practice"}
        subtitle={
          submitTarget
            ? `${submitTarget.studentName} · due ${dateLabel(
                submitTarget.dueDate
              )} · ${submitTarget.teacherName}`
            : undefined
        }
        size="md"
        busy={busy === "homework"}
      >
        {submitTarget && (
          <form
            className="wf-form"
            style={{ padding: 0, border: "none", background: "transparent" }}
            onSubmit={handleSubmitPractice}
          >
            {submitTarget.note && (
              <p className="wf-record-note" style={{ marginTop: 0 }}>
                <strong>Teacher guidance:</strong> {submitTarget.note}
              </p>
            )}
            <div className="wf-form-grid">
              <div className="wf-field full">
                <label htmlFor="modal-homework-note">Practice reflection</label>
                <textarea
                  id="modal-homework-note"
                  required
                  rows={4}
                  maxLength={3000}
                  value={practiceNote}
                  onChange={(e) => setPracticeNote(e.target.value)}
                  placeholder="What did your child practise? What felt comfortable, and what would they like help with?"
                />
              </div>
              <div className="wf-field full">
                <label htmlFor="modal-homework-file">
                  Optional video, image or document (Max{" "}
                  {maxHomeworkBytes / (1024 * 1024)}MB)
                </label>
                <input
                  className="wf-file"
                  id="modal-homework-file"
                  type="file"
                  accept=".mp4,.webm,.pdf,.png,.jpg,.jpeg,video/mp4,video/webm,application/pdf,image/png,image/jpeg"
                  onChange={(e) => setPracticeFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="wf-button secondary"
                onClick={() => setSubmitTarget(null)}
                disabled={busy === "homework"}
              >
                Cancel
              </button>
              <button
                className="wf-button"
                type="submit"
                disabled={!!busy || !practiceNote.trim()}
              >
                {busy === "homework" ? "Submitting…" : "Submit Practice"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>

      {/* Review & Give Feedback Modal */}
      <PortalModal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        eyebrow="Teacher review"
        title="Review & give feedback"
        subtitle={
          reviewTarget
            ? `${reviewTarget.studentName} · ${reviewTarget.title}`
            : undefined
        }
        size="md"
        busy={Boolean(reviewTarget) && busy === `review-${reviewTarget?.id}`}
      >
        {reviewTarget && (
          <form
            className="wf-form"
            style={{ padding: 0, border: "none", background: "transparent" }}
            onSubmit={handleSubmitReview}
          >
            {reviewTarget.submissionNote && (
              <p className="wf-record-note" style={{ marginTop: 0 }}>
                <strong>Student reflection:</strong>{" "}
                {reviewTarget.submissionNote}
              </p>
            )}
            <div className="wf-form-grid">
              <div className="wf-field full">
                <label htmlFor="modal-review-feedback">Teacher feedback</label>
                <textarea
                  id="modal-review-feedback"
                  required
                  rows={4}
                  maxLength={3000}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Offer a useful next step or celebrate a specific improvement."
                />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="wf-button secondary"
                onClick={() => setReviewTarget(null)}
                disabled={busy === `review-${reviewTarget.id}`}
              >
                Cancel
              </button>
              <button
                className="wf-button"
                type="submit"
                disabled={!!busy || !feedbackText.trim()}
              >
                {busy === `review-${reviewTarget.id}`
                  ? "Saving…"
                  : "Save Feedback"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>
    </section>
  );
}
