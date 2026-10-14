"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
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
  confirm,
}: OpsTeamViewProps) {
  const [availabilityStaff, setAvailabilityStaff] = useState("");
  const [availabilityWeekday, setAvailabilityWeekday] = useState("");
  const [availabilityFrom, setAvailabilityFrom] = useState("");
  const [availabilityTo, setAvailabilityTo] = useState("");
  const [availabilityNotes, setAvailabilityNotes] = useState("");
  const [availabilityRemoveNotes, setAvailabilityRemoveNotes] = useState<
    Record<string, string>
  >({});

  const [observationStaff, setObservationStaff] = useState("");
  const [observationKind, setObservationKind] = useState<
    "observation" | "coaching"
  >("observation");
  const [observationScore, setObservationScore] = useState("");
  const [observationNotes, setObservationNotes] = useState("");

  const addAvailability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "availability",
        staffId: isOwner ? availabilityStaff : data.profile.id,
        weekday: Number(availabilityWeekday),
        fromTime: availabilityFrom,
        toTime: availabilityTo,
        notes: availabilityNotes,
      },
      "Weekly availability slot added and reloaded."
    );
    if (saved) {
      setAvailabilityStaff("");
      setAvailabilityWeekday("");
      setAvailabilityFrom("");
      setAvailabilityTo("");
      setAvailabilityNotes("");
    }
  };

  const handleRemoveAvailability = (item: AvailabilityRow) => {
    const person = data.staff.find((row) => row.id === item.staff_id);
    const staffTitle = person?.name ?? staffName(data.staff, item.staff_id);
    const day = weekdays[item.weekday] ?? "Unknown";
    const note = (availabilityRemoveNotes[item.id] ?? "").trim();

    confirm({
      title: "Remove Availability Slot?",
      message: `Are you sure you want to remove the ${day} slot (${item.from_time.slice(
        0,
        5
      )}–${item.to_time.slice(0, 5)}) for ${staffTitle}? Reason: "${note}"`,
      tone: "danger",
      confirmLabel: "Remove Slot",
      onConfirm: async () => {
        await submitAction(
          {
            action: "availability_remove",
            id: item.id,
            notes: note,
          },
          "Availability slot removed and reloaded."
        );
      },
    });
  };

  const addObservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await submitAction(
      {
        action: "observation",
        staffId: observationStaff,
        kind: observationKind,
        score: Number(observationScore),
        notes: observationNotes,
      },
      "Private observation saved and reloaded."
    );
    if (saved) {
      setObservationStaff("");
      setObservationScore("");
      setObservationNotes("");
      setObservationKind("observation");
    }
  };

  return (
    <div className="ops-view-group" role="group" aria-label="Team work area">
      {canAvailability && (
        <section
          className="ops-section span-6"
          aria-labelledby="availability-title"
        >
          <div className="ops-section-head">
            <div>
              <h2 id="availability-title">Staff availability</h2>
            </div>
          </div>
          <details className="ops-create-record">
            <summary>Add weekly availability</summary>
            <form onSubmit={(event) => void addAvailability(event)}>
              {isOwner && (
                <div className="ops-field">
                  <label htmlFor="availability-staff">Staff member</label>
                  <select
                    id="availability-staff"
                    value={availabilityStaff}
                    onChange={(event) =>
                      setAvailabilityStaff(event.target.value)
                    }
                    required
                  >
                    <option value="">Choose staff</option>
                    {data.staff
                      .filter(
                        (person) =>
                          ["teacher", "qc", "admin", "head_admin"].includes(
                            person.role
                          ) && ["active", "on_leave"].includes(person.status)
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
              {!isOwner && (
                <div className="ops-callout">
                  Own profile only: {data.profile.name} ·{" "}
                  {data.profile.timezone}
                </div>
              )}
              <div className="ops-form-grid">
                <div className="ops-field">
                  <label htmlFor="availability-weekday">Weekday</label>
                  <select
                    id="availability-weekday"
                    value={availabilityWeekday}
                    onChange={(event) =>
                      setAvailabilityWeekday(event.target.value)
                    }
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
                    onChange={(event) =>
                      setAvailabilityFrom(event.target.value)
                    }
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
              <div className="ops-field">
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
                />
              </div>
              <div className="ops-actions">
                <button
                  className="ops-btn primary"
                  type="submit"
                  disabled={
                    !isActive ||
                    (isOwner && !availabilityStaff) ||
                    Boolean(busy)
                  }
                >
                  Add availability
                </button>
              </div>
            </form>
          </details>
          {visibleAvailability.length ? (
            <div className="ops-table-wrap" style={{ marginTop: 12 }}>
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Day</th>
                    <th>Window</th>
                    <th>Reason to remove</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAvailability.map((item) => {
                    const person = data.staff.find(
                      (row) => row.id === item.staff_id
                    );
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="pw-person-inline">
                            <ProfileAvatar
                              profileId={item.staff_id}
                              name={
                                person?.name ??
                                staffName(data.staff, item.staff_id)
                              }
                              size={30}
                            />
                            <strong>
                              {person?.name ??
                                staffName(data.staff, item.staff_id)}
                            </strong>
                          </div>
                        </td>
                        <td>{weekdays[item.weekday] ?? "Unknown"}</td>
                        <td>
                          {item.from_time.slice(0, 5)}–
                          {item.to_time.slice(0, 5)}
                        </td>
                        <td>
                          <input
                            aria-label={`Reason to remove ${
                              weekdays[item.weekday]
                            } slot`}
                            placeholder="Reason · 5+ chars"
                            value={availabilityRemoveNotes[item.id] ?? ""}
                            onChange={(event) =>
                              setAvailabilityRemoveNotes((previous) => ({
                                ...previous,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                          <button
                            className="ops-btn danger"
                            type="button"
                            onClick={() => handleRemoveAvailability(item)}
                            disabled={
                              !isActive ||
                              (availabilityRemoveNotes[item.id] ?? "").trim()
                                .length < 5 ||
                              Boolean(busy)
                            }
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
              <strong>No availability returned</strong>Add a weekly staff slot
              above.
            </div>
          )}
        </section>
      )}

      {canReadQuality && (
        <section className="ops-section span-6" aria-labelledby="quality-title">
          <div className="ops-section-head">
            <div>
              <h2 id="quality-title">Teaching quality</h2>
            </div>
            <ShieldCheck size={18} color="#4c8b63" />
          </div>
          {visibleQuality.length ? (
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
                  {visibleQuality.map((item) => (
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
                      <td>{item.score ?? "Not scored"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <strong>No quality metrics returned</strong>Metrics remain
              service-owned and scoped to your role.
            </div>
          )}
          {canObserve && (
            <form
              onSubmit={(event) => void addObservation(event)}
              style={{ marginTop: 16 }}
            >
              <div className="ops-section-head">
                <div>
                  <h2>Private observation / coaching</h2>
                  <p>
                    Owner and QC only · saved score and notes are visible
                    through native quality access rules.
                  </p>
                </div>
              </div>
              <div className="ops-field">
                <label htmlFor="observation-teacher">
                  Eligible active teacher
                </label>
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
                        person.role === "teacher" && person.status === "active"
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
                    onChange={(event) =>
                      setObservationScore(event.target.value)
                    }
                    required
                  />
                </div>
              </div>
              <div className="ops-field">
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
              <div className="ops-actions">
                <button
                  className="ops-btn primary"
                  type="submit"
                  disabled={!isActive || Boolean(busy)}
                >
                  Save private observation
                </button>
              </div>
            </form>
          )}
          <div className="ops-section-head" style={{ marginTop: 16 }}>
            <div>
              <h2>Saved observation notes</h2>
            </div>
          </div>
          {visibleObservations.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Type / score</th>
                    <th>Saved</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleObservations.map((item) => {
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
                            <span>{name}</span>
                          </div>
                        </td>
                        <td>
                          {item.kind}
                          <span className="ops-small">{item.score}/100</span>
                        </td>
                        <td>
                          {dateLabel(item.created_at, data.profile.timezone)}
                        </td>
                        <td>{item.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <strong>No observations returned</strong>Private records appear
              only when the service returns them.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
