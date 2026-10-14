"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Check, Star } from "lucide-react";
import {
  rubric,
  titleCase,
  formatDate,
  type EvaluationRow,
} from "../studio-types";

export interface StudioEvaluationsSectionProps {
  canEvaluate: boolean;
  evaluationsForChild: EvaluationRow[];
  timezone: string;
  busy: string;
  studentCount: number;
  onSubmitEvaluation: (evaluation: {
    title: string;
    scores: Record<string, string>;
    notes: string;
  }) => Promise<boolean>;
}

export default function StudioEvaluationsSection({
  canEvaluate,
  evaluationsForChild,
  timezone,
  busy,
  studentCount,
  onSubmitEvaluation,
}: StudioEvaluationsSectionProps) {
  const [evaluationTitle, setEvaluationTitle] = useState("");
  const [evaluationScores, setEvaluationScores] = useState<
    Record<string, string>
  >({});
  const [evaluationNotes, setEvaluationNotes] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onSubmitEvaluation({
      title: evaluationTitle.trim(),
      scores: evaluationScores,
      notes: evaluationNotes.trim(),
    });
    if (ok) {
      setEvaluationTitle("");
      setEvaluationScores({});
      setEvaluationNotes("");
    }
  };

  return (
    <section className="studio-flat-section" aria-labelledby="evaluation-title">
      <div className="studio-card-head">
        <div>
          <h2 id="evaluation-title">Educator evaluations</h2>
          <p>
            Saved rubric scores and notes. No score is calculated or supplied by
            this screen.
          </p>
        </div>
        <Star size={17} color="#6a9d7b" aria-hidden="true" />
      </div>
      {canEvaluate && (
        <form className="studio-card-body" onSubmit={handleSubmit}>
          <div className="studio-field">
            <label htmlFor="evaluation-heading">Evaluation title</label>
            <input
              id="evaluation-heading"
              value={evaluationTitle}
              onChange={(event) => setEvaluationTitle(event.target.value)}
              required
              maxLength={160}
            />
          </div>
          <div className="studio-score-grid">
            {rubric.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  value={evaluationScores[key] ?? ""}
                  onChange={(event) =>
                    setEvaluationScores((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            ))}
          </div>
          <div className="studio-field">
            <label htmlFor="evaluation-notes">Educator notes</label>
            <textarea
              id="evaluation-notes"
              value={evaluationNotes}
              onChange={(event) => setEvaluationNotes(event.target.value)}
              maxLength={4000}
            />
          </div>
          <div className="studio-actions">
            <button
              type="submit"
              className="family-button primary"
              disabled={busy === "evaluation" || !studentCount}
            >
              {busy === "evaluation" ? (
                <>
                  <LoaderCircle size={13} /> Saving…
                </>
              ) : (
                <>
                  <Check size={13} /> Save evaluation
                </>
              )}
            </button>
          </div>
        </form>
      )}
      {evaluationsForChild.length ? (
        <div className="studio-card-body">
          {evaluationsForChild.map((evaluation) => (
            <article className="studio-evaluation" key={evaluation.id}>
              <h3>{evaluation.title}</h3>
              <p>
                {formatDate(evaluation.created_at, timezone)} · Educator{" "}
                {evaluation.educator_id}
              </p>
              <div className="studio-policy-score">
                {Object.entries(evaluation.scores).map(([key, value]) => (
                  <span className="studio-status" key={key}>
                    {titleCase(key)} · {value}
                  </span>
                ))}
              </div>
              {evaluation.notes && <p>{evaluation.notes}</p>}
            </article>
          ))}
        </div>
      ) : (
        <div className="studio-empty">
          <strong>No saved evaluations</strong>Only educator evaluations
          returned for this student appear here.
        </div>
      )}
    </section>
  );
}
