"use client";

import Link from "next/link";
import { BookOpen, Check, FileText } from "lucide-react";
import {
  ageOn,
  avatarId,
  completedPracticeStreak,
  dateOfBirth,
  formatDate,
  initials,
  songsSummary,
  studentName,
  studentTimezone,
  type RepertoireEvent,
  type StudentRow,
  type StudioData,
} from "../studio-types";

export interface StudioStudentDossierProps {
  students: StudentRow[];
  selectedChild: StudentRow | null;
  recording: boolean;
  activeStudentIds: Set<string>;
  data: StudioData;
  serverNowDate: Date;
  canEditRepertoire: boolean;
  repertoireDrafts: Record<string, string>;
  reportMonths: Record<string, string>;
  monthDefault: string;
  busy: string;
  onSelectStudent: (id: string) => void;
  onRepertoireChange: (studentId: string, value: string) => void;
  onReportMonthChange: (studentId: string, month: string) => void;
  onUpdateRepertoire: (
    student: StudentRow,
    operation: "plan" | "complete"
  ) => Promise<void>;
}

export default function StudioStudentDossier({
  students,
  selectedChild,
  recording,
  activeStudentIds,
  data,
  serverNowDate,
  canEditRepertoire,
  repertoireDrafts,
  reportMonths,
  monthDefault,
  busy,
  onSelectStudent,
  onRepertoireChange,
  onReportMonthChange,
  onUpdateRepertoire,
}: StudioStudentDossierProps) {
  return (
    <section className="studio-record-workarea" aria-labelledby="dossier-title">
      <div className="studio-card-head">
        <div>
          <h2 id="dossier-title">Student dossiers</h2>
          <p>
            Personal details and song lists shown only when present in the
            scoped studio payload.
          </p>
        </div>
        <BookOpen size={17} color="#6a9d7b" aria-hidden="true" />
      </div>
      {students.length > 0 && selectedChild ? (
        <div className="studio-card-body">
          <div className="studio-field studio-student-picker">
            <label htmlFor="studio-student-select">Student</label>
            <select
              id="studio-student-select"
              value={selectedChild.id}
              onChange={(event) => onSelectStudent(event.target.value)}
              disabled={recording}
            >
              {students.map((student) => (
                <option value={student.id} key={student.id}>
                  {studentName(student)}
                </option>
              ))}
            </select>
          </div>
          <div className="studio-student-list">
            {[selectedChild].map((student) => {
              const name = studentName(student);
              const timezone = studentTimezone(
                student,
                data.profile.timezone ?? "UTC"
              );
              const age = ageOn(dateOfBirth(student), serverNowDate, timezone);
              const songsDone = songsSummary(student.payload, [
                "songsDone",
                "songs_done",
              ]);
              const songsToDo = songsSummary(student.payload, [
                "songsToDo",
                "songs_to_do",
              ]);
              const streak = completedPracticeStreak(
                data.practice,
                student.id,
                timezone,
                serverNowDate
              );
              const month = reportMonths[student.id] ?? monthDefault;
              const avatar = avatarId(student);
              return (
                <article className="studio-student" key={student.id}>
                  <div className="studio-student-top">
                    <div className="studio-student-identity">
                      <span className="studio-avatar">
                        {avatar ? (
                          <img
                            src={`/api/files?id=${encodeURIComponent(avatar)}`}
                            alt=""
                          />
                        ) : (
                          initials(name)
                        )}
                      </span>
                      <div>
                        <h3>{name}</h3>
                        <div className="studio-student-meta">
                          <span>
                            {dateOfBirth(student)
                              ? `Born ${dateOfBirth(student)}`
                              : "Birth date not on file"}
                          </span>
                          {age !== null && <span>{age} years old</span>}
                          <span>{streak} day completed-practice streak</span>
                        </div>
                      </div>
                    </div>
                    <span className="studio-status">
                      {activeStudentIds.has(student.id)
                        ? "Practice active"
                        : "No active timer"}
                    </span>
                  </div>
                  {(songsDone !== null || songsToDo !== null) && (
                    <div className="studio-songs">
                      {songsDone !== null && (
                        <div>
                          <strong>Songs done</strong>
                          {songsDone}
                        </div>
                      )}
                      {songsToDo !== null && (
                        <div>
                          <strong>Songs to do</strong>
                          {songsToDo}
                        </div>
                      )}
                    </div>
                  )}
                  {canEditRepertoire && (
                    <div className="studio-repertoire">
                      <div className="studio-field">
                        <label htmlFor={`song-${student.id}`}>
                          Song title · 2–150 characters
                        </label>
                        <input
                          id={`song-${student.id}`}
                          minLength={2}
                          maxLength={150}
                          value={repertoireDrafts[student.id] ?? ""}
                          onChange={(event) =>
                            onRepertoireChange(student.id, event.target.value)
                          }
                        />
                      </div>
                      <div className="studio-control-row">
                        <button
                          type="button"
                          className="family-button"
                          onClick={() =>
                            void onUpdateRepertoire(student, "plan")
                          }
                          disabled={busy === `repertoire:${student.id}`}
                        >
                          <BookOpen size={13} /> Add to plan
                        </button>
                        <button
                          type="button"
                          className="family-button primary"
                          onClick={() =>
                            void onUpdateRepertoire(student, "complete")
                          }
                          disabled={busy === `repertoire:${student.id}`}
                        >
                          <Check size={13} /> Mark complete
                        </button>
                      </div>
                    </div>
                  )}
                  {data.repertoire.filter(
                    (event) => event.student_id === student.id
                  ).length > 0 && (
                    <div className="studio-repertoire-log">
                      <strong>Repertoire audit</strong>
                      {data.repertoire
                        .filter((event) => event.student_id === student.id)
                        .slice()
                        .sort((a, b) =>
                          b.created_at.localeCompare(a.created_at)
                        )
                        .slice(0, 5)
                        .map((event, index) => (
                          <small
                            key={`${event.student_id}:${event.created_at}:${index}`}
                          >
                            {event.song} ·{" "}
                            {event.operation === "plan"
                              ? "planned"
                              : "completed"}{" "}
                            · {formatDate(event.created_at, timezone)} ·
                            educator {event.educator_id}
                          </small>
                        ))}
                    </div>
                  )}
                  <div className="studio-student-actions">
                    <Link className="family-button" href="/learning">
                      <BookOpen size={13} /> Student notebook
                    </Link>
                    <label className="family-button studio-report-picker">
                      Monthly PDF{" "}
                      <input
                        aria-label={`Progress report month for ${name}`}
                        type="month"
                        value={month}
                        onChange={(event) => {
                          if (/^\d{4}-\d{2}$/.test(event.target.value))
                            onReportMonthChange(student.id, event.target.value);
                        }}
                      />
                    </label>
                    <a
                      className="family-button"
                      href={`/api/reports?kind=progress&id=${encodeURIComponent(
                        student.id
                      )}&month=${encodeURIComponent(month)}`}
                    >
                      <FileText size={13} /> Download progress
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="studio-empty">
          <strong>No student records in this account</strong>
          Student-specific practice and evaluation tools will appear here when a
          student record is available.
        </div>
      )}
    </section>
  );
}
