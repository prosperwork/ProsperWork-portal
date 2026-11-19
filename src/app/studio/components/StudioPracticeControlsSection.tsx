"use client";

import { useState } from "react";
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
import { PortalModal } from "@/app/_components/PortalModal";
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
  ) => Promise<boolean>;
  onSubmitQuiz: (event: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
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
  const [quizModalOpen, setQuizModalOpen] = useState(false);

  if (!canPractice) return null;

  const handleQuizSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    const ok = await onSubmitQuiz(event);
    if (ok) {
      setQuizModalOpen(false);
    }
  };

  return (
    <>
      <section className="studio-card" aria-labelledby="practice-title">
        <div className="studio-card-head">
          <div>
            <h2 id="practice-title">Self-guided practice</h2>
            <p>
              Track your practice timer, record clips, and test your music
              theory.
            </p>
          </div>
          <Activity size={17} color="#6a9d7b" aria-hidden="true" />
        </div>
        <div className="studio-card-body">
          {activeRun ? (
            <div className="studio-session">
              <div className="studio-session-top">
                <div>
                  <strong>{titleCase(activeRun.status)} practice</strong>
                  <small>
                    {selectedChild ? studentName(selectedChild) : "Student"} ·
                    started{" "}
                    {formatDate(activeRun.started_at, selectedStudentTimezone)}
                  </small>
                </div>
                <span className={`studio-status ${activeRun.status}`}>
                  {titleCase(activeRun.status)}
                </span>
              </div>
              <div className="studio-clock" aria-live="off">
                {formatDuration(runningElapsed)}
              </div>
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
                {activeRun.status === "running" && (
                  <button
                    type="button"
                    className="family-button"
                    onClick={() => setQuizModalOpen(true)}
                    disabled={Boolean(busy)}
                  >
                    <Trophy size={13} aria-hidden="true" /> Take Practice Quiz
                  </button>
                )}
              </div>

              {activeRun.game_score !== null &&
                activeRun.game_total !== null && (
                  <div className="studio-score" style={{ marginTop: 12 }}>
                    <Trophy
                      size={13}
                      style={{
                        verticalAlign: "text-bottom",
                        marginRight: 5,
                      }}
                    />
                    <strong>
                      Saved quiz score: {activeRun.game_score} /{" "}
                      {activeRun.game_total}
                    </strong>
                  </div>
                )}

              <div className="studio-subhead">
                <span>Practice recording</span>
                <span>Private to your studio</span>
              </div>
              {activeRun.status === "running" && !recording && (
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
          ) : (
            <div className="studio-empty">
              <strong>Ready to practice?</strong>
              Start a session to track your practice time and build your daily
              streak.
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
          )}

          {recording && (
            <div className="studio-session">
              <p className="studio-record-help" role="status">
                Recording in progress. Click stop when you are ready to preview
                and upload your clip.
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
              <strong>Recorded practice clip</strong>
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
                {(clipBlob.size / (1024 * 1024)).toFixed(1)} MiB · ready to save
                to your practice log
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
                      <Upload size={13} /> Save clip
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
                <span>Reference keyboard</span>
                <span>{keyboardNote || "Tap a key to hear pitch"}</span>
              </div>
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

      <PortalModal
        open={quizModalOpen && Boolean(activeRun?.status === "running")}
        onClose={() => {
          if (busy !== "practice:quiz") setQuizModalOpen(false);
        }}
        eyebrow="Music Theory Check"
        title="Practice Quiz"
        subtitle="Answer all six quick rhythm and pitch questions to save your score on this session."
        size="md"
        busy={busy === "practice:quiz"}
      >
        <form onSubmit={(event) => void handleQuizSubmit(event)}>
          <div style={{ display: "grid", gap: 10 }}>
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
          </div>
          {activeRun &&
            activeRun.game_score !== null &&
            activeRun.game_total !== null && (
              <div className="studio-score" style={{ marginTop: 12 }}>
                <strong>
                  Last saved score: {activeRun.game_score} /{" "}
                  {activeRun.game_total}
                </strong>
              </div>
            )}
          <div className="modal-actions">
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setQuizModalOpen(false)}
              disabled={busy === "practice:quiz"}
            >
              Cancel
            </button>
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
                <>
                  <Trophy size={13} /> Submit answers
                </>
              )}
            </button>
          </div>
        </form>
      </PortalModal>
    </>
  );
}
