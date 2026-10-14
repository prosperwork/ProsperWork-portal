"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, BookOpen, CalendarDays, FileText, KeyRound, LoaderCircle, LockKeyhole, Music2, RefreshCw, ShieldCheck } from "lucide-react";
import type { FamilyResponse } from "@/lib/academy/family";
import type { LearningResponse } from "@/lib/academy/learning";

type JsonResult = Record<string, unknown>;
type KidFamilyResponse = FamilyResponse & { policyRequired?: boolean };
async function readJson(response: Response): Promise<JsonResult> {
  const copy = response.clone();
  try { return await response.json() as JsonResult; }
  catch { const text = await copy.text().catch(() => ""); return text ? { error: text } : {}; }
}
function roleKey(role: string) { return role.toLowerCase().replace(/[\s-]+/g, "_"); }
function sameOriginPath(value: unknown, path: string) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.pathname !== path) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return null; }
}
function dateLabel(value: string, timezone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time to be confirmed";
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) }).format(date); }
  catch { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date); }
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

  const isStudent = roleKey(family?.profile.role ?? "") === "student";
  const isKidMode = Boolean(isStudent && family?.kidMode);
  const child = useMemo(() => {
    if (!family) return null;
    return family.children.find(item => item.studentUserId === family.profile.id) ?? family.children[0] ?? null;
  }, [family]);

  const load = useCallback(async () => {
    setRefreshing(true); setError(""); setLearningError("");
    try {
      const familyResponse = await fetch("/api/family", { credentials: "include", cache: "no-store" });
      const familyResult = await readJson(familyResponse);
      if (familyResponse.status === 401) { window.location.assign("/login"); return; }
      if (familyResponse.status === 403 && familyResult.redirect === "/onboarding") { window.location.assign("/onboarding"); return; }
      if (!familyResponse.ok) throw new Error(actionError(familyResult, familyResponse.status));
      const familyData = familyResult as unknown as KidFamilyResponse;
      if (!familyData.profile || !Array.isArray(familyData.children)) throw new Error("The student family response was incomplete.");
      setFamily(familyData);
      if (familyData.kidMode && familyData.policyRequired) {
        setLearning(null);
        return;
      }
      const learningResponse = await fetch("/api/learning", { credentials: "include", cache: "no-store" }).catch(() => null);
      if (!learningResponse) {
        setLearning(null); setLearningError("The lesson service could not be reached. Try refreshing this page.");
      } else if (learningResponse.status === 401) {
        setLearning(null); setLearningError("Lesson data requires an active student session. Sign in again to continue.");
      } else if (!learningResponse.ok) {
        const learningResult = await readJson(learningResponse);
        setLearning(null); setLearningError(actionError(learningResult, learningResponse.status));
      } else {
        const learningData = await readJson(learningResponse) as unknown as LearningResponse;
        if (!Array.isArray(learningData.lessons) || !Array.isArray(learningData.resources)) throw new Error("The learning response was incomplete.");
        setLearning(learningData);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kid Mode could not be loaded.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const exitKidMode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isKidMode || pin.length !== 4) return;
    setExitBusy(true); setExitError("");
    try {
      const response = await fetch("/api/family", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "exit_kid", pin }),
      });
      const result = await readJson(response);
      if (!response.ok || result.ok === false) throw new Error(actionError(result, response.status));
      const redirect = sameOriginPath(result.redirect, "/family");
      if (!redirect) {
        throw new Error("The PIN response did not confirm a return to the guardian session.");
      }
      setPin("");
      window.location.assign(redirect);
    } catch (cause) {
      setExitError(cause instanceof Error ? cause.message : "The guardian session could not be restored.");
      setExitBusy(false);
    }
  };

  const returnCard = family ? <section className="family-card" aria-labelledby="return-guardian-title">
    <div className="family-card-head"><div><h2 id="return-guardian-title">Return to guardian</h2><p>A parent PIN protects leaving this student session.</p></div><KeyRound size={17} color="#6a9d7b" aria-hidden="true" /></div>
    <form className="family-card-body" onSubmit={event => void exitKidMode(event)}>
      <div className="family-focus">The PIN is for returning to the guardian session only. It does not unlock or create Kid Mode.</div>
      {!family.pinConfigured && <p className="family-inline-error" role="status">No guardian return PIN is configured. Ask your guardian to configure one before entering Kid Mode.</p>}
      {exitError && <p className="family-inline-error" role="alert">{exitError}</p>}
      <div className="family-field" style={{ marginTop: 13 }}><label htmlFor="return-pin">Guardian 4-digit PIN</label><input id="return-pin" type="password" inputMode="numeric" autoComplete="off" required pattern="\d{4}" maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} disabled={!family.pinConfigured} /></div>
      <div className="family-form-actions"><button type="submit" className="family-button primary" disabled={exitBusy || pin.length !== 4 || !family.pinConfigured}>{exitBusy ? <><LoaderCircle size={14} /> Checking…</> : <><KeyRound size={14} /> Return to guardian</>}</button></div>
    </form>
  </section> : null;
  const assignedLessons = learning?.lessons ?? [];
  return (
    <main className="pw-family">
      <div className="family-topline" />
      <header className="family-header">
        <Link href="/" className="family-brand" aria-label="ProsperWork Academy home"><img src="/favicon-192x192.png" alt="" /><span className="family-brand-copy"><strong>ProsperWork</strong><small>Music Academy</small></span></Link>
        <nav className="family-nav" aria-label="Student navigation"><Link href="/learning">Lessons</Link>{isKidMode && !family?.policyRequired && <Link href="/studio">Studio</Link>}<button type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw size={14} /> Refresh</button></nav>
      </header>
      <section className="family-kid-content">
        {error && <div className="family-alert" role="alert"><AlertCircle size={16} /><p>{error}</p><button type="button" className="family-button subtle" onClick={() => void load()}>Try again</button></div>}
        {loading && !family ? <div className="family-card family-card-body"><div className="family-stack"><div className="family-skeleton" /><div className="family-skeleton" /></div></div>
          : family && !isStudent ? <section className="family-card"><div className="family-empty"><span className="family-empty-mark"><ShieldCheck size={17} /></span><strong>Student sign-in required</strong><p>Kid Mode is available only in the real student session created by a guardian.</p><Link className="family-button primary" href="/login">Go to sign in</Link></div></section>
          : family && !family.kidMode ? <section className="family-card" aria-labelledby="guardian-login-title">
            <div className="family-empty"><span className="family-empty-mark"><LockKeyhole size={17} /></span><strong id="guardian-login-title">Guardian sign-in required</strong><p>This student account is not in a guardian-launched Kid Mode session. A guardian can start Kid Mode from the family page. A return PIN cannot create or replace a session.</p><Link className="family-button primary" href="/login">Open guardian / account sign-in</Link></div>
          </section>
          : isKidMode && family?.policyRequired ? <div className="family-stack">
            <div className="family-heading"><div><div className="family-eyebrow"><i /> KID MODE · PRIVATE STUDENT SESSION</div><h1>Guardian action needed</h1><p>Your guardian must accept the updated policies before your learning content is available again.</p></div></div>
            <div className="family-alert info" role="status"><ShieldCheck size={16} /><p>The academy has updated its approved policy documents. Ask your guardian to review and accept the current versions from their family account.</p></div>
            {returnCard}
          </div>
          : isKidMode && family && <div>
            <div className="family-heading">
              <div className="family-kid-head">
                <span className="family-avatar">{child?.avatarFileId ? <img src={`/api/files?id=${encodeURIComponent(child.avatarFileId)}`} alt="" /> : child?.name.slice(0, 1).toUpperCase() ?? family.profile.name.slice(0, 1).toUpperCase()}</span>
                <div><div className="family-eyebrow"><i /> KID MODE · PRIVATE STUDENT SESSION</div><h1>Welcome, {child?.name ?? family.profile.name}</h1><p>Your own lessons, class links, and practice resources.</p></div>
              </div>
              <Link href="/learning" className="family-button subtle"><BookOpen size={14} /> Learning space</Link>
            </div>
            {learningError && <div className="family-alert info" role="alert"><AlertCircle size={16} /><p>{learningError}</p><button className="family-button subtle" type="button" onClick={() => void load()}>Retry</button></div>}
            <div className="family-kid-grid">
              <div className="family-stack">
                <section className="family-card" aria-labelledby="student-lessons-title">
                  <div className="family-card-head"><div><h2 id="student-lessons-title">Your current lessons</h2><p>Lesson information comes from your current student account.</p></div><CalendarDays size={17} color="#6a9d7b" aria-hidden="true" /></div>
                  {assignedLessons.length ? <div className="family-card-body">{assignedLessons.map(lesson => <article className="family-class" key={lesson.id}>
                    <div><h3>{lesson.title}</h3><p>With {lesson.teacherName} · {dateLabel(lesson.startsAt, lesson.studentTimezone)}</p></div>
                    <div className="family-report-actions"><Link className="family-button" href={`/classroom?lessonId=${encodeURIComponent(lesson.id)}`}><Music2 size={13} /> Open classroom</Link><Link className="family-button subtle" href={`/learning?lessonId=${encodeURIComponent(lesson.id)}`}>Lesson notes <ArrowRight size={13} /></Link></div>
                  </article>)}</div> : <div className="family-empty"><span className="family-empty-mark"><CalendarDays size={17} /></span><strong>No current classes</strong><p>Your assigned classes will appear here when available.</p></div>}
                </section>
                <section className="family-card" aria-labelledby="student-curriculum-title">
                  <div className="family-card-head"><div><h2 id="student-curriculum-title">Practice library</h2><p>Materials available to your student account.</p></div><BookOpen size={17} color="#6a9d7b" aria-hidden="true" /></div>
                  {learning?.resources.length ? <div className="family-card-body"><div className="family-policy-list">{learning.resources.map(row => <article className="family-policy" key={row.payload.id}>
                    <div><h3>{row.payload.title}</h3><p>{row.payload.summary || "Academy learning resource"} · {row.payload.instrument} · {row.payload.level}</p><div className="family-policy-meta"><span className="family-chip">{row.payload.type}</span></div></div>
                    {row.payload.fileId && <a className="family-button" href={`/api/files?id=${encodeURIComponent(row.payload.fileId)}`} target="_blank" rel="noreferrer"><FileText size={13} /> Open material</a>}
                  </article>)}</div></div> : learning ? <div className="family-empty"><span className="family-empty-mark"><BookOpen size={17} /></span><strong>No practice resources yet</strong><p>New materials assigned to your account will appear here.</p></div> : null}
                </section>
              </div>
              <aside className="family-stack">
                {returnCard}
                <div className="family-focus">Your learning space is read-only in Kid Mode. For help, ask your guardian.</div>
              </aside>
            </div>
          </div>}
      </section>
    </main>
  );
}
