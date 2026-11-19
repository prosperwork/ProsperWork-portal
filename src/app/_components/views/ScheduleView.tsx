"use client";

import { useState, useMemo, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpDown,
  BookOpen,
  Calendar,
  CalendarCheck2,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Globe,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Music2,
  ShieldAlert,
  UserCheck,
  Video,
  XCircle,
} from "lucide-react";
import { useConfirmModal } from "../ConfirmModal";
import { PortalModal } from "../PortalModal";
import {
  Empty,
  fullDate,
  niceDate,
  Pill,
  SectionTitle,
  statuses,
  timeAt,
  todayKey,
} from "../../_lib/portal-formatters";
import type { FormKind } from "../modals/ActionModal";
import type {
  AcademyData,
  AppView,
  Lesson,
  LessonStatus,
  Role,
  Student,
} from "@/lib/types";

export type QCAssignmentSnapshot = {
  profile?: { id: string };
  lessons?: {
    id: string;
    student_id: string;
    teacher_id: string | null;
    payload: Record<string, unknown>;
  }[];
  students?: { id: string; payload: Record<string, unknown> }[];
};

export default function ScheduleView({
  data,
  role,
  profile,
  visibleLessons,
  filteredLessons,
  studentsVisible,
  ownTimezone,
  adminAccess,
  parentAccess,
  teacherAccess,
  qcOwnLessonIds,
  qcAssignmentSnapshot,
  qcAssignmentLoading,
  qcAssignmentError,
  scheduleMode,
  setScheduleMode,
  selectedDate,
  setSelectedDate,
  filter,
  setFilter,
  headerActions,
  setLessonStatus,
  openEmergencyCover,
  changeView,
}: {
  data: AcademyData;
  role: Role;
  profile: { id: string; role: Role } | null;
  visibleLessons: Lesson[];
  filteredLessons: Lesson[];
  studentsVisible: Student[];
  ownTimezone: string;
  adminAccess: boolean;
  parentAccess: boolean;
  teacherAccess: boolean;
  qcOwnLessonIds: Set<string>;
  qcAssignmentSnapshot: QCAssignmentSnapshot | null;
  qcAssignmentLoading: boolean;
  qcAssignmentError: string;
  scheduleMode: "today" | "week";
  setScheduleMode: (mode: "today" | "week") => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  filter: string;
  setFilter: (filter: string) => void;
  headerActions: (label: string, kind: FormKind) => ReactNode;
  setLessonStatus: (
    lesson: Lesson,
    status: LessonStatus,
    verify?: boolean
  ) => void;
  openEmergencyCover: (lesson: Lesson) => void;
  changeView: (view: AppView) => void;
}) {
  const { confirm, ConfirmDialog } = useConfirmModal();
  const [actionLesson, setActionLesson] = useState<Lesson | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduleStream, setScheduleStream] = useState<"academic" | "trials">("academic");
  const [trialScope, setTrialScope] = useState<"upcoming" | "date" | "unscheduled" | "all">("upcoming");
  const [trialSortOrder, setTrialSortOrder] = useState<"earliest" | "latest">("earliest");

  const cancelForReplacement = (id: string) => {
    const lesson = data.lessons.find(
      (item) => item.id === id && item.status === "scheduled"
    );
    if (!lesson) return;
    confirm({
      title: "Cancel scheduled class?",
      message:
        "Cancel this scheduled class? Its history stays recorded. You can schedule a replacement with the updated length or time afterward.",
      tone: "danger",
      confirmLabel: "Cancel scheduled class",
      onConfirm: () => {
        setLessonStatus(lesson, "cancelled");
      },
    });
  };

  const dayKeyInOwnTz = (value: string | Date) => {
    const parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(parsed.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: ownTimezone || "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(parsed);
    } catch {
      return parsed.toISOString().slice(0, 10);
    }
  };

  const todayInOwnTz = dayKeyInOwnTz(new Date()) || todayKey();
  const base = new Date(`${todayInOwnTz}T12:00:00Z`);
  const weekStart = new Date(base);
  weekStart.setUTCDate(
    base.getUTCDate() - ((base.getUTCDay() + 6) % 7) + weekOffset * 7
  );
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setUTCDate(weekStart.getUTCDate() + index);
    return {
      key: day.toISOString().slice(0, 10),
      weekday: new Intl.DateTimeFormat("en", {
        weekday: "short",
        timeZone: "UTC",
      }).format(day),
      dayNumber: day.getUTCDate(),
      monthShort: new Intl.DateTimeFormat("en", {
        month: "short",
        timeZone: "UTC",
      }).format(day),
    };
  });

  const shiftWeek = (delta: number) => {
    const nextOffset = weekOffset + delta;
    setWeekOffset(nextOffset);
    const nextStart = new Date(base);
    nextStart.setUTCDate(
      base.getUTCDate() - ((base.getUTCDay() + 6) % 7) + nextOffset * 7
    );
    setSelectedDate(nextStart.toISOString().slice(0, 10));
  };

  const jumpToThisWeek = () => {
    setWeekOffset(0);
    setSelectedDate(todayInOwnTz);
  };

  const weekRangeLabel = `${weekDays[0].monthShort} ${weekDays[0].dayNumber} – ${weekDays[6].monthShort} ${weekDays[6].dayNumber}`;
  const thisDateLessons = filteredLessons;
  const ownQCClasses =
    role === "qc"
      ? (qcAssignmentSnapshot?.lessons || [])
          .filter((lesson) => lesson.teacher_id === profile?.id)
          .map((assigned) => {
            const lesson = data.lessons.find((item) => item.id === assigned.id);
            return lesson ? { assigned, lesson } : null;
          })
          .filter(
            (
              item
            ): item is {
              assigned: NonNullable<QCAssignmentSnapshot["lessons"]>[number];
              lesson: Lesson;
            } => item !== null
          )
          .sort((a, b) => a.lesson.startsAt.localeCompare(b.lesson.startsAt))
      : [];

  const formatRelativeTrialTime = (isoString: string): string => {
    if (!isoString) return "Date TBD";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "Date TBD";
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours >= -2 && diffHours <= 2) return "Happening Today";
    if (diffHours > 2 && diffHours < 24 && date.toDateString() === now.toDateString()) return "Today";
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
    if (diffDays > 7) return `In ${Math.round(diffDays / 7)} weeks`;
    if (diffDays < 0) return "Past Assessment";
    return "Upcoming";
  };

  const allBookedTrials = useMemo(() => {
    return (data.leads || []).filter(
      (l) => l.status === "trial_booked" || Boolean(l.trialScheduledAt)
    );
  }, [data.leads]);

  // Upcoming trials: within 2h grace period or future, sorted cleanly
  const upcomingTrials = useMemo(() => {
    const threshold = Date.now() - 2 * 3600 * 1000;
    const list = allBookedTrials.filter((t) => {
      if (!t.trialScheduledAt) return false;
      const time = new Date(t.trialScheduledAt).getTime();
      return !isNaN(time) && time >= threshold;
    });
    return list.sort((a, b) => {
      const aTime = new Date(a.trialScheduledAt || 0).getTime();
      const bTime = new Date(b.trialScheduledAt || 0).getTime();
      return trialSortOrder === "earliest" ? aTime - bTime : bTime - aTime;
    });
  }, [allBookedTrials, trialSortOrder]);

  const pastTrials = useMemo(() => {
    const threshold = Date.now() - 2 * 3600 * 1000;
    const list = allBookedTrials.filter((t) => {
      if (!t.trialScheduledAt) return false;
      const time = new Date(t.trialScheduledAt).getTime();
      return !isNaN(time) && time < threshold;
    });
    return list.sort((a, b) => {
      const aTime = new Date(a.trialScheduledAt || 0).getTime();
      const bTime = new Date(b.trialScheduledAt || 0).getTime();
      return bTime - aTime;
    });
  }, [allBookedTrials]);

  const unscheduledTrials = useMemo(() => {
    return allBookedTrials.filter((t) => !t.trialScheduledAt);
  }, [allBookedTrials]);

  const trialsForSelectedDate = useMemo(() => {
    return allBookedTrials.filter((t) => {
      if (!t.trialScheduledAt) return false;
      return dayKeyInOwnTz(t.trialScheduledAt) === selectedDate;
    }).sort((a, b) => {
      const aTime = new Date(a.trialScheduledAt || 0).getTime();
      const bTime = new Date(b.trialScheduledAt || 0).getTime();
      return aTime - bTime;
    });
  }, [allBookedTrials, selectedDate]);

  // Spotlight: single nearest upcoming trial
  const nextUpcomingTrial = useMemo(() => {
    if (upcomingTrials.length === 0) return null;
    const sorted = [...upcomingTrials].sort((a, b) => {
      const aTime = new Date(a.trialScheduledAt || 0).getTime();
      const bTime = new Date(b.trialScheduledAt || 0).getTime();
      return aTime - bTime;
    });
    return sorted[0] || null;
  }, [upcomingTrials]);

  const isNextGoogleMeet = nextUpcomingTrial?.trialClassroomProvider === "google_meet";
  const nextUpcomingMeetUrl = nextUpcomingTrial
    ? nextUpcomingTrial.trialMeetUrl ||
      (isNextGoogleMeet
        ? ""
        : `${typeof window !== "undefined" ? window.location.origin : ""}/classroom?room=trial_${nextUpcomingTrial.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
    : "";
  const nextUpcomingPhone = nextUpcomingTrial?.phone?.replace(/[^0-9+]/g, "");

  const displayedTrials = useMemo(() => {
    if (trialScope === "upcoming") return upcomingTrials;
    if (trialScope === "date") return trialsForSelectedDate;
    if (trialScope === "unscheduled") return unscheduledTrials;
    return [...upcomingTrials, ...pastTrials, ...unscheduledTrials];
  }, [trialScope, upcomingTrials, trialsForSelectedDate, unscheduledTrials, pastTrials]);

  return (
    <>
      {/* Stream Tabs: Separate Enrolled Academic Classes from Prospective Trial Assessments */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className={`btn small ${scheduleStream === "academic" ? "" : "ghost"}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 700,
            fontSize: "0.80rem",
            padding: "5px 12px",
            borderRadius: "6px",
          }}
          onClick={() => setScheduleStream("academic")}
        >
          <BookOpen size={13} />
          Academic Classes ({visibleLessons.length})
        </button>
        <button
          type="button"
          className={`btn small ${scheduleStream === "trials" ? "" : "ghost"}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 700,
            fontSize: "0.80rem",
            padding: "5px 12px",
            borderRadius: "6px",
            borderColor: scheduleStream === "trials" ? "#059669" : "#bbf7d0",
            background: scheduleStream === "trials" ? "#059669" : "#f0fdf4",
            color: scheduleStream === "trials" ? "#ffffff" : "#166534",
          }}
          onClick={() => setScheduleStream("trials")}
        >
          <CalendarCheck2 size={13} />
          Trial Assessments ({upcomingTrials.length} upcoming)
        </button>
      </div>

      {scheduleStream === "trials" ? (
        <section className="card section-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <SectionTitle
              title="Booked Trial Assessments"
              detail="Free 1-on-1 trial lessons booked with prospective candidates. Kept strictly separate from regular enrolled academic classes."
            />
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`btn small ${trialScope === "upcoming" ? "primary" : "ghost"}`}
                style={{ fontSize: "0.75rem", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => setTrialScope("upcoming")}
              >
                <CalendarCheck2 size={12} />
                Upcoming ({upcomingTrials.length})
              </button>
              <button
                type="button"
                className={`btn small ${trialScope === "date" ? "primary" : "ghost"}`}
                style={{ fontSize: "0.75rem", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => setTrialScope("date")}
              >
                <Calendar size={12} />
                Selected Date ({trialsForSelectedDate.length})
              </button>
              {unscheduledTrials.length > 0 && (
                <button
                  type="button"
                  className={`btn small ${trialScope === "unscheduled" ? "primary" : "ghost"}`}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 10px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    borderColor: trialScope === "unscheduled" ? undefined : "#fcd34d",
                    color: trialScope === "unscheduled" ? undefined : "#b45309",
                    background: trialScope === "unscheduled" ? undefined : "#fffbeb",
                  }}
                  onClick={() => setTrialScope("unscheduled")}
                >
                  <Clock3 size={12} />
                  Needs Date ({unscheduledTrials.length})
                </button>
              )}
              <button
                type="button"
                className={`btn small ${trialScope === "all" ? "primary" : "ghost"}`}
                style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                onClick={() => setTrialScope("all")}
              >
                All Booked ({allBookedTrials.length})
              </button>

              {(trialScope === "upcoming" || trialScope === "all") && upcomingTrials.length > 1 && (
                <button
                  type="button"
                  className="btn small ghost"
                  style={{
                    fontSize: "0.74rem",
                    padding: "4px 9px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: "#475569",
                  }}
                  onClick={() => setTrialSortOrder((prev) => (prev === "earliest" ? "latest" : "earliest"))}
                  title={
                    trialSortOrder === "earliest"
                      ? "Currently showing nearest upcoming first. Click to show latest date first."
                      : "Currently showing latest date first. Click to show nearest upcoming first."
                  }
                >
                  <ArrowUpDown size={12} />
                  <span>{trialSortOrder === "earliest" ? "Next Upcoming First" : "Latest Date First"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Spotlight Banner for Nearest Upcoming Assessment */}
          {nextUpcomingTrial && (trialScope === "upcoming" || trialScope === "all") && (
            <div
              style={{
                background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
                border: "1px solid #a7f3d0",
                borderRadius: "10px",
                padding: "0.9rem 1.15rem",
                marginBottom: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.85rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "#059669",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <CalendarCheck2 size={20} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        textTransform: "uppercase",
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        color: "#065f46",
                      }}
                    >
                      Next Upcoming Assessment
                    </span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        background: "#d1fae5",
                        color: "#065f46",
                        padding: "1px 7px",
                        borderRadius: "10px",
                        fontWeight: 700,
                      }}
                    >
                      {formatRelativeTrialTime(nextUpcomingTrial.trialScheduledAt || "")}
                    </span>
                  </div>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: "#064e3b", marginTop: 2 }}>
                    {nextUpcomingTrial.childName || nextUpcomingTrial.parentName}
                    <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "#047857", marginLeft: 6 }}>
                      · {nextUpcomingTrial.instrument || "Piano"} with {nextUpcomingTrial.trialTeacher || nextUpcomingTrial.teacherName || "Assigned Teacher"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.76rem",
                      color: "#047857",
                      marginTop: 2,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Calendar size={12} /> {niceDate(nextUpcomingTrial.trialScheduledAt || "")}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Clock3 size={12} /> {timeAt(nextUpcomingTrial.trialScheduledAt || "", ownTimezone)} ({ownTimezone?.split("/").pop()?.replace(/_/g, " ")})
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
                {nextUpcomingMeetUrl && (
                  <a
                    href={nextUpcomingMeetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn small"
                    style={{
                      background: isNextGoogleMeet ? "#1a73e8" : "#4338ca",
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 11px",
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    <Video size={13} />
                    {isNextGoogleMeet ? "Open Google Meet" : "Enter Live Studio"}
                  </a>
                )}
                {nextUpcomingPhone && (
                  <a
                    href={`https://wa.me/${nextUpcomingPhone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn small"
                    style={{
                      background: "#15803d",
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 11px",
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    <MessageSquare size={13} />
                    WhatsApp Parent
                  </a>
                )}
              </div>
            </div>
          )}

          {displayedTrials.length === 0 ? (
            <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#64748b" }}>
              <CalendarCheck2 size={36} color="#94a3b8" style={{ margin: "0 auto 10px" }} />
              <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.95rem" }}>
                {trialScope === "date"
                  ? `No trial assessments booked for ${fullDate(selectedDate)}`
                  : trialScope === "unscheduled"
                  ? "No unscheduled trials pending"
                  : "No upcoming trial assessments booked yet"}
              </div>
              <p style={{ fontSize: "0.82rem", maxWidth: "420px", margin: "6px auto 14px", color: "#64748b" }}>
                When staff move a prospective candidate to Trial Booked in Admissions, their trial assessment date, teacher, and video classroom will appear here.
              </p>
              <button
                type="button"
                className="btn small primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => changeView("leads")}
              >
                Go to Admissions & Leads →
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="schedule-table" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ width: "170px" }}>Assessment Time</th>
                    <th>Candidate & Focus</th>
                    <th>Assigned Teacher</th>
                    <th>Classroom / Meeting Room</th>
                    <th>Parent Contact</th>
                    <th style={{ textAlign: "right", width: "130px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTrials.map((trial) => {
                    const startsAt = trial.trialScheduledAt || "";
                    const candidateName = trial.childName || trial.parentName || "Candidate";
                    const isGoogleMeet = trial.trialClassroomProvider === "google_meet";
                    const meetUrl =
                      trial.trialMeetUrl ||
                      (isGoogleMeet
                        ? ""
                        : `${typeof window !== "undefined" ? window.location.origin : ""}/classroom?room=trial_${trial.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
                    const parentPhone = trial.phone?.replace(/[^0-9+]/g, "");
                    const isUpcoming = startsAt && new Date(startsAt).getTime() >= Date.now() - 2 * 3600 * 1000;
                    const isPast = startsAt && new Date(startsAt).getTime() < Date.now() - 2 * 3600 * 1000;

                    return (
                      <tr key={trial.id}>
                        <td>
                          {startsAt ? (
                            <>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                                <strong style={{ color: "#0f766e" }}>
                                  {timeAt(startsAt, ownTimezone)}
                                </strong>
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "1px 6px",
                                    borderRadius: "8px",
                                    background: isUpcoming ? "#d1fae5" : isPast ? "#f1f5f9" : "#fef3c7",
                                    color: isUpcoming ? "#065f46" : isPast ? "#64748b" : "#92400e",
                                  }}
                                >
                                  {formatRelativeTrialTime(startsAt)}
                                </span>
                              </div>
                              <div className="table-small">
                                {niceDate(startsAt)} ({ownTimezone?.split("/").pop()?.replace(/_/g, " ")})
                              </div>
                              {trial.trialTimezone && trial.trialTimezone !== ownTimezone && (
                                <div
                                  className="table-small"
                                  style={{
                                    color: "#64748b",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                    marginTop: 2,
                                  }}
                                >
                                  <Globe size={10} />
                                  {timeAt(startsAt, trial.trialTimezone)} (
                                  {trial.trialTimezone?.split("/").pop()?.replace(/_/g, " ")})
                                </div>
                              )}
                            </>
                          ) : (
                            <div>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "2px 7px",
                                  borderRadius: "6px",
                                  background: "#fef3c7",
                                  color: "#92400e",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                }}
                              >
                                <Clock3 size={11} />
                                Date Not Set
                              </span>
                              <div className="table-small" style={{ color: "#94a3b8", marginTop: 2 }}>
                                Needs schedule
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          <strong style={{ color: "#1e293b" }}>{candidateName}</strong>
                          {trial.childName && trial.parentName && trial.childName !== trial.parentName && (
                            <div className="table-small" style={{ color: "#64748b" }}>
                              Parent: {trial.parentName}
                            </div>
                          )}
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                            <Pill tone="blue">
                              <Music2 size={11} style={{ marginRight: 3 }} />
                              {trial.instrument || "Piano"}
                            </Pill>
                            <Pill tone="green">Trial Assessment</Pill>
                          </div>
                        </td>
                        <td>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#334155",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <UserCheck size={13} color="#0f766e" />
                            {trial.trialTeacher || trial.teacherName || "Unassigned"}
                          </div>
                        </td>
                        <td>
                          {meetUrl ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                              <a
                                href={meetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn small"
                                style={{
                                  fontSize: "0.74rem",
                                  padding: "3px 8px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  background: isGoogleMeet ? "#1a73e8" : "#4338ca",
                                  color: "#ffffff",
                                  textDecoration: "none",
                                }}
                              >
                                <Video size={12} />
                                {isGoogleMeet ? "Open Google Meet →" : "Enter In-App Studio →"}
                              </a>
                              <span className="table-small" style={{ color: "#64748b" }}>
                                {isGoogleMeet ? "Google Meet Room" : "ProsperWork Live Studio"}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>No link generated</span>
                          )}
                        </td>
                        <td>
                          {parentPhone ? (
                            <a
                              href={`https://wa.me/${parentPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: "0.76rem",
                                color: "#15803d",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                textDecoration: "none",
                              }}
                              title="Chat with parent on WhatsApp"
                            >
                              <MessageSquare size={12} />
                              {trial.phone}
                            </a>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>No phone</span>
                          )}
                          {trial.email && (
                            <div className="table-small" style={{ color: "#64748b" }}>
                              {trial.email}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {!startsAt ? (
                            <button
                              type="button"
                              className="btn small"
                              style={{
                                fontSize: "0.74rem",
                                padding: "3px 9px",
                                background: "#059669",
                                color: "#ffffff",
                                borderColor: "#059669",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                fontWeight: 700,
                              }}
                              onClick={() => changeView("leads")}
                              title="Set assessment date and teacher in Admissions"
                            >
                              <CalendarCheck2 size={12} />
                              Book Date →
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn small ghost"
                              style={{ fontSize: "0.74rem", padding: "2px 8px" }}
                              onClick={() => changeView("leads")}
                              title="Manage candidate in Admissions"
                            >
                              View Lead →
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <>
          {upcomingTrials.length > 0 && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.80rem",
                color: "#166534",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CalendarCheck2 size={14} color="#15803d" />
                <span>
                  <strong>{upcomingTrials.length}</strong> upcoming trial assessment{upcomingTrials.length === 1 ? "" : "s"} scheduled
                  {nextUpcomingTrial && (
                    <> (Next: <strong>{nextUpcomingTrial.childName || nextUpcomingTrial.parentName}</strong> on {niceDate(nextUpcomingTrial.trialScheduledAt || "")})</>
                  )}
                  . Kept separate from enrolled academic student timetables.
                </span>
              </div>
              <button
                type="button"
                className="btn small"
                style={{
                  fontSize: "0.72rem",
                  padding: "2px 8px",
                  background: "#059669",
                  color: "#ffffff",
                  borderColor: "#059669",
                }}
                onClick={() => setScheduleStream("trials")}
              >
                View Upcoming Trials →
              </button>
            </div>
          )}

          <div className="toolbar">
        <div className="segmented">
          <button
            type="button"
            className={scheduleMode === "today" ? "active" : ""}
            onClick={() => {
              setScheduleMode("today");
              setSelectedDate(todayInOwnTz);
              setWeekOffset(0);
            }}
          >
            Today
          </button>
          <button
            type="button"
            className={scheduleMode === "week" ? "active" : ""}
            onClick={() => setScheduleMode("week")}
          >
            Monday–Sunday
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <select
          className="select-mini"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter by lesson status"
        >
          <option value="all">All lesson statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replace("_", " ")}
            </option>
          ))}
        </select>
        {adminAccess && headerActions("Schedule class", "lesson")}
      </div>
      {role === "qc" && (
        <section className="card section-card" style={{ marginBottom: 15 }}>
          <SectionTitle
            title="My assigned teaching"
            detail="Tutor access is matched against your active staff ID. Supervised classes stay read-only here."
          />
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <button
              className="btn secondary small"
              onClick={() => changeView("families")}
            >
              My Students · {studentsVisible.length}
            </button>
            <span className="table-small">
              {qcAssignmentLoading
                ? "Checking assigned lessons…"
                : `${ownQCClasses.length} assigned lessons in this authorized teaching scope`}
            </span>
          </div>
          {qcAssignmentError ? (
            <div className="form-error" role="alert">
              {qcAssignmentError}{" "}
              <button
                className="btn ghost small"
                type="button"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          ) : qcAssignmentLoading ? (
            <div className="skeleton" style={{ height: 75 }} />
          ) : ownQCClasses.length ? (
            ownQCClasses.map(({ lesson }) => (
              <div className="lesson-row" key={lesson.id}>
                <div className="lesson-time">
                  {niceDate(lesson.startsAt)}
                  <small> {timeAt(lesson.startsAt, ownTimezone)}</small>
                </div>
                <div>
                  <div className="lesson-person">
                    {lesson.studentName}
                    <span className="lesson-meta"> · {lesson.title}</span>
                  </div>
                  <div className="lesson-meta">
                    {lesson.instrument} · {lesson.status.replace("_", " ")}
                  </div>
                </div>
                <div className="row-actions" style={{ gap: 6 }}>
                  <a
                    className="icon-btn"
                    style={{
                      background: "#e8f3ec",
                      color: "#1c7a5d",
                      borderColor: "#c9e2d2",
                    }}
                    href={`/classroom?lessonId=${encodeURIComponent(
                      lesson.id
                    )}`}
                    title="Enter virtual classroom"
                    aria-label="Enter virtual classroom"
                  >
                    <Video size={14} />
                  </a>
                  <a
                    className="icon-btn"
                    href={`/learning?lessonId=${encodeURIComponent(lesson.id)}`}
                    title="Open lesson board"
                    aria-label="Open lesson board"
                  >
                    <BookOpen size={14} />
                  </a>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setActionLesson(lesson)}
                    title="More actions & lesson management"
                    aria-label="More actions"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty
              title="No lessons assigned to your QC tutor ID"
              detail="Only actual lesson assignments appear here. Supervised quality work remains available from Management."
            />
          )}
        </section>
      )}
      {scheduleMode === "week" && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => shiftWeek(-1)}
                aria-label="Previous week"
              >
                <ChevronLeft size={14} /> Previous week
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => shiftWeek(1)}
                aria-label="Next week"
              >
                Next week <ChevronRight size={14} />
              </button>
              {weekOffset !== 0 && (
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={jumpToThisWeek}
                >
                  This week
                </button>
              )}
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--pine-900)",
              }}
            >
              {weekRangeLabel}
            </span>
          </div>
          <div className="week-strip" style={{ marginBottom: 0 }}>
            {weekDays.map((day) => {
              const count = visibleLessons.filter(
                (lesson) => dayKeyInOwnTz(lesson.startsAt) === day.key
              ).length;
              return (
                <button
                  type="button"
                  key={day.key}
                  onClick={() => setSelectedDate(day.key)}
                  className={`day-tile ${
                    selectedDate === day.key ? "active" : ""
                  }`}
                >
                  <span className="day-name">{day.weekday}</span>
                  <span className="day-date">{day.dayNumber}</span>
                  <span className="day-count">
                    {count} {count === 1 ? "class" : "classes"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <section className="card section-card">
        <SectionTitle
          title={`${
            scheduleMode === "today"
              ? "Daily teaching board"
              : "Classes for " + fullDate(selectedDate)
          }`}
          detail={
            parentAccess
              ? `Your local time · ${ownTimezone}`
              : `Your timezone: ${ownTimezone} · student timezone shown separately.`
          }
        />
        <div className="table-wrap">
          <table className="schedule-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>Your time</th>
                {!parentAccess && <th>Student local</th>}
                <th>Student & focus</th>
                <th>Teacher & Admin</th>
                <th>Type</th>
                <th>Status & verification</th>
                <th style={{ textAlign: "right", minWidth: 110 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {thisDateLessons.map((lesson) => (
                <tr key={lesson.id}>
                  <td>
                    <strong>{timeAt(lesson.startsAt, ownTimezone)}</strong>
                    <div className="table-small">{ownTimezone}</div>
                  </td>
                  {!parentAccess && (
                    <td>
                      {timeAt(lesson.startsAt, lesson.studentTimezone)}
                      <div className="table-small">
                        {lesson.studentTimezone
                          .split("/")
                          .pop()
                          ?.replace("_", " ")}
                      </div>
                    </td>
                  )}
                  <td>
                    <strong>{lesson.studentName}</strong>
                    <div className="table-small">
                      {lesson.title} · {lesson.instrument}
                    </div>
                  </td>
                  <td>
                    {lesson.teacherName}
                    <div className="table-small">Admin: {lesson.adminName}</div>
                  </td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <Pill tone="blue">{lesson.kind}</Pill>
                      {lesson.classroomProvider === "google_meet" ? (
                        <Pill tone="purple">Google Meet</Pill>
                      ) : (
                        <Pill tone="green">In-App Studio</Pill>
                      )}
                    </div>
                  </td>

                  <td>
                    <Pill>{lesson.status.replace("_", " ")}</Pill>
                    {lesson.verification && (
                      <div className="table-small">
                        Verified {lesson.verification.admin} ·{" "}
                        {niceDate(lesson.verification.at)}
                      </div>
                    )}
                    {lesson.requestedSlots?.length ? (
                      <div className="table-small">
                        Request: {lesson.requestedSlots.join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div
                      className="row-actions"
                      style={{ justifyContent: "flex-end", gap: 6 }}
                    >
                      {lesson.classroomProvider === "google_meet" &&
                      lesson.meetUrl ? (
                        <a
                          className="icon-btn"
                          style={{
                            background: "#e8f0fe",
                            color: "#1a73e8",
                            borderColor: "#d2e3fc",
                          }}
                          href={lesson.meetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Join Google Meet Classroom (opens in new tab)"
                          aria-label="Join Google Meet Classroom"
                        >
                          <Video size={14} />
                        </a>
                      ) : (
                        <a
                          className="icon-btn"
                          style={{
                            background: "#e8f3ec",
                            color: "#1c7a5d",
                            borderColor: "#c9e2d2",
                          }}
                          href={`/classroom?lessonId=${encodeURIComponent(
                            lesson.id
                          )}`}
                          title="Enter In-App Virtual Studio"
                          aria-label="Enter In-App Virtual Studio"
                        >
                          <Video size={14} />
                        </a>
                      )}
                      <a
                        className="icon-btn"
                        href={`/learning?lessonId=${encodeURIComponent(
                          lesson.id
                        )}`}
                        title="Open lesson board (homework & materials)"
                        aria-label="Open lesson board"
                      >
                        <BookOpen size={14} />
                      </a>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setActionLesson(lesson)}
                        title="More actions & lesson management"
                        aria-label="More actions"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!thisDateLessons.length && (
            <Empty
              title="No classes on this date"
              detail="Choose another day or add a class to the schedule."
            />
          )}
        </div>
        <div className="notice" style={{ marginTop: 13 }}>
          Status changes append an audit entry. Completed classes retain
          teacher, admin and verification time; records are never deleted from
          this workspace.
        </div>
      </section>
    </>
  )}
      <PortalModal
        open={Boolean(actionLesson)}
        onClose={() => setActionLesson(null)}
        eyebrow="Class Management"
        title="Lesson actions"
        subtitle={
          actionLesson
            ? `${actionLesson.studentName} · ${niceDate(
                actionLesson.startsAt
              )} at ${timeAt(actionLesson.startsAt, ownTimezone)}`
            : undefined
        }
        size="sm"
        footer={
          <button
            type="button"
            className="btn ghost"
            onClick={() => setActionLesson(null)}
          >
            Close
          </button>
        }
      >
        {actionLesson && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "#f7faf8",
                border: "1px solid #e1e9e3",
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "var(--pine-950)" }}>
                  {actionLesson.title} · {actionLesson.instrument}
                </div>
                <div
                  style={{
                    color: "var(--muted)",
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  Teacher: {actionLesson.teacherName} · Admin:{" "}
                  {actionLesson.adminName}
                </div>
              </div>
              <Pill>{actionLesson.status.replace("_", " ")}</Pill>
            </div>

            {actionLesson.verification && (
              <div
                style={{
                  fontSize: 11,
                  padding: "7px 11px",
                  background: "#edf6f1",
                  border: "1px solid #cfe2d6",
                  borderRadius: 8,
                  color: "#1c7a5d",
                }}
              >
                Verified by {actionLesson.verification.admin} on{" "}
                {niceDate(actionLesson.verification.at)}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {actionLesson.classroomProvider === "google_meet" &&
              actionLesson.meetUrl ? (
                <a
                  className="btn secondary"
                  style={{
                    justifyContent: "space-between",
                    padding: "11px 14px",
                    fontSize: 12,
                  }}
                  href={actionLesson.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Video size={16} />
                    Join Google Meet classroom
                  </span>
                  <ExternalLink size={14} style={{ opacity: 0.6 }} />
                </a>
              ) : (
                <a
                  className="btn secondary"
                  style={{
                    justifyContent: "space-between",
                    padding: "11px 14px",
                    fontSize: 12,
                  }}
                  href={`/classroom?lessonId=${encodeURIComponent(
                    actionLesson.id
                  )}`}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Video size={16} />
                    Enter virtual classroom
                  </span>
                  <ExternalLink size={14} style={{ opacity: 0.6 }} />
                </a>
              )}

              <a
                className="btn ghost"
                style={{
                  justifyContent: "space-between",
                  padding: "11px 14px",
                  fontSize: 12,
                }}
                href={`/learning?lessonId=${encodeURIComponent(
                  actionLesson.id
                )}`}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <BookOpen size={16} />
                  Open lesson board & homework
                </span>
                <ExternalLink size={14} style={{ opacity: 0.6 }} />
              </a>

              {(teacherAccess ||
                (role === "qc" && qcOwnLessonIds.has(actionLesson.id)) ||
                adminAccess) &&
                actionLesson.status === "scheduled" && (
                  <button
                    type="button"
                    className="btn"
                    style={{
                      justifyContent: "flex-start",
                      padding: "11px 14px",
                      fontSize: 12,
                    }}
                    onClick={() => {
                      const target = actionLesson;
                      setActionLesson(null);
                      setLessonStatus(target, "teacher_done");
                    }}
                  >
                    <CheckCircle2 size={16} />
                    Mark as Teacher done
                  </button>
                )}

              {adminAccess && actionLesson.status === "teacher_done" && (
                <button
                  type="button"
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    padding: "11px 14px",
                    fontSize: 12,
                    background: "#135b45",
                  }}
                  onClick={() => {
                    const target = actionLesson;
                    setActionLesson(null);
                    setLessonStatus(target, "completed", true);
                  }}
                >
                  <CheckCheck size={16} />
                  Verify attendance & payroll
                </button>
              )}

              {adminAccess && actionLesson.status === "scheduled" && (
                <button
                  type="button"
                  className="btn ghost danger"
                  style={{
                    justifyContent: "flex-start",
                    padding: "11px 14px",
                    fontSize: 12,
                  }}
                  onClick={() => {
                    const target = actionLesson;
                    setActionLesson(null);
                    setLessonStatus(target, "missed");
                  }}
                >
                  <AlertCircle size={16} />
                  Mark class as Missed
                </button>
              )}

              {adminAccess && actionLesson.status === "scheduled" && (
                <button
                  type="button"
                  className="btn ghost"
                  style={{
                    justifyContent: "flex-start",
                    padding: "11px 14px",
                    fontSize: 12,
                    color: "#9a3412",
                    borderColor: "#fed7aa",
                    background: "#fff7ed",
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    const target = actionLesson;
                    setActionLesson(null);
                    openEmergencyCover(target);
                  }}
                >
                  <ShieldAlert size={16} />
                  Assign emergency cover teacher
                </button>
              )}

              {adminAccess && actionLesson.status === "scheduled" && (
                <button
                  type="button"
                  className="btn ghost danger"
                  style={{
                    justifyContent: "flex-start",
                    padding: "11px 14px",
                    fontSize: 12,
                  }}
                  onClick={() => {
                    const targetId = actionLesson.id;
                    setActionLesson(null);
                    cancelForReplacement(targetId);
                  }}
                >
                  <XCircle size={16} />
                  Cancel scheduled class
                </button>
              )}
            </div>
          </>
        )}
      </PortalModal>
      <ConfirmDialog />
    </>
  );
}
