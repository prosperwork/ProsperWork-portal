"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  BookOpen,
  ChevronRight,
  MessageCircle,
  MessageSquare,
  Music2,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import ProfileAvatar from "../ProfileAvatar";
import { PortalModal } from "../PortalModal";
import LessonHistory from "../../workflows/LessonHistory";
import {
  Empty,
  niceDate,
  Pill,
  SectionTitle,
} from "../../_lib/portal-formatters";
import type { FormKind } from "../modals/ActionModal";
import type { AcademyData, Role, Student } from "@/lib/types";

type RosterFilter = "all" | "pending_review" | "active" | "inactive";
type DetailTab = "profile" | "lessons" | "audit";

function isPendingReview(student: Student): boolean {
  return (
    student.admissionStatus === "pending_review" ||
    Boolean(student.teacherName?.includes("Pending Review")) ||
    (student.status === "inactive" && !student.teacherName)
  );
}

function calculateCalendarAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const trimmed = dob.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  let birthYear: number;
  let birthMonth: number;
  let birthDay: number;
  if (isoMatch) {
    birthYear = Number(isoMatch[1]);
    birthMonth = Number(isoMatch[2]);
    birthDay = Number(isoMatch[3]);
  } else {
    const parsed = new Date(trimmed);
    if (!Number.isFinite(parsed.getTime())) return null;
    birthYear = parsed.getUTCFullYear();
    birthMonth = parsed.getUTCMonth() + 1;
    birthDay = parsed.getUTCDate();
  }
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  const monthDiff = now.getMonth() + 1 - birthMonth;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDay)) {
    age -= 1;
  }
  return Math.max(0, age);
}

export default function FamiliesView({
  data,
  role,
  profileName,
  studentsVisible,
  query,
  searchBar,
  adminAccess,
  superAdmin,
  selectedStudentId,
  setSelectedStudentId,
  headerActions,
  updateConsent,
  openEmailComposer,
  notify,
  onRefresh,
  qcAssignmentError,
  qcAssignmentLoading,
}: {
  data: AcademyData;
  role: Role;
  profileName?: string;
  studentsVisible: Student[];
  query: string;
  searchBar: (placeholder: string) => ReactNode;
  adminAccess: boolean;
  superAdmin: boolean;
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  headerActions: (label: string, kind: FormKind) => ReactNode;
  updateConsent: (student: Student) => void;
  openEmailComposer: (
    type: "family" | "staff" | "lead",
    id: string,
    email: string,
    name: string
  ) => void;
  notify: (msg: string) => void;
  onRefresh: () => Promise<void>;
  qcAssignmentError?: string;
  qcAssignmentLoading?: boolean;
}) {
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("all");
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [approvingStudent, setApprovingStudent] = useState<Student | null>(
    null
  );
  const [assignTeacherName, setAssignTeacherName] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState("");

  void superAdmin;

  const activeTeachers = data.staff.filter(
    (s) =>
      (["teacher", "qc"].includes(s.role) ||
        s.department === "Music Education" ||
        s.role.includes("teacher") ||
        s.role.includes("tutor")) &&
      s.status === "active" &&
      s.role !== "parent" &&
      s.role !== "student"
  );

  const searchedStudents = studentsVisible.filter((student) =>
    `${student.name} ${student.parentName} ${student.instrument} ${student.teacherName}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const pendingReviewStudents = searchedStudents.filter(isPendingReview);
  const activeStudents = searchedStudents.filter(
    (s) => !isPendingReview(s) && s.status === "active"
  );
  const inactiveStudents = searchedStudents.filter(
    (s) => !isPendingReview(s) && s.status !== "active"
  );

  const students =
    rosterFilter === "pending_review"
      ? pendingReviewStudents
      : rosterFilter === "active"
      ? activeStudents
      : rosterFilter === "inactive"
      ? inactiveStudents
      : searchedStudents;

  const selected =
    students.find((student) => student.id === selectedStudentId) || students[0];

  const selectedLessons = selected
    ? data.lessons
        .filter((lesson) => lesson.studentId === selected.id)
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    : [];

  const allPendingCount = studentsVisible.filter(isPendingReview).length;

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
          adminName: profileName?.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setApprovalError(json.error || "Failed to confirm admission.");
        return;
      }
      const approvedName = approvingStudent.name;
      const approvedParent = approvingStudent.parentName;
      await onRefresh();
      setApprovingStudent(null);
      notify(
        `Admission confirmed for ${approvedName}! Notification email sent to ${approvedParent}.`
      );
    } catch {
      setApprovalError("Network error. Try again.");
    } finally {
      setApprovalBusy(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        {searchBar("Find a student, family or instrument")}
        {adminAccess && headerActions("Enroll student", "student")}
        {adminAccess && (
          <Link className="btn secondary" href="/complaints">
            <MessageSquare size={14} /> Complaints &amp; Support
          </Link>
        )}
      </div>
      {adminAccess && allPendingCount > 0 && (
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
              {allPendingCount} New Student Registration
              {allPendingCount > 1 ? "s" : ""} Awaiting Review
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

      <div
        className="portal-tabs"
        role="tablist"
        aria-label="Filter students by status"
      >
        <button
          type="button"
          role="tab"
          aria-selected={rosterFilter === "all"}
          className={`portal-tab${rosterFilter === "all" ? " active" : ""}`}
          onClick={() => setRosterFilter("all")}
        >
          All
          <span className="portal-tab-badge">{searchedStudents.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rosterFilter === "pending_review"}
          className={`portal-tab${
            rosterFilter === "pending_review" ? " active" : ""
          }`}
          onClick={() => setRosterFilter("pending_review")}
        >
          Pending Review
          <span className="portal-tab-badge">
            {pendingReviewStudents.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rosterFilter === "active"}
          className={`portal-tab${rosterFilter === "active" ? " active" : ""}`}
          onClick={() => setRosterFilter("active")}
        >
          Active
          <span className="portal-tab-badge">{activeStudents.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rosterFilter === "inactive"}
          className={`portal-tab${
            rosterFilter === "inactive" ? " active" : ""
          }`}
          onClick={() => setRosterFilter("inactive")}
        >
          Inactive
          <span className="portal-tab-badge">{inactiveStudents.length}</span>
        </button>
      </div>

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
              title={`${students.length} student${
                students.length === 1 ? "" : "s"
              }`}
              detail="Select a student to view their profile, lessons and audit trail."
            />
            {students.map((student) => {
              const pending = isPendingReview(student);
              return (
                <button
                  type="button"
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
                      pending
                        ? "amber"
                        : student.status === "active"
                        ? "green"
                        : "rose"
                    }
                  >
                    {pending ? "Pending Review" : student.status}
                  </Pill>
                  <ChevronRight size={14} />
                </button>
              );
            })}
          </section>
          {selected && (
            <div className="stack">
              <section className="card">
                <div className="profile-head" style={{ flexWrap: "wrap" }}>
                  <ProfileAvatar name={selected.name} size={49} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <h3>{selected.name}</h3>
                    <span className="page-subtitle">
                      {selected.instrument} · {selected.rank} ·{" "}
                      {isPendingReview(selected)
                        ? "Pending Admission Review"
                        : selected.status}
                    </span>
                  </div>
                  <div
                    className="row-actions"
                    style={{ alignItems: "center", gap: 6, flexWrap: "wrap" }}
                  >
                    <Link className="btn ghost small" href="/learning">
                      <BookOpen size={13} /> Lesson board
                    </Link>
                    <Link className="btn ghost small" href="/studio">
                      <Music2 size={13} /> Studio
                    </Link>
                    <Pill tone={selected.consent ? "green" : "amber"}>
                      {selected.consent
                        ? "consent granted"
                        : "consent not granted"}
                    </Pill>
                  </div>
                </div>

                <div
                  style={{
                    padding: "0 20px",
                    borderTop: "1px solid var(--line)",
                    paddingTop: 12,
                  }}
                >
                  <div
                    className="portal-tabs"
                    role="tablist"
                    aria-label={`${selected.name} details`}
                    style={{ marginBottom: 0, borderBottom: "none" }}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={detailTab === "profile"}
                      className={`portal-tab${
                        detailTab === "profile" ? " active" : ""
                      }`}
                      onClick={() => setDetailTab("profile")}
                    >
                      Profile
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={detailTab === "lessons"}
                      className={`portal-tab${
                        detailTab === "lessons" ? " active" : ""
                      }`}
                      onClick={() => setDetailTab("lessons")}
                    >
                      Lessons
                      <span className="portal-tab-badge">
                        {selectedLessons.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={detailTab === "audit"}
                      className={`portal-tab${
                        detailTab === "audit" ? " active" : ""
                      }`}
                      onClick={() => setDetailTab("audit")}
                    >
                      Class Audit
                    </button>
                  </div>
                </div>

                {detailTab === "profile" && (
                  <>
                    <div className="profile-grid">
                      <div className="profile-field">
                        <span>Age · date of birth</span>
                        <strong>
                          {(() => {
                            const age = calculateCalendarAge(selected.dob);
                            return (
                              <>
                                {age !== null ? `${age} · ` : ""}
                                {selected.dob
                                  ? niceDate(selected.dob, {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })
                                  : "Not recorded"}
                              </>
                            );
                          })()}
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
                          {selected.lessonsTaken} of {selected.monthlyLessons}{" "}
                          taken
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
                        {adminAccess && (
                          <button
                            type="button"
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
                          {isPendingReview(selected) && (
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
                                setAssignTeacherName(
                                  activeTeachers[0]?.name || ""
                                );
                                setApprovalError("");
                              }}
                            >
                              <UserCheck size={13} />
                              Approve &amp; Assign Instructor
                            </button>
                          )}
                          <button
                            type="button"
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
                  </>
                )}

                {detailTab === "lessons" && (
                  <div
                    style={{
                      padding: "16px 20px",
                      borderTop: "1px solid var(--line)",
                    }}
                  >
                    {selectedLessons.length ? (
                      selectedLessons.map((lesson) => (
                        <div className="lesson-row" key={lesson.id}>
                          <div className="lesson-time">
                            {niceDate(lesson.startsAt)}
                          </div>
                          <div>
                            <div className="lesson-person">{lesson.title}</div>
                            <div className="lesson-meta">
                              {lesson.teacherName} ·{" "}
                              {lesson.notes || "No lesson note yet"}
                              {lesson.nextTopics &&
                                ` · Next: ${lesson.nextTopics}`}
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
                      ))
                    ) : (
                      <Empty
                        title="No scheduled lessons yet"
                        detail="Lessons assigned to this student will appear here."
                      />
                    )}
                    <div className="metric-row" style={{ marginTop: 12 }}>
                      <span>Monthly lesson plan</span>
                      <strong>
                        {selected.lessonsTaken}/{selected.monthlyLessons}{" "}
                        complete
                      </strong>
                    </div>
                  </div>
                )}

                {detailTab === "audit" && (
                  <div
                    style={{
                      padding: "16px 20px",
                      borderTop: "1px solid var(--line)",
                    }}
                  >
                    <LessonHistory
                      studentId={selected.id}
                      studentName={selected.name}
                      timezone={selected.timezone}
                      parentView={false}
                    />
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      ) : role === "qc" && qcAssignmentLoading ? (
        <div className="skeleton" style={{ height: 140 }} />
      ) : (
        <Empty
          title="No matching student"
          detail={
            role === "qc"
              ? "No students from your assigned QC tutor lessons are visible here."
              : "Try a different filter or clear the search."
          }
        />
      )}

      <PortalModal
        open={Boolean(approvingStudent)}
        onClose={() => setApprovingStudent(null)}
        eyebrow="Admissions Review"
        title="Confirm Student Admission"
        subtitle={
          approvingStudent
            ? `${approvingStudent.name} · ${approvingStudent.instrument}`
            : undefined
        }
        size="sm"
        busy={approvalBusy}
      >
        {approvingStudent && (
          <form onSubmit={handleApproveStudent}>
            <p
              style={{
                fontSize: 13.5,
                color: "#374740",
                margin: "0 0 14px",
                lineHeight: 1.5,
              }}
            >
              Confirm enrollment for <strong>{approvingStudent.name}</strong> (
              {approvingStudent.instrument}). Assigning an instructor activates
              their lesson calendar and sends an official confirmation email to{" "}
              <strong>{approvingStudent.parentEmail}</strong>.
            </p>

            <div
              style={{
                background: "#f8faf9",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid #e2ece6",
                marginBottom: 14,
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

            <div className="modal-actions" style={{ marginTop: 0 }}>
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
        )}
      </PortalModal>
    </>
  );
}
