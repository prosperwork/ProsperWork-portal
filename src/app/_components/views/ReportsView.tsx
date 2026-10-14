"use client";

import type { ReactNode } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
} from "lucide-react";
import {
  Empty,
  niceDate,
  SectionTitle,
  timeAt,
} from "../../_lib/portal-formatters";
import type { AcademyData } from "@/lib/types";

export default function ReportsView({
  data,
  query,
  searchBar,
  superAdmin,
  notify,
}: {
  data: AcademyData;
  query: string;
  searchBar: (placeholder: string) => ReactNode;
  superAdmin: boolean;
  notify: (msg: string) => void;
}) {
  const events = data.audit.filter((event) =>
    `${event.actor} ${event.record} ${event.action} ${event.detail}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const completed = data.lessons.filter(
    (lesson) => lesson.status === "completed"
  ).length;
  const verifiedRate = data.lessons.length
    ? Math.round((completed / data.lessons.length) * 100)
    : 0;

  return (
    <>
      <div className="toolbar">
        {searchBar("Search audit records")}
        {superAdmin && (
          <button
            className="btn ghost"
            onClick={() =>
              notify(
                "Report export integration is not configured. Audit records remain available below."
              )
            }
          >
            <ArrowDownRight size={14} />
            Export report
          </button>
        )}
      </div>
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            Lesson completion{" "}
            <span className="stat-icon">
              <CheckCircle2 size={15} />
            </span>
          </div>
          <div className="stat-value">{verifiedRate}%</div>
          <div className="stat-foot">
            {completed} verified of {data.lessons.length} lesson records
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Audit entries{" "}
            <span className="stat-icon">
              <ClipboardList size={15} />
            </span>
          </div>
          <div className="stat-value">{data.audit.length}</div>
          <div className="stat-foot">Append-only operational history</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Unverified lessons{" "}
            <span className="stat-icon">
              <FileCheck2 size={15} />
            </span>
          </div>
          <div className="stat-value">
            {
              data.lessons.filter((lesson) => lesson.status === "teacher_done")
                .length
            }
          </div>
          <div className="stat-foot">
            Teacher marked done; admin review pending
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Learner retention signal{" "}
            <span className="stat-icon">
              <ArrowUpRight size={15} />
            </span>
          </div>
          <div className="stat-value">
            {
              data.students.filter((student) => student.status === "active")
                .length
            }
          </div>
          <div className="stat-foot">Active learner dossiers today</div>
        </div>
      </div>
      <section className="card section-card">
        <SectionTitle
          title="Change & verification trail"
          detail="Status changes create a new event; previous lesson history remains intact."
        />
        {events.length ? (
          events.map((event) => (
            <div className="audit-item" key={event.id}>
              <div className="audit-icon">
                <Activity size={14} />
              </div>
              <div>
                <strong>
                  {event.action} · {event.record}
                </strong>
                <p>{event.detail}</p>
                <p>{event.actor}</p>
              </div>
              <time>
                {niceDate(event.at)}
                <br />
                {timeAt(event.at)}
              </time>
            </div>
          ))
        ) : (
          <Empty
            title="No matching audit entry"
            detail="Try a broader search."
          />
        )}
      </section>
      <section className="card section-card" style={{ marginTop: 15 }}>
        <SectionTitle
          title="Operational health"
          detail="Practical early signals for a growing academy."
        />
        <div className="metric-row">
          <span>Trial handoffs awaiting a response</span>
          <strong>
            {
              data.leads.filter((lead) =>
                ["new", "trial_requested"].includes(lead.status)
              ).length
            }
          </strong>
        </div>
        <div className="metric-row">
          <span>Families without social consent</span>
          <strong>
            {data.students.filter((student) => !student.consent).length}
          </strong>
        </div>
        <div className="metric-row">
          <span>Homework awaiting teacher review</span>
          <strong>
            {data.homework.filter((task) => task.status === "submitted").length}
          </strong>
        </div>
        <div className="metric-row">
          <span>Receipts needing verification</span>
          <strong>
            {
              data.payments.filter(
                (payment) => payment.status === "receipt_uploaded"
              ).length
            }
          </strong>
        </div>
      </section>
    </>
  );
}
