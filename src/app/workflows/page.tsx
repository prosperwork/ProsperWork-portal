"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { PortalModal } from "../_components/PortalModal";
import type { HomeworkItem, Role, Student } from "@/lib/types";
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

type AssignableStudent = {
  id: string;
  name: string;
  instrument: string;
  teacherName: string;
  status: string;
};

/**
 * ============================================================================
 * PROSPERWORK MUSIC ACADEMY - WORKFLOWS & HOMEWORK CONTROLLER
 * ============================================================================
 * Coordinates multi-role educational workflows:
 * 1. Reschedule negotiation protocol (modal-driven approvals, counter-offers, rejections).
 * 2. Homework task assignment (+ Assign Homework modal via /api/academy),
 *    student practice submissions, and teacher feedback modals.
 * 3. Payment receipt uploads via modal and finance tracking.
 */
export default function WorkflowsPage() {
  const isHomeworkRoute = usePathname() === "/homework";

  // Core Server Data State
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  // QC Verification & Receipt deep-link
  const [qcAssignedLessonIds, setQcAssignedLessonIds] = useState<string[]>([]);
  const [qcAssignmentError, setQcAssignmentError] = useState("");
  const [initialPaymentId, setInitialPaymentId] = useState("");

  // Assign Homework Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [academyStudents, setAcademyStudents] = useState<AssignableStudent[]>(
    []
  );
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [assignForm, setAssignForm] = useState({
    studentId: "",
    title: "",
    dueDate: "",
    note: "",
  });

  useEffect(() => {
    try {
      const param =
        new URLSearchParams(window.location.search).get("paymentId") || "";
      if (param) setInitialPaymentId(param);
    } catch {
      // ignore
    }
  }, []);

  // Data Loader & QC Verification
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
      Boolean(p && p.profile && Array.isArray(p.homework))
    );
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    void load();
  }, [load]);

  // Role & Permission Computations
  const profile = data?.profile;
  const role = profile?.role as Role;
  const perms = useMemo(
    () => new Set(profile?.permissions ?? []),
    [profile?.permissions]
  );
  const isOwner = role === "super_admin" || (role as string) === "owner";
  const isFamily = role === "parent" || role === "student";
  const isTeacher =
    role === "teacher" ||
    profile?.department === "Music Education" ||
    (typeof role === "string" && role.includes("teacher")) ||
    perms.has("workspace.learning");
  const isQC = role === "qc";
  const isStaffAdmin =
    role === "admin" || role === "head_admin" || role === "general_manager";

  const canTeachLesson = (id: string) =>
    isTeacher || (isQC && qcAssignedLessonIds.includes(id));

  // Fix blank-page role bug: ensure admin, head_admin, general_manager, qc, teacher, owner, super_admin, parent, student all see scoped homework cleanly
  const canAssignHomework =
    isOwner ||
    isTeacher ||
    isQC ||
    isStaffAdmin ||
    perms.has("workspace.curriculum") ||
    perms.has("workspace.homework");
  const isReviewer = canAssignHomework;
  const canViewHomework = isHomeworkRoute
    ? canAssignHomework || isFamily || Boolean(role)
    : isReviewer || isFamily;

  const canSeeReceipts =
    isOwner ||
    perms.has("workspace.finance") ||
    perms.has("workspace.documents") ||
    (!!role && receiptRoles.includes(role));

  const showPrimaryStack =
    isHomeworkRoute || canSeeReceipts || canViewHomework;

  const isFinalApprover =
    isOwner ||
    perms.has("workspace.workflows") ||
    perms.has("workspace.operations") ||
    perms.has("workspace.schedule") ||
    isStaffAdmin;

  // Load scoped students for + Assign Homework modal
  const loadAssignableStudents = useCallback(async () => {
    if (!canAssignHomework) return;
    setLoadingStudents(true);
    try {
      const response = await fetch("/api/academy", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;
      const snapshot = (await response.json().catch(() => ({}))) as {
        students?: Student[];
      };
      if (Array.isArray(snapshot.students)) {
        setAcademyStudents(
          snapshot.students.map((s) => ({
            id: s.id,
            name: s.name,
            instrument: s.instrument || "",
            teacherName: s.teacherName || "",
            status: s.status || "active",
          }))
        );
      }
    } catch {
      // Fallback to lesson-derived students below
    } finally {
      setLoadingStudents(false);
    }
  }, [canAssignHomework]);

  useEffect(() => {
    if (canAssignHomework && academyStudents.length === 0) {
      void loadAssignableStudents();
    }
  }, [canAssignHomework, academyStudents.length, loadAssignableStudents]);

  const selectableStudents = useMemo(() => {
    if (academyStudents.length > 0) {
      const active = academyStudents.filter((s) => s.status === "active");
      return active.length > 0 ? active : academyStudents;
    }
    // Fallback from visible lessons/homework
    const map = new Map<string, AssignableStudent>();
    for (const lesson of data?.lessons || []) {
      if (lesson.studentId && !map.has(lesson.studentId)) {
        map.set(lesson.studentId, {
          id: lesson.studentId,
          name: lesson.studentName,
          instrument: lesson.instrument || "",
          teacherName: lesson.teacherName || "",
          status: "active",
        });
      }
    }
    for (const hw of data?.homework || []) {
      if (hw.studentId && !map.has(hw.studentId)) {
        map.set(hw.studentId, {
          id: hw.studentId,
          name: hw.studentName,
          instrument: "",
          teacherName: hw.teacherName || "",
          status: "active",
        });
      }
    }
    return Array.from(map.values());
  }, [academyStudents, data?.lessons, data?.homework]);

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

  // Server Mutators
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
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(key);
    setActionError("");
    setNotice("");
    try {
      await action();
      if (await load()) {
        setNotice(success);
        return true;
      }
      setActionError(
        "The save was accepted, but the updated status could not be confirmed. Refresh to check the record."
      );
      return false;
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "The change could not be saved."
      );
      return false;
    } finally {
      setBusy("");
    }
  }

  async function submitAssignHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError("");
    const student = selectableStudents.find(
      (s) => s.id === assignForm.studentId
    );
    if (!student || !assignForm.title.trim() || !assignForm.dueDate) {
      setAssignError("Choose a student, assignment title, and due date.");
      return;
    }
    setBusy("assign-homework");
    setActionError("");
    setNotice("");
    try {
      const homeworkRecord: HomeworkItem = {
        id: `hw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        studentId: student.id,
        studentName: student.name,
        teacherName: student.teacherName || profile?.name || "Teacher",
        title: assignForm.title.trim(),
        dueDate: assignForm.dueDate,
        note: assignForm.note.trim(),
        status: "assigned",
      };
      const response = await fetch("/api/academy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: [
            {
              module: "homework",
              operation: "insert",
              record: homeworkRecord,
            },
          ],
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        throw new Error(
          result.error || "The homework assignment could not be saved."
        );
      }
      await load();
      setNotice(`Homework "${homeworkRecord.title}" assigned to ${student.name}.`);
      setAssignForm({ studentId: "", title: "", dueDate: "", note: "" });
      setAssignModalOpen(false);
    } catch (err) {
      setAssignError(
        err instanceof Error
          ? err.message
          : "The homework assignment could not be saved."
      );
    } finally {
      setBusy("");
    }
  }

  async function submitReceipt(
    event: FormEvent<HTMLFormElement>,
    targetPaymentId: string
  ): Promise<boolean> {
    event.preventDefault();
    const form = event.currentTarget;
    const file =
      (form.elements.namedItem("receiptFile") as HTMLInputElement).files?.[0] ||
      null;
    if (!targetPaymentId || !file) {
      setActionError("Select a receipt file for this payment.");
      return false;
    }
    const note = (
      form.elements.namedItem("receiptNote") as HTMLInputElement
    ).value.trim();
    return runAction(
      "receipt",
      async () => {
        await upload("receipt", targetPaymentId, file, note);
        form.reset();
        setInitialPaymentId("");
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

  async function submitHomework(
    hwId: string,
    file: File | null,
    note: string
  ): Promise<boolean> {
    if (!hwId || !note) {
      setActionError("Write a practice reflection before submitting.");
      return false;
    }
    return runAction(
      "homework",
      async () => {
        await upload("homework", hwId, file, note);
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
    if (!lessonId || !reason.trim() || slots.length < 2) {
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
    return runAction(
      "reschedule",
      async () => {
        await postJson({
          action: "request",
          lessonId,
          slots,
          reason: reason.trim(),
        });
      },
      "Request submitted. Approval progress below reflects the saved record."
    );
  }

  async function review(
    item: HomeworkItem,
    feedbackText: string
  ): Promise<boolean> {
    const value = feedbackText.trim();
    if (!value) {
      setActionError("Write feedback before marking this work reviewed.");
      return false;
    }
    return runAction(
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
    note: string,
    selectedSlotArg?: string
  ): Promise<boolean> {
    const canActAsTeacher = canTeachLesson(request.lesson_id);
    const actingAsTeacher = canActAsTeacher && !request.teacher_approved;
    const actingAsFinalApprover = isFinalApprover && !actingAsTeacher;

    const selectedSlot = actingAsTeacher
      ? selectedSlotArg || ""
      : request.selected_slot || selectedSlotArg || "";

    if (decision === "approve") {
      if (actingAsFinalApprover && !request.teacher_approved) {
        setActionError(
          "Final approval is locked until the teacher confirms availability."
        );
        return false;
      }
      if (!selectedSlot) {
        setActionError("Select one proposed slot before approving.");
        return false;
      }
    }
    if (decision === "reject" && !note.trim()) {
      setActionError("Write a reason before rejecting this request.");
      return false;
    }

    return runAction(
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

  async function proposeCounter(
    request: RescheduleRequest,
    rawSlots: string[],
    rawReason: string
  ): Promise<boolean> {
    const slots = rawSlots
      .filter(Boolean)
      .map((value) => new Date(value).toISOString());
    const reason = rawReason.trim();
    if (
      !reason ||
      !slots.length ||
      slots.some((slot) => new Date(slot).getTime() <= Date.now())
    ) {
      setActionError(
        "Offer at least one future alternative and explain the counterproposal."
      );
      return false;
    }
    return runAction(
      `counter-${request.id}`,
      async () => {
        await postJson({ action: "counter", id: request.id, slots, reason });
      },
      "Counterproposal sent. The saved request has been refreshed."
    );
  }

  async function acceptCounter(
    request: RescheduleRequest,
    selectedSlot: string
  ): Promise<boolean> {
    if (!selectedSlot) {
      setActionError("Select one teacher-proposed time before accepting.");
      return false;
    }
    return runAction(
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

  const openAssignModal = () => {
    setAssignError("");
    if (academyStudents.length === 0) {
      void loadAssignableStudents();
    }
    const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    setAssignForm((prev) => ({
      studentId: prev.studentId || selectableStudents[0]?.id || "",
      title: "",
      dueDate: prev.dueDate || defaultDue,
      note: "",
    }));
    setAssignModalOpen(true);
  };

  return (
    <main className="wf-page">
      <div className="wf-topline" />
      <div className="wf-content">
        <header className="wf-intro">
          <h1>{isHomeworkRoute ? "Homework" : "Workflows"}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isHomeworkRoute && canAssignHomework && (
              <button
                type="button"
                className="wf-button"
                onClick={openAssignModal}
                disabled={loading}
              >
                <Plus size={14} />+ Assign Homework
              </button>
            )}
            <button
              type="button"
              className="wf-button secondary"
              onClick={() => void load()}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
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
            {!isHomeworkRoute && (
              <div className="wf-stack">
                <section className="wf-card">
                  <div className="wf-skeleton">
                    <i />
                    <i />
                    <i />
                  </div>
                </section>
              </div>
            )}
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
                    canSeeReceipts={canSeeReceipts}
                    isFamily={isFamily}
                    isHomeworkRoute={isHomeworkRoute}
                    initialPaymentId={initialPaymentId}
                    busy={busy}
                    filesFor={filesFor}
                    submitReceipt={submitReceipt}
                    setActionError={setActionError}
                  />

                  <WorkflowHomeworkSection
                    data={data}
                    canViewHomework={canViewHomework}
                    canAssignHomework={canAssignHomework}
                    isReviewer={isReviewer}
                    isFamily={isFamily}
                    isHomeworkRoute={isHomeworkRoute}
                    assignedHomework={assignedHomework}
                    busy={busy}
                    filesFor={filesFor}
                    onOpenAssignModal={openAssignModal}
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
                    isFinalApprover={isFinalApprover}
                    upcomingLessons={upcomingLessons}
                    pendingRequests={pendingRequests}
                    busy={busy}
                    canTeachLesson={canTeachLesson}
                    submitReschedule={submitReschedule}
                    decide={decide}
                    proposeCounter={proposeCounter}
                    acceptCounter={acceptCounter}
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
      </div>

      {/* Assign Homework Modal */}
      {canAssignHomework && (
        <PortalModal
          open={assignModalOpen}
          onClose={() => {
            setAssignModalOpen(false);
            setAssignError("");
          }}
          eyebrow="Practice assignment"
          title="Assign homework"
          subtitle="Practice tasks appear in the student's notebook and homework portal with due dates."
          size="md"
          busy={busy === "assign-homework"}
        >
          <form
            className="wf-form"
            style={{ padding: 0, border: "none", background: "transparent" }}
            onSubmit={submitAssignHomework}
          >
            {assignError && (
              <div className="wf-alert" role="alert" style={{ marginBottom: 10 }}>
                {assignError}
              </div>
            )}
            <div className="wf-form-grid">
              <div className="wf-field full">
                <label htmlFor="assign-hw-student">Student *</label>
                <select
                  id="assign-hw-student"
                  required
                  value={assignForm.studentId}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, studentId: e.target.value })
                  }
                  disabled={loadingStudents}
                >
                  <option value="">
                    {loadingStudents
                      ? "Loading students…"
                      : "Select an enrolled student"}
                  </option>
                  {selectableStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                      {student.instrument ? ` · ${student.instrument}` : ""}
                      {student.teacherName ? ` (${student.teacherName})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="wf-field full">
                <label htmlFor="assign-hw-title">Practice assignment *</label>
                <input
                  id="assign-hw-title"
                  type="text"
                  required
                  maxLength={120}
                  placeholder="e.g. C Major scale hands together at 72 BPM"
                  value={assignForm.title}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, title: e.target.value })
                  }
                />
              </div>
              <div className="wf-field full">
                <label htmlFor="assign-hw-due">Due date *</label>
                <input
                  id="assign-hw-due"
                  type="date"
                  required
                  value={assignForm.dueDate}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, dueDate: e.target.value })
                  }
                />
              </div>
              <div className="wf-field full">
                <label htmlFor="assign-hw-note">
                  Instructions / teacher guidance
                </label>
                <textarea
                  id="assign-hw-note"
                  rows={4}
                  maxLength={4000}
                  placeholder="Share practice tips, bar numbers, tempo goals, or recording guidance."
                  value={assignForm.note}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, note: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="wf-button secondary"
                onClick={() => setAssignModalOpen(false)}
                disabled={busy === "assign-homework"}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="wf-button"
                disabled={
                  busy === "assign-homework" ||
                  !assignForm.studentId ||
                  !assignForm.title.trim() ||
                  !assignForm.dueDate
                }
              >
                {busy === "assign-homework"
                  ? "Assigning…"
                  : "Assign Homework"}
              </button>
            </div>
          </form>
        </PortalModal>
      )}
    </main>
  );
}
