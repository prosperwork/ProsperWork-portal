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
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Music2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRoundPlus,
  Video,
  X,
} from "lucide-react";
import type { FamilyResponse } from "@/lib/academy/family";
import type { LearningResponse } from "@/lib/academy/learning";
import { readJson } from "@/lib/academy/web-client";
import {
  FAMILY_CACHE_KEY,
  LEARNING_CACHE_KEY,
  getCachedJson,
  saveCachedJson,
} from "@/lib/storage";
import BrandEmblem from "@/app/_components/BrandEmblem";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import { PortalModal } from "@/app/_components/PortalModal";
import { useCatalogs } from "@/lib/academy/use-academy-config";

type ActionResult = Record<string, unknown>;
type FamilyChild = FamilyResponse["children"][number];
type CredentialsModalState = {
  mode: "create" | "reset";
  child: FamilyChild;
} | null;

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
  const { enabledByCatalog } = useCatalogs();
  const instrumentOptions = useMemo(() => {
    const rows = enabledByCatalog("instruments");
    return rows.length > 0
      ? rows.map((item) => ({ value: item.code, label: item.label }))
      : [
          { value: "Piano", label: "Piano" },
          { value: "Voice", label: "Voice / Singing" },
          { value: "Acoustic Guitar", label: "Acoustic Guitar" },
          { value: "Violin", label: "Violin" },
          { value: "Drums", label: "Drums" },
          { value: "Saxophone", label: "Saxophone" },
          { value: "Flute", label: "Flute" },
          { value: "Bass Guitar", label: "Bass Guitar" },
          { value: "Trumpet", label: "Trumpet" },
          { value: "Music Theory", label: "Music Theory & Exam Prep" },
        ];
  }, [enabledByCatalog]);

  const durationOptions = useMemo(() => {
    const rows = enabledByCatalog("lesson_durations");
    return rows.length > 0
      ? rows.map((item) => ({ value: item.code, label: item.label }))
      : [
          { value: "1 hour (Standard)", label: "1 hour (Standard)" },
          { value: "90 minutes", label: "90 minutes" },
          { value: "2 hours", label: "2 hours" },
        ];
  }, [enabledByCatalog]);

  const [family, setFamily] = useState<FamilyResponse | null>(null);
  const [learning, setLearning] = useState<LearningResponse | null>(null);
  const [learningError, setLearningError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [consentBusyId, setConsentBusyId] = useState("");
  const [expandedDetails, setExpandedDetails] = useState<
    Record<string, boolean>
  >({});

  // Student credentials modal (Create Login / Reset Password)
  const [credentialsModal, setCredentialsModal] =
    useState<CredentialsModalState>(null);
  const [modalPassword, setModalPassword] = useState("");
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [credentialsError, setCredentialsError] = useState("");

  // Guardian PIN modal
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalReason, setPinModalReason] = useState("");
  const [pin, setPin] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [showPinValue, setShowPinValue] = useState(false);
  const [showParentPassword, setShowParentPassword] = useState(false);
  const [pinError, setPinError] = useState("");

  // Add Student modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newGender, setNewGender] = useState("Prefer not to say");
  const [newInstrument, setNewInstrument] = useState("Piano");
  const [newExperience, setNewExperience] = useState("Absolute Beginner");
  const [newHasInstrument, setNewHasInstrument] = useState("Owns instrument");
  const [newLearningGoals, setNewLearningGoals] = useState(
    "Classical & Sight-reading"
  );
  const [newLessonDuration, setNewLessonDuration] =
    useState("1 hour (Standard)");
  const [newExtraTimeNotes, setNewExtraTimeNotes] = useState("");
  const [newPreferredDays, setNewPreferredDays] = useState("");
  const [newSpecialNeeds, setNewSpecialNeeds] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newConsent, setNewConsent] = useState(false);
  const [createLogin, setCreateLogin] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  const role = normalizedRole(family?.profile.role ?? "");
  const perms = useMemo(
    () => new Set(family?.profile.permissions ?? []),
    [family?.profile?.permissions]
  );
  const active = family?.profile.status.trim().toLowerCase() === "active";
  const isParent = role === "parent";
  const canManageChildren = Boolean(
    active &&
      (isParent ||
        role === "owner" ||
        role === "super_admin" ||
        perms.has("workspace.family"))
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
      saveCachedJson(FAMILY_CACHE_KEY, result);
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
          saveCachedJson(LEARNING_CACHE_KEY, learningResult);
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
    const cachedFamily = getCachedJson<FamilyResponse>(FAMILY_CACHE_KEY, (p) =>
      Boolean(p && p.profile && Array.isArray(p.children))
    );
    if (cachedFamily) {
      setFamily(cachedFamily);
      setLoading(false);
    }
    const cachedLearning = getCachedJson<LearningResponse>(
      LEARNING_CACHE_KEY,
      (p) => Boolean(p && p.profile && Array.isArray(p.lessons))
    );
    if (cachedLearning) {
      setLearning(cachedLearning);
    }
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

  const openCredentialsModal = (mode: "create" | "reset", child: FamilyChild) => {
    setCredentialsModal({ mode, child });
    setModalPassword("");
    setShowModalPassword(false);
    setCredentialsError("");
  };

  const closeCredentialsModal = () => {
    if (actionBusy.startsWith("account:") || actionBusy.startsWith("password:"))
      return;
    setCredentialsModal(null);
    setModalPassword("");
    setShowModalPassword(false);
    setCredentialsError("");
  };

  const openPinModal = (reason = "") => {
    setPin("");
    setParentPassword("");
    setShowPinValue(false);
    setShowParentPassword(false);
    setPinError("");
    setPinModalReason(reason);
    setPinModalOpen(true);
  };

  const closePinModal = () => {
    if (actionBusy === "pin") return;
    setPinModalOpen(false);
    setPinModalReason("");
    setPinError("");
  };

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageChildren || !credentialsModal) return;
    const { mode, child } = credentialsModal;
    setCredentialsError("");
    setActionError("");
    setFeedback("");

    if (mode === "create") {
      setActionBusy(`account:${child.id}`);
      try {
        const result = await postAction({
          action: "student_account",
          childId: child.id,
          password: modalPassword,
        });
        const fresh = await load();
        const updatedChild = fresh?.children.find(
          (item) => item.id === child.id
        );
        const returnedUsername =
          typeof result.username === "string"
            ? result.username
            : result.result &&
              typeof result.result === "object" &&
              "username" in result.result &&
              typeof result.result.username === "string"
            ? result.result.username
            : updatedChild?.username;
        if (!updatedChild?.studentUserId || !returnedUsername) {
          throw new Error(
            "The account request returned, but the student account could not be confirmed. Refresh and check before retrying."
          );
        }
        setCredentialsModal(null);
        setModalPassword("");
        setFeedback(
          `Student login created for ${updatedChild.name}. Username: ${returnedUsername}.`
        );
      } catch (cause) {
        setCredentialsError(
          cause instanceof Error
            ? cause.message
            : "Student account could not be created."
        );
      } finally {
        setActionBusy("");
      }
      return;
    }

    setActionBusy(`password:${child.id}`);
    try {
      await postAction({
        action: "student_password",
        childId: child.id,
        password: modalPassword,
      });
      setCredentialsModal(null);
      setModalPassword("");
      setFeedback(`Password reset for ${child.name}.`);
    } catch (cause) {
      setCredentialsError(
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
    setPinError("");
    setActionError("");
    setFeedback("");
    setActionBusy("pin");
    try {
      await postAction({ action: "pin", pin, password: parentPassword });
      const fresh = await load();
      if (!fresh?.pinConfigured)
        throw new Error(
          "PIN settings were not confirmed yet. Please refresh and try again."
        );
      setPin("");
      setParentPassword("");
      setPinModalOpen(false);
      setPinModalReason("");
      setFeedback("Guardian return PIN saved. You can now use Kid Mode.");
    } catch (cause) {
      setPinError(
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
    if (!family?.pinConfigured) {
      openPinModal(
        "Set a 4-digit guardian return PIN first so you can exit Kid Mode back to your parent view."
      );
      return;
    }
    setActionError("");
    setFeedback("");
    setActionBusy(`kid:${childId}`);
    try {
      const result = await postAction({ action: "enter_kid", childId });
      const redirect = sameOriginPath(result.redirect, "/kid");
      if (!redirect) {
        throw new Error(
          "Kid Mode could not be confirmed. Please try again."
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
      await postAction({ action: "media_consent", childId, consent });
      const fresh = await load();
      if (
        fresh?.children.find((child) => child.id === childId)?.consent !==
        consent
      ) {
        throw new Error(
          "The consent change was not confirmed yet. Please refresh the family view."
        );
      }
      setFeedback("Media sharing preference updated.");
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
        gender: newGender,
        instrument: newInstrument,
        experience: newExperience,
        hasInstrument: newHasInstrument,
        learningGoals: newLearningGoals,
        lessonDuration: newLessonDuration,
        extraTimeNotes: newExtraTimeNotes.trim() || undefined,
        preferredDays: newPreferredDays.trim() || undefined,
        specialNeeds: newSpecialNeeds.trim() || undefined,
        notes: newNotes.trim() || undefined,
        consent: newConsent,
        createLogin,
        studentPassword: createLogin ? newPassword : undefined,
      });
      setShowAddModal(false);
      const studentNameAdded = newName.trim();
      setNewName("");
      setNewDob("");
      setNewGender("Prefer not to say");
      setNewInstrument("Piano");
      setNewExperience("Absolute Beginner");
      setNewHasInstrument("Owns instrument");
      setNewLearningGoals("Classical & Sight-reading");
      setNewLessonDuration("1 hour (Standard)");
      setNewExtraTimeNotes("");
      setNewPreferredDays("");
      setNewSpecialNeeds("");
      setNewNotes("");
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

  const credentialsBusy = Boolean(
    credentialsModal &&
      (actionBusy === `account:${credentialsModal.child.id}` ||
        actionBusy === `password:${credentialsModal.child.id}`)
  );

  return (
    <main className="pw-family">
      <div className="family-topline" />
      <section className="family-content">
        <div className="family-heading">
          <div>
            <h1>Family accounts</h1>
            <p>
              Manage your students, join live lessons, and launch supervised Kid
              Mode.
            </p>
          </div>
          <div
            className="family-heading-actions"
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {family && isParent && (
              <button
                type="button"
                className={`family-button ${
                  family.pinConfigured ? "subtle" : ""
                }`}
                onClick={() => openPinModal()}
                disabled={!active}
                title={
                  family.pinConfigured
                    ? "Update your 4-digit guardian return PIN"
                    : "Set a 4-digit guardian return PIN for Kid Mode"
                }
              >
                {family.pinConfigured ? (
                  <>
                    <ShieldCheck size={14} aria-hidden="true" /> Guardian PIN:
                    Active
                  </>
                ) : (
                  <>
                    <KeyRound size={14} aria-hidden="true" /> Set Guardian PIN
                  </>
                )}
              </button>
            )}
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
              This account is not active. Family information remains viewable,
              while student and PIN changes are paused.
            </p>
          </div>
        )}

        {error && (
          <div className="family-alert" role="alert">
            <AlertCircle size={16} />
            <p style={{ flex: 1 }}>{error}</p>
            <button
              className="family-button subtle"
              type="button"
              onClick={() => void load()}
            >
              Try again
            </button>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              style={{ padding: "0 8px", minHeight: 30 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {feedback && (
          <div className="family-alert success" role="status">
            <Check size={16} />
            <p style={{ flex: 1 }}>{feedback}</p>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setFeedback("")}
              aria-label="Dismiss message"
              style={{ padding: "0 8px", minHeight: 30 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {actionError && (
          <div className="family-alert" role="alert">
            <AlertCircle size={16} />
            <p style={{ flex: 1 }}>{actionError}</p>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setActionError("")}
              aria-label="Dismiss error"
              style={{ padding: "0 8px", minHeight: 30 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {family && isParent && active && !family.pinConfigured && (
          <div className="family-alert info" role="status">
            <KeyRound size={16} />
            <p style={{ flex: 1 }}>
              Set a 4-digit guardian return PIN before using Kid Mode. The PIN
              keeps young learners in their own space until you unlock it.
            </p>
            <button
              type="button"
              className="family-button primary"
              onClick={() => openPinModal()}
            >
              <KeyRound size={13} aria-hidden="true" /> Set Guardian PIN
            </button>
          </div>
        )}

        {learningError && (
          <div className="family-alert info" role="status">
            <BookOpen size={16} />
            <p style={{ flex: 1 }}>
              Lesson progress is temporarily unavailable: {learningError}
            </p>
            <button
              className="family-button subtle"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setLearningError("")}
              aria-label="Dismiss notice"
              style={{ padding: "0 8px", minHeight: 30 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {loading && !family ? (
          <div className="family-card family-card-body">
            <div className="family-stack">
              <div className="family-skeleton" />
              <div className="family-skeleton" />
              <div className="family-skeleton" />
            </div>
          </div>
        ) : (
          family && (
            <section
              className="family-card family-roster-panel"
              aria-labelledby="children-title"
              data-portal-layout="family-records"
            >
              <div className="family-card-head">
                <div>
                  <h2 id="children-title">Students in your family</h2>
                  <p>
                    {family.children.length
                      ? `${family.children.length} ${
                          family.children.length === 1 ? "student" : "students"
                        } · Live lessons, practice tools, and profile settings.`
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
                      const isPending =
                        child.admissionStatus === "pending_review" ||
                        child.status === "inactive" ||
                        (Boolean(child.admissionStatus) &&
                          child.admissionStatus !== "approved");
                      const hasExtraDetails = Boolean(
                        child.learningGoals ||
                          child.preferredDays ||
                          child.extraTimeNotes ||
                          (child.gender &&
                            child.gender !== "Prefer not to say") ||
                          child.specialNeeds ||
                          child.notes
                      );
                      const detailsOpen = Boolean(expandedDetails[child.id]);

                      return (
                        <article className="family-child" key={child.id}>
                          {/* 1. Card Header */}
                          <div className="family-child-top">
                            <div className="family-child-name">
                              <ProfileAvatar
                                profileId={child.studentUserId}
                                name={child.name}
                                size={42}
                              />
                              <div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <h3 style={{ margin: 0 }}>{child.name}</h3>
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      padding: "2px 9px",
                                      borderRadius: "999px",
                                      background: "#edf6f1",
                                      color: "#135b45",
                                      border: "1px solid #d1e7da",
                                    }}
                                  >
                                    {child.instrument || "Piano"} ·{" "}
                                    {child.experience || "Beginner"}
                                  </span>
                                  {isPending ? (
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        padding: "2px 8px",
                                        borderRadius: "12px",
                                        background: "#fef3c7",
                                        color: "#92400e",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <Clock size={11} /> Under Review
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        padding: "2px 8px",
                                        borderRadius: "12px",
                                        background: "#dcfce7",
                                        color: "#166534",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <Check size={11} /> Enrolled
                                    </span>
                                  )}
                                </div>
                                <p style={{ marginTop: 4 }}>
                                  {child.username
                                    ? `Student username: ${child.username}`
                                    : "Supervised child profile (Kid Mode)"}
                                </p>
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              {isParent &&
                                active &&
                                (isPending ? (
                                  <div
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      color: "#92400e",
                                      background: "#fffbeb",
                                      padding: "6px 12px",
                                      borderRadius: "8px",
                                      border: "1px solid #fde68a",
                                    }}
                                  >
                                    <Clock size={13} /> Review in progress
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="family-button primary"
                                    onClick={() => void enterKidMode(child.id)}
                                    disabled={actionBusy === `kid:${child.id}`}
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
                                ))}
                              {canManageChildren &&
                                (child.studentUserId ? (
                                  <button
                                    type="button"
                                    className="family-button"
                                    onClick={() =>
                                      openCredentialsModal("reset", child)
                                    }
                                  >
                                    <KeyRound size={13} aria-hidden="true" />{" "}
                                    Reset Password
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="family-button"
                                    onClick={() =>
                                      openCredentialsModal("create", child)
                                    }
                                  >
                                    <UserRoundPlus
                                      size={13}
                                      aria-hidden="true"
                                    />{" "}
                                    Create Login
                                  </button>
                                ))}
                            </div>
                          </div>

                          {isPending && (
                            <div
                              style={{
                                margin: "12px 0 14px",
                                padding: "12px 14px",
                                borderRadius: "8px",
                                background: "#fffbeb",
                                border: "1px solid #fde68a",
                                fontSize: "13px",
                                lineHeight: 1.5,
                                color: "#78350f",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "10px",
                              }}
                            >
                              <AlertCircle
                                size={16}
                                color="#d97706"
                                style={{ flexShrink: 0, marginTop: "2px" }}
                              />
                              <div>
                                <strong
                                  style={{
                                    color: "#92400e",
                                    display: "block",
                                    marginBottom: "2px",
                                  }}
                                >
                                  Registration Awaiting Academy Confirmation
                                </strong>
                                We have received {child.name}&apos;s
                                registration for{" "}
                                {child.instrument || "lessons"}. The academy
                                administration is reviewing your preferred
                                schedule ({child.preferredDays || "flexible"})
                                to match a qualified teacher. You will receive
                                an email once confirmed.
                              </div>
                            </div>
                          )}

                          {/* 2. Upcoming Lessons & Quick Launch */}
                          <div
                            className="family-lesson-links"
                            aria-label={`Upcoming lessons and quick launch for ${child.name}`}
                            style={{ marginTop: 14, marginBottom: 14 }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                flexWrap: "wrap",
                                marginBottom: 10,
                              }}
                            >
                              <strong
                                style={{
                                  fontSize: 12,
                                  color: "#0a2e22",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <CalendarDays
                                  size={14}
                                  color="#135b45"
                                  aria-hidden="true"
                                />
                                Upcoming Lessons
                              </strong>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                <Link
                                  href="/studio"
                                  className="family-button subtle"
                                  style={{
                                    minHeight: 30,
                                    padding: "0 10px",
                                    fontSize: 11,
                                  }}
                                >
                                  <Music2 size={12} aria-hidden="true" />{" "}
                                  Practice Studio
                                </Link>
                                <Link
                                  href="/homework"
                                  className="family-button subtle"
                                  style={{
                                    minHeight: 30,
                                    padding: "0 10px",
                                    fontSize: 11,
                                  }}
                                >
                                  <FileText size={12} aria-hidden="true" />{" "}
                                  Homework
                                </Link>
                                <Link
                                  href="/learning"
                                  className="family-button subtle"
                                  style={{
                                    minHeight: 30,
                                    padding: "0 10px",
                                    fontSize: 11,
                                  }}
                                >
                                  <BookOpen size={12} aria-hidden="true" />{" "}
                                  Lesson Notes
                                </Link>
                              </div>
                            </div>

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
                                    <strong>{lesson.title}</strong> ·{" "}
                                    {dateLabel(
                                      lesson.startsAt,
                                      lesson.studentTimezone
                                    )}
                                  </span>
                                  <span
                                    style={{
                                      display: "flex",
                                      gap: 6,
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <Link
                                      href={`/classroom?lessonId=${encodeURIComponent(
                                        lesson.id
                                      )}`}
                                      className="family-button primary"
                                      style={{
                                        minHeight: 30,
                                        padding: "0 10px",
                                        fontSize: 11,
                                      }}
                                      aria-label={`Join ${lesson.title} classroom`}
                                    >
                                      <Video size={12} aria-hidden="true" />{" "}
                                      Join Classroom
                                    </Link>
                                    <Link
                                      href={`/learning?lessonId=${encodeURIComponent(
                                        lesson.id
                                      )}`}
                                      className="family-button subtle"
                                      style={{
                                        minHeight: 30,
                                        padding: "0 10px",
                                        fontSize: 11,
                                      }}
                                      aria-label={`Open ${lesson.title} lesson notes`}
                                    >
                                      Notes <ArrowRight size={12} />
                                    </Link>
                                    <Link
                                      href={`/workflows?lessonId=${encodeURIComponent(
                                        lesson.id
                                      )}`}
                                      className="family-button subtle"
                                      style={{
                                        minHeight: 30,
                                        padding: "0 10px",
                                        fontSize: 11,
                                      }}
                                      title={`Request a reschedule for ${lesson.title}`}
                                    >
                                      Reschedule
                                    </Link>
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p
                                className="family-upload-note"
                                style={{ margin: 0 }}
                              >
                                No upcoming lessons scheduled yet for{" "}
                                {child.name}.
                              </p>
                            )}
                          </div>

                          {/* 3. Compact Student Profile Summary */}
                          <div className="family-child-facts">
                            <div className="family-fact">
                              <small>Instructor</small>
                              <strong>
                                {child.teacherName &&
                                !child.teacherName.includes("Pending")
                                  ? child.teacherName
                                  : "Matching instructor…"}
                              </strong>
                            </div>
                            <div className="family-fact">
                              <small>Lesson duration</small>
                              <strong>
                                {child.lessonDuration || "1 hour (Standard)"}
                              </strong>
                            </div>
                            <div className="family-fact">
                              <small>Instrument access</small>
                              <strong>
                                {child.hasInstrument || "Not specified"}
                              </strong>
                            </div>
                            <div className="family-fact">
                              <small>Age</small>
                              <strong>
                                {ageOf(child.dob)}
                                {child.dob
                                  ? ` · ${new Intl.DateTimeFormat(undefined, {
                                      dateStyle: "medium",
                                    }).format(
                                      new Date(
                                        `${child.dob.slice(0, 10)}T12:00:00`
                                      )
                                    )}`
                                  : ""}
                              </strong>
                            </div>
                            <div className="family-fact">
                              <small>Practice rank</small>
                              <strong>{child.rank || "Not ranked"}</strong>
                            </div>
                          </div>

                          {hasExtraDetails && (
                            <div style={{ marginTop: 10 }}>
                              <button
                                type="button"
                                className="family-button subtle"
                                onClick={() =>
                                  setExpandedDetails((prev) => ({
                                    ...prev,
                                    [child.id]: !prev[child.id],
                                  }))
                                }
                                aria-expanded={detailsOpen}
                                style={{
                                  minHeight: 30,
                                  padding: "0 10px",
                                  fontSize: 11,
                                }}
                              >
                                {detailsOpen ? (
                                  <>
                                    <ChevronUp size={13} aria-hidden="true" />{" "}
                                    Hide notes &amp; goals
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown size={13} aria-hidden="true" />{" "}
                                    View notes &amp; goals
                                  </>
                                )}
                              </button>
                              {detailsOpen && (
                                <div
                                  className="family-meta-tags"
                                  style={{ marginTop: 10 }}
                                >
                                  {child.learningGoals && (
                                    <span className="family-meta-tag">
                                      Goal: {child.learningGoals}
                                    </span>
                                  )}
                                  {child.preferredDays && (
                                    <span className="family-meta-tag">
                                      Schedule: {child.preferredDays}
                                    </span>
                                  )}
                                  {child.extraTimeNotes && (
                                    <span className="family-meta-tag">
                                      Extra time: {child.extraTimeNotes}
                                    </span>
                                  )}
                                  {child.gender &&
                                    child.gender !== "Prefer not to say" && (
                                      <span className="family-meta-tag">
                                        {child.gender}
                                      </span>
                                    )}
                                  {child.specialNeeds && (
                                    <span className="family-meta-tag">
                                      Accommodations: {child.specialNeeds}
                                    </span>
                                  )}
                                  {child.notes && (
                                    <span className="family-meta-tag">
                                      Interests: {child.notes}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 4. Media Sharing Consent */}
                          {canManageChildren && active && (
                            <label
                              className="family-consent"
                              style={{ marginTop: 14 }}
                            >
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
                                  Allows featuring student performances on
                                  academy channels. Separate from lesson access
                                  and changeable anytime.
                                </small>
                              </span>
                            </label>
                          )}
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
                    Add a student to start scheduling lessons and tracking
                    practice progress.
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
                      <Plus size={14} aria-hidden="true" /> Add child / student
                    </button>
                  )}
                </div>
              )}
            </section>
          )
        )}
      </section>

      {/* Student Login Creation / Password Reset Modal */}
      <PortalModal
        open={Boolean(credentialsModal)}
        onClose={closeCredentialsModal}
        eyebrow={credentialsModal?.child.name}
        title={
          credentialsModal?.mode === "create"
            ? "Create Student Login"
            : "Reset Student Password"
        }
        subtitle={
          credentialsModal?.mode === "create"
            ? "Create an independent sign-in for this student. A unique username will be generated automatically."
            : credentialsModal?.child.username
            ? `Set a new password for username "${credentialsModal.child.username}".`
            : "Set a new sign-in password for this student."
        }
        size="sm"
        busy={credentialsBusy}
      >
        {credentialsModal && (
          <form onSubmit={(event) => void handleCredentialsSubmit(event)}>
            {credentialsError && (
              <div
                className="family-alert"
                role="alert"
                style={{ marginBottom: 12 }}
              >
                <AlertCircle size={16} />
                <p>{credentialsError}</p>
              </div>
            )}
            <div className="family-field">
              <label htmlFor="modal-student-password">
                {credentialsModal.mode === "create"
                  ? "Initial password"
                  : "New password"}
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="modal-student-password"
                  required
                  minLength={8}
                  maxLength={128}
                  type={showModalPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={modalPassword}
                  onChange={(event) => setModalPassword(event.target.value)}
                  style={{ width: "100%", paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowModalPassword((v) => !v)}
                  aria-label={
                    showModalPassword ? "Hide password" : "Show password"
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
                  {showModalPassword ? (
                    <EyeOff size={15} />
                  ) : (
                    <Eye size={15} />
                  )}
                </button>
              </div>
              <small>Must be between 8 and 128 characters.</small>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="family-button subtle"
                onClick={closeCredentialsModal}
                disabled={credentialsBusy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="family-button primary"
                disabled={credentialsBusy || modalPassword.length < 8}
              >
                {credentialsBusy ? (
                  <>
                    <LoaderCircle size={14} />{" "}
                    {credentialsModal.mode === "create"
                      ? "Creating…"
                      : "Updating…"}
                  </>
                ) : credentialsModal.mode === "create" ? (
                  <>
                    <UserRoundPlus size={14} /> Create login
                  </>
                ) : (
                  <>
                    <KeyRound size={14} /> Reset password
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </PortalModal>

      {/* Guardian Return PIN Modal */}
      <PortalModal
        open={pinModalOpen}
        onClose={closePinModal}
        eyebrow="Kid Mode Safety"
        title={
          family?.pinConfigured
            ? "Update Guardian Return PIN"
            : "Set Guardian Return PIN"
        }
        subtitle={
          pinModalReason ||
          "A 4-digit PIN is requested only when leaving supervised Kid Mode to return to your family account."
        }
        size="sm"
        busy={actionBusy === "pin"}
      >
        <form onSubmit={(event) => void saveGuardianPin(event)}>
          {pinError && (
            <div
              className="family-alert"
              role="alert"
              style={{ marginBottom: 12 }}
            >
              <AlertCircle size={16} />
              <p>{pinError}</p>
            </div>
          )}
          <div className="family-field">
            <label htmlFor="guardian-pin-modal">New 4-digit PIN</label>
            <div style={{ position: "relative" }}>
              <input
                id="guardian-pin-modal"
                required
                type={showPinValue ? "text" : "password"}
                inputMode="numeric"
                autoComplete="new-password"
                pattern="\d{4}"
                maxLength={4}
                placeholder="4 digits"
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                style={{ width: "100%", paddingRight: 38 }}
              />
              <button
                type="button"
                onClick={() => setShowPinValue((v) => !v)}
                aria-label={showPinValue ? "Hide PIN" : "Show PIN"}
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
                {showPinValue ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <small>Choose 4 digits your child does not know.</small>
          </div>
          <div className="family-field" style={{ marginTop: 12 }}>
            <label htmlFor="guardian-password-modal">
              Your account password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="guardian-password-modal"
                required
                type={showParentPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Confirm your password"
                value={parentPassword}
                onChange={(event) => setParentPassword(event.target.value)}
                style={{ width: "100%", paddingRight: 38 }}
              />
              <button
                type="button"
                onClick={() => setShowParentPassword((v) => !v)}
                aria-label={
                  showParentPassword ? "Hide password" : "Show password"
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
                {showParentPassword ? (
                  <EyeOff size={15} />
                ) : (
                  <Eye size={15} />
                )}
              </button>
            </div>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="family-button subtle"
              onClick={closePinModal}
              disabled={actionBusy === "pin"}
            >
              Cancel
            </button>
            <button
              className="family-button primary"
              type="submit"
              disabled={
                actionBusy === "pin" || pin.length !== 4 || !parentPassword
              }
            >
              {actionBusy === "pin" ? (
                <>
                  <LoaderCircle size={14} /> Saving…
                </>
              ) : (
                <>
                  <KeyRound size={14} />{" "}
                  {family?.pinConfigured ? "Update PIN" : "Save PIN"}
                </>
              )}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Add Student Modal */}
      <PortalModal
        open={showAddModal}
        onClose={() => {
          if (!addBusy) setShowAddModal(false);
        }}
        eyebrow="Family Enrollment"
        title="Add student / child"
        subtitle="Share a few details so we can match the right instructor and curriculum."
        size="lg"
        busy={addBusy}
      >
        <form onSubmit={handleAddStudent} className="family-modal-form">
          {addError && (
            <div className="family-alert" role="alert" style={{ margin: 0 }}>
              <AlertCircle size={16} />
              <p>{addError}</p>
            </div>
          )}
          <div className="family-section-legend" style={{ marginTop: 0 }}>
            Student Details
          </div>

          <div className="family-modal-row">
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
              <label htmlFor="new-student-gender">Gender</label>
              <select
                id="new-student-gender"
                value={newGender}
                onChange={(e) => setNewGender(e.target.value)}
              >
                <option value="Prefer not to say">Prefer not to say</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="family-modal-row">
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
              <small>Calculates age and guides curriculum milestones.</small>
            </div>
            <div className="family-field">
              <label htmlFor="new-student-instrument">
                Primary instrument *
              </label>
              <select
                id="new-student-instrument"
                value={newInstrument}
                onChange={(e) => setNewInstrument(e.target.value)}
              >
                {instrumentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="family-section-legend">
            Musical Background &amp; Learning Goals
          </div>

          <div className="family-modal-row">
            <div className="family-field">
              <label htmlFor="new-student-experience">
                Current skill level
              </label>
              <select
                id="new-student-experience"
                value={newExperience}
                onChange={(e) => setNewExperience(e.target.value)}
              >
                <option value="Absolute Beginner">
                  Absolute Beginner (Never played before)
                </option>
                <option value="Beginner with basics">
                  Beginner with basics (Knows simple notes/keys)
                </option>
                <option value="Intermediate">
                  Intermediate (Reads notation, plays songs)
                </option>
                <option value="Advanced">
                  Advanced (Formal exams, grade 5+, performance)
                </option>
              </select>
            </div>
            <div className="family-field">
              <label htmlFor="new-student-has-instrument">
                Instrument access at home
              </label>
              <select
                id="new-student-has-instrument"
                value={newHasInstrument}
                onChange={(e) => setNewHasInstrument(e.target.value)}
              >
                <option value="Owns instrument">
                  Yes - owns an instrument at home
                </option>
                <option value="Has access / borrows">
                  Yes - has regular practice access
                </option>
                <option value="Planning to acquire">
                  Planning to acquire soon
                </option>
                <option value="No instrument yet">No instrument yet</option>
              </select>
            </div>
          </div>

          <div className="family-modal-row">
            <div className="family-field">
              <label htmlFor="new-student-goals">Primary learning goals</label>
              <select
                id="new-student-goals"
                value={newLearningGoals}
                onChange={(e) => setNewLearningGoals(e.target.value)}
              >
                <option value="Classical & Sight-reading">
                  Classical &amp; Sight-reading
                </option>
                <option value="Contemporary & Pop">
                  Contemporary &amp; Pop Music
                </option>
                <option value="Church & Gospel Worship">
                  Church &amp; Gospel Worship
                </option>
                <option value="ABRSM / Trinity Exam Prep">
                  ABRSM / Trinity Exam Prep
                </option>
                <option value="Fun & Musical Foundation">
                  Fun, Creativity &amp; Foundation
                </option>
              </select>
            </div>
            <div className="family-field">
              <label htmlFor="new-student-duration">Lesson duration</label>
              <select
                id="new-student-duration"
                value={newLessonDuration}
                onChange={(e) => setNewLessonDuration(e.target.value)}
              >
                {durationOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value="Custom / Request extra time">
                  Custom / Request extra time
                </option>
              </select>
              <small>
                Classes are 1 hour by default unless extra time is requested.
              </small>
            </div>
          </div>

          {newLessonDuration !== "1 hour (Standard)" && (
            <div className="family-field">
              <label htmlFor="new-student-extra-time">
                Extra time request details (optional)
              </label>
              <input
                id="new-student-extra-time"
                type="text"
                placeholder="e.g. Preparing for exam or recital, or requesting 90-min sessions"
                value={newExtraTimeNotes}
                onChange={(e) => setNewExtraTimeNotes(e.target.value)}
              />
              <small>
                State any special reasons or timing requirements for extra
                lesson time.
              </small>
            </div>
          )}

          <div className="family-field">
            <label htmlFor="new-student-schedule">
              Preferred days &amp; times
            </label>
            <input
              id="new-student-schedule"
              type="text"
              placeholder="e.g. Tuesdays & Thursdays at 5:00 PM, or Saturday mornings around 10:30 AM"
              value={newPreferredDays}
              onChange={(e) => setNewPreferredDays(e.target.value)}
            />
            <small>
              Classes are 1 hour by default. State any days or times that fit
              your family routine best.
            </small>
          </div>

          <div className="family-section-legend">
            Special Considerations &amp; Interests
          </div>

          <div className="family-field">
            <label htmlFor="new-student-special-needs">
              Learning accommodations or health notes (optional)
            </label>
            <input
              id="new-student-special-needs"
              type="text"
              placeholder="e.g. Left-handed, ADHD / needs short breaks, Dyslexia, or None"
              value={newSpecialNeeds}
              onChange={(e) => setNewSpecialNeeds(e.target.value)}
            />
            <small>
              Helps our teachers tailor pacing and instructional technique.
            </small>
          </div>

          <div className="family-field">
            <label htmlFor="new-student-notes">
              Favorite songs, artists, or musical interests (optional)
            </label>
            <textarea
              id="new-student-notes"
              placeholder="e.g. Loves Disney soundtracks, nursery rhymes, hymns, or video game tunes..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>

          <div className="family-section-legend">Safety &amp; Device Access</div>

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
                students can access lessons directly through your parent account
                using Kid Mode.
              </small>
            </span>
          </label>

          {createLogin && (
            <div className="family-field">
              <label htmlFor="new-student-password">Student password *</label>
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

          <div className="modal-actions">
            <button
              type="button"
              className="family-button subtle"
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
      </PortalModal>
    </main>
  );
}
