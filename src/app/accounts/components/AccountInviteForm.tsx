"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Role } from "@/lib/types";
import { useCatalogs, useRoles } from "@/lib/academy/use-academy-config";
import { invitationRoles, labelFor } from "../accounts-types";
import { AccountIcon } from "./AccountIcon";

export interface AccountInviteFormProps {
  invitePending: boolean;
  loading: boolean;
  inviteError?: string;
  onCancel?: () => void;
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
  inviteError,
  onCancel,
  onInvite,
}: AccountInviteFormProps) {
  const { invitableRoles } = useRoles();
  const { config } = useCatalogs();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "super_admin">>("parent");
  const [timezone, setTimezone] = useState(config.defaultTimezone);

  useEffect(() => {
    setTimezone((current) =>
      current === "Africa/Lagos" ? config.defaultTimezone : current
    );
  }, [config.defaultTimezone]);

  const roleOptions =
    invitableRoles.length > 0
      ? invitableRoles.map((r) => ({ code: r.code, label: r.label }))
      : invitationRoles.map((code) => ({ code, label: labelFor(code) }));

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
      setTimezone(config.defaultTimezone);
    }
  };

  return (
    <form className="pw-invite-form" onSubmit={handleSubmit}>
      {inviteError && (
        <div className="pw-inline-alert error" role="alert">
          <span className="pw-alert-dot" />
          {inviteError}
        </div>
      )}

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
            {roleOptions.map((item) => (
              <option value={item.code} key={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pw-field">
          <span>Timezone</span>
          <input
            name="timezone"
            required
            list="invite-iana-timezones"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Africa/Lagos"
          />
          <datalist id="invite-iana-timezones">
            <option value="Africa/Lagos" />
            <option value="Africa/Accra" />
            <option value="Africa/Nairobi" />
            <option value="Africa/Johannesburg" />
            <option value="Africa/Cairo" />
            <option value="Europe/London" />
            <option value="Europe/Paris" />
            <option value="Europe/Berlin" />
            <option value="Europe/Dublin" />
            <option value="America/New_York" />
            <option value="America/Chicago" />
            <option value="America/Denver" />
            <option value="America/Los_Angeles" />
            <option value="America/Toronto" />
            <option value="America/Vancouver" />
            <option value="Asia/Dubai" />
            <option value="Asia/Singapore" />
            <option value="Asia/Tokyo" />
            <option value="Asia/Kolkata" />
            <option value="Australia/Sydney" />
            <option value="Pacific/Auckland" />
            <option value="UTC" />
          </datalist>
        </label>
      </div>

      <div className="pw-form-note">
        <AccountIcon type="shield" />
        <span>
          Invitations are sent by email. The invitee receives the assigned role;
          owner access can’t be assigned here.
        </span>
      </div>

      <div className="modal-actions" style={{ marginTop: 8 }}>
        {onCancel && (
          <button
            type="button"
            className="pw-outline-button"
            onClick={onCancel}
            disabled={invitePending}
          >
            Cancel
          </button>
        )}
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
      </div>
    </form>
  );
}
