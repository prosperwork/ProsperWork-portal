"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lesson } from "@/lib/types";

type HistoryEvent = { id: number; event: string; starts_at: string; created_at: string; actor_name: string; payload: Lesson };
type HistoryResponse = { events: HistoryEvent[]; total: number; months: string[] };
type Props = { studentId: string; studentName: string; timezone: string; parentView: boolean };
const pageSize = 25;

function currentMonth(timezone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat("en", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit" }).formatToParts(new Date()); }
  catch { parts = new Intl.DateTimeFormat("en", { timeZone: "UTC", year: "numeric", month: "2-digit" }).formatToParts(new Date()); }
  return `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`;
}
function dateTime(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  try { return new Intl.DateTimeFormat(undefined, { ...options, timeZone: timezone || "UTC" }).format(date); }
  catch { return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(date); }
}
function monthName(month: string, timezone: string) {
  const date = new Date(`${month}-01T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return month;
  try { return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: timezone || "UTC" }).format(date); }
  catch { return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(date); }
}
function eventName(value: string) { return value.replace(/_/g, " "); }

export default function LessonHistory({ studentId, studentName, timezone, parentView }: Props) {
  const ownerKey = `${studentId}|${timezone}`;
  const [month, setMonth] = useState("");
  const [monthOwner, setMonthOwner] = useState("");
  const [page, setPage] = useState(1);
  const [pageOwner, setPageOwner] = useState("");
  const [months, setMonths] = useState<string[]>([]);
  const [monthsKey, setMonthsKey] = useState("");
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const activeMonth = monthOwner === ownerKey && month ? month : currentMonth(timezone);
  const activePage = pageOwner === ownerKey ? page : 1;
  const requestKey = `${ownerKey}|${activeMonth}|${activePage}`;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const visible = loadedKey === requestKey;
  const options = useMemo(() => {
    const available = monthsKey === ownerKey ? months : [];
    return [...new Set([currentMonth(timezone), ...available])].sort((a, b) => b.localeCompare(a));
  }, [months, monthsKey, ownerKey, timezone]);

  useEffect(() => {
    setMonth(currentMonth(timezone));
    setMonthOwner(ownerKey);
    setPage(1);
    setPageOwner(ownerKey);
    setMonths([]);
    setMonthsKey("");
  }, [ownerKey, timezone]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setLoadedKey("");
    const query = new URLSearchParams({ studentId, month: activeMonth, page: String(activePage) });
    void fetch(`/api/lesson-history?${query.toString()}`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Lesson history could not be loaded.");
        return result as HistoryResponse;
      })
      .then(result => {
        if (controller.signal.aborted) return;
        setEvents(result.events);
        setTotal(result.total);
        setMonths(result.months);
        setMonthsKey(ownerKey);
        setLoadedKey(requestKey);
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Lesson history could not be loaded.");
        setErrorKey(requestKey);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [studentId, ownerKey, activeMonth, activePage, requestKey, retryCount]);

  const selectMonth = (value: string) => {
    setMonth(value); setMonthOwner(ownerKey); setPage(1); setPageOwner(ownerKey);
  };
  const changePage = (value: number) => { setPage(value); setPageOwner(ownerKey); };

  return <section className="card section-card" aria-labelledby={`lesson-history-${studentId}`}>
    <header className="section-title">
      <div><h2 id={`lesson-history-${studentId}`}>Class history</h2><p>A permanent month-by-month record for {studentName}.</p></div>
      <label className="field" style={{ minWidth: 150, gap: 5 }}><span style={{ fontSize: 9, fontWeight: 700 }}>Month</span>
        <select aria-label={`History month for ${studentName}`} value={activeMonth} onChange={event => selectMonth(event.target.value)}>
          {options.map(option => <option key={option} value={option}>{monthName(option, timezone)}</option>)}
        </select>
      </label>
    </header>
    {error && errorKey === requestKey && <div className="form-error" role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><span>{error}</span><button className="btn ghost small" type="button" onClick={() => setRetryCount(value => value + 1)}>Retry</button></div>}
    {loading && <div className="wf-history-loading" role="status" aria-label="Loading class history" style={{ display: "grid", gap: 12, padding: "4px 0 12px" }}><span className="skeleton-line" style={{ display: "block", width: "100%" }} /><span className="skeleton-line" style={{ display: "block", width: "100%" }} /><span className="skeleton-line short" style={{ display: "block" }} /></div>}
    {!loading && !(error && errorKey === requestKey) && visible && (events.length ? <div className="table-wrap"><table style={{ minWidth: 620 }}>
      <thead><tr><th>Class time</th><th>Record</th><th>Teacher / notes</th><th>Logged</th></tr></thead>
      <tbody>{events.map(item => <tr key={item.id}>
        <td><strong>{dateTime(item.starts_at, timezone)}</strong>{!parentView && <div className="table-small">Africa/Lagos (WAT): {dateTime(item.starts_at, "Africa/Lagos")}</div>}</td>
        <td><span className={`pill ${item.event === "completed" ? "green" : item.event === "missed" || item.event === "cancelled" ? "red" : item.event === "rescheduled" ? "amber" : "blue"}`}>{eventName(item.event)}</span><div className="table-small">{item.payload.title || item.payload.instrument}</div></td>
        <td><strong>{item.payload.teacherName || "Teacher not recorded"}</strong>{item.payload.notes && <div className="table-small">Notes: {item.payload.notes}</div>}{item.payload.nextTopics && <div className="table-small">Next: {item.payload.nextTopics}</div>}</td>
        <td><span>{dateTime(item.created_at, timezone)}</span><div className="table-small">{item.actor_name}</div></td>
      </tr>)}</tbody>
    </table></div> : <div className="empty-state"><strong>No class records for {monthName(activeMonth, timezone)}</strong><p>When a class update is recorded, its snapshot will remain in this history.</p></div>)}
    <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14 }}>
      <span className="table-small" aria-live="polite">{visible ? `${total} record${total === 1 ? "" : "s"} · page ${activePage} of ${pageCount}` : loading ? `Loading ${monthName(activeMonth, timezone)}…` : ""}</span>
      <div style={{ display: "flex", gap: 7 }}><button className="btn ghost small" type="button" disabled={loading || activePage <= 1} onClick={() => changePage(activePage - 1)}>Previous</button><button className="btn ghost small" type="button" disabled={loading || !visible || activePage >= pageCount} onClick={() => changePage(activePage + 1)}>Next</button></div>
    </footer>
  </section>;
}
