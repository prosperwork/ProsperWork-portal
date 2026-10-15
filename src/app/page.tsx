"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Baby,
  CalendarDays,
  Check,
  ChevronRight,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useCurrencies } from "@/lib/academy/use-currencies";
import { useAcademyData } from "../lib/storage";
import ClassroomLinks from "./classroom/ClassroomLinks";
import BrandEmblem from "./_components/BrandEmblem";
import EmailComposerDialog, {
  type PortalEmailTarget,
} from "./_components/EmailComposerDialog";
import ProfileAvatar from "./_components/ProfileAvatar";
import {
  legacyWorkspaceAccess,
  legacyWorkspaceRoutes,
  legacyViewForPath,
} from "./_lib/portal-navigation";
import {
  makeId,
  niceDate,
  roleNames,
  roles,
  SectionTitle,
  titles,
} from "./_lib/portal-formatters";
import { handleActionModalSubmit } from "./_lib/portal-actions";
import ActionModal, {
  getFields,
  type Field,
  type FormKind,
} from "./_components/modals/ActionModal";
import KidPinDialog from "./_components/modals/KidPinDialog";
import EmergencyCoverModal from "./_components/modals/EmergencyCoverModal";
import OverviewView from "./_components/views/OverviewView";
import ScheduleView, {
  type QCAssignmentSnapshot,
} from "./_components/views/ScheduleView";
import FamiliesView from "./_components/views/FamiliesView";
import LeadsView from "./_components/views/LeadsView";
import FinanceView from "./_components/views/FinanceView";
import PeopleView from "./_components/views/PeopleView";
import CurriculumView from "./_components/views/CurriculumView";
import LearningView from "./_components/views/LearningView";
import ReportsView from "./_components/views/ReportsView";
import SettingsView from "./_components/views/SettingsView";
import type {
  AppView,
  AuditEntry,
  Currency,
  Expense,
  HomeworkItem,
  Lead,
  Lesson,
  LessonStatus,
  Payment,
  PayrollItem,
  Resource,
  Role,
  Student,
  StaffMember,
} from "../lib/types";

/**
 * ============================================================================
 * PROSPERWORK MUSIC ACADEMY - MAIN PORTAL APPLICATION CONTROLLER
 * ============================================================================
 * The primary workspace router and state hub for the academy portal.
 *
 * Architecture & Modular Subsystems:
 * - 10 Dedicated Domain Views in `src/app/_components/views/`:
 *   (Overview, Schedule, Families, Leads, Finance, People, Curriculum,
 *    Learning, Reports, Settings).
 * - ActionModal (`_components/modals/ActionModal.tsx`): Dynamic multi-entity forms.
 * - EmergencyCoverModal: 1-click same-day substitute teacher reassignment.
 * - KidPinDialog: Parental lock protection for kid practice mode.
 * - EmailComposerDialog: Direct role-based email authoring.
 * - ConfirmModal: Centralized confirmation modals for destructive operations.
 * - Global CSS modules (`src/app/styles/`): 5 decoupled scoped stylesheets.
 */
export default function HomePage() {
  const pathname = usePathname();
  const router = useRouter();

  // --------------------------------------------------------------------------
  // Financial Catalog & Multi-Currency Context
  // --------------------------------------------------------------------------
  const {
    currencies: currencyCatalog,
    rates: currencyRates,
    currencyError,
  } = useCurrencies();

  const currencyOptions: Field["options"] = currencyCatalog
    .filter((c) => c.enabled)
    .map((c) => ({
      value: c.code,
      label: `${c.code} · ${c.name} (${c.symbol})`,
    }));

  // --------------------------------------------------------------------------
  // Academy Data & Profile State
  // --------------------------------------------------------------------------
  const {
    data,
    profile,
    ready,
    saving,
    revalidating,
    error,
    updateData,
    reload,
    afterSave,
  } = useAcademyData();
  const ownTimezone = profile?.timezone || "Africa/Lagos";

  const dayKey = (value: string | Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ownTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  const todayKey = () => dayKey(new Date());

  const fx = Object.fromEntries(
    currencyCatalog.map((c) => [
      c.code,
      c.code === "NGN"
        ? 1
        : Number(
            currencyRates.find(
              (r) => r.currency === c.code && r.date <= todayKey()
            )?.rate ?? Number.NaN
          ),
    ])
  ) as Record<Currency, number>;

  const role: Role = profile?.role || "parent";
  const view = (legacyViewForPath[pathname] || "overview") as AppView;

  // --------------------------------------------------------------------------
  // Dialogs, Navigation & Child Safety State
  // --------------------------------------------------------------------------
  const [modal, setModal] = useState<FormKind | null>(null);
  const [emailTarget, setEmailTarget] = useState<PortalEmailTarget | null>(
    null
  );
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"today" | "week">("today");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [kidMode, setKidMode] = useState(false);
  const [kidPin, setKidPin] = useState("");
  const [kidUnlockPrompt, setKidUnlockPrompt] = useState(false);
  const [rules] = useState({
    consent: true,
    lessonVerify: true,
    notice: true,
    makerChecker: true,
  });
  const [filter, setFilter] = useState("all");

  // --------------------------------------------------------------------------
  // Quality Control & Emergency Replacement State
  // --------------------------------------------------------------------------
  const [qcAssignmentSnapshot, setQcAssignmentSnapshot] =
    useState<QCAssignmentSnapshot | null>(null);
  const [qcAssignmentError, setQcAssignmentError] = useState("");
  const [qcAssignmentLoading, setQcAssignmentLoading] = useState(false);
  const [emergencyCoverLesson, setEmergencyCoverLesson] =
    useState<Lesson | null>(null);
  const [managementStaff, setManagementStaff] = useState<
    { id: string; name: string; role: string; status: string }[]
  >([]);

  const openEmergencyCover = async (lesson: Lesson) => {
    setEmergencyCoverLesson(lesson);
    try {
      const response = await fetch("/api/management", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(result.staff)) {
        setManagementStaff(result.staff);
      }
    } catch {
      // ignore, fall back
    }
  };

  useEffect(() => {
    setSelectedDate(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: ownTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    );
  }, [ownTimezone]);

  useEffect(() => {
    if (!profile) return;
    if (pathname === "/") {
      if (profile.role === "parent") {
        router.replace("/family");
        return;
      }
      if (profile.role === "student") {
        router.replace("/learning");
        return;
      }
    }
    const requested = new URLSearchParams(window.location.search).get(
      "view"
    ) as AppView | null;
    if (!requested) return;
    const canonical =
      legacyWorkspaceRoutes[requested as keyof typeof legacyWorkspaceRoutes];
    router.replace(
      canonical && (canonical.roles as Role[]).includes(profile.role)
        ? canonical.href
        : profile.role === "parent"
        ? "/family"
        : profile.role === "student"
        ? "/learning"
        : "/"
    );
  }, [profile?.id, profile?.role, pathname, router]);

  useEffect(() => {
    if (role !== "qc" || !profile?.id) {
      setQcAssignmentSnapshot(null);
      setQcAssignmentError("");
      setQcAssignmentLoading(false);
      return;
    }
    let current = true;
    setQcAssignmentLoading(true);
    setQcAssignmentError("");
    void (async () => {
      try {
        const response = await fetch("/api/management", {
          credentials: "include",
          cache: "no-store",
        });
        const result = (await response
          .json()
          .catch(() => ({}))) as QCAssignmentSnapshot & { error?: string };
        if (
          !response.ok ||
          result.profile?.id !== profile.id ||
          !Array.isArray(result.lessons) ||
          !Array.isArray(result.students)
        ) {
          throw new Error(
            result.error || "Your assigned teaching could not be confirmed."
          );
        }
        if (current) setQcAssignmentSnapshot(result);
      } catch (cause) {
        if (current) {
          setQcAssignmentSnapshot(null);
          setQcAssignmentError(
            cause instanceof Error
              ? cause.message
              : "Your assigned teaching could not be confirmed."
          );
        }
      } finally {
        if (current) setQcAssignmentLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [role, profile?.id]);

  const superAdmin = role === "super_admin";
  const financeAccess =
    superAdmin || role === "general_manager" || role === "finance";
  const adminAccess =
    superAdmin ||
    role === "general_manager" ||
    role === "head_admin" ||
    role === "admin";
  const teacherAccess =
    role === "teacher" ||
    superAdmin ||
    role === "general_manager" ||
    role === "head_admin";
  const curriculumAccess = teacherAccess || role === "qc";
  const parentAccess = role === "parent" || role === "student";
  const canManage =
    superAdmin || role === "general_manager" || role === "head_admin";
  const activeStudent =
    data.students.find((student) => student.id === selectedStudentId) ||
    data.students[0];

  const qcOwnLessonIds = useMemo(
    () =>
      new Set(
        (qcAssignmentSnapshot?.lessons || [])
          .filter((lesson) => lesson.teacher_id === profile?.id)
          .map((lesson) => lesson.id)
      ),
    [qcAssignmentSnapshot, profile?.id]
  );
  const qcOwnStudentIds = useMemo(
    () =>
      new Set(
        (qcAssignmentSnapshot?.lessons || [])
          .filter((lesson) => lesson.teacher_id === profile?.id)
          .map((lesson) => lesson.student_id)
      ),
    [qcAssignmentSnapshot, profile?.id]
  );
  const studentsVisible =
    role === "qc"
      ? data.students.filter((student) => qcOwnStudentIds.has(student.id))
      : data.students;
  const visibleLessons = data.lessons;
  const filteredLessons = useMemo(
    () =>
      visibleLessons
        .filter((lesson) => {
          const matchDate = dayKey(lesson.startsAt) === selectedDate;
          return matchDate && (filter === "all" || lesson.status === filter);
        })
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [visibleLessons, selectedDate, filter, ownTimezone]
  );
  const unmarkedLessons = visibleLessons.filter((l) =>
    role === "qc"
      ? qcOwnLessonIds.has(l.id) &&
        l.status === "scheduled" &&
        dayKey(l.startsAt) < todayKey()
      : ["scheduled", "teacher_done"].includes(l.status) &&
        dayKey(l.startsAt) < todayKey()
  );
  const subtitle = titles[view];

  function notify(message: string) {
    afterSave(() => {
      setToast(message);
      window.setTimeout(() => setToast(""), 3000);
    });
  }
  function record(
    action: string,
    name: string,
    detail: string,
    actor = roleNames[role]
  ) {
    const entry: AuditEntry = {
      id: makeId("audit"),
      action,
      record: name,
      actor,
      at: new Date().toISOString(),
      detail,
    };
    updateData((current) => ({ ...current, audit: [entry, ...current.audit] }));
  }
  function changeView(nextView: AppView) {
    const destination = legacyWorkspaceRoutes[nextView];
    if (!destination || !legacyWorkspaceAccess[nextView].includes(role)) return;
    router.push(destination.href);
    setQuery("");
  }
  function openForm(kind: FormKind) {
    if (kind === "pin") {
      window.location.assign("/family");
      return;
    }
    if (["homeworkSubmit", "reschedule"].includes(kind)) {
      window.location.assign("/workflows");
      return;
    }
    if (kind === "staff") {
      if (superAdmin) window.location.assign("/accounts");
      else
        notify(
          "Staff invitations are managed by the owner. HR onboarding is still being connected."
        );
      return;
    }
    setModal(kind);
  }
  function submitForm(values: Record<string, string>) {
    if (!modal) return;
    if (modal === "pin") {
      setKidPin(values.pin);
      setKidMode(true);
      setKidUnlockPrompt(false);
      setModal(null);
      notify("Kid Mode unlocked for this browser session.");
      return;
    }

    const result = handleActionModalSubmit({
      modal,
      values,
      role,
      data,
      profileName: profile?.name,
      todayKey: todayKey(),
    });

    if (result) {
      updateData(result.updater);
      if (result.createdStudentId) {
        setSelectedStudentId(result.createdStudentId);
      }
      notify(result.notificationMessage);
    }
    setModal(null);
  }

  function setLessonStatus(
    lesson: Lesson,
    nextStatus: LessonStatus,
    verify = false
  ) {
    updateData((current) => {
      const lessons = current.lessons.map((item) => {
        if (item.id !== lesson.id) return item;
        return {
          ...item,
          status: nextStatus,
          verification: verify
            ? {
                teacher: item.teacherName,
                admin: profile?.name || "Admin",
                at: new Date().toISOString(),
              }
            : item.verification,
        };
      });
      return {
        ...current,
        lessons,
        audit: [
          {
            id: makeId("audit"),
            action: verify ? "Lesson verified" : "Lesson status updated",
            record: `${lesson.studentName} · ${lesson.title}`,
            actor: roleNames[role],
            at: new Date().toISOString(),
            detail: `Status changed to ${nextStatus}${
              verify ? "; two-person check completed." : "."
            }`,
          },
          ...current.audit,
        ],
      };
    });
    notify(`Class marked as ${nextStatus.replace("_", " ")}.`);
  }

  function setLeadStatus(lead: Lead, status: Lead["status"]) {
    updateData((current) => ({
      ...current,
      leads: current.leads.map((item) =>
        item.id === lead.id
          ? {
              ...item,
              status,
              firstResponseAt:
                !item.firstResponseAt && status !== "new"
                  ? new Date().toISOString()
                  : item.firstResponseAt,
            }
          : item
      ),
      audit: [
        {
          id: makeId("audit"),
          action: "Lead pipeline updated",
          record: `${lead.parentName} · ${lead.childName}`,
          actor: roleNames[role],
          at: new Date().toISOString(),
          detail: `Pipeline status moved to ${status}.`,
        },
        ...current.audit,
      ],
    }));
    notify(`Lead moved to ${status.replace("_", " ")}.`);
  }

  function setHomeworkStatus(
    item: HomeworkItem,
    status: HomeworkItem["status"]
  ) {
    updateData((current) => ({
      ...current,
      homework: current.homework.map((task) =>
        task.id === item.id ? { ...task, status } : task
      ),
      audit: [
        {
          id: makeId("audit"),
          action: "Homework reviewed",
          record: `${item.studentName} · ${item.title}`,
          actor: roleNames[role],
          at: new Date().toISOString(),
          detail: `Status changed to ${status}.`,
        },
        ...current.audit,
      ],
    }));
    notify(`Homework marked as ${status}.`);
  }

  function setPaymentStatus(payment: Payment, status: Payment["status"]) {
    updateData((current) => ({
      ...current,
      payments: current.payments.map((p) =>
        p.id === payment.id ? { ...p, status } : p
      ),
      audit: [
        {
          id: makeId("audit"),
          action: "Payment verified",
          record: `${payment.parentName} · ${payment.amount} ${payment.currency}`,
          actor: roleNames[role],
          at: new Date().toISOString(),
          detail: `Payment status changed to ${status}; receipt verified.`,
        },
        ...current.audit,
      ],
    }));
    notify(`Payment marked as ${status}.`);
  }

  function updateStaffStatus(
    person: StaffMember,
    nextStatus: StaffMember["status"]
  ) {
    updateData((current) => ({
      ...current,
      staff: current.staff.map((s) =>
        s.id === person.id ? { ...s, status: nextStatus } : s
      ),
      audit: [
        {
          id: makeId("audit"),
          action: "Staff status updated",
          record: `${person.name} · ${person.role}`,
          actor: roleNames[role],
          at: new Date().toISOString(),
          detail: `Status changed to ${nextStatus}.`,
        },
        ...current.audit,
      ],
    }));
    notify(
      `${person.name}'s status changed to ${nextStatus.replace("_", " ")}.`
    );
  }

  function updateConsent(student: Student) {
    const nextConsent = !student.consent;
    updateData((current) => ({
      ...current,
      students: current.students.map((s) =>
        s.id === student.id ? { ...s, consent: nextConsent } : s
      ),
      audit: [
        {
          id: makeId("audit"),
          action: "Social consent updated",
          record: student.name,
          actor: roleNames[role],
          at: new Date().toISOString(),
          detail: `Guardian consent is now ${
            nextConsent ? "granted" : "declined"
          }.`,
        },
        ...current.audit,
      ],
    }));
    notify(
      `Social media consent for ${student.name} is now ${
        nextConsent ? "active" : "declined"
      }.`
    );
  }

  function advanceSong(student: Student, song: string) {
    updateData((current) => ({
      ...current,
      students: current.students.map((s) => {
        if (s.id !== student.id) return s;
        const done = [...new Set([...s.songsDone, song])];
        const todo = s.songsToDo.filter((item) => item !== song);
        const rank =
          done.length >= 8
            ? "Master"
            : done.length >= 5
            ? "Amateur"
            : done.length >= 2
            ? "Beginner"
            : s.rank;
        return { ...s, songsDone: done, songsToDo: todo, rank };
      }),
      audit: [
        {
          id: makeId("audit"),
          action: "Song bank updated",
          record: `${student.name} · ${song}`,
          actor: roleNames[role],
          at: new Date().toISOString(),
          detail: `Marked learned; student progress saved.`,
        },
        ...current.audit,
      ],
    }));
    notify(`Congratulations! "${song}" added to ${student.name}'s Song Bank.`);
  }

  function openEmailComposer(
    type: "family" | "staff" | "lead",
    id: string,
    email: string,
    name: string
  ) {
    setEmailTarget({ recipientType: type, recipientId: id, email, name });
  }

  function openExternal(
    mode: "phone" | "whatsapp",
    phone: string,
    name: string,
    defaultText?: string
  ) {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (!cleanPhone) {
      notify(`No valid phone number recorded for ${name}.`);
      return;
    }
    if (mode === "whatsapp") {
      const url = defaultText
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultText)}`
        : `https://wa.me/${cleanPhone}`;
      window.open(url, "_blank", "noopener,noreferrer");
      notify(`WhatsApp draft opened for ${name}. Click Send in WhatsApp.`);
    } else {
      window.open(`tel:${cleanPhone}`, "_self");
    }
  }

  function onPortalEmailSent() {
    setEmailTarget(null);
    notify("Email sent through application SMTP.");
    void reload();
  }

  function enterKidMode() {
    if (!kidPin) {
      setModal("pin");
      return;
    }
    setKidUnlockPrompt(true);
  }

  function verifyKidPin(value: string) {
    if (value === kidPin) {
      setKidMode(true);
      setKidUnlockPrompt(false);
      notify("Welcome to Kid Mode. Tap any learned song to complete.");
    } else {
      notify("Incorrect PIN. Please re-enter.");
    }
  }

  function exitKidMode() {
    setKidMode(false);
    notify("Exited Kid Mode. Welcome back to the family dashboard.");
  }

  const headerActions = (
    label: string,
    formKind: FormKind,
    icon: ReactNode = <Plus size={14} />
  ) => (
    <button className="btn" onClick={() => openForm(formKind)}>
      {icon}
      {label}
    </button>
  );

  const searchBar = (placeholder: string) => (
    <div className="search">
      <Search size={14} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );

  if (!ready)
    return (
      <main className="loading-screen">
        <div className="loading-mark">
          <BrandEmblem className="loading-emblem" />
        </div>
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
        <p>Opening your learning workspace…</p>
      </main>
    );

  if (!profile)
    return (
      <main className="loading-screen">
        <h1>Workspace unavailable</h1>
        <p role="alert">{error || "An active academy account is required."}</p>
        <button className="btn" onClick={() => void reload()}>
          Try again
        </button>
        <a href="/login">Return to sign-in</a>
      </main>
    );

  if (profile.status === "applicant")
    return (
      <main className="loading-screen">
        <div className="loading-mark">
          <ShieldCheck size={21} />
        </div>
        <h1>Applicant access only</h1>
        <p>
          Your staff workspace stays locked until the Owner activates your
          account.
        </p>
        <a className="btn primary" href="/hiring">
          Continue private applicant onboarding
        </a>
        <a href="/access-pending">Account status</a>
      </main>
    );

  if (!legacyWorkspaceAccess[view]?.includes(profile.role)) {
    if (profile.role === "parent") {
      router.replace("/family");
      return (
        <main className="loading-screen">
          <p>Opening family workspace…</p>
        </main>
      );
    }
    if (profile.role === "student") {
      router.replace("/learning");
      return (
        <main className="loading-screen">
          <p>Opening student workspace…</p>
        </main>
      );
    }
    return (
      <main className="loading-screen">
        <h1>Workspace unavailable</h1>
        <p role="alert">This workspace is not available to your account.</p>
        <a className="btn" href="/">
          Return to overview
        </a>
      </main>
    );
  }

  if (kidMode)
    return (
      <main className="kid-mode">
        <div className="kid-panel">
          <BrandEmblem className="kid-mode-emblem" />
          <p className="eyebrow">ProsperWork practice room</p>
          <h1>Your music is growing.</h1>
          <p className="page-subtitle">
            A little practice, a little progress. Today's songs are ready.
          </p>
          <div>
            {(activeStudent?.songsToDo || []).map((song) => (
              <button
                className="kid-song"
                key={song}
                onClick={() => advanceSong(activeStudent, song)}
              >
                {song}
                <Check size={14} />
              </button>
            ))}
          </div>
          <button className="btn" onClick={exitKidMode}>
            Back to parent view
          </button>
        </div>
      </main>
    );

  const modalTitles: Record<FormKind, { title: string; subtitle: string }> = {
    student: {
      title: "Enroll a new learner",
      subtitle:
        "Student DOB and social consent decision are required by the academy blueprint.",
    },
    lead: {
      title: "Capture family enquiry",
      subtitle:
        "Starts the speed-to-lead response timer. Connect to trial ushering.",
    },
    lesson: {
      title: "Schedule a class",
      subtitle:
        "Lessons appear on the teacher and student timetables with timezones attached.",
    },
    payment: {
      title: "New billing record",
      subtitle:
        "Agreed currency, payment terms and referral credit are preserved on the invoice.",
    },
    expense: {
      title: "Log academy expense",
      subtitle:
        "Retains category, source currency and date for tax preparation.",
    },
    resource: {
      title: "Add curriculum resource",
      subtitle: "Share songs, guides and exercises across teachers.",
    },
    homework: {
      title: "Assign practice homework",
      subtitle: "Practice tasks appear in the student notebook with due dates.",
    },
    homeworkSubmit: {
      title: "Submit practice note",
      subtitle: "Share what you practised with your teacher.",
    },
    payroll: {
      title: "Draft payroll entry",
      subtitle:
        "Maker-checker: drafts require Super Admin approval before payment.",
    },
    reschedule: {
      title: "Request reschedule",
      subtitle:
        "Notice cutoff applies. The scheduled slot remains until approved.",
    },
    pin: {
      title: "Set Kid Mode PIN",
      subtitle:
        "Choose a 4–8 digit PIN to protect parent access on shared family devices.",
    },
    staff: {
      title: "Invite academy staff",
      subtitle:
        "Add teacher, admin, QC or finance accounts to your department.",
    },
  };

  const viewRenderer: Record<AppView, () => ReactNode> = {
    overview: () => (
      <OverviewView
        data={data}
        role={role}
        visibleLessons={visibleLessons}
        studentsVisible={studentsVisible}
        ownTimezone={ownTimezone}
        financeAccess={financeAccess}
        superAdmin={superAdmin}
        fx={fx}
        changeView={changeView}
        notify={notify}
      />
    ),
    schedule: () => (
      <ScheduleView
        data={data}
        role={role}
        profile={profile}
        visibleLessons={visibleLessons}
        filteredLessons={filteredLessons}
        studentsVisible={studentsVisible}
        ownTimezone={ownTimezone}
        adminAccess={adminAccess}
        parentAccess={parentAccess}
        teacherAccess={teacherAccess}
        qcOwnLessonIds={qcOwnLessonIds}
        qcAssignmentSnapshot={qcAssignmentSnapshot}
        qcAssignmentLoading={qcAssignmentLoading}
        qcAssignmentError={qcAssignmentError}
        scheduleMode={scheduleMode}
        setScheduleMode={setScheduleMode}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        filter={filter}
        setFilter={setFilter}
        headerActions={headerActions}
        setLessonStatus={setLessonStatus}
        openEmergencyCover={openEmergencyCover}
        changeView={changeView}
      />
    ),
    families: () => (
      <FamiliesView
        data={data}
        role={role}
        studentsVisible={studentsVisible}
        query={query}
        searchBar={searchBar}
        adminAccess={adminAccess}
        parentAccess={parentAccess}
        superAdmin={superAdmin}
        selectedStudentId={selectedStudentId}
        setSelectedStudentId={setSelectedStudentId}
        headerActions={headerActions}
        openForm={openForm}
        updateConsent={updateConsent}
        openEmailComposer={openEmailComposer}
        notify={notify}
        qcAssignmentError={qcAssignmentError}
        qcAssignmentLoading={qcAssignmentLoading}
      />
    ),
    leads: () => (
      <LeadsView
        data={data}
        role={role}
        query={query}
        searchBar={searchBar}
        adminAccess={adminAccess}
        headerActions={headerActions}
        openEmailComposer={openEmailComposer}
        openExternal={openExternal}
        setLeadStatus={setLeadStatus}
        changeView={changeView}
        notify={notify}
      />
    ),
    finance: () => (
      <FinanceView
        data={data}
        role={role}
        query={query}
        searchBar={searchBar}
        financeAccess={financeAccess}
        parentAccess={parentAccess}
        superAdmin={superAdmin}
        fx={fx}
        currencyCatalog={currencyCatalog}
        headerActions={headerActions}
        setPaymentStatus={setPaymentStatus}
        notify={notify}
      />
    ),
    payroll: () => (
      <section className="card section-card">
        <SectionTitle
          title={
            role === "teacher"
              ? "Your private earnings wallet"
              : "Verified-attendance payroll"
          }
          detail="Salary amounts come from approved rates, exact course starts and immutable attendance—not manually typed lesson counts."
        />
        <p>
          The payroll workbench includes standard, trial and cover earnings,
          advances and rollover deductions, reasoned adjustments, and
          Finance-to-owner approval.
        </p>
        <a className="btn primary" href="/payroll">
          Open {role === "teacher" ? "my earnings wallet" : "payroll workbench"}{" "}
          <ChevronRight size={15} />
        </a>
      </section>
    ),
    people: () => (
      <PeopleView
        data={data}
        role={role}
        query={query}
        searchBar={searchBar}
        superAdmin={superAdmin}
        canManage={canManage}
        openEmailComposer={openEmailComposer}
        updateStaffStatus={updateStaffStatus}
      />
    ),
    curriculum: () => (
      <CurriculumView
        data={data}
        role={role}
        query={query}
        searchBar={searchBar}
        curriculumAccess={curriculumAccess}
        superAdmin={superAdmin}
        headerActions={headerActions}
        notify={notify}
      />
    ),
    learning: () => (
      <LearningView
        data={data}
        role={role}
        query={query}
        searchBar={searchBar}
        studentsVisible={studentsVisible}
        selectedStudentId={selectedStudentId}
        visibleLessons={visibleLessons}
        parentAccess={parentAccess}
        teacherAccess={teacherAccess}
        superAdmin={superAdmin}
        qcOwnLessonIds={qcOwnLessonIds}
        headerActions={headerActions}
        enterKidMode={enterKidMode}
        advanceSong={advanceSong}
        setHomeworkStatus={setHomeworkStatus}
      />
    ),
    reports: () => (
      <ReportsView
        data={data}
        query={query}
        searchBar={searchBar}
        superAdmin={superAdmin}
        notify={notify}
      />
    ),
    settings: () => (
      <SettingsView
        data={data}
        rules={rules}
        superAdmin={superAdmin}
        reload={reload}
      />
    ),
  };

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{subtitle?.title || "Workspace"}</span>
          <h1>{subtitle?.title || "ProsperWork"}</h1>
          <p className="page-subtitle">{subtitle?.sub || ""}</p>
        </div>
        <div className="heading-actions">
          {parentAccess && (
            <button className="btn ghost" onClick={enterKidMode}>
              <Baby size={14} />
              Kid Mode
            </button>
          )}
        </div>
      </div>
      {saving && <p role="status">Saving to the academy database…</p>}
      {!saving && revalidating && (
        <div role="status" className="sync-indicator">
          <span className="dot" />
          <span>Refreshing workspace in background…</span>
        </div>
      )}
      {error && (
        <div role="alert" className="form-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      {!parentAccess && unmarkedLessons.length > 0 && (
        <section className="notice" role="status" style={{ marginBottom: 16 }}>
          <strong>
            {unmarkedLessons.length} previous-day classes still need marking or
            verification.
          </strong>{" "}
          {unmarkedLessons.slice(0, 5).map((l) => (
            <button
              key={l.id}
              className="subtle-link"
              onClick={() => {
                setSelectedDate(dayKey(l.startsAt));
                changeView("schedule");
              }}
            >
              {l.studentName} · {niceDate(l.startsAt)}
            </button>
          ))}
        </section>
      )}
      {["overview", "schedule", "families", "learning"].includes(view) && (
        <ClassroomLinks lessons={visibleLessons} />
      )}
      {viewRenderer[view]()}
      {currencyError && <p role="alert">{currencyError}</p>}
      {modal && (
        <ActionModal
          title={modalTitles[modal].title}
          subtitle={modalTitles[modal].subtitle}
          fields={getFields(
            modal,
            data,
            role,
            activeStudent?.parentName,
            currencyOptions
          )}
          onClose={() => setModal(null)}
          onSubmit={submitForm}
        />
      )}
      {emailTarget && (
        <EmailComposerDialog
          target={emailTarget}
          onClose={() => setEmailTarget(null)}
          onSent={onPortalEmailSent}
        />
      )}
      {emergencyCoverLesson && (
        <EmergencyCoverModal
          lesson={emergencyCoverLesson}
          managementStaff={managementStaff}
          onClose={() => setEmergencyCoverLesson(null)}
          onSuccess={() => {
            setToast(
              "Emergency cover successfully assigned. Attendance and payroll kinds updated."
            );
            setEmergencyCoverLesson(null);
            void reload();
          }}
        />
      )}
      {kidUnlockPrompt && (
        <KidPinDialog
          onCancel={() => setKidUnlockPrompt(false)}
          onSubmit={verifyKidPin}
        />
      )}
      {toast && (
        <div role="status" aria-live="polite" className="toast">
          {toast}
        </div>
      )}
    </div>
  );
}
