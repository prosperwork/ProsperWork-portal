"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { usePathname } from "next/navigation";
import { useConfirmModal } from "../_components/ConfirmModal";
import type { HomeworkItem, Lesson, Payment, Role } from "@/lib/types";
import {
  type WorkflowData,
  type RescheduleRequest,
  receiptRoles,
  maxReceiptBytes,
  maxHomeworkBytes,
} from "./workflow-types";
import {
  WORKFLOWS_CACHE_KEY,
  getCachedJson,
  saveCachedJson,
} from "@/lib/storage";
import WorkflowPaymentsSection from "./components/WorkflowPaymentsSection";
import WorkflowHomeworkSection from "./components/WorkflowHomeworkSection";
import WorkflowRescheduleSection from "./components/WorkflowRescheduleSection";

type ManagementAssignments = {
  profile?: { id: string };
  lessons?: { id: string; teacher_id: string | null }[];
};

/**
 * ============================================================================
 * PROSPERWORK MUSIC ACADEMY - WORKFLOWS CONTROLLER
 * ============================================================================
 * Coordinates multi-role educational workflows:
 * 1. Reschedule negotiation protocol (student counter-offers, staff approvals).
 * 2. Homework task assignment, student file submissions, and teacher feedback.
 * 3. Payment receipt uploads, billing reconciliation, and finance tracking.
 *
 * Integrated with the centralized confirmation modal system (`ConfirmModal.tsx`)
 * for approving, rejecting, or amending student reschedules.
 */
export default function WorkflowsPage() {
  // --------------------------------------------------------------------------
  // Confirmation Modal & Routing Context
  // --------------------------------------------------------------------------
  const { confirm, ConfirmDialog } = useConfirmModal();
  const isHomeworkRoute = usePathname() === "/homework";

  // --------------------------------------------------------------------------
  // Core Server Data State
  // --------------------------------------------------------------------------
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  // --------------------------------------------------------------------------
  // Reschedule Negotiation State
  // --------------------------------------------------------------------------
  const [chosenSlots, setChosenSlots] = useState<Record<string, string>>({});
  const [counterSlots, setCounterSlots] = useState<Record<string, string[]>>(
    {}
  );
  const [counterReasons, setCounterReasons] = useState<Record<string, string>>(
    {}
  );
  const [selectedCounter, setSelectedCounter] = useState<
    Record<string, string>
  >({});
  const [qcAssignedLessonIds, setQcAssignedLessonIds] = useState<string[]>([]);
  const [qcAssignmentError, setQcAssignmentError] = useState("");

  // --------------------------------------------------------------------------
  // Data Loader & QC Verification
  // --------------------------------------------------------------------------
  const load = useCallback(async (): Promise<boolean> => {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/workflows", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return false;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error || "Your workflow workspace could not be loaded."
        );
      const workspace = result as WorkflowData;
      setData(workspace);
      saveCachedJson(WORKFLOWS_CACHE_KEY, workspace);
      if (workspace.profile?.role === "qc") {
        try {
          const assignmentResponse = await fetch("/api/management", {
            credentials: "include",
            cache: "no-store",
          });
          const assignments = (await assignmentResponse
            .json()
            .catch(() => ({}))) as ManagementAssignments & { error?: string };
          if (
            !assignmentResponse.ok ||
            assignments.profile?.id !== workspace.profile.id ||
            !Array.isArray(assignments.lessons)
          ) {
            throw new Error(
              assignments.error ||
                "QC lesson assignments could not be confirmed. Teaching controls are hidden."
            );
          }
          setQcAssignedLessonIds(
            assignments.lessons
              .filter((lesson) => lesson.teacher_id === workspace.profile.id)
              .map((lesson) => lesson.id)
          );
          setQcAssignmentError("");
        } catch (assignmentError) {
          setQcAssignedLessonIds([]);
          setQcAssignmentError(
            assignmentError instanceof Error
              ? assignmentError.message
              : "QC lesson assignments could not be confirmed."
          );
        }
      } else {
        setQcAssignedLessonIds([]);
        setQcAssignmentError("");
      }
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Your workflow workspace could not be loaded."
      );
      return false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedJson<WorkflowData>(WORKFLOWS_CACHE_KEY, (p) =>
      Boolean(p && p.profile && Array.isArray(p.recentHomework))
    );
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    void load();
  }, [load]);

  // --------------------------------------------------------------------------
  // Role & Permission Computations
  // --------------------------------------------------------------------------
  const profile = data?.profile;
  const role = profile?.role as Role;
  const isFamily = role === "parent" || role === "student";
  const isTeacher = role === "teacher";
  const isQC = role === "qc";
  const canTeachLesson = (id: string) =>
    isTeacher || (isQC && qcAssignedLessonIds.includes(id));
  const isReviewer = isTeacher || role === "super_admin";
  const canSeeReceipts = !!role && receiptRoles.includes(role);
  const showPrimaryStack =
    (!isHomeworkRoute && canSeeReceipts) ||
    isReviewer ||
    (isFamily && isHomeworkRoute);
  const isFinalApprover =
    role === "admin" ||
    role === "head_admin" ||
    role === "super_admin" ||
    role === "general_manager";

  const assignedHomework = useMemo(
    () => (data?.homework || []).filter((item) => item.status === "assigned"),
    [data]
  );
  const upcomingLessons = useMemo(
    () =>
      (data?.lessons || []).filter(
        (lesson) =>
          new Date(lesson.startsAt).getTime() > Date.now() &&
          lesson.status !== "cancelled" &&
          lesson.status !== "completed" &&
          (!isQC || qcAssignedLessonIds.includes(lesson.id))
      ),
    [data, isQC, qcAssignedLessonIds]
  );
  const pendingRequests = useMemo(
    () =>
      (data?.requests || []).filter((request) => request.status === "pending"),
    [data]
  );

  // --------------------------------------------------------------------------
  // Server Mutators
  // --------------------------------------------------------------------------
  async function postJson(body: Record<string, unknown>) {
    const response = await fetch(
      "/api/" +
        (["decide", "request", "counter", "accept_counter"].includes(
          String(body.action)
        )
          ? "reschedules"
          : "homework"),
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error)
      throw new Error(result.error || "That change could not be saved.");
    return result;
  }

  async function upload(
    category: "receipt" | "homework",
    targetId: string,
    file: File | null,
    note: string
  ) {
    if (
      category === "receipt" &&
      (!file ||
        file.size > maxReceiptBytes ||
        !["application/pdf", "image/png", "image/jpeg"].includes(file.type))
    ) {
      throw new Error(
        "Receipts must be a PDF, PNG or JPEG no larger than 10 MiB."
      );
    }
    if (
      category === "homework" &&
      file &&
      (file.size > maxHomeworkBytes ||
        ![
          "video/mp4",
          "video/webm",
          "application/pdf",
          "image/png",
          "image/jpeg",
        ].includes(file.type))
    ) {
      throw new Error(
        "Homework files must be MP4, WebM, PDF, PNG or JPEG no larger than 50 MiB."
      );
    }
    const form = new FormData();
    form.set("category", category);
    form.set("targetId", targetId);
    form.set("note", note);
    if (file) form.set("file", file);
    const response = await fetch("/api/files", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error)
      throw new Error(result.error || "The upload could not be saved.");
  }

  async function runAction(
    key: string,
    action: () => Promise<void>,
    success: string
  ) {
    setBusy(key);
    setActionError("");
    setNotice("");
    try {
      await action();
      if (await load()) setNotice(success);
      else
        setActionError(
          "The save was accepted, but the updated status could not be confirmed. Refresh to check the record."
        );
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "The change could not be saved."
      );
    } finally {
      setBusy("");
    }
  }

  async function submitReceipt(
    event: FormEvent<HTMLFormElement>,
    targetPaymentId: string
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const file =
      (form.elements.namedItem("receiptFile") as HTMLInputElement).files?.[0] ||
      null;
    if (!targetPaymentId || !file) {
      setActionError("Select a receipt file for this payment.");
      return;
    }
    const note = (
      form.elements.namedItem("receiptNote") as HTMLInputElement
    ).value.trim();
    await runAction(
      "receipt",
      async () => {
        await upload("receipt", targetPaymentId, file, note);
        form.reset();
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete("paymentId");
        window.history.replaceState(
          null,
          "",
          `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
        );
      },
      "Receipt submitted. The saved status is shown below."
    );
  }

  async function submitHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const homeworkSelect = form.elements.namedItem(
      "homework-assignment"
    ) as HTMLSelectElement | null;
    const hwId = homeworkSelect?.value || "";
    const file =
      (form.elements.namedItem("homeworkFile") as HTMLInputElement)
        .files?.[0] || null;
    const note = (
      form.elements.namedItem("homeworkNote") as HTMLTextAreaElement
    ).value.trim();
    if (!hwId || !note) {
      setActionError("Choose an assignment and write a practice reflection.");
      return;
    }
    await runAction(
      "homework",
      async () => {
        await upload("homework", hwId, file, note);
        form.reset();
      },
      "Homework submitted. The saved status is shown below."
    );
  }

  async function submitReschedule(
    lessonId: string,
    slotInputs: string[],
    reason: string
  ): Promise<boolean> {
    const slots = slotInputs
      .filter(Boolean)
      .map((value) => new Date(value).toISOString());
    if (!lessonId || !reason || slots.length < 2) {
      setActionError(
        "Choose a lesson, give a reason, and offer at least two dates."
      );
      return false;
    }
    if (
      new Set(slots).size !== slots.length ||
      slots.some((slot) => new Date(slot).getTime() <= Date.now())
    ) {
      setActionError("Choose distinct dates in the future.");
      return false;
    }
    let success = false;
    await runAction(
      "reschedule",
      async () => {
        await postJson({ action: "request", lessonId, slots, reason });
        success = true;
      },
      "Request submitted. Approval progress below reflects the saved record."
    );
    return success;
  }

  async function review(item: HomeworkItem, form: HTMLFormElement) {
    const value = (
      form.elements.namedItem("feedback") as HTMLTextAreaElement
    ).value.trim();
    if (!value) {
      setActionError("Write feedback before marking this work reviewed.");
      return;
    }
    await runAction(
      `review-${item.id}`,
      async () => {
        await postJson({ id: item.id, feedback: value });
      },
      "Feedback saved and the submitted work refreshed."
    );
  }

  async function decide(
    request: RescheduleRequest,
    decision: "approve" | "reject",
    note: string
  ) {
    const selectedSlot = isTeacher
      ? chosenSlots[request.id] || ""
      : request.selected_slot || "";
    if (isTeacher && request.teacher_approved && decision === "approve") {
      setActionError(
        "Teacher availability has already been confirmed for this request."
      );
      return;
    }
    if (
      isFinalApprover &&
      decision === "approve" &&
      !request.teacher_approved
    ) {
      setActionError(
        "Final approval is locked until the teacher confirms availability."
      );
      return;
    }
    if (decision === "approve" && !selectedSlot) {
      setActionError("Select one proposed slot before approving.");
      return;
    }
    if (decision === "reject" && !note.trim()) {
      setActionError("Write a reason before rejecting this request.");
      return;
    }
    await runAction(
      `decision-${request.id}`,
      async () => {
        await postJson({
          action: "decide",
          id: request.id,
          decision,
          ...(decision === "approve" ? { selectedSlot } : {}),
          note: note.trim(),
        });
      },
      "Decision saved. The request status now reflects persisted approvals."
    );
  }

  async function proposeCounter(request: RescheduleRequest) {
    const slots = (counterSlots[request.id] || [])
      .filter(Boolean)
      .map((value) => new Date(value).toISOString());
    const reason = (counterReasons[request.id] || "").trim();
    if (
      !reason ||
      !slots.length ||
      slots.some((slot) => new Date(slot).getTime() <= Date.now())
    ) {
      setActionError(
        "Offer at least one future alternative and explain the counterproposal."
      );
      return;
    }
    await runAction(
      `counter-${request.id}`,
      async () => {
        await postJson({ action: "counter", id: request.id, slots, reason });
        setCounterSlots((current) => ({ ...current, [request.id]: [""] }));
        setCounterReasons((current) => ({ ...current, [request.id]: "" }));
      },
      "Counterproposal sent. The saved request has been refreshed."
    );
  }

  async function acceptCounter(request: RescheduleRequest) {
    const selectedSlot = selectedCounter[request.id] || "";
    if (!selectedSlot) {
      setActionError("Select one teacher-proposed time before accepting.");
      return;
    }
    await runAction(
      `accept-counter-${request.id}`,
      async () => {
        await postJson({
          action: "accept_counter",
          id: request.id,
          selectedSlot,
        });
      },
      "Teacher counterproposal accepted. The updated request has been refreshed."
    );
  }

  const filesFor = (category: "receipt" | "homework", targetId: string) =>
    (data?.files || []).filter(
      (file) =>
        file.category === category &&
        file.target_id === targetId &&
        file.complete
    );

  return (
    <main className="wf-page">
      <div className="wf-topline" />
      <div className="wf-content">
        <header className="wf-intro">
          <h1>{isHomeworkRoute ? "Homework" : "Workflows"}</h1>
          <button
            type="button"
            className="wf-button secondary"
            onClick={() => void load()}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </header>

        {error && (
          <div className="wf-error" role="alert">
            <span>
              <strong>Workspace unavailable</strong>
              {error}
            </span>
            <button
              className="wf-button secondary"
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
            >
              Try again
            </button>
          </div>
        )}
        {isQC && qcAssignmentError && (
          <div className="wf-error" role="alert">
            <span>
              <strong>QC teaching controls unavailable</strong>
              {qcAssignmentError}
            </span>
            <button
              className="wf-button secondary"
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
            >
              Retry assignment check
            </button>
          </div>
        )}
        {notice && (
          <div className="wf-alert ok" role="status">
            {notice}
          </div>
        )}
        {actionError && (
          <div className="wf-alert" role="alert">
            {actionError}
          </div>
        )}

        {!data && loading ? (
          <div
            className={`wf-columns${
              isHomeworkRoute ? " wf-homework-focus" : ""
            }`}
            data-portal-layout={isHomeworkRoute ? "homework" : "workflows"}
            aria-label="Loading workflow records"
          >
            <div className="wf-stack">
              <section className="wf-card">
                <div className="wf-skeleton">
                  <i />
                  <i />
                  <i />
                </div>
              </section>
              <section className="wf-card">
                <div className="wf-skeleton">
                  <i />
                  <i />
                </div>
              </section>
            </div>
            <div className="wf-stack">
              <section className="wf-card">
                <div className="wf-skeleton">
                  <i />
                  <i />
                  <i />
                </div>
              </section>
              <section className="wf-card">
                <div className="wf-skeleton">
                  <i />
                  <i />
                </div>
              </section>
            </div>
          </div>
        ) : (
          data && (
            <div
              className={`wf-columns${
                isHomeworkRoute ? " wf-homework-focus" : ""
              }${showPrimaryStack ? "" : " wf-single-column"}`}
              data-portal-layout={isHomeworkRoute ? "homework" : "workflows"}
            >
              {showPrimaryStack && (
                <div className="wf-stack">
                  <WorkflowPaymentsSection
                    data={data}
                    isFamily={isFamily}
                    isHomeworkRoute={isHomeworkRoute}
                    busy={busy}
                    filesFor={filesFor}
                    submitReceipt={submitReceipt}
                    setActionError={setActionError}
                  />

                  <WorkflowHomeworkSection
                    data={data}
                    isReviewer={isReviewer}
                    isFamily={isFamily}
                    isHomeworkRoute={isHomeworkRoute}
                    assignedHomework={assignedHomework}
                    busy={busy}
                    filesFor={filesFor}
                    submitHomework={submitHomework}
                    review={review}
                  />
                </div>
              )}

              {!isHomeworkRoute && (
                <div className="wf-stack wf-review-work-area">
                  <WorkflowRescheduleSection
                    data={data}
                    role={role}
                    isFamily={isFamily}
                    isTeacher={isTeacher}
                    isQC={isQC}
                    isFinalApprover={isFinalApprover}
                    upcomingLessons={upcomingLessons}
                    pendingRequests={pendingRequests}
                    busy={busy}
                    canTeachLesson={canTeachLesson}
                    submitReschedule={submitReschedule}
                    decide={decide}
                    proposeCounter={proposeCounter}
                    acceptCounter={acceptCounter}
                    chosenSlots={chosenSlots}
                    setChosenSlots={setChosenSlots}
                    counterSlots={counterSlots}
                    setCounterSlots={setCounterSlots}
                    counterReasons={counterReasons}
                    setCounterReasons={setCounterReasons}
                    selectedCounter={selectedCounter}
                    setSelectedCounter={setSelectedCounter}
                    confirm={confirm}
                  />
                </div>
              )}
            </div>
          )
        )}

        <footer className="wf-footer">
          <span>PROSPERWORK MUSIC CONCEPTS</span>
          <span>Lesson continuity · private workspace</span>
        </footer>
        <ConfirmDialog />
      </div>
    </main>
  );
}
