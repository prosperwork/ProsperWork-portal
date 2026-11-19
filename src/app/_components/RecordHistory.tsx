"use client";

import { useEffect, useState, type ReactNode } from "react";
import { historyCollections } from "@/lib/academy/history-collections";
import { PortalModal } from "./PortalModal";

type Row = Record<string, any>;

const label = (key: string) => {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : key;
};

function formatScalar(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "—";
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
      const parsed = new Date(val);
      if (Number.isFinite(parsed.getTime())) {
        return parsed.toLocaleString();
      }
    }
    return val;
  }
  return String(val);
}

function renderFieldValue(content: unknown): ReactNode {
  if (content === null || content === undefined || content === "") return "—";
  if (typeof content !== "object") return formatScalar(content);

  if (Array.isArray(content)) {
    if (content.length === 0) return "None";
    const allPrimitives = content.every(
      (item) => item === null || typeof item !== "object"
    );
    if (allPrimitives) {
      return content.map(formatScalar).join(", ");
    }
    return (
      <pre
        style={{
          margin: 0,
          padding: "8px 10px",
          background: "#f6faf7",
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontSize: 11.5,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(content, null, 2)}
      </pre>
    );
  }

  const entries = Object.entries(content as Record<string, unknown>);
  if (entries.length === 0) return "—";
  const allShallow = entries.every(
    ([, val]) => val === null || typeof val !== "object"
  );
  if (allShallow) {
    return (
      <div
        style={{
          display: "grid",
          gap: 4,
          padding: "8px 10px",
          background: "#f6faf7",
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        {entries.map(([subKey, subVal]) => (
          <div
            key={subKey}
            style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
          >
            <span style={{ color: "var(--muted)", fontWeight: 600 }}>
              {label(subKey)}
            </span>
            <span style={{ color: "var(--pine-950)", textAlign: "right" }}>
              {formatScalar(subVal)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <pre
      style={{
        margin: 0,
        padding: "8px 10px",
        background: "#f6faf7",
        border: "1px solid var(--line)",
        borderRadius: 8,
        fontSize: 11.5,
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

export default function RecordHistory({
  collection = "audit",
  search,
  embedded = false,
}: {
  collection?: string;
  search?: string;
  embedded?: boolean;
}) {
  const [type, setType] = useState(collection);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [role, setRole] = useState("");

  const term = search ?? query;

  useEffect(() => {
    if (!embedded) {
      const value = new URL(window.location.href).searchParams.get("collection");
      if (value && Object.hasOwn(historyCollections, value)) setType(value);
    }
  }, [embedded]);

  useEffect(() => {
    setPage(1);
    setSelected(null);
  }, [type, term, from, to, size]);

  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const params = new URLSearchParams({
          collection: type,
          search: term,
          page: String(page),
          size: String(size),
        });
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const response = await fetch(`/api/history?${params}`, {
          cache: "no-store",
          signal: abort.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw Error(body.error || "History could not be loaded.");
        setRows(body.records);
        setTotal(body.total);
        setRole(body.profile.role);
      } catch (cause) {
        if (!abort.signal.aborted) {
          setRows([]);
          setError(
            cause instanceof Error ? cause.message : "History unavailable."
          );
        }
      } finally {
        if (!abort.signal.aborted) setBusy(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [type, term, from, to, page, size, refresh]);

  const last = Math.max(1, Math.ceil(total / size));
  const value = (row: Row) => row.payload ?? row;
  const text = (data: Row) =>
    String(
      data.name ||
        data.title ||
        data.studentName ||
        data.staff_name ||
        data.action ||
        data.body ||
        data.kind ||
        data.status ||
        "Record"
    );

  const selectedPayload = selected ? value(selected) : null;
  const selectedTimestamp = selected
    ? selected[historyCollections[type]?.date]
    : null;

  return (
    <section className="record-history">
      {!embedded && (
        <header className="document-heading">
          <h1>Record history</h1>
          <button
            type="button"
            className="btn secondary small"
            disabled={busy}
            onClick={() => setRefresh((n) => n + 1)}
          >
            Refresh
          </button>
        </header>
      )}
      <div className="history-filters">
        {!embedded && (
          <label>
            Records
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {Object.entries(historyCollections)
                .filter(
                  ([key]) =>
                    !key.startsWith("salary_") ||
                    !["parent", "student", "general_manager"].includes(role)
                )
                .map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
            </select>
          </label>
        )}
        {search === undefined && (
          <label>
            Search
            <input
              value={query}
              maxLength={120}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a record"
            />
          </label>
        )}
        <label>
          Recorded from (UTC)
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          Recorded to (UTC)
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="document-error" role="alert">
          {error}
          <button type="button" onClick={() => setRefresh((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}
      <div className="table-wrap" aria-busy={busy}>
        <table>
          <thead>
            <tr>
              <th>Recorded</th>
              <th>Record</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const data = value(row);
              const at = row[historyCollections[type].date];
              return (
                <tr key={row.id}>
                  <td>{at ? new Date(at).toLocaleString() : "—"}</td>
                  <td>
                    <strong>{text(data)}</strong>
                    {data.actor_name && (
                      <div className="table-small">{data.actor_name}</div>
                    )}
                  </td>
                  <td>{String(data.status || "—").replaceAll("_", " ")}</td>
                  <td>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setSelected(row)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={4}>
                  {busy ? "Loading records…" : "No matching records"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="record-pagination">
        <span>
          {total.toLocaleString()} records · Page {page} of {last}
        </span>
        <label>
          Per page
          <select
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          >
            {[25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn secondary small"
          disabled={busy || page <= 1}
          onClick={() => setPage((n) => n - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn secondary small"
          disabled={busy || page >= last}
          onClick={() => setPage((n) => n + 1)}
        >
          Next
        </button>
      </div>

      <PortalModal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        eyebrow={historyCollections[type]?.label || "Record History"}
        title={selectedPayload ? text(selectedPayload) : "Record details"}
        subtitle={
          selectedTimestamp
            ? `Recorded ${new Date(selectedTimestamp).toLocaleString()}`
            : undefined
        }
        size="lg"
        footer={
          <button
            type="button"
            className="btn ghost"
            onClick={() => setSelected(null)}
          >
            Close
          </button>
        }
      >
        {selectedPayload && (
          <dl
            style={{
              margin: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px 16px",
            }}
          >
            {Object.entries(selectedPayload).map(([key, content]) => {
              const isWide =
                typeof content === "object" && content !== null;
              return (
                <div
                  key={key}
                  style={{
                    gridColumn: isWide ? "1 / -1" : undefined,
                    padding: "10px 12px",
                    background: "#fbfdfb",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                  }}
                >
                  <dt
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    {label(key)}
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "var(--pine-950)",
                      wordBreak: "break-word",
                      lineHeight: 1.45,
                    }}
                  >
                    {renderFieldValue(content)}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </PortalModal>
    </section>
  );
}
