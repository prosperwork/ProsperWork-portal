"use client";

import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  MoreHorizontal,
  ShieldAlert,
  Video,
  X,
} from "lucide-react";
import { useConfirmModal } from "../ConfirmModal";
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

  const cancelForReplacement = (id: string) => {
    const lesson = data.lessons.find(
      (item) => item.id === id && item.status === "scheduled"
    );
    if (!lesson) return;
    confirm({
      title: "Cancel Class for Replacement?",
      message:
        "Cancel this class? Its history stays recorded. Schedule a replacement with the agreed length after cancellation.",
      tone: "warning",
      confirmLabel: "Mark as Cancelled",
      onConfirm: () => {
        setLessonStatus(lesson, "cancelled");
      },
    });
  };

  const statusButton = (label: string, onClick: () => void, tone = "ghost") => (
    <button type="button" className={`btn small ${tone}`} onClick={onClick}>
      {label}
    </button>
  );

  const base = new Date(`${todayKey()}T12:00:00Z`);
  const weekStart = new Date(base);
  weekStart.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
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

  return (
    <>
      <div className="toolbar">
        <div className="segmented">
          <button
            className={scheduleMode === "today" ? "active" : ""}
            onClick={() => setScheduleMode("today")}
          >
            Today
          </button>
          <button
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
                  <small> {timeAt(lesson.startsAt)}</small>
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
      {adminAccess && (
        <details className="card section-card">
          <summary>
            Change an agreed class length / cancel a scheduled class
          </summary>
          <p>
            Existing length agreements remain in history. Cancel the original
            class, then schedule a replacement with the new length and family
            agreement. Verified classes cannot be cancelled.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              cancelForReplacement(String(values.get("lesson") || ""));
            }}
          >
            <select
              name="lesson"
              className="select-mini"
              required
              defaultValue=""
              aria-label="Scheduled class to cancel"
            >
              <option value="" disabled>
                Choose a scheduled class
              </option>
              {data.lessons
                .filter((item) => item.status === "scheduled")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.studentName} — {niceDate(item.startsAt)}
                  </option>
                ))}
            </select>{" "}
            <button className="btn ghost" type="submit">
              Cancel selected class
            </button>
          </form>
        </details>
      )}
      {scheduleMode === "week" && (
        <div className="week-strip">
          {weekDays.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const count = visibleLessons.filter(
              (lesson) =>
                new Date(lesson.startsAt).toISOString().slice(0, 10) === key
            ).length;
            return (
              <button
                key={key}
                onClick={() => setSelectedDate(key)}
                className={`day-tile ${selectedDate === key ? "active" : ""}`}
              >
                <span className="day-name">
                  {new Intl.DateTimeFormat("en", { weekday: "short" }).format(
                    day
                  )}
                </span>
                <span className="day-date">{day.getDate()}</span>
                <span className="day-count">
                  {count} {count === 1 ? "class" : "classes"}
                </span>
              </button>
            );
          })}
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
                    <strong>{timeAt(lesson.startsAt)}</strong>
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
      {actionLesson && (
        <div className="overlay" onClick={() => setActionLesson(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lesson-action-title"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="lesson-action-title">Lesson actions</h2>
                <p>
                  {actionLesson.studentName} · {niceDate(actionLesson.startsAt)}{" "}
                  at {timeAt(actionLesson.startsAt)}
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                aria-label="Close"
                onClick={() => setActionLesson(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "#f7faf8",
                border: "1px solid #e1e9e3",
                borderRadius: 10,
                marginBottom: 16,
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
                  marginBottom: 14,
                }}
              >
                Verified by {actionLesson.verification.admin} on{" "}
                {niceDate(actionLesson.verification.at)}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            </div>

            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setActionLesson(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
      <ConfirmDialog />
    </>
  );
}
