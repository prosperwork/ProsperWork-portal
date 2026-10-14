"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CalendarClock, Check, CheckCircle2, Clock3, Forward, LoaderCircle, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { leaveAction, type LeaveData, type StaffLeave } from "@/lib/academy/leave";
import ProfileAvatar from "@/app/_components/ProfileAvatar";

type JsonResult = Record<string, unknown>;
type RouteChoice = "hr" | "head_admin";
type LeaveKind = "leave" | "exam_break" | "sick_leave";
type PlanSelection = Record<string, string>;

const eligibleRoles = new Set(["teacher", "admin", "qc", "quality_control", "hr", "head", "head_admin", "finance", "sales", "sales_marketing", "social", "social_media", "owner", "super_admin"]);
const staffLabels: Record<string, string> = {
  teacher: "Teacher", admin: "Admin", qc: "QC", quality_control: "QC",
  hr: "HR", head: "Head", head_admin: "Head Admin", finance: "Finance",
  sales: "Sales", sales_marketing: "Sales", social: "Social", social_media: "Social",
  owner: "Owner", super_admin: "Owner",
};

async function readJson(response: Response): Promise<JsonResult> {
  const copy = response.clone();
  try { return await response.json() as JsonResult; }
  catch { const text = await copy.text().catch(() => ""); return text ? { error: text } : {}; }
}
function roleKey(value: string) { return value.toLowerCase().trim().replace(/[\s-]+/g, "_"); }
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
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) }).format(date); }
  catch { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date); }
}
function localPreview(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Choose a valid date and time.";
  const utc = date.toISOString();
  return `Saved exact UTC: ${utc} · staff local: ${formatDate(utc, timezone)}`;
}
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, part => part.toUpperCase()); }

export default function LeavePage() {
  const [data, setData] = useState<LeaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [route, setRoute] = useState<RouteChoice>("hr");
  const [kind, setKind] = useState<LeaveKind>("leave");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [planSelections, setPlanSelections] = useState<PlanSelection>({});

  const load = useCallback(async (): Promise<LeaveData | null> => {
    setRefreshing(true); setError("");
    try {
      const response = await fetch("/api/leave", { credentials: "include", cache: "no-store" });
      const result = await readJson(response);
      if (response.status === 401) { window.location.assign("/login"); return null; }
      if (!response.ok) throw new Error(errorText(result, response.status));
      const payload = result as unknown as LeaveData;
      if (!payload.profile || !Array.isArray(payload.leaves) || !Array.isArray(payload.covers) || !Array.isArray(payload.coverTimeline) || !Array.isArray(payload.directory) || !Array.isArray(payload.students) || typeof payload.serverNow !== "string") {
        throw new Error("The leave service returned an incomplete response.");
      }
      setData(payload);
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Leave records could not be loaded.");
      return null;
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const role = roleKey(data?.profile.role ?? "");
  const isActive = data?.profile.status.trim().toLowerCase() === "active";
  const isHR = role === "hr";
  const isHead = role === "head" || role === "head_admin";
  const isOwner = role === "owner" || role === "super_admin";
  const isHeadOwner = isHead || isOwner;
  const isManager = isHR || isHeadOwner;
  const canRequestOwn = Boolean(isActive && eligibleRoles.has(role));
  const canRequestForOthers = Boolean(isActive && isManager);
  const deviceTimezone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "device local time" : "device local time";
  const serverNow = useMemo(() => {
    const parsed = data?.serverNow ? new Date(data.serverNow) : new Date();
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }, [data?.serverNow]);
  const minLocalDateTime = localInput(serverNow.toISOString());

  const staffById = useMemo(() => new Map((data?.directory ?? []).map(person => [person.id, person])), [data?.directory]);
  const ownName = data?.profile.name ?? "";
  const staffName = (id: string) => id === data?.profile.id ? ownName : staffById.get(id)?.name ?? `Staff ${id}`;
  const staffTimezone = (id: string) => id === data?.profile.id ? data?.profile.timezone ?? "UTC" : staffById.get(id)?.timezone ?? data?.profile.timezone ?? "UTC";
  const targetStaffId = staffId || data?.profile.id || "";
  const targetStaff = targetStaffId === data?.profile.id ? data?.profile : staffById.get(targetStaffId);
  const targetZone = targetStaff?.timezone || data?.profile.timezone || "UTC";
  const targetRole = roleKey(targetStaff?.role ?? "");
  const requestTargets = (data?.directory ?? []).filter(person => eligibleRoles.has(roleKey(person.role)) && person.status.trim().toLowerCase() === "active");
  const visibleLeaves = useMemo(() => {
    if (!data) return [];
    const own = data.leaves.filter(leave => leave.staff_id === data.profile.id);
    const others = isManager ? data.leaves.filter(leave => leave.staff_id !== data.profile.id) : [];
    return [...own, ...others].slice().sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }, [data, isManager]);
  const myCovers = data?.covers.filter(cover => cover.cover_id === data.profile.id) ?? [];
  const awaitingHR = visibleLeaves.filter(leave => leave.state === "submitted" || leave.state === "forwarded").length;
  const activeNow = visibleLeaves.filter(leave => leave.state === "active").length;

  const postAction = async (action: unknown) => {
    const parsed = leaveAction.safeParse(action);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(first ? `${first.path.join(".") || "Action"}: ${first.message}` : "The leave action was not valid.");
    }
    const response = await fetch("/api/leave", {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const result = await readJson(response);
    if (!response.ok || result.ok === false) throw new Error(errorText(result, response.status));
    return result;
  };

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRequestOwn || !data) return;
    const selectedRole = targetRole;
    if (!eligibleRoles.has(selectedRole) || targetStaff?.status.trim().toLowerCase() !== "active") {
      setActionError("Choose an active staff record from the private directory.");
      return;
    }
    if (!reason.trim() || reason.trim().length < 5) { setActionError("Enter a reason of at least 5 characters."); return; }
    const startDate = startsAt ? new Date(startsAt) : null;
    const endDate = endsAt ? new Date(endsAt) : null;
    if (!startDate || !endDate || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate.getTime() <= Date.parse(data.serverNow)) {
      setActionError("Choose valid future start and end dates.");
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) { setActionError("The end date must be after the start date."); return; }
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const actualStaffId = targetStaffId !== data.profile.id ? targetStaffId : undefined;
    if (actualStaffId && !canRequestForOthers) { setActionError("Only HR, Head Admin, or Owner can submit on behalf of another staff member."); return; }
    setBusy("request"); setActionError(""); setNotice("");
    try {
      const before = new Set(data.leaves.map(leave => leave.id));
      const result = await postAction({ action: "request", ...(actualStaffId ? { staffId: actualStaffId } : {}), route, kind, startsAt: startIso, endsAt: endIso, reason: reason.trim() });
      const fresh = await load();
      const newLeave = typeof result.id === "string"
        ? fresh?.leaves.find(leave => leave.id === result.id)
        : fresh?.leaves.find(leave => !before.has(leave.id) && leave.staff_id === targetStaffId && leave.route === route && leave.kind === kind && leave.starts_at === startIso && leave.ends_at === endIso);
      if (!newLeave) throw new Error("The leave request was accepted, but the new record is not visible yet. Refresh before retrying.");
      setStartsAt(""); setEndsAt(""); setReason(""); setStaffId("");
      setNotice(`Request submitted for ${staffName(targetStaffId)}. Current stage: ${titleCase(newLeave.state)}.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The leave request could not be submitted.");
    } finally { setBusy(""); }
  };

  const changeState = async (leave: StaffLeave, action: "forward" | "hr_approve" | "reject" | "cancel" | "finalize", suppliedReason?: string) => {
    if (!data) return;
    const text = suppliedReason?.trim() ?? "";
    if ((action === "hr_approve" || action === "reject" || action === "cancel") && text.length < 5) {
      setActionError("A reason of at least 5 characters is required.");
      return;
    }
    setBusy(`${action}:${leave.id}`); setActionError(""); setNotice("");
    try {
      await postAction({ action, id: leave.id, ...(["hr_approve", "reject", "cancel"].includes(action) ? { reason: text } : {}) });
      const fresh = await load();
      const saved = fresh?.leaves.find(row => row.id === leave.id);
      const expected: StaffLeave["state"][] = action === "forward" ? ["forwarded"]
        : action === "hr_approve" ? ["hr_approved"]
          : action === "reject" ? ["rejected"]
            : action === "cancel" ? ["cancelled"]
              : ["approved"];
      if (!saved || !expected.includes(saved.state)) throw new Error("The leave stage has not changed in the saved record yet. Refresh before treating this action as complete.");
      setNotice(`${staffName(saved.staff_id)} · request is now ${titleCase(saved.state)}.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The leave stage could not be changed.");
    } finally { setBusy(""); }
  };

  const savePlan = async (leave: StaffLeave, studentId: string, coverId: string) => {
    if (!isActive || !isHeadOwner || leave.state !== "hr_approved" || leave.staff_id === data?.profile.id ||
      !peopleForCover(leave).some(person => person.id === coverId) || !coverPlans(leave).some(student => student.id === studentId)) return;
    setBusy(`plan:${leave.id}:${studentId}`); setActionError(""); setNotice("");
    try {
      await postAction({ action: "plan", id: leave.id, studentId, coverId });
      const fresh = await load();
      const cover = fresh?.covers.find(row => row.leave_id === leave.id && row.student_id === studentId && row.cover_id === coverId);
      if (!cover) throw new Error("The plan request was accepted, but the saved cover assignment is not visible yet.");
      setNotice(`Cover assignment saved for ${fresh?.students.find(row => row.id === studentId)?.payload.name ?? "the learner"}.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The cover assignment could not be saved.");
    } finally { setBusy(""); }
  };

  const peopleForCover = (leave: StaffLeave) => {
    const absenceRole = roleKey(staffById.get(leave.staff_id)?.role ?? "");
    const permitted = absenceRole === "teacher"
      ? new Set(["teacher", "qc", "quality_control"])
      : absenceRole === "admin" ? new Set(["admin", "head", "head_admin"]) : new Set<string>();
    return (data?.directory ?? []).filter(person => person.id !== leave.staff_id && person.status.trim().toLowerCase() === "active" && permitted.has(roleKey(person.role)));
  };

  const coverPlans = (leave: StaffLeave) => {
    if (!data || !["teacher", "admin"].includes(roleKey(staffById.get(leave.staff_id)?.role ?? ""))) return [];
    const absentRole = roleKey(staffById.get(leave.staff_id)?.role ?? "");
    return data.students.filter(student =>
      student.payload.status.trim().toLowerCase() === "active" &&
      (absentRole === "teacher" ? student.teacher_id === leave.staff_id : student.admin_id === leave.staff_id)
    );
  };

  const coverGroupKey = (leave: StaffLeave, studentId: string) => {
    const student = data?.students.find(row => row.id === studentId);
    const absentRole = roleKey(staffById.get(leave.staff_id)?.role ?? "");
    return absentRole === "admin" ? `${leave.id}:parent:${student?.parent_id ?? studentId}` : `${leave.id}:student:${studentId}`;
  };
  const selectedCover = (leave: StaffLeave, studentId: string) => {
    const groupKey = coverGroupKey(leave, studentId);
    if (planSelections[groupKey]) return planSelections[groupKey];
    const group = coverPlans(leave).filter(student => coverGroupKey(leave, student.id) === groupKey);
    const eligibleCoverIds = new Set(peopleForCover(leave).map(person => person.id));
    const existing = new Set((data?.covers ?? []).filter(cover => cover.leave_id === leave.id && eligibleCoverIds.has(cover.cover_id) && group.some(student => student.id === cover.student_id)).map(cover => cover.cover_id));
    return existing.size === 1 ? Array.from(existing)[0] : "";
  };

  const showDecision = (leave: StaffLeave) => {
    if (!data || !isActive || !isHR) return false;
    const independent = leave.staff_id !== data.profile.id && leave.submitted_by !== data.profile.id;
    const stage = leave.route === "hr" ? leave.state === "submitted" : leave.state === "forwarded";
    return independent && stage;
  };
  const canForward = (leave: StaffLeave) => Boolean(isActive && isHeadOwner && leave.route === "head_admin" && leave.state === "submitted");
  const canFinalize = (leave: StaffLeave) => Boolean(isActive && isHeadOwner && leave.staff_id !== data?.profile.id && leave.state === "hr_approved");
  const canCancel = (leave: StaffLeave) => Boolean(isActive && (leave.staff_id === data?.profile.id || isManager) && !["completed", "rejected", "cancelled"].includes(leave.state));
  const deviceNow = new Date();
  const deviceMin = localInput(deviceNow.toISOString());

  return (
    <main className="pw-family pw-leave">
      <section className="leave-content">
        {error && <div className="leave-alert" role="alert"><AlertCircle size={16} /><p>{error}</p><button type="button" className="family-button subtle" onClick={() => void load()}>Try again</button></div>}
        {actionError && <div className="leave-alert" role="alert"><AlertCircle size={16} /><p>{actionError}</p></div>}
        {notice && <div className="leave-alert success" role="status"><CheckCircle2 size={16} /><p>{notice}</p></div>}
        {loading && !data ? <div className="leave-grid"><section className="leave-card leave-card-body"><div className="leave-skeleton" /><div className="leave-skeleton" /></section><section className="leave-card leave-card-body"><div className="leave-skeleton" /><div className="leave-skeleton" /></section></div>
          : data && <>
            <div className="leave-heading">
              <h1>Leave requests</h1>
              <div className="leave-heading-actions">
                {canRequestOwn && <button type="button" className="family-button subtle" aria-expanded={requestFormOpen} onClick={() => setRequestFormOpen(open => !open)}><CalendarClock size={14} />{requestFormOpen ? "Close request" : "Request leave"}</button>}
                <button type="button" className="family-button subtle" onClick={() => void load()} disabled={refreshing}><RefreshCw size={14} /> {refreshing ? "Refreshing…" : "Refresh"}</button>
              </div>
            </div>
            {!isActive && <div className="leave-alert info" role="status"><ShieldCheck size={16} /><p>This profile is {data.profile.status}. Existing records are readable; leave requests, decisions, plans, and cancellations are disabled.</p></div>}
            <div className="leave-summary">
              <div className="leave-metric"><small>Your visible requests</small><strong>{visibleLeaves.length}</strong><span>Private to this profile and its management scope</span></div>
              <div className="leave-metric"><small>In review</small><strong>{awaitingHR}</strong><span>Submitted or forwarded</span></div>
              <div className="leave-metric"><small>Active leave</small><strong>{activeNow}</strong><span>State returned by the service</span></div>
              <div className="leave-metric"><small>Cover duties linked to you</small><strong>{myCovers.length}</strong><span>Existing assignments only</span></div>
            </div>

            <div className="leave-grid" data-portal-layout="leave-workspace">
              <div className="leave-stack leave-actions-stack">
                {canRequestOwn ? requestFormOpen && <section className="leave-card" id="leave-request-form" aria-label="New leave request">
                  <form className="leave-card-body" onSubmit={event => void submitRequest(event)}>
                    {canRequestForOthers && <div className="leave-form-field"><label htmlFor="leave-staff">Staff member</label><select id="leave-staff" value={staffId} onChange={event => setStaffId(event.target.value)}><option value="">My own leave · {data.profile.name}</option>{requestTargets.filter(person => person.id !== data.profile.id).map(person => <option value={person.id} key={person.id}>{person.name} · {staffLabels[roleKey(person.role)] ?? titleCase(person.role)} · {titleCase(person.status)}</option>)}</select><small>On-behalf requests are available to HR, Head Admin, and Owner for active staff only.</small></div>}
                    <div className="leave-form-row">
                      <div className="leave-form-field"><label htmlFor="leave-kind">Type</label><select id="leave-kind" value={kind} onChange={event => setKind(event.target.value as LeaveKind)}><option value="leave">Leave</option><option value="exam_break">Exam break</option><option value="sick_leave">Sick leave</option></select></div>
                      <div className="leave-form-field"><label htmlFor="leave-route">Review route</label><select id="leave-route" value={route} onChange={event => setRoute(event.target.value as RouteChoice)}><option value="hr">HR · direct HR review</option><option value="head_admin">Head Admin → independent HR</option></select></div>
                    </div>
                    <div className="leave-section-note"><strong>Device timezone:</strong> {deviceTimezone}. Date-time fields below use this timezone; the selected staff member’s timezone is {targetZone}.</div>
                    <div className="leave-form-field"><label htmlFor="leave-start">Starts · device local time</label><input id="leave-start" type="datetime-local" min={minLocalDateTime || deviceMin} value={startsAt} onChange={event => setStartsAt(event.target.value)} required /><small>{startsAt ? `Staff-local preview: ${localPreview(startsAt, targetZone)}` : "Choose the exact local start."}</small></div>
                    <div className="leave-form-field"><label htmlFor="leave-end">Ends · device local time</label><input id="leave-end" type="datetime-local" min={startsAt || minLocalDateTime || deviceMin} value={endsAt} onChange={event => setEndsAt(event.target.value)} required /><small>{endsAt ? `Staff-local preview: ${localPreview(endsAt, targetZone)}` : "Choose the exact local end."}</small></div>
                    <div className="leave-form-field"><label htmlFor="leave-reason">Reason · private to the leave and management workflow</label><textarea id="leave-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={5} maxLength={2000} required /></div>
                    <div className="leave-actions"><button type="submit" className="family-button primary" disabled={busy === "request"}>{busy === "request" ? <><LoaderCircle size={14} /> Submitting…</> : "Submit leave request"}</button></div>
                  </form>
                </section> : <section className="leave-card" aria-labelledby="request-leave-title">
                  <div className="leave-card-head"><div><h2 id="request-leave-title">Leave request access</h2></div><CalendarClock size={17} color="#6a9d7b" aria-hidden="true" /></div>
                  <div className="leave-card-body"><div className="leave-action-note">Only active staff accounts can submit a leave request. Parents and students do not have access to this workflow.</div></div>
                </section>}

                <div className="leave-support-work">
                <section className="leave-flat-section" aria-labelledby="cover-duty-title">
                  <div className="leave-card-head"><div><h2 id="cover-duty-title">Your linked cover duties</h2><p>Minimal cover assignment details; absent staff reasons and leave kinds are not shown here.</p></div><Users size={17} color="#6a9d7b" aria-hidden="true" /></div>
                  {myCovers.length ? <div className="leave-card-body">{myCovers.map(cover => {
                    const timeline = data.coverTimeline.find(item => item.id === cover.leave_id);
                    const student = data.students.find(item => item.id === cover.student_id);
                    const studentName = student?.payload.name ?? `Learner ${cover.student_id}`;
                    return <article className="leave-item" key={cover.id}><div className="leave-item-head"><div><div className="pw-person-inline"><ProfileAvatar name={studentName} size={30} /><h3>{studentName}</h3></div><div className="leave-item-meta">{titleCase(cover.duty)} cover · {timeline ? `${formatDate(timeline.starts_at, staffTimezone(timeline.staff_id))} – ${formatDate(timeline.ends_at, staffTimezone(timeline.staff_id))} · ${staffTimezone(timeline.staff_id)}` : `Linked leave ${cover.leave_id}`}</div></div>{timeline && <span className={`leave-pill ${timeline.state}`}>{titleCase(timeline.state)}</span>}</div><div className="leave-private-label">Primary portfolio owner remains unchanged · original link {cover.original_id}{cover.applied_at ? ` · applied ${formatDate(cover.applied_at, data.profile.timezone)}` : " · not yet applied"}</div></article>;
                  })}</div> : <div className="leave-empty"><strong>No cover duties linked</strong>Cover work will appear here only when the service returns an assignment.</div>}
                </section>

                {data.coverTimeline.some(item => myCovers.some(cover => cover.leave_id === item.id)) && <section className="leave-flat-section" aria-labelledby="cover-timeline-title">
                  <div className="leave-card-head"><div><h2 id="cover-timeline-title">Sanitized cover timeline</h2><p>Only the minimal dates and state are shown; no reason or leave category is available to covering staff.</p></div><Clock3 size={17} color="#6a9d7b" aria-hidden="true" /></div>
                  <div className="leave-card-body"><div className="leave-timeline">{data.coverTimeline.filter(item => myCovers.some(cover => cover.leave_id === item.id)).map(item => <div className="leave-timeline-row" key={item.id}><div className="pw-person-inline"><ProfileAvatar profileId={item.staff_id} name={staffName(item.staff_id)} size={30} /><strong>{staffName(item.staff_id)}</strong></div><span>{formatDate(item.starts_at, staffTimezone(item.staff_id))} – {formatDate(item.ends_at, staffTimezone(item.staff_id))} · {staffTimezone(item.staff_id)}</span><span className={`leave-pill ${item.state}`}>{titleCase(item.state)}</span></div>)}</div></div>
                </section>}
                </div>
              </div>

              <div className="leave-stack leave-records-stack">
                <section className="leave-card leave-record-ledger" aria-labelledby="leave-records-title">
                  <div className="leave-card-head"><div><h2 id="leave-records-title">Leave records &amp; review</h2></div><ShieldCheck size={17} color="#6a9d7b" aria-hidden="true" /></div>
                  {visibleLeaves.length ? <div className="leave-card-body">{visibleLeaves.map(leave => {
                    const own = leave.staff_id === data.profile.id;
                    const maySeeReason = own || isManager;
                    const staffRole = roleKey(staffById.get(leave.staff_id)?.role ?? "");
                    const affected = coverPlans(leave);
                    const assignedCovers = data.covers.filter(cover => cover.leave_id === leave.id);
                    const eligibleCoverIds = new Set(peopleForCover(leave).map(person => person.id));
                    const validAssignedCovers = assignedCovers.filter(cover => eligibleCoverIds.has(cover.cover_id));
                    const coveredStudentIds = new Set(validAssignedCovers.map(cover => cover.student_id));
                    const needsCoverPlan = ["teacher", "admin"].includes(staffRole);
                    const parentGroups = Array.from(new Set(affected.map(student => student.parent_id)));
                    const sharedAdminCoversConsistent = staffRole !== "admin" || parentGroups.every(parentId => {
                      const siblings = affected.filter(student => student.parent_id === parentId);
                      return new Set(validAssignedCovers.filter(cover => siblings.some(student => student.id === cover.student_id)).map(cover => cover.cover_id)).size <= 1;
                    });
                    const coverageComplete = affected.every(student => coveredStudentIds.has(student.id)) && sharedAdminCoversConsistent;
                    const mayPlan = Boolean(isActive && isHeadOwner && leave.state === "hr_approved" && leave.staff_id !== data.profile.id && needsCoverPlan);
                    const routeSummary = leave.route === "head_admin" ? "Head Admin → HR" : "Direct HR";
                    return <article className="leave-item" key={leave.id}>
                       <div className="leave-item-head"><div><div className="pw-person-inline"><ProfileAvatar profileId={leave.staff_id} name={staffName(leave.staff_id)} size={32} /><h3>{staffName(leave.staff_id)} · {titleCase(leave.kind)}</h3></div><div className="leave-item-meta">{staffLabels[staffRole] ?? titleCase(staffRole || "staff")} · {formatDate(leave.starts_at, staffTimezone(leave.staff_id))} – {formatDate(leave.ends_at, staffTimezone(leave.staff_id))}</div><div className="leave-item-meta">Route: {routeSummary} · Submitted by {staffName(leave.submitted_by)}</div></div><span className={`leave-pill ${leave.state}`}>{titleCase(leave.state)}</span></div>
                      {maySeeReason && <p className="leave-item-reason">{leave.reason}</p>}
                      {leave.synchronization_error && <p className="leave-action-error" role="alert">{leave.synchronization_error}</p>}
                      {leave.decision_reason && (own || isManager) && <p className="leave-private-label">Review note: {leave.decision_reason}</p>}
                      {!maySeeReason && <div className="leave-cover-note">Sensitive reason hidden. Covering staff see dates and assignment state only.</div>}
                      {mayPlan && <div className="leave-cover-plan">
                        <div className="leave-section-note"><strong>Portfolio cover planning.</strong> Every active learner owned by this absent Teacher/Admin needs an eligible cover before finalization. Cover capacity is rechecked by the server when Head Admin or Owner finalizes.</div>
                        {affected.length ? affected.map(student => {
                          const groupKey = coverGroupKey(leave, student.id);
                          const groupStudents = affected.filter(other => coverGroupKey(leave, other.id) === groupKey);
                          const groupCoverIds = new Set(assignedCovers.filter(cover => groupStudents.some(other => other.id === cover.student_id)).map(cover => cover.cover_id));
                          const conflict = groupCoverIds.size > 1;
                          const options = peopleForCover(leave);
                          const chosen = selectedCover(leave, student.id);
                          const existing = assignedCovers.find(cover => cover.student_id === student.id);
                           return <div className="leave-student" key={student.id}>
                             <div className="pw-person-inline"><ProfileAvatar name={student.payload.name} size={30} /><span><strong>{student.payload.name}</strong><small>{staffRole === "admin" ? `Admin portfolio · parent group ${student.parent_id}` : `Teacher portfolio · ${student.payload.timezone}`}{existing ? ` · current cover ${staffName(existing.cover_id)}` : ""}</small></span></div>
                            <select aria-label={`Cover staff for ${student.payload.name}`} value={chosen} onChange={event => setPlanSelections(previous => ({ ...previous, [groupKey]: event.target.value }))} disabled={!isActive}><option value="">Choose active cover</option>{options.map(person => <option value={person.id} key={person.id}>{person.name} · {staffLabels[roleKey(person.role)] ?? titleCase(person.role)}</option>)}</select>
                            <button type="button" className="family-button" onClick={() => void savePlan(leave, student.id, chosen)} disabled={!chosen || !isActive || busy === `plan:${leave.id}:${student.id}`}>{busy === `plan:${leave.id}:${student.id}` ? <LoaderCircle size={13} /> : <Check size={13} />} Save</button>
                            {conflict && <div className="leave-private-label">Existing sibling assignments differ. Choose one shared cover and save the whole parent portfolio consistently.</div>}
                          </div>;
                        }) : <div className="leave-empty"><strong>No active portfolio rows</strong>The service returned no active learners assigned to this absent staff member.</div>}
                        <div className={`leave-progress-row ${coverageComplete ? "done" : ""}`}>{coverageComplete ? <CheckCircle2 size={13} /> : <Clock3 size={13} />} {coverageComplete ? "Every active portfolio learner has a saved cover." : `${coveredStudentIds.size} of ${affected.length} active learner${affected.length === 1 ? "" : "s"} covered.`}</div>
                      </div>}
                      {assignedCovers.length > 0 && <div className="leave-cover-note"><strong>Saved cover links:</strong> {assignedCovers.map(cover => `${data.students.find(student => student.id === cover.student_id)?.payload.name ?? cover.student_id} → ${staffName(cover.cover_id)} (${titleCase(cover.duty)}${cover.applied_at ? ` · applied ${formatDate(cover.applied_at, staffTimezone(cover.cover_id))}` : ""})`).join(" · ")}. Primary ownership remains with the absent staff member.</div>}
                      {canForward(leave) && <div className="leave-actions"><button type="button" className="family-button primary" onClick={() => void changeState(leave, "forward")} disabled={busy === `forward:${leave.id}`}><Forward size={13} /> Forward to HR</button></div>}
                      {showDecision(leave) && <div className="leave-reason-form">
                        <div className="leave-action-note">{leave.route === "head_admin" ? "Independent HR review is required after Head Admin forwards this request." : "Direct HR review for this request."} HR cannot approve their own leave record. A reason is required for either decision.</div>
                        <div className="leave-form-field" style={{ marginTop: 10 }}><label htmlFor={`decision-${leave.id}`}>HR decision reason · at least 5 characters</label><textarea id={`decision-${leave.id}`} minLength={5} maxLength={2000} value={decisionReasons[leave.id] ?? ""} onChange={event => setDecisionReasons(previous => ({ ...previous, [leave.id]: event.target.value }))} /></div>
                        <div className="leave-actions"><button type="button" className="family-button primary" onClick={() => void changeState(leave, "hr_approve", decisionReasons[leave.id] ?? "")} disabled={(decisionReasons[leave.id] ?? "").trim().length < 5 || busy === `hr_approve:${leave.id}`}><Check size={13} /> HR approve</button><button type="button" className="family-button danger" onClick={() => void changeState(leave, "reject", decisionReasons[leave.id] ?? "")} disabled={(decisionReasons[leave.id] ?? "").trim().length < 5 || busy === `reject:${leave.id}`}>Reject</button></div>
                      </div>}
                      {canFinalize(leave) && <div className="leave-reason-form">
                        <div className="leave-capacity-note"><ShieldCheck size={14} /> Finalization is available only to Head Admin/Owner after required portfolio coverage is planned. Native capacity and final checks run on the server; this screen does not assert capacity or salary effects.</div>
                        {needsCoverPlan && !coverageComplete && <div className="leave-action-note">Finalize is locked until every active learner has a saved compatible cover and each Admin parent portfolio uses one consistent covering Admin.</div>}
                        <div className="leave-actions"><button type="button" className="family-button primary" onClick={() => void changeState(leave, "finalize")} disabled={!coverageComplete || busy === `finalize:${leave.id}`}>{busy === `finalize:${leave.id}` ? <><LoaderCircle size={13} /> Finalizing…</> : "Finalize · server capacity check"}</button></div>
                      </div>}
                      {canCancel(leave) && <div className="leave-reason-form">
                        <div className="leave-form-field"><label htmlFor={`cancel-${leave.id}`}>Cancel reason · at least 5 characters</label><textarea id={`cancel-${leave.id}`} minLength={5} maxLength={2000} value={cancelReasons[leave.id] ?? ""} onChange={event => setCancelReasons(previous => ({ ...previous, [leave.id]: event.target.value }))} /></div>
                        <div className="leave-actions"><button type="button" className="family-button danger" onClick={() => void changeState(leave, "cancel", cancelReasons[leave.id] ?? "")} disabled={(cancelReasons[leave.id] ?? "").trim().length < 5 || busy === `cancel:${leave.id}`}>Cancel request</button></div>
                      </div>}
                      {leave.state === "hr_approved" && !isHeadOwner && <div className="leave-action-note">HR has approved this request; Head Admin or Owner finalizes it after portfolio and capacity checks.</div>}
                    </article>;
                  })}</div> : <div className="leave-empty"><strong>No leave records yet</strong>Only requests returned by the authenticated leave service appear here.</div>}
                </section>
              </div>
            </div>
          </>}
      </section>
    </main>
  );
}
