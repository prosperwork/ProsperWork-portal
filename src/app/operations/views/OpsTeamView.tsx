"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Plus, ShieldCheck } from "lucide-react";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
import { PortalModal } from "@/app/_components/PortalModal";
import {
  dateLabel,
  roleName,
  staffName,
  weekdays,
  type AvailabilityRow,
  type ObservationRow,
  type OperationsData,
  type QualityRow,
} from "../ops-types";

export interface OpsTeamViewProps {
  data: OperationsData;
  visibleAvailability: AvailabilityRow[];
  visibleQuality: QualityRow[];
  visibleObservations: ObservationRow[];
  isActive: boolean;
  isOwner: boolean;
  canAvailability: boolean;
  canReadQuality: boolean;
  canObserve: boolean;
  busy: string;
  submitAction: (action: unknown, label: string) => Promise<boolean>;
  confirm: (options: ConfirmOptions) => void;
}

export default function OpsTeamView({
  data,
  visibleAvailability,
  visibleQuality,
  visibleObservations,
  isActive,
  isOwner,
  canAvailability,
  canReadQuality,
  canObserve,
  busy,
  submitAction,
}: OpsTeamViewProps) {
  const [subTab, setSubTab] = useState<"availability" | "quality">(
    canAvailability ? "availability" : "quality"
  );
  const effectiveSubTab =
    subTab === "availability" && canAvailability
      ? "availability"
      : canReadQuality
      ? "quality"
      : "availability";

  // Staff filters
  const [availabilityStaffFilter, setAvailabilityStaffFilter] = useState("all");
  const [qualityStaffFilter, setQualityStaffFilter] = useState("all");

  // Add Availability modal
  const [availModalOpen, setAvailModalOpen] = useState(false);
  const [availabilityStaff, setAvailabilityStaff] = useState("");
  const [availabilityWeekday, setAvailabilityWeekday] = useState("");
  const [availabilityFrom, setAvailabilityFrom] = useState("");
  const [availabilityTo, setAvailabilityTo] = useState("");
  const [availabilityNotes, setAvailabilityNotes] = useState("");

  // Remove Availability modal
  const [removeTarget, setRemoveTarget] = useState<AvailabilityRow | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  // Log Observation / Coaching modal
  const [obsModalOpen, setObsModalOpen] = useState(false);
  const [observationStaff, setObservationStaff] = useState("");
  const [observationKind, setObservationKind] = useState<
    "observation" | "coaching"
  >("observation");
  const [observationScore, setObservationScore] = useState("");
  const [observationNotes, setObservationNotes] = useState("");

  const timeRangeInvalid = Boolean(
    availabilityFrom && availabilityTo && availabilityTo <= availabilityFrom
  );

  const staffOptionsForAvailability = useMemo(() => {
    const ids = new Set(visibleAvailability.map((a) => a.staff_id));
    return data.staff.filter((s) => ids.has(s.id));
  }, [visibleAvailability, data.staff]);

  const staffOptionsForQuality = useMemo(() => {
    const ids = new Set([
      ...visibleQuality.map((q) => q.staffId),
      ...visibleObservations.map((o) => o.staff_id),
    ]);
    return data.staff.filter((s) => ids.has(s.id));
  }, [visibleQuality, visibleObservations, data.staff]);

  const filteredAvailability = useMemo(() => {
    if (availabilityStaffFilter === "all") return visibleAvailability;
    return visibleAvailability.filter(
      (item) => item.staff_id === availabilityStaffFilter
    );
  }, [visibleAvailability, availabilityStaffFilter]);

  const filteredQuality = useMemo(() => {
    if (qualityStaffFilter === "all") return visibleQuality;
    return visibleQuality.filter(
      (item) => item.staffId === qualityStaffFilter
    );
  }, [visibleQuality, qualityStaffFilter]);

  const filteredObservations = useMemo(() => {
    if (qualityStaffFilter === "all") return visibleObservations;
    return visibleObservations.filter(
      (item) => item.staff_id === qualityStaffFilter
    );
  }, [visibleObservations, qualityStaffFilter]);

  const addAvailability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (timeRangeInvalid) return;
    const saved = await submitAction(
      {
        action: "availability",
        staffId: isOwner ? availabilityStaff : data.profile.id,
        weekday: Number(availabilityWeekday),
        from: availabilityFrom,
        to: availabilityTo,
        notes: availabilityNotes.trim(),
      },
      "Weekly availability slot added and reloaded."
    );
    if (saved) {
      setAvailabilityStaff("");
      setAvailabilityWeekday("");
      setAvailabilityFrom("");
      setAvailabilityTo("");
      setAvailabilityNotes("");
      setAvailModalOpen(false);
    }
  };

  const handleConfirmRemove = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!removeTarget) return;
    const saved = await submitAction(
      {
        action: "availability_remove",
        id: removeTarget.id,
        notes: removeReason.trim(),
      },
      "Availability slot removed and reloaded."
    );
    if (saved) {
      setRemoveTarget(null);
      setRemoveReason("");
    }
  };

  const addObservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "observe",
        staffId: observationStaff,
        kind: observationKind,
        score: Number(observationScore),
        notes: observationNotes.trim(),
      },
      "Private observation saved and reloaded."
    );
    if (saved) {
      setObservationStaff("");
      setObservationScore("");
      setObservationNotes("");
      setObservationKind("observation");
      setObsModalOpen(false);
    }
  };

  return (
    <div className="ops-view-group" role="group" aria-label="Team work area">
      {/* Full-width sub-tabs */}
      {canAvailability && canReadQuality && (
        <div className="span-12" style={{ gridColumn: "span 12" }}>
          <nav className="portal-tabs" aria-label="Team sections" style={{ marginBottom: 4 }}>
            <button
              type="button"
              className={`portal-tab ${
                effectiveSubTab === "availability" ? "active" : ""
              }`}
              onClick={() => setSubTab("availability")}
            >
              <CalendarDays size={14} /> Weekly Availability
              <span className="portal-tab-badge">
                {visibleAvailability.length}
              </span>
            </button>
            <button
              type="button"
              className={`portal-tab ${
                effectiveSubTab === "quality" ? "active" : ""
              }`}
              onClick={() => setSubTab("quality")}
            >
              <ShieldCheck size={14} /> Teaching Quality &amp; Observations
              <span className="portal-tab-badge">
                {visibleObservations.length}
              </span>
            </button>
          </nav>
        </div>
      )}

      {/* TAB 1: Weekly Availability (Full Width) */}
      {canAvailability && effectiveSubTab === "availability" && (
        <section
          className="ops-section span-12"
          aria-labelledby="availability-title"
        >
          <div className="ops-section-head">
            <div>
              <h2 id="availability-title">Weekly staff availability</h2>
              <p>
                Declared weekly teaching and administration time windows used to
                check scheduling conflicts.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {staffOptionsForAvailability.length > 1 && (
                <select
                  className="select-mini"
                  aria-label="Filter availability by staff member"
                  value={availabilityStaffFilter}
                  onChange={(e) => setAvailabilityStaffFilter(e.target.value)}
                >
                  <option value="all">
                    All staff ({visibleAvailability.length})
                  </option>
                  {staffOptionsForAvailability.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className="ops-btn primary"
                disabled={!isActive || Boolean(busy)}
                onClick={() => setAvailModalOpen(true)}
              >
                <Plus size={14} /> Add Availability
              </button>
            </div>
          </div>

          {filteredAvailability.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Staff Member</th>
                    <th>Day</th>
                    <th>Time Window</th>
                    <th>Timezone</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAvailability.map((item) => {
                    const person = data.staff.find(
                      (row) => row.id === item.staff_id
                    );
                    const name =
                      person?.name ?? staffName(data.staff, item.staff_id);
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="pw-person-inline">
                            <ProfileAvatar
                              profileId={item.staff_id}
                              name={name}
                              size={30}
                            />
                            <div>
                              <strong>{name}</strong>
                              {person && (
                                <span className="ops-small">
                                  {roleName(person.role)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{weekdays[item.weekday] ?? "Unknown"}</td>
                        <td>
                          <strong>
                            {item.from_time.slice(0, 5)} –{" "}
                            {item.to_time.slice(0, 5)}
                          </strong>
                        </td>
                        <td>{person?.timezone ?? data.profile.timezone}</td>
                        <td>
                          <button
                            className="ops-btn danger"
                            type="button"
                            onClick={() => {
                              setRemoveTarget(item);
                              setRemoveReason("");
                            }}
                            disabled={!isActive || Boolean(busy)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <strong>No availability slots found</strong>
              Add a weekly availability window using the button above.
            </div>
          )}
        </section>
      )}

      {/* TAB 2: Teaching Quality & Observations (Full Width) */}
      {canReadQuality && effectiveSubTab === "quality" && (
        <>
          <section
            className="ops-section span-12"
            aria-labelledby="quality-title"
          >
            <div className="ops-section-head">
              <div>
                <h2 id="quality-title">Teaching quality metrics</h2>
                <p>
                  Service-calculated attendance and lesson board completeness
                  metrics scoped to your role.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {staffOptionsForQuality.length > 1 && (
                  <select
                    className="select-mini"
                    aria-label="Filter quality by teacher"
                    value={qualityStaffFilter}
                    onChange={(e) => setQualityStaffFilter(e.target.value)}
                  >
                    <option value="all">All teachers</option>
                    {staffOptionsForQuality.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                )}
                {canObserve && (
                  <button
                    type="button"
                    className="ops-btn primary"
                    disabled={!isActive || Boolean(busy)}
                    onClick={() => setObsModalOpen(true)}
                  >
                    <Plus size={14} /> Log Observation / Coaching
                  </button>
                )}
              </div>
            </div>

            {filteredQuality.length ? (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>Active students</th>
                      <th>Verified lessons</th>
                      <th>Missed</th>
                      <th>Empty boards</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuality.map((item) => (
                      <tr key={item.staffId}>
                        <td>
                          <div className="pw-person-inline">
                            <ProfileAvatar
                              profileId={item.staffId}
                              name={item.name}
                              size={30}
                            />
                            <strong>{item.name}</strong>
                          </div>
                        </td>
                        <td>{item.activeStudents}</td>
                        <td>{item.verifiedLessons}</td>
                        <td>{item.missedLessons}</td>
                        <td>{item.emptyBoards}</td>
                        <td>
                          <span className="ops-pill">
                            {item.score !== null && item.score !== undefined
                              ? `${item.score}/100`
                              : "Not scored"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ops-empty">
                <strong>No quality metrics returned</strong>
                Metrics remain service-owned and scoped to your role.
              </div>
            )}
          </section>

          <section
            className="ops-section span-12"
            aria-labelledby="observations-title"
          >
            <div className="ops-section-head">
              <div>
                <h2 id="observations-title">Saved observation &amp; coaching notes</h2>
                <p>
                  Private quality evaluations visible through native quality
                  access rules.
                </p>
              </div>
            </div>
            {filteredObservations.length ? (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>Type / Score</th>
                      <th>Saved</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredObservations.map((item) => {
                      const person = data.staff.find(
                        (row) => row.id === item.staff_id
                      );
                      const name =
                        person?.name ?? staffName(data.staff, item.staff_id);
                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="pw-person-inline">
                              <ProfileAvatar
                                profileId={item.staff_id}
                                name={name}
                                size={30}
                              />
                              <strong>{name}</strong>
                            </div>
                          </td>
                          <td>
                            <span className="ops-pill">{item.kind}</span>
                            <span className="ops-small">{item.score}/100</span>
                          </td>
                          <td>
                            {dateLabel(item.created_at, data.profile.timezone)}
                          </td>
                          <td style={{ maxWidth: 460 }}>{item.notes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ops-empty">
                <strong>No observations returned</strong>
                {canObserve
                  ? "Use Log Observation / Coaching above to record a private evaluation."
                  : "Private records appear only when available to your role."}
              </div>
            )}
          </section>
        </>
      )}

      {/* + Add Availability Modal */}
      <PortalModal
        open={availModalOpen}
        onClose={() => {
          if (!busy) setAvailModalOpen(false);
        }}
        title="Add Weekly Availability Slot"
        eyebrow="Staff Schedule"
        subtitle={
          isOwner
            ? "Declare a weekly recurring availability window for a staff member."
            : `Own profile: ${data.profile.name} (${data.profile.timezone})`
        }
        size="md"
        busy={busy === "availability"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setAvailModalOpen(false)}
              disabled={busy === "availability"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-add-avail-form"
              className="ops-btn primary"
              disabled={
                !isActive ||
                (isOwner && !availabilityStaff) ||
                timeRangeInvalid ||
                Boolean(busy)
              }
            >
              {busy === "availability" ? "Saving…" : "Add Availability"}
            </button>
          </>
        }
      >
        <form
          id="ops-add-avail-form"
          onSubmit={(event) => void addAvailability(event)}
        >
          {isOwner && (
            <div className="ops-field">
              <label htmlFor="availability-staff">Staff member</label>
              <select
                id="availability-staff"
                value={availabilityStaff}
                onChange={(event) => setAvailabilityStaff(event.target.value)}
                required
              >
                <option value="">Choose staff</option>
                {data.staff
                  .filter(
                    (person) =>
                      person.role !== "parent" &&
                      person.role !== "student" &&
                      ["active", "on_leave"].includes(person.status)
                  )
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · {roleName(person.role)} ·{" "}
                      {person.timezone}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="ops-form-grid">
            <div className="ops-field full">
              <label htmlFor="availability-weekday">Weekday</label>
              <select
                id="availability-weekday"
                value={availabilityWeekday}
                onChange={(event) => setAvailabilityWeekday(event.target.value)}
                required
              >
                <option value="">Choose weekday</option>
                {weekdays.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
            <div className="ops-field">
              <label htmlFor="availability-from">From</label>
              <input
                id="availability-from"
                type="time"
                value={availabilityFrom}
                onChange={(event) => setAvailabilityFrom(event.target.value)}
                required
              />
            </div>
            <div className="ops-field">
              <label htmlFor="availability-to">To</label>
              <input
                id="availability-to"
                type="time"
                value={availabilityTo}
                onChange={(event) => setAvailabilityTo(event.target.value)}
                required
              />
            </div>
          </div>

          {timeRangeInvalid && (
            <div className="ops-alert" role="alert">
              End time must be later than start time.
            </div>
          )}

          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="availability-notes">
              Reason · at least 5 characters
            </label>
            <textarea
              id="availability-notes"
              value={availabilityNotes}
              onChange={(event) => setAvailabilityNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
              placeholder="e.g. Updated weekly studio teaching hours"
            />
          </div>
        </form>
      </PortalModal>

      {/* Remove Availability Slot Modal */}
      <PortalModal
        open={Boolean(removeTarget)}
        onClose={() => {
          if (!busy) setRemoveTarget(null);
        }}
        title="Remove Availability Slot"
        eyebrow="Schedule Update"
        subtitle={
          removeTarget
            ? `${
                data.staff.find((r) => r.id === removeTarget.staff_id)?.name ??
                staffName(data.staff, removeTarget.staff_id)
              } · ${weekdays[removeTarget.weekday] ?? "Unknown"} (${removeTarget.from_time.slice(
                0,
                5
              )}–${removeTarget.to_time.slice(0, 5)})`
            : undefined
        }
        size="sm"
        busy={busy === "availability_remove"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setRemoveTarget(null)}
              disabled={busy === "availability_remove"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-remove-avail-form"
              className="ops-btn danger"
              disabled={
                !isActive || removeReason.trim().length < 5 || Boolean(busy)
              }
            >
              {busy === "availability_remove" ? "Removing…" : "Remove Slot"}
            </button>
          </>
        }
      >
        <form
          id="ops-remove-avail-form"
          onSubmit={(event) => void handleConfirmRemove(event)}
        >
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="remove-avail-reason">
              Reason for removal · at least 5 characters
            </label>
            <textarea
              id="remove-avail-reason"
              required
              minLength={5}
              maxLength={2000}
              value={removeReason}
              onChange={(event) => setRemoveReason(event.target.value)}
              placeholder="e.g. Teacher no longer available on this weekday"
            />
          </div>
        </form>
      </PortalModal>

      {/* + Log Observation / Coaching Modal */}
      <PortalModal
        open={obsModalOpen}
        onClose={() => {
          if (!busy) setObsModalOpen(false);
        }}
        title="Log Private Observation / Coaching"
        eyebrow="Quality Control"
        subtitle="Owner and QC only · saved score and notes are protected by quality access rules."
        size="md"
        busy={busy === "observe"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setObsModalOpen(false)}
              disabled={busy === "observe"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-observe-form"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
            >
              {busy === "observe" ? "Saving…" : "Save Private Observation"}
            </button>
          </>
        }
      >
        <form
          id="ops-observe-form"
          onSubmit={(event) => void addObservation(event)}
        >
          <div className="ops-field">
            <label htmlFor="observation-teacher">Eligible active teacher</label>
            <select
              id="observation-teacher"
              value={observationStaff}
              onChange={(event) => setObservationStaff(event.target.value)}
              required
            >
              <option value="">Choose teacher</option>
              {data.staff
                .filter(
                  (person) =>
                    (person.department === "Music Education" ||
                      ["teacher", "qc"].includes(person.role) ||
                      person.role.includes("teacher") ||
                      person.role.includes("tutor")) &&
                    person.status === "active"
                )
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="ops-form-grid">
            <div className="ops-field">
              <label htmlFor="observation-kind">Record type</label>
              <select
                id="observation-kind"
                value={observationKind}
                onChange={(event) =>
                  setObservationKind(
                    event.target.value as "observation" | "coaching"
                  )
                }
              >
                <option value="observation">Observation</option>
                <option value="coaching">Coaching</option>
              </select>
            </div>
            <div className="ops-field">
              <label htmlFor="observation-score">
                Evaluator score · 0–100
              </label>
              <input
                id="observation-score"
                type="number"
                min="0"
                max="100"
                step="1"
                value={observationScore}
                onChange={(event) => setObservationScore(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="observation-notes">
              Evidence and coaching notes · 5+ characters
            </label>
            <textarea
              id="observation-notes"
              value={observationNotes}
              onChange={(event) => setObservationNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>
        </form>
      </PortalModal>
    </div>
  );
}
