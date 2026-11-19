"use client";

import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  MessageSquare,
  Plus,
  Send,
} from "lucide-react";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
import { PortalModal } from "@/app/_components/PortalModal";
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
  createRequest: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
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
  const [open, setOpen] = useState(false);

  if (!canRequest || !selectedChild) return null;

  const isSending = busy === "request:create";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    const ok = await createRequest(event);
    if (ok) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="family-button primary"
        onClick={() => setOpen(true)}
      >
        <Plus size={14} aria-hidden="true" /> Ask the Studio
      </button>

      <PortalModal
        open={open}
        onClose={() => {
          if (!isSending) setOpen(false);
        }}
        eyebrow={studentName(selectedChild)}
        title="Ask the Studio"
        subtitle="Request a new song, ask a question, or report an issue with a live class."
        size="md"
        busy={isSending}
      >
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div style={{ display: "grid", gap: 14 }}>
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
                  [
                    "song",
                    "tutor",
                    "message",
                    "class_not_started",
                  ] as RequestKind[]
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
                      {textValue(lesson.payload, "title", "name") ??
                        "Scheduled Lesson"}{" "}
                      ·{" "}
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
                    ? "Select the active class that hasn't started yet."
                    : "No lesson is currently due for this student."}
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
                placeholder="Tell the studio how we can help…"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setOpen(false)}
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="family-button primary"
              disabled={
                isSending ||
                (requestKind === "class_not_started" &&
                  !selectedDueLessons.length)
              }
            >
              {isSending ? (
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
      </PortalModal>
    </>
  );
}

export interface StudioThreadsSectionProps {
  data: StudioData;
  selectedChild: StudentRow | null;
  openRequests: RequestRow[];
  isStaff: boolean;
  showAllStudents: boolean;
  onToggleShowAllStudents: (showAll: boolean) => void;
  canReply: boolean;
  canDecideRequest: (request: RequestRow) => boolean;
  busy: string;
  sendReply: (request: RequestRow, bodyOverride?: string) => Promise<boolean>;
  decideRequest: (
    request: RequestRow,
    status: Exclude<RequestStatus, "open">,
    note: string
  ) => Promise<boolean>;
  replyBodies: Record<string, string>;
  setReplyBodies: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  decisionStatuses: Record<string, Exclude<RequestStatus, "open">>;
  setDecisionStatuses: React.Dispatch<
    React.SetStateAction<Record<string, Exclude<RequestStatus, "open">>>
  >;
  confirm: (options: ConfirmOptions) => void;
  askAction?: React.ReactNode;
}

export function StudioThreadsSection({
  data,
  selectedChild,
  openRequests,
  isStaff,
  showAllStudents,
  onToggleShowAllStudents,
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
  askAction,
}: StudioThreadsSectionProps) {
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [decisionTargetId, setDecisionTargetId] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const replyTarget = replyTargetId
    ? data.requests.find((r) => r.id === replyTargetId) ?? null
    : null;
  const decisionTarget = decisionTargetId
    ? data.requests.find((r) => r.id === decisionTargetId) ?? null
    : null;

  const lessonLabel = (lessonId: string | null) => {
    if (!lessonId) return null;
    const found = data.lessons.find((lesson) => lesson.id === lessonId);
    if (!found) return "Linked lesson";
    const title = textValue(found.payload, "title", "name");
    return title || "Linked lesson";
  };

  const replyAuthorLabel = (createdBy: string, request: RequestRow) => {
    if (createdBy === data.profile.id) return "You";
    const student = data.students.find((s) => s.id === request.student_id);
    const studentUid = student
      ? textValue(
          student.payload,
          "studentUserId",
          "student_user_id",
          "userId",
          "user_id"
        )
      : null;
    if (student && studentUid && studentUid === createdBy) {
      return studentName(student);
    }
    if (request.handled_by && createdBy === request.handled_by) {
      return "Studio Staff";
    }
    return isStaff ? "Family / Team" : "Academy Team";
  };

  const replyThread = replyTarget
    ? data.replies
        .filter((reply) => reply.request_id === replyTarget.id)
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  return (
    <>
      <section
        className="studio-flat-section studio-request-ledger"
        aria-labelledby="request-queue-title"
      >
        <div className="studio-card-head">
          <div>
            <h2 id="request-queue-title">Studio requests</h2>
            <p>
              {isStaff && showAllStudents
                ? "Showing requests across all assigned students."
                : selectedChild
                ? `Conversation threads for ${studentName(selectedChild)}.`
                : "Messages, song requests, and staff updates."}
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {isStaff && selectedChild && (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#183128",
                  cursor: "pointer",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #dce7df",
                  background: "#f7faf8",
                }}
              >
                <input
                  type="checkbox"
                  checked={showAllStudents}
                  onChange={(e) => onToggleShowAllStudents(e.target.checked)}
                />
                All students
              </label>
            )}
            {askAction}
          </div>
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
              const linkedLesson = lessonLabel(request.lesson_id);

              return (
                <article className="studio-request" key={request.id}>
                  <div className="studio-request-head">
                    <div>
                      <h3>
                        {owner ? studentName(owner) : "Student"} ·{" "}
                        {titleCase(request.kind)}
                      </h3>
                      <div className="studio-request-meta">
                        {formatDate(request.created_at, data.profile.timezone)}
                        {linkedLesson ? ` · ${linkedLesson}` : ""}
                        {request.handled_by
                          ? request.handled_by === data.profile.id
                            ? " · Assigned to you"
                            : " · Assigned to staff"
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
                      aria-label="Conversation history"
                    >
                      {thread.map((reply) => (
                        <div className="studio-reply" key={reply.id}>
                          <strong>
                            {replyAuthorLabel(reply.created_by, request)} ·{" "}
                          </strong>
                          {reply.body}
                          <br />
                          <small>
                            {formatDate(
                              reply.created_at,
                              data.profile.timezone
                            )}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}

                  {(canReply ||
                    (mayDecide &&
                      (request.status === "open" ||
                        request.status === "in_progress"))) && (
                    <div
                      className="studio-actions"
                      style={{
                        marginTop: 12,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {canReply && (
                        <button
                          type="button"
                          className="family-button"
                          onClick={() => setReplyTargetId(request.id)}
                        >
                          <MessageSquare size={13} aria-hidden="true" /> Reply
                          {thread.length > 0 ? ` (${thread.length})` : ""}
                        </button>
                      )}
                      {mayDecide &&
                        (request.status === "open" ||
                          request.status === "in_progress") && (
                          <button
                            type="button"
                            className="family-button primary"
                            onClick={() => {
                              setDecisionNote("");
                              setDecisionTargetId(request.id);
                            }}
                          >
                            <CheckCircle2 size={13} aria-hidden="true" /> Update
                            Status
                          </button>
                        )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="studio-empty">
            <strong>No studio requests</strong>
            {selectedChild && !showAllStudents
              ? `No requests have been submitted for ${studentName(
                  selectedChild
                )} yet.`
              : "Requests submitted by families and students will appear here."}
          </div>
        )}
      </section>

      {/* Reply Modal */}
      <PortalModal
        open={Boolean(replyTarget)}
        onClose={() => {
          if (!replyTarget || busy !== `reply:${replyTarget.id}`) {
            setReplyTargetId(null);
          }
        }}
        eyebrow={
          replyTarget
            ? titleCase(replyTarget.kind)
            : "Studio Conversation"
        }
        title="Reply to Request"
        subtitle={
          replyTarget
            ? `${
                studentName(
                  data.students.find((s) => s.id === replyTarget.student_id) ?? {
                    id: replyTarget.student_id,
                    payload: {},
                  }
                )
              } · ${formatDate(replyTarget.created_at, data.profile.timezone)}`
            : undefined
        }
        size="md"
        busy={Boolean(replyTarget && busy === `reply:${replyTarget.id}`)}
      >
        {replyTarget && (
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "#f7faf8",
                border: "1px solid #dce7df",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              {replyTarget.body}
            </div>

            {replyThread.length > 0 && (
              <div
                className="studio-thread"
                style={{ maxHeight: 220, overflowY: "auto", margin: 0 }}
              >
                {replyThread.map((reply) => (
                  <div className="studio-reply" key={reply.id}>
                    <strong>
                      {replyAuthorLabel(reply.created_by, replyTarget)} ·{" "}
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

            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const ok = await sendReply(replyTarget);
                if (ok) setReplyTargetId(null);
              }}
            >
              <div className="studio-field">
                <label htmlFor="modal-reply-body">Your reply</label>
                <textarea
                  id="modal-reply-body"
                  value={replyBodies[replyTarget.id] ?? ""}
                  onChange={(event) =>
                    setReplyBodies((previous) => ({
                      ...previous,
                      [replyTarget.id]: event.target.value,
                    }))
                  }
                  maxLength={4000}
                  required
                  placeholder="Write a helpful reply…"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="family-button subtle"
                  onClick={() => setReplyTargetId(null)}
                  disabled={busy === `reply:${replyTarget.id}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="family-button primary"
                  disabled={
                    busy === `reply:${replyTarget.id}` ||
                    !(replyBodies[replyTarget.id] ?? "").trim()
                  }
                >
                  {busy === `reply:${replyTarget.id}` ? (
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
          </div>
        )}
      </PortalModal>

      {/* Staff Update Status / Decision Modal */}
      <PortalModal
        open={Boolean(decisionTarget)}
        onClose={() => {
          if (!decisionTarget || busy !== `decide:${decisionTarget.id}`) {
            setDecisionTargetId(null);
          }
        }}
        eyebrow={
          decisionTarget ? titleCase(decisionTarget.kind) : "Studio Decision"
        }
        title="Update Request Status"
        subtitle="Set the request status and add a note visible in the thread."
        size="md"
        busy={Boolean(decisionTarget && busy === `decide:${decisionTarget.id}`)}
      >
        {decisionTarget && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const note = decisionNote.trim();
              const status =
                decisionStatuses[decisionTarget.id] ?? "in_progress";
              if (status === "rejected") {
                confirm({
                  title: "Reject Studio Request?",
                  message:
                    "Are you sure you want to mark this student request as Rejected? The student and family will see this status and note.",
                  confirmLabel: "Reject Request",
                  tone: "danger",
                  onConfirm: async () => {
                    const ok = await decideRequest(
                      decisionTarget,
                      status,
                      note
                    );
                    if (ok) {
                      setDecisionNote("");
                      setDecisionTargetId(null);
                    }
                  },
                });
                return;
              }
              const ok = await decideRequest(decisionTarget, status, note);
              if (ok) {
                setDecisionNote("");
                setDecisionTargetId(null);
              }
            }}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="studio-field">
                <label htmlFor="modal-decision-status">Status</label>
                <select
                  id="modal-decision-status"
                  value={decisionStatuses[decisionTarget.id] ?? "in_progress"}
                  onChange={(event) =>
                    setDecisionStatuses((previous) => ({
                      ...previous,
                      [decisionTarget.id]: event.target.value as Exclude<
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
                <label htmlFor="modal-decision-note">
                  Decision note (required)
                </label>
                <textarea
                  id="modal-decision-note"
                  value={decisionNote}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  required
                  maxLength={4000}
                  placeholder="Share the outcome or next steps…"
                />
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="family-button subtle"
                onClick={() => setDecisionTargetId(null)}
                disabled={busy === `decide:${decisionTarget.id}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="family-button primary"
                disabled={
                  busy === `decide:${decisionTarget.id}` || !decisionNote.trim()
                }
              >
                {busy === `decide:${decisionTarget.id}` ? (
                  <>
                    <LoaderCircle size={13} /> Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} /> Save status &amp; note
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </PortalModal>
    </>
  );
}
