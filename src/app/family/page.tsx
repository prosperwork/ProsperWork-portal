"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRoundPlus,
  X,
} from "lucide-react";
import type { FamilyResponse } from "@/lib/academy/family";
import type { LearningResponse } from "@/lib/academy/learning";
import BrandEmblem from "@/app/_components/BrandEmblem";
import ProfileAvatar from "@/app/_components/ProfileAvatar";

type StudentForm = { password: string };
type ActionResult = Record<string, unknown>;

async function readJson(response: Response): Promise<ActionResult> {
  const copy = response.clone();
  try {
    return (await response.json()) as ActionResult;
  } catch {
    const text = await copy.text().catch(() => "");
    return text ? { error: text } : {};
  }
}
function normalizedRole(role: string) {
  return role.toLowerCase().replace(/[\s-]+/g, "_");
}
function ageOf(dob: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!match) return "Age unavailable";
  const now = new Date();
  let age = now.getFullYear() - Number(match[1]);
  const month = now.getMonth() + 1;
  if (
    month < Number(match[2]) ||
    (month === Number(match[2]) && now.getDate() < Number(match[3]))
  )
    age--;
  return age < 0 ? "Age unavailable" : `${age} ${age === 1 ? "year" : "years"}`;
}
function sameOriginPath(value: unknown, path: string) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.pathname !== path)
      return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
function dateLabel(value: string, timezone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time to be confirmed";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
}
async function apiError(response: Response, result?: ActionResult) {
  if (typeof result?.error === "string") return result.error;
  if (typeof result?.message === "string") return result.message;
  const text = await response.text().catch(() => "");
  return text || `The request could not be completed (${response.status}).`;
}

export default function FamilyPage() {
  const [family, setFamily] = useState<FamilyResponse | null>(null);
  const [learning, setLearning] = useState<LearningResponse | null>(null);
  const [learningError, setLearningError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [studentForms, setStudentForms] = useState<Record<string, StudentForm>>(
    {}
  );
  const [pin, setPin] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [consentBusyId, setConsentBusyId] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newInstrument, setNewInstrument] = useState("Piano");
  const [newConsent, setNewConsent] = useState(false);
  const [createLogin, setCreateLogin] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  const role = normalizedRole(family?.profile.role ?? "");
  const active = family?.profile.status.trim().toLowerCase() === "active";
  const isParent = role === "parent";
  const canManageChildren = Boolean(
    active && (isParent || role === "owner" || role === "super_admin")
  );
  const lessonsByStudent = useMemo(() => {
    const grouped = new Map<string, LearningResponse["lessons"]>();
    for (const lesson of learning?.lessons ?? []) {
      const existing = grouped.get(lesson.studentId) ?? [];
      grouped.set(lesson.studentId, [...existing, lesson]);
    }
    return grouped;
  }, [learning?.lessons]);

  const load = useCallback(async (): Promise<FamilyResponse | null> => {
    setRefreshing(true);
    setError("");
    setLearningError("");
    try {
      const [familyResponse, learningResponse] = await Promise.all([
        fetch("/api/family", { credentials: "include", cache: "no-store" }),
        fetch("/api/learning", {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null),
      ]);
      const familyResult = await readJson(familyResponse);
      if (familyResponse.status === 401) {
        window.location.assign("/login");
        return null;
      }
      if (
        familyResponse.status === 403 &&
        familyResult.redirect === "/onboarding"
      ) {
        window.location.assign("/onboarding");
        return null;
      }
      if (!familyResponse.ok)
        throw new Error(await apiError(familyResponse, familyResult));
      const result = familyResult as unknown as FamilyResponse;
      if (!result.profile || !Array.isArray(result.children))
        throw new Error("The family response was incomplete.");
      setFamily(result);
      if (!learningResponse) {
        setLearningError(
          "The lesson service could not be reached. Family information is still available."
        );
        setLearning(null);
      } else if (learningResponse.status === 401) {
        setLearningError(
          "Your lesson list needs an active session. Sign in again to open lesson progress."
        );
        setLearning(null);
      } else if (learningResponse.ok) {
        const learningResult = (await readJson(
          learningResponse
        )) as unknown as LearningResponse;
        if (Array.isArray(learningResult.lessons)) {
          setLearning(learningResult);
          setLearningError("");
        } else {
          setLearning(null);
          setLearningError("Lesson progress could not be verified.");
        }
      } else {
        const learningResult = await readJson(learningResponse);
        setLearning(null);
        setLearningError(await apiError(learningResponse, learningResult));
      }
      return result;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Family information could not be loaded."
      );
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postAction = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch("/api/family", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await readJson(response);
    if (!response.ok || result.ok === false)
      throw new Error(await apiError(response, result));
    return result;
  }, []);

  const studentForm = (id: string) => studentForms[id] ?? { password: "" };
  const updateStudentForm = (id: string, patch: Partial<StudentForm>) =>
    setStudentForms((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { password: "" }), ...patch },
    }));

  const createStudentAccount = async (
    event: FormEvent<HTMLFormElement>,
    childId: string
  ) => {
    event.preventDefault();
    if (!canManageChildren) return;
    const form = studentForm(childId);
    setActionError("");
    setFeedback("");
    setActionBusy(`account:${childId}`);
    try {
      const result = await postAction({
        action: "student_account",
        childId,
        password: form.password,
      });
      const fresh = await load();
      const child = fresh?.children.find((item) => item.id === childId);
      const returnedUsername =
        typeof result.username === "string"
          ? result.username
          : result.result &&
            typeof result.result === "object" &&
            "username" in result.result &&
            typeof result.result.username === "string"
          ? result.result.username
          : child?.username;
      if (!child?.studentUserId || !returnedUsername) {
        throw new Error(
          "The account request returned, but the student account could not be confirmed. Refresh and check before retrying."
        );
      }
      setStudentForms((current) => ({
        ...current,
        [childId]: { password: "" },
      }));
      setFeedback(
        `Student account created for ${child.name}. Generated username: ${returnedUsername}.`
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Student account could not be created."
      );
    } finally {
      setActionBusy("");
    }
  };

  const resetStudentPassword = async (
    event: FormEvent<HTMLFormElement>,
    childId: string
  ) => {
    event.preventDefault();
    if (!canManageChildren) return;
    const form = studentForm(childId);
    setActionError("");
    setFeedback("");
    setActionBusy(`password:${childId}`);
    try {
      await postAction({
        action: "student_password",
        childId,
        password: form.password,
      });
      updateStudentForm(childId, { password: "" });
      setFeedback("Student password reset.");
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Student password could not be reset."
      );
    } finally {
      setActionBusy("");
    }
  };

  const saveGuardianPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || !isParent) return;
    setActionError("");
    setFeedback("");
    setActionBusy("pin");
    try {
      await postAction({ action: "pin", pin, password: parentPassword });
      const fresh = await load();
      if (!fresh?.pinConfigured)
        throw new Error(
          "PIN settings were not confirmed by the family API. Refresh before assuming your PIN is configured."
        );
      setPin("");
      setParentPassword("");
      setFeedback("Guardian return PIN saved.");
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Guardian PIN could not be saved."
      );
    } finally {
      setActionBusy("");
    }
  };

  const enterKidMode = async (childId: string) => {
    if (!active || !isParent) return;
    setActionError("");
    setFeedback("");
    setActionBusy(`kid:${childId}`);
    try {
      const result = await postAction({ action: "enter_kid", childId });
      const redirect = sameOriginPath(result.redirect, "/kid");
      if (!redirect) {
        throw new Error(
          "Kid Mode could not be confirmed. The family API did not return its session redirect."
        );
      }
      window.location.assign(redirect);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Kid Mode could not be opened."
      );
      setActionBusy("");
    }
  };

  const saveConsent = async (childId: string, consent: boolean) => {
    if (!canManageChildren) return;
    setConsentBusyId(childId);
    setActionError("");
    setFeedback("");
    try {
      const response = await fetch("/api/family", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "media_consent", childId, consent }),
      });
      const result = await readJson(response);
      if (!response.ok || result.ok === false)
        throw new Error(await apiError(response, result));
      const fresh = await load();
      if (
        fresh?.children.find((child) => child.id === childId)?.consent !==
        consent
      ) {
        throw new Error(
          "The consent change was not confirmed by the family API. Refresh the family view."
        );
      }
      setFeedback("Media consent updated.");
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Media consent could not be updated."
      );
    } finally {
      setConsentBusyId("");
    }
  };

  const handleAddStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageChildren) return;
    if (createLogin && newPassword.length < 8) {
      setAddError("Student password must be at least 8 characters.");
      return;
    }
    setAddError("");
    setAddBusy(true);
    try {
      const res = await postAction({
        action: "create_student",
        name: newName.trim(),
        dob: newDob,
        instrument: newInstrument,
        consent: newConsent,
        createLogin,
        password: createLogin ? newPassword : undefined,
      });
      setShowAddModal(false);
      const studentNameAdded = newName.trim();
      setNewName("");
      setNewDob("");
      setNewInstrument("Piano");
      setNewConsent(false);
      setCreateLogin(false);
      setNewPassword("");
      await load();
      const loginNotice = res?.username
        ? ` Login created with username: ${res.username}.`
        : "";
      setFeedback(
        `Student profile added for ${studentNameAdded}.${loginNotice}`
      );
    } catch (cause) {
      setAddError(
        cause instanceof Error ? cause.message : "Failed to add student."
      );
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <main className="pw-family">
      <div className="family-topline" />
      <section className="family-content">
        <div className="family-heading">
          <h1>Family accounts</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {canManageChildren && (
              <button
                type="button"
                className="family-button primary"
                onClick={() => {
                  setAddError("");
                  setShowAddModal(true);
                }}
              >
                <Plus size={14} aria-hidden="true" /> Add student
              </button>
            )}
            <button
              type="button"
              className="family-button subtle"
              onClick={() => void load()}
              disabled={refreshing}
            >
              <RefreshCw size={14} aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>
        {family && !active && (
          <div className="family-alert info" role="status">
            <ShieldCheck size={16} />
            <p>
              This account is not active. Family information remains available,
              while account, PIN, consent, and photo changes are read-only.
            </p>
          </div>
        )}
        {error && (
          <div className="family-alert" role="alert">
            <AlertCircle size={16} />
            <p>{error}</p>
            <button
              className="family-button subtle"
              type="button"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}
        {feedback && (
          <div className="family-alert success" role="status">
            <Check size={16} />
            <p>{feedback}</p>
          </div>
        )}
        {actionError && (
          <div className="family-alert" role="alert">
            <AlertCircle size={16} />
            <p>{actionError}</p>
          </div>
        )}
        {family && isParent && active && !family.pinConfigured && (
          <div className="family-alert info" role="status">
            <KeyRound size={16} />
            <p>
              Set a guardian return PIN before entering Kid Mode. The PIN is
              only used to return; it is not requested to enter.
            </p>
          </div>
        )}
        {learningError && (
          <div className="family-alert info" role="status">
            <BookOpen size={16} />
            <p>Lesson progress is temporarily unavailable: {learningError}</p>
            <button
              className="family-button subtle"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        )}
        {loading && !family ? (
          <div className="family-grid">
            <div className="family-card family-card-body">
              <div className="family-stack">
                <div className="family-skeleton" />
                <div className="family-skeleton" />
                <div className="family-skeleton" />
              </div>
            </div>
            <div className="family-card family-card-body">
              <div className="family-skeleton" />
            </div>
          </div>
        ) : (
          family && (
            <div
              className="family-grid"
              data-portal-layout="family-records"
              data-family-has-side-panel={isParent ? "true" : "false"}
            >
              <section
                className="family-card family-roster-panel"
                aria-labelledby="children-title"
              >
                <div className="family-card-head">
                  <div>
                    <h2 id="children-title">Students in your family</h2>
                    <p>
                      {family.children.length
                        ? "Private student details and live lesson links."
                        : "Students appear here when they are linked to your family account."}
                    </p>
                  </div>
                  {family.children.length > 0 && (
                    <BrandEmblem className="family-header-emblem" />
                  )}
                </div>
                {family.children.length ? (
                  <div className="family-card-body">
                    <div className="family-child-list">
                      {family.children.map((child) => {
                        const assignedLessons =
                          lessonsByStudent.get(child.id) ?? [];
                        const form = studentForm(child.id);
                        const studentAccountBusy =
                          actionBusy === `account:${child.id}` ||
                          actionBusy === `password:${child.id}`;
                        return (
                          <article className="family-child" key={child.id}>
                            <div className="family-child-top">
                              <div className="family-child-name">
                                <ProfileAvatar
                                  profileId={child.studentUserId}
                                  name={child.name}
                                  size={37}
                                />
                                <div>
                                  <h3>{child.name}</h3>
                                  <p>
                                    {child.username
                                      ? `Student username · ${child.username}`
                                      : "Supervised child profile (Kid Mode)"}
                                  </p>
                                </div>
                              </div>
                              {isParent && active && (
                                <button
                                  type="button"
                                  className="family-button primary"
                                  onClick={() => void enterKidMode(child.id)}
                                  disabled={
                                    actionBusy === `kid:${child.id}` ||
                                    !family.pinConfigured
                                  }
                                >
                                  {actionBusy === `kid:${child.id}` ? (
                                    <>
                                      <LoaderCircle size={14} /> Opening…
                                    </>
                                  ) : (
                                    <>
                                      <LockKeyhole size={14} /> Enter Kid Mode
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="family-child-facts">
                              <div className="family-fact">
                                <small>Instrument</small>
                                <strong>{child.instrument || "Piano"}</strong>
                              </div>
                              <div className="family-fact">
                                <small>Date of birth</small>
                                <strong>
                                  {child.dob
                                    ? new Intl.DateTimeFormat(undefined, {
                                        dateStyle: "medium",
                                      }).format(
                                        new Date(
                                          `${child.dob.slice(0, 10)}T12:00:00`
                                        )
                                      )
                                    : "Not provided"}
                                </strong>
                              </div>
                              <div className="family-fact">
                                <small>Age</small>
                                <strong>{ageOf(child.dob)}</strong>
                              </div>
                              <div className="family-fact">
                                <small>Practice rank</small>
                                <strong>{child.rank || "Not ranked"}</strong>
                              </div>
                            </div>
                            {canManageChildren && (
                              <div>
                                {!child.studentUserId ? (
                                  <form
                                    onSubmit={(event) =>
                                      void createStudentAccount(event, child.id)
                                    }
                                  >
                                    <div className="family-form-inline">
                                      <div className="family-field">
                                        <label
                                          htmlFor={`student-password-${child.id}`}
                                        >
                                          Initial password
                                        </label>
                                        <input
                                          id={`student-password-${child.id}`}
                                          required
                                          minLength={8}
                                          maxLength={128}
                                          type="password"
                                          autoComplete="new-password"
                                          value={form.password}
                                          onChange={(event) =>
                                            updateStudentForm(child.id, {
                                              password: event.target.value,
                                            })
                                          }
                                        />
                                        <small>
                                          At least 8 characters. A username is
                                          generated automatically.
                                        </small>
                                      </div>
                                    </div>
                                    <div className="family-form-actions">
                                      <button
                                        className="family-button primary"
                                        type="submit"
                                        disabled={studentAccountBusy}
                                      >
                                        {studentAccountBusy ? (
                                          <>
                                            <LoaderCircle size={14} /> Creating…
                                          </>
                                        ) : (
                                          <>
                                            <UserRoundPlus size={14} /> Create
                                            student login
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <form
                                    onSubmit={(event) =>
                                      void resetStudentPassword(event, child.id)
                                    }
                                    className="family-form-inline"
                                  >
                                    <div className="family-field">
                                      <label
                                        htmlFor={`reset-password-${child.id}`}
                                      >
                                        Reset student password
                                      </label>
                                      <input
                                        id={`reset-password-${child.id}`}
                                        required
                                        minLength={8}
                                        maxLength={128}
                                        type="password"
                                        autoComplete="new-password"
                                        value={form.password}
                                        onChange={(event) =>
                                          updateStudentForm(child.id, {
                                            password: event.target.value,
                                          })
                                        }
                                      />
                                      <small>At least 8 characters.</small>
                                    </div>
                                    <div
                                      className="family-form-actions"
                                      style={{
                                        alignItems: "end",
                                        marginTop: 0,
                                      }}
                                    >
                                      <button
                                        className="family-button"
                                        type="submit"
                                        disabled={studentAccountBusy}
                                      >
                                        {studentAccountBusy ? (
                                          <>
                                            <LoaderCircle size={14} /> Updating…
                                          </>
                                        ) : (
                                          <>
                                            <KeyRound size={14} /> Reset
                                            password
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </form>
                                )}
                              </div>
                            )}
                            {canManageChildren && active && (
                              <label className="family-consent">
                                <input
                                  type="checkbox"
                                  checked={child.consent}
                                  disabled={consentBusyId === child.id}
                                  onChange={(event) =>
                                    void saveConsent(
                                      child.id,
                                      event.target.checked
                                    )
                                  }
                                />
                                <span>
                                  Optional media-sharing consent
                                  <small>
                                    This choice is separate from lesson access
                                    and can be changed here.
                                  </small>
                                </span>
                              </label>
                            )}
                            <div
                              className="family-lesson-links"
                              aria-label={`Lessons for ${child.name}`}
                            >
                              {assignedLessons.length ? (
                                assignedLessons.map((lesson) => (
                                  <div
                                    className="family-lesson-link"
                                    key={lesson.id}
                                  >
                                    <span>
                                      <CalendarDays
                                        size={13}
                                        aria-hidden="true"
                                      />{" "}
                                      {lesson.title} ·{" "}
                                      {dateLabel(
                                        lesson.startsAt,
                                        lesson.studentTimezone
                                      )}
                                    </span>
                                    <span style={{ display: "flex", gap: 6 }}>
                                      <Link
                                        href={`/learning?lessonId=${encodeURIComponent(
                                          lesson.id
                                        )}`}
                                        aria-label={`Open ${lesson.title} progress`}
                                      >
                                        Progress <ArrowRight size={12} />
                                      </Link>
                                      <Link
                                        href={`/classroom?lessonId=${encodeURIComponent(
                                          lesson.id
                                        )}`}
                                        aria-label={`Join ${lesson.title} classroom`}
                                      >
                                        <ExternalLink size={13} />
                                      </Link>
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <p className="family-upload-note">
                                  No current lessons were returned for this
                                  student.
                                </p>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="family-empty">
                    <span className="family-empty-mark">
                      <BrandEmblem className="family-empty-emblem" />
                    </span>
                    <strong>No linked students yet</strong>
                    <p>
                      Student profiles are scoped to the family relationships on
                      your account.
                    </p>
                    {canManageChildren && (
                      <button
                        type="button"
                        className="family-button primary"
                        style={{ marginTop: 16 }}
                        onClick={() => {
                          setAddError("");
                          setShowAddModal(true);
                        }}
                      >
                        <Plus size={14} aria-hidden="true" /> Add child /
                        student
                      </button>
                    )}
                  </div>
                )}
              </section>
              {isParent && (
                <aside className="family-stack">
                  <section className="family-card" aria-labelledby="pin-title">
                    <div className="family-card-head">
                      <div>
                        <h2 id="pin-title">Guardian return PIN</h2>
                        <p>
                          A four-digit PIN is requested only when leaving
                          supervised Kid Mode.
                        </p>
                      </div>
                      <KeyRound size={17} color="#6a9d7b" aria-hidden="true" />
                    </div>
                    <div className="family-card-body">
                      <div className="family-focus">
                        {family.pinConfigured
                          ? "A guardian PIN is configured. The PIN itself is never returned to this page."
                          : "No return PIN is configured yet."}
                      </div>
                      {active && (
                        <form onSubmit={(event) => void saveGuardianPin(event)}>
                          <div className="family-field">
                            <label htmlFor="guardian-pin">
                              New 4-digit PIN
                            </label>
                            <input
                              id="guardian-pin"
                              required
                              inputMode="numeric"
                              autoComplete="new-password"
                              pattern="\d{4}"
                              maxLength={4}
                              value={pin}
                              onChange={(event) =>
                                setPin(
                                  event.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 4)
                                )
                              }
                            />
                            <small>
                              Do not use a PIN the child already knows.
                            </small>
                          </div>
                          <div className="family-field">
                            <label htmlFor="guardian-password">
                              Your current password
                            </label>
                            <input
                              id="guardian-password"
                              required
                              type="password"
                              autoComplete="current-password"
                              value={parentPassword}
                              onChange={(event) =>
                                setParentPassword(event.target.value)
                              }
                            />
                          </div>
                          <div className="family-form-actions">
                            <button
                              className="family-button primary"
                              type="submit"
                              disabled={
                                actionBusy === "pin" ||
                                pin.length !== 4 ||
                                !parentPassword
                              }
                            >
                              {actionBusy === "pin" ? (
                                <>
                                  <LoaderCircle size={14} /> Saving…
                                </>
                              ) : (
                                <>
                                  <KeyRound size={14} />{" "}
                                  {family.pinConfigured
                                    ? "Change PIN"
                                    : "Set guardian PIN"}
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </section>
                </aside>
              )}
            </div>
          )
        )}
      </section>

      {showAddModal && (
        <div
          className="family-modal-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div
            className="family-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-student-title"
          >
            <div className="family-modal-header">
              <h2 id="add-student-title" className="family-modal-title">
                Add student / child
              </h2>
              <button
                type="button"
                className="family-modal-close"
                onClick={() => setShowAddModal(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddStudent} className="family-modal-form">
              {addError && (
                <div
                  className="family-alert"
                  role="alert"
                  style={{ margin: 0 }}
                >
                  <AlertCircle size={16} />
                  <p>{addError}</p>
                </div>
              )}
              <div className="family-field">
                <label htmlFor="new-student-name">Student full name *</label>
                <input
                  id="new-student-name"
                  required
                  minLength={2}
                  maxLength={120}
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div className="family-field">
                <label htmlFor="new-student-dob">Date of birth *</label>
                <input
                  id="new-student-dob"
                  required
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={newDob}
                  onChange={(e) => setNewDob(e.target.value)}
                />
                <small>
                  Used to recommend age-appropriate lesson plans and practice
                  materials.
                </small>
              </div>

              <div className="family-field">
                <label htmlFor="new-student-instrument">
                  Primary instrument
                </label>
                <select
                  id="new-student-instrument"
                  value={newInstrument}
                  onChange={(e) => setNewInstrument(e.target.value)}
                >
                  <option value="Piano">Piano</option>
                  <option value="Voice / Singing">Voice / Singing</option>
                  <option value="Guitar">Guitar</option>
                  <option value="Violin">Violin</option>
                  <option value="Drums">Drums</option>
                  <option value="Saxophone">Saxophone</option>
                  <option value="Flute">Flute</option>
                  <option value="Clarinet">Clarinet</option>
                  <option value="Bass Guitar">Bass Guitar</option>
                  <option value="Cello">Cello</option>
                  <option value="Trumpet">Trumpet</option>
                  <option value="Ukulele">Ukulele</option>
                  <option value="Music Theory">Music Theory</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <label className="family-checkbox-label">
                <input
                  type="checkbox"
                  checked={newConsent}
                  onChange={(e) => setNewConsent(e.target.checked)}
                />
                <span>
                  Optional media-sharing consent
                  <small>
                    Allows showcasing student achievements or performances on
                    academy channels.
                  </small>
                </span>
              </label>

              <label
                className="family-checkbox-label"
                style={{
                  borderTop: "1px solid var(--fam-line, #e2ece5)",
                  paddingTop: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={createLogin}
                  onChange={(e) => setCreateLogin(e.target.checked)}
                />
                <span>
                  Create independent student login credentials
                  <small>
                    Optional for older students who use their own device. Young
                    students can access lessons directly through your parent
                    account using Kid Mode.
                  </small>
                </span>
              </label>

              {createLogin && (
                <div className="family-field">
                  <label htmlFor="new-student-password">
                    Student password *
                  </label>
                  <input
                    id="new-student-password"
                    required={createLogin}
                    minLength={8}
                    maxLength={128}
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <small>
                    A unique username will be automatically assigned for the
                    student.
                  </small>
                </div>
              )}

              <div
                className="family-form-actions"
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className="family-button secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={addBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="family-button primary"
                  disabled={addBusy || !newName.trim() || !newDob}
                >
                  {addBusy ? (
                    <>
                      <LoaderCircle size={14} /> Adding student…
                    </>
                  ) : (
                    <>
                      <UserRoundPlus size={14} /> Add student
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
