"use client";

import { useState, type FormEvent } from "react";
import { UserPlus, LoaderCircle } from "lucide-react";
import { hiringRoles } from "@/lib/academy/hiring";
import {
  expectedSupervisor,
  roleKey,
  roleLabel,
  type HiringData,
  type HiringRole,
} from "../hiring-types";

export interface HiringCandidateFormProps {
  data: HiringData;
  isActive: boolean;
  busy: string;
  onSubmitCreate: (formData: {
    name: string;
    email: string;
    role: HiringRole;
    reviewerId: string;
    notes: string;
  }) => Promise<boolean>;
}

export default function HiringCandidateForm({
  data,
  isActive,
  busy,
  onSubmitCreate,
}: HiringCandidateFormProps) {
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<HiringRole>("teacher");
  const [reviewerId, setReviewerId] = useState("");
  const [createNotes, setCreateNotes] = useState("");

  const supervisorRole = expectedSupervisor(newRole);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onSubmitCreate({
      name: newName,
      email: newEmail,
      role: newRole,
      reviewerId,
      notes: createNotes,
    });
    if (ok) {
      setNewName("");
      setNewEmail("");
      setCreateNotes("");
      setReviewerId("");
    }
  };

  return (
    <details className="hire-create-disclosure">
      <summary>
        <UserPlus size={14} /> New applicant
      </summary>
      <section className="hire-card" aria-labelledby="create-case-heading">
        <div className="hire-card-head">
          <div>
            <h2 id="create-case-heading">Applicant details</h2>
          </div>
        </div>
        {isActive ? (
          <form className="hire-card-body" onSubmit={handleSubmit}>
            <div className="hire-form-field">
              <label htmlFor="candidate-name">Applicant full name</label>
              <input
                id="candidate-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </div>
            <div className="hire-form-field">
              <label htmlFor="candidate-email">Applicant email</label>
              <input
                id="candidate-email"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                maxLength={254}
                required
              />
            </div>
            <div className="hire-form-field">
              <label htmlFor="candidate-role">Role being recruited</label>
              <select
                id="candidate-role"
                value={newRole}
                onChange={(event) => {
                  const value = event.target.value as HiringRole;
                  setNewRole(value);
                  setReviewerId("");
                }}
                required
              >
                {hiringRoles.map((value) => (
                  <option value={value} key={value}>
                    {roleLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="hire-form-field">
              <label htmlFor="assigned-reviewer">
                Departmental reviewer or Super Admin
              </label>
              <select
                id="assigned-reviewer"
                value={reviewerId}
                onChange={(event) => setReviewerId(event.target.value)}
                required
              >
                <option value="">Choose an active reviewer</option>
                {data.directory
                  .filter(
                    (person) =>
                      person.status === "active" &&
                      (roleKey(person.role) === supervisorRole ||
                        person.role === "super_admin")
                  )
                  .map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.name} · {roleLabel(person.role)}{" "}
                      {person.id === data.profile.id
                        ? "(You - Direct Oversight)"
                        : person.role === "super_admin"
                        ? "(Super Admin)"
                        : ""}
                    </option>
                  ))}
              </select>
              <small>
                Default supervisor ({roleLabel(supervisorRole)}) or Super Admin
                (universal review & fallback for unfilled roles).
              </small>
            </div>

            <div className="hire-form-field">
              <label htmlFor="create-notes">
                Recruitment context · 5–2000 characters
              </label>
              <textarea
                id="create-notes"
                value={createNotes}
                onChange={(event) => setCreateNotes(event.target.value)}
                minLength={5}
                maxLength={2000}
                required
              />
            </div>
            <div className="hire-actions">
              <button
                className="hire-button primary"
                type="submit"
                disabled={!isActive || busy === "create"}
              >
                {busy === "create" ? (
                  <>
                    <LoaderCircle size={13} /> Saving…
                  </>
                ) : (
                  "Create case"
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="hire-card-body">
            <div className="hire-empty">
              <strong>Read-only profile</strong>Only active HR and Owner
              profiles can open cases.
            </div>
          </div>
        )}
      </section>
    </details>
  );
}
