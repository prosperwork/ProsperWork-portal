"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  FileText,
  LoaderCircle,
  Music2,
  Plus,
} from "lucide-react";
import { PortalModal } from "@/app/_components/PortalModal";
import {
  ageOn,
  avatarId,
  completedPracticeStreak,
  dateOfBirth,
  formatDate,
  initials,
  studentName,
  studentTimezone,
  textValue,
  type Payload,
  type StudentRow,
  type StudioData,
} from "../studio-types";

function extractSongsList(payload: Payload, keys: string[]): string[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value
        .map((item) =>
          typeof item === "string"
            ? item.trim()
            : item && typeof item === "object"
            ? textValue(item as Payload, "title", "name", "song") ?? ""
            : ""
        )
        .filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/[,;\n|]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export interface StudioStudentDossierProps {
  students: StudentRow[];
  selectedChild: StudentRow | null;
  activeStudentIds: Set<string>;
  data: StudioData;
  serverNowDate: Date;
  canEditRepertoire: boolean;
  reportMonths: Record<string, string>;
  monthDefault: string;
  busy: string;
  onReportMonthChange: (studentId: string, month: string) => void;
  onUpdateRepertoire: (
    student: StudentRow,
    operation: "plan" | "complete",
    songTitle: string
  ) => Promise<boolean>;
}

export default function StudioStudentDossier({
  students,
  selectedChild,
  activeStudentIds,
  data,
  serverNowDate,
  canEditRepertoire,
  reportMonths,
  monthDefault,
  busy,
  onReportMonthChange,
  onUpdateRepertoire,
}: StudioStudentDossierProps) {
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [newSongTitle, setNewSongTitle] = useState("");
  const [completingSong, setCompletingSong] = useState<string | null>(null);

  if (students.length === 0 || !selectedChild) {
    return (
      <section
        className="studio-record-workarea"
        aria-labelledby="dossier-title"
      >
        <div className="studio-card-head">
          <div>
            <h2 id="dossier-title">Repertoire &amp; Student Profile</h2>
            <p>Track songs in progress, completed pieces, and monthly reports.</p>
          </div>
          <BookOpen size={17} color="#6a9d7b" aria-hidden="true" />
        </div>
        <div className="studio-empty">
          <strong>No student records available</strong>
          Student practice and repertoire details will appear here once linked.
        </div>
      </section>
    );
  }

  const student = selectedChild;
  const name = studentName(student);
  const timezone = studentTimezone(student, data.profile.timezone ?? "UTC");
  const age = ageOn(dateOfBirth(student), serverNowDate, timezone);
  const songsDoneList = extractSongsList(student.payload, [
    "songsDone",
    "songs_done",
  ]);
  const songsToDoList = extractSongsList(student.payload, [
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
  const isRepertoireBusy = busy === `repertoire:${student.id}`;
  const recentAudit = data.repertoire
    .filter((event) => event.student_id === student.id)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const handleAddSong = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onUpdateRepertoire(student, "plan", newSongTitle.trim());
    if (ok) {
      setNewSongTitle("");
      setAddSongOpen(false);
    }
  };

  const handleMarkComplete = async (song: string) => {
    setCompletingSong(song);
    try {
      await onUpdateRepertoire(student, "complete", song);
    } finally {
      setCompletingSong(null);
    }
  };

  return (
    <>
      <section
        className="studio-record-workarea"
        aria-labelledby="dossier-title"
      >
        <div className="studio-card-head">
          <div>
            <h2 id="dossier-title">Repertoire &amp; Student Overview</h2>
            <p>
              Manage songs in progress, celebrate completed pieces, and download
              monthly reports.
            </p>
          </div>
          {canEditRepertoire && (
            <button
              type="button"
              className="family-button primary"
              onClick={() => {
                setNewSongTitle("");
                setAddSongOpen(true);
              }}
              disabled={isRepertoireBusy}
            >
              <Plus size={14} aria-hidden="true" /> Add Song
            </button>
          )}
        </div>

        <div className="studio-card-body">
          <article className="studio-student">
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
                    <span>{streak}-day practice streak</span>
                  </div>
                </div>
              </div>
              <span className="studio-status">
                {activeStudentIds.has(student.id)
                  ? "Practice active"
                  : "No active timer"}
              </span>
            </div>

            {/* Interactive Songs To Do & Songs Done */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
                marginTop: 14,
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #dce7df",
                  background: "#f7faf8",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <strong style={{ fontSize: 12, color: "#0c3527" }}>
                    Songs to do ({songsToDoList.length})
                  </strong>
                </div>
                {songsToDoList.length > 0 ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    {songsToDoList.map((song) => {
                      const isThisCompleting =
                        isRepertoireBusy && completingSong === song;
                      return (
                        <div
                          key={song}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            padding: "7px 10px",
                            borderRadius: 8,
                            background: "#fffefa",
                            border: "1px solid #e4ece5",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12.5,
                              color: "#183128",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              minWidth: 0,
                              wordBreak: "break-word",
                            }}
                          >
                            <Music2
                              size={12}
                              color="#175b45"
                              style={{ flexShrink: 0 }}
                              aria-hidden="true"
                            />
                            {song}
                          </span>
                          {canEditRepertoire && (
                            <button
                              type="button"
                              className="family-button"
                              style={{
                                minHeight: 28,
                                padding: "0 9px",
                                fontSize: 11,
                                flexShrink: 0,
                              }}
                              disabled={isRepertoireBusy}
                              onClick={() => void handleMarkComplete(song)}
                            >
                              {isThisCompleting ? (
                                <>
                                  <LoaderCircle size={11} /> Saving…
                                </>
                              ) : (
                                <>
                                  <Check size={11} /> Mark Complete
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: "#617469" }}>
                    No pieces currently in the practice plan.
                  </p>
                )}
              </div>

              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #dce7df",
                  background: "#f7faf8",
                }}
              >
                <strong
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#0c3527",
                    marginBottom: 8,
                  }}
                >
                  Songs completed ({songsDoneList.length})
                </strong>
                {songsDoneList.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {songsDoneList.map((song) => (
                      <span
                        key={song}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "5px 10px",
                          borderRadius: 999,
                          background: "#dcfce7",
                          color: "#166534",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <Check size={11} aria-hidden="true" /> {song}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: "#617469" }}>
                    Completed pieces will be celebrated here.
                  </p>
                )}
              </div>
            </div>

            {recentAudit.length > 0 && (
              <div className="studio-repertoire-log" style={{ marginTop: 12 }}>
                <strong>Recent repertoire activity</strong>
                {recentAudit.map((event, index) => (
                  <small
                    key={`${event.student_id}:${event.created_at}:${index}`}
                  >
                    {event.song} ·{" "}
                    {event.operation === "plan" ? "added to plan" : "completed"}{" "}
                    · {formatDate(event.created_at, timezone)} ·{" "}
                    {event.educator_id === data.profile.id
                      ? data.profile.name
                      : event.educator_id
                      ? "Educator"
                      : "Academy"}
                  </small>
                ))}
              </div>
            )}

            <div className="studio-student-actions">
              <Link className="family-button" href="/learning">
                <BookOpen size={13} /> Lesson Notebook
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
                <FileText size={13} /> Download Progress
              </a>
            </div>
          </article>
        </div>
      </section>

      <PortalModal
        open={addSongOpen}
        onClose={() => {
          if (!isRepertoireBusy) setAddSongOpen(false);
        }}
        eyebrow={name}
        title="Add Song to Practice Plan"
        subtitle="Add a new piece or exercise for this student to work on."
        size="sm"
        busy={isRepertoireBusy}
      >
        <form onSubmit={(event) => void handleAddSong(event)}>
          <div className="studio-field">
            <label htmlFor="modal-song-title">Song title</label>
            <input
              id="modal-song-title"
              minLength={2}
              maxLength={150}
              required
              placeholder="e.g. Für Elise (Beethoven)"
              value={newSongTitle}
              onChange={(event) => setNewSongTitle(event.target.value)}
            />
            <small>2–150 characters.</small>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setAddSongOpen(false)}
              disabled={isRepertoireBusy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="family-button primary"
              disabled={isRepertoireBusy || newSongTitle.trim().length < 2}
            >
              {isRepertoireBusy ? (
                <>
                  <LoaderCircle size={13} /> Adding…
                </>
              ) : (
                <>
                  <Plus size={13} /> Add to plan
                </>
              )}
            </button>
          </div>
        </form>
      </PortalModal>
    </>
  );
}
