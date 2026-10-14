"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  KeyRound,
  LoaderCircle,
  Lock,
  Save,
  UserRound,
} from "lucide-react";
import ProfilePhotoControl from "../management/ProfilePhotoControl";

type OwnProfile = {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  status?: string;
  timezone?: string | null;
  username?: string | null;
  avatar_file_id?: string | null;
};
type ProfileResponse = {
  profile?: OwnProfile;
  avatarUrl?: string | null;
  error?: string;
  ok?: boolean;
};

function deviceTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        credentials: "include",
        cache: "no-store",
      });
      const result = (await response
        .json()
        .catch(() => ({}))) as ProfileResponse;
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok || !result.profile)
        throw new Error(result.error || "Your profile could not be loaded.");
      setProfile(result.profile);
      setName(result.profile.name);
      setTimezone(result.profile.timezone || deviceTimezone());
      setAvatarUrl(result.avatarUrl ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your profile could not be loaded."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onPhoto = useCallback((url: string | null) => {
    setAvatarUrl(url);
    window.dispatchEvent(
      new CustomEvent("pw-profile-updated", { detail: { avatarUrl: url } })
    );
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || saving) return;
    const cleanName = name.trim();
    const cleanTimezone = timezone.trim();
    if (cleanName.length < 2 || cleanName.length > 100) {
      setSaveError("Name must contain 2–100 characters.");
      return;
    }
    if (!validTimezone(cleanTimezone)) {
      setSaveError("Enter a valid IANA timezone, such as Europe/London.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, timezone: cleanTimezone }),
      });
      const result = (await response
        .json()
        .catch(() => ({}))) as ProfileResponse;
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok || result.ok !== true || !result.profile) {
        throw new Error(result.error || "Profile changes could not be saved.");
      }
      setProfile((current) =>
        current ? { ...current, ...result.profile } : result.profile ?? null
      );
      setName(result.profile.name);
      setTimezone(result.profile.timezone || cleanTimezone);
      setNotice("Profile details saved.");
      window.dispatchEvent(
        new CustomEvent("pw-profile-updated", {
          detail: { profile: result.profile, avatarUrl },
        })
      );
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Profile changes could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updatePassword",
          password: newPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || "Password could not be updated.");
      }
      setPasswordSuccess(
        "Your password was updated. Redirecting to sign in with your new password…"
      );
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        window.location.assign(
          data.redirect || "/login?reason=password_changed"
        );
      }, 1200);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Password could not be updated."
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const changed = Boolean(
    profile &&
      (name.trim() !== profile.name ||
        timezone.trim() !== (profile.timezone || deviceTimezone()))
  );

  return (
    <main className="pw-profile">
      <section className="profile-content">
        <header className="profile-heading">
          <div>
            <span className="profile-kicker">Account</span>
            <h1>Profile</h1>
          </div>
          {refreshing && !loading && (
            <span className="profile-refreshing" role="status">
              Refreshing
            </span>
          )}
        </header>
        {error && (
          <div className="profile-alert" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        {notice && (
          <div className="profile-alert success" role="status">
            <Check size={16} />
            <span>{notice}</span>
          </div>
        )}
        {saveError && (
          <div className="profile-alert" role="alert">
            <AlertCircle size={16} />
            <span>{saveError}</span>
          </div>
        )}
        {loading && !profile ? (
          <section className="profile-editor" aria-label="Loading profile">
            <div className="profile-skeleton" />
            <div className="profile-skeleton short" />
            <div className="profile-skeleton" />
          </section>
        ) : (
          profile && (
            <section className="profile-editor">
              <div className="profile-editor-head">
                <span className="profile-mark">
                  <UserRound size={17} />
                </span>
                <div>
                  <h2>Personal details</h2>
                  <p>Update the name and time zone attached to your account.</p>
                </div>
              </div>
              <form
                className="profile-form"
                onSubmit={(event) => void save(event)}
              >
                <div className="profile-field-grid">
                  <label className="profile-field">
                    <span>Name</span>
                    <input
                      type="text"
                      autoComplete="name"
                      minLength={2}
                      maxLength={100}
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      aria-describedby="profile-name-help"
                    />
                    <small id="profile-name-help">2–100 characters.</small>
                  </label>
                  <label className="profile-field">
                    <span>Time zone</span>
                    <input
                      type="text"
                      autoComplete="off"
                      required
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      aria-describedby="profile-timezone-help"
                      placeholder="Europe/London"
                    />
                    <small id="profile-timezone-help">
                      Use an IANA time zone such as America/Toronto.
                    </small>
                  </label>
                  <label className="profile-field">
                    <span>Email</span>
                    <input
                      type="text"
                      value={profile.email ?? "Not provided"}
                      readOnly
                      aria-readonly="true"
                    />
                  </label>
                  <label className="profile-field">
                    <span>Username</span>
                    <input
                      type="text"
                      value={profile.username || "Not set"}
                      readOnly
                      aria-readonly="true"
                    />
                  </label>
                  <label className="profile-field">
                    <span>Role</span>
                    <input
                      type="text"
                      value={profile.role.replaceAll("_", " ")}
                      readOnly
                      aria-readonly="true"
                    />
                  </label>
                  <label className="profile-field">
                    <span>Account status</span>
                    <input
                      type="text"
                      value={profile.status || "Not provided"}
                      readOnly
                      aria-readonly="true"
                    />
                  </label>
                </div>
                <div className="profile-form-footer">
                  {notice && (
                    <span className="profile-save-state">
                      <Check size={14} /> Saved
                    </span>
                  )}
                  <button
                    className="profile-save"
                    type="submit"
                    disabled={
                      saving || !changed || !name.trim() || !timezone.trim()
                    }
                  >
                    {saving ? (
                      <>
                        <LoaderCircle size={14} /> Saving…
                      </>
                    ) : (
                      <>
                        <Save size={14} /> Save changes
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="profile-divider" />

              {/* Security & Password Change */}
              <section
                className="profile-password-section"
                aria-labelledby="profile-password-title"
              >
                <div className="profile-editor-head">
                  <span className="profile-mark">
                    <KeyRound size={17} />
                  </span>
                  <div>
                    <h2 id="profile-password-title">Security &amp; Password</h2>
                    <p>
                      Change the sign-in password for your account. Must be at
                      least 8 characters.
                    </p>
                  </div>
                </div>

                {passwordError && (
                  <div className="profile-alert" role="alert">
                    <AlertCircle size={16} />
                    <span>{passwordError}</span>
                  </div>
                )}
                {passwordSuccess && (
                  <div className="profile-alert success" role="status">
                    <Check size={16} />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <form
                  className="profile-form"
                  onSubmit={(event) => void updatePassword(event)}
                >
                  <div className="profile-field-grid">
                    <label className="profile-field">
                      <span>New password</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="At least 8 characters"
                      />
                      <small>
                        Use letters, numbers, and symbols for high security.
                      </small>
                    </label>
                    <label className="profile-field">
                      <span>Confirm new password</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        placeholder="Repeat new password"
                      />
                      <small>Ensure both password fields match.</small>
                    </label>
                  </div>
                  <div className="profile-form-footer">
                    <button
                      className="profile-save"
                      type="submit"
                      disabled={
                        passwordSaving ||
                        newPassword.length < 8 ||
                        newPassword !== confirmPassword
                      }
                    >
                      {passwordSaving ? (
                        <>
                          <LoaderCircle size={14} /> Updating…
                        </>
                      ) : (
                        <>
                          <Lock size={14} /> Update password
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>

              <div className="profile-divider" />

              <section
                className="profile-photo-section"
                aria-labelledby="profile-photo-title"
              >
                <div>
                  <h2 id="profile-photo-title">Profile photo</h2>
                  <p>
                    Private to your signed-in account. PNG or JPEG, up to 5 MiB.
                  </p>
                </div>
                {profile.id && (
                  <ProfilePhotoControl
                    userId={profile.id}
                    name={profile.name}
                    onPhoto={onPhoto}
                  />
                )}
              </section>
            </section>
          )
        )}
      </section>
    </main>
  );
}
