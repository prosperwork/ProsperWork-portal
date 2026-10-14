"use client";

import {
  Activity,
  Camera,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  Square,
  Trophy,
  Upload,
} from "lucide-react";
import {
  formatDate,
  formatDuration,
  quizPrompts,
  studentName,
  titleCase,
  type PracticeRow,
  type StudentRow,
} from "../studio-types";

export interface StudioPracticeControlsSectionProps {
  selectedChild: StudentRow | null;
  selectedStudentTimezone: string;
  canPractice: boolean;
  isStaff: boolean;
  activeRun: PracticeRow | null;
  runningElapsed: number;
  busy: string;
  recording: boolean;
  recordingMode: "audio" | "video";
  captureError: string;
  clipError: string;
  clipBlob: Blob | null;
  clipPreviewUrl: string | null;
  clipPracticeId: string;
  clipUploading: boolean;
  keyboardNote: string;
  quizAnswers: string[];
  setQuizAnswers: React.Dispatch<React.SetStateAction<string[]>>;
  onPracticeOperation: (
    operation: "create" | "pause" | "resume" | "complete"
  ) => Promise<void>;
  onSubmitQuiz: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onStartRecording: (mode: "audio" | "video") => Promise<void>;
  onStopRecording: () => void;
  onUploadClip: () => Promise<void>;
  onDiscardClip: () => void;
  onPlayNote: (frequency: number, label: string) => void;
}

export default function StudioPracticeControlsSection({
  selectedChild,
  selectedStudentTimezone,
  canPractice,
  isStaff,
  activeRun,
  runningElapsed,
  busy,
  recording,
  recordingMode,
  captureError,
  clipError,
  clipBlob,
  clipPreviewUrl,
  clipPracticeId,
  clipUploading,
  keyboardNote,
  quizAnswers,
  setQuizAnswers,
  onPracticeOperation,
  onSubmitQuiz,
  onStartRecording,
  onStopRecording,
  onUploadClip,
  onDiscardClip,
  onPlayNote,
}: StudioPracticeControlsSectionProps) {
  return (
    <section className="studio-card" aria-labelledby="practice-title">
      <div className="studio-card-head">
        <div>
          <h2 id="practice-title">Self-guided practice</h2>
          <p>
            Start and timer state are saved by the studio. The display ticks
            locally between server updates.
          </p>
        </div>
        <Activity size={17} color="#6a9d7b" aria-hidden="true" />
      </div>
      <div className="studio-card-body">
        {!canPractice && (
          <div className="studio-permission-note">
            {isStaff
              ? "Studio staff can review scoped practice records but cannot start or alter a learner timer."
              : "Practice controls are available to an active family or student account with a visible learner."}
          </div>
        )}
        {activeRun ? (
          <div className="studio-session">
            <div className="studio-session-top">
              <div>
                <strong>{titleCase(activeRun.status)} practice</strong>
                <small>
                  {selectedChild
                    ? studentName(selectedChild)
                    : activeRun.student_id}{" "}
                  · started{" "}
                  {formatDate(activeRun.started_at, selectedStudentTimezone)}
                </small>
              </div>
              <span className={`studio-status ${activeRun.status}`}>
                {activeRun.status}
              </span>
            </div>
            <div className="studio-clock" aria-live="off">
              {formatDuration(runningElapsed)}
            </div>
            {canPractice && (
              <div className="studio-control-row">
                {activeRun.status === "paused" ? (
                  <button
                    type="button"
                    className="family-button primary"
                    onClick={() => void onPracticeOperation("resume")}
                    disabled={Boolean(busy)}
                  >
                    <Play size={13} /> Resume
                  </button>
                ) : (
                  <button
                    type="button"
                    className="family-button"
                    onClick={() => void onPracticeOperation("pause")}
                    disabled={Boolean(busy)}
                  >
                    <Pause size={13} /> Pause
                  </button>
                )}
                <button
                  type="button"
                  className="family-button"
                  onClick={() => void onPracticeOperation("complete")}
                  disabled={Boolean(busy)}
                >
                  <Square size={12} /> Finish
                </button>
              </div>
            )}
            {canPractice && activeRun.status === "running" && (
              <form className="studio-quiz" onSubmit={onSubmitQuiz}>
                <h3>
                  <Trophy
                    size={14}
                    style={{
                      verticalAlign: "text-bottom",
                      marginRight: 5,
                    }}
                  />{" "}
                  Six-prompt music quiz
                </h3>
                <p className="studio-record-help">
                  Answers are scored by the studio service and saved on this
                  practice record.
                </p>
                {quizPrompts.map((prompt, index) => (
                  <label className="studio-question" key={prompt}>
                    <span>
                      {index + 1}. {prompt}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={1}
                      inputMode="numeric"
                      aria-label={`Answer ${index + 1}: ${prompt}`}
                      value={quizAnswers[index]}
                      onChange={(event) =>
                        setQuizAnswers((previous) =>
                          previous.map((answer, i) =>
                            i === index ? event.target.value : answer
                          )
                        )
                      }
                      required
                    />
                  </label>
                ))}
                {activeRun.game_score !== null &&
                  activeRun.game_total !== null && (
                    <div className="studio-score">
                      <strong>
                        Saved result: {activeRun.game_score} /{" "}
                        {activeRun.game_total}
                      </strong>{" "}
                      · returned by the studio API
                    </div>
                  )}
                <div className="studio-actions">
                  <button
                    type="submit"
                    className="family-button primary"
                    disabled={Boolean(busy)}
                  >
                    {busy === "practice:quiz" ? (
                      <>
                        <LoaderCircle size={13} /> Scoring…
                      </>
                    ) : (
                      "Submit answers"
                    )}
                  </button>
                </div>
              </form>
            )}
            {canPractice && (
              <div className="studio-subhead">
                <span>Practice recording</span>
                <span>Not a class recording</span>
              </div>
            )}
            {canPractice && activeRun.status === "running" && !recording && (
              <div className="studio-record-controls">
                <button
                  type="button"
                  className="family-button"
                  onClick={() => void onStartRecording("audio")}
                >
                  <Mic size={13} /> Record audio
                </button>
                <button
                  type="button"
                  className="family-button"
                  onClick={() => void onStartRecording("video")}
                >
                  <Camera size={13} /> Record video
                </button>
              </div>
            )}
          </div>
        ) : canPractice ? (
          <div className="studio-empty">
            <strong>No active practice session</strong>Start a saved timer when
            the learner is ready to practice.
            <div className="studio-actions">
              <button
                type="button"
                className="family-button primary"
                onClick={() => void onPracticeOperation("create")}
                disabled={!selectedChild || Boolean(busy)}
              >
                {busy === "practice:create" ? (
                  <>
                    <LoaderCircle size={13} /> Starting…
                  </>
                ) : (
                  <>
                    <Play size={13} /> Start practice
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
        {recording && (
          <div className="studio-session">
            <p className="studio-record-help" role="status">
              Recording in progress. Stop when finished; the clip stays in this
              browser until you upload it.
            </p>
            <button
              type="button"
              className="family-button danger"
              onClick={onStopRecording}
            >
              <Square size={12} /> Stop{" "}
              {recordingMode === "video" ? "video" : "audio"}
            </button>
          </div>
        )}
        {captureError && (
          <div className="family-inline-error" role="alert">
            {captureError}
          </div>
        )}
        {clipError && (
          <div className="family-inline-error" role="alert">
            {clipError}
          </div>
        )}
        {clipBlob && clipPreviewUrl && (
          <div className="studio-session">
            <strong>Practice clip · session {clipPracticeId}</strong>
            {clipBlob.type.startsWith("video/") ? (
              <video
                className="studio-media-preview"
                src={clipPreviewUrl}
                controls
                playsInline
              />
            ) : (
              <audio
                className="studio-media-preview"
                src={clipPreviewUrl}
                controls
              />
            )}
            <p className="studio-record-help">
              {(clipBlob.size / (1024 * 1024)).toFixed(1)} MiB ·{" "}
              {clipBlob.type || "browser media"} · private practice upload
            </p>
            <div className="studio-control-row">
              <button
                type="button"
                className="family-button primary"
                onClick={() => void onUploadClip()}
                disabled={
                  clipUploading ||
                  clipBlob.size > 50 * 1024 * 1024 ||
                  !clipPracticeId
                }
              >
                {clipUploading ? (
                  <>
                    <LoaderCircle size={13} /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload size={13} /> Upload private clip
                  </>
                )}
              </button>
              <button
                type="button"
                className="family-button subtle"
                onClick={onDiscardClip}
                disabled={clipUploading}
              >
                Discard
              </button>
            </div>
          </div>
        )}
        {selectedChild && (
          <div className="studio-keyboard">
            <div className="studio-subhead">
              <span>Optional note keyboard</span>
              <span>{keyboardNote || "Web Audio · local only"}</span>
            </div>
            <p className="studio-keyboard-help">
              Sound is generated locally in your browser; nothing is uploaded.
              It is not an assessment and does not change any studio record.
            </p>
            <div
              className="studio-keys"
              role="group"
              aria-label="Play a practice reference note"
            >
              {[
                ["C4", 261.63],
                ["D4", 293.66],
                ["E4", 329.63],
                ["F4", 349.23],
                ["G4", 392],
                ["A4", 440],
                ["B4", 493.88],
                ["C5", 523.25],
              ].map(([label, frequency]) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => onPlayNote(Number(frequency), String(label))}
                  aria-label={`Play ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
