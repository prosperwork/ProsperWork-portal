"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import { type HiringCase, type HiringReview } from "@/lib/academy/hiring";
import { reviewLabels, type ReviewKind } from "../hiring-types";

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
  staffName,
  onSubmitReview,
  onSelectApplicant,
}: HiringReviewFormProps) {
  const [reviewKind, setReviewKind] = useState<ReviewKind>("hr_interview");
  const [reviewScore, setReviewScore] = useState("");
  const [reviewPassed, setReviewPassed] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [selectionNotes, setSelectionNotes] = useState("");

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
    }
  };

  const handleSelect = async () => {
    const ok = await onSelectApplicant(selectionNotes);
    if (ok) {
      setSelectionNotes("");
    }
  };

  return (
    <section className="hire-section" aria-labelledby="review-status-heading">
      <div className="hire-section-head">
        <h3 id="review-status-heading">Interview and training record</h3>
        <span>Saved reviews only</span>
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
        if (
          !review &&
          kindValue === "audition" &&
          selectedCase.desired_role !== "teacher"
        ) {
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
            become available at the recorded time.
          </p>
        </div>
      )}

      {reviewOptions.length > 0 && (
        <form className="hire-review-form" onSubmit={handleSubmit}>
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
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>

          <div className="hire-actions">
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
                "Append review"
              )}
            </button>
          </div>
        </form>
      )}

      {maySelect && (
        <div className="hire-review-form">
          <div className="hire-callout">
            <CheckCircle2 size={14} />
            <p>
              Independent passing HR and departmental interviews
              {selectedCase.desired_role === "teacher"
                ? ", plus a passing teacher audition,"
                : ""}{" "}
              are present in the saved record.
            </p>
          </div>
          <div className="hire-form-field" style={{ marginTop: 9 }}>
            <label htmlFor="select-notes">
              Selection rationale · at least 5 characters
            </label>
            <textarea
              id="select-notes"
              minLength={5}
              maxLength={2000}
              value={selectionNotes}
              onChange={(event) => setSelectionNotes(event.target.value)}
            />
          </div>
          <div className="hire-actions">
            <button
              type="button"
              className="hire-button primary"
              onClick={handleSelect}
              disabled={
                !isActive ||
                selectionNotes.trim().length < 5 ||
                busy.startsWith("select:")
              }
            >
              Select applicant
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
