"use client";

import { useState, useEffect } from "react";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  HeartHandshake,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  Users,
} from "lucide-react";
import type { ComplaintRecord } from "@/lib/academy/complaints";
import ProfileAvatar from "../ProfileAvatar";
import BrandEmblem from "../BrandEmblem";
import {
  birthdayDaysAway,
  Empty,
  formatMoney,
  niceDate,
  Pill,
  SectionTitle,
  timeAt,
  todayKey,
} from "../../_lib/portal-formatters";
import type {
  AcademyData,
  AppView,
  Currency,
  Lesson,
  Role,
  Student,
} from "@/lib/types";

export default function OverviewView({
  data,
  role,
  visibleLessons,
  studentsVisible,
  ownTimezone,
  financeAccess,
  superAdmin,
  fx,
  changeView,
  notify,
}: {
  data: AcademyData;
  role: Role;
  visibleLessons: Lesson[];
  studentsVisible: Student[];
  ownTimezone: string;
  financeAccess: boolean;
  superAdmin: boolean;
  fx: Record<Currency, number>;
  changeView: (view: AppView) => void;
  notify: (msg: string) => void;
}) {
  const [activeBirthdayStudentId, setActiveBirthdayStudentId] = useState<
    string | null
  >(null);
  const [birthdayTributes, setBirthdayTributes] = useState<
    Record<string, string>
  >({});
  const [birthdayLoadingId, setBirthdayLoadingId] = useState<string | null>(
    null
  );
  const [copiedBirthdayId, setCopiedBirthdayId] = useState<string | null>(null);

  const generateOverviewTribute = async (studentId: string) => {
    setActiveBirthdayStudentId(studentId);
    if (birthdayTributes[studentId]) return;
    setBirthdayLoadingId(studentId);
    try {
      const res = await fetch("/api/ai/birthday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      const resData = await res.json();
      if (!res.ok)
        throw new Error(resData.error || "Failed to generate tribute");
      if (resData.tribute)
        setBirthdayTributes((prev) => ({
          ...prev,
          [studentId]: resData.tribute,
        }));
    } catch (e: unknown) {
      notify(
        e instanceof Error
          ? e.message
          : "Failed to generate AI birthday tribute."
      );
    } finally {
      setBirthdayLoadingId(null);
    }
  };

  const copyOverviewTribute = async (studentId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBirthdayId(studentId);
      setTimeout(() => setCopiedBirthdayId(null), 3000);
    } catch {
      notify("Could not copy to clipboard.");
    }
  };

  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/complaints")
      .then((res) => res.json())
      .then((resData) => {
        if (
          isMounted &&
          resData.complaints &&
          Array.isArray(resData.complaints)
        ) {
          setComplaints(resData.complaints);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const openComplaints = complaints.filter((c) => c.status !== "resolved");

  const todays = visibleLessons.filter(
    (lesson) =>
      new Date(lesson.startsAt).toISOString().slice(0, 10) === todayKey()
  );
  const due = data.payments.filter(
    (payment) => payment.status === "due"
  ).length;
  const openLeads = data.leads.filter(
    (lead) => !["converted", "winback"].includes(lead.status)
  ).length;
  const completion = data.students.length
    ? Math.round(
        (data.students.reduce(
          (sum, student) =>
            sum + student.lessonsTaken / Math.max(student.monthlyLessons, 1),
          0
        ) /
          data.students.length) *
          100
      )
    : 0;
  const attention = [
    ...openComplaints.map((c) => ({
      title: `Resolve complaint: ${c.subject}`,
      sub: `${c.parent_name} · ${c.urgency.toUpperCase()} urgency · ${
        c.ticket_number
      }`,
      tone: "red" as const,
      link: "/complaints",
    })),
    ...data.leads
      .filter((lead) => lead.status === "new")
      .map((lead) => ({
        title: `Reply to ${lead.parentName}`,
        sub: `${lead.childName} · enquiry received ${niceDate(lead.arrivedAt)}`,
        tone: "amber" as const,
        link: undefined as string | undefined,
      })),
    ...data.payments
      .filter((payment) => payment.status === "receipt_uploaded")
      .map((payment) => ({
        title: `Verify ${payment.parentName}'s receipt`,
        sub: `${payment.studentName} · ${formatMoney(
          payment.amount,
          payment.currency
        )}`,
        tone: "blue" as const,
        link: undefined as string | undefined,
      })),
    ...data.students
      .filter((student) => !student.consent)
      .map((student) => ({
        title: `Consent check · ${student.name}`,
        sub: `${student.parentName} · family setting needs review`,
        tone: "red" as const,
        link: undefined as string | undefined,
      })),
  ].slice(0, 6);
  const upcomingBirthdays = data.students
    .map((student) => ({
      student,
      days: birthdayDaysAway(student.dob, student.timezone || ownTimezone),
    }))
    .filter((item) => item.days >= 0 && item.days <= 7)
    .sort((a, b) => a.days - b.days);

  return (
    <>
      {openComplaints.length > 0 && (
        <div
          style={{
            marginBottom: "18px",
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: "12px",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "#ffe4e6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e11d48",
                flexShrink: 0,
              }}
            >
              <AlertCircle size={20} />
            </div>
            <div>
              <div
                style={{ fontWeight: 600, color: "#9f1239", fontSize: "14px" }}
              >
                {openComplaints.length} Parent Complaint
                {openComplaints.length > 1 ? "s" : ""} Awaiting Review &
                Resolution
              </div>
              <div
                style={{ fontSize: "12px", color: "#be123c", marginTop: "2px" }}
              >
                Latest: {openComplaints[0].parent_name} · &ldquo;
                {openComplaints[0].subject}&rdquo; (
                {openComplaints[0].urgency.toUpperCase()})
              </div>
            </div>
          </div>
          <a
            href="/complaints"
            className="btn small primary"
            style={{
              background: "#e11d48",
              borderColor: "#e11d48",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            Open Complaints Desk <ChevronRight size={14} />
          </a>
        </div>
      )}
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            Classes today{" "}
            <span className="stat-icon">
              <CalendarDays size={15} />
            </span>
          </div>
          <div className="stat-value">
            {todays.length.toString().padStart(2, "0")}
          </div>
          <div className="stat-foot">
            Across {new Set(todays.map((lesson) => lesson.teacherName)).size}{" "}
            teachers · timezones attached
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Active learners{" "}
            <span className="stat-icon">
              <Users size={15} />
            </span>
          </div>
          <div className="stat-value">
            {
              data.students.filter((student) => student.status === "active")
                .length
            }
          </div>
          <div className="stat-foot">
            {data.students.filter((student) => !student.consent).length} consent
            checks to follow up
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Open family handoffs{" "}
            <span className="stat-icon">
              <HeartHandshake size={15} />
            </span>
          </div>
          <div className="stat-value">{openLeads}</div>
          <div className="stat-foot">
            {
              data.leads.filter(
                (lead) =>
                  lead.status === "trial_requested" ||
                  lead.status === "trial_booked"
              ).length
            }{" "}
            trials in motion
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            {financeAccess ? "Receipts to verify" : "Lesson progress"}{" "}
            <span className="stat-icon">
              <FileCheck2 size={15} />
            </span>
          </div>
          <div className="stat-value">
            {financeAccess
              ? data.payments.filter(
                  (payment) => payment.status === "receipt_uploaded"
                ).length
              : `${completion}%`}
          </div>
          <div className="stat-foot">
            {financeAccess
              ? `${due} balances currently due`
              : "Monthly plan completed on average"}
          </div>
        </div>
      </div>

      <div className="grid-main">
        <div className="stack">
          <section className="card section-card">
            <SectionTitle
              title="Today's teaching board"
              detail={`${todays.length} classes · WAT and family time shown side by side`}
              action={
                <button
                  className="subtle-link"
                  onClick={() => changeView("schedule")}
                >
                  Open schedule <ChevronRight size={12} />
                </button>
              }
            />
            {todays.length ? (
              todays
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                .map((lesson) => (
                  <div className="lesson-row" key={lesson.id}>
                    <div className="lesson-time">
                      {timeAt(lesson.startsAt, "Africa/Lagos")}
                      <small> WAT</small>
                    </div>
                    <div>
                      <div className="lesson-person">
                        {lesson.studentName}
                        <span className="lesson-meta"> · {lesson.title}</span>
                      </div>
                      <div className="lesson-meta">
                        {lesson.teacherName} · {lesson.instrument} ·{" "}
                        {timeAt(lesson.startsAt, lesson.studentTimezone)} family
                        time
                      </div>
                    </div>
                    <Pill>{lesson.status.replace("_", " ")}</Pill>
                  </div>
                ))
            ) : (
              <Empty
                title="A little space in today's diary"
                detail="Schedule a class or look ahead to the week."
              />
            )}
          </section>
          <section className="card section-card">
            <SectionTitle
              title="Learner continuity"
              detail="Monthly plan progress · the next lesson should always know the last one."
              action={
                <button
                  className="subtle-link"
                  onClick={() => changeView("families")}
                >
                  All learners <ChevronRight size={12} />
                </button>
              }
            />
            {studentsVisible.slice(0, 5).map((student) => (
              <div className="follow-row" key={student.id}>
                <ProfileAvatar name={student.name} size={32} />
                <div className="follow-copy">
                  <strong>
                    {student.name}{" "}
                    <span style={{ color: "var(--muted)", fontWeight: 500 }}>
                      · {student.instrument}
                    </span>
                  </strong>
                  <span>
                    {student.teacherName} · next:{" "}
                    {student.songsToDo[0] || "choose a new song"} ·{" "}
                    {student.rank}
                  </span>
                  <div className="progress-wrap" style={{ marginTop: 8 }}>
                    <div className="progress">
                      <span
                        style={{
                          width: `${Math.min(
                            100,
                            (student.lessonsTaken /
                              Math.max(1, student.monthlyLessons)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="progress-num">
                      {student.lessonsTaken}/{student.monthlyLessons}
                    </span>
                  </div>
                </div>
                <Pill tone={student.consent ? "green" : "amber"}>
                  {student.consent ? "consent on file" : "consent check"}
                </Pill>
              </div>
            ))}
            {!studentsVisible.length && (
              <div className="continuity-empty">
                <BrandEmblem className="continuity-empty-emblem" />
                <div>
                  <strong>No learner records yet</strong>
                  <span>
                    New learner continuity will appear here when records are
                    available.
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="card section-card">
            <SectionTitle
              title="Birthday radar · next 7 days"
              detail="Student milestones, AI celebration tributes and certificates."
              action={
                <a className="subtle-link" href="/studio">
                  Open Studio <ChevronRight size={12} />
                </a>
              }
            />
            {upcomingBirthdays.length ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {upcomingBirthdays.map(({ student, days }) => {
                  const isSelected = activeBirthdayStudentId === student.id;
                  const tribute = birthdayTributes[student.id];
                  const isCopied = copiedBirthdayId === student.id;
                  return (
                    <div
                      key={student.id}
                      style={{
                        padding: "10px 12px",
                        border: "1px solid #e6ece4",
                        borderRadius: "9px",
                        background: "#fcfdf9",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <strong>
                            {student.name}{" "}
                            <span
                              style={{
                                color: "var(--muted)",
                                fontWeight: 500,
                              }}
                            >
                              · {student.instrument}
                            </span>
                          </strong>
                          <div
                            style={{
                              fontSize: "11px",
                              color: days === 0 ? "#b45309" : "#4b5563",
                              fontWeight: days === 0 ? 600 : 400,
                              marginTop: 2,
                            }}
                          >
                            {days === 0
                              ? "🎂 Birthday today!"
                              : days === 1
                              ? "Tomorrow"
                              : `In ${days} days`}{" "}
                            · Teacher: {student.teacherName}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            className="btn small secondary"
                            onClick={() =>
                              void generateOverviewTribute(student.id)
                            }
                            disabled={birthdayLoadingId === student.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {birthdayLoadingId === student.id ? (
                              <>
                                <LoaderCircle size={12} className="spin" />{" "}
                                Composing…
                              </>
                            ) : (
                              <>
                                <Sparkles size={12} color="#d97706" /> AI
                                Tribute
                              </>
                            )}
                          </button>
                          <a
                            className="btn small ghost"
                            href={`/api/reports?kind=birthday&id=${encodeURIComponent(
                              student.id
                            )}`}
                          >
                            <FileText size={12} /> PDF Card
                          </a>
                        </div>
                      </div>
                      {isSelected && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: "10px 12px",
                            background: "#fef9ee",
                            border: "1px solid #fde68a",
                            borderRadius: 8,
                            fontSize: 13,
                            color: "#78350f",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 6,
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Sparkles size={12} color="#d97706" /> AI Birthday
                              Tribute for {student.name}
                            </span>
                            <div style={{ display: "flex", gap: 6 }}>
                              {tribute && (
                                <>
                                  <button
                                    type="button"
                                    className="btn small primary"
                                    style={{
                                      padding: "2px 8px",
                                      fontSize: 11,
                                    }}
                                    onClick={() => {
                                      const cleanPhone = (
                                        student.parentEmail || ""
                                      ).replace(/\D/g, "");
                                      const targetUrl = cleanPhone
                                        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                                            tribute
                                          )}`
                                        : `https://wa.me/?text=${encodeURIComponent(
                                            tribute
                                          )}`;
                                      window.open(
                                        targetUrl,
                                        "_blank",
                                        "noopener,noreferrer"
                                      );
                                      notify(
                                        `WhatsApp draft opened for ${student.name}. Click Send in WhatsApp.`
                                      );
                                    }}
                                  >
                                    Send WhatsApp
                                  </button>
                                  <button
                                    type="button"
                                    className="btn small secondary"
                                    style={{
                                      padding: "2px 8px",
                                      fontSize: 11,
                                    }}
                                    onClick={() =>
                                      void copyOverviewTribute(
                                        student.id,
                                        tribute
                                      )
                                    }
                                  >
                                    {isCopied ? (
                                      <>
                                        <Check size={11} color="#059669" />{" "}
                                        Copied!
                                      </>
                                    ) : (
                                      "Copy text"
                                    )}
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="btn small ghost"
                                style={{ padding: "2px 8px", fontSize: 11 }}
                                onClick={() => setActiveBirthdayStudentId(null)}
                              >
                                Close
                              </button>
                            </div>
                          </div>
                          {birthdayLoadingId === student.id ? (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "6px 0",
                                color: "#b45309",
                              }}
                            >
                              <LoaderCircle size={13} className="spin" />{" "}
                              Generating musical tribute…
                            </div>
                          ) : tribute ? (
                            <p
                              style={{
                                margin: 0,
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.5,
                                fontStyle: "italic",
                              }}
                            >
                              {tribute}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty
                title="No birthdays in the next 7 days"
                detail="Upcoming student celebrations and tribute tools will appear here automatically."
              />
            )}
          </section>
          <section className="card section-card">
            <SectionTitle
              title="Follow-through queue"
              detail="The next right thing, before it becomes a missed handoff."
            />
            {attention.length ? (
              attention.map((item, index) =>
                item.link ? (
                  <a
                    key={`${item.title}-${index}`}
                    href={item.link}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
                    }}
                  >
                    <div className="follow-row" style={{ cursor: "pointer" }}>
                      <span
                        className="follow-mark"
                        style={{
                          background:
                            item.tone === "red"
                              ? "#b55751"
                              : item.tone === "blue"
                              ? "#6a8a98"
                              : undefined,
                        }}
                      />
                      <div className="follow-copy">
                        <strong>{item.title}</strong>
                        <span>{item.sub}</span>
                      </div>
                    </div>
                  </a>
                ) : (
                  <div className="follow-row" key={`${item.title}-${index}`}>
                    <span
                      className="follow-mark"
                      style={{
                        background:
                          item.tone === "red"
                            ? "#b55751"
                            : item.tone === "blue"
                            ? "#6a8a98"
                            : undefined,
                      }}
                    />
                    <div className="follow-copy">
                      <strong>{item.title}</strong>
                      <span>{item.sub}</span>
                    </div>
                  </div>
                )
              )
            ) : (
              <Empty
                title="Nothing waiting"
                detail="The follow-through queue is clear for now."
              />
            )}
          </section>
          {superAdmin || role === "general_manager" ? (
            <section className="card section-card">
              <SectionTitle
                title="Executive pulse"
                detail="Profit is visible only at Super Admin tier."
              />
              {superAdmin ? (
                <>
                  <div className="metric-row">
                    <span>Due, all currencies</span>
                    <strong>
                      {formatMoney(
                        data.payments
                          .filter((p) => p.status !== "paid")
                          .reduce(
                            (sum, p) => sum + p.amount * fx[p.currency],
                            0
                          ),
                        "NGN"
                      )}
                    </strong>
                  </div>
                  <div className="metric-row">
                    <span>Recorded expenses</span>
                    <strong>
                      {formatMoney(
                        data.expenses.reduce(
                          (sum, e) => sum + e.amount * fx[e.currency],
                          0
                        ),
                        "NGN"
                      )}
                    </strong>
                  </div>
                  <div className="metric-row">
                    <span>Complaints desk</span>
                    <a
                      href="/complaints"
                      style={{
                        textDecoration: "none",
                        color:
                          openComplaints.length > 0 ? "#e11d48" : "inherit",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {openComplaints.length > 0 ? (
                        <Pill tone="amber">
                          {openComplaints.length} open · Review desk &rarr;
                        </Pill>
                      ) : (
                        <span>
                          {complaints.length} total · View desk &rarr;
                        </span>
                      )}
                    </a>
                  </div>
                  <div className="metric-row">
                    <span>Profit visibility</span>
                    <Pill tone="green">Super Admin only</Pill>
                  </div>
                </>
              ) : (
                <div className="locked">
                  <LockKeyhole size={16} /> Executive profit and sensitive
                  financial totals are not in this tier.
                </div>
              )}
            </section>
          ) : (
            <section className="card section-card">
              <SectionTitle
                title="Next up"
                detail="A shared rhythm for students, families and teachers."
              />
              <div className="metric-row">
                <span>
                  <Clock3 size={13} /> Lessons still to verify
                </span>
                <strong>
                  {
                    data.lessons.filter(
                      (lesson) => lesson.status === "teacher_done"
                    ).length
                  }
                </strong>
              </div>
              <div className="metric-row">
                <span>
                  <BookOpen size={13} /> Practice tasks open
                </span>
                <strong>
                  {
                    data.homework.filter((task) => task.status !== "reviewed")
                      .length
                  }
                </strong>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
