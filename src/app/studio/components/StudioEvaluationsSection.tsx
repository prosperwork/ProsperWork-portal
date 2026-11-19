"use client";

import { useState, type FormEvent } from "react";
import { Check, LoaderCircle, Plus, Star } from "lucide-react";
import { PortalModal } from "@/app/_components/PortalModal";
import {
  formatDate,
  rubric,
  titleCase,
  type EvaluationRow,
} from "../studio-types";

export interface StudioEvaluationsSectionProps {
  canEvaluate: boolean;
  evaluationsForChild: EvaluationRow[];
  timezone: string;
  busy: string;
  studentCount: number;
  studentDisplayName?: string;
  currentProfileId?: string;
  currentProfileName?: string;
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
  studentDisplayName,
  currentProfileId,
  currentProfileName,
  onSubmitEvaluation,
}: StudioEvaluationsSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [evaluationTitle, setEvaluationTitle] = useState("");
  const [evaluationScores, setEvaluationScores] = useState<
    Record<string, string>
  >({});
  const [evaluationNotes, setEvaluationNotes] = useState("");

  const isSaving = busy === "evaluation";

  const openModal = () => {
    setEvaluationTitle("");
    setEvaluationScores({});
    setEvaluationNotes("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalOpen(false);
  };

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
      setModalOpen(false);
    }
  };

  const educatorLabel = (educatorId: string) => {
    if (currentProfileId && educatorId === currentProfileId) {
      return currentProfileName || "You";
    }
    return "Academy Educator";
  };

  return (
    <>
      <section className="studio-flat-section" aria-labelledby="evaluation-title">
        <div className="studio-card-head">
          <div>
            <h2 id="evaluation-title">Educator evaluations</h2>
            <p>Rubric scores and milestone feedback from your educators.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {canEvaluate && (
              <button
                type="button"
                className="family-button primary"
                onClick={openModal}
                disabled={!studentCount}
              >
                <Plus size={14} aria-hidden="true" /> New Evaluation
              </button>
            )}
            <Star size={17} color="#6a9d7b" aria-hidden="true" />
          </div>
        </div>

        {evaluationsForChild.length ? (
          <div className="studio-card-body">
            {evaluationsForChild.map((evaluation) => (
              <article className="studio-evaluation" key={evaluation.id}>
                <h3>{evaluation.title}</h3>
                <p>
                  {formatDate(evaluation.created_at, timezone)} ·{" "}
                  {educatorLabel(evaluation.educator_id)}
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
            <strong>No evaluations yet</strong>
            {canEvaluate
              ? "Click “New Evaluation” above to record rubric scores and notes."
              : "Educator evaluations will appear here once shared."}
          </div>
        )}
      </section>

      <PortalModal
        open={modalOpen}
        onClose={closeModal}
        eyebrow={studentDisplayName || "Student Evaluation"}
        title="New Educator Evaluation"
        subtitle="Record whole-number rubric scores (0–100) and constructive feedback."
        size="lg"
        busy={isSaving}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gap: 14 }}>
            <div className="studio-field">
              <label htmlFor="evaluation-heading">Evaluation title</label>
              <input
                id="evaluation-heading"
                value={evaluationTitle}
                onChange={(event) => setEvaluationTitle(event.target.value)}
                placeholder="e.g. Term 2 Technique & Sight-Reading Check"
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
                    placeholder="0–100"
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
                placeholder="Highlight strengths and next focus areas…"
                maxLength={4000}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="family-button subtle"
              onClick={closeModal}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="family-button primary"
              disabled={isSaving || !studentCount}
            >
              {isSaving ? (
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
      </PortalModal>
    </>
  );
}
