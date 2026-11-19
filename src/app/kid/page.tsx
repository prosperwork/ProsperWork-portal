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
  ClipboardList,
  FileText,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Music2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { FamilyResponse } from "@/lib/academy/family";
import type { LearningResponse } from "@/lib/academy/learning";
import { readJson } from "@/lib/academy/web-client";
import { PortalModal } from "@/app/_components/PortalModal";

type JsonResult = Record<string, unknown>;
type KidFamilyResponse = FamilyResponse & { policyRequired?: boolean };

function roleKey(role: string) {
  return role.toLowerCase().replace(/[\s-]+/g, "_");
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

function actionError(result: JsonResult, status: number) {
  if (typeof result.error === "string") return result.error;
  if (typeof result.message === "string") return result.message;
  return `The request could not be completed (${status}).`;
}

export default function KidPage() {
  const [family, setFamily] = useState<KidFamilyResponse | null>(null);
  const [learning, setLearning] = useState<LearningResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [learningError, setLearningError] = useState("");
  const [pin, setPin] = useState("");
  const [exitBusy, setExitBusy] = useState(false);
  const [exitError, setExitError] = useState("");
  const [exitModalOpen, setExitModalOpen] = useState(false);

  const isStudent = roleKey(family?.profile.role ?? "") === "student";
  const isKidMode = Boolean(isStudent && family?.kidMode);
  const child = useMemo(() => {
    if (!family) return null;
    return (
      family.children.find(
        (item) => item.studentUserId === family.profile.id
      ) ??
      family.children[0] ??
      null
    );
  }, [family]);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    setLearningError("");
    try {
      const familyResponse = await fetch("/api/family", {
        credentials: "include",
        cache: "no-store",
      });
      const familyResult = await readJson(familyResponse);
      if (familyResponse.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (
        familyResponse.status === 403 &&
        familyResult.redirect === "/onboarding"
      ) {
        window.location.assign("/onboarding");
        return;
      }
      if (!familyResponse.ok)
        throw new Error(actionError(familyResult, familyResponse.status));
      const familyData = familyResult as unknown as KidFamilyResponse;
      if (!familyData.profile || !Array.isArray(familyData.children))
        throw new Error("We could not load your learning space right now.");
      setFamily(familyData);
      if (familyData.kidMode && familyData.policyRequired) {
        setLearning(null);
        return;
      }
      const learningResponse = await fetch("/api/learning", {
        credentials: "include",
        cache: "no-store",
      }).catch(() => null);
      if (!learningResponse) {
        setLearning(null);
        setLearningError(
          "We could not reach your lessons right now. Try refreshing in a moment."
        );
      } else if (learningResponse.status === 401) {
        setLearning(null);
        setLearningError(
          "Your session timed out. Ask a parent or guardian to sign back in."
        );
      } else if (!learningResponse.ok) {
        const learningResult = await readJson(learningResponse);
        setLearning(null);
        setLearningError(actionError(learningResult, learningResponse.status));
      } else {
        const learningData = (await readJson(
          learningResponse
        )) as unknown as LearningResponse;
        if (
          !Array.isArray(learningData.lessons) ||
          !Array.isArray(learningData.resources)
        )
          throw new Error("Your lesson list could not be loaded.");
        setLearning(learningData);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Kid Mode could not be loaded right now."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exitKidMode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isKidMode || pin.length !== 4) return;
    setExitBusy(true);
    setExitError("");
    try {
      const response = await fetch("/api/family", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "exit_kid", pin }),
      });
      const result = await readJson(response);
      if (!response.ok || result.ok === false)
        throw new Error(actionError(result, response.status));
      const redirect = sameOriginPath(result.redirect, "/family");
      if (!redirect) {
        throw new Error(
          "We could not switch back to the parent view. Please try again."
        );
      }
      setPin("");
      window.location.assign(redirect);
    } catch (cause) {
      setExitError(
        cause instanceof Error
          ? cause.message
          : "That PIN did not match. Please try again."
      );
      setExitBusy(false);
    }
  };

  const openExitModal = () => {
    setPin("");
    setExitError("");
    setExitModalOpen(true);
  };

  const closeExitModal = () => {
    if (exitBusy) return;
    setExitModalOpen(false);
    setPin("");
    setExitError("");
  };

  const returnFormContent = family ? (
    <form onSubmit={(event) => void exitKidMode(event)}>
      {!family.pinConfigured && (
        <p className="family-inline-error" role="status">
          No guardian PIN is set up yet. Ask your parent or guardian to set one
          in the Family page.
        </p>
      )}
      {exitError && (
        <p className="family-inline-error" role="alert">
          {exitError}
        </p>
      )}
      <div className="family-field" style={{ marginTop: 10 }}>
        <label htmlFor="return-pin">Guardian 4-digit PIN</label>
        <input
          id="return-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          pattern="\d{4}"
          maxLength={4}
          placeholder="Enter 4-digit PIN"
          value={pin}
          onChange={(event) =>
            setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
          }
          disabled={!family.pinConfigured}
        />
      </div>
      <div className="modal-actions">
        {exitModalOpen && (
          <button
            type="button"
            className="family-button subtle"
            onClick={closeExitModal}
            disabled={exitBusy}
          >
            Stay in Kid Mode
          </button>
        )}
        <button
          type="submit"
          className="family-button primary"
          disabled={exitBusy || pin.length !== 4 || !family.pinConfigured}
        >
          {exitBusy ? (
            <>
              <LoaderCircle size={14} /> Checking…
            </>
          ) : (
            <>
              <KeyRound size={14} /> Return to Parent View
            </>
          )}
        </button>
      </div>
    </form>
  ) : null;

  // Kept inline ONLY on the policyRequired hard-block screen
  const returnCard = family ? (
    <section className="family-card" aria-labelledby="return-guardian-title">
      <div className="family-card-head">
        <div>
          <h2 id="return-guardian-title">Return to Parent View</h2>
          <p>Enter your 4-digit guardian PIN to switch back.</p>
        </div>
        <KeyRound size={17} color="#6a9d7b" aria-hidden="true" />
      </div>
      <div className="family-card-body">{returnFormContent}</div>
    </section>
  ) : null;

  const assignedLessons = learning?.lessons ?? [];

  return (
    <main className="pw-family">
      <div className="family-topline" />
      <header className="family-header">
        <Link
          href="/kid"
          className="family-brand"
          aria-label="ProsperWork Music Academy Kid Mode home"
        >
          <img src="/favicon-192x192.png" alt="" />
          <span className="family-brand-copy">
            <strong>ProsperWork</strong>
            <small>Music Academy</small>
          </span>
        </Link>
        <nav className="family-nav" aria-label="Student navigation">
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
          >
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
          {isKidMode && !family?.policyRequired && (
            <button
              type="button"
              className="family-button"
              onClick={openExitModal}
              style={{ minHeight: 34, padding: "0 12px" }}
            >
              <LockKeyhole size={14} aria-hidden="true" /> Exit Kid Mode
            </button>
          )}
        </nav>
      </header>

      <section className="family-kid-content">
        {error && (
          <div className="family-alert" role="alert">
            <AlertCircle size={16} />
            <p>{error}</p>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}

        {loading && !family ? (
          <div className="family-card family-card-body">
            <div className="family-stack">
              <div className="family-skeleton" />
              <div className="family-skeleton" />
            </div>
          </div>
        ) : family && !isStudent ? (
          <section className="family-card">
            <div className="family-empty">
              <span className="family-empty-mark">
                <ShieldCheck size={17} />
              </span>
              <strong>Kid Mode is for student sessions</strong>
              <p>
                Parents and guardians can launch Kid Mode directly from the
                Family Accounts page.
              </p>
              <Link className="family-button primary" href="/family">
                Go to Family Accounts
              </Link>
            </div>
          </section>
        ) : family && !family.kidMode ? (
          <section
            className="family-card"
            aria-labelledby="guardian-login-title"
          >
            <div className="family-empty">
              <span className="family-empty-mark">
                <LockKeyhole size={17} />
              </span>
              <strong id="guardian-login-title">
                Ask a parent to start Kid Mode
              </strong>
              <p>
                Kid Mode starts from your parent or guardian&apos;s Family
                Accounts page. You can sign in normally or ask a guardian to
                open Kid Mode for you.
              </p>
              <Link className="family-button primary" href="/login">
                Sign in
              </Link>
            </div>
          </section>
        ) : isKidMode && family?.policyRequired ? (
          <div
            className="family-stack"
            style={{ maxWidth: 680, margin: "0 auto" }}
          >
            <div className="family-heading">
              <div>
                <div className="family-eyebrow">
                  <i /> KID MODE
                </div>
                <h1>Parent check-in needed</h1>
                <p>
                  Our academy policies were updated. Ask your parent or guardian
                  to review and accept them so you can get right back to your
                  lessons!
                </p>
              </div>
            </div>
            <div className="family-alert info" role="status">
              <ShieldCheck size={16} />
              <p>
                Enter the guardian PIN below to switch back to the parent
                account and complete the quick update.
              </p>
            </div>
            {returnCard}
          </div>
        ) : (
          isKidMode &&
          family && (
            <div className="family-stack">
              <div className="family-heading" style={{ marginBottom: 4 }}>
                <div className="family-kid-head">
                  <span className="family-avatar">
                    {child?.avatarFileId ? (
                      <img
                        src={`/api/files?id=${encodeURIComponent(
                          child.avatarFileId
                        )}`}
                        alt=""
                      />
                    ) : (
                      child?.name.slice(0, 1).toUpperCase() ??
                      family.profile.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div>
                    <div className="family-eyebrow">
                      <i /> KID MODE · STUDENT LEARNING SPACE
                    </div>
                    <h1>Welcome, {child?.name ?? family.profile.name}!</h1>
                    <p>
                      Ready to make some music? Jump into your classes, practice
                      room, or homework below.
                    </p>
                  </div>
                </div>
              </div>

              {/* Kid-friendly Quick Launch Bar */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                }}
                aria-label="Quick launch activities"
              >
                <Link
                  href="/studio"
                  className="family-card"
                  style={{
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: "#e3f1e7",
                      color: "#135b45",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Sparkles size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <strong
                      style={{
                        display: "block",
                        fontSize: 14,
                        color: "#0a2e22",
                      }}
                    >
                      Practice Studio
                    </strong>
                    <span style={{ fontSize: 12, color: "#516259" }}>
                      Timer, keyboard &amp; quiz
                    </span>
                  </div>
                </Link>

                <Link
                  href="/homework"
                  className="family-card"
                  style={{
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: "#e3f1e7",
                      color: "#135b45",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <ClipboardList size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <strong
                      style={{
                        display: "block",
                        fontSize: 14,
                        color: "#0a2e22",
                      }}
                    >
                      My Homework
                    </strong>
                    <span style={{ fontSize: 12, color: "#516259" }}>
                      Weekly assignments
                    </span>
                  </div>
                </Link>

                <Link
                  href="/learning"
                  className="family-card"
                  style={{
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: "#e3f1e7",
                      color: "#135b45",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <BookOpen size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <strong
                      style={{
                        display: "block",
                        fontSize: 14,
                        color: "#0a2e22",
                      }}
                    >
                      Lesson Notes
                    </strong>
                    <span style={{ fontSize: 12, color: "#516259" }}>
                      Teacher notes &amp; recordings
                    </span>
                  </div>
                </Link>
              </div>

              {learningError && (
                <div className="family-alert info" role="alert">
                  <AlertCircle size={16} />
                  <p>{learningError}</p>
                  <button
                    className="family-button subtle"
                    type="button"
                    onClick={() => void load()}
                  >
                    Retry
                  </button>
                </div>
              )}

              <section
                className="family-card"
                aria-labelledby="student-lessons-title"
              >
                <div className="family-card-head">
                  <div>
                    <h2 id="student-lessons-title">Your upcoming lessons</h2>
                    <p>Join your live classroom or review teacher notes.</p>
                  </div>
                  <CalendarDays size={17} color="#6a9d7b" aria-hidden="true" />
                </div>
                {assignedLessons.length ? (
                  <div className="family-card-body">
                    {assignedLessons.map((lesson) => (
                      <article className="family-class" key={lesson.id}>
                        <div>
                          <h3>{lesson.title}</h3>
                          <p>
                            With {lesson.teacherName} ·{" "}
                            {dateLabel(lesson.startsAt, lesson.studentTimezone)}
                          </p>
                        </div>
                        <div className="family-report-actions">
                          <Link
                            className="family-button primary"
                            href={`/classroom?lessonId=${encodeURIComponent(
                              lesson.id
                            )}`}
                          >
                            <Music2 size={13} /> Join Classroom
                          </Link>
                          <Link
                            className="family-button subtle"
                            href={`/learning?lessonId=${encodeURIComponent(
                              lesson.id
                            )}`}
                          >
                            Lesson notes <ArrowRight size={13} />
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="family-empty">
                    <span className="family-empty-mark">
                      <CalendarDays size={17} />
                    </span>
                    <strong>No upcoming classes yet</strong>
                    <p>
                      Your scheduled music lessons will show up right here when
                      they&apos;re ready.
                    </p>
                  </div>
                )}
              </section>

              <section
                className="family-card"
                aria-labelledby="student-curriculum-title"
              >
                <div className="family-card-head">
                  <div>
                    <h2 id="student-curriculum-title">Practice library</h2>
                    <p>Sheet music, songs, and guides shared for your lessons.</p>
                  </div>
                  <BookOpen size={17} color="#6a9d7b" aria-hidden="true" />
                </div>
                {learning?.resources.length ? (
                  <div className="family-card-body">
                    <div className="family-policy-list">
                      {learning.resources.map((row) => (
                        <article
                          className="family-policy"
                          key={row.payload.id}
                        >
                          <div>
                            <h3>{row.payload.title}</h3>
                            <p>
                              {row.payload.summary ||
                                "Academy learning resource"}{" "}
                              · {row.payload.instrument} · {row.payload.level}
                            </p>
                            <div className="family-policy-meta">
                              <span className="family-chip">
                                {row.payload.type}
                              </span>
                            </div>
                          </div>
                          {row.payload.fileId && (
                            <a
                              className="family-button"
                              href={`/api/files?id=${encodeURIComponent(
                                row.payload.fileId
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileText size={13} /> Open material
                            </a>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                ) : learning ? (
                  <div className="family-empty">
                    <span className="family-empty-mark">
                      <BookOpen size={17} />
                    </span>
                    <strong>No practice materials yet</strong>
                    <p>
                      Songs and study sheets shared by your teacher will appear
                      here.
                    </p>
                  </div>
                ) : null}
              </section>
            </div>
          )
        )}
      </section>

      {/* Guardian PIN Exit Modal */}
      <PortalModal
        open={exitModalOpen}
        onClose={closeExitModal}
        eyebrow="Parent Access"
        title="Exit Kid Mode"
        subtitle="Enter your 4-digit guardian PIN to return to the parent workspace."
        size="sm"
        busy={exitBusy}
      >
        {returnFormContent}
      </PortalModal>
    </main>
  );
}
