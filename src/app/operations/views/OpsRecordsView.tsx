"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ClipboardList, CreditCard, Search } from "lucide-react";
import {
  dateLabel,
  staffName,
  type OperationsData,
} from "../ops-types";

export interface OpsRecordsViewProps {
  data: OperationsData;
  isOwner: boolean;
  profileId: string;
  canBilling: boolean;
  canSeeEvents: boolean;
}

export default function OpsRecordsView({
  data,
  isOwner,
  profileId,
  canBilling,
  canSeeEvents,
}: OpsRecordsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const visibleEvents = useMemo(() => {
    const scoped = data.events.filter(
      (event) => isOwner || event.actor === profileId
    );
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((event) => {
      const actorName = event.actor
        ? staffName(data.staff, event.actor)
        : "System";
      const hay = [
        event.action,
        event.subject ?? "",
        actorName,
        event.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data.events, data.staff, isOwner, profileId, searchQuery]);

  return (
    <div className="ops-view-group" role="group" aria-label="Records work area">
      {canBilling && (
        <section className="ops-section span-12">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CreditCard size={18} color="#4c8b63" />
              <div>
                <strong style={{ fontSize: 13, color: "#143c2b", display: "block" }}>
                  Payment status &amp; overdue tracking
                </strong>
                <span className="ops-small" style={{ marginTop: 2 }}>
                  Inspect invoices, overdue buckets, and verify family payment
                  receipts in the Finance workspace.
                </span>
              </div>
            </div>
            <Link href="/finance" className="ops-btn primary">
              Open Finance <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>
      )}

      {canSeeEvents && (
        <section className="ops-section span-12" aria-labelledby="events-title">
          <div className="ops-section-head">
            <div>
              <h2 id="events-title">Operations audit log</h2>
              <p>
                Attributed operational changes recorded by the operations
                service.
              </p>
            </div>
            <div className="search" style={{ maxWidth: 300 }}>
              <Search size={14} />
              <input
                type="search"
                placeholder="Search action, actor, subject, or reason…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          {visibleEvents.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Subject</th>
                    <th>Time</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((event) => {
                    const actorLabel = event.actor
                      ? staffName(data.staff, event.actor)
                      : "System";
                    return (
                      <tr key={event.id}>
                        <td>
                          <span className="ops-pill">
                            {event.action.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td>
                          <strong>{actorLabel}</strong>
                        </td>
                        <td>{event.subject ?? "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {dateLabel(event.created_at, data.profile.timezone)}
                        </td>
                        <td style={{ maxWidth: 420 }}>{event.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <ClipboardList
                size={18}
                color="#4c8b63"
                style={{ margin: "0 auto 6px" }}
              />
              <strong>
                {searchQuery
                  ? "No audit events match your search"
                  : "No operations audit records yet"}
              </strong>
              {searchQuery
                ? "Try clearing your search query."
                : "Operational actions performed in your scope will be recorded here."}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
