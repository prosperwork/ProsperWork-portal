"use client";

import { useState, type FormEvent } from "react";
import {
  bytesLabel,
  dateLabel,
  Empty,
  maxHomeworkBytes,
  type FileMetadata,
  type HomeworkItem,
  type WorkflowData,
} from "../workflow-types";

export interface WorkflowHomeworkSectionProps {
  data: WorkflowData;
  isReviewer: boolean;
  isFamily: boolean;
  isHomeworkRoute: boolean;
  assignedHomework: HomeworkItem[];
  busy: string;
  filesFor: (category: "receipt" | "homework", targetId: string) => FileMetadata[];
  submitHomework: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  review: (item: HomeworkItem, form: HTMLFormElement) => Promise<void>;
}

export default function WorkflowHomeworkSection({
  data,
  isReviewer,
  isFamily,
  isHomeworkRoute,
  assignedHomework,
  busy,
  filesFor,
  submitHomework,
  review,
}: WorkflowHomeworkSectionProps) {
  const [homeworkId, setHomeworkId] = useState("");
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  if (!isReviewer && (!isFamily || !isHomeworkRoute)) return null;

  return (
    <section className="wf-card" aria-labelledby="homework-heading">
      <header className="wf-card-head">
        <div className="wf-head-copy">
          <div>
            <h2 id="homework-heading">Homework &amp; feedback</h2>
          </div>
        </div>
        <span className="wf-count">{assignedHomework.length} assigned</span>
      </header>
      {isFamily && (
        <form className="wf-form" onSubmit={submitHomework}>
          <div className="wf-form-grid">
            <div className="wf-field full">
              <label htmlFor="homework-assignment">Assignment</label>
              <select
                id="homework-assignment"
                required
                value={homeworkId}
                onChange={(event) => setHomeworkId(event.target.value)}
              >
                <option value="">Select homework</option>
                {assignedHomework.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.studentName} · {item.title} · due {dateLabel(item.dueDate)}
                  </option>
                ))}
              </select>
            </div>
            <div className="wf-field full">
              <label htmlFor="homework-note">Practice reflection</label>
              <textarea
                id="homework-note"
                name="homeworkNote"
                required
                maxLength={3000}
                placeholder="What did your child practise? What felt comfortable, and what would they like help with?"
              />
            </div>
            <div className="wf-field full">
              <label htmlFor="homework-file">
                Optional video, image or document (Max {maxHomeworkBytes / (1024 * 1024)}MB)
              </label>
              <input
                className="wf-file"
                id="homework-file"
                name="homeworkFile"
                type="file"
                accept=".mp4,.webm,.pdf,.png,.jpg,.jpeg,video/mp4,video/webm,application/pdf,image/png,image/jpeg"
              />
            </div>
          </div>
          {!assignedHomework.length && (
            <p className="wf-help">
              There are no assigned items ready for a submission.
            </p>
          )}
          <div className="wf-form-actions">
            <button
              className="wf-button"
              type="submit"
              disabled={!!busy || !assignedHomework.length}
            >
              {busy === "homework" ? "Submitting…" : "Submit practice"}
            </button>
          </div>
        </form>
      )}
      {data.homework.length ? (
        <div className="wf-records">
          {data.homework.map((item) => {
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
                  {isReviewer && item.status === "submitted" && (
                    <form
                      className="wf-review"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void review(item, event.currentTarget);
                      }}
                    >
                      <label className="wf-field">
                        <span>Teacher feedback</span>
                        <textarea
                          name="feedback"
                          required
                          maxLength={3000}
                          value={feedback[item.id] || ""}
                          onChange={(event) =>
                            setFeedback((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Offer a useful next step or celebrate a specific improvement."
                        />
                      </label>
                      <div className="wf-review-actions">
                        <button
                          className="wf-button"
                          type="submit"
                          disabled={!!busy}
                        >
                          {busy === `review-${item.id}`
                            ? "Saving…"
                            : "Save feedback"}
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
          title="No homework has been shared"
          detail="Assigned practice and submitted work will appear here when available."
        />
      )}
    </section>
  );
}
