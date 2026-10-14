"use client";

import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  X,
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
  const [approvingStudent, setApprovingStudent] = useState<Student | null>(
    null
  );
  const [assignTeacherName, setAssignTeacherName] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState("");

  const activeTeachers = data.staff.filter(
    (s) => s.role === "teacher" && s.status === "active"
  );

  const pendingReviewStudents = studentsVisible.filter(
    (s) =>
      s.admissionStatus === "pending_review" ||
      s.teacherName?.includes("Pending Review") ||
      (s.status === "inactive" && !s.teacherName)
  );

  const handleApproveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingStudent) return;
    const teacherName = assignTeacherName.trim();
    if (!teacherName) {
      setApprovalError("Please select an assigned instructor.");
      return;
    }
    const teacherStaff = activeTeachers.find((t) => t.name === teacherName);
    setApprovalBusy(true);
    setApprovalError("");
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_student",
          studentId: approvingStudent.id,
          teacherName,
          teacherId: teacherStaff?.id,
          adminName: data.staff.find((s) => s.role === "admin")?.name,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setApprovalError(json.error || "Failed to confirm admission.");
        return;
      }
      approvingStudent.status = "active";
      approvingStudent.admissionStatus = "approved";
      approvingStudent.teacherName = teacherName;
      setApprovingStudent(null);
      notify(
        `Admission confirmed for ${approvingStudent.name}! Notification email sent to ${approvingStudent.parentName}.`
      );
    } catch {
      setApprovalError("Network error. Try again.");
    } finally {
      setApprovalBusy(false);
    }
  };

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
      {adminAccess && pendingReviewStudents.length > 0 && (
        <div
          className="callout"
          style={{
            marginBottom: 15,
            background: "#fffbeb",
            borderColor: "#fde68a",
            color: "#92400e",
          }}
        >
          <AlertCircle size={18} color="#d97706" />
          <div>
            <strong style={{ color: "#92400e" }}>
              {pendingReviewStudents.length} New Student Registration
              {pendingReviewStudents.length > 1 ? "s" : ""} Awaiting Review
            </strong>
            Review submitted schedule availability, lesson duration, and assign
            a qualified instructor to activate enrollment.
          </div>
        </div>
      )}
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
                <Pill
                  tone={
                    student.admissionStatus === "pending_review" ||
                    student.teacherName?.includes("Pending Review")
                      ? "amber"
                      : student.status === "active"
                      ? "green"
                      : "rose"
                  }
                >
                  {student.admissionStatus === "pending_review" ||
                  student.teacherName?.includes("Pending Review")
                    ? "Pending Review"
                    : student.status}
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
                      {selected.admissionStatus === "pending_review" ||
                      selected.teacherName?.includes("Pending Review")
                        ? "Pending Admission Review"
                        : selected.status}
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
                  <div className="profile-field">
                    <span>Lesson duration</span>
                    <strong>
                      {selected.lessonDuration || "1 hour (Standard)"}
                    </strong>
                  </div>
                  <div className="profile-field">
                    <span>Preferred schedule</span>
                    <strong>
                      {selected.preferredDays || "Flexible / Not specified"}
                    </strong>
                  </div>
                  {selected.extraTimeNotes && (
                    <div
                      className="profile-field"
                      style={{ gridColumn: "1 / -1" }}
                    >
                      <span style={{ color: "#d97706" }}>
                        Extra time request details
                      </span>
                      <strong style={{ color: "#92400e" }}>
                        {selected.extraTimeNotes}
                      </strong>
                    </div>
                  )}
                  {selected.learningGoals && (
                    <div className="profile-field">
                      <span>Primary learning goals</span>
                      <strong>{selected.learningGoals}</strong>
                    </div>
                  )}
                  {selected.specialNeeds && (
                    <div className="profile-field">
                      <span>Accommodations / notes</span>
                      <strong>{selected.specialNeeds}</strong>
                    </div>
                  )}
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
                    <div
                      className="row-actions"
                      style={{
                        marginTop: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      {(selected.admissionStatus === "pending_review" ||
                        selected.teacherName?.includes("Pending Review") ||
                        (selected.status === "inactive" &&
                          !selected.teacherName)) && (
                        <button
                          type="button"
                          className="btn primary small"
                          style={{
                            background: "#15803d",
                            borderColor: "#15803d",
                            color: "#ffffff",
                          }}
                          onClick={() => {
                            setApprovingStudent(selected);
                            setAssignTeacherName(activeTeachers[0]?.name || "");
                            setApprovalError("");
                          }}
                        >
                          <UserCheck size={13} />
                          Approve &amp; Assign Instructor
                        </button>
                      )}
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
      {approvingStudent && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 46, 34, 0.45)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => !approvalBusy && setApprovingStudent(null)}
        >
          <div
            className="modal-box card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480,
              width: "100%",
              background: "#ffffff",
              borderRadius: 14,
              boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
              padding: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                borderBottom: "1px solid #e7efe9",
                paddingBottom: 12,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18, color: "#0a2e22" }}>
                Confirm Student Admission
              </h3>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setApprovingStudent(null)}
                disabled={approvalBusy}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleApproveStudent}>
              <p
                style={{
                  fontSize: 13.5,
                  color: "#374740",
                  margin: "0 0 16px",
                  lineHeight: 1.5,
                }}
              >
                Confirm enrollment for <strong>{approvingStudent.name}</strong>{" "}
                ({approvingStudent.instrument}). Assigning an instructor
                activates their lesson calendar and sends an official
                confirmation email to{" "}
                <strong>{approvingStudent.parentEmail}</strong>.
              </p>

              <div
                style={{
                  background: "#f8faf9",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid #e2ece6",
                  marginBottom: 16,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <div>
                  <strong>Lesson Duration:</strong>{" "}
                  {approvingStudent.lessonDuration || "1 hour (Standard)"}
                </div>
                {approvingStudent.extraTimeNotes && (
                  <div style={{ color: "#92400e" }}>
                    <strong>Extra Time Note:</strong>{" "}
                    {approvingStudent.extraTimeNotes}
                  </div>
                )}
                <div>
                  <strong>Requested Schedule:</strong>{" "}
                  {approvingStudent.preferredDays || "Flexible"}
                </div>
                <div>
                  <strong>Guardian:</strong> {approvingStudent.parentName}
                </div>
              </div>

              {approvalError && (
                <div
                  className="form-error"
                  role="alert"
                  style={{ marginBottom: 12 }}
                >
                  {approvalError}
                </div>
              )}

              <div style={{ marginBottom: 18 }}>
                <label
                  htmlFor="assign-teacher-select"
                  style={{
                    display: "block",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "#0a2e22",
                    marginBottom: 6,
                  }}
                >
                  Assign Qualified Instructor *
                </label>
                <select
                  id="assign-teacher-select"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid #c9d8ce",
                    fontSize: 14,
                  }}
                  value={assignTeacherName}
                  onChange={(e) => setAssignTeacherName(e.target.value)}
                  disabled={approvalBusy}
                  required
                >
                  <option value="">Select an instructor…</option>
                  {activeTeachers.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t.department || "Instructor"})
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setApprovingStudent(null)}
                  disabled={approvalBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={approvalBusy || !assignTeacherName}
                  style={{
                    background: "#15803d",
                    borderColor: "#15803d",
                    color: "#ffffff",
                  }}
                >
                  {approvalBusy
                    ? "Confirming & Sending…"
                    : "Confirm Admission & Notify"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
