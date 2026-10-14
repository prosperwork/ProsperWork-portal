"use client";
import { useEffect, useState } from "react";
import { historyCollections } from "@/lib/academy/history-collections";

type Row = Record<string, any>;
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
export default function RecordHistory({ collection = "audit", search, embedded = false }: { collection?: string; search?: string; embedded?: boolean }) {
  const [type, setType] = useState(collection), [query, setQuery] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [page, setPage] = useState(1), [size, setSize] = useState(50), [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]), [selected, setSelected] = useState<Row | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [refresh, setRefresh] = useState(0), [role, setRole] = useState("");
  const term = search ?? query;
  useEffect(() => {
    if (!embedded) {
      const value = new URL(window.location.href).searchParams.get("collection");
      if (value && Object.hasOwn(historyCollections, value)) setType(value);
    }
  }, [embedded]);
  useEffect(() => { setPage(1); setSelected(null); }, [type, term, from, to, size]);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true); setError("");
      try {
        const params = new URLSearchParams({ collection: type, search: term, page: String(page), size: String(size) });
        if (from) params.set("from", from); if (to) params.set("to", to);
        const response = await fetch(`/api/history?${params}`, { cache: "no-store", signal: abort.signal });
        const body = await response.json();
        if (!response.ok) throw Error(body.error || "History could not be loaded.");
        setRows(body.records); setTotal(body.total); setRole(body.profile.role);
      } catch (cause) {
        if (!abort.signal.aborted) { setRows([]); setError(cause instanceof Error ? cause.message : "History unavailable."); }
      } finally { if (!abort.signal.aborted) setBusy(false); }
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [type, term, from, to, page, size, refresh]);
  const last = Math.max(1, Math.ceil(total / size));
  const value = (row: Row) => row.payload ?? row;
  const text = (data: Row) => String(data.name || data.title || data.studentName || data.staff_name || data.action || data.body || data.kind || data.status || "Record");
  return <section className="record-history">
    {!embedded && <header className="document-heading"><h1>Record history</h1><button className="btn secondary small" disabled={busy} onClick={() => setRefresh(n => n + 1)}>Refresh</button></header>}
    <div className="history-filters">
      {!embedded && <label>Records<select value={type} onChange={event => setType(event.target.value)}>{Object.entries(historyCollections).filter(([key]) => !key.startsWith("salary_") || !["parent", "student", "general_manager"].includes(role)).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>}
      {search === undefined && <label>Search<input value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="Find a record" /></label>}
      <label>Recorded from (UTC)<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Recorded to (UTC)<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
    </div>
    {error && <p className="document-error" role="alert">{error}<button onClick={() => setRefresh(n => n + 1)}>Retry</button></p>}
    <div className="table-wrap" aria-busy={busy}><table><thead><tr><th>Recorded</th><th>Record</th><th>Status</th><th /></tr></thead><tbody>
      {rows.map(row => { const data = value(row), at = row[historyCollections[type].date]; return <tr key={row.id}><td>{at ? new Date(at).toLocaleString() : "—"}</td><td><strong>{text(data)}</strong>{data.actor_name && <div className="table-small">{data.actor_name}</div>}</td><td>{String(data.status || "—").replaceAll("_", " ")}</td><td><button className="btn secondary small" onClick={() => setSelected(row)}>Details</button></td></tr>; })}
      {!rows.length && <tr><td colSpan={4}>{busy ? "Loading records…" : "No matching records"}</td></tr>}
    </tbody></table></div>
    <div className="record-pagination"><span>{total.toLocaleString()} records · Page {page} of {last}</span><label>Per page<select value={size} onChange={event => setSize(Number(event.target.value))}>{[25, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label><button className="btn secondary small" disabled={busy || page <= 1} onClick={() => setPage(n => n - 1)}>Previous</button><button className="btn secondary small" disabled={busy || page >= last} onClick={() => setPage(n => n + 1)}>Next</button></div>
    {selected && <section className="history-details"><header><h2>{text(value(selected))}</h2><button className="btn ghost small" onClick={() => setSelected(null)}>Close details</button></header><dl>{Object.entries(value(selected)).map(([key, content]) => <div key={key}><dt>{label(key)}</dt><dd>{content === null ? "—" : typeof content === "object" ? JSON.stringify(content, null, 2) : String(content)}</dd></div>)}</dl></section>}
  </section>;
}
