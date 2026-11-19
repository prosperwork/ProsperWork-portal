"use client";

import { useState, type FormEvent } from "react";
import { CalendarClock, Clock3, Plus, UserCog } from "lucide-react";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
import { PortalModal } from "@/app/_components/PortalModal";
import {
  dateLabel,
  isoToday,
  roleName,
  staffName,
  studentName,
  studentStatus,
  text,
  weekdays,
  type OperationsData,
  type OpsStaff,
  type OpsStudent,
  type PauseRow,
} from "../ops-types";

const COMMON_TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Dublin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export interface OpsAcademyViewProps {
  data: OperationsData;
  activeStudents: OpsStudent[];
  activeTeachers: OpsStaff[];
  activeAdmins: OpsStaff[];
  isActive: boolean;
  isOwner: boolean;
  isHead: boolean;
  canSchedule: boolean;
  busy: string;
  submitAction: (action: unknown, label: string) => Promise<boolean>;
  confirm: (options: ConfirmOptions) => void;
}

export default function OpsAcademyView({
  data,
  activeStudents,
  activeTeachers,
  activeAdmins,
  isActive,
  isOwner,
  isHead,
  canSchedule,
  busy,
  submitAction,
}: OpsAcademyViewProps) {
  // Create Weekly Series modal
  const [seriesModalOpen, setSeriesModalOpen] = useState(false);
  const [seriesStudent, setSeriesStudent] = useState("");
  const [seriesWeekday, setSeriesWeekday] = useState("");
  const [seriesTime, setSeriesTime] = useState("");
  const [seriesZone, setSeriesZone] = useState("");
  const [seriesDuration, setSeriesDuration] = useState("60");
  const [seriesStart, setSeriesStart] = useState("");
  const [seriesWeeks, setSeriesWeeks] = useState("4");
  const [seriesNotes, setSeriesNotes] = useState("");

  // Pause Student modal
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseStudent, setPauseStudent] = useState("");
  const [pauseIndefinite, setPauseIndefinite] = useState(false);
  const [pauseDate, setPauseDate] = useState("");
  const [pauseNotes, setPauseNotes] = useState("");

  // Resume Student modal
  const [resumeTarget, setResumeTarget] = useState<PauseRow | null>(null);
  const [resumeNotes, setResumeNotes] = useState("");

  // Reassign Staff modal
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignStudent, setReassignStudent] = useState("");
  const [reassignTeacher, setReassignTeacher] = useState("");
  const [reassignAdmin, setReassignAdmin] = useState("");
  const [reassignNotes, setReassignNotes] = useState("");

  const selectedSeriesStudent = activeStudents.find(
    (student) => student.id === seriesStudent
  );

  const activePauses = data.pauses.filter((item) => item.active);

  const createSeries = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "recurrence",
        studentId: seriesStudent,
        weekday: Number(seriesWeekday),
        time: seriesTime,
        zone: seriesZone.trim(),
        duration: Number(seriesDuration),
        startsOn: seriesStart,
        weeks: Number(seriesWeeks),
        notes: seriesNotes.trim(),
      },
      "Weekly series created; new lesson rows appear on the schedule."
    );
    if (saved) {
      setSeriesStudent("");
      setSeriesWeekday("");
      setSeriesTime("");
      setSeriesZone("");
      setSeriesDuration("60");
      setSeriesStart("");
      setSeriesWeeks("4");
      setSeriesNotes("");
      setSeriesModalOpen(false);
    }
  };

  const pauseChild = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "pause",
        studentId: pauseStudent,
        resumeOn: pauseIndefinite ? null : pauseDate,
        notes: pauseNotes.trim(),
      },
      "Student paused and calendar records updated."
    );
    if (saved) {
      setPauseStudent("");
      setPauseDate("");
      setPauseNotes("");
      setPauseIndefinite(false);
      setPauseModalOpen(false);
    }
  };

  const handleConfirmResume = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resumeTarget) return;
    const saved = await submitAction(
      {
        action: "resume",
        id: resumeTarget.id,
        notes: resumeNotes.trim(),
      },
      "Student resumed and calendar records reloaded."
    );
    if (saved) {
      setResumeTarget(null);
      setResumeNotes("");
    }
  };

  const openReassignModal = (studentId?: string) => {
    if (studentId) {
      const student = data.students.find((item) => item.id === studentId);
      setReassignStudent(studentId);
      setReassignTeacher(student?.teacher_id ?? "");
      setReassignAdmin(student?.admin_id ?? "");
    } else {
      setReassignStudent("");
      setReassignTeacher("");
      setReassignAdmin("");
    }
    setReassignNotes("");
    setReassignModalOpen(true);
  };

  const reassignChild = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "reassign",
        studentId: reassignStudent,
        teacherId: reassignTeacher,
        adminId: reassignAdmin,
        notes: reassignNotes.trim(),
      },
      "Permanent roster reassignment saved and reloaded."
    );
    if (saved) {
      setReassignStudent("");
      setReassignTeacher("");
      setReassignAdmin("");
      setReassignNotes("");
      setReassignModalOpen(false);
    }
  };

  return (
    <div className="ops-view-group" role="group" aria-label="Academy work area">
      {/* Weekly Lesson Series */}
      {canSchedule && (
        <section className="ops-section span-6" aria-labelledby="series-title">
          <div className="ops-section-head">
            <div>
              <h2 id="series-title">Weekly lesson series</h2>
              <p>Recurring weekly class patterns for active learners.</p>
            </div>
            <button
              type="button"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
              onClick={() => setSeriesModalOpen(true)}
            >
              <Plus size={14} /> Create Weekly Series
            </button>
          </div>
          {data.series.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Pattern</th>
                    <th>Start / length</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>
                          {studentName(
                            data.students.find(
                              (student) => student.id === item.student_id
                            )
                          )}
                        </strong>
                      </td>
                      <td>
                        {weekdays[item.weekday] ?? "Unknown"} ·{" "}
                        {item.local_time.slice(0, 5)} {item.zone}
                        <span className="ops-small">
                          {item.minutes} minutes
                        </span>
                      </td>
                      <td>
                        {dateLabel(item.starts_on)}
                        <span className="ops-small">{item.weeks} weeks</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <CalendarClock
                size={18}
                color="#4c8b63"
                style={{ margin: "0 auto 6px" }}
              />
              <strong>No lesson series returned</strong>
              Create a weekly series to schedule recurring lessons.
            </div>
          )}
        </section>
      )}

      {/* Student Pauses */}
      {canSchedule && (
        <section className="ops-section span-6" aria-labelledby="pause-title">
          <div className="ops-section-head">
            <div>
              <h2 id="pause-title">Student pauses</h2>
              <p>
                Paused learners hold upcoming unattended classes without silent
                back-charging.
              </p>
            </div>
            <button
              type="button"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
              onClick={() => setPauseModalOpen(true)}
            >
              <Plus size={14} /> Pause Student
            </button>
          </div>
          {activePauses.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Resume date</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activePauses.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>
                          {studentName(
                            data.students.find(
                              (student) => student.id === item.student_id
                            )
                          )}
                        </strong>
                      </td>
                      <td>
                        <span className="ops-pill alert">
                          {item.resume_on ?? "Indefinite"}
                        </span>
                      </td>
                      <td>
                        {item.reason}
                        {item.last_error && (
                          <span className="ops-small" role="alert">
                            {item.last_error}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="ops-btn"
                          type="button"
                          onClick={() => {
                            setResumeTarget(item);
                            setResumeNotes("");
                          }}
                          disabled={!isActive || Boolean(busy)}
                        >
                          Resume
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <Clock3
                size={18}
                color="#4c8b63"
                style={{ margin: "0 auto 6px" }}
              />
              <strong>No active pauses</strong>
              Use Pause Student above if a family needs a scheduled or
              indefinite break.
            </div>
          )}
        </section>
      )}

      {/* Permanent Roster Assignments */}
      {(isOwner || isHead) && (
        <section
          className="ops-section span-12"
          aria-labelledby="reassign-title"
        >
          <div className="ops-section-head">
            <div>
              <h2 id="reassign-title">Permanent roster assignments</h2>
              <p>
                Manage permanent teacher and administrator assignments across
                students. Temporary covers never alter the permanent roster.
              </p>
            </div>
            <button
              type="button"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
              onClick={() => openReassignModal()}
            >
              <UserCog size={14} /> Reassign Staff
            </button>
          </div>

          {data.students.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Status</th>
                    <th>Assigned Teacher</th>
                    <th>Assigned Admin</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((student) => (
                    <tr key={student.id}>
                      <td>
                        <strong>{studentName(student)}</strong>
                      </td>
                      <td>
                        <span
                          className={`ops-pill ${
                            studentStatus(student) === "active" ? "" : "alert"
                          }`}
                        >
                          {studentStatus(student)}
                        </span>
                      </td>
                      <td>{staffName(data.staff, student.teacher_id)}</td>
                      <td>{staffName(data.staff, student.admin_id)}</td>
                      <td>
                        <button
                          type="button"
                          className="ops-btn"
                          disabled={!isActive || Boolean(busy)}
                          onClick={() => openReassignModal(student.id)}
                        >
                          Reassign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <strong>No students in roster</strong>
              Students appear here once enrolled.
            </div>
          )}
        </section>
      )}

      {/* + Create Weekly Series Modal */}
      <PortalModal
        open={seriesModalOpen}
        onClose={() => {
          if (!busy) setSeriesModalOpen(false);
        }}
        title="Create Weekly Lesson Series"
        eyebrow="Recurring Schedule"
        subtitle="Generate recurring weekly lessons in the learner's IANA timezone."
        size="md"
        busy={busy === "recurrence"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setSeriesModalOpen(false)}
              disabled={busy === "recurrence"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-series-form"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
            >
              {busy === "recurrence" ? "Creating…" : "Create Weekly Series"}
            </button>
          </>
        }
      >
        <form
          id="ops-series-form"
          onSubmit={(event) => void createSeries(event)}
        >
          <div className="ops-form-grid">
            <div className="ops-field full">
              <label htmlFor="series-student">Active student</label>
              <select
                id="series-student"
                value={seriesStudent}
                onChange={(event) => {
                  const id = event.target.value;
                  setSeriesStudent(id);
                  const student = activeStudents.find((item) => item.id === id);
                  setSeriesZone(text(student?.payload.timezone, ""));
                }}
                required
              >
                <option value="">Choose student</option>
                {activeStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {studentName(student)} · {studentStatus(student)}
                  </option>
                ))}
              </select>
              {selectedSeriesStudent && (
                <small>
                  Assigned teacher:{" "}
                  {staffName(data.staff, selectedSeriesStudent.teacher_id)} ·
                  admin: {staffName(data.staff, selectedSeriesStudent.admin_id)}
                </small>
              )}
            </div>
            <div className="ops-field">
              <label htmlFor="series-weekday">Weekday</label>
              <select
                id="series-weekday"
                value={seriesWeekday}
                onChange={(event) => setSeriesWeekday(event.target.value)}
                required
              >
                <option value="">Choose weekday</option>
                {weekdays.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
            <div className="ops-field">
              <label htmlFor="series-time">Local lesson time</label>
              <input
                id="series-time"
                type="time"
                value={seriesTime}
                onChange={(event) => setSeriesTime(event.target.value)}
                required
              />
            </div>
            <div className="ops-field">
              <label htmlFor="series-zone">IANA timezone</label>
              <input
                id="series-zone"
                list="ops-iana-timezones"
                value={seriesZone}
                onChange={(event) => setSeriesZone(event.target.value)}
                maxLength={100}
                placeholder="e.g. Africa/Lagos"
                required
              />
              <datalist id="ops-iana-timezones">
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </div>
            <div className="ops-field">
              <label htmlFor="series-duration">Duration (minutes · 1–180)</label>
              <input
                id="series-duration"
                type="number"
                min="1"
                max="180"
                step="1"
                value={seriesDuration}
                onChange={(event) => setSeriesDuration(event.target.value)}
                required
              />
            </div>
            <div className="ops-field">
              <label htmlFor="series-start">Starts on</label>
              <input
                id="series-start"
                type="date"
                min={isoToday()}
                value={seriesStart}
                onChange={(event) => setSeriesStart(event.target.value)}
                required
              />
            </div>
            <div className="ops-field">
              <label htmlFor="series-weeks">Weeks · 1–26</label>
              <input
                id="series-weeks"
                type="number"
                min="1"
                max="26"
                step="1"
                value={seriesWeeks}
                onChange={(event) => setSeriesWeeks(event.target.value)}
                required
              />
            </div>
            <div className="ops-field full" style={{ marginBottom: 0 }}>
              <label htmlFor="series-notes">
                Agreed scheduling reason · 5+ characters
              </label>
              <textarea
                id="series-notes"
                value={seriesNotes}
                onChange={(event) => setSeriesNotes(event.target.value)}
                minLength={5}
                maxLength={2000}
                required
              />
            </div>
          </div>
        </form>
      </PortalModal>

      {/* + Pause Student Modal */}
      <PortalModal
        open={pauseModalOpen}
        onClose={() => {
          if (!busy) setPauseModalOpen(false);
        }}
        title="Pause Student Lessons"
        eyebrow="Attendance & Billing Hold"
        subtitle="Status will update and upcoming unattended lessons will be held. Billing is placed on hold rather than silently back-charged."
        size="md"
        busy={busy === "pause"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setPauseModalOpen(false)}
              disabled={busy === "pause"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-pause-form"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
            >
              {busy === "pause" ? "Pausing…" : "Confirm Pause"}
            </button>
          </>
        }
      >
        <form
          id="ops-pause-form"
          onSubmit={(event) => void pauseChild(event)}
        >
          <div className="ops-field">
            <label htmlFor="pause-student">Active student</label>
            <select
              id="pause-student"
              value={pauseStudent}
              onChange={(event) => setPauseStudent(event.target.value)}
              required
            >
              <option value="">Choose student</option>
              {activeStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {studentName(student)}
                </option>
              ))}
            </select>
          </div>

          <label className="ops-check" style={{ marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={pauseIndefinite}
              onChange={(event) => setPauseIndefinite(event.target.checked)}
            />
            Indefinite pause (no fixed return date yet)
          </label>

          {!pauseIndefinite && (
            <div className="ops-field">
              <label htmlFor="pause-resume-date">Expected resume date</label>
              <input
                id="pause-resume-date"
                type="date"
                min={isoToday()}
                value={pauseDate}
                onChange={(event) => setPauseDate(event.target.value)}
                required
              />
            </div>
          )}

          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="pause-notes">Reason · at least 5 characters</label>
            <textarea
              id="pause-notes"
              value={pauseNotes}
              onChange={(event) => setPauseNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
              placeholder="e.g. Family traveling for school holidays"
            />
          </div>
        </form>
      </PortalModal>

      {/* Resume Student Modal */}
      <PortalModal
        open={Boolean(resumeTarget)}
        onClose={() => {
          if (!busy) setResumeTarget(null);
        }}
        title="Resume Student Lessons"
        eyebrow="Reactivate Enrollment"
        subtitle={
          resumeTarget
            ? `Student: ${studentName(
                data.students.find((s) => s.id === resumeTarget.student_id)
              )}`
            : undefined
        }
        size="sm"
        busy={busy === "resume"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setResumeTarget(null)}
              disabled={busy === "resume"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-resume-form"
              className="ops-btn primary"
              disabled={
                !isActive || resumeNotes.trim().length < 5 || Boolean(busy)
              }
            >
              {busy === "resume" ? "Resuming…" : "Resume Student"}
            </button>
          </>
        }
      >
        <form
          id="ops-resume-form"
          onSubmit={(event) => void handleConfirmResume(event)}
        >
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>
            Lesson access will be reactivated. Finance should review any held
            billing contract before generating new invoices.
          </p>
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="resume-student-reason">
              Resume reason · at least 5 characters
            </label>
            <textarea
              id="resume-student-reason"
              required
              minLength={5}
              maxLength={2000}
              value={resumeNotes}
              onChange={(event) => setResumeNotes(event.target.value)}
              placeholder="e.g. Family returned and confirmed weekly timetable"
            />
          </div>
        </form>
      </PortalModal>

      {/* Reassign Staff Modal */}
      <PortalModal
        open={reassignModalOpen}
        onClose={() => {
          if (!busy) setReassignModalOpen(false);
        }}
        title="Permanent Roster Reassignment"
        eyebrow="Teaching Team"
        subtitle="Future timetable and communication routing will update for the selected student."
        size="md"
        busy={busy === "reassign"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setReassignModalOpen(false)}
              disabled={busy === "reassign"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-reassign-form"
              className="ops-btn primary"
              disabled={!isActive || !(isOwner || isHead) || Boolean(busy)}
            >
              {busy === "reassign"
                ? "Saving…"
                : "Save Permanent Reassignment"}
            </button>
          </>
        }
      >
        <form
          id="ops-reassign-form"
          onSubmit={(event) => void reassignChild(event)}
        >
          <div className="ops-field">
            <label htmlFor="reassign-student">Portfolio student</label>
            <select
              id="reassign-student"
              value={reassignStudent}
              onChange={(event) => {
                const id = event.target.value;
                setReassignStudent(id);
                const student = data.students.find((item) => item.id === id);
                setReassignTeacher(student?.teacher_id ?? "");
                setReassignAdmin(student?.admin_id ?? "");
              }}
              required
            >
              <option value="">Choose student</option>
              {data.students.map((student) => (
                <option value={student.id} key={student.id}>
                  {studentName(student)} · {studentStatus(student)}
                </option>
              ))}
            </select>
          </div>
          <div className="ops-form-grid">
            <div className="ops-field">
              <label htmlFor="reassign-teacher">Compatible active teacher</label>
              <select
                id="reassign-teacher"
                value={reassignTeacher}
                onChange={(event) => setReassignTeacher(event.target.value)}
                required
              >
                <option value="">Choose teacher / QC</option>
                {activeTeachers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {roleName(person.role)}
                  </option>
                ))}
              </select>
            </div>
            <div className="ops-field">
              <label htmlFor="reassign-admin">Compatible active admin</label>
              <select
                id="reassign-admin"
                value={reassignAdmin}
                onChange={(event) => setReassignAdmin(event.target.value)}
                required
              >
                <option value="">Choose admin / Head</option>
                {activeAdmins.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {roleName(person.role)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="reassign-reason">
              Reason · at least 5 characters
            </label>
            <textarea
              id="reassign-reason"
              value={reassignNotes}
              onChange={(event) => setReassignNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>
        </form>
      </PortalModal>
    </div>
  );
}
