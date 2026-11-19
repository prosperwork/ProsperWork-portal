"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  Search,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import type { ConfirmOptions } from "@/app/_components/ConfirmModal";
import { PortalModal } from "@/app/_components/PortalModal";
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

function formatAge(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) return "Just arrived";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
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
}: OpsLeadsViewProps) {
  const [leadTab, setLeadTab] = useState<"active" | "converted">("active");
  const [searchQuery, setSearchQuery] = useState("");

  // Assign Rep modal
  const [assignLead, setAssignLead] = useState<LeadRow | null>(null);
  const [assignStaffId, setAssignStaffId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");

  // Schedule Trial modal
  const [trialLead, setTrialLead] = useState<LeadRow | null>(null);
  const [trialStudent, setTrialStudent] = useState("");
  const [trialTeacher, setTrialTeacher] = useState("");
  const [trialAdmin, setTrialAdmin] = useState("");
  const [trialAt, setTrialAt] = useState("");
  const [trialNotes, setTrialNotes] = useState("");

  // Convert Lead modal
  const [convertLead, setConvertLead] = useState<LeadRow | null>(null);
  const [convertNotes, setConvertNotes] = useState("");

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

  const leadReadiness = (lead: LeadRow) => {
    const verifiedTrial = Boolean(
      lead.trial_lesson_id && lead.trial_verified_at
    );
    const first = firstPayment(lead);
    const paidFirst = Boolean(
      first?.verified_at && first.payload.status === "paid"
    );
    return { verifiedTrial, paidFirst, ready: !lead.converted_at && verifiedTrial && paidFirst };
  };

  const tabCounts = useMemo(() => {
    const active = sortedLeads.filter((l) => !l.converted_at).length;
    const converted = sortedLeads.filter((l) => Boolean(l.converted_at)).length;
    return { active, converted };
  }, [sortedLeads]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedLeads.filter((lead) => {
      const converted = Boolean(lead.converted_at);
      if (leadTab === "active" && converted) return false;
      if (leadTab === "converted" && !converted) return false;
      if (q) {
        const hay = [
          text(lead.payload.childName, ""),
          text(lead.payload.parentName, ""),
          text(lead.payload.email, ""),
          text(lead.payload.status, ""),
          staffName(data.staff, lead.owner_id),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [sortedLeads, leadTab, searchQuery, data.staff]);

  const handleAssignRep = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignLead) return;
    const saved = await submitAction(
      {
        action: "lead_assign",
        id: assignLead.id,
        staffId: assignStaffId,
        notes: assignNotes.trim(),
      },
      "Lead assignment saved and reloaded."
    );
    if (saved) {
      setAssignLead(null);
      setAssignStaffId("");
      setAssignNotes("");
    }
  };

  const handleScheduleTrial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trialLead || !trialAt) return;
    const parsedDate = new Date(trialAt);
    const isoAt = Number.isFinite(parsedDate.getTime())
      ? parsedDate.toISOString()
      : trialAt;

    const saved = await submitAction(
      {
        action: "trial",
        id: trialLead.id,
        studentId: trialStudent,
        teacherId: trialTeacher,
        adminId: trialAdmin,
        at: isoAt,
        notes: trialNotes.trim(),
      },
      "Trial lesson scheduled and verified records reloaded."
    );
    if (saved) {
      setTrialLead(null);
      setTrialStudent("");
      setTrialTeacher("");
      setTrialAdmin("");
      setTrialAt("");
      setTrialNotes("");
    }
  };

  const handleConfirmConvert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!convertLead) return;
    const saved = await submitAction(
      {
        action: "convert",
        id: convertLead.id,
        notes: convertNotes.trim(),
      },
      "Lead conversion saved and reloaded."
    );
    if (saved) {
      setConvertLead(null);
      setConvertNotes("");
    }
  };

  if (!canReadLeads) return null;

  const convertStatus = convertLead ? leadReadiness(convertLead) : null;

  return (
    <div className="ops-view-group" role="group" aria-label="Lead work area">
      <section className="ops-section span-12" aria-labelledby="leads-title">
        <div className="ops-section-head">
          <div>
            <h2 id="leads-title">Lead pipeline</h2>
            <p>
              Assign sales reps, schedule family trials, and convert verified
              leads to enrolled students.
            </p>
          </div>
          <Users size={18} color="#4c8b63" />
        </div>

        {/* Tabs & Search */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <nav
            className="portal-tabs"
            aria-label="Lead pipeline filter"
            style={{ marginBottom: 0, borderBottom: 0, paddingBottom: 0 }}
          >
            <button
              type="button"
              className={`portal-tab ${leadTab === "active" ? "active" : ""}`}
              onClick={() => setLeadTab("active")}
            >
              Active
              <span className="portal-tab-badge">{tabCounts.active}</span>
            </button>
            <button
              type="button"
              className={`portal-tab ${
                leadTab === "converted" ? "active" : ""
              }`}
              onClick={() => setLeadTab("converted")}
            >
              Converted
              <span className="portal-tab-badge">{tabCounts.converted}</span>
            </button>
          </nav>

          <div className="search" style={{ maxWidth: 280 }}>
            <Search size={14} />
            <input
              type="search"
              placeholder="Search child, parent, email, or rep…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        {filteredLeads.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Lead / Age</th>
                  <th>Status / Follow-up</th>
                  <th>Sales Owner</th>
                  <th>Trial</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const { verifiedTrial, ready } = leadReadiness(lead);
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
                          {formatAge(lead.ageMinutes)} in pipeline
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
                        <strong>{staffName(data.staff, lead.owner_id)}</strong>
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
                                : "Scheduled · unverified"}
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
                              {lead.trial_verified_at && (
                                <>
                                  <br />
                                  Verified:{" "}
                                  {dateLabel(
                                    lead.trial_verified_at,
                                    data.profile.timezone
                                  )}
                                </>
                              )}
                            </span>
                          </>
                        ) : (
                          <span className="ops-small">No trial linked</span>
                        )}
                      </td>
                      <td>
                        {converted ? (
                          <span className="ops-pill">Converted</span>
                        ) : (
                          <div
                            className="ops-actions"
                            style={{ marginTop: 0, justifyContent: "flex-start" }}
                          >
                            {canAssignLeads && (
                              <button
                                type="button"
                                className="ops-btn"
                                disabled={!isActive || Boolean(busy)}
                                onClick={() => {
                                  setAssignLead(lead);
                                  setAssignStaffId(lead.owner_id ?? "");
                                  setAssignNotes("");
                                }}
                              >
                                <UserPlus size={13} /> Assign Rep
                              </button>
                            )}
                            {canTrial && !lead.trial_lesson_id && (
                              <button
                                type="button"
                                className="ops-btn"
                                disabled={!isActive || Boolean(busy)}
                                onClick={() => {
                                  setTrialLead(lead);
                                  setTrialStudent(lead.trial_student_id ?? "");
                                  setTrialTeacher("");
                                  setTrialAdmin("");
                                  setTrialAt("");
                                  setTrialNotes("");
                                }}
                              >
                                <CalendarPlus size={13} /> Schedule Trial
                              </button>
                            )}
                            {canConvert && (
                              <button
                                type="button"
                                className={`ops-btn ${ready ? "primary" : ""}`}
                                disabled={!isActive || Boolean(busy)}
                                onClick={() => {
                                  setConvertLead(lead);
                                  setConvertNotes("");
                                }}
                              >
                                <UserCheck size={13} /> Convert
                              </button>
                            )}
                          </div>
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
            <strong>
              No {leadTab} leads{searchQuery ? " matching your search" : ""}
            </strong>
            {searchQuery
              ? "Try a different search term or switch tabs."
              : "Create and contact leads in the main leads workspace."}
          </div>
        )}
      </section>

      {/* Assign Sales Rep Modal */}
      <PortalModal
        open={Boolean(assignLead)}
        onClose={() => {
          if (!busy) setAssignLead(null);
        }}
        title="Assign Sales Representative"
        eyebrow="Lead Ownership"
        subtitle={
          assignLead
            ? `${text(assignLead.payload.childName, "Lead")} · ${text(
                assignLead.payload.parentName,
                "Family"
              )}`
            : undefined
        }
        size="sm"
        busy={busy === "lead_assign"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setAssignLead(null)}
              disabled={busy === "lead_assign"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-assign-rep-form"
              className="ops-btn primary"
              disabled={
                !isActive ||
                !assignStaffId ||
                assignNotes.trim().length < 5 ||
                Boolean(busy)
              }
            >
              {busy === "lead_assign" ? "Assigning…" : "Assign Rep"}
            </button>
          </>
        }
      >
        <form
          id="ops-assign-rep-form"
          onSubmit={(event) => void handleAssignRep(event)}
        >
          <div className="ops-field">
            <label htmlFor="assign-rep-select">Active Sales representative</label>
            <select
              id="assign-rep-select"
              value={assignStaffId}
              onChange={(event) => setAssignStaffId(event.target.value)}
              required
            >
              <option value="">Choose active Sales rep</option>
              {activeSales.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>
          <div className="ops-field" style={{ marginBottom: 0 }}>
            <label htmlFor="assign-rep-notes">
              Assignment reason · 5+ characters
            </label>
            <textarea
              id="assign-rep-notes"
              required
              minLength={5}
              maxLength={2000}
              value={assignNotes}
              onChange={(event) => setAssignNotes(event.target.value)}
              placeholder="e.g. Reassigning for timely trial follow-up"
            />
          </div>
        </form>
      </PortalModal>

      {/* Schedule Trial Modal */}
      <PortalModal
        open={Boolean(trialLead)}
        onClose={() => {
          if (!busy) setTrialLead(null);
        }}
        title="Schedule Trial Lesson"
        eyebrow="Trial Booking"
        subtitle={
          trialLead
            ? `Lead: ${text(trialLead.payload.childName, "Lead")} (${text(
                trialLead.payload.parentName,
                "Family"
              )})`
            : undefined
        }
        size="md"
        busy={busy === "trial"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setTrialLead(null)}
              disabled={busy === "trial"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-schedule-trial-form"
              className="ops-btn primary"
              disabled={!isActive || Boolean(busy)}
            >
              {busy === "trial" ? "Scheduling…" : "Schedule Trial"}
            </button>
          </>
        }
      >
        <form
          id="ops-schedule-trial-form"
          onSubmit={(event) => void handleScheduleTrial(event)}
        >
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>
            The selected child must be linked to this lead&apos;s family. Choose
            a future local date/time and active compatible staff.
          </p>
          <div className="ops-form-grid">
            <div className="ops-field full">
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
            <div className="ops-field full">
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
            <div className="ops-field full" style={{ marginBottom: 0 }}>
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
        </form>
      </PortalModal>

      {/* Convert Lead Modal with Readiness Checklist */}
      <PortalModal
        open={Boolean(convertLead)}
        onClose={() => {
          if (!busy) setConvertLead(null);
        }}
        title="Convert Lead to Enrolled Student"
        eyebrow="Conversion Checklist"
        subtitle={
          convertLead
            ? `${text(convertLead.payload.childName, "Lead")} · ${text(
                convertLead.payload.parentName,
                "Family"
              )}`
            : undefined
        }
        size="md"
        busy={busy === "convert"}
        footer={
          <>
            <button
              type="button"
              className="ops-btn"
              onClick={() => setConvertLead(null)}
              disabled={busy === "convert"}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="ops-convert-lead-form"
              className="ops-btn primary"
              disabled={
                !isActive ||
                !convertStatus?.ready ||
                convertNotes.trim().length < 5 ||
                Boolean(busy)
              }
            >
              {busy === "convert" ? "Converting…" : "Confirm Conversion"}
            </button>
          </>
        }
      >
        {convertLead && convertStatus && (
          <form
            id="ops-convert-lead-form"
            onSubmit={(event) => void handleConfirmConvert(event)}
          >
            <div
              className="ops-callout"
              style={{
                display: "grid",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <strong>Conversion prerequisites</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {convertStatus.verifiedTrial ? (
                  <CheckCircle2 size={15} color="#15803d" />
                ) : (
                  <XCircle size={15} color="#dc2626" />
                )}
                <span>
                  <strong>Trial Verified:</strong>{" "}
                  {convertStatus.verifiedTrial
                    ? `Verified on ${dateLabel(
                        convertLead.trial_verified_at,
                        data.profile.timezone
                      )}`
                    : "Pending — an actual trial must be completed and verified."}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {convertStatus.paidFirst ? (
                  <CheckCircle2 size={15} color="#15803d" />
                ) : (
                  <XCircle size={15} color="#dc2626" />
                )}
                <span>
                  <strong>First Payment Paid:</strong>{" "}
                  {convertStatus.paidFirst
                    ? "Verified and paid"
                    : "Pending — the child's first payment must be verified as paid."}
                </span>
              </div>
              <span className="ops-small" style={{ marginTop: 2 }}>
                Server-side conversion also checks permanent staff assignment
                and an active Finance billing contract.
              </span>
            </div>

            <div className="ops-field" style={{ marginBottom: 0 }}>
              <label htmlFor="convert-lead-notes">
                Conversion reason · at least 5 characters
              </label>
              <textarea
                id="convert-lead-notes"
                required
                minLength={5}
                maxLength={2000}
                disabled={!convertStatus.ready}
                value={convertNotes}
                onChange={(event) => setConvertNotes(event.target.value)}
                placeholder={
                  convertStatus.ready
                    ? "e.g. Trial completed positively and first invoice verified"
                    : "Complete the checklist items above before converting"
                }
              />
            </div>
          </form>
        )}
      </PortalModal>
    </div>
  );
}
