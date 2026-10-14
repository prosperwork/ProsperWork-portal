"use client";

import type { ReactNode } from "react";
import {
  CalendarDays,
  ChevronRight,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import ProfileAvatar from "../ProfileAvatar";
import LessonHistory from "../../workflows/LessonHistory";
import {
  Empty,
  niceDate,
  Pill,
  SectionTitle,
} from "../../_lib/portal-formatters";
import type { FormKind } from "../modals/ActionModal";
import type { AcademyData, Role, Student } from "@/lib/types";

export default function FamiliesView({
  data,
  role,
  studentsVisible,
  query,
  searchBar,
  adminAccess,
  parentAccess,
  superAdmin,
  selectedStudentId,
  setSelectedStudentId,
  headerActions,
  openForm,
  updateConsent,
  openEmailComposer,
  notify,
  qcAssignmentError,
  qcAssignmentLoading,
}: {
  data: AcademyData;
  role: Role;
  studentsVisible: Student[];
  query: string;
  searchBar: (placeholder: string) => ReactNode;
  adminAccess: boolean;
  parentAccess: boolean;
  superAdmin: boolean;
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  headerActions: (label: string, kind: FormKind) => ReactNode;
  openForm: (kind: FormKind) => void;
  updateConsent: (student: Student) => void;
  openEmailComposer: (
    type: "family" | "staff" | "lead",
    id: string,
    email: string,
    name: string
  ) => void;
  notify: (msg: string) => void;
  qcAssignmentError?: string;
  qcAssignmentLoading?: boolean;
}) {
  const students = studentsVisible.filter((student) =>
    `${student.name} ${student.parentName} ${student.instrument} ${student.teacherName}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const selected =
    students.find((student) => student.id === selectedStudentId) || students[0];

  return (
    <>
      <div className="toolbar">
        {searchBar("Find a student, family or instrument")}
        {adminAccess && headerActions("Enroll student", "student")}
        {parentAccess && (
          <button
            className="btn secondary"
            onClick={() => openForm("reschedule")}
          >
            <CalendarDays size={14} />
            Request reschedule
          </button>
        )}
      </div>
      {role === "qc" && (
        <div className="callout" style={{ marginBottom: 15 }}>
          <ShieldCheck size={17} />
          <div>
            <strong>My Students · own teaching assignments only.</strong>
            Students are derived from lessons assigned to your active QC tutor
            ID. The supervised quality roster remains available in Management.
          </div>
        </div>
      )}
      {role === "qc" && qcAssignmentError && (
        <div className="form-error" role="alert">
          {qcAssignmentError}
        </div>
      )}
      {parentAccess && (
        <div className="callout" style={{ marginBottom: 15 }}>
          <ShieldCheck size={17} />
          <div>
            <strong>Your family's learning record</strong>Only this family or
            learner's own timezone and child records are shown in this preview.
          </div>
        </div>
      )}
      {students.length ? (
        <div
          className="grid-main families-layout"
          style={{
            gridTemplateColumns: "minmax(280px, 340px) 1fr",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <section className="card section-card">
            <SectionTitle
              title={
                parentAccess ? "Your children" : `${students.length} students`
              }
              detail="Select a student to view their details and lesson history."
            />
            {students.map((student) => (
              <button
                key={student.id}
                className={`student-select ${
                  selected?.id === student.id ? "selected" : ""
                }`}
                onClick={() => setSelectedStudentId(student.id)}
              >
                <ProfileAvatar name={student.name} size={32} />
                <span className="student-select-copy">
                  <strong>{student.name}</strong>
                  <small>
                    {student.instrument} · {student.parentName}
                  </small>
                </span>
                <Pill tone={student.status === "active" ? "green" : "amber"}>
                  {student.status}
                </Pill>
                <ChevronRight size={14} />
              </button>
            ))}
          </section>
          {selected && (
            <div className="stack">
              <section className="card">
                <div className="profile-head">
                  <ProfileAvatar name={selected.name} size={49} />
                  <div style={{ flex: 1 }}>
                    <h3>{selected.name}</h3>
                    <span className="page-subtitle">
                      {selected.instrument} · {selected.rank} ·{" "}
                      {selected.status}
                    </span>
                  </div>
                  <Pill tone={selected.consent ? "green" : "amber"}>
                    {selected.consent
                      ? "consent granted"
                      : "consent not granted"}
                  </Pill>
                </div>
                <div className="profile-grid">
                  <div className="profile-field">
                    <span>Age · date of birth</span>
                    <strong>
                      {Math.floor(
                        (Date.now() - new Date(selected.dob).getTime()) /
                          31557600000
                      )}{" "}
                      ·{" "}
                      {niceDate(selected.dob, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </strong>
                  </div>
                  <div className="profile-field">
                    <span>Parent / guardian</span>
                    <strong>{selected.parentName}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Teacher</span>
                    <strong>{selected.teacherName}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Assigned administrator</span>
                    <strong>{selected.adminName}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Timezone</span>
                    <strong>{selected.timezone}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Monthly lessons</span>
                    <strong>
                      {selected.lessonsTaken} of {selected.monthlyLessons} taken
                    </strong>
                  </div>
                </div>
                <div
                  className="profile-foot"
                  style={{
                    padding: "16px 20px",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <div
                    className="settings-row"
                    style={{ borderTop: "none", paddingTop: 0 }}
                  >
                    <div>
                      <strong>Social media permission</strong>
                      <span>
                        Permission for student practice and class clips on
                        academy channels.
                      </span>
                    </div>
                    {(parentAccess ||
                      superAdmin ||
                      role === "general_manager" ||
                      role === "head_admin") && (
                      <button
                        className={`toggle ${selected.consent ? "on" : ""}`}
                        aria-label={`Toggle consent for ${selected.name}`}
                        aria-pressed={selected.consent}
                        onClick={() => updateConsent(selected)}
                      >
                        <span />
                      </button>
                    )}
                  </div>
                  {adminAccess && (
                    <div className="row-actions" style={{ marginTop: 12 }}>
                      <button
                        className="btn ghost small"
                        onClick={() =>
                          openEmailComposer(
                            "family",
                            selected.id,
                            selected.parentEmail,
                            selected.parentName
                          )
                        }
                      >
                        <MessageCircle size={13} />
                        Email family
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <section className="card section-card">
                <SectionTitle
                  title="Lesson history"
                  detail="Past, current and upcoming lessons for this student."
                />
                {data.lessons
                  .filter((lesson) => lesson.studentId === selected.id)
                  .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
                  .map((lesson) => (
                    <div className="lesson-row" key={lesson.id}>
                      <div className="lesson-time">
                        {niceDate(lesson.startsAt)}
                      </div>
                      <div>
                        <div className="lesson-person">{lesson.title}</div>
                        <div className="lesson-meta">
                          {lesson.teacherName} ·{" "}
                          {lesson.notes || "No lesson note yet"}
                          {lesson.nextTopics && ` · Next: ${lesson.nextTopics}`}
                        </div>
                        {lesson.verification && (
                          <div className="table-small">
                            Teacher {lesson.verification.teacher} · verified{" "}
                            {lesson.verification.admin} ·{" "}
                            {niceDate(lesson.verification.at)}
                          </div>
                        )}
                      </div>
                      <Pill>{lesson.status.replace("_", " ")}</Pill>
                    </div>
                  ))}
                <div className="metric-row">
                  <span>Monthly lesson plan</span>
                  <strong>
                    {selected.lessonsTaken}/{selected.monthlyLessons} complete
                  </strong>
                </div>
              </section>
            </div>
          )}
        </div>
      ) : role === "qc" && qcAssignmentLoading ? (
        <div className="skeleton" style={{ height: 140 }} />
      ) : (
        <Empty
          title="No matching family"
          detail={
            role === "qc"
              ? "No students from your assigned QC tutor lessons are visible here."
              : "Try a different name or clear the search."
          }
        />
      )}
      {selected && (
        <LessonHistory
          studentId={selected.id}
          studentName={selected.name}
          timezone={selected.timezone}
          parentView={parentAccess}
        />
      )}
    </>
  );
}
