"use client";

import { useState, type FormEvent } from "react";
import { Users } from "lucide-react";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
import {
  dateLabel,
  localDateTimeMinimum,
  roleName,
  staffName,
  studentName,
  text,
  type LeadRow,
  type OperationsData,
  type OpsStaff,
  type OpsStudent,
  type PaymentRow,
} from "../ops-types";

export interface OpsLeadsViewProps {
  data: OperationsData;
  sortedLeads: LeadRow[];
  activeStudents: OpsStudent[];
  activeTeachers: OpsStaff[];
  activeAdmins: OpsStaff[];
  activeSales: OpsStaff[];
  isActive: boolean;
  canReadLeads: boolean;
  canTrial: boolean;
  canAssignLeads: boolean;
  canConvert: boolean;
  busy: string;
  submitAction: (action: unknown, label: string) => Promise<boolean>;
  confirm: (options: ConfirmOptions) => void;
}

export default function OpsLeadsView({
  data,
  sortedLeads,
  activeStudents,
  activeTeachers,
  activeAdmins,
  activeSales,
  isActive,
  canReadLeads,
  canTrial,
  canAssignLeads,
  canConvert,
  busy,
  submitAction,
  confirm,
}: OpsLeadsViewProps) {
  const [trialLead, setTrialLead] = useState("");
  const [trialStudent, setTrialStudent] = useState("");
  const [trialTeacher, setTrialTeacher] = useState("");
  const [trialAdmin, setTrialAdmin] = useState("");
  const [trialAt, setTrialAt] = useState("");
  const [trialNotes, setTrialNotes] = useState("");

  const [leadAssignments, setLeadAssignments] = useState<
    Record<string, { staffId: string; notes: string }>
  >({});
  const [leadConvertNotes, setLeadConvertNotes] = useState<
    Record<string, string>
  >({});

  const deviceZone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";

  const firstPayment = (lead: LeadRow): PaymentRow | undefined => {
    return data.payments.find(
      (item) =>
        item.student_id === lead.trial_student_id ||
        (lead.trial_student_id &&
          item.student_id.startsWith(lead.trial_student_id))
    );
  };

  const canConvertLead = (lead: LeadRow) => {
    if (lead.converted_at) return false;
    const verifiedTrial = Boolean(
      lead.trial_lesson_id && lead.trial_verified_at
    );
    const first = firstPayment(lead);
    const paidFirst = Boolean(
      first?.verified_at && first.payload.status === "paid"
    );
    return verifiedTrial && paidFirst;
  };

  const scheduleTrial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lead = sortedLeads.find((item) => item.id === trialLead);
    const teacher = activeTeachers.find((item) => item.id === trialTeacher);

    confirm({
      title: "Schedule Trial Lesson?",
      message: `Schedule actual trial lesson for ${text(
        lead?.payload.childName,
        "Lead"
      )} with teacher ${teacher?.name ?? "Teacher"} at ${trialAt}?`,
      tone: "primary",
      confirmLabel: "Schedule Trial",
      onConfirm: async () => {
        const saved = await submitAction(
          {
            action: "trial_lesson",
            leadId: trialLead,
            studentId: trialStudent,
            teacherId: trialTeacher,
            adminId: trialAdmin,
            startsAt: trialAt,
            notes: trialNotes,
          },
          "Trial lesson scheduled and verified records reloaded."
        );
        if (saved) {
          setTrialLead("");
          setTrialStudent("");
          setTrialTeacher("");
          setTrialAdmin("");
          setTrialAt("");
          setTrialNotes("");
        }
      },
    });
  };

  const handleConvertLead = (lead: LeadRow) => {
    const childName = text(lead.payload.childName, "Lead");
    const parentName = text(lead.payload.parentName, "Family");
    const note = (leadConvertNotes[lead.id] ?? "").trim();

    confirm({
      title: "Convert Lead to Official Student?",
      message: `Convert ${childName} (${parentName}) to an enrolled student? Active roster assignment and contract billing will be activated. Reason: "${note}"`,
      tone: "primary",
      confirmLabel: "Convert to Student",
      onConfirm: async () => {
        await submitAction(
          {
            action: "convert",
            id: lead.id,
            notes: note,
          },
          "Lead conversion saved and reloaded."
        );
      },
    });
  };

  if (!canReadLeads) return null;

  return (
    <div className="ops-view-group" role="group" aria-label="Lead work area">
      <section className="ops-section span-12" aria-labelledby="leads-title">
        <div className="ops-section-head">
          <div>
            <h2 id="leads-title">Lead pipeline</h2>
          </div>
          <Users size={18} color="#4c8b63" />
        </div>
        {canTrial && (
          <form
            className="ops-callout"
            onSubmit={(event) => void scheduleTrial(event)}
            style={{ marginBottom: 14 }}
          >
            <strong>Schedule a trial against an existing child</strong>
            <span className="ops-small">
              The child must be linked to this lead’s family; choose future
              local time and active compatible staff.
            </span>
            <div className="ops-form-grid" style={{ marginTop: 10 }}>
              <div className="ops-field">
                <label htmlFor="trial-lead">Lead</label>
                <select
                  id="trial-lead"
                  value={trialLead}
                  onChange={(event) => setTrialLead(event.target.value)}
                  required
                >
                  <option value="">Choose lead</option>
                  {sortedLeads
                    .filter(
                      (item) => !item.trial_lesson_id && !item.converted_at
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {text(item.payload.childName, "Lead")} ·{" "}
                        {text(item.payload.parentName, "Family")}
                      </option>
                    ))}
                </select>
              </div>
              <div className="ops-field">
                <label htmlFor="trial-student">Existing student</label>
                <select
                  id="trial-student"
                  value={trialStudent}
                  onChange={(event) => setTrialStudent(event.target.value)}
                  required
                >
                  <option value="">Choose child</option>
                  {activeStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {studentName(student)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ops-field">
                <label htmlFor="trial-teacher">Active teacher / QC</label>
                <select
                  id="trial-teacher"
                  value={trialTeacher}
                  onChange={(event) => setTrialTeacher(event.target.value)}
                  required
                >
                  <option value="">Choose teacher</option>
                  {activeTeachers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · {roleName(person.role)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ops-field">
                <label htmlFor="trial-admin">Active admin / Head</label>
                <select
                  id="trial-admin"
                  value={trialAdmin}
                  onChange={(event) => setTrialAdmin(event.target.value)}
                  required
                >
                  <option value="">Choose admin</option>
                  {activeAdmins.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · {roleName(person.role)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ops-field">
                <label htmlFor="trial-at">
                  Local date and time ({deviceZone})
                </label>
                <input
                  id="trial-at"
                  type="datetime-local"
                  min={localDateTimeMinimum()}
                  value={trialAt}
                  onChange={(event) => setTrialAt(event.target.value)}
                  required
                />
              </div>
              <div className="ops-field full">
                <label htmlFor="trial-notes">
                  Scheduling reason · 5+ characters
                </label>
                <textarea
                  id="trial-notes"
                  value={trialNotes}
                  onChange={(event) => setTrialNotes(event.target.value)}
                  minLength={5}
                  maxLength={2000}
                  required
                />
              </div>
            </div>
            <div className="ops-actions">
              <button
                type="submit"
                className="ops-btn primary"
                disabled={!isActive || Boolean(busy)}
              >
                Schedule actual trial
              </button>
            </div>
          </form>
        )}
        {sortedLeads.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Lead / age</th>
                  <th>Status / follow-up</th>
                  <th>Sales owner</th>
                  <th>Trial</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedLeads.map((lead) => {
                  const first = firstPayment(lead);
                  const verifiedTrial = Boolean(
                    lead.trial_lesson_id && lead.trial_verified_at
                  );
                  const paidFirst = Boolean(
                    first?.verified_at && first.payload.status === "paid"
                  );
                  const assignment = leadAssignments[lead.id] ?? {
                    staffId: "",
                    notes: "",
                  };
                  const converted = Boolean(lead.converted_at);
                  return (
                    <tr key={lead.id}>
                      <td>
                        <div className="pw-person-inline">
                          <ProfileAvatar
                            name={text(
                              lead.payload.parentName,
                              text(lead.payload.childName, "Lead")
                            )}
                            size={30}
                          />
                          <span>
                            <strong>
                              {text(lead.payload.childName, "Lead")}
                            </strong>
                            <small>
                              {text(lead.payload.parentName)} ·{" "}
                              {text(lead.payload.email)}
                            </small>
                          </span>
                        </div>
                        <span className="ops-small">
                          {lead.ageMinutes} minutes in pipeline
                        </span>
                      </td>
                      <td>
                        <span className="ops-pill">
                          {text(lead.payload.status, "unassigned")}
                        </span>
                        <span className="ops-small">
                          Follow-up:{" "}
                          {dateLabel(lead.followupAt, data.profile.timezone)}
                        </span>
                        {converted && (
                          <span className="ops-small">
                            Converted{" "}
                            {dateLabel(
                              lead.converted_at,
                              data.profile.timezone
                            )}
                          </span>
                        )}
                      </td>
                      <td>
                        {staffName(data.staff, lead.owner_id)}
                        {canAssignLeads && !converted && (
                          <div className="ops-field" style={{ marginTop: 8 }}>
                            <select
                              aria-label={`Sales representative for ${text(
                                lead.payload.childName,
                                "lead"
                              )}`}
                              value={assignment.staffId}
                              onChange={(event) =>
                                setLeadAssignments((previous) => ({
                                  ...previous,
                                  [lead.id]: {
                                    ...assignment,
                                    staffId: event.target.value,
                                  },
                                }))
                              }
                            >
                              <option value="">Choose active Sales rep</option>
                              {activeSales.map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.name}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label="Assignment reason"
                              placeholder="Reason · 5+ characters"
                              value={assignment.notes}
                              onChange={(event) =>
                                setLeadAssignments((previous) => ({
                                  ...previous,
                                  [lead.id]: {
                                    ...assignment,
                                    notes: event.target.value,
                                  },
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="ops-btn"
                              onClick={() =>
                                void submitAction(
                                  {
                                    action: "lead_assign",
                                    id: lead.id,
                                    staffId: assignment.staffId,
                                    notes: assignment.notes,
                                  },
                                  "Lead assignment saved and reloaded."
                                )
                              }
                              disabled={
                                !isActive ||
                                !assignment.staffId ||
                                assignment.notes.trim().length < 5 ||
                                Boolean(busy)
                              }
                            >
                              Assign Sales rep
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        {lead.trial_lesson_id ? (
                          <>
                            <span
                              className={`ops-pill ${
                                verifiedTrial ? "" : "alert"
                              }`}
                            >
                              {verifiedTrial
                                ? "Verified"
                                : "Scheduled / not verified"}
                            </span>
                            <span className="ops-small">
                              Child:{" "}
                              {lead.trial_student_id
                                ? studentName(
                                    data.students.find(
                                      (student) =>
                                        student.id === lead.trial_student_id
                                    )
                                  )
                                : "Not linked"}
                              <br />
                              Lesson: {lead.trial_lesson_id}
                              <br />
                              Verified:{" "}
                              {dateLabel(
                                lead.trial_verified_at,
                                data.profile.timezone
                              )}
                            </span>
                          </>
                        ) : (
                          "No trial linked"
                        )}
                      </td>
                      <td>
                        {canTrial && !converted && !lead.trial_lesson_id && (
                          <button
                            type="button"
                            className="ops-btn"
                            onClick={() => setTrialLead(lead.id)}
                          >
                            Select for trial
                          </button>
                        )}
                        {canConvert && !converted && (
                          <div className="ops-field" style={{ marginTop: 8 }}>
                            <input
                              aria-label="Conversion reason"
                              placeholder="Conversion reason · 5+ chars"
                              value={leadConvertNotes[lead.id] ?? ""}
                              onChange={(event) =>
                                setLeadConvertNotes((previous) => ({
                                  ...previous,
                                  [lead.id]: event.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="ops-btn primary"
                              onClick={() => handleConvertLead(lead)}
                              disabled={
                                !isActive ||
                                !canConvertLead(lead) ||
                                (leadConvertNotes[lead.id] ?? "").trim()
                                  .length < 5 ||
                                Boolean(busy)
                              }
                            >
                              Convert
                            </button>
                            {(!verifiedTrial || !paidFirst) && (
                              <span className="ops-small">
                                Blocked until an actual verified trial and the
                                child’s first payment is paid.
                              </span>
                            )}
                            <span className="ops-small">
                              Native conversion also checks permanent staff
                              assignment and an active Finance billing contract.
                            </span>
                          </div>
                        )}
                        {converted && (
                          <span className="ops-pill">Converted</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ops-empty">
            <strong>No leads returned</strong>Create and contact leads in the
            main leads workspace.
          </div>
        )}
      </section>
    </div>
  );
}
