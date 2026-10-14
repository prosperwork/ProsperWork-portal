"use client";

import { useState, type FormEvent } from "react";
import { Headphones, LoaderCircle, Send } from "lucide-react";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
import {
  formatDate,
  studentName,
  textValue,
  titleCase,
  type LessonRow,
  type RequestKind,
  type RequestRow,
  type RequestStatus,
  type StudentRow,
  type StudioData,
} from "../studio-types";

export interface StudioAskSectionProps {
  selectedChild: StudentRow | null;
  selectedStudentTimezone: string;
  selectedDueLessons: LessonRow[];
  canRequest: boolean;
  busy: string;
  createRequest: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  requestKind: RequestKind;
  setRequestKind: (kind: RequestKind) => void;
  requestLessonId: string;
  setRequestLessonId: (id: string) => void;
  requestBody: string;
  setRequestBody: (body: string) => void;
}

export function StudioAskSection({
  selectedChild,
  selectedStudentTimezone,
  selectedDueLessons,
  canRequest,
  busy,
  createRequest,
  requestKind,
  setRequestKind,
  requestLessonId,
  setRequestLessonId,
  requestBody,
  setRequestBody,
}: StudioAskSectionProps) {
  if (!canRequest || !selectedChild) return null;

  return (
    <section className="studio-card" aria-labelledby="new-request-title">
      <div className="studio-card-head">
        <div>
          <h2 id="new-request-title">Ask the studio</h2>
          <p>
            Requests are recorded in the private queue. No email delivery is
            claimed.
          </p>
        </div>
        <Headphones size={17} color="#6a9d7b" aria-hidden="true" />
      </div>
      <form
        className="studio-card-body"
        onSubmit={(event) => void createRequest(event)}
      >
        <div className="studio-field">
          <label htmlFor="request-kind">Request type</label>
          <select
            id="request-kind"
            value={requestKind}
            onChange={(event) => {
              const value = event.target.value as RequestKind;
              setRequestKind(value);
              setRequestLessonId("");
            }}
          >
            {(
              ["song", "tutor", "message", "class_not_started"] as RequestKind[]
            ).map((kind) => (
              <option value={kind} key={kind}>
                {titleCase(kind)}
              </option>
            ))}
          </select>
        </div>
        {requestKind === "class_not_started" && (
          <div className="studio-field">
            <label htmlFor="request-lesson">Currently due lesson</label>
            <select
              id="request-lesson"
              value={requestLessonId}
              onChange={(event) => setRequestLessonId(event.target.value)}
              required
              disabled={!selectedDueLessons.length}
            >
              <option value="">Choose a currently due lesson</option>
              {selectedDueLessons.map((lesson) => (
                <option value={lesson.id} key={lesson.id}>
                  {textValue(lesson.payload, "title", "name") ?? lesson.id} ·{" "}
                  {formatDate(
                    textValue(
                      lesson.payload,
                      "startsAt",
                      "starts_at",
                      "startAt",
                      "start_at",
                      "scheduledAt",
                      "scheduled_at"
                    ),
                    selectedStudentTimezone
                  )}
                </option>
              ))}
            </select>
            <small>
              {selectedDueLessons.length
                ? "Only lessons actually due now for this student are selectable."
                : "No currently due lesson was returned for this student."}
            </small>
          </div>
        )}
        <div className="studio-field">
          <label htmlFor="request-message">Message</label>
          <textarea
            id="request-message"
            value={requestBody}
            onChange={(event) => setRequestBody(event.target.value)}
            maxLength={4000}
            required
            placeholder="Tell the studio what you need."
          />
        </div>
        <div className="studio-actions">
          <button
            type="submit"
            className="family-button primary"
            disabled={
              busy === "request:create" ||
              (requestKind === "class_not_started" &&
                !selectedDueLessons.length)
            }
          >
            {busy === "request:create" ? (
              <>
                <LoaderCircle size={13} /> Sending…
              </>
            ) : (
              <>
                <Send size={13} /> Send request
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}

export interface StudioThreadsSectionProps {
  data: StudioData;
  selectedChild: StudentRow | null;
  openRequests: RequestRow[];
  canReply: boolean;
  canDecideRequest: (request: RequestRow) => boolean;
  busy: string;
  sendReply: (request: RequestRow) => Promise<void>;
  decideRequest: (
    event: FormEvent<HTMLFormElement>,
    request: RequestRow
  ) => Promise<void>;
  replyBodies: Record<string, string>;
  setReplyBodies: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  decisionStatuses: Record<string, Exclude<RequestStatus, "open">>;
  setDecisionStatuses: React.Dispatch<
    React.SetStateAction<Record<string, Exclude<RequestStatus, "open">>>
  >;
  confirm: (options: ConfirmOptions) => void;
}

export function StudioThreadsSection({
  data,
  selectedChild,
  openRequests,
  canReply,
  canDecideRequest,
  busy,
  sendReply,
  decideRequest,
  replyBodies,
  setReplyBodies,
  decisionStatuses,
  setDecisionStatuses,
  confirm,
}: StudioThreadsSectionProps) {
  if (openRequests.length === 0 && !selectedChild) return null;

  return (
    <section
      className="studio-flat-section studio-request-ledger"
      aria-labelledby="request-queue-title"
      style={{ marginTop: 15 }}
    >
      <div className="studio-card-head">
        <div>
          <h2 id="request-queue-title">Request threads</h2>
          <p>
            Replies and decisions are saved records. A response is never
            fabricated by the interface.
          </p>
        </div>
        <Send size={17} color="#6a9d7b" aria-hidden="true" />
      </div>
      {openRequests.length ? (
        <div className="studio-card-body">
          {openRequests.map((request) => {
            const owner = data.students.find(
              (student) => student.id === request.student_id
            );
            const thread = data.replies
              .filter((reply) => reply.request_id === request.id)
              .slice()
              .sort((a, b) => a.created_at.localeCompare(b.created_at));
            const mayDecide = canDecideRequest(request);
            return (
              <article className="studio-request" key={request.id}>
                <div className="studio-request-head">
                  <div>
                    <h3>
                      {owner
                        ? studentName(owner)
                        : `Student ${request.student_id}`}{" "}
                      · {titleCase(request.kind)}
                    </h3>
                    <div className="studio-request-meta">
                      {formatDate(request.created_at, data.profile.timezone)}
                      {request.lesson_id
                        ? ` · Lesson ${request.lesson_id}`
                        : ""}
                      {request.handled_by
                        ? ` · Handler ${request.handled_by}`
                        : ""}
                    </div>
                  </div>
                  <span className={`studio-status ${request.status}`}>
                    {titleCase(request.status)}
                  </span>
                </div>
                <p className="studio-request-body">{request.body}</p>
                {thread.length > 0 && (
                  <div
                    className="studio-thread"
                    aria-label="Saved conversation"
                  >
                    {thread.map((reply) => (
                      <div className="studio-reply" key={reply.id}>
                        <strong>
                          {reply.created_by === data.profile.id
                            ? "You"
                            : `Account ${reply.created_by}`}{" "}
                          ·{" "}
                        </strong>
                        {reply.body}
                        <br />
                        <small>
                          {formatDate(reply.created_at, data.profile.timezone)}
                        </small>
                      </div>
                    ))}
                  </div>
                )}
                {mayDecide &&
                  (request.status === "open" ||
                    request.status === "in_progress") && (
                    <form
                      className="studio-decision"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const status =
                          decisionStatuses[request.id] ?? "in_progress";
                        if (status === "rejected") {
                          confirm({
                            title: "Reject Studio Request?",
                            message:
                              "Are you sure you want to mark this student request as Rejected? The student and family will see this status.",
                            confirmLabel: "Reject Request",
                            tone: "danger",
                            onConfirm: () => void decideRequest(event, request),
                          });
                          return;
                        }
                        void decideRequest(event, request);
                      }}
                    >
                      <div className="studio-field">
                        <label htmlFor={`decision-status-${request.id}`}>
                          Decision status
                        </label>
                        <select
                          id={`decision-status-${request.id}`}
                          value={decisionStatuses[request.id] ?? "in_progress"}
                          onChange={(event) =>
                            setDecisionStatuses((previous) => ({
                              ...previous,
                              [request.id]: event.target.value as Exclude<
                                RequestStatus,
                                "open"
                              >,
                            }))
                          }
                        >
                          <option value="in_progress">In progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </div>
                      <div className="studio-field">
                        <label htmlFor={`decision-note-${request.id}`}>
                          Decision note (required)
                        </label>
                        <textarea
                          id={`decision-note-${request.id}`}
                          name="decisionBody"
                          required
                          maxLength={4000}
                          placeholder="Add the actual decision or next step."
                        />
                      </div>
                      <div className="studio-actions">
                        <button
                          type="submit"
                          className="family-button primary"
                          disabled={busy === `decide:${request.id}`}
                        >
                          {busy === `decide:${request.id}` ? (
                            <>
                              <LoaderCircle size={13} /> Saving…
                            </>
                          ) : (
                            "Save decision & reply"
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                {canReply && (
                  <form
                    className="studio-reply-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendReply(request);
                    }}
                  >
                    <div className="studio-field">
                      <label htmlFor={`reply-${request.id}`}>
                        Thread reply
                      </label>
                      <textarea
                        id={`reply-${request.id}`}
                        value={replyBodies[request.id] ?? ""}
                        onChange={(event) =>
                          setReplyBodies((previous) => ({
                            ...previous,
                            [request.id]: event.target.value,
                          }))
                        }
                        maxLength={4000}
                        required
                        placeholder="Write a reply for this thread."
                      />
                    </div>
                    <div className="studio-actions">
                      <button
                        type="submit"
                        className="family-button"
                        disabled={busy === `reply:${request.id}`}
                      >
                        {busy === `reply:${request.id}` ? (
                          <>
                            <LoaderCircle size={13} /> Posting…
                          </>
                        ) : (
                          <>
                            <Send size={13} /> Post reply
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="studio-empty">
          <strong>No studio requests</strong>Requests returned for this account
          will appear as private conversation threads here.
        </div>
      )}
    </section>
  );
}
