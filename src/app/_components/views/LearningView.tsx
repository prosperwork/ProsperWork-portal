"use client";

import type { ReactNode } from "react";
import { Baby, BookOpen, CheckCircle2, Music2 } from "lucide-react";
import {
  Empty,
  niceDate,
  Pill,
  SectionTitle,
} from "../../_lib/portal-formatters";
import type { FormKind } from "../modals/ActionModal";
import type {
  AcademyData,
  HomeworkItem,
  Lesson,
  Role,
  Student,
} from "@/lib/types";

export default function LearningView({
  data,
  role,
  query,
  searchBar,
  studentsVisible,
  selectedStudentId,
  visibleLessons,
  parentAccess,
  teacherAccess,
  superAdmin,
  qcOwnLessonIds,
  headerActions,
  enterKidMode,
  advanceSong,
  setHomeworkStatus,
}: {
  data: AcademyData;
  role: Role;
  query: string;
  searchBar: (placeholder: string) => ReactNode;
  studentsVisible: Student[];
  selectedStudentId: string;
  visibleLessons: Lesson[];
  parentAccess: boolean;
  teacherAccess: boolean;
  superAdmin: boolean;
  qcOwnLessonIds: Set<string>;
  headerActions: (label: string, kind: FormKind) => ReactNode;
  enterKidMode: () => void;
  advanceSong: (student: Student, song: string) => void;
  setHomeworkStatus: (
    item: HomeworkItem,
    status: HomeworkItem["status"]
  ) => void;
}) {
  const statusButton = (label: string, onClick: () => void, tone = "ghost") => (
    <button className={`btn small ${tone}`} onClick={onClick}>
      {label}
    </button>
  );

  const relevantHomework =
    parentAccess || role === "qc"
      ? data.homework.filter((item) =>
          studentsVisible.some((student) => student.id === item.studentId)
        )
      : role === "teacher"
      ? data.homework.filter((item) => item.teacherName === "Daniel Adebayo")
      : data.homework;
  const student =
    parentAccess || role === "qc"
      ? studentsVisible[0]
      : data.students.find((item) => item.id === selectedStudentId) ||
        data.students[0];
  const homework = relevantHomework.filter((item) =>
    `${item.studentName} ${item.title} ${item.status}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const lessonNotes = visibleLessons.filter(
    (lesson) =>
      (role !== "qc" || qcOwnLessonIds.has(lesson.id)) &&
      (lesson.notes || lesson.nextTopics)
  );

  return (
    <>
      <div className="toolbar">
        {searchBar("Search practice, lesson notes or learner")}
        {teacherAccess && headerActions("Assign homework", "homework")}
        {parentAccess && (
          <button className="btn secondary" onClick={enterKidMode}>
            <Baby size={14} />
            Kid Mode
          </button>
        )}
      </div>
      {student && (
        <div className="grid-main">
          <div className="stack">
            <section className="card section-card">
              <SectionTitle
                title="Practice notebook & song bank"
                detail={`${student.name} · ${student.rank} · keep the next lesson connected to today's practice.`}
              />
              <div className="split-cards">
                <div>
                  <div className="resource-type">
                    Songs learned · {student.songsDone.length}
                  </div>
                  {student.songsDone.map((song) => (
                    <div className="metric-row" key={song}>
                      <span>
                        <CheckCircle2 size={13} />
                        {song}
                      </span>
                      <Pill tone="green">learned</Pill>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="resource-type">
                    On deck · choose one to celebrate
                  </div>
                  {student.songsToDo.length ? (
                    student.songsToDo.map((song) => (
                      <div className="metric-row" key={song}>
                        <span>{song}</span>
                        {(parentAccess || role === "teacher" || superAdmin) &&
                          statusButton(
                            "Mark learned",
                            () => advanceSong(student, song),
                            "secondary"
                          )}
                      </div>
                    ))
                  ) : (
                    <p className="table-small">
                      No songs waiting. Choose a song from the library.
                    </p>
                  )}
                </div>
              </div>
              <div className="progress-wrap" style={{ marginTop: 16 }}>
                <div className="progress">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        (student.songsDone.length / 8) * 100
                      )}%`,
                    }}
                  />
                </div>
                <span className="progress-num">
                  {student.rank} · {student.songsDone.length}/8 to Master
                </span>
              </div>
            </section>
            <section className="card section-card">
              <SectionTitle
                title="Homework & practice"
                detail="Structured task · due date · submit trail · teacher review."
              />
              {homework.map((task) => (
                <div className="lesson-row" key={task.id}>
                  <div className="lesson-time">{niceDate(task.dueDate)}</div>
                  <div>
                    <div className="lesson-person">
                      {task.title}{" "}
                      <span className="lesson-meta">· {task.studentName}</span>
                    </div>
                    <div className="lesson-meta">
                      {task.note || "No extra guidance"}
                      {task.mediaName && ` · attached ${task.mediaName}`}
                    </div>
                  </div>
                  <div className="row-actions">
                    <Pill>{task.status}</Pill>
                    {parentAccess &&
                      task.status === "assigned" &&
                      statusButton(
                        "Submit work",
                        () => setHomeworkStatus(task, "submitted"),
                        "secondary"
                      )}
                    {teacherAccess &&
                      task.status === "submitted" &&
                      statusButton(
                        "Review",
                        () => setHomeworkStatus(task, "reviewed"),
                        "secondary"
                      )}
                  </div>
                </div>
              ))}
              {!homework.length && (
                <Empty
                  title="Practice is clear"
                  detail="New teacher assignments appear here."
                />
              )}
            </section>
          </div>
          <div className="stack">
            <section className="card section-card">
              <SectionTitle
                title="Lesson continuity notes"
                detail="Last lesson · upcoming topic · verification."
              />
              {lessonNotes.map((lesson) => (
                <div className="follow-row" key={lesson.id}>
                  <div className="audit-icon">
                    <BookOpen size={14} />
                  </div>
                  <div className="follow-copy">
                    <strong>
                      {lesson.studentName} · {lesson.title}
                    </strong>
                    <span>
                      {lesson.notes || "No session note yet."}
                      {lesson.nextTopics && ` Next: ${lesson.nextTopics}`}
                    </span>
                    {lesson.verification && (
                      <span>
                        Verified by {lesson.verification.admin} on{" "}
                        {niceDate(lesson.verification.at)}.
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {!lessonNotes.length && (
                <Empty
                  title="The next note starts here"
                  detail="Teachers can add lesson notes from the schedule."
                />
              )}
            </section>
            <section className="card section-card">
              <SectionTitle
                title="Resources to try next"
                detail={`${student.instrument} · ${student.rank}`}
              />
              {data.resources
                .filter(
                  (resource) =>
                    resource.instrument === student.instrument ||
                    resource.type === "song"
                )
                .slice(0, 3)
                .map((resource) => (
                  <div className="follow-row" key={resource.id}>
                    <div className="audit-icon">
                      <Music2 size={14} />
                    </div>
                    <div className="follow-copy">
                      <strong>{resource.title}</strong>
                      <span>{resource.summary}</span>
                    </div>
                  </div>
                ))}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
