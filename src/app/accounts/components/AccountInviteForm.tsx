"use client";

import { useState, type FormEvent } from "react";
import type { Role } from "@/lib/types";
import { invitationRoles, labelFor } from "../accounts-types";
import { AccountIcon } from "./AccountIcon";

export interface AccountInviteFormProps {
  invitePending: boolean;
  loading: boolean;
  mutationError: string;
  successMessage: string;
  onInvite: (account: {
    name: string;
    email: string;
    role: Exclude<Role, "super_admin">;
    timezone: string;
  }) => Promise<boolean>;
}

export default function AccountInviteForm({
  invitePending,
  loading,
  mutationError,
  successMessage,
  onInvite,
}: AccountInviteFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "super_admin">>("parent");
  const [timezone, setTimezone] = useState("Africa/Lagos");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    const success = await onInvite({
      name: name.trim(),
      email: email.trim(),
      role,
      timezone: timezone.trim(),
    });
    if (success) {
      setName("");
      setEmail("");
      setRole("parent");
      setTimezone("Africa/Lagos");
    }
  };

  return (
    <aside className="pw-invite-workarea" aria-labelledby="invite-title">
      <div className="pw-card-heading">
        <div className="pw-invite-mark">
          <AccountIcon type="mail" />
        </div>
        <div>
          <div className="pw-eyebrow">Bring someone in</div>
          <h2 id="invite-title">Invite an account</h2>
        </div>
      </div>
      <p className="pw-card-lede">
        Send a secure invitation and assign the right workspace role.
      </p>

      {mutationError && (
        <div className="pw-inline-alert error" role="alert">
          <span className="pw-alert-dot" />
          {mutationError}
        </div>
      )}
      {successMessage && (
        <div className="pw-inline-alert success" role="status">
          <span className="pw-alert-dot" />
          {successMessage}
        </div>
      )}

      <form className="pw-invite-form" onSubmit={handleSubmit}>
        <label className="pw-field">
          <span>Name</span>
          <input
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Full name"
          />
        </label>
        <label className="pw-field">
          <span>Email address</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <div className="pw-field-row">
          <label className="pw-field">
            <span>Workspace role</span>
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as Exclude<Role, "super_admin">)
              }
            >
              {invitationRoles.map((item) => (
                <option value={item} key={item}>
                  {labelFor(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="pw-field">
            <span>Timezone</span>
            <input
              name="timezone"
              required
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Africa/Lagos"
            />
          </label>
        </div>
        <div className="pw-form-note">
          <AccountIcon type="shield" />
          <span>
            Invitations are sent by email. The invitee receives the assigned
            role; owner access can’t be assigned here.
          </span>
        </div>
        <button
          className="pw-primary-button"
          type="submit"
          disabled={invitePending || loading}
        >
          {invitePending ? (
            <>
              <span className="pw-button-spinner" />
              Sending invitation…
            </>
          ) : (
            <>
              Send invitation{" "}
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M4 10h11m-4-4 4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </>
          )}
        </button>
      </form>
    </aside>
  );
}
