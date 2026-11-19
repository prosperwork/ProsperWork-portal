"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Check, Plus, RefreshCw, X, XCircle } from "lucide-react";
import { PortalModal } from "@/app/_components/PortalModal";
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

type RescheduleTab = "pending" | "history";

export interface WorkflowRescheduleSectionProps {
  data: WorkflowData;
  role: Role;
  isFamily: boolean;
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
    note: string,
    selectedSlot?: string
  ) => Promise<boolean>;
  proposeCounter: (
    request: RescheduleRequest,
    slots: string[],
    reason: string
  ) => Promise<boolean>;
  acceptCounter: (
    request: RescheduleRequest,
    selectedSlot: string
  ) => Promise<boolean>;
}

export default function WorkflowRescheduleSection({
  data,
  role,
  isFamily,
  isFinalApprover,
  upcomingLessons,
  pendingRequests,
  busy,
  canTeachLesson,
  submitReschedule,
  decide,
  proposeCounter,
  acceptCounter,
}: WorkflowRescheduleSectionProps) {
  const [activeTab, setActiveTab] = useState<RescheduleTab>("pending");

  // Request Reschedule modal
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [lessonId, setLessonId] = useState("");
  const [reason, setReason] = useState("");
  const [slotInputs, setSlotInputs] = useState(["", ""]);

  // Approve modal
  const [approveModal, setApproveModal] = useState<{
    request: RescheduleRequest;
    mode: "teacher" | "admin";
  } | null>(null);
  const [approveSlot, setApproveSlot] = useState("");
  const [approveNote, setApproveNote] = useState("");

  // Counter-Times modal
  const [counterModalRequest, setCounterModalRequest] =
    useState<RescheduleRequest | null>(null);
  const [counterSlotInputs, setCounterSlotInputs] = useState<string[]>([""]);
  const [counterReason, setCounterReason] = useState("");

  // Reject modal
  const [rejectModalRequest, setRejectModalRequest] =
    useState<RescheduleRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // Accept Counter modal (for families)
  const [acceptCounterRequest, setAcceptCounterRequest] =
    useState<RescheduleRequest | null>(null);
  const [acceptCounterSlot, setAcceptCounterSlot] = useState("");

  const historyRequests = useMemo(
    () => data.requests.filter((r) => r.status !== "pending"),
    [data.requests]
  );

  const visibleRequests =
    activeTab === "pending" ? pendingRequests : historyRequests;

  const handleRequestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await submitReschedule(lessonId, slotInputs, reason);
    if (ok) {
      setLessonId("");
      setReason("");
      setSlotInputs(["", ""]);
      setRequestModalOpen(false);
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

  const setCounterSlot = (index: number, value: string) => {
    setCounterSlotInputs((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  };

  const addCounterSlot = () => {
    if (counterSlotInputs.length < 3) {
      setCounterSlotInputs((current) => [...current, ""]);
    }
  };

  const removeCounterSlot = (index: number) => {
    if (counterSlotInputs.length > 1) {
      setCounterSlotInputs((current) =>
        current.filter((_, idx) => idx !== index)
      );
    }
  };

  const lessonFor = (request: RescheduleRequest) =>
    data.lessons.find((item) => item.id === request.lesson_id);

  return (
    <section
      className="wf-work-section wf-ledger-section"
      aria-labelledby="requests-heading"
    >
      <header className="wf-card-head">
        <div className="wf-head-copy">
          <div>
            <h2 id="requests-heading">Reschedule requests</h2>
            <p>Approval progress is refreshed from the saved record.</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="wf-count">{pendingRequests.length} pending</span>
          {isFamily && (
            <button
              type="button"
              className="wf-button"
              onClick={() => setRequestModalOpen(true)}
            >
              <Plus size={13} />+ Request Reschedule
            </button>
          )}
        </div>
      </header>

      <div
        className="portal-tabs"
        role="tablist"
        aria-label="Reschedule request views"
        style={{ padding: "0 18px 10px", marginBottom: 0 }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pending"}
          className={`portal-tab ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          Pending
          <span className="portal-tab-badge">{pendingRequests.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          className={`portal-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History
          <span className="portal-tab-badge">{historyRequests.length}</span>
        </button>
      </div>

      {visibleRequests.length ? (
        <div className="wf-records">
          {visibleRequests.map((request) => {
            const lesson = lessonFor(request);
            const canActAsAssignedTeacher = canTeachLesson(request.lesson_id);
            // Eliminate Owner/Teacher dual-role deadlock:
            // If user can teach this lesson AND teacher hasn't approved yet, they perform teacher step first.
            // Once teacher has approved, if they are final approver, they perform final approval step.
            const actingAsTeacher =
              canActAsAssignedTeacher && !request.teacher_approved;
            const actingAsFinalApprover = isFinalApprover && !actingAsTeacher;
            const canFinalApproveNow =
              actingAsFinalApprover &&
              request.teacher_approved &&
              Boolean(request.selected_slot);
            const canRejectNow = actingAsTeacher || actingAsFinalApprover;

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

                  {/* Status hints */}
                  {request.status === "pending" &&
                    canActAsAssignedTeacher &&
                    request.teacher_approved &&
                    !isFinalApprover && (
                      <p className="wf-help">
                        Your availability is confirmed for the selected slot.
                        Waiting for final administrator approval.
                      </p>
                    )}

                  {request.status === "pending" &&
                    actingAsFinalApprover &&
                    !request.teacher_approved && (
                      <p className="wf-help">
                        Final approval unlocks once the assigned teacher
                        confirms availability and selects a slot.
                      </p>
                    )}

                  {/* Clean Card Action Buttons (no stacked inline forms!) */}
                  {request.status === "pending" && (
                    <div
                      className="wf-review-actions"
                      style={{
                        marginTop: 10,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {isFamily &&
                        request.counter_slots &&
                        request.counter_slots.length > 0 &&
                        !request.counter_accepted_at && (
                          <button
                            className="wf-button"
                            type="button"
                            disabled={!!busy}
                            onClick={() => {
                              setAcceptCounterSlot(
                                request.counter_slots?.[0] || ""
                              );
                              setAcceptCounterRequest(request);
                            }}
                          >
                            <CalendarClock size={13} /> Review &amp; Accept
                            Counter-Time
                          </button>
                        )}

                      {actingAsTeacher && (
                        <button
                          className="wf-button"
                          type="button"
                          disabled={!!busy}
                          onClick={() => {
                            setApproveSlot(request.slots[0] || "");
                            setApproveNote("");
                            setApproveModal({ request, mode: "teacher" });
                          }}
                        >
                          <Check size={13} /> Confirm / Approve
                        </button>
                      )}

                      {canFinalApproveNow && (
                        <button
                          className="wf-button"
                          type="button"
                          disabled={!!busy}
                          onClick={() => {
                            setApproveSlot(request.selected_slot || "");
                            setApproveNote("");
                            setApproveModal({ request, mode: "admin" });
                          }}
                        >
                          <Check size={13} /> Confirm / Approve
                        </button>
                      )}

                      {actingAsTeacher && !request.counter_slots?.length && (
                        <button
                          className="wf-button secondary"
                          type="button"
                          disabled={!!busy}
                          onClick={() => {
                            setCounterSlotInputs([""]);
                            setCounterReason("");
                            setCounterModalRequest(request);
                          }}
                        >
                          <RefreshCw size={13} /> Propose Counter-Times
                        </button>
                      )}

                      {canRejectNow && (
                        <button
                          className="wf-button secondary"
                          type="button"
                          style={{
                            color: "#9f1239",
                            borderColor: "#fecdd3",
                            background: "#fff1f2",
                          }}
                          disabled={!!busy}
                          onClick={() => {
                            setRejectNote("");
                            setRejectModalRequest(request);
                          }}
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            activeTab === "pending"
              ? "No pending reschedule requests"
              : "No reschedule history yet"
          }
          detail={
            activeTab === "pending"
              ? "Active reschedule requests awaiting approval will appear here."
              : "Approved and rejected reschedule decisions will be recorded here."
          }
        />
      )}

      {/* ========== MODALS ========== */}

      {/* Request Reschedule Modal (Families) */}
      <PortalModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        eyebrow="Lesson reschedule"
        title="Request a reschedule"
        subtitle="Propose at least two future options with at least 24 hours notice."
        size="md"
        busy={busy === "reschedule"}
      >
        <form
          className="wf-form"
          style={{ padding: 0, border: "none", background: "transparent" }}
          onSubmit={handleRequestSubmit}
        >
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
                    {lessonTimeLabel(item.startsAt, item.studentTimezone, role)}
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
                  style={{ marginTop: 6 }}
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
                required
                rows={3}
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
          <div className="modal-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="wf-button secondary"
              onClick={() => setRequestModalOpen(false)}
              disabled={busy === "reschedule"}
            >
              Cancel
            </button>
            <button
              className="wf-button"
              type="submit"
              disabled={!!busy || !upcomingLessons.length}
            >
              {busy === "reschedule" ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Confirm / Approve Modal */}
      <PortalModal
        open={Boolean(approveModal)}
        onClose={() => setApproveModal(null)}
        eyebrow={
          approveModal?.mode === "teacher"
            ? "Teacher availability"
            : "Final reschedule approval"
        }
        title={
          approveModal?.mode === "teacher"
            ? "Confirm teacher availability"
            : "Final approval & move lesson"
        }
        subtitle={
          approveModal
            ? `${lessonFor(approveModal.request)?.studentName || "Lesson"} · ${
                lessonFor(approveModal.request)?.instrument || "Schedule change"
              }`
            : undefined
        }
        size="md"
        busy={
          Boolean(approveModal) &&
          busy === `decision-${approveModal?.request.id}`
        }
      >
        {approveModal && (
          <form
            className="wf-form"
            style={{ padding: 0, border: "none", background: "transparent" }}
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await decide(
                approveModal.request,
                "approve",
                approveNote,
                approveSlot
              );
              if (ok) {
                setApproveModal(null);
                setApproveNote("");
              }
            }}
          >
            {approveModal.mode === "teacher" ? (
              <div className="wf-field full">
                <label>Choose the slot you can teach *</label>
                <div
                  className="wf-request-slots"
                  role="radiogroup"
                  aria-label="Choose the slot you can teach"
                >
                  {approveModal.request.slots.map((slot) => (
                    <label className="wf-slot" key={slot}>
                      <input
                        type="radio"
                        name="modal-approve-slot"
                        value={slot}
                        checked={approveSlot === slot}
                        onChange={() => setApproveSlot(slot)}
                        required
                      />
                      <span>
                        {lessonTimeLabel(
                          slot,
                          lessonFor(approveModal.request)?.studentTimezone ||
                            "UTC",
                          role
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="wf-field full">
                <p className="wf-record-note" style={{ margin: 0 }}>
                  <strong>Teacher-confirmed time:</strong>{" "}
                  {approveModal.request.selected_slot
                    ? lessonTimeLabel(
                        approveModal.request.selected_slot,
                        lessonFor(approveModal.request)?.studentTimezone ||
                          "UTC",
                        role
                      )
                    : "Not set"}
                </p>
                <p className="wf-help" style={{ marginTop: 6 }}>
                  Final approval checks for schedule conflicts and moves the
                  lesson to this confirmed slot.
                </p>
              </div>
            )}

            <div className="wf-field full" style={{ marginTop: 10 }}>
              <label htmlFor="modal-approve-note">
                Decision note (optional)
              </label>
              <textarea
                id="modal-approve-note"
                rows={3}
                maxLength={1200}
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                placeholder="Add context for the family or other approver."
              />
            </div>

            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="wf-button secondary"
                onClick={() => setApproveModal(null)}
                disabled={busy === `decision-${approveModal.request.id}`}
              >
                Cancel
              </button>
              <button
                className="wf-button"
                type="submit"
                disabled={!!busy || !approveSlot}
              >
                {busy === `decision-${approveModal.request.id}`
                  ? "Saving…"
                  : approveModal.mode === "teacher"
                    ? "Confirm availability"
                    : "Final approval & move class"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>

      {/* Propose Counter-Times Modal */}
      <PortalModal
        open={Boolean(counterModalRequest)}
        onClose={() => setCounterModalRequest(null)}
        eyebrow="Teacher counterproposal"
        title="Propose counter-times"
        subtitle={
          counterModalRequest
            ? `Offer up to 3 alternative times for ${
                lessonFor(counterModalRequest)?.studentName || "this lesson"
              }`
            : undefined
        }
        size="md"
        busy={
          Boolean(counterModalRequest) &&
          busy === `counter-${counterModalRequest?.id}`
        }
      >
        {counterModalRequest && (
          <form
            className="wf-form"
            style={{ padding: 0, border: "none", background: "transparent" }}
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await proposeCounter(
                counterModalRequest,
                counterSlotInputs,
                counterReason
              );
              if (ok) {
                setCounterModalRequest(null);
                setCounterSlotInputs([""]);
                setCounterReason("");
              }
            }}
          >
            <div className="wf-field full">
              <label>Alternative lesson times (up to 3) *</label>
              <div className="wf-slots" style={{ marginTop: 4 }}>
                {counterSlotInputs.map((slot, index) => (
                  <div className="wf-slot-row" key={index}>
                    <input
                      className="wf-input"
                      type="datetime-local"
                      required={index === 0}
                      value={slot}
                      min={localDateTime(new Date(Date.now() + 60 * 60 * 1000))}
                      onChange={(event) =>
                        setCounterSlot(index, event.target.value)
                      }
                    />
                    {counterSlotInputs.length > 1 && (
                      <button
                        className="wf-button icon"
                        type="button"
                        onClick={() => removeCounterSlot(index)}
                        aria-label={`Remove counter option ${index + 1}`}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {counterSlotInputs.length < 3 && (
                <button
                  className="wf-button secondary"
                  type="button"
                  style={{ marginTop: 6 }}
                  onClick={addCounterSlot}
                >
                  + Add another counter option
                </button>
              )}
            </div>
            <div className="wf-field full" style={{ marginTop: 10 }}>
              <label htmlFor="modal-counter-reason">
                Counterproposal explanation *
              </label>
              <textarea
                id="modal-counter-reason"
                required
                rows={3}
                maxLength={600}
                value={counterReason}
                onChange={(event) => setCounterReason(event.target.value)}
                placeholder="Explain why the original options do not work."
              />
            </div>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="wf-button secondary"
                onClick={() => setCounterModalRequest(null)}
                disabled={busy === `counter-${counterModalRequest.id}`}
              >
                Cancel
              </button>
              <button
                className="wf-button"
                type="submit"
                disabled={!!busy || !counterReason.trim()}
              >
                {busy === `counter-${counterModalRequest.id}`
                  ? "Sending…"
                  : "Send counterproposal"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>

      {/* Reject Reschedule Modal */}
      <PortalModal
        open={Boolean(rejectModalRequest)}
        onClose={() => setRejectModalRequest(null)}
        eyebrow="Reject request"
        title="Reject reschedule request?"
        subtitle={
          rejectModalRequest
            ? `${lessonFor(rejectModalRequest)?.studentName || "Lesson"} · the reason is shown to the family`
            : undefined
        }
        size="sm"
        busy={
          Boolean(rejectModalRequest) &&
          busy === `decision-${rejectModalRequest?.id}`
        }
      >
        {rejectModalRequest && (
          <form
            className="wf-form"
            style={{ padding: 0, border: "none", background: "transparent" }}
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await decide(rejectModalRequest, "reject", rejectNote);
              if (ok) {
                setRejectModalRequest(null);
                setRejectNote("");
              }
            }}
          >
            <div className="wf-field full">
              <label htmlFor="modal-reject-note">Rejection reason *</label>
              <textarea
                id="modal-reject-note"
                required
                rows={3}
                maxLength={1200}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Explain why this reschedule request cannot be approved."
              />
            </div>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="wf-button secondary"
                onClick={() => setRejectModalRequest(null)}
                disabled={busy === `decision-${rejectModalRequest.id}`}
              >
                Cancel
              </button>
              <button
                className="wf-button"
                type="submit"
                style={{ background: "#dc2626", borderColor: "#b91c1c" }}
                disabled={!!busy || !rejectNote.trim()}
              >
                {busy === `decision-${rejectModalRequest.id}`
                  ? "Rejecting…"
                  : "Confirm Rejection"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>

      {/* Family Accept Counter-Time Modal */}
      <PortalModal
        open={Boolean(acceptCounterRequest)}
        onClose={() => setAcceptCounterRequest(null)}
        eyebrow="Teacher counterproposal"
        title="Accept a proposed counter-time"
        subtitle={
          acceptCounterRequest
            ? `${lessonFor(acceptCounterRequest)?.studentName || "Lesson"}`
            : undefined
        }
        size="md"
        busy={
          Boolean(acceptCounterRequest) &&
          busy === `accept-counter-${acceptCounterRequest?.id}`
        }
      >
        {acceptCounterRequest && (
          <form
            className="wf-form"
            style={{ padding: 0, border: "none", background: "transparent" }}
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await acceptCounter(
                acceptCounterRequest,
                acceptCounterSlot
              );
              if (ok) setAcceptCounterRequest(null);
            }}
          >
            {acceptCounterRequest.counter_reason && (
              <p className="wf-record-note" style={{ marginTop: 0 }}>
                <strong>Teacher note:</strong>{" "}
                {acceptCounterRequest.counter_reason}
              </p>
            )}
            <div
              className="wf-request-slots"
              role="radiogroup"
              aria-label="Teacher counterproposed times"
            >
              {(acceptCounterRequest.counter_slots || []).map((slot) => (
                <label className="wf-slot" key={slot}>
                  <input
                    type="radio"
                    name="modal-accept-counter"
                    value={slot}
                    checked={acceptCounterSlot === slot}
                    onChange={() => setAcceptCounterSlot(slot)}
                    required
                  />
                  <span>
                    {lessonTimeLabel(
                      slot,
                      lessonFor(acceptCounterRequest)?.studentTimezone || "UTC",
                      role
                    )}
                  </span>
                </label>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="wf-button secondary"
                onClick={() => setAcceptCounterRequest(null)}
                disabled={busy === `accept-counter-${acceptCounterRequest.id}`}
              >
                Cancel
              </button>
              <button
                className="wf-button"
                type="submit"
                disabled={!!busy || !acceptCounterSlot}
              >
                {busy === `accept-counter-${acceptCounterRequest.id}`
                  ? "Accepting…"
                  : "Accept selected time"}
              </button>
            </div>
          </form>
        )}
      </PortalModal>
    </section>
  );
}
