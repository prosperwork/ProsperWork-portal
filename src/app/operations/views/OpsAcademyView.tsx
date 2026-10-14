"use client";

import { useState, type FormEvent } from "react";
import { CalendarClock, Clock3 } from "lucide-react";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
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
} from "../ops-types";

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
  confirm,
}: OpsAcademyViewProps) {
  const [seriesStudent, setSeriesStudent] = useState("");
  const [seriesWeekday, setSeriesWeekday] = useState("");
  const [seriesTime, setSeriesTime] = useState("");
  const [seriesZone, setSeriesZone] = useState("");
  const [seriesDuration, setSeriesDuration] = useState("");
  const [seriesStart, setSeriesStart] = useState("");
  const [seriesWeeks, setSeriesWeeks] = useState("");
  const [seriesNotes, setSeriesNotes] = useState("");

  const [pauseStudent, setPauseStudent] = useState("");
  const [pauseIndefinite, setPauseIndefinite] = useState(false);
  const [pauseDate, setPauseDate] = useState("");
  const [pauseNotes, setPauseNotes] = useState("");
  const [resumeNotes, setResumeNotes] = useState<Record<string, string>>({});

  const [reassignStudent, setReassignStudent] = useState("");
  const [reassignTeacher, setReassignTeacher] = useState("");
  const [reassignAdmin, setReassignAdmin] = useState("");
  const [reassignNotes, setReassignNotes] = useState("");

  const selectedSeriesStudent = activeStudents.find(
    (student) => student.id === seriesStudent
  );

  const createSeries = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "series",
        studentId: seriesStudent,
        weekday: Number(seriesWeekday),
        localTime: seriesTime,
        zone: seriesZone,
        minutes: Number(seriesDuration),
        startsOn: seriesStart,
        weeks: Number(seriesWeeks),
        notes: seriesNotes,
      },
      "Weekly series created; new lesson rows appear on the schedule."
    );
    if (saved) {
      setSeriesStudent("");
      setSeriesWeekday("");
      setSeriesTime("");
      setSeriesZone("");
      setSeriesDuration("");
      setSeriesStart("");
      setSeriesWeeks("");
      setSeriesNotes("");
    }
  };

  const pauseChild = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetStudent = activeStudents.find((s) => s.id === pauseStudent);
    const targetName = studentName(targetStudent);

    confirm({
      title: "Pause Student Lessons?",
      message: `Are you sure you want to pause lessons for ${targetName}? Status will be updated and upcoming unattended classes will be held.${
        pauseIndefinite ? " This is an indefinite pause." : ` Resume date set to: ${pauseDate}.`
      }`,
      tone: "warning",
      confirmLabel: "Confirm Pause",
      onConfirm: async () => {
        const saved = await submitAction(
          {
            action: "pause",
            studentId: pauseStudent,
            resumeOn: pauseIndefinite ? null : pauseDate,
            reason: pauseNotes,
          },
          "Student paused and calendar records updated."
        );
        if (saved) {
          setPauseStudent("");
          setPauseDate("");
          setPauseNotes("");
          setPauseIndefinite(false);
        }
      },
    });
  };

  const handleResume = (item: (typeof data.pauses)[0]) => {
    const student = data.students.find((s) => s.id === item.student_id);
    const targetName = studentName(student);
    const note = (resumeNotes[item.id] ?? "").trim();

    confirm({
      title: "Resume Student Lessons?",
      message: `Are you sure you want to resume active lessons for ${targetName}? Lesson schedules and billing access will be reactivated. Reason: "${note}"`,
      tone: "primary",
      confirmLabel: "Resume Student",
      onConfirm: async () => {
        await submitAction(
          {
            action: "resume",
            id: item.id,
            notes: note,
          },
          "Student resumed and calendar records reloaded."
        );
      },
    });
  };

  const reassignChild = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const student = data.students.find((item) => item.id === reassignStudent);
    const teacher = activeTeachers.find((item) => item.id === reassignTeacher);
    const admin = activeAdmins.find((item) => item.id === reassignAdmin);

    confirm({
      title: "Confirm Permanent Reassignment?",
      message: `Permanent roster reassignment for ${studentName(student)}:\n\nNew Teacher: ${teacher?.name ?? "Unassigned"}\nNew Admin: ${admin?.name ?? "Unassigned"}\n\nFuture timetable and communication routing will update automatically.`,
      tone: "primary",
      confirmLabel: "Save Permanent Reassignment",
      onConfirm: async () => {
        const saved = await submitAction(
          {
            action: "reassign",
            studentId: reassignStudent,
            teacherId: reassignTeacher,
            adminId: reassignAdmin,
            notes: reassignNotes,
          },
          "Permanent roster reassignment saved and reloaded."
        );
        if (saved) {
          setReassignStudent("");
          setReassignTeacher("");
          setReassignAdmin("");
          setReassignNotes("");
        }
      },
    });
  };

  return (
    <div className="ops-view-group" role="group" aria-label="Academy work area">
      {canSchedule && (
        <section className="ops-section span-6" aria-labelledby="series-title">
          <div className="ops-section-head">
            <div>
              <h2 id="series-title">Weekly lesson series</h2>
            </div>
            <CalendarClock size={18} color="#4c8b63" />
          </div>
          <details className="ops-create-record">
            <summary>Create weekly series</summary>
            <form onSubmit={(event) => void createSeries(event)}>
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
                      {staffName(data.staff, selectedSeriesStudent.teacher_id)} · admin:{" "}
                      {staffName(data.staff, selectedSeriesStudent.admin_id)}
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
                    value={seriesZone}
                    onChange={(event) => setSeriesZone(event.target.value)}
                    maxLength={100}
                    placeholder="Student timezone"
                    required
                  />
                </div>
                <div className="ops-field">
                  <label htmlFor="series-duration">Duration in minutes · 45–180</label>
                  <input
                    id="series-duration"
                    type="number"
                    min="45"
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
                <div className="ops-field full">
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
              <div className="ops-actions">
                <button
                  className="ops-btn primary"
                  type="submit"
                  disabled={!isActive || Boolean(busy)}
                >
                  Create weekly series
                </button>
              </div>
            </form>
          </details>
          {data.series.length ? (
            <div className="ops-table-wrap" style={{ marginTop: 12 }}>
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
                        {studentName(
                          data.students.find((student) => student.id === item.student_id)
                        )}
                      </td>
                      <td>
                        {weekdays[item.weekday] ?? "Unknown"} · {item.local_time.slice(0, 5)}{" "}
                        {item.zone}
                        <span className="ops-small">{item.minutes} minutes</span>
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
              <strong>No lesson series returned</strong>Saved patterns appear after creation.
            </div>
          )}
        </section>
      )}

      {canSchedule && (
        <section className="ops-section span-6" aria-labelledby="pause-title">
          <div className="ops-section-head">
            <div>
              <h2 id="pause-title">Student pauses</h2>
            </div>
            <Clock3 size={18} color="#4c8b63" />
          </div>
          <details className="ops-create-record">
            <summary>Pause a student</summary>
            <form onSubmit={(event) => void pauseChild(event)}>
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
              <label className="ops-check">
                <input
                  type="checkbox"
                  checked={pauseIndefinite}
                  onChange={(event) => setPauseIndefinite(event.target.checked)}
                />{" "}
                Indefinite pause
              </label>
              {!pauseIndefinite && (
                <div className="ops-field" style={{ marginTop: 10 }}>
                  <label htmlFor="pause-resume-date">Resume date</label>
                  <input
                    id="pause-resume-date"
                    type="date"
                    value={pauseDate}
                    onChange={(event) => setPauseDate(event.target.value)}
                    required
                  />
                </div>
              )}
              <div className="ops-field">
                <label htmlFor="pause-notes">Reason · at least 5 characters</label>
                <textarea
                  id="pause-notes"
                  value={pauseNotes}
                  onChange={(event) => setPauseNotes(event.target.value)}
                  minLength={5}
                  maxLength={2000}
                  required
                />
              </div>
              <div className="ops-actions">
                <button
                  className="ops-btn primary"
                  type="submit"
                  disabled={!isActive || Boolean(busy)}
                >
                  Pause student
                </button>
              </div>
            </form>
          </details>
          <div className="ops-section-head" style={{ marginTop: 17 }}>
            <div>
              <h2>Active pauses</h2>
            </div>
          </div>
          {data.pauses.filter((item) => item.active).length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Resume date</th>
                    <th>Reason / status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pauses
                    .filter((item) => item.active)
                    .map((item) => (
                      <tr key={item.id}>
                        <td>
                          {studentName(
                            data.students.find((student) => student.id === item.student_id)
                          )}
                        </td>
                        <td>{item.resume_on ?? "Indefinite"}</td>
                        <td>
                          {item.reason}
                          {item.last_error && (
                            <span className="ops-small" role="alert">
                              {item.last_error}
                            </span>
                          )}
                        </td>
                        <td>
                          <input
                            aria-label={`Resume reason for ${studentName(
                              data.students.find((student) => student.id === item.student_id)
                            )}`}
                            placeholder="Resume reason · 5+ chars"
                            value={resumeNotes[item.id] ?? ""}
                            onChange={(event) =>
                              setResumeNotes((previous) => ({
                                ...previous,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                          <button
                            className="ops-btn"
                            type="button"
                            onClick={() => handleResume(item)}
                            disabled={
                              !isActive ||
                              (resumeNotes[item.id] ?? "").trim().length < 5 ||
                              Boolean(busy)
                            }
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
              <strong>No active pauses returned</strong>
            </div>
          )}
        </section>
      )}

      {(isOwner || isHead) && (
        <section className="ops-section span-6" aria-labelledby="reassign-title">
          <div className="ops-section-head">
            <div>
              <h2 id="reassign-title">Permanent roster assignment</h2>
            </div>
          </div>
          <details className="ops-create-record">
            <summary>Change teacher or admin</summary>
            <form onSubmit={(event) => void reassignChild(event)}>
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
              <div className="ops-field">
                <label htmlFor="reassign-reason">Reason · at least 5 characters</label>
                <textarea
                  id="reassign-reason"
                  value={reassignNotes}
                  onChange={(event) => setReassignNotes(event.target.value)}
                  minLength={5}
                  maxLength={2000}
                  required
                />
              </div>
              <div className="ops-actions">
                <button
                  className="ops-btn primary"
                  type="submit"
                  disabled={!isActive || !(isOwner || isHead) || Boolean(busy)}
                >
                  Save permanent reassignment
                </button>
              </div>
            </form>
          </details>
        </section>
      )}
    </div>
  );
}

