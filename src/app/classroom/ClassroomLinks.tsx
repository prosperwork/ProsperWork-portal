"use client";
import type { Lesson } from "@/lib/types";
import { Video } from "lucide-react";

export default function ClassroomLinks({ lessons }: { lessons: Lesson[] }) {
  const now = Date.now();
  const upcoming = lessons.filter(lesson =>
    ["scheduled", "teacher_done", "completed"].includes(lesson.status) &&
    Date.parse(lesson.startsAt) + 6 * 3600000 > now
  ).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 10);
  if (!upcoming.length) return null;
  return <section className="card section-card" style={{ marginBottom: 16 }}>
    <h2 style={{ margin: "0 0 8px" }}>Live classrooms</h2>
    <p className="table-small">Join inside ProsperWork. Each room checks your assignment and the academy’s permitted join window.</p>
    {upcoming.map(lesson => <div className="follow-row" key={lesson.id}>
      <div className="follow-copy"><strong>{lesson.studentName} · {lesson.title}</strong>
        <span>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: lesson.studentTimezone }).format(new Date(lesson.startsAt))} · {lesson.studentTimezone}</span>
      </div>
      <a className="btn secondary small" href={`/classroom?lessonId=${encodeURIComponent(lesson.id)}`}><Video size={14} />Classroom</a>
    </div>)}
  </section>;
}
