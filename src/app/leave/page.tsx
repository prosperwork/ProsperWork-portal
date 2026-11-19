"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Forward,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { leaveAction, type LeaveData, type StaffLeave } from "@/lib/academy/leave";
import { readJson } from "@/lib/academy/web-client";
import { PortalModal } from "@/app/_components/PortalModal";
import ProfileAvatar from "@/app/_components/ProfileAvatar";

type JsonResult = Record<string, unknown>;
type RouteChoice = "hr" | "head_admin";
type LeaveKind = "leave" | "exam_break" | "sick_leave";
type PlanSelection = Record<string, string>;
type LeaveTab = "needs_action" | "my_requests" | "active_upcoming" | "history";

function isStaffRole(role: string): boolean {
  const normalized = role.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return !["parent", "student"].includes(normalized) && normalized !== "";
}
const staffLabels: Record<string, string> = {
  teacher: "Teacher",
  admin: "Admin",
  qc: "QC",
  quality_control: "QC",
  hr: "HR",
  head: "Head",
  head_admin: "Head Admin",
  finance: "Finance",
  sales: "Sales",
  sales_marketing: "Sales",
  social: "Social",
  social_media: "Social",
  general_manager: "General Manager",
  owner: "Owner",
  super_admin: "Owner",
};

function roleKey(value: string) {
  return value.toLowerCase().trim().replace(/[\s-]+/g, "_");
}
function errorText(result: JsonResult, status: number) {
  if (typeof result.error === "string") return result.error;
  if (typeof result.message === "string") return result.message;
  return `The request could not be completed (${status}).`;
}
function localInput(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}
function formatDate(value: string, timezone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
}
function localPreview(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Choose a valid date and time.";
  const utc = date.toISOString();
  return `Saved exact UTC: ${utc} · staff local: ${formatDate(utc, timezone)}`;
}
function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (part) => part.toUpperCase());
}

export default function LeavePage() {
  const [data, setData] = useState<LeaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  // Tabs & search
  const [activeTab, setActiveTab] = useState<LeaveTab>("needs_action");
  const tabInitializedRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Request leave modal
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [staffId, setStaffId] = useState("");
  const [route, setRoute] = useState<RouteChoice>("hr");
  const [kind, setKind] = useState<LeaveKind>("leave");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  // HR decision modal
  const [decisionModal, setDecisionModal] = useState<{
    leave: StaffLeave;
    action: "hr_approve" | "reject";
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionError, setDecisionError] = useState("");

  // Cancel leave modal
  const [cancelModalLeave, setCancelModalLeave] = useState<StaffLeave | null>(
    null
  );
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");

  // Cover planner modal
  const [coverModalLeaveId, setCoverModalLeaveId] = useState<string | null>(
    null
  );
  const [planSelections, setPlanSelections] = useState<PlanSelection>({});
  const [coverModalError, setCoverModalError] = useState("");
  const [coverModalNotice, setCoverModalNotice] = useState("");

  const load = useCallback(async (): Promise<LeaveData | null> => {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/leave", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await readJson(response);
      if (response.status === 401) {
        window.location.assign("/login");
        return null;
      }
      if (!response.ok) throw new Error(errorText(result, response.status));
      const payload = result as unknown as LeaveData;
      if (
        !payload.profile ||
        !Array.isArray(payload.leaves) ||
        !Array.isArray(payload.covers) ||
        !Array.isArray(payload.coverTimeline) ||
        !Array.isArray(payload.directory) ||
        !Array.isArray(payload.students) ||
        typeof payload.serverNow !== "string"
      ) {
        throw new Error("The leave service returned an incomplete response.");
      }
      setData(payload);
      return payload;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Leave records could not be loaded."
      );
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const role = roleKey(data?.profile.role ?? "");
  const perms = useMemo(
    () => new Set(data?.profile.permissions ?? []),
    [data?.profile?.permissions]
  );
  const isActive = data?.profile.status.trim().toLowerCase() === "active";
  const isOwner = role === "owner" || role === "super_admin";
  const isHR =
    role === "hr" || perms.has("workspace.hiring") || perms.has("workspace.leave");
  const isHead =
    role === "head" ||
    role === "head_admin" ||
    perms.has("workspace.management");
  const isHeadOwner = isHead || isOwner;
  const isManager = isHR || isHeadOwner || perms.has("workspace.leave");
  const canRequestOwn = Boolean(isActive && isStaffRole(role));
  const canRequestForOthers = Boolean(isActive && isManager);
  const deviceTimezone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "device local time"
      : "device local time";
  const serverNow = useMemo(() => {
    const parsed = data?.serverNow ? new Date(data.serverNow) : new Date();
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }, [data?.serverNow]);
  const minLocalDateTime = localInput(serverNow.toISOString());

  const staffById = useMemo(
    () => new Map((data?.directory ?? []).map((person) => [person.id, person])),
    [data?.directory]
  );
  const ownName = data?.profile.name ?? "";
  const staffName = useCallback(
    (id: string) =>
      id === data?.profile.id
        ? ownName
        : staffById.get(id)?.name ?? `Staff ${id.slice(0, 8)}`,
    [data?.profile.id, ownName, staffById]
  );
  const staffTimezone = useCallback(
    (id: string) =>
      id === data?.profile.id
        ? data?.profile.timezone ?? "UTC"
        : staffById.get(id)?.timezone ?? data?.profile.timezone ?? "UTC",
    [data?.profile.id, data?.profile.timezone, staffById]
  );
  const targetStaffId = staffId || data?.profile.id || "";
  const targetStaff =
    targetStaffId === data?.profile.id
      ? data?.profile
      : staffById.get(targetStaffId);
  const targetZone = targetStaff?.timezone || data?.profile.timezone || "UTC";
  const targetRole = roleKey(targetStaff?.role ?? "");
  const requestTargets = (data?.directory ?? []).filter(
    (person) =>
      isStaffRole(person.role) &&
      person.status.trim().toLowerCase() === "active"
  );
  const visibleLeaves = useMemo(() => {
    if (!data) return [];
    const own = data.leaves.filter((leave) => leave.staff_id === data.profile.id);
    const others = isManager
      ? data.leaves.filter((leave) => leave.staff_id !== data.profile.id)
      : [];
    return [...own, ...others]
      .slice()
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }, [data, isManager]);
  const myCovers =
    data?.covers.filter((cover) => cover.cover_id === data.profile.id) ?? [];
  const awaitingHR = visibleLeaves.filter(
    (leave) => leave.state === "submitted" || leave.state === "forwarded"
  ).length;
  const activeNow = visibleLeaves.filter(
    (leave) => leave.state === "active"
  ).length;

  const showDecision = useCallback(
    (leave: StaffLeave) => {
      if (!data || !isActive || !isHR) return false;
      const independent =
        leave.staff_id !== data.profile.id &&
        leave.submitted_by !== data.profile.id;
      const stage =
        leave.route === "hr"
          ? leave.state === "submitted"
          : leave.state === "forwarded";
      return independent && stage;
    },
    [data, isActive, isHR]
  );
  const canForward = useCallback(
    (leave: StaffLeave) =>
      Boolean(
        isActive &&
          isHeadOwner &&
          leave.route === "head_admin" &&
          leave.state === "submitted"
      ),
    [isActive, isHeadOwner]
  );
  const canFinalize = useCallback(
    (leave: StaffLeave) =>
      Boolean(
        isActive &&
          isHeadOwner &&
          leave.staff_id !== data?.profile.id &&
          leave.state === "hr_approved"
      ),
    [isActive, isHeadOwner, data?.profile.id]
  );
  const canCancel = useCallback(
    (leave: StaffLeave) =>
      Boolean(
        isActive &&
          (leave.staff_id === data?.profile.id || isManager) &&
          !["completed", "rejected", "cancelled"].includes(leave.state)
      ),
    [isActive, data?.profile.id, isManager]
  );

  // Categorized buckets for tabs
  const tabBuckets = useMemo(() => {
    const nowMs = serverNow.getTime();
    const needsAction = visibleLeaves.filter(
      (leave) =>
        canForward(leave) ||
        showDecision(leave) ||
        canFinalize(leave) ||
        ["submitted", "forwarded", "hr_approved"].includes(leave.state)
    );
    const myRequests = visibleLeaves.filter(
      (leave) => leave.staff_id === data?.profile.id
    );
    const activeUpcoming = visibleLeaves.filter(
      (leave) =>
        leave.state === "active" ||
        (leave.state === "approved" && Date.parse(leave.ends_at) >= nowMs)
    );
    const history = visibleLeaves.filter(
      (leave) =>
        ["completed", "rejected", "cancelled"].includes(leave.state) ||
        (leave.state === "approved" && Date.parse(leave.ends_at) < nowMs)
    );
    return {
      needs_action: needsAction,
      my_requests: myRequests,
      active_upcoming: activeUpcoming,
      history,
    };
  }, [
    visibleLeaves,
    serverNow,
    canForward,
    showDecision,
    canFinalize,
    data?.profile.id,
  ]);

  // Auto-select a non-empty tab on initial load if Needs Action is empty
  useEffect(() => {
    if (!data || tabInitializedRef.current) return;
    tabInitializedRef.current = true;
    if (tabBuckets.needs_action.length > 0) {
      setActiveTab("needs_action");
    } else if (tabBuckets.active_upcoming.length > 0) {
      setActiveTab("active_upcoming");
    } else if (tabBuckets.my_requests.length > 0) {
      setActiveTab("my_requests");
    } else if (tabBuckets.history.length > 0) {
      setActiveTab("history");
    }
  }, [data, tabBuckets]);

  const filteredLeaves = useMemo(() => {
    const list = tabBuckets[activeTab];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((leave) => {
      const own = leave.staff_id === data?.profile.id;
      const maySeeReason = own || isManager;
      const haystack = [
        staffName(leave.staff_id),
        staffName(leave.submitted_by),
        titleCase(leave.kind),
        titleCase(leave.state),
        leave.route,
        maySeeReason ? leave.reason : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [tabBuckets, activeTab, searchQuery, data?.profile.id, isManager, staffName]);

  const postAction = async (action: unknown) => {
    const parsed = leaveAction.safeParse(action);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(
        first
          ? `${first.path.join(".") || "Action"}: ${first.message}`
          : "The leave action was not valid."
      );
    }
    const response = await fetch("/api/leave", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const result = await readJson(response);
    if (!response.ok || result.ok === false)
      throw new Error(errorText(result, response.status));
    return result;
  };

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRequestOwn || !data) return;
    const selectedRole = targetRole;
    if (
      !isStaffRole(selectedRole) ||
      targetStaff?.status.trim().toLowerCase() !== "active"
    ) {
      setRequestError("Choose an active staff record from the private directory.");
      return;
    }
    if (!reason.trim() || reason.trim().length < 5) {
      setRequestError("Enter a reason of at least 5 characters.");
      return;
    }
    const startDate = startsAt ? new Date(startsAt) : null;
    const endDate = endsAt ? new Date(endsAt) : null;
    if (
      !startDate ||
      !endDate ||
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      startDate.getTime() <= Date.parse(data.serverNow)
    ) {
      setRequestError("Choose valid future start and end dates.");
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setRequestError("The end date must be after the start date.");
      return;
    }
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const actualStaffId =
      targetStaffId !== data.profile.id ? targetStaffId : undefined;
    if (actualStaffId && !canRequestForOthers) {
      setRequestError(
        "Only HR, Head Admin, or Owner can submit on behalf of another staff member."
      );
      return;
    }
    setBusy("request");
    setRequestError("");
    setActionError("");
    setNotice("");
    try {
      const before = new Set(data.leaves.map((leave) => leave.id));
      const result = await postAction({
        action: "request",
        ...(actualStaffId ? { staffId: actualStaffId } : {}),
        route,
        kind,
        startsAt: startIso,
        endsAt: endIso,
        reason: reason.trim(),
      });
      const fresh = await load();
      const newLeave =
        typeof result.id === "string"
          ? fresh?.leaves.find((leave) => leave.id === result.id)
          : fresh?.leaves.find(
              (leave) =>
                !before.has(leave.id) &&
                leave.staff_id === targetStaffId &&
                leave.route === route &&
                leave.kind === kind &&
                leave.starts_at === startIso &&
                leave.ends_at === endIso
            );
      if (!newLeave)
        throw new Error(
          "The leave request was accepted, but the new record is not visible yet. Refresh before retrying."
        );
      setStartsAt("");
      setEndsAt("");
      setReason("");
      setStaffId("");
      setRequestFormOpen(false);
      setNotice(
        `Request submitted for ${staffName(targetStaffId)}. Current stage: ${titleCase(
          newLeave.state
        )}.`
      );
    } catch (cause) {
      setRequestError(
        cause instanceof Error
          ? cause.message
          : "The leave request could not be submitted."
      );
    } finally {
      setBusy("");
    }
  };

  const changeState = async (
    leave: StaffLeave,
    action: "forward" | "hr_approve" | "reject" | "cancel" | "finalize",
    suppliedReason?: string
  ): Promise<boolean> => {
    if (!data) return false;
    const text = suppliedReason?.trim() ?? "";
    if (
      (action === "hr_approve" || action === "reject" || action === "cancel") &&
      text.length < 5
    ) {
      const msg = "A reason of at least 5 characters is required.";
      if (action === "cancel") setCancelError(msg);
      else setDecisionError(msg);
      return false;
    }
    setBusy(`${action}:${leave.id}`);
    setActionError("");
    setDecisionError("");
    setCancelError("");
    setNotice("");
    try {
      await postAction({
        action,
        id: leave.id,
        ...(["hr_approve", "reject", "cancel"].includes(action)
          ? { reason: text }
          : {}),
      });
      const fresh = await load();
      const saved = fresh?.leaves.find((row) => row.id === leave.id);
      const expected: StaffLeave["state"][] =
        action === "forward"
          ? ["forwarded"]
          : action === "hr_approve"
            ? ["hr_approved"]
            : action === "reject"
              ? ["rejected"]
              : action === "cancel"
                ? ["cancelled"]
                : ["approved"];
      if (!saved || !expected.includes(saved.state))
        throw new Error(
          "The leave stage has not changed in the saved record yet. Refresh before treating this action as complete."
        );
      setNotice(
        `${staffName(saved.staff_id)} · request is now ${titleCase(saved.state)}.`
      );
      return true;
    } catch (cause) {
      const msg =
        cause instanceof Error
          ? cause.message
          : "The leave stage could not be changed.";
      if (action === "cancel") setCancelError(msg);
      else if (action === "hr_approve" || action === "reject")
        setDecisionError(msg);
      else setActionError(msg);
      return false;
    } finally {
      setBusy("");
    }
  };

  const peopleForCover = (leave: StaffLeave) => {
    const absentStaff = staffById.get(leave.staff_id);
    const absenceRole = roleKey(absentStaff?.role ?? "");
    const isEducator =
      absenceRole === "teacher" ||
      absentStaff?.department === "Music Education" ||
      absenceRole.includes("teacher");
    return (data?.directory ?? []).filter((person) => {
      if (
        person.id === leave.staff_id ||
        person.status.trim().toLowerCase() !== "active"
      )
        return false;
      const pRole = roleKey(person.role);
      if (isEducator) {
        return (
          pRole === "teacher" ||
          pRole === "qc" ||
          pRole === "quality_control" ||
          person.department === "Music Education" ||
          pRole.includes("teacher")
        );
      }
      return (
        pRole === "admin" ||
        pRole === "head" ||
        pRole === "head_admin" ||
        (person.department !== "Music Education" &&
          pRole !== "parent" &&
          pRole !== "student")
      );
    });
  };

  const coverPlans = (leave: StaffLeave) => {
    if (!data) return [];
    const absentStaff = staffById.get(leave.staff_id);
    const absentRole = roleKey(absentStaff?.role ?? "");
    const isEducator =
      absentRole === "teacher" ||
      absentStaff?.department === "Music Education" ||
      absentRole.includes("teacher");
    return data.students.filter(
      (student) =>
        student.payload.status.trim().toLowerCase() === "active" &&
        (isEducator
          ? student.teacher_id === leave.staff_id
          : student.admin_id === leave.staff_id)
    );
  };

  const coverGroupKey = (leave: StaffLeave, studentId: string) => {
    const student = data?.students.find((row) => row.id === studentId);
    const absentStaff = staffById.get(leave.staff_id);
    const absentRole = roleKey(absentStaff?.role ?? "");
    const isEducator =
      absentRole === "teacher" ||
      absentStaff?.department === "Music Education" ||
      absentRole.includes("teacher");
    return !isEducator
      ? `${leave.id}:parent:${student?.parent_id ?? studentId}`
      : `${leave.id}:student:${studentId}`;
  };

  const selectedCover = (leave: StaffLeave, studentId: string) => {
    const groupKey = coverGroupKey(leave, studentId);
    if (planSelections[groupKey]) return planSelections[groupKey];
    const group = coverPlans(leave).filter(
      (student) => coverGroupKey(leave, student.id) === groupKey
    );
    const eligibleCoverIds = new Set(
      peopleForCover(leave).map((person) => person.id)
    );
    const existing = new Set(
      (data?.covers ?? [])
        .filter(
          (cover) =>
            cover.leave_id === leave.id &&
            eligibleCoverIds.has(cover.cover_id) &&
            group.some((student) => student.id === cover.student_id)
        )
        .map((cover) => cover.cover_id)
    );
    return existing.size === 1 ? Array.from(existing)[0] : "";
  };

  const savePlan = async (
    leave: StaffLeave,
    studentId: string,
    coverId: string
  ) => {
    if (
      !isActive ||
      !isHeadOwner ||
      leave.state !== "hr_approved" ||
      leave.staff_id === data?.profile.id ||
      !peopleForCover(leave).some((person) => person.id === coverId) ||
      !coverPlans(leave).some((student) => student.id === studentId)
    )
      return;
    setBusy(`plan:${leave.id}:${studentId}`);
    setCoverModalError("");
    setCoverModalNotice("");
    setActionError("");
    setNotice("");
    try {
      await postAction({ action: "plan", id: leave.id, studentId, coverId });
      const fresh = await load();
      const cover = fresh?.covers.find(
        (row) =>
          row.leave_id === leave.id &&
          row.student_id === studentId &&
          row.cover_id === coverId
      );
      if (!cover)
        throw new Error(
          "The plan request was accepted, but the saved cover assignment is not visible yet."
        );
      const learnerName =
        fresh?.students.find((row) => row.id === studentId)?.payload.name ??
        "the learner";
      setCoverModalNotice(`Cover assignment saved for ${learnerName}.`);
      setNotice(`Cover assignment saved for ${learnerName}.`);
    } catch (cause) {
      setCoverModalError(
        cause instanceof Error
          ? cause.message
          : "The cover assignment could not be saved."
      );
    } finally {
      setBusy("");
    }
  };

  const saveAllPlans = async (leave: StaffLeave) => {
    if (
      !isActive ||
      !isHeadOwner ||
      leave.state !== "hr_approved" ||
      leave.staff_id === data?.profile.id
    )
      return;
    const affected = coverPlans(leave);
    const eligibleIds = new Set(peopleForCover(leave).map((p) => p.id));
    const existingCovers = (data?.covers ?? []).filter(
      (c) => c.leave_id === leave.id
    );

    const assignments = affected
      .map((student) => ({
        student,
        coverId: selectedCover(leave, student.id),
      }))
      .filter(({ student, coverId }) => {
        if (!coverId || !eligibleIds.has(coverId)) return false;
        const alreadySame = existingCovers.some(
          (c) => c.student_id === student.id && c.cover_id === coverId
        );
        return !alreadySame;
      });

    if (assignments.length === 0) {
      setCoverModalNotice(
        "All selected cover assignments are already saved, or choose a cover staff member first."
      );
      return;
    }

    setBusy(`plan_all:${leave.id}`);
    setCoverModalError("");
    setCoverModalNotice("");
    setActionError("");
    setNotice("");
    try {
      const failures: string[] = [];
      let savedCount = 0;
      for (const { student, coverId } of assignments) {
        try {
          await postAction({
            action: "plan",
            id: leave.id,
            studentId: student.id,
            coverId,
          });
          savedCount += 1;
        } catch (err) {
          failures.push(
            `${student.payload.name}: ${
              err instanceof Error ? err.message : "Save failed"
            }`
          );
        }
      }
      await load();
      if (failures.length > 0) {
        setCoverModalError(
          `Saved ${savedCount} assignment(s), but ${failures.length} failed: ${failures.join(
            "; "
          )}`
        );
      } else {
        const msg = `Saved ${savedCount} cover assignment${
          savedCount === 1 ? "" : "s"
        } for ${staffName(leave.staff_id)}.`;
        setCoverModalNotice(msg);
        setNotice(msg);
      }
    } finally {
      setBusy("");
    }
  };

  const activeCoverModalLeave = useMemo(
    () =>
      coverModalLeaveId
        ? visibleLeaves.find((l) => l.id === coverModalLeaveId) ?? null
        : null,
    [coverModalLeaveId, visibleLeaves]
  );

  const deviceNow = new Date();
  const deviceMin = localInput(deviceNow.toISOString());

  return (
    <main className="pw-family pw-leave">
      <section className="leave-content">
        {error && (
          <div className="leave-alert" role="alert">
            <AlertCircle size={16} />
            <p>{error}</p>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}
        {actionError && (
          <div className="leave-alert" role="alert">
            <AlertCircle size={16} />
            <p>{actionError}</p>
          </div>
        )}
        {notice && (
          <div className="leave-alert success" role="status">
            <CheckCircle2 size={16} />
            <p>{notice}</p>
          </div>
        )}
        {loading && !data ? (
          <div className="leave-grid">
            <section className="leave-card leave-card-body">
              <div className="leave-skeleton" />
              <div className="leave-skeleton" />
            </section>
            <section className="leave-card leave-card-body">
              <div className="leave-skeleton" />
              <div className="leave-skeleton" />
            </section>
          </div>
        ) : (
          data && (
            <>
              <div className="leave-heading">
                <h1>Leave requests</h1>
                <div className="leave-heading-actions">
                  {canRequestOwn && (
                    <button
                      type="button"
                      className="family-button primary"
                      onClick={() => {
                        setRequestError("");
                        setRequestFormOpen(true);
                      }}
                    >
                      <Plus size={14} />+ Request Leave
                    </button>
                  )}
                  <button
                    type="button"
                    className="family-button subtle"
                    onClick={() => void load()}
                    disabled={refreshing}
                  >
                    <RefreshCw size={14} />{" "}
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>

              {!isActive && (
                <div className="leave-alert info" role="status">
                  <ShieldCheck size={16} />
                  <p>
                    This profile is {data.profile.status}. Existing records are
                    readable; leave requests, decisions, plans, and
                    cancellations are disabled.
                  </p>
                </div>
              )}

              {isActive && !canRequestOwn && (
                <div className="leave-alert info" role="status">
                  <CalendarClock size={16} />
                  <p>
                    Only active staff accounts can submit a leave request.
                    Parents and students do not have access to this workflow.
                  </p>
                </div>
              )}

              <div className="leave-summary">
                <div className="leave-metric">
                  <small>Your visible requests</small>
                  <strong>{visibleLeaves.length}</strong>
                  <span>Private to this profile and its management scope</span>
                </div>
                <div className="leave-metric">
                  <small>In review</small>
                  <strong>{awaitingHR}</strong>
                  <span>Submitted or forwarded</span>
                </div>
                <div className="leave-metric">
                  <small>Active leave</small>
                  <strong>{activeNow}</strong>
                  <span>State returned by the service</span>
                </div>
                <div className="leave-metric">
                  <small>Cover duties linked to you</small>
                  <strong>{myCovers.length}</strong>
                  <span>Existing assignments only</span>
                </div>
              </div>

              <div
                className="leave-grid"
                data-portal-layout="leave-workspace"
                style={{ gridTemplateColumns: "1fr" }}
              >
                <div className="leave-stack leave-records-stack">
                  <section
                    className="leave-card leave-record-ledger"
                    aria-labelledby="leave-records-title"
                  >
                    <div className="leave-card-head">
                      <div>
                        <h2 id="leave-records-title">
                          Leave records &amp; review
                        </h2>
                      </div>
                      <ShieldCheck size={17} color="#6a9d7b" aria-hidden="true" />
                    </div>

                    <div
                      className="leave-card-body"
                      style={{ paddingBottom: 0 }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          marginBottom: 12,
                        }}
                      >
                        <div
                          className="portal-tabs"
                          role="tablist"
                          aria-label="Leave record views"
                          style={{ marginBottom: 0, borderBottom: "none", paddingBottom: 0 }}
                        >
                          {(
                            [
                              {
                                key: "needs_action",
                                label: "Needs Action",
                                count: tabBuckets.needs_action.length,
                              },
                              {
                                key: "my_requests",
                                label: "My Requests",
                                count: tabBuckets.my_requests.length,
                              },
                              {
                                key: "active_upcoming",
                                label: "Active & Upcoming",
                                count: tabBuckets.active_upcoming.length,
                              },
                              {
                                key: "history",
                                label: "History",
                                count: tabBuckets.history.length,
                              },
                            ] as const
                          ).map((tab) => (
                            <button
                              key={tab.key}
                              type="button"
                              role="tab"
                              aria-selected={activeTab === tab.key}
                              className={`portal-tab ${
                                activeTab === tab.key ? "active" : ""
                              }`}
                              onClick={() => setActiveTab(tab.key)}
                            >
                              {tab.label}
                              <span className="portal-tab-badge">
                                {tab.count}
                              </span>
                            </button>
                          ))}
                        </div>

                        <label
                          style={{
                            position: "relative",
                            display: "inline-flex",
                            alignItems: "center",
                            minWidth: 220,
                            flex: "0 1 280px",
                          }}
                        >
                          <Search
                            size={14}
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              left: 10,
                              color: "var(--muted)",
                              pointerEvents: "none",
                            }}
                          />
                          <input
                            type="search"
                            aria-label="Search leave requests"
                            placeholder="Search staff, type, status…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "7px 10px 7px 32px",
                              borderRadius: 9,
                              border: "1px solid var(--line)",
                              background: "var(--white)",
                              fontSize: 13,
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {filteredLeaves.length ? (
                      <div className="leave-card-body">
                        {filteredLeaves.map((leave) => {
                          const own = leave.staff_id === data.profile.id;
                          const maySeeReason = own || isManager;
                          const absentStaff = staffById.get(leave.staff_id);
                          const staffRole = roleKey(absentStaff?.role ?? "");
                          const isEducator =
                            staffRole === "teacher" ||
                            absentStaff?.department === "Music Education" ||
                            staffRole.includes("teacher");
                          const affected = coverPlans(leave);
                          const assignedCovers = data.covers.filter(
                            (cover) => cover.leave_id === leave.id
                          );
                          const eligibleCoverIds = new Set(
                            peopleForCover(leave).map((person) => person.id)
                          );
                          const validAssignedCovers = assignedCovers.filter(
                            (cover) => eligibleCoverIds.has(cover.cover_id)
                          );
                          const coveredStudentIds = new Set(
                            validAssignedCovers.map((cover) => cover.student_id)
                          );
                          const needsCoverPlan =
                            isEducator ||
                            staffRole === "admin" ||
                            staffRole === "head_admin" ||
                            absentStaff?.department === "Administration";
                          const parentGroups = Array.from(
                            new Set(affected.map((student) => student.parent_id))
                          );
                          const sharedAdminCoversConsistent =
                            isEducator ||
                            parentGroups.every((parentId) => {
                              const siblings = affected.filter(
                                (student) => student.parent_id === parentId
                              );
                              return (
                                new Set(
                                  validAssignedCovers
                                    .filter((cover) =>
                                      siblings.some(
                                        (student) =>
                                          student.id === cover.student_id
                                      )
                                    )
                                    .map((cover) => cover.cover_id)
                                ).size <= 1
                              );
                            });
                          const coverageComplete =
                            affected.every((student) =>
                              coveredStudentIds.has(student.id)
                            ) && sharedAdminCoversConsistent;
                          const mayPlan = Boolean(
                            isActive &&
                              isHeadOwner &&
                              leave.state === "hr_approved" &&
                              leave.staff_id !== data.profile.id &&
                              needsCoverPlan
                          );
                          const routeSummary =
                            leave.route === "head_admin"
                              ? "Head Admin → HR"
                              : "Direct HR";

                          return (
                            <article className="leave-item" key={leave.id}>
                              <div className="leave-item-head">
                                <div>
                                  <div className="pw-person-inline">
                                    <ProfileAvatar
                                      profileId={leave.staff_id}
                                      name={staffName(leave.staff_id)}
                                      size={32}
                                    />
                                    <h3>
                                      {staffName(leave.staff_id)} ·{" "}
                                      {titleCase(leave.kind)}
                                    </h3>
                                  </div>
                                  <div className="leave-item-meta">
                                    {staffLabels[staffRole] ??
                                      titleCase(staffRole || "staff")}{" "}
                                    ·{" "}
                                    {formatDate(
                                      leave.starts_at,
                                      staffTimezone(leave.staff_id)
                                    )}{" "}
                                    –{" "}
                                    {formatDate(
                                      leave.ends_at,
                                      staffTimezone(leave.staff_id)
                                    )}
                                  </div>
                                  <div className="leave-item-meta">
                                    Route: {routeSummary} · Submitted by{" "}
                                    {staffName(leave.submitted_by)}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {mayPlan && (
                                    <span
                                      className={`leave-pill ${
                                        coverageComplete ? "approved" : "submitted"
                                      }`}
                                      title="Portfolio cover completion"
                                    >
                                      {coveredStudentIds.size} /{" "}
                                      {affected.length} covered
                                    </span>
                                  )}
                                  <span className={`leave-pill ${leave.state}`}>
                                    {titleCase(leave.state)}
                                  </span>
                                </div>
                              </div>

                              {maySeeReason && (
                                <p className="leave-item-reason">
                                  {leave.reason}
                                </p>
                              )}
                              {leave.synchronization_error && (
                                <p className="leave-action-error" role="alert">
                                  {leave.synchronization_error}
                                </p>
                              )}
                              {leave.decision_reason && (own || isManager) && (
                                <p className="leave-private-label">
                                  Review note: {leave.decision_reason}
                                </p>
                              )}
                              {!maySeeReason && (
                                <div className="leave-cover-note">
                                  Sensitive reason hidden. Covering staff see
                                  dates and assignment state only.
                                </div>
                              )}
                              {assignedCovers.length > 0 && (
                                <div className="leave-cover-note">
                                  <strong>Saved cover links:</strong>{" "}
                                  {assignedCovers
                                    .map(
                                      (cover) =>
                                        `${
                                          data.students.find(
                                            (student) =>
                                              student.id === cover.student_id
                                          )?.payload.name ?? cover.student_id
                                        } → ${staffName(
                                          cover.cover_id
                                        )} (${titleCase(cover.duty)}${
                                          cover.applied_at
                                            ? ` · applied ${formatDate(
                                                cover.applied_at,
                                                staffTimezone(cover.cover_id)
                                              )}`
                                            : ""
                                        })`
                                    )
                                    .join(" · ")}
                                  . Primary ownership remains with the absent
                                  staff member.
                                </div>
                              )}

                              {leave.state === "hr_approved" &&
                                !isHeadOwner && (
                                  <div className="leave-action-note">
                                    HR has approved this request; Head Admin or
                                    Owner finalizes it after portfolio and
                                    capacity checks.
                                  </div>
                                )}

                              {canFinalize(leave) &&
                                needsCoverPlan &&
                                !coverageComplete && (
                                  <div className="leave-action-note">
                                    Finalize is locked until every active
                                    learner ({coveredStudentIds.size}/
                                    {affected.length}) has a saved compatible
                                    cover.
                                  </div>
                                )}

                              <div
                                className="leave-actions"
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                  marginTop: 10,
                                }}
                              >
                                {canForward(leave) && (
                                  <button
                                    type="button"
                                    className="family-button primary"
                                    onClick={() =>
                                      void changeState(leave, "forward")
                                    }
                                    disabled={busy === `forward:${leave.id}`}
                                  >
                                    <Forward size={13} /> Forward to HR
                                  </button>
                                )}

                                {showDecision(leave) && (
                                  <>
                                    <button
                                      type="button"
                                      className="family-button primary"
                                      onClick={() => {
                                        setDecisionReason("");
                                        setDecisionError("");
                                        setDecisionModal({
                                          leave,
                                          action: "hr_approve",
                                        });
                                      }}
                                    >
                                      <Check size={13} /> Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="family-button danger"
                                      onClick={() => {
                                        setDecisionReason("");
                                        setDecisionError("");
                                        setDecisionModal({
                                          leave,
                                          action: "reject",
                                        });
                                      }}
                                    >
                                      <XCircle size={13} /> Reject
                                    </button>
                                  </>
                                )}

                                {mayPlan && (
                                  <button
                                    type="button"
                                    className="family-button subtle"
                                    onClick={() => {
                                      setCoverModalError("");
                                      setCoverModalNotice("");
                                      setCoverModalLeaveId(leave.id);
                                    }}
                                  >
                                    <Users size={13} /> Plan Cover (
                                    {coveredStudentIds.size}/{affected.length})
                                  </button>
                                )}

                                {canFinalize(leave) && (
                                  <button
                                    type="button"
                                    className="family-button primary"
                                    onClick={() =>
                                      void changeState(leave, "finalize")
                                    }
                                    disabled={
                                      !coverageComplete ||
                                      busy === `finalize:${leave.id}`
                                    }
                                    title={
                                      !coverageComplete
                                        ? "Complete portfolio cover planning before finalizing"
                                        : "Run server capacity check and finalize leave"
                                    }
                                  >
                                    {busy === `finalize:${leave.id}` ? (
                                      <>
                                        <LoaderCircle size={13} /> Finalizing…
                                      </>
                                    ) : (
                                      "Finalize"
                                    )}
                                  </button>
                                )}

                                {canCancel(leave) && (
                                  <button
                                    type="button"
                                    className="family-button danger"
                                    onClick={() => {
                                      setCancelReason("");
                                      setCancelError("");
                                      setCancelModalLeave(leave);
                                    }}
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="leave-empty">
                        <strong>
                          {searchQuery.trim()
                            ? "No matching leave records"
                            : "No leave records in this tab"}
                        </strong>
                        {searchQuery.trim()
                          ? "Try another staff name, status, or switch tabs."
                          : "Only requests matching this category appear here."}
                      </div>
                    )}
                  </section>
                </div>

                <div className="leave-support-work">
                  <section
                    className="leave-flat-section"
                    aria-labelledby="cover-duty-title"
                  >
                    <div className="leave-card-head">
                      <div>
                        <h2 id="cover-duty-title">Your linked cover duties</h2>
                        <p>
                          Minimal cover assignment details; absent staff reasons
                          and leave kinds are not shown here.
                        </p>
                      </div>
                      <Users size={17} color="#6a9d7b" aria-hidden="true" />
                    </div>
                    {myCovers.length ? (
                      <div className="leave-card-body">
                        {myCovers.map((cover) => {
                          const timeline = data.coverTimeline.find(
                            (item) => item.id === cover.leave_id
                          );
                          const student = data.students.find(
                            (item) => item.id === cover.student_id
                          );
                          const studentName =
                            student?.payload.name ??
                            `Learner ${cover.student_id.slice(0, 8)}`;
                          return (
                            <article className="leave-item" key={cover.id}>
                              <div className="leave-item-head">
                                <div>
                                  <div className="pw-person-inline">
                                    <ProfileAvatar
                                      name={studentName}
                                      size={30}
                                    />
                                    <h3>{studentName}</h3>
                                  </div>
                                  <div className="leave-item-meta">
                                    {titleCase(cover.duty)} cover ·{" "}
                                    {timeline
                                      ? `${formatDate(
                                          timeline.starts_at,
                                          staffTimezone(timeline.staff_id)
                                        )} – ${formatDate(
                                          timeline.ends_at,
                                          staffTimezone(timeline.staff_id)
                                        )} · ${staffTimezone(
                                          timeline.staff_id
                                        )}`
                                      : `Linked leave ${cover.leave_id.slice(
                                          0,
                                          8
                                        )}`}
                                  </div>
                                </div>
                                {timeline && (
                                  <span
                                    className={`leave-pill ${timeline.state}`}
                                  >
                                    {titleCase(timeline.state)}
                                  </span>
                                )}
                              </div>
                              <div className="leave-private-label">
                                Primary portfolio owner remains unchanged ·
                                covering for {staffName(cover.original_id)}
                                {cover.applied_at
                                  ? ` · applied ${formatDate(
                                      cover.applied_at,
                                      data.profile.timezone
                                    )}`
                                  : " · not yet applied"}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="leave-empty">
                        <strong>No cover duties linked</strong>Cover work will
                        appear here only when the service returns an assignment.
                      </div>
                    )}
                  </section>

                  {data.coverTimeline.some((item) =>
                    myCovers.some((cover) => cover.leave_id === item.id)
                  ) && (
                    <section
                      className="leave-flat-section"
                      aria-labelledby="cover-timeline-title"
                    >
                      <div className="leave-card-head">
                        <div>
                          <h2 id="cover-timeline-title">
                            Sanitized cover timeline
                          </h2>
                          <p>
                            Only the minimal dates and state are shown; no
                            reason or leave category is available to covering
                            staff.
                          </p>
                        </div>
                        <Clock3 size={17} color="#6a9d7b" aria-hidden="true" />
                      </div>
                      <div className="leave-card-body">
                        <div className="leave-timeline">
                          {data.coverTimeline
                            .filter((item) =>
                              myCovers.some(
                                (cover) => cover.leave_id === item.id
                              )
                            )
                            .map((item) => (
                              <div
                                className="leave-timeline-row"
                                key={item.id}
                              >
                                <div className="pw-person-inline">
                                  <ProfileAvatar
                                    profileId={item.staff_id}
                                    name={staffName(item.staff_id)}
                                    size={30}
                                  />
                                  <strong>{staffName(item.staff_id)}</strong>
                                </div>
                                <span>
                                  {formatDate(
                                    item.starts_at,
                                    staffTimezone(item.staff_id)
                                  )}{" "}
                                  –{" "}
                                  {formatDate(
                                    item.ends_at,
                                    staffTimezone(item.staff_id)
                                  )}{" "}
                                  · {staffTimezone(item.staff_id)}
                                </span>
                                <span className={`leave-pill ${item.state}`}>
                                  {titleCase(item.state)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              </div>

              {/* Request Leave Modal */}
              <PortalModal
                open={requestFormOpen}
                onClose={() => {
                  setRequestFormOpen(false);
                  setRequestError("");
                }}
                eyebrow="Leave workflow"
                title="Request leave"
                subtitle="Submit a private leave request for yourself or an active staff member."
                size="md"
                busy={busy === "request"}
              >
                <form
                  onSubmit={(event) => void submitRequest(event)}
                  style={{ display: "grid", gap: 12 }}
                >
                  {requestError && (
                    <div className="leave-alert" role="alert">
                      <AlertCircle size={15} />
                      <p>{requestError}</p>
                    </div>
                  )}

                  {canRequestForOthers && (
                    <div className="leave-form-field">
                      <label htmlFor="leave-staff">Staff member</label>
                      <select
                        id="leave-staff"
                        value={staffId}
                        onChange={(event) => setStaffId(event.target.value)}
                      >
                        <option value="">
                          My own leave · {data.profile.name}
                        </option>
                        {requestTargets
                          .filter((person) => person.id !== data.profile.id)
                          .map((person) => (
                            <option value={person.id} key={person.id}>
                              {person.name} ·{" "}
                              {staffLabels[roleKey(person.role)] ??
                                titleCase(person.role)}{" "}
                              · {titleCase(person.status)}
                            </option>
                          ))}
                      </select>
                      <small>
                        On-behalf requests are available to HR, Head Admin, and
                        Owner for active staff only.
                      </small>
                    </div>
                  )}

                  <div className="leave-form-row">
                    <div className="leave-form-field">
                      <label htmlFor="leave-kind">Type</label>
                      <select
                        id="leave-kind"
                        value={kind}
                        onChange={(event) =>
                          setKind(event.target.value as LeaveKind)
                        }
                      >
                        <option value="leave">Leave</option>
                        <option value="exam_break">Exam break</option>
                        <option value="sick_leave">Sick leave</option>
                      </select>
                    </div>
                    <div className="leave-form-field">
                      <label htmlFor="leave-route">Review route</label>
                      <select
                        id="leave-route"
                        value={route}
                        onChange={(event) =>
                          setRoute(event.target.value as RouteChoice)
                        }
                      >
                        <option value="hr">HR · direct HR review</option>
                        <option value="head_admin">
                          Head Admin → independent HR
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="leave-section-note">
                    <strong>Device timezone:</strong> {deviceTimezone}.
                    Date-time fields below use this timezone; the selected staff
                    member’s timezone is {targetZone}.
                  </div>

                  <div className="leave-form-field">
                    <label htmlFor="leave-start">
                      Starts · device local time
                    </label>
                    <input
                      id="leave-start"
                      type="datetime-local"
                      min={minLocalDateTime || deviceMin}
                      value={startsAt}
                      onChange={(event) => setStartsAt(event.target.value)}
                      required
                    />
                    <small>
                      {startsAt
                        ? `Staff-local preview: ${localPreview(
                            startsAt,
                            targetZone
                          )}`
                        : "Choose the exact local start."}
                    </small>
                  </div>

                  <div className="leave-form-field">
                    <label htmlFor="leave-end">Ends · device local time</label>
                    <input
                      id="leave-end"
                      type="datetime-local"
                      min={startsAt || minLocalDateTime || deviceMin}
                      value={endsAt}
                      onChange={(event) => setEndsAt(event.target.value)}
                      required
                    />
                    <small>
                      {endsAt
                        ? `Staff-local preview: ${localPreview(
                            endsAt,
                            targetZone
                          )}`
                        : "Choose the exact local end."}
                    </small>
                  </div>

                  <div className="leave-form-field">
                    <label htmlFor="leave-reason">
                      Reason · private to the leave and management workflow
                    </label>
                    <textarea
                      id="leave-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      minLength={5}
                      maxLength={2000}
                      rows={3}
                      required
                    />
                  </div>

                  <div className="modal-actions" style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="family-button subtle"
                      onClick={() => setRequestFormOpen(false)}
                      disabled={busy === "request"}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="family-button primary"
                      disabled={busy === "request"}
                    >
                      {busy === "request" ? (
                        <>
                          <LoaderCircle size={14} /> Submitting…
                        </>
                      ) : (
                        "Submit leave request"
                      )}
                    </button>
                  </div>
                </form>
              </PortalModal>

              {/* Portfolio Cover Planner Modal */}
              <PortalModal
                open={Boolean(activeCoverModalLeave)}
                onClose={() => {
                  setCoverModalLeaveId(null);
                  setCoverModalError("");
                  setCoverModalNotice("");
                }}
                eyebrow="Portfolio cover planner"
                title={
                  activeCoverModalLeave
                    ? `Plan cover for ${staffName(
                        activeCoverModalLeave.staff_id
                      )}`
                    : "Plan cover"
                }
                subtitle={
                  activeCoverModalLeave
                    ? `${formatDate(
                        activeCoverModalLeave.starts_at,
                        staffTimezone(activeCoverModalLeave.staff_id)
                      )} – ${formatDate(
                        activeCoverModalLeave.ends_at,
                        staffTimezone(activeCoverModalLeave.staff_id)
                      )}`
                    : undefined
                }
                size="lg"
                busy={
                  Boolean(activeCoverModalLeave) &&
                  (busy.startsWith(`plan:${activeCoverModalLeave?.id}`) ||
                    busy === `plan_all:${activeCoverModalLeave?.id}`)
                }
              >
                {activeCoverModalLeave &&
                  (() => {
                    const leave = activeCoverModalLeave;
                    const absentStaff = staffById.get(leave.staff_id);
                    const staffRole = roleKey(absentStaff?.role ?? "");
                    const isEducator =
                      staffRole === "teacher" ||
                      absentStaff?.department === "Music Education" ||
                      staffRole.includes("teacher");
                    const affected = coverPlans(leave);
                    const options = peopleForCover(leave);
                    const assignedCovers = data.covers.filter(
                      (cover) => cover.leave_id === leave.id
                    );
                    const eligibleCoverIds = new Set(
                      options.map((person) => person.id)
                    );
                    const validAssignedCovers = assignedCovers.filter((cover) =>
                      eligibleCoverIds.has(cover.cover_id)
                    );
                    const coveredStudentIds = new Set(
                      validAssignedCovers.map((cover) => cover.student_id)
                    );
                    const parentGroups = Array.from(
                      new Set(affected.map((student) => student.parent_id))
                    );
                    const sharedAdminCoversConsistent =
                      isEducator ||
                      parentGroups.every((parentId) => {
                        const siblings = affected.filter(
                          (student) => student.parent_id === parentId
                        );
                        return (
                          new Set(
                            validAssignedCovers
                              .filter((cover) =>
                                siblings.some(
                                  (student) => student.id === cover.student_id
                                )
                              )
                              .map((cover) => cover.cover_id)
                          ).size <= 1
                        );
                      });
                    const coverageComplete =
                      affected.every((student) =>
                        coveredStudentIds.has(student.id)
                      ) && sharedAdminCoversConsistent;

                    return (
                      <div style={{ display: "grid", gap: 12 }}>
                        <div className="leave-section-note">
                          Every active learner owned by this absent{" "}
                          {isEducator ? "Teacher" : "Admin"} needs an eligible
                          cover before finalization. Cover capacity is rechecked
                          by the server when finalizing.
                        </div>

                        {coverModalError && (
                          <div className="leave-alert" role="alert">
                            <AlertCircle size={15} />
                            <p>{coverModalError}</p>
                          </div>
                        )}
                        {coverModalNotice && (
                          <div className="leave-alert success" role="status">
                            <CheckCircle2 size={15} />
                            <p>{coverModalNotice}</p>
                          </div>
                        )}

                        {affected.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              flexWrap: "wrap",
                              background: "#f0fdf4",
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: "1px solid #bbf7d0",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#166534",
                              }}
                            >
                              Quick Batch Assign:
                            </span>
                            <select
                              id={`batch-cover-${leave.id}`}
                              style={{
                                fontSize: 12,
                                padding: "6px 10px",
                                borderRadius: 6,
                                border: "1px solid #86efac",
                                background: "#ffffff",
                                flex: "1 1 200px",
                              }}
                              defaultValue=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) return;
                                setPlanSelections((previous) => {
                                  const next = { ...previous };
                                  affected.forEach((student) => {
                                    const groupKey = coverGroupKey(
                                      leave,
                                      student.id
                                    );
                                    next[groupKey] = val;
                                  });
                                  return next;
                                });
                              }}
                            >
                              <option value="">
                                Select one covering staff for all learners…
                              </option>
                              {options.map((person) => (
                                <option value={person.id} key={person.id}>
                                  {person.name} (
                                  {staffLabels[roleKey(person.role)] ??
                                    titleCase(person.role)}
                                  )
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="family-button primary"
                              disabled={
                                !isActive || busy === `plan_all:${leave.id}`
                              }
                              onClick={() => void saveAllPlans(leave)}
                            >
                              {busy === `plan_all:${leave.id}` ? (
                                <>
                                  <LoaderCircle size={13} /> Saving all…
                                </>
                              ) : (
                                <>
                                  <Check size={13} /> Save All Cover Assignments
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {affected.length ? (
                          <div
                            style={{
                              display: "grid",
                              gap: 8,
                              maxHeight: 340,
                              overflowY: "auto",
                              paddingRight: 4,
                            }}
                          >
                            {affected.map((student) => {
                              const groupKey = coverGroupKey(leave, student.id);
                              const groupStudents = affected.filter(
                                (other) =>
                                  coverGroupKey(leave, other.id) === groupKey
                              );
                              const groupCoverIds = new Set(
                                assignedCovers
                                  .filter((cover) =>
                                    groupStudents.some(
                                      (other) => other.id === cover.student_id
                                    )
                                  )
                                  .map((cover) => cover.cover_id)
                              );
                              const conflict = groupCoverIds.size > 1;
                              const chosen = selectedCover(leave, student.id);
                              const existing = assignedCovers.find(
                                (cover) => cover.student_id === student.id
                              );
                              return (
                                <div className="leave-student" key={student.id}>
                                  <div className="pw-person-inline">
                                    <ProfileAvatar
                                      name={student.payload.name}
                                      size={30}
                                    />
                                    <span>
                                      <strong>{student.payload.name}</strong>
                                      <small>
                                        {staffRole === "admin"
                                          ? `Admin portfolio · family group`
                                          : `Teacher portfolio · ${student.payload.timezone}`}
                                        {existing
                                          ? ` · current cover ${staffName(
                                              existing.cover_id
                                            )}`
                                          : ""}
                                      </small>
                                    </span>
                                  </div>
                                  <select
                                    aria-label={`Cover staff for ${student.payload.name}`}
                                    value={chosen}
                                    onChange={(event) =>
                                      setPlanSelections((previous) => ({
                                        ...previous,
                                        [groupKey]: event.target.value,
                                      }))
                                    }
                                    disabled={!isActive}
                                  >
                                    <option value="">
                                      Choose active cover
                                    </option>
                                    {options.map((person) => (
                                      <option value={person.id} key={person.id}>
                                        {person.name} ·{" "}
                                        {staffLabels[roleKey(person.role)] ??
                                          titleCase(person.role)}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="family-button"
                                    onClick={() =>
                                      void savePlan(leave, student.id, chosen)
                                    }
                                    disabled={
                                      !chosen ||
                                      !isActive ||
                                      busy === `plan:${leave.id}:${student.id}`
                                    }
                                  >
                                    {busy ===
                                    `plan:${leave.id}:${student.id}` ? (
                                      <LoaderCircle size={13} />
                                    ) : (
                                      <Check size={13} />
                                    )}{" "}
                                    Save
                                  </button>
                                  {conflict && (
                                    <div className="leave-private-label">
                                      Existing sibling assignments differ.
                                      Choose one shared cover and save the whole
                                      parent portfolio consistently.
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="leave-empty">
                            <strong>No active portfolio rows</strong>The service
                            returned no active learners assigned to this absent
                            staff member.
                          </div>
                        )}

                        <div
                          className={`leave-progress-row ${
                            coverageComplete ? "done" : ""
                          }`}
                        >
                          {coverageComplete ? (
                            <CheckCircle2 size={13} />
                          ) : (
                            <Clock3 size={13} />
                          )}{" "}
                          {coverageComplete
                            ? "Every active portfolio learner has a saved cover."
                            : `${coveredStudentIds.size} of ${
                                affected.length
                              } active learner${
                                affected.length === 1 ? "" : "s"
                              } covered.`}
                        </div>

                        <div className="modal-actions" style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            className="family-button subtle"
                            onClick={() => setCoverModalLeaveId(null)}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    );
                  })()}
              </PortalModal>

              {/* HR Decision Modal */}
              <PortalModal
                open={Boolean(decisionModal)}
                onClose={() => {
                  setDecisionModal(null);
                  setDecisionError("");
                }}
                eyebrow="HR review"
                title={
                  decisionModal?.action === "hr_approve"
                    ? "Approve leave request"
                    : "Reject leave request"
                }
                subtitle={
                  decisionModal
                    ? `${staffName(decisionModal.leave.staff_id)} · ${titleCase(
                        decisionModal.leave.kind
                      )}`
                    : undefined
                }
                size="sm"
                busy={
                  Boolean(decisionModal) &&
                  busy ===
                    `${decisionModal?.action}:${decisionModal?.leave.id}`
                }
              >
                {decisionModal && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const ok = await changeState(
                        decisionModal.leave,
                        decisionModal.action,
                        decisionReason
                      );
                      if (ok) {
                        setDecisionModal(null);
                        setDecisionReason("");
                      }
                    }}
                    style={{ display: "grid", gap: 12 }}
                  >
                    <div className="leave-action-note">
                      {decisionModal.leave.route === "head_admin"
                        ? "Independent HR review is required after Head Admin forwards this request."
                        : "Direct HR review for this request."}{" "}
                      A written reason (min 5 characters) is recorded on the
                      leave case.
                    </div>
                    {decisionError && (
                      <div className="leave-alert" role="alert">
                        <AlertCircle size={15} />
                        <p>{decisionError}</p>
                      </div>
                    )}
                    <div className="leave-form-field">
                      <label htmlFor="modal-decision-reason">
                        HR decision reason (min 5 characters)
                      </label>
                      <textarea
                        id="modal-decision-reason"
                        minLength={5}
                        maxLength={2000}
                        rows={3}
                        required
                        value={decisionReason}
                        onChange={(e) => setDecisionReason(e.target.value)}
                      />
                    </div>
                    <div className="modal-actions" style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        className="family-button subtle"
                        onClick={() => setDecisionModal(null)}
                        disabled={
                          busy ===
                          `${decisionModal.action}:${decisionModal.leave.id}`
                        }
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className={
                          decisionModal.action === "hr_approve"
                            ? "family-button primary"
                            : "family-button danger"
                        }
                        disabled={
                          decisionReason.trim().length < 5 ||
                          busy ===
                            `${decisionModal.action}:${decisionModal.leave.id}`
                        }
                      >
                        {busy ===
                        `${decisionModal.action}:${decisionModal.leave.id}`
                          ? "Saving…"
                          : decisionModal.action === "hr_approve"
                            ? "Confirm HR Approval"
                            : "Confirm Rejection"}
                      </button>
                    </div>
                  </form>
                )}
              </PortalModal>

              {/* Cancel Leave Modal */}
              <PortalModal
                open={Boolean(cancelModalLeave)}
                onClose={() => {
                  setCancelModalLeave(null);
                  setCancelError("");
                }}
                eyebrow="Cancel leave"
                title="Cancel this leave request?"
                subtitle={
                  cancelModalLeave
                    ? `${staffName(cancelModalLeave.staff_id)} · ${titleCase(
                        cancelModalLeave.kind
                      )}`
                    : undefined
                }
                size="sm"
                busy={
                  Boolean(cancelModalLeave) &&
                  busy === `cancel:${cancelModalLeave?.id}`
                }
              >
                {cancelModalLeave && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const ok = await changeState(
                        cancelModalLeave,
                        "cancel",
                        cancelReason
                      );
                      if (ok) {
                        setCancelModalLeave(null);
                        setCancelReason("");
                      }
                    }}
                    style={{ display: "grid", gap: 12 }}
                  >
                    {cancelError && (
                      <div className="leave-alert" role="alert">
                        <AlertCircle size={15} />
                        <p>{cancelError}</p>
                      </div>
                    )}
                    <div className="leave-form-field">
                      <label htmlFor="modal-cancel-reason">
                        Cancellation reason (min 5 characters)
                      </label>
                      <textarea
                        id="modal-cancel-reason"
                        minLength={5}
                        maxLength={2000}
                        rows={3}
                        required
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                    </div>
                    <div className="modal-actions" style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        className="family-button subtle"
                        onClick={() => setCancelModalLeave(null)}
                        disabled={busy === `cancel:${cancelModalLeave.id}`}
                      >
                        Keep request
                      </button>
                      <button
                        type="submit"
                        className="family-button danger"
                        disabled={
                          cancelReason.trim().length < 5 ||
                          busy === `cancel:${cancelModalLeave.id}`
                        }
                      >
                        {busy === `cancel:${cancelModalLeave.id}`
                          ? "Cancelling…"
                          : "Confirm Cancel"}
                      </button>
                    </div>
                  </form>
                )}
              </PortalModal>
            </>
          )
        )}
      </section>
    </main>
  );
}
