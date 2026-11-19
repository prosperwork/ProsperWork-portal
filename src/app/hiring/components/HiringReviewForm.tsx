"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Plus,
  UserCheck,
} from "lucide-react";
import { type HiringCase, type HiringReview } from "@/lib/academy/hiring";
import { PortalModal } from "@/app/_components/PortalModal";
import {
  isMusicEducationRole,
  reviewLabels,
  type ReviewKind,
} from "../hiring-types";

export interface HiringReviewFormProps {
  selectedCase: HiringCase;
  reviewsForCase: HiringReview[];
  reviewWhen: boolean;
  hrReview: HiringReview | null;
  hrReviewerRole: string;
  reviewOptions: ReviewKind[];
  allowedReviewKinds: Set<ReviewKind>;
  maySelect: boolean;
  isActive: boolean;
  busy: string;
  actionError?: string;
  staffName: (id: string) => string;
  onSubmitReview: (formData: {
    kind: ReviewKind;
    score: number;
    passed: boolean;
    notes: string;
  }) => Promise<boolean>;
  onSelectApplicant: (notes: string) => Promise<boolean>;
}

export default function HiringReviewForm({
  selectedCase,
  reviewsForCase,
  reviewWhen,
  hrReview,
  hrReviewerRole,
  reviewOptions,
  allowedReviewKinds,
  maySelect,
  isActive,
  busy,
  actionError,
  staffName,
  onSubmitReview,
  onSelectApplicant,
}: HiringReviewFormProps) {
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectModalOpen, setSelectModalOpen] = useState(false);

  const [reviewKind, setReviewKind] = useState<ReviewKind>("hr_interview");
  const [reviewScore, setReviewScore] = useState("");
  const [reviewPassed, setReviewPassed] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [selectionNotes, setSelectionNotes] = useState("");

  const needsAudition = isMusicEducationRole(selectedCase.desired_role);

  const reviewOf = (kind: ReviewKind) =>
    reviewsForCase.find((review) => review.kind === kind) ?? null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const kindToSave = allowedReviewKinds.has(reviewKind)
      ? reviewKind
      : reviewOptions[0];
    if (!kindToSave) return;
    const numericScore = Number(reviewScore);
    const ok = await onSubmitReview({
      kind: kindToSave,
      score: numericScore,
      passed: reviewPassed,
      notes: reviewNotes,
    });
    if (ok) {
      setReviewNotes("");
      setReviewPassed(false);
      setReviewScore("");
      setReviewModalOpen(false);
    }
  };

  const handleSelect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onSelectApplicant(selectionNotes);
    if (ok) {
      setSelectionNotes("");
      setSelectModalOpen(false);
    }
  };

  return (
    <section className="hire-section" aria-labelledby="review-status-heading">
      <div
        className="hire-section-head"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 id="review-status-heading">Interview and training record</h3>
          <span>Saved reviews only</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {reviewOptions.length > 0 && (
            <button
              type="button"
              className="hire-button primary"
              onClick={() => {
                setReviewKind(reviewOptions[0]);
                setReviewModalOpen(true);
              }}
              disabled={!isActive || Boolean(busy)}
            >
              <Plus size={13} />+ Record Review
            </button>
          )}
          {maySelect && (
            <button
              type="button"
              className="hire-button primary"
              onClick={() => setSelectModalOpen(true)}
              disabled={!isActive || Boolean(busy)}
            >
              <UserCheck size={13} /> Select Candidate
            </button>
          )}
        </div>
      </div>

      {(
        [
          "hr_interview",
          "department_interview",
          "audition",
          "training",
        ] as ReviewKind[]
      ).map((kindValue) => {
        const review = reviewOf(kindValue);
        if (!review && kindValue === "audition" && !needsAudition) {
          return null;
        }
        return (
          <div className="hire-review" key={kindValue}>
            <div>
              <strong>{reviewLabels[kindValue]}</strong>
              <small>
                {review ? staffName(review.reviewer_id) : "Awaiting review"}
              </small>
            </div>
            {review ? (
              <>
                <span className="hire-pill">{review.score}/100</span>
                <span
                  className={`hire-pill ${
                    review.passed ? "ready" : "rejected"
                  }`}
                >
                  {review.passed ? "Passed" : "Not passed"}
                </span>
                <span className="hire-review-note">{review.notes}</span>
              </>
            ) : (
              <span className="hire-pill">Not recorded</span>
            )}
          </div>
        );
      })}

      {hrReview && hrReviewerRole !== "hr" && (
        <div className="hire-callout warning">
          <AlertCircle size={14} />
          <p>
            Selection is blocked: the saved HR interview reviewer is not
            currently returned as active HR. The record is immutable; ask the
            academy Owner to review it before proceeding.
          </p>
        </div>
      )}

      {selectedCase.stage === "interview" && !reviewWhen && (
        <div className="hire-callout warning">
          <Clock3 size={14} />
          <p>
            The scheduled joint interview has not started yet. Interview reviews
            become available 15 minutes before the recorded time.
          </p>
        </div>
      )}

      {maySelect && (
        <div className="hire-callout" style={{ marginTop: 10 }}>
          <CheckCircle2 size={14} />
          <p>
            Independent passing HR and departmental interviews
            {needsAudition ? ", plus a passing music audition," : ""} are
            present in the saved record. You can now select this candidate.
          </p>
        </div>
      )}

      {/* Record Review Modal */}
      <PortalModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        eyebrow="Hiring evaluation"
        title="Record review"
        subtitle={`${selectedCase.name} · reviews are immutable once saved`}
        size="md"
        busy={busy.startsWith("review:")}
      >
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}

          <div className="hire-form-field">
            <label htmlFor="review-kind">Review being recorded</label>
            <select
              id="review-kind"
              value={
                allowedReviewKinds.has(reviewKind)
                  ? reviewKind
                  : reviewOptions[0]
              }
              onChange={(event) =>
                setReviewKind(event.target.value as ReviewKind)
              }
            >
              {reviewOptions.map((value) => (
                <option value={value} key={value}>
                  {reviewLabels[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="hire-form-row">
            <div className="hire-form-field">
              <label htmlFor="review-score">
                Score · 0–100, entered by reviewer
              </label>
              <input
                id="review-score"
                type="number"
                min={0}
                max={100}
                step={1}
                value={reviewScore}
                onChange={(event) => setReviewScore(event.target.value)}
                required
              />
            </div>
            <div className="hire-form-field">
              <label>Outcome</label>
              <label className="hire-check">
                <input
                  type="checkbox"
                  checked={reviewPassed}
                  onChange={(event) => setReviewPassed(event.target.checked)}
                />{" "}
                Reviewer marks this review as passed
              </label>
            </div>
          </div>

          <div className="hire-form-field">
            <label htmlFor="review-notes">
              Review notes · 5–2000 characters
            </label>
            <textarea
              id="review-notes"
              rows={4}
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>

          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setReviewModalOpen(false)}
              disabled={busy.startsWith("review:")}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hire-button primary"
              disabled={!isActive || Boolean(busy)}
            >
              {busy.startsWith("review:") ? (
                <>
                  <LoaderCircle size={13} /> Saving…
                </>
              ) : (
                "Save review"
              )}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Select Candidate Modal */}
      <PortalModal
        open={selectModalOpen}
        onClose={() => setSelectModalOpen(false)}
        eyebrow="Stage progression"
        title="Select candidate"
        subtitle={`Move ${selectedCase.name} from Interview to Selected`}
        size="sm"
        busy={busy.startsWith("select:")}
      >
        <form onSubmit={handleSelect} style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}

          <div className="hire-callout">
            <CheckCircle2 size={14} />
            <p>
              Independent passing HR and departmental interviews
              {needsAudition ? ", plus a passing music audition," : ""} are
              verified.
            </p>
          </div>

          <div className="hire-form-field">
            <label htmlFor="select-notes">
              Selection rationale · at least 5 characters
            </label>
            <textarea
              id="select-notes"
              rows={3}
              minLength={5}
              maxLength={2000}
              required
              value={selectionNotes}
              onChange={(event) => setSelectionNotes(event.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setSelectModalOpen(false)}
              disabled={busy.startsWith("select:")}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hire-button primary"
              disabled={
                !isActive ||
                selectionNotes.trim().length < 5 ||
                busy.startsWith("select:")
              }
            >
              {busy.startsWith("select:") ? (
                <>
                  <LoaderCircle size={13} /> Selecting…
                </>
              ) : (
                "Confirm Selection"
              )}
            </button>
          </div>
        </form>
      </PortalModal>
    </section>
  );
}
