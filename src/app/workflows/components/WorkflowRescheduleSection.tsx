"use client";

import { useState, type FormEvent } from "react";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
import {
  dateLabel,
  Empty,
  lessonTimeLabel,
  localDateTime,
  type Lesson,
  type RescheduleRequest,
  type Role,
  type WorkflowData,
} from "../workflow-types";

export interface WorkflowRescheduleSectionProps {
  data: WorkflowData;
  role: Role;
  isFamily: boolean;
  isTeacher: boolean;
  isQC: boolean;
  isFinalApprover: boolean;
  upcomingLessons: Lesson[];
  pendingRequests: RescheduleRequest[];
  busy: string;
  canTeachLesson: (lessonId: string) => boolean;
  submitReschedule: (
    lessonId: string,
    slotInputs: string[],
    reason: string
  ) => Promise<boolean>;
  decide: (
    request: RescheduleRequest,
    decision: "approve" | "reject",
    note: string
  ) => Promise<void>;
  proposeCounter: (request: RescheduleRequest) => Promise<void>;
  acceptCounter: (request: RescheduleRequest) => Promise<void>;
  chosenSlots: Record<string, string>;
  setChosenSlots: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  counterSlots: Record<string, string[]>;
  setCounterSlots: React.Dispatch<
    React.SetStateAction<Record<string, string[]>>
  >;
  counterReasons: Record<string, string>;
  setCounterReasons: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  selectedCounter: Record<string, string>;
  setSelectedCounter: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  confirm: (options: ConfirmOptions) => void;
}

export default function WorkflowRescheduleSection({
  data,
  role,
  isFamily,
  isTeacher,
  isQC: _isQC,
  isFinalApprover,
  upcomingLessons,
  pendingRequests,
  busy,
  canTeachLesson,
  submitReschedule,
  decide,
  proposeCounter,
  acceptCounter,
  chosenSlots,
  setChosenSlots,
  counterSlots,
  setCounterSlots,
  counterReasons,
  setCounterReasons,
  selectedCounter,
  setSelectedCounter,
  confirm,
}: WorkflowRescheduleSectionProps) {
  const [lessonId, setLessonId] = useState("");
  const [reason, setReason] = useState("");
  const [slotInputs, setSlotInputs] = useState(["", ""]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await submitReschedule(lessonId, slotInputs, reason);
    if (ok) {
      setLessonId("");
      setReason("");
      setSlotInputs(["", ""]);
    }
  };

  const setSlot = (index: number, value: string) => {
    setSlotInputs((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  };

  const addSlot = () => {
    if (slotInputs.length < 5) {
      setSlotInputs((current) => [...current, ""]);
    }
  };

  const removeSlot = (index: number) => {
    if (slotInputs.length > 2) {
      setSlotInputs((current) => current.filter((_, idx) => idx !== index));
    }
  };

  const setCounterSlot = (requestId: string, index: number, value: string) => {
    setCounterSlots((current) => {
      const next = [...(current[requestId] || [""])];
      next[index] = value;
      return { ...current, [requestId]: next };
    });
  };

  const addCounterSlot = (requestId: string) => {
    setCounterSlots((current) => {
      const existing = current[requestId] || [""];
      return existing.length < 3
        ? { ...current, [requestId]: [...existing, ""] }
        : current;
    });
  };

  return (
    <>
      {isFamily && (
        <section className="wf-card" aria-labelledby="request-heading">
          <header className="wf-card-head">
            <div className="wf-head-copy">
              <div>
                <h2 id="request-heading">Request a reschedule</h2>
                <p>
                  Propose at least two future options with at least 24 hours
                  notice.
                </p>
              </div>
            </div>
          </header>
          <form className="wf-form" onSubmit={handleSubmit}>
            <div className="wf-form-grid">
              <div className="wf-field full">
                <label htmlFor="reschedule-lesson">Upcoming lesson</label>
                <select
                  id="reschedule-lesson"
                  required
                  value={lessonId}
                  onChange={(event) => setLessonId(event.target.value)}
                >
                  <option value="">Select a lesson</option>
                  {upcomingLessons.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.studentName} · {item.instrument} ·{" "}
                      {lessonTimeLabel(
                        item.startsAt,
                        item.studentTimezone,
                        role
                      )}
                    </option>
                  ))}
                </select>
              </div>
              <div className="wf-field full">
                <label>Proposed alternate times</label>
                <div className="wf-slots">
                  {slotInputs.map((slot, index) => (
                    <div className="wf-slot-row" key={index}>
                      <input
                        className="wf-input"
                        type="datetime-local"
                        required={index < 2}
                        value={slot}
                        min={localDateTime(
                          new Date(Date.now() + 24 * 60 * 60 * 1000)
                        )}
                        onChange={(event) => setSlot(index, event.target.value)}
                      />
                      {slotInputs.length > 2 && (
                        <button
                          className="wf-button icon"
                          type="button"
                          onClick={() => removeSlot(index)}
                          aria-label={`Remove option ${index + 1}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {slotInputs.length < 5 && (
                  <button
                    className="wf-button secondary"
                    type="button"
                    onClick={addSlot}
                  >
                    Add another option
                  </button>
                )}
              </div>
              <div className="wf-field full">
                <label htmlFor="reschedule-reason">Reason</label>
                <textarea
                  id="reschedule-reason"
                  name="reason"
                  required
                  maxLength={1000}
                  placeholder="Share a short note for the teacher and administrators."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
            {!upcomingLessons.length && (
              <p className="wf-help">
                There are no upcoming classes eligible for a new reschedule
                request.
              </p>
            )}
            <div className="wf-form-actions">
              <button
                className="wf-button"
                type="submit"
                disabled={!!busy || !upcomingLessons.length}
              >
                {busy === "reschedule" ? "Sending…" : "Send request"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section
        className="wf-work-section wf-ledger-section"
        aria-labelledby="requests-heading"
      >
        <header className="wf-card-head">
          <div className="wf-head-copy">
            <span className="wf-symbol">04</span>
            <div>
              <h2 id="requests-heading">Reschedule requests</h2>
              <p>Approval progress is refreshed from the saved record.</p>
            </div>
          </div>
          <span className="wf-count">{pendingRequests.length} pending</span>
        </header>
        {data.requests.length ? (
          <div className="wf-records">
            {data.requests.map((request) => {
              const lesson = data.lessons.find(
                (item) => item.id === request.lesson_id
              );
              const canActAsAssignedTeacher = canTeachLesson(request.lesson_id);
              const selected = canActAsAssignedTeacher
                ? chosenSlots[request.id] || ""
                : request.selected_slot || "";
              const teacherStep =
                canActAsAssignedTeacher && !request.teacher_approved;
              const adminStep = isFinalApprover;
              return (
                <article className="wf-record" key={request.id}>
                  <div className="wf-record-main">
                    <div className="wf-record-title">
                      {lesson?.studentName || "Lesson"} ·{" "}
                      {lesson?.instrument || "Schedule change"}
                      <span
                        className={`wf-pill ${
                          request.status === "approved"
                            ? "good"
                            : request.status === "rejected"
                            ? "bad"
                            : "wait"
                        }`}
                      >
                        {request.status}
                      </span>
                    </div>
                    <div className="wf-record-meta">
                      {lesson?.title || "Lesson"} · requested{" "}
                      {dateLabel(request.created_at)}
                    </div>
                    {lesson?.startsAt && (
                      <div className="wf-record-meta">
                        Current lesson:{" "}
                        {lessonTimeLabel(
                          lesson.startsAt,
                          lesson.studentTimezone,
                          role
                        )}
                      </div>
                    )}
                    <p className="wf-record-note">{request.reason}</p>
                    <div className="wf-record-meta">
                      Teacher approval:{" "}
                      {request.teacher_approved ? "Approved" : "Pending"} ·
                      Administrator approval:{" "}
                      {request.admin_approved ? "Approved" : "Pending"}
                    </div>
                    {request.selected_slot && (
                      <div className="wf-record-meta">
                        Selected time:{" "}
                        {lessonTimeLabel(
                          request.selected_slot,
                          lesson?.studentTimezone || "UTC",
                          role
                        )}
                      </div>
                    )}
                    {request.decision_note && (
                      <p className="wf-record-note">
                        Decision note: {request.decision_note}
                      </p>
                    )}
                    {request.counter_slots?.length ? (
                      <div
                        className="wf-request-slots"
                        role="radiogroup"
                        aria-label="Teacher counterproposed times"
                      >
                        {request.counter_slots.map((slot) => (
                          <label className="wf-slot" key={slot}>
                            <input
                              type="radio"
                              name={`counter-${request.id}`}
                              value={slot}
                              checked={selectedCounter[request.id] === slot}
                              onChange={() =>
                                setSelectedCounter((current) => ({
                                  ...current,
                                  [request.id]: slot,
                                }))
                              }
                            />
                            <span>
                              {lessonTimeLabel(
                                slot,
                                lesson?.studentTimezone || "UTC",
                                role
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {request.counter_reason && (
                      <p className="wf-record-note">
                        Teacher counterproposal: {request.counter_reason}
                      </p>
                    )}
                    {request.counter_accepted_at && (
                      <p className="wf-record-note">
                        Counterproposal accepted on{" "}
                        {dateLabel(request.counter_accepted_at)}.
                      </p>
                    )}

                    {isFamily &&
                      request.status === "pending" &&
                      request.counter_slots?.length &&
                      !request.counter_accepted_at && (
                        <div
                          className="wf-review-actions"
                          style={{ marginTop: 8 }}
                        >
                          <button
                            className="wf-button"
                            type="button"
                            disabled={!!busy}
                            onClick={() => void acceptCounter(request)}
                          >
                            {busy === `accept-counter-${request.id}`
                              ? "Accepting…"
                              : "Accept teacher counterproposal"}
                          </button>
                        </div>
                      )}

                    {canActAsAssignedTeacher &&
                      request.status === "pending" &&
                      !request.teacher_approved &&
                      !request.counter_slots?.length && (
                        <form
                          className="wf-review"
                          style={{
                            marginTop: 12,
                            borderTop: "1px dashed #d1d5db",
                            paddingTop: 10,
                          }}
                          onSubmit={(event) => {
                            event.preventDefault();
                            void proposeCounter(request);
                          }}
                        >
                          <label className="wf-field">
                            <span>
                              Teacher counterproposal alternatives (if proposed
                              slots do not work)
                            </span>
                            <div className="wf-slots" style={{ marginTop: 4 }}>
                              {(counterSlots[request.id] || [""]).map(
                                (slot, index) => (
                                  <div className="wf-slot-row" key={index}>
                                    <input
                                      className="wf-input"
                                      type="datetime-local"
                                      value={slot}
                                      min={localDateTime(
                                        new Date(Date.now() + 60 * 60 * 1000)
                                      )}
                                      onChange={(event) =>
                                        setCounterSlot(
                                          request.id,
                                          index,
                                          event.target.value
                                        )
                                      }
                                    />
                                  </div>
                                )
                              )}
                            </div>
                            {(counterSlots[request.id] || [""]).length < 3 && (
                              <button
                                className="wf-button secondary"
                                type="button"
                                style={{ marginTop: 6 }}
                                onClick={() => addCounterSlot(request.id)}
                              >
                                Add another counter option
                              </button>
                            )}
                          </label>
                          <label className="wf-field" style={{ marginTop: 6 }}>
                            <span>Counterproposal explanation</span>
                            <textarea
                              maxLength={600}
                              value={counterReasons[request.id] || ""}
                              onChange={(event) =>
                                setCounterReasons((current) => ({
                                  ...current,
                                  [request.id]: event.target.value,
                                }))
                              }
                              placeholder="Explain why the original options do not work."
                            />
                          </label>
                          <div className="wf-review-actions">
                            <button
                              className="wf-button secondary"
                              type="submit"
                              disabled={!!busy}
                            >
                              {busy === `counter-${request.id}`
                                ? "Sending…"
                                : "Send counterproposal"}
                            </button>
                          </div>
                        </form>
                      )}

                    {request.status === "pending" && teacherStep && (
                      <div
                        className="wf-request-slots"
                        role="radiogroup"
                        aria-label="Choose the slot you can teach"
                      >
                        {request.slots.map((slot) => (
                          <label className="wf-slot" key={slot}>
                            <input
                              type="radio"
                              name={`slot-${request.id}`}
                              value={slot}
                              checked={selected === slot}
                              onChange={() =>
                                setChosenSlots((current) => ({
                                  ...current,
                                  [request.id]: slot,
                                }))
                              }
                            />
                            <span>
                              {lessonTimeLabel(
                                slot,
                                lesson?.studentTimezone || "UTC",
                                role
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {request.status === "pending" &&
                      canActAsAssignedTeacher &&
                      request.teacher_approved && (
                        <p className="wf-help">
                          Your availability is confirmed for the selected slot.
                          The request is waiting for final administrator
                          approval.
                        </p>
                      )}

                    {request.status === "pending" &&
                      adminStep &&
                      !request.teacher_approved && (
                        <p className="wf-help">
                          Final approval is locked until the teacher confirms
                          availability and a slot is saved. You cannot select a
                          different time.
                        </p>
                      )}

                    {request.status === "pending" &&
                      (teacherStep || adminStep) && (
                        <form
                          className="wf-review"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const note = (
                              event.currentTarget.elements.namedItem(
                                "decisionNote"
                              ) as HTMLTextAreaElement
                            ).value;
                            if (adminStep) {
                              confirm({
                                title: "Final Reschedule Approval",
                                message:
                                  "Final approval will move this lesson to the teacher-confirmed time. Conflicts and past classes will be verified before moving the lesson.",
                                tone: "primary",
                                confirmLabel: "Final approval and move class",
                                onConfirm: () => {
                                  void decide(request, "approve", note);
                                },
                              });
                              return;
                            }
                            void decide(request, "approve", note);
                          }}
                        >
                          <label className="wf-field">
                            <span>
                              Decision note{" "}
                              <span aria-hidden="true">
                                (optional for approval; required to reject)
                              </span>
                            </span>
                            <textarea
                              name="decisionNote"
                              maxLength={1200}
                              placeholder="Add context for the family and the other approver."
                            />
                          </label>
                          {adminStep && (
                            <p className="wf-help">
                              Final approval checks for conflicts and past
                              classes before moving the lesson.
                            </p>
                          )}
                          <div className="wf-review-actions">
                            <button
                              className="wf-button"
                              type="submit"
                              disabled={
                                !!busy ||
                                (canActAsAssignedTeacher && !selected) ||
                                (adminStep &&
                                  (!request.teacher_approved ||
                                    !request.selected_slot))
                              }
                            >
                              {busy === `decision-${request.id}`
                                ? "Saving…"
                                : canActAsAssignedTeacher
                                ? "Confirm teacher availability"
                                : "Final approval and move class"}
                            </button>
                            <button
                              className="wf-button secondary"
                              type="button"
                              disabled={!!busy}
                              onClick={(event) => {
                                const form = event.currentTarget.closest(
                                  "form"
                                ) as HTMLFormElement | null;
                                const note =
                                  (
                                    form?.elements.namedItem(
                                      "decisionNote"
                                    ) as HTMLTextAreaElement | null
                                  )?.value || "";
                                confirm({
                                  title: "Reject Reschedule Request?",
                                  message:
                                    "Reject this reschedule request? The decision will be saved and shown to the family.",
                                  tone: "danger",
                                  confirmLabel: "Reject Request",
                                  onConfirm: () => {
                                    void decide(request, "reject", note);
                                  },
                                });
                              }}
                            >
                              Reject
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
            title="No reschedule requests"
            detail="New requests and their approval history will be kept here."
          />
        )}
      </section>
    </>
  );
}
