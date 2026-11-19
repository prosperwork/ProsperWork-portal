"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Coins,
  Link2,
  Mail,
  RefreshCw,
  Save,
  Share2,
  Shield,
  ShieldCheck,
  Sliders,
} from "lucide-react";
import { readJson } from "@/lib/academy/web-client";
import { DEFAULT_ACADEMY_EMAILS, type AcademyEmails } from "@/lib/academy/catalogs";
import FinanceSettings from "./FinanceSettings";
import RolePermissionsSettings from "./RolePermissionsSettings";
import CatalogSettings from "./CatalogSettings";
import MetaSettings from "./MetaSettings";

type SettingsTab = "general" | "roles" | "catalogs" | "finance" | "email" | "meta";
const validTabs: SettingsTab[] = [
  "general",
  "roles",
  "catalogs",
  "finance",
  "email",
  "meta",
];

type Settings = {
  standardMinutes: number;
  trialMinutes: number;
  coverMinutes: number;
  rescheduleNoticeHours: number;
  adminConcurrentClasses: number;
  joinBeforeHours: number;
  joinAfterHours: number;
  payrollWeekAnchor: "not_configured" | "calendar_month" | "pay_cycle";
  advanceEligibility:
    | "not_configured"
    | "owner_selected"
    | "previous_period_verified"
    | "disabled";
  vacationAutoApprove: boolean;
  adminParentQuota: number;
  inactivityTimeoutMinutes: number;
  defaultTimezone: string;
  emails: AcademyEmails;
};
type SettingsResponse = {
  profile: { role: string; name: string };
  settings: Settings;
  revision: number;
  integrations: { livekitConfigured: boolean; smtpConfigured: boolean };
};
type EmailMessage = {
  id: string;
  category: string;
  status: string;
  subject: string;
  created_at: string;
  sent_at: string | null;
  attempts: number;
};
type SmtpTest = {
  status: "queued" | "sending" | "sent" | "failed" | "cancelled";
  created_at: string;
  sent_at: string | null;
};
type NumberKey =
  | "standardMinutes"
  | "trialMinutes"
  | "coverMinutes"
  | "rescheduleNoticeHours"
  | "adminConcurrentClasses"
  | "joinBeforeHours"
  | "joinAfterHours"
  | "adminParentQuota"
  | "inactivityTimeoutMinutes";

const numericFields: {
  key: NumberKey;
  title: string;
  detail: string;
  min: number;
  max: number;
  suffix: string;
}[] = [
  {
    key: "standardMinutes",
    title: "Standard lesson",
    detail: "Default duration for standard lessons (1–180 minutes).",
    min: 1,
    max: 180,
    suffix: "min",
  },
  {
    key: "trialMinutes",
    title: "Trial lesson",
    detail: "Default duration for trial lessons (1–180 minutes).",
    min: 1,
    max: 180,
    suffix: "min",
  },
  {
    key: "coverMinutes",
    title: "Cover lesson",
    detail: "Default duration for substitute cover lessons (1–180 minutes).",
    min: 1,
    max: 180,
    suffix: "min",
  },
  {
    key: "rescheduleNoticeHours",
    title: "Reschedule notice",
    detail: "Minimum notice families should give before rescheduling.",
    min: 0,
    max: 72,
    suffix: "hrs",
  },
  {
    key: "adminConcurrentClasses",
    title: "Admin concurrent classes",
    detail: "Maximum simultaneous classes per assigned administrator.",
    min: 1,
    max: 20,
    suffix: "classes",
  },
  {
    key: "joinBeforeHours",
    title: "Early room access",
    detail: "How early the lesson room may open.",
    min: 0,
    max: 2,
    suffix: "hrs",
  },
  {
    key: "joinAfterHours",
    title: "Room close buffer",
    detail: "How long the room remains available after start.",
    min: 5,
    max: 6,
    suffix: "hrs",
  },
  {
    key: "adminParentQuota",
    title: "Parent count before PAY bonus",
    detail:
      "Threshold for the admin PAY bonus; it never caps or blocks parent access.",
    min: 0,
    max: 1000,
    suffix: "parents",
  },
  {
    key: "inactivityTimeoutMinutes",
    title: "Session inactivity timeout",
    detail:
      "Auto sign-out duration after idle time across the portal (15–480 minutes).",
    min: 15,
    max: 480,
    suffix: "min",
  },
];

const emailFields: { key: keyof AcademyEmails; label: string }[] = [
  { key: "admissions", label: "Admissions inbox" },
  { key: "complaints", label: "Complaints & support inbox" },
  { key: "support", label: "Student support fallback" },
  { key: "fees", label: "Fees & billing inbox" },
  { key: "info", label: "General info inbox" },
];

function hydrateSettings(raw: Partial<Settings> | undefined): Settings {
  return {
    standardMinutes: raw?.standardMinutes ?? 60,
    trialMinutes: raw?.trialMinutes ?? 45,
    coverMinutes: raw?.coverMinutes ?? 60,
    rescheduleNoticeHours: raw?.rescheduleNoticeHours ?? 2,
    adminConcurrentClasses: raw?.adminConcurrentClasses ?? 3,
    joinBeforeHours: raw?.joinBeforeHours ?? 1,
    joinAfterHours: raw?.joinAfterHours ?? 5,
    payrollWeekAnchor: raw?.payrollWeekAnchor ?? "not_configured",
    advanceEligibility: raw?.advanceEligibility ?? "not_configured",
    vacationAutoApprove: Boolean(raw?.vacationAutoApprove),
    adminParentQuota: raw?.adminParentQuota ?? 0,
    inactivityTimeoutMinutes: raw?.inactivityTimeoutMinutes ?? 60,
    defaultTimezone: raw?.defaultTimezone || "Africa/Lagos",
    emails: {
      ...DEFAULT_ACADEMY_EMAILS,
      ...(raw?.emails || {}),
    },
  };
}

const label = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function isValidIanaTimezone(tz: string): boolean {
  if (!tz || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const didInitTabRef = useRef(false);

  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [smtpTest, setSmtpTest] = useState<SmtpTest | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const [messageError, setMessageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);

  // Sync ?tab= query param on initial load
  useEffect(() => {
    if (didInitTabRef.current || typeof window === "undefined") return;
    didInitTabRef.current = true;
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param && validTabs.includes(param as SettingsTab)) {
      setActiveTab(param as SettingsTab);
    }
  }, []);

  const selectTab = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  const load = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError("");
    setNotice("");
    setDenied(false);
    try {
      const response = await fetch("/api/settings", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await readJson<
        Partial<SettingsResponse> & { error?: string }
      >(response);
      if (response.status === 401) {
        window.location.assign("/login");
        return false;
      }
      if (!response.ok) {
        if (response.status === 403) setDenied(true);
        throw new Error(
          result.error ||
            (response.status === 403
              ? "Settings are restricted to the academy owner."
              : "Settings could not be loaded.")
        );
      }
      const hydrated = hydrateSettings(result.settings);
      setData({ ...(result as SettingsResponse), settings: hydrated });
      setDraft(hydrated);
      if (
        result.profile?.role !== "super_admin" &&
        result.profile?.role !== "owner"
      )
        setDenied(true);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Settings could not be loaded."
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEmail = useCallback(async () => {
    setEmailLoading(true);
    setMessageError("");
    try {
      const response = await fetch("/api/email", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await readJson<{
        messages?: EmailMessage[];
        smtpTest?: SmtpTest | null;
        error?: string;
      }>(response);
      if (!response.ok)
        throw new Error(result.error || "Delivery log is unavailable.");
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      setSmtpTest(result.smtpTest ?? null);
    } catch (cause) {
      setMessageError(
        cause instanceof Error ? cause.message : "Delivery log is unavailable."
      );
      setSmtpTest(null);
    } finally {
      setEmailLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const owner =
    data?.profile.role === "super_admin" || data?.profile.role === "owner";

  useEffect(() => {
    if (owner) void loadEmail();
  }, [owner, loadEmail]);

  const changed =
    !!data && !!draft && JSON.stringify(data.settings) !== JSON.stringify(draft);

  const smtpStatus = !data?.integrations.smtpConfigured
    ? { detail: "SMTP credentials are not configured.", badge: "Not configured" }
    : emailLoading
    ? { detail: "Checking the saved SMTP test status…", badge: "Checking" }
    : messageError
    ? {
        detail: "The saved SMTP test status could not be loaded.",
        badge: "Unavailable",
      }
    : !smtpTest
    ? { detail: "No SMTP test has been recorded.", badge: "Not tested" }
    : smtpTest.status === "sent"
    ? {
        detail: `The SMTP server accepted the latest test email on ${dateLabel(
          smtpTest.sent_at ?? smtpTest.created_at
        )}.`,
        badge: "Accepted",
      }
    : smtpTest.status === "failed"
    ? { detail: "The latest recorded SMTP test failed.", badge: "Failed" }
    : smtpTest.status === "cancelled"
    ? {
        detail: "The latest recorded SMTP test was cancelled.",
        badge: "Cancelled",
      }
    : {
        detail: `The latest SMTP test is ${smtpTest.status}.`,
        badge: label(smtpTest.status),
      };

  function setNumber(key: NumberKey, value: string) {
    setDraft((current) =>
      current ? { ...current, [key]: value === "" ? 0 : Number(value) } : current
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !draft || !owner || !event.currentTarget.reportValidity())
      return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: data.revision, settings: draft }),
      });
      const result = await readJson<{ ok?: boolean; error?: string }>(response);
      if (response.status === 409) {
        await load();
        setError(
          result.error ||
            "These settings changed elsewhere. The latest saved values have been reloaded."
        );
        return;
      }
      if (!response.ok || result.ok !== true)
        throw new Error(result.error || "The save was not confirmed.");
      const refreshed = await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("pw-academy-config-updated"));
      }
      if (!refreshed) {
        setNotice("");
        setError(
          "The save was accepted, but the latest saved values could not be confirmed. Reload settings to verify."
        );
        return;
      }
      setNotice(
        "Academy rules saved and reloaded. Lesson length applies to new lessons; notice, capacity and room-window rules apply immediately."
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Settings could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  async function verifyEmail() {
    setTesting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await readJson<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || result.ok !== true)
        throw new Error(result.error || "Verification could not be confirmed.");
      setNotice(
        "Verification email accepted for delivery to your verified owner address."
      );
      await loadEmail();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Verification email could not be sent."
      );
      await loadEmail();
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="pw-settings">
      <div className="ps-content">
        <div className="ps-intro">
          <div>
            <h1>Settings</h1>
            <p>
              Configure academy-wide rules, role permissions, catalogs,
              multi-currency finance settings, and email delivery.
            </p>
          </div>
          {data && (
            <div
              className={`ps-revision ${changed ? "unsaved" : ""}`}
              role="status"
            >
              {changed
                ? `Unsaved · revision ${data.revision}`
                : `Saved revision ${data.revision}`}
            </div>
          )}
        </div>

        {error && (
          <div className={`ps-alert ${denied ? "denied" : ""}`} role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>
                {denied ? "Owner access required" : "Action needs attention"}
              </strong>
              <p>{error}</p>
            </div>
            {!denied && (
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
              >
                Reload settings
              </button>
            )}
          </div>
        )}

        {notice && (
          <div className="ps-alert success" role="status">
            <Check size={18} />
            <div>
              <strong>Confirmed</strong>
              <p>{notice}</p>
            </div>
          </div>
        )}

        {loading && !data && (
          <div
            className="ps-loading"
            aria-label="Loading academy settings"
            aria-busy="true"
          >
            <div className="ps-skeleton wide" />
            <div className="ps-skeleton" />
            <div className="ps-skeleton" />
            <div className="ps-skeleton" />
          </div>
        )}

        {denied && !loading && (
          <section className="ps-denied">
            <span>
              <ShieldCheck size={24} />
            </span>
            <h2>These controls are private</h2>
            <p>
              Only the academy owner can view or change governance settings.
              Your existing access to the workspace is unchanged.
            </p>
            <a href="/">Return to workspace</a>
          </section>
        )}

        {!denied && data && draft && (
          <>
            <nav className="portal-tabs" aria-label="Settings sections">
              <button
                type="button"
                className={`portal-tab ${
                  activeTab === "general" ? "active" : ""
                }`}
                onClick={() => selectTab("general")}
              >
                <Sliders size={14} /> General &amp; Rules
                {changed && <span className="portal-tab-badge">•</span>}
              </button>
              <button
                type="button"
                className={`portal-tab ${
                  activeTab === "roles" ? "active" : ""
                }`}
                onClick={() => selectTab("roles")}
              >
                <Shield size={14} /> Roles &amp; Permissions
              </button>
              <button
                type="button"
                className={`portal-tab ${
                  activeTab === "catalogs" ? "active" : ""
                }`}
                onClick={() => selectTab("catalogs")}
              >
                <BookOpen size={14} /> Catalogs
              </button>
              <button
                type="button"
                className={`portal-tab ${
                  activeTab === "finance" ? "active" : ""
                }`}
                onClick={() => selectTab("finance")}
              >
                <Coins size={14} /> Finance &amp; FX
              </button>
              <button
                type="button"
                className={`portal-tab ${
                  activeTab === "email" ? "active" : ""
                }`}
                onClick={() => selectTab("email")}
              >
                <Mail size={14} /> Email &amp; Logs
                {messages.length > 0 && (
                  <span className="portal-tab-badge">{messages.length}</span>
                )}
              </button>
              <button
                type="button"
                className={`portal-tab ${
                  activeTab === "meta" ? "active" : ""
                }`}
                onClick={() => selectTab("meta")}
              >
                <Share2 size={14} /> Meta Lead Ads
              </button>
            </nav>

            {/* TAB 1: General & Rules */}
            {activeTab === "general" && (
              <form onSubmit={save}>
                <div
                  className="ps-layout"
                  data-portal-layout="academy-settings"
                >
                  <div className="ps-stack">
                    <section
                      className="ps-card ps-setting-group"
                      aria-labelledby="lesson-rules"
                    >
                      <header className="ps-card-head">
                        <div>
                          <h2 id="lesson-rules">Lesson rules</h2>
                        </div>
                      </header>
                      <div className="ps-fields">
                        {numericFields.slice(0, 7).map((field) => (
                          <label className="ps-number" key={field.key}>
                            <span className="ps-number-copy">
                              <strong>{field.title}</strong>
                              <small>{field.detail}</small>
                            </span>
                            <span className="ps-number-input">
                              <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step="1"
                                required
                                value={draft[field.key]}
                                onChange={(event) =>
                                  setNumber(field.key, event.target.value)
                                }
                                aria-label={field.title}
                              />
                              <small>{field.suffix}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="ps-note">
                        <span>
                          <strong>Student room window</strong> Current rule
                          allows access up to {draft.joinBeforeHours} hour
                          {draft.joinBeforeHours === 1 ? "" : "s"} before class
                          and keeps the room open for {draft.joinAfterHours}{" "}
                          hours after its start.
                        </span>
                      </div>
                    </section>

                    <section
                      className="ps-card ps-setting-group"
                      aria-labelledby="staffing-rules"
                    >
                      <header className="ps-card-head">
                        <div>
                          <h2 id="staffing-rules">
                            Staffing, session &amp; routing defaults
                          </h2>
                        </div>
                      </header>
                      <label className="ps-number ps-quota">
                        <span className="ps-number-copy">
                          <strong>{numericFields[7].title}</strong>
                          <small>{numericFields[7].detail}</small>
                        </span>
                        <span className="ps-number-input">
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            step="1"
                            required
                            value={draft.adminParentQuota}
                            onChange={(event) =>
                              setNumber("adminParentQuota", event.target.value)
                            }
                            aria-label="Admin parent quota"
                          />
                          <small>parents</small>
                        </span>
                      </label>
                      <label className="ps-number">
                        <span className="ps-number-copy">
                          <strong>{numericFields[8].title}</strong>
                          <small>{numericFields[8].detail}</small>
                        </span>
                        <span className="ps-number-input">
                          <input
                            type="number"
                            min={15}
                            max={480}
                            step="1"
                            required
                            value={draft.inactivityTimeoutMinutes}
                            onChange={(event) =>
                              setNumber(
                                "inactivityTimeoutMinutes",
                                event.target.value
                              )
                            }
                            aria-label="Session inactivity timeout"
                          />
                          <small>min</small>
                        </span>
                      </label>
                      <div className="ps-routing-grid">
                        <label className="ps-finance-field">
                          Default academy timezone
                          <input
                            type="text"
                            required
                            maxLength={100}
                            list="iana-timezones"
                            value={draft.defaultTimezone}
                            onChange={(event) =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      defaultTimezone: event.target.value,
                                    }
                                  : current
                              )
                            }
                            placeholder="Africa/Lagos"
                          />
                          <datalist id="iana-timezones">
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
                          {!isValidIanaTimezone(draft.defaultTimezone) && (
                            <small
                              style={{
                                color: "#dc2626",
                                marginTop: "4px",
                                display: "block",
                              }}
                            >
                              Enter a valid IANA timezone (e.g. Africa/Lagos,
                              Europe/London).
                            </small>
                          )}
                        </label>
                        {emailFields.map((ef) => (
                          <label className="ps-finance-field" key={ef.key}>
                            {ef.label}
                            <input
                              type="email"
                              required
                              maxLength={254}
                              value={draft.emails[ef.key]}
                              onChange={(event) =>
                                setDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        emails: {
                                          ...current.emails,
                                          [ef.key]: event.target.value,
                                        },
                                      }
                                    : current
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="ps-rule-row">
                        <span>
                          <strong>Vacation payroll delegation</strong>
                          <small>
                            When enabled, Finance submissions are automatically
                            approved under your recorded authorization. Disable
                            it to require your review of every batch.
                          </small>
                        </span>
                        <label className="ps-switch">
                          <input
                            type="checkbox"
                            checked={draft.vacationAutoApprove}
                            onChange={(event) =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      vacationAutoApprove: event.target.checked,
                                    }
                                  : current
                              )
                            }
                          />
                          <span aria-hidden="true" />
                          <b>{draft.vacationAutoApprove ? "On" : "Off"}</b>
                        </label>
                      </div>
                    </section>

                    <div className="ps-form-actions">
                      <span>
                        {changed
                          ? "You have unsaved changes in General & Rules."
                          : "All General & Rules settings are up to date."}
                      </span>
                      <button
                        className="ps-primary"
                        type="submit"
                        disabled={
                          saving ||
                          !changed ||
                          !isValidIanaTimezone(draft.defaultTimezone)
                        }
                      >
                        {saving ? (
                          <>
                            <RefreshCw size={15} className="ps-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Save size={15} />
                            Save changes
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <aside className="ps-stack">
                    <section
                      className="ps-card ps-setting-group"
                      aria-labelledby="payroll-heading"
                    >
                      <header className="ps-card-head">
                        <div>
                          <h2 id="payroll-heading">Payroll foundations</h2>
                        </div>
                      </header>
                      <label className="ps-select-field">
                        <span>Week anchor</span>
                        <select
                          value={draft.payrollWeekAnchor}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    payrollWeekAnchor: event.target
                                      .value as Settings["payrollWeekAnchor"],
                                  }
                                : current
                            )
                          }
                        >
                          <option value="not_configured">Not configured</option>
                          <option value="calendar_month">Calendar month</option>
                          <option value="pay_cycle">Pay cycle</option>
                        </select>
                      </label>
                      <label className="ps-select-field">
                        <span>Advance eligibility</span>
                        <select
                          value={draft.advanceEligibility}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    advanceEligibility: event.target
                                      .value as Settings["advanceEligibility"],
                                  }
                                : current
                            )
                          }
                        >
                          <option value="not_configured">Not configured</option>
                          <option value="owner_selected">Owner selected</option>
                          <option value="previous_period_verified">
                            Previous period verified
                          </option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </label>
                      <div className="ps-caveat">
                        <strong>Verified-attendance payroll</strong>
                        <span>
                          These rules now drive salary calculations. Staff rates
                          require your approval, and Finance must confirm exact
                          course starts and weekly frequency.{" "}
                          <a href="/payroll">Open payroll</a>
                        </span>
                      </div>
                    </section>

                    <section
                      className="ps-card ps-integrations"
                      aria-labelledby="connections-heading"
                    >
                      <header className="ps-card-head">
                        <div>
                          <h2 id="connections-heading">Connected services</h2>
                          <p>Configuration status only; no live credentials.</p>
                        </div>
                        <Link2 size={18} className="ps-muted-icon" />
                      </header>
                      <div className="ps-service">
                        <span className="ps-service-icon">
                          <span
                            className={`ps-status-dot ${
                              data.integrations.livekitConfigured
                                ? "configured"
                                : ""
                            }`}
                          />
                        </span>
                        <span>
                          <strong>Live lesson rooms</strong>
                          <small>
                            {data.integrations.livekitConfigured
                              ? "Credentials configured"
                              : "Not configured"}
                          </small>
                        </span>
                        <em>
                          {data.integrations.livekitConfigured
                            ? "Configured"
                            : "Unavailable"}
                        </em>
                      </div>
                      <div className="ps-service">
                        <span className="ps-service-icon">
                          <Mail size={17} />
                        </span>
                        <span>
                          <strong>Email delivery</strong>
                          <small>{smtpStatus.detail}</small>
                        </span>
                        <em>{smtpStatus.badge}</em>
                      </div>
                      <div className="ps-service-foot">
                        No credentials are displayed or entered in this
                        workspace.
                      </div>
                    </section>
                  </aside>
                </div>
              </form>
            )}

            {/* TAB 2: Roles & Permissions */}
            {activeTab === "roles" && (
              <RolePermissionsSettings role={data.profile.role} />
            )}

            {/* TAB 3: Catalogs */}
            {activeTab === "catalogs" && (
              <CatalogSettings role={data.profile.role} />
            )}

            {/* TAB 4: Finance & FX */}
            {activeTab === "finance" && (
              <FinanceSettings role={data.profile.role} />
            )}

            {/* TAB 5: Email & Logs */}
            {activeTab === "email" && (
              <div className="ps-stack">
                <section
                  className="ps-card ps-integrations"
                  aria-labelledby="smtp-status-heading"
                >
                  <header className="ps-card-head">
                    <div>
                      <h2 id="smtp-status-heading">SMTP configuration status</h2>
                      <p>
                        Verify outbound email delivery to your signed-in owner
                        address.
                      </p>
                    </div>
                    <button
                      className="ps-outline"
                      type="button"
                      onClick={() => void verifyEmail()}
                      disabled={testing || !data.integrations.smtpConfigured}
                    >
                      {testing ? (
                        <>
                          <RefreshCw size={14} className="ps-spin" />
                          Sending…
                        </>
                      ) : (
                        <>
                          <Mail size={14} />
                          Send verification email
                        </>
                      )}
                    </button>
                  </header>
                  <div className="ps-service">
                    <span className="ps-service-icon">
                      <Mail size={17} />
                    </span>
                    <span>
                      <strong>Outbound SMTP delivery</strong>
                      <small>{smtpStatus.detail}</small>
                    </span>
                    <em>{smtpStatus.badge}</em>
                  </div>
                </section>

                <section
                  className="ps-card ps-mail-card"
                  style={{ marginTop: 0 }}
                  aria-labelledby="mail-heading"
                >
                  <header className="ps-card-head">
                    <div>
                      <h2 id="mail-heading">Recent email delivery log</h2>
                      <p>
                        Queued, sent, and failed transactional emails recorded
                        by the portal.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ps-outline"
                      onClick={() => void loadEmail()}
                      disabled={emailLoading}
                    >
                      <RefreshCw
                        size={13}
                        className={emailLoading ? "ps-spin" : undefined}
                      />
                      Refresh log
                    </button>
                  </header>
                  {messageError ? (
                    <div className="ps-log-state error" role="alert">
                      {messageError}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="ps-log-state">
                      No delivery records are available yet.
                    </div>
                  ) : (
                    <div className="ps-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Message</th>
                            <th>Category</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Sent</th>
                            <th>Attempts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {messages.map((item) => (
                            <tr key={item.id}>
                              <td>{item.subject || "Email message"}</td>
                              <td>{label(item.category)}</td>
                              <td>
                                <span
                                  className={`ps-status-pill ${
                                    item.status === "sent" ? "sent" : ""
                                  }`}
                                >
                                  {label(item.status)}
                                </span>
                              </td>
                              <td>{dateLabel(item.created_at)}</td>
                              <td>
                                {item.sent_at ? dateLabel(item.sent_at) : "—"}
                              </td>
                              <td>{item.attempts}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB 6: Meta Lead Ads Integration */}
            {activeTab === "meta" && (
              <MetaSettings role={data.profile.role} />
            )}
          </>
        )}

        <footer className="ps-footer">
          <span>ProsperWork · Music Concepts</span>
          <span>Private academy operations</span>
        </footer>
      </div>
    </main>
  );
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}
