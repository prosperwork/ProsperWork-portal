"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LoaderCircle,
  Lock,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { clearAcademyCache } from "@/lib/storage";
import { PortalModal } from "@/app/_components/PortalModal";
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

const COMMON_TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

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

function formatRoleLabel(role: string) {
  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
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

  // Password change modal state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detectedTz = useMemo(() => deviceTimezone(), []);
  const timezoneSuggestions = useMemo(() => {
    const set = new Set<string>(COMMON_TIMEZONES);
    if (detectedTz) set.add(detectedTz);
    return Array.from(set);
  }, [detectedTz]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, []);

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

  const openPasswordModal = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
    setPasswordError("");
    setPasswordSuccess("");
    setPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    if (passwordSaving || passwordSuccess) return;
    setPasswordModalOpen(false);
    setPasswordError("");
  };

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

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
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
          currentPassword,
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
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      clearAcademyCache();
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
      redirectTimerRef.current = setTimeout(() => {
        redirectTimerRef.current = null;
        clearAcademyCache();
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
        timezone.trim() !== (profile.timezone || detectedTz))
  );

  const isStatusActive =
    (profile?.status ?? "").trim().toLowerCase() === "active";

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
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        {notice && (
          <div className="profile-alert success" role="status">
            <Check size={16} />
            <span style={{ flex: 1 }}>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notice"
              style={{
                border: 0,
                background: "transparent",
                color: "inherit",
                padding: 2,
                display: "grid",
                placeItems: "center",
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {saveError && (
          <div className="profile-alert" role="alert">
            <AlertCircle size={16} />
            <span style={{ flex: 1 }}>{saveError}</span>
            <button
              type="button"
              onClick={() => setSaveError("")}
              aria-label="Dismiss error"
              style={{
                border: 0,
                background: "transparent",
                color: "inherit",
                padding: 2,
                display: "grid",
                placeItems: "center",
              }}
            >
              <X size={14} />
            </button>
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
            <div style={{ display: "grid", gap: 18 }}>
              {/* Top Identity & Profile Photo Header Card */}
              <section
                className="profile-editor"
                aria-labelledby="profile-identity-title"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 18,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    {profile.id && (
                      <ProfilePhotoControl
                        userId={profile.id}
                        name={profile.name}
                        initialAvatarUrl={avatarUrl}
                        onPhoto={onPhoto}
                      />
                    )}
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <h2
                          id="profile-identity-title"
                          style={{
                            margin: 0,
                            fontSize: 20,
                            fontWeight: 800,
                            color: "var(--pine-950)",
                          }}
                        >
                          {profile.name}
                        </h2>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: "#edf6f1",
                            color: "#135b45",
                            border: "1px solid #cfe4d6",
                          }}
                        >
                          {formatRoleLabel(profile.role)}
                        </span>
                        {profile.status && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "3px 9px",
                              borderRadius: 999,
                              background: isStatusActive
                                ? "#dcfce7"
                                : "#fef3c7",
                              color: isStatusActive ? "#166534" : "#92400e",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <ShieldCheck size={11} aria-hidden="true" />
                            {formatRoleLabel(profile.status)}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          flexWrap: "wrap",
                          marginTop: 8,
                          fontSize: 13,
                          color: "var(--muted)",
                        }}
                      >
                        {profile.email && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <Mail size={13} aria-hidden="true" />
                            {profile.email}
                          </span>
                        )}
                        {profile.username && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <UserRound size={13} aria-hidden="true" />@
                            {profile.username}
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 12,
                          color: "var(--muted)",
                        }}
                      >
                        Profile photos are private to your account (PNG or JPEG,
                        up to 5 MiB).
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Personal Details Form */}
              <section className="profile-editor">
                <div className="profile-editor-head">
                  <span className="profile-mark">
                    <UserRound size={17} />
                  </span>
                  <div>
                    <h2>Personal details</h2>
                    <p>
                      Update the display name and time zone used for your lesson
                      schedules.
                    </p>
                  </div>
                </div>
                <form
                  className="profile-form"
                  onSubmit={(event) => void save(event)}
                >
                  <div className="profile-field-grid">
                    <label className="profile-field">
                      <span>Display name</span>
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
                    <div className="profile-field">
                      <label htmlFor="profile-timezone-input">
                        <span>Time zone</span>
                      </label>
                      <input
                        id="profile-timezone-input"
                        type="text"
                        list="profile-timezone-options"
                        autoComplete="off"
                        required
                        value={timezone}
                        onChange={(event) => setTimezone(event.target.value)}
                        aria-describedby="profile-timezone-help"
                        placeholder="e.g. Africa/Lagos or Europe/London"
                      />
                      <datalist id="profile-timezone-options">
                        {timezoneSuggestions.map((tz) => (
                          <option key={tz} value={tz} />
                        ))}
                      </datalist>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          flexWrap: "wrap",
                          marginTop: 4,
                        }}
                      >
                        <small id="profile-timezone-help">
                          IANA time zone for class times.
                        </small>
                        <button
                          type="button"
                          onClick={() => setTimezone(detectedTz)}
                          style={{
                            border: "1px solid var(--line)",
                            background: "#f5faf6",
                            color: "var(--pine-800)",
                            borderRadius: 7,
                            padding: "4px 9px",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Globe size={12} aria-hidden="true" /> Use my device
                          timezone ({detectedTz})
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="profile-form-footer">
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
              </section>

              {/* Compact Security Card */}
              <section
                className="profile-editor"
                aria-labelledby="profile-security-title"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div className="profile-editor-head" style={{ margin: 0 }}>
                    <span className="profile-mark">
                      <KeyRound size={17} />
                    </span>
                    <div>
                      <h2 id="profile-security-title">Security</h2>
                      <p>
                        Keep your account protected with a strong password of at
                        least 8 characters.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="profile-save"
                    onClick={openPasswordModal}
                  >
                    <Lock size={14} aria-hidden="true" /> Change Password
                  </button>
                </div>
              </section>
            </div>
          )
        )}
      </section>

      {/* Change Password Modal */}
      <PortalModal
        open={passwordModalOpen}
        onClose={closePasswordModal}
        eyebrow="Account Security"
        title="Change Password"
        subtitle="Enter your current password and choose a new password of at least 8 characters."
        size="sm"
        busy={passwordSaving}
      >
        <form onSubmit={(event) => void updatePassword(event)}>
          <div
            className="profile-alert"
            role="note"
            style={{
              background: "#fffbeb",
              borderColor: "#fde68a",
              color: "#78350f",
              marginBottom: 14,
            }}
          >
            <AlertCircle size={16} color="#b45309" />
            <span>
              Updating your password will sign you out so you can sign back in
              with your new credentials.
            </span>
          </div>

          {passwordError && (
            <div
              className="profile-alert"
              role="alert"
              style={{ marginBottom: 12 }}
            >
              <AlertCircle size={16} />
              <span>{passwordError}</span>
            </div>
          )}
          {passwordSuccess && (
            <div
              className="profile-alert success"
              role="status"
              style={{ marginBottom: 12 }}
            >
              <Check size={16} />
              <span>{passwordSuccess}</span>
            </div>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            <div className="profile-field">
              <label htmlFor="modal-current-password">
                <span>Current password</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="modal-current-password"
                  type={showCurrentPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Enter your current password"
                  style={{ width: "100%", paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw((v) => !v)}
                  aria-label={
                    showCurrentPw
                      ? "Hide current password"
                      : "Show current password"
                  }
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: 0,
                    background: "transparent",
                    color: "#516259",
                    padding: 4,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {showCurrentPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="profile-field">
              <label htmlFor="modal-new-password">
                <span>New password</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="modal-new-password"
                  type={showNewPw ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  style={{ width: "100%", paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((v) => !v)}
                  aria-label={
                    showNewPw ? "Hide new password" : "Show new password"
                  }
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: 0,
                    background: "transparent",
                    color: "#516259",
                    padding: 4,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <small>Use a mix of letters, numbers, and symbols.</small>
            </div>

            <div className="profile-field">
              <label htmlFor="modal-confirm-password">
                <span>Confirm new password</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="modal-confirm-password"
                  type={showConfirmPw ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat new password"
                  style={{ width: "100%", paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw((v) => !v)}
                  aria-label={
                    showConfirmPw
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: 0,
                    background: "transparent",
                    color: "#516259",
                    padding: 4,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={closePasswordModal}
              disabled={passwordSaving}
            >
              Cancel
            </button>
            <button
              className="profile-save"
              type="submit"
              disabled={
                passwordSaving ||
                !currentPassword ||
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
      </PortalModal>
    </main>
  );
}
