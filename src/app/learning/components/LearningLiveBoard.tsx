"use client";

import { Check, Download, FileText, Plus, Save, Video } from "lucide-react";
import type { LiveBoard } from "@/lib/academy/learning";
import type {
  BoardDraft,
  LearningLesson,
  LessonRecording,
} from "../learning-types";

interface LearningLiveBoardProps {
  selectedLesson: LearningLesson | null;
  selectedBoard: LiveBoard | null;
  boardStatus: "clean" | "dirty" | "saving" | "saved" | "conflict" | "error";
  saveStatusText: string;
  draft: BoardDraft;
  topicInput: string;
  setTopicInput: (val: string) => void;
  canEditBoard: boolean;
  isConflict: boolean;
  conflictMessage: string;
  isDirty: boolean;
  onReplaceDraft: (next: BoardDraft, dirty: boolean) => void;
  onSaveBoard: () => void;
  onReloadBoard: () => void;
  onKeepDraftForCopy: () => void;
  onAddTopic: () => void;
  hasLessons: boolean;
  recordings?: LessonRecording[];
  canDownloadRecordings?: boolean;
}

export default function LearningLiveBoard({
  selectedLesson,
  selectedBoard,
  boardStatus,
  saveStatusText,
  draft,
  topicInput,
  setTopicInput,
  canEditBoard,
  isConflict,
  conflictMessage,
  isDirty,
  onReplaceDraft,
  onSaveBoard,
  onReloadBoard,
  onKeepDraftForCopy,
  onAddTopic,
  hasLessons,
  recordings = [],
  canDownloadRecordings = false,
}: LearningLiveBoardProps) {
  return (
    <section
      className="learn-card learn-board-card"
      aria-labelledby="board-title"
    >
      <div className="learn-card-head">
        <div>
          <h2 id="board-title">
            {selectedLesson ? selectedLesson.title : "Lesson board"}
          </h2>
          <p>
            {selectedLesson
              ? `Shared board · ${selectedLesson.status}`
              : "Choose an assigned lesson to open its shared board."}
          </p>
        </div>
        <span className={`learn-save-state ${boardStatus}`} role="status">
          <i />
          {saveStatusText}
        </span>
      </div>

      {selectedLesson ? (
        <div className="learn-card-body">
          {isConflict && (
            <div className="learn-alert" role="alert">
              <div>
                <strong>Newer changes need your attention</strong>
                <p>
                  {conflictMessage ||
                    "Autosave has stopped so a newer version is not overwritten. Copy your draft if needed, then reload the current board."}
                </p>
              </div>
              <div className="learn-stack">
                <button
                  type="button"
                  className="learn-button subtle"
                  onClick={onKeepDraftForCopy}
                >
                  Copy my draft
                </button>
                <button
                  type="button"
                  className="learn-button primary"
                  onClick={onReloadBoard}
                >
                  Reload latest
                </button>
              </div>
            </div>
          )}

          <div className="learn-board-meta">
            <span>
              Shared lesson board · Revision {selectedBoard?.revision ?? 0}
            </span>
            {canEditBoard && isDirty && !isConflict && (
              <button
                type="button"
                className="learn-button"
                onClick={onSaveBoard}
                disabled={boardStatus === "saving"}
              >
                <Save size={13} />{" "}
                {boardStatus === "error" ? "Retry save" : "Save now"}
              </button>
            )}
          </div>

          <div className="learn-field">
            <label htmlFor="lesson-notes">
              Lesson notes {canEditBoard ? "" : "(read only)"}
            </label>
            <textarea
              id="lesson-notes"
              value={draft.notes}
              readOnly={!canEditBoard || isConflict}
              onChange={(e) =>
                onReplaceDraft({ ...draft, notes: e.target.value }, true)
              }
              placeholder="Notes from the lesson will appear here."
            />
          </div>

          <div className="learn-field">
            <label htmlFor="original-notes">Original lesson notes</label>
            <textarea
              id="original-notes"
              value={
                selectedBoard?.original_notes ?? selectedLesson.notes ?? ""
              }
              readOnly
              aria-describedby="original-notes-help"
            />
            <small id="original-notes-help">
              This original record is read-only and will not be changed by board
              edits.
            </small>
          </div>

          <div className="learn-field">
            <label htmlFor="next-topics">
              Next topics {canEditBoard ? "" : "(read only)"}
            </label>
            <textarea
              id="next-topics"
              value={draft.nextTopics}
              readOnly={!canEditBoard || isConflict}
              onChange={(e) =>
                onReplaceDraft({ ...draft, nextTopics: e.target.value }, true)
              }
              placeholder="Add a focus for the next lesson."
            />
          </div>

          <div className="learn-field">
            <label>Completed topics</label>
            {draft.completedTopics.length ? (
              draft.completedTopics.map((topic) => (
                <label className="learn-topic-check" key={topic}>
                  <input
                    type="checkbox"
                    checked
                    disabled={!canEditBoard || isConflict}
                    onChange={(e) => {
                      if (!e.target.checked) {
                        onReplaceDraft(
                          {
                            ...draft,
                            completedTopics: draft.completedTopics.filter(
                              (item) => item !== topic
                            ),
                          },
                          true
                        );
                      }
                    }}
                  />
                  <Check size={13} aria-hidden="true" />
                  <span>{topic}</span>
                </label>
              ))
            ) : (
              <small>No completed topics have been marked yet.</small>
            )}

            {canEditBoard && (
              <div className="learn-topic-entry">
                <label className="learn-visually-hidden" htmlFor="topic-add">
                  Topic to mark complete
                </label>
                <input
                  id="topic-add"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddTopic();
                    }
                  }}
                  disabled={isConflict}
                  placeholder="Add a completed topic"
                />
                <button
                  type="button"
                  className="learn-button"
                  onClick={onAddTopic}
                  disabled={isConflict || !topicInput.trim()}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            )}
          </div>

          {/* Class Lesson Recordings */}
          <div className="learn-field" style={{ marginTop: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Video size={14} color="#1c7a5d" /> Class Recordings (
              {recordings.length})
            </label>
            {recordings.length ? (
              <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                {recordings.map((rec) => (
                  <div
                    key={rec.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "#f4f8f5",
                      border: "1px solid #dce8e0",
                      borderRadius: 8,
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          fontSize: 11,
                          color: "#1c7a5d",
                          display: "block",
                        }}
                      >
                        {rec.original_name}
                      </strong>
                      <small style={{ fontSize: 9, color: "#718078" }}>
                        Recorded{" "}
                        {new Date(rec.created_at).toLocaleDateString(
                          undefined,
                          { dateStyle: "medium" }
                        )}{" "}
                        · {(rec.bytes / (1024 * 1024)).toFixed(1)} MB
                      </small>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <a
                        href={`/api/files?id=${encodeURIComponent(rec.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="learn-button primary"
                        style={{
                          padding: "4px 10px",
                          fontSize: 11,
                          textDecoration: "none",
                        }}
                      >
                        <Video size={12} /> Play
                      </a>
                      {canDownloadRecordings && (
                        <a
                          href={`/api/files?id=${encodeURIComponent(
                            rec.id
                          )}&download=1`}
                          className="learn-button subtle"
                          style={{
                            padding: "4px 10px",
                            fontSize: 11,
                            textDecoration: "none",
                          }}
                          download={rec.original_name}
                        >
                          <Download size={12} /> Download
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <small style={{ color: "#718078" }}>
                No class recordings uploaded for this lesson yet. When an
                educator records the class, it will appear here for student and
                family review.
              </small>
            )}
          </div>

          {!canEditBoard && (
            <p className="learn-file-help">
              This board is read-only for your account. Board access follows the
              lesson assignment and academy permissions.
            </p>
          )}
        </div>
      ) : (
        <div className="learn-empty">
          <span className="learn-empty-mark">
            <FileText size={17} />
          </span>
          <strong>
            {hasLessons ? "No lesson selected" : "No lessons assigned"}
          </strong>
          <p>
            {hasLessons
              ? "Choose one of your assigned lessons above to view its notes and practice plan."
              : "Lesson notes and practice plans will appear here when lessons are assigned."}
          </p>
        </div>
      )}
    </section>
  );
}
