"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Calendar,
  CalendarCheck2,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Globe,
  HelpCircle,
  Link2,
  MessageCircle,
  MessageSquare,
  Music2,
  Phone,
  RefreshCw,
  RotateCcw,
  Send,
  Timer,
  User,
  UserCheck,
  UserCog,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import ProfileAvatar from "../ProfileAvatar";
import { PortalModal } from "../PortalModal";
import {
  Empty,
  niceDate,
  Pill,
  SectionTitle,
  timeAt,
} from "../../_lib/portal-formatters";
import type { FormKind } from "../modals/ActionModal";
import type { AcademyData, AppView, Lead, Role } from "@/lib/types";

// 6 Pipeline Stages matching user workflow
const PIPELINE_STAGES: {
  id: Lead["status"];
  label: string;
  pillColor: { bg: string; text: string; border: string; dot: string };
}[] = [
  {
    id: "new",
    label: "New Lead",
    pillColor: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", dot: "#3b82f6" },
  },
  {
    id: "contacted",
    label: "Contacted",
    pillColor: { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe", dot: "#8b5cf6" },
  },
  {
    id: "trial_booked",
    label: "Trial Booked",
    pillColor: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0", dot: "#22c55e" },
  },
  {
    id: "converted",
    label: "Converted",
    pillColor: { bg: "#ecfdf5", text: "#047857", border: "#a7f3d0", dot: "#10b981" },
  },
  {
    id: "lost",
    label: "Lost",
    pillColor: { bg: "#f8fafc", text: "#475569", border: "#e2e8f0", dot: "#94a3b8" },
  },
];

const getStageDisplay = (status: Lead["status"]) => {
  if (status === "called_no_answer" || status === "callback") {
    return PIPELINE_STAGES.find((s) => s.id === "contacted")!;
  }
  if (
    status === "trial_booked" ||
    status === "trial_requested" ||
    status === "trial_verified"
  ) {
    return PIPELINE_STAGES.find((s) => s.id === "trial_booked")!;
  }
  if (status === "lost" || status === "nursery" || status === "winback") {
    return PIPELINE_STAGES.find((s) => s.id === "lost")!;
  }
  const match = PIPELINE_STAGES.find((s) => s.id === status);
  return match || PIPELINE_STAGES[0];
};

type PipelineFilterKey =
  | "all"
  | "new"
  | "contacted"
  | "trial_booked"
  | "converted"
  | "lost";

const COMMON_TIMEZONES = [
  { value: "Africa/Lagos", label: "West Africa Time · Lagos (GMT+1)" },
  { value: "Europe/London", label: "UK Time · London (GMT+0)" },
  { value: "Europe/Dublin", label: "Ireland Time · Dublin (GMT+0)" },
  { value: "Europe/Paris", label: "Central Europe · Paris (GMT+1)" },
  { value: "Europe/Berlin", label: "Central Europe · Berlin (GMT+1)" },
  { value: "America/New_York", label: "US Eastern · New York (GMT-5)" },
  { value: "America/Chicago", label: "US Central · Chicago (GMT-6)" },
  { value: "America/Denver", label: "US Mountain · Denver (GMT-7)" },
  { value: "America/Los_Angeles", label: "US Pacific · Los Angeles (GMT-8)" },
  { value: "America/Toronto", label: "Canada Eastern · Toronto (GMT-5)" },
  { value: "America/Vancouver", label: "Canada Pacific · Vancouver (GMT-8)" },
  { value: "Africa/Accra", label: "Ghana Time · Accra (GMT+0)" },
  { value: "Africa/Nairobi", label: "East Africa Time · Nairobi (GMT+3)" },
  { value: "Africa/Johannesburg", label: "South Africa Time · Johannesburg (GMT+2)" },
  { value: "Africa/Cairo", label: "Egypt Time · Cairo (GMT+2)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time · Dubai (GMT+4)" },
  { value: "Asia/Singapore", label: "Singapore Time (GMT+8)" },
  { value: "Asia/Tokyo", label: "Japan Time · Tokyo (GMT+9)" },
  { value: "Australia/Sydney", label: "Australian Eastern · Sydney (GMT+11)" },
];

export default function LeadsView({
  data,
  role,
  query,
  searchBar,
  adminAccess,
  financeAccess = false,
  headerActions,
  openEmailComposer,
  openExternal,
  setLeadStatus,
  changeView,
  notify,
  reload,
}: {
  data: AcademyData;
  role: Role;
  query: string;
  searchBar: (placeholder: string) => ReactNode;
  adminAccess: boolean;
  financeAccess?: boolean;
  headerActions: (label: string, kind: FormKind) => ReactNode;
  openEmailComposer: (
    type: "family" | "staff" | "lead",
    id: string,
    email: string,
    name: string
  ) => void;
  openExternal: (
    mode: "phone" | "whatsapp",
    phone: string,
    name: string,
    defaultText?: string
  ) => void;
  setLeadStatus: (lead: Lead, status: Lead["status"], extraPayload?: Partial<Lead>) => void | Promise<void>;
  changeView: (view: AppView) => void;
  notify: (msg: string) => void;
  reload?: () => Promise<void>;
}) {
  const [stageFilter, setStageFilter] = useState<PipelineFilterKey>("all");
  const [filterMode, setFilterMode] = useState<
    "all" | "meta" | "ready" | "budget" | "fb" | "ig" | "other"
  >("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeDropdownLeadId, setActiveDropdownLeadId] = useState<string | null>(null);
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [updatingStageLeadId, setUpdatingStageLeadId] = useState<string | null>(null);

  // Active Music Teachers from Academy Staff
  const activeTeachers = (data?.staff || []).filter(
    (s) =>
      s.status === "active" &&
      (["teacher", "qc"].includes(s.role) ||
        s.department === "Music Education" ||
        s.role.includes("teacher") ||
        s.role.includes("tutor") ||
        s.role.includes("instructor")) &&
      s.role !== "parent" &&
      s.role !== "student"
  );

  // Catalog Instruments
  const [catalogInstruments, setCatalogInstruments] = useState<string[]>([
    "Piano",
    "Violin",
    "Guitar",
    "Voice / Singing",
    "Drums",
    "Saxophone",
    "Keyboard",
    "Flute",
    "Music Theory",
  ]);

  useEffect(() => {
    fetch("/api/catalogs?catalog=instruments")
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json?.items) && json.items.length > 0) {
          const list = json.items
            .filter((i: any) => (!i.catalog || i.catalog === "instruments") && i.enabled !== false)
            .sort((a: any, b: any) => (a.sort_order ?? 100) - (b.sort_order ?? 100))
            .map((i: any) => i.label || i.name || i.code)
            .filter(Boolean);
          if (list.length) setCatalogInstruments(list);
        }
      })
      .catch(() => null);
  }, []);

  // Trial Booking Modal State
  const [trialBookingLead, setTrialBookingLead] = useState<Lead | null>(null);
  const [trialForm, setTrialForm] = useState({
    childName: "",
    date: "",
    time: "16:00",
    instrument: "Piano",
    teacherName: "",
    timezone: "Africa/Lagos",
    classroomProvider: "inbuilt" as "inbuilt" | "google_meet",
    meetUrl: "",
    notes: "",
    sendWhatsAppConfirmation: true,
  });
  const [bookingTrialLoading, setBookingTrialLoading] = useState(false);

  const openTrialBookingModal = (lead: Lead) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const defaultTeacher = activeTeachers[0]?.name || lead.teacherName || "";
    const phone = resolveLeadPhone(lead);
    let defaultTz = "Africa/Lagos";
    if (phone.startsWith("+44") || phone.startsWith("44")) defaultTz = "Europe/London";
    else if (phone.startsWith("+1") || phone.startsWith("1")) defaultTz = "America/New_York";
    else if (phone.startsWith("+971")) defaultTz = "Asia/Dubai";

    const origin = typeof window !== "undefined" ? window.location.origin : "https://prosperworkmusic.com";
    const cleanId = lead.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8);
    const existingMeetUrl = (lead as any).trialMeetUrl;
    const existingProvider = (lead as any).trialClassroomProvider || "inbuilt";

    setTrialForm({
      childName: lead.childName && lead.childName !== lead.parentName ? lead.childName : lead.parentName,
      date: (lead as any).trialScheduledAt ? (lead as any).trialScheduledAt.split("T")[0] : dateStr,
      time: (lead as any).trialScheduledAt ? (lead as any).trialScheduledAt.split("T")[1]?.slice(0, 5) || "16:00" : "16:00",
      instrument: lead.instrument || "Piano",
      teacherName: (lead as any).trialTeacher || lead.teacherName || defaultTeacher,
      timezone: (lead as any).trialTimezone || defaultTz,
      classroomProvider: existingProvider,
      meetUrl: existingMeetUrl || `${origin}/classroom?room=trial_${cleanId}`,
      notes: "Free 30-minute trial assessment",
      sendWhatsAppConfirmation: Boolean(phone),
    });
    setTrialBookingLead(lead);
  };

  const handleSelectProvider = (provider: "inbuilt" | "google_meet") => {
    if (!trialBookingLead) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://prosperworkmusic.com";
    const cleanId = trialBookingLead.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8);

    if (provider === "google_meet") {
      setTrialForm((prev) => ({
        ...prev,
        classroomProvider: "google_meet",
        meetUrl: prev.meetUrl && prev.meetUrl.includes("meet.google.com") ? prev.meetUrl : "",
      }));
    } else {
      setTrialForm((prev) => ({
        ...prev,
        classroomProvider: "inbuilt",
        meetUrl: `${origin}/classroom?room=trial_${cleanId}`,
      }));
    }
  };

  const handleConfirmTrialBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trialBookingLead) return;
    if (!trialForm.date) {
      notify("Please select an assessment date.");
      return;
    }
    if (!trialForm.time) {
      notify("Please select an assessment time.");
      return;
    }
    if (!trialForm.teacherName) {
      notify("Please select an instructor for the assessment.");
      return;
    }
    if (trialForm.classroomProvider === "google_meet" && (!trialForm.meetUrl || !trialForm.meetUrl.includes("meet.google.com"))) {
      notify("Please paste an active Google Meet room link or select Inbuilt Video Studio.");
      return;
    }

    setBookingTrialLoading(true);
    try {
      const startsAt = new Date(`${trialForm.date}T${trialForm.time}:00`).toISOString();
      const slotText = `${niceDate(startsAt)} at ${timeAt(startsAt)} (${trialForm.teacherName})`;

      const updatedExtra: Partial<Lead> = {
        childName: trialForm.childName.trim() || trialBookingLead.childName,
        instrument: trialForm.instrument.trim() || trialBookingLead.instrument,
        teacherName: trialForm.teacherName,
        preferredSlots: [slotText],
        trialScheduledAt: startsAt,
        trialTeacher: trialForm.teacherName,
        trialTimezone: trialForm.timezone,
        trialClassroomProvider: trialForm.classroomProvider,
        trialMeetUrl: trialForm.meetUrl,
      };

      // Update pipeline status to trial_booked and persist trial details & trigger Meta CAPI event
      await setLeadStatus(trialBookingLead, "trial_booked", updatedExtra);

      // Keep open lead modal in sync if viewing this lead
      setSelectedLead((prev) =>
        prev && prev.id === trialBookingLead.id
          ? { ...prev, ...updatedExtra, status: "trial_booked" }
          : prev
      );

      // Send WhatsApp Confirmation if enabled
      const phone = resolveLeadPhone(trialBookingLead);
      if (trialForm.sendWhatsAppConfirmation && phone) {
        const parentFirst = cleanName(trialBookingLead.parentName).split(" ")[0];
        const childDisp = cleanName(trialForm.childName || trialBookingLead.childName || "your child");
        const waText = `Hello ${parentFirst}! Great news! We have scheduled ${childDisp}'s free 1-on-1 trial assessment for ${trialForm.instrument || "Piano"}:\n\nDate: ${niceDate(startsAt)}\nTime: ${timeAt(startsAt)} (${trialForm.timezone})\nTeacher: ${trialForm.teacherName}\nMeeting Link: ${trialForm.meetUrl}\n\nOur teacher will be ready in the studio room to welcome you. If you have any questions or need to reschedule, simply reply to this message!`;

        await fetch("/api/integrations/whatsapp/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            leadId: trialBookingLead.id,
            message: waText,
          }),
        }).catch(() => null);
      }

      notify(`Trial assessment booked for ${cleanName(trialForm.childName || trialBookingLead.parentName)} on ${niceDate(startsAt)}!`);
      setTrialBookingLead(null);
    } catch (err: any) {
      notify(err?.message || "Failed to save trial booking. Please try again.");
    } finally {
      setBookingTrialLoading(false);
    }
  };

  const handleStageChange = (lead: Lead, newStage: Lead["status"]) => {
    if (newStage === "trial_booked") {
      openTrialBookingModal(lead);
      return;
    }
    if (updatingStageLeadId === lead.id) return;
    setUpdatingStageLeadId(lead.id);
    try {
      setLeadStatus(lead, newStage);
    } finally {
      setTimeout(() => setUpdatingStageLeadId(null), 700);
    }
  };

  // In-App WhatsApp Live Chat State
  const [whatsAppLead, setWhatsAppLead] = useState<Lead | null>(null);
  const [whatsAppMessages, setWhatsAppMessages] = useState<any[]>([]);
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppDraft, setWhatsAppDraft] = useState("");
  const [isManualTakeover, setIsManualTakeover] = useState(false);

  const openWhatsAppChat = async (lead: Lead) => {
    setWhatsAppLead(lead);
    setWhatsAppMessages([]);
    setWhatsAppDraft("");
    setIsManualTakeover(Boolean((lead as any).manual_takeover || (lead as any).ai_disabled));
    setLoadingWhatsApp(true);
    const phone = resolveLeadPhone(lead);
    try {
      const res = await fetch(
        `/api/integrations/whatsapp/messages?leadId=${encodeURIComponent(lead.id)}&phone=${encodeURIComponent(phone)}`
      );
      const json = await res.json();
      if (json.messages) {
        setWhatsAppMessages(json.messages);
      }
      if (typeof json.manualTakeover === "boolean") {
        setIsManualTakeover(json.manualTakeover);
      }
      if (Array.isArray(json.admins) && json.admins.length > 0) {
        setDynamicAdmins(json.admins);
        setSelectedAdminName((curr) => curr || json.admins[0].name);
        setSelectedAdminPhone((curr) => curr || json.admins[0].phone);
      }
      if (json.pricing?.summary) {
        setDynamicPricing(json.pricing.summary);
      }
      if (json.schoolPhone) {
        setDynamicSchoolPhone(json.schoolPhone);
      }
    } catch {
      // quiet fallback
    } finally {
      setLoadingWhatsApp(false);
    }
  };

  const handleSendWhatsApp = async (
    customText?: string,
    buttons?: Array<{ id: string; title: string }>,
    assignOwner?: string
  ) => {
    if (!whatsAppLead) return;
    const phone = resolveLeadPhone(whatsAppLead);
    if (!phone) {
      notify("No phone number available for this lead.");
      return;
    }
    const textToSend = (customText || whatsAppDraft).trim();
    if (!textToSend && (!buttons || buttons.length === 0)) return;

    setSendingWhatsApp(true);
    try {
      const res = await fetch("/api/integrations/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: whatsAppLead.id,
          phone,
          message: textToSend,
          buttons,
          assignOwner: assignOwner || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setWhatsAppDraft("");
        setIsManualTakeover(true);
        notify("WhatsApp message dispatched via Meta Cloud API!");
        if (whatsAppLead.status === "new") {
          setLeadStatus(whatsAppLead, "contacted");
        }
        setWhatsAppLead((prev) =>
          prev
            ? {
                ...prev,
                status: prev.status === "new" ? "contacted" : prev.status,
                manual_takeover: true,
                ai_disabled: true,
                ...(assignOwner ? { owner: assignOwner } : {}),
              }
            : null
        );
        const refetch = await fetch(
          `/api/integrations/whatsapp/messages?leadId=${encodeURIComponent(whatsAppLead.id)}&phone=${encodeURIComponent(phone)}`
        );
        const refetchJson = await refetch.json();
        if (refetchJson.messages) {
          setWhatsAppMessages(refetchJson.messages);
        }
        if (reload) await reload();
      } else {
        notify(`WhatsApp error: ${json.error || "Failed to send message"}`);
      }
    } catch {
      notify("Network error dispatching WhatsApp message.");
    } finally {
      setSendingWhatsApp(false);
    }
  };

  // Admin Handover State (Dynamically populated from database settings)
  const [showAdminHandover, setShowAdminHandover] = useState(false);
  const [dynamicAdmins, setDynamicAdmins] = useState<Array<{ name: string; phone: string; role?: string }>>([]);
  const [dynamicPricing, setDynamicPricing] = useState<string>("");
  const [dynamicSchoolPhone, setDynamicSchoolPhone] = useState<string>("");
  const [selectedAdminName, setSelectedAdminName] = useState("");
  const [customAdminName, setCustomAdminName] = useState("");
  const [selectedAdminPhone, setSelectedAdminPhone] = useState("");
  const [assignAsOwner, setAssignAsOwner] = useState(true);

  const effectiveAdminName =
    selectedAdminName === "Custom"
      ? customAdminName.trim() || "Administrator"
      : selectedAdminName || "Administrator";

  const [resettingChat, setResettingChat] = useState(false);

  const handleRetriggerAutoReply = async () => {
    if (!whatsAppLead || resettingChat) return;
    const phone = resolveLeadPhone(whatsAppLead);
    if (!phone) return;

    setResettingChat(true);
    try {
      const res = await fetch("/api/integrations/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          phone,
          leadId: whatsAppLead.id,
          resetLeadStage: false,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setIsManualTakeover(false);
        setWhatsAppLead((prev) =>
          prev
            ? { ...prev, force_next_welcome_reply: true, manual_takeover: false, ai_disabled: false }
            : null
        );
        notify(
          "Auto-reply re-armed! AI is re-enabled for this chat. Send a message to trigger the AI intake workflow."
        );
        if (reload) await reload();
      } else {
        notify(`Error: ${json.error || "Failed to arm auto-reply"}`);
      }
    } catch {
      notify("Network error while arming auto-reply.");
    } finally {
      setResettingChat(false);
    }
  };



  const statusButton = (label: string, onClick: () => void, tone = "ghost") => (
    <button type="button" className={`btn small ${tone}`} onClick={onClick}>
      {label}
    </button>
  );

  const stages: Lead["status"][] = [
    "new",
    "contacted",
    "callback",
    "trial_requested",
    "trial_booked",
    "trial_verified",
    "converted",
    "nursery",
    "winback",
  ];

  // Helper to detect platform
  const getLeadPlatform = (lead: Lead): "fb" | "ig" | "other" => {
    const p = (lead.platform || lead.metaPlatform || "").toLowerCase();
    if (p === "ig" || p === "instagram") return "ig";
    if (p === "fb" || p === "facebook") return "fb";
    const src = (lead.source || "").toLowerCase();
    if (src.includes("instagram")) return "ig";
    if (src.includes("meta") || src.includes("facebook")) return "fb";
    return "other";
  };

  const isMetaLead = (lead: Lead): boolean => {
    return Boolean(
      lead.metaLeadId ||
      lead.metaFormId ||
      lead.metaPlatform ||
      lead.platform ||
      (lead.source && lead.source.toLowerCase().includes("meta"))
    );
  };

  // Helper to extract phone from top-level or customAnswers fallback
  const resolveLeadPhone = (lead: Lead): string => {
    if (lead.phone && lead.phone.trim() && !lead.phone.includes("<test lead:")) {
      return lead.phone.trim();
    }
    const ca = lead.customAnswers || {};
    for (const [k, v] of Object.entries(ca)) {
      const keyLower = k.toLowerCase();
      if (
        keyLower.includes("whatsapp") ||
        keyLower.includes("phone") ||
        keyLower.includes("mobile") ||
        keyLower.includes("contact")
      ) {
        const valStr = String(v || "").trim();
        if (valStr && !valStr.includes("<test lead:")) {
          return valStr;
        }
      }
    }
    return "";
  };

  // Helper to parse readiness intent
  const parseReadiness = (val?: string) => {
    if (!val) return null;
    const lower = val.toLowerCase();
    if (lower.includes("yes") || lower.includes("ready") || lower.includes("invest")) {
      return {
        type: "ready" as const,
        shortLabel: "Ready to Invest",
        fullText: val.replace(/_/g, " "),
        tone: "success",
      };
    }
    if (lower.includes("no") || lower.includes("not_fit") || lower.includes("budget")) {
      return {
        type: "budget" as const,
        shortLabel: "Budget Mismatch",
        fullText: val.replace(/_/g, " "),
        tone: "warning",
      };
    }
    if (lower.includes("dummy") || lower.includes("<test lead")) {
      return {
        type: "test" as const,
        shortLabel: "Test Lead",
        fullText: "Meta Sandbox Submission",
        tone: "neutral",
      };
    }
    return {
      type: "other" as const,
      shortLabel: val.replace(/_/g, " ").slice(0, 24),
      fullText: val.replace(/_/g, " "),
      tone: "neutral",
    };
  };

  // Clean candidate name
  const cleanName = (name?: string) => {
    if (!name) return "ProsperWork Candidate";
    if (name.includes("<test lead:") || name.toLowerCase().includes("dummy")) {
      return "Meta Test Candidate";
    }
    return name;
  };

  // Clean question labels for human reading
  const cleanQuestionLabel = (q: string) => {
    let clean = q.replace(/_/g, " ").trim();
    if (clean.toLowerCase().includes("whatsapp")) return "WhatsApp Phone Number";
    if (clean.toLowerCase().includes("lessons start at")) {
      return "Budget & Monthly Rate (£45 ~ ₦78,000 / month)";
    }
    if (clean.toLowerCase().includes("instrument")) return "Preferred Instrument";
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  };

  const searchedLeads = data.leads.filter((lead) => {
    const phone = resolveLeadPhone(lead);
    const displayName = cleanName(lead.parentName);
    const matchesQuery = `${displayName} ${lead.childName} ${lead.instrument} ${lead.source} ${lead.status} ${lead.email} ${phone}`
      .toLowerCase()
      .includes(query.toLowerCase());

    if (!matchesQuery) return false;

    const plat = getLeadPlatform(lead);
    const intent = parseReadiness(lead.readiness);

    if (filterMode === "all") return true;
    if (filterMode === "meta") return isMetaLead(lead);
    if (filterMode === "ready") return intent?.type === "ready";
    if (filterMode === "budget") return intent?.type === "budget";
    if (filterMode === "fb") return plat === "fb";
    if (filterMode === "ig") return plat === "ig";
    if (filterMode === "other") return plat === "other" && !isMetaLead(lead);
    return true;
  });

  // Descending sort: latest / newest arrived lead shows first!
  const sortedLeads = [...searchedLeads].sort((a, b) => {
    const timeA = a.arrivedAt ? new Date(a.arrivedAt).getTime() : 0;
    const timeB = b.arrivedAt ? new Date(b.arrivedAt).getTime() : 0;
    return timeB - timeA;
  });

  const list =
    stageFilter === "all"
      ? sortedLeads
      : sortedLeads.filter((lead) => {
          if (stageFilter === "new") return lead.status === "new";
          if (stageFilter === "contacted") {
            return (
              lead.status === "contacted" ||
              lead.status === "called_no_answer" ||
              lead.status === "callback"
            );
          }
          if (stageFilter === "trial_booked") {
            return (
              lead.status === "trial_booked" ||
              lead.status === "trial_requested" ||
              lead.status === "trial_verified"
            );
          }
          if (stageFilter === "converted") return lead.status === "converted";
          if (stageFilter === "lost") {
            return (
              lead.status === "lost" ||
              lead.status === "nursery" ||
              lead.status === "winback"
            );
          }
          return lead.status === stageFilter;
        });

  const pipelineTabs: { id: PipelineFilterKey; label: string; count: number }[] = [
    { id: "all", label: "All Leads", count: searchedLeads.length },
    {
      id: "new",
      label: "New Leads",
      count: searchedLeads.filter((l) => l.status === "new").length,
    },
    {
      id: "contacted",
      label: "Contacted",
      count: searchedLeads.filter(
        (l) =>
          l.status === "contacted" ||
          l.status === "called_no_answer" ||
          l.status === "callback"
      ).length,
    },
    {
      id: "trial_booked",
      label: "Trial Booked",
      count: searchedLeads.filter(
        (l) =>
          l.status === "trial_booked" ||
          l.status === "trial_requested" ||
          l.status === "trial_verified"
      ).length,
    },
    {
      id: "converted",
      label: "Converted",
      count: searchedLeads.filter((l) => l.status === "converted").length,
    },
    {
      id: "lost",
      label: "Lost",
      count: searchedLeads.filter(
        (l) => l.status === "lost" || l.status === "nursery" || l.status === "winback"
      ).length,
    },
  ];

  const metaCount = data.leads.filter(isMetaLead).length;
  const readyCount = data.leads.filter((l) => parseReadiness(l.readiness)?.type === "ready").length;
  const budgetCount = data.leads.filter((l) => parseReadiness(l.readiness)?.type === "budget").length;
  const fbCount = data.leads.filter((l) => getLeadPlatform(l) === "fb").length;
  const igCount = data.leads.filter((l) => getLeadPlatform(l) === "ig").length;

  const respondedLeads = data.leads.filter((lead) => lead.firstResponseAt);
  const avgResponseMinutes = respondedLeads.length
    ? Math.round(
        respondedLeads.reduce(
          (sum, lead) =>
            sum +
            Math.max(
              0,
              (new Date(lead.firstResponseAt!).getTime() -
                new Date(lead.arrivedAt).getTime()) /
                60000
            ),
          0
        ) / respondedLeads.length
      )
    : null;

  // Meta leads sync action (can run manually or silently in background)
  const handleSyncMeta = async (silent = false) => {
    if (syncingMeta) return;
    setSyncingMeta(true);
    if (!silent) {
      notify("Connecting to Meta Graph API and synchronizing leads...");
    }
    try {
      const res = await fetch("/api/integrations/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (!silent) {
          throw new Error(data.error || "Meta synchronization failed.");
        }
        return;
      }
      if (!silent || (data.inserted && data.inserted > 0)) {
        notify(
          `Meta sync: ${data.inserted || 0} new lead(s) retrieved, ${
            data.skipped || 0
          } already up to date.`
        );
      }
      if (reload) {
        await reload();
      }
    } catch (err: unknown) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Sync error";
        notify(`Meta sync error: ${message}`);
      }
    } finally {
      setSyncingMeta(false);
    }
  };

  // Automated Real-Time Background Synchronization:
  // 1. Instantly reloads view when tab gains focus
  // 2. Polls local database every 20 seconds for new webhook arrivals
  // 3. Reconciles with Meta Graph API in the background every 3 minutes
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && reload) {
        void reload();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const dbInterval = setInterval(() => {
      if (document.visibilityState === "visible" && reload) {
        void reload();
      }
    }, 20000);

    const metaReconcileInterval = setInterval(() => {
      if (document.visibilityState === "visible" && (adminAccess || role === "sales_marketing")) {
        void handleSyncMeta(true);
      }
    }, 180000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(dbInterval);
      clearInterval(metaReconcileInterval);
    };
  }, [reload, adminAccess, role]);

  // Live Auto-Refresh for open WhatsApp Chat Modal (polls delivery receipts & new messages every 3.5s)
  useEffect(() => {
    if (!whatsAppLead) return;
    const phone = resolveLeadPhone(whatsAppLead);
    if (!phone) return;

    const chatPoller = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/integrations/whatsapp/messages?leadId=${encodeURIComponent(
            whatsAppLead.id
          )}&phone=${encodeURIComponent(phone)}`
        );
        const json = await res.json();
        if (json.messages && Array.isArray(json.messages)) {
          setWhatsAppMessages(json.messages);
        }
      } catch {
        // silent polling catch
      }
    }, 3500);

    return () => clearInterval(chatPoller);
  }, [whatsAppLead]);


  // CSV Export matching Google Sheet tracker columns
  const handleExportCsv = () => {
    const escapeCsv = (val: unknown): string => {
      if (val === undefined || val === null) return '""';
      const clean = String(val).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const headers = [
      "Created Time",
      "Platform",
      "Readiness",
      "Full Name",
      "Phone",
      "Email",
      "Status",
      "Instrument",
      "Campaign",
      "Ad",
      "Notes",
    ];

    const rows = list.map((lead) => {
      const plat = getLeadPlatform(lead);
      const readiness =
        lead.readiness ||
        lead.customAnswers?.["readiness"] ||
        lead.customAnswers?.["Are you ready to begin?"] ||
        "";

      return [
        escapeCsv(lead.arrivedAt),
        escapeCsv(plat === "other" ? lead.source : plat),
        escapeCsv(readiness),
        escapeCsv(cleanName(lead.parentName)),
        escapeCsv(lead.phone),
        escapeCsv(lead.email),
        escapeCsv(lead.status),
        escapeCsv(lead.instrument),
        escapeCsv(lead.campaignName || ""),
        escapeCsv(lead.adName || ""),
        escapeCsv(lead.notes || ""),
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `prosperwork_leads_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify(`Exported ${list.length} lead(s) to CSV.`);
  };

  return (
    <>
      <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        {searchBar("Search family, child, email, phone or instrument")}
        <div style={{ display: "flex", gap: "0.4rem", marginLeft: "auto", flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "0.74rem",
              fontWeight: 600,
              color: "#047857",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              padding: "4px 8px",
              borderRadius: "6px",
            }}
            title="Real-time Meta Webhook Ingestion & 2-Way Conversions API (CAPI) Ad Feedback are active"
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
              }}
            />
            Live Auto-Sync Active
          </span>

          {(adminAccess || role === "sales_marketing") && (
            <button
              type="button"
              className="btn small secondary"
              onClick={() => handleSyncMeta(false)}
              disabled={syncingMeta}
              title="Live background auto-sync is active. Click to force an instant reconciliation with Meta now."
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: syncingMeta ? "not-allowed" : "pointer",
                opacity: syncingMeta ? 0.65 : 1,
              }}
            >
              <RefreshCw size={13} className={syncingMeta ? "spin" : ""} />
              {syncingMeta ? "Syncing..." : "Sync Now"}
            </button>
          )}

          <button
            type="button"
            className="btn small ghost"
            onClick={handleExportCsv}
            disabled={!list.length}
            title="Download CSV spreadsheet matching Lead Tracker"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Download size={13} />
            Export CSV
          </button>

          {(adminAccess || role === "sales_marketing") &&
            headerActions("Capture enquiry", "lead")}
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            New enquiries{" "}
            <span className="stat-icon">
              <Timer size={15} />
            </span>
          </div>
          <div className="stat-value">
            {data.leads.filter((lead) => lead.status === "new").length}
          </div>
          <div className="stat-foot">Response timer starts at arrival</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Ready to Invest{" "}
            <span className="stat-icon">
              <CheckCircle2 size={15} color="#059669" />
            </span>
          </div>
          <div className="stat-value" style={{ color: "#065f46" }}>
            {readyCount}
          </div>
          <div className="stat-foot">High-intent prospects for trials</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Meta Ad Leads{" "}
            <span className="stat-icon">
              <ExternalLink size={15} />
            </span>
          </div>
          <div className="stat-value">
            {metaCount}
          </div>
          <div className="stat-foot">FB: {fbCount} · IG: {igCount}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            First response average{" "}
            <span className="stat-icon">
              <Activity size={15} />
            </span>
          </div>
          <div className="stat-value">
            {avgResponseMinutes === null ? "—" : `${avgResponseMinutes}m`}
          </div>
          <div className="stat-foot">
            {respondedLeads.length
              ? `Across ${respondedLeads.length} recorded first response${
                  respondedLeads.length === 1 ? "" : "s"
                }`
              : "No first responses recorded yet"}
          </div>
        </div>
      </div>

      <section className="card section-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <SectionTitle
            title="Enquiries & trial classes"
            detail="Follow-ups, Meta Lead Ad submissions, trial bookings, and CRM handoffs."
          />

          {/* Quick Lead Intent & Source Filter Pills */}
          <div style={{ display: "flex", gap: "0.25rem", background: "var(--surface-muted, #f8fafc)", padding: "3px", borderRadius: "8px", border: "1px solid var(--border-color, #e2e8f0)", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn small ${filterMode === "all" ? "primary" : "ghost"}`}
              style={{ padding: "3px 9px", fontSize: "0.74rem", borderRadius: "6px" }}
              onClick={() => setFilterMode("all")}
            >
              All ({data.leads.length})
            </button>
            <button
              type="button"
              className={`btn small ${filterMode === "ready" ? "primary" : "ghost"}`}
              style={{
                padding: "3px 9px",
                fontSize: "0.74rem",
                borderRadius: "6px",
                background: filterMode === "ready" ? "#059669" : undefined,
                color: filterMode === "ready" ? "#fff" : "#065f46",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
              onClick={() => setFilterMode("ready")}
            >
              <Check size={12} /> Ready to Invest ({readyCount})
            </button>
            <button
              type="button"
              className={`btn small ${filterMode === "budget" ? "primary" : "ghost"}`}
              style={{
                padding: "3px 9px",
                fontSize: "0.74rem",
                borderRadius: "6px",
                background: filterMode === "budget" ? "#d97706" : undefined,
                color: filterMode === "budget" ? "#fff" : "#92400e",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
              onClick={() => setFilterMode("budget")}
            >
              <XCircle size={12} /> Budget Mismatch ({budgetCount})
            </button>
            <button
              type="button"
              className={`btn small ${filterMode === "fb" ? "primary" : "ghost"}`}
              style={{
                padding: "3px 8px",
                fontSize: "0.74rem",
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
              onClick={() => setFilterMode("fb")}
              title="Facebook Leads"
            >
              <img src="/icons/facebook.svg" alt="Facebook" width={14} height={14} style={{ display: "block" }} />
              {fbCount}
            </button>
            <button
              type="button"
              className={`btn small ${filterMode === "ig" ? "primary" : "ghost"}`}
              style={{
                padding: "3px 8px",
                fontSize: "0.74rem",
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
              onClick={() => setFilterMode("ig")}
              title="Instagram Leads"
            >
              <img src="/icons/instagram.svg" alt="Instagram" width={14} height={14} style={{ display: "block", borderRadius: "3px" }} />
              {igCount}
            </button>
          </div>
        </div>

        <div
          className="portal-tabs"
          role="tablist"
          aria-label="Filter leads by pipeline stage"
        >
          {pipelineTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={stageFilter === tab.id}
              className={`portal-tab${stageFilter === tab.id ? " active" : ""}`}
              onClick={() => setStageFilter(tab.id)}
            >
              {tab.label}
              <span className="portal-tab-badge">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "135px" }}>Arrived</th>
                <th>Candidate / Learner</th>
                <th>Channel & Intent</th>
                <th>Trial & Details</th>
                <th>Owner & Contact</th>
                <th style={{ textAlign: "center", width: "180px" }}>Pipeline Stage</th>
              </tr>
            </thead>
            <tbody>
              {list.map((lead) => {
                const minutes = lead.firstResponseAt
                  ? Math.max(
                      0,
                      Math.round(
                        (new Date(lead.firstResponseAt).getTime() -
                          new Date(lead.arrivedAt).getTime()) /
                          60000
                      )
                    )
                  : null;

                const plat = getLeadPlatform(lead);
                const hasMeta = isMetaLead(lead);
                const intent = parseReadiness(lead.readiness);
                const displayName = cleanName(lead.parentName);
                const phone = resolveLeadPhone(lead);

                return (
                  <tr key={lead.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                        {niceDate(lead.arrivedAt)}
                      </div>
                      <div className="table-small" style={{ color: "#64748b" }}>
                        {timeAt(lead.arrivedAt)}
                      </div>
                      <div style={{ marginTop: 3 }}>
                        {minutes === null ? (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: "4px" }}>
                            Response due
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "#166534" }}>
                            Replied in {minutes}m
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="pw-person-inline">
                        <ProfileAvatar name={displayName} size={34} />
                        <div>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: "0.92rem",
                              color: "var(--foreground, #0f172a)",
                              cursor: "pointer",
                            }}
                            onClick={() => setSelectedLead(lead)}
                            title="Click to view full questionnaire responses"
                          >
                            {displayName}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#0f766e", fontWeight: 600 }}>
                            {lead.instrument || "Piano"} · {lead.childName && lead.childName !== lead.parentName ? `Child: ${cleanName(lead.childName)}` : "Applicant"}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b", display: "flex", alignItems: "center", gap: 5, marginTop: 2, flexWrap: "wrap" }}>
                            {phone ? (
                              <span style={{ fontWeight: 700, color: "#0f766e", display: "inline-flex", alignItems: "center", gap: 3 }}>
                                <Phone size={10} />
                                {phone}
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>No phone</span>
                            )}
                            {lead.email && <span>· {lead.email}</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                        {/* Channel Badge */}
                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                          {plat === "fb" && (
                            <span
                              title="Facebook Lead"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "#ebf5ff",
                                padding: "2px 5px",
                                borderRadius: "4px",
                                border: "1px solid #bfdbfe",
                              }}
                            >
                              <img
                                src="/icons/facebook.svg"
                                alt="Facebook"
                                width={14}
                                height={14}
                                style={{ display: "block" }}
                              />
                            </span>
                          )}
                          {plat === "ig" && (
                            <span
                              title="Instagram Lead"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "#fdf2f8",
                                padding: "2px 5px",
                                borderRadius: "4px",
                                border: "1px solid #fbcfe8",
                              }}
                            >
                              <img
                                src="/icons/instagram.svg"
                                alt="Instagram"
                                width={14}
                                height={14}
                                style={{ display: "block", borderRadius: "3px" }}
                              />
                            </span>
                          )}
                          {plat === "other" && (
                            <span style={{ fontSize: "0.75rem", color: "#475569" }}>
                              {lead.source}
                            </span>
                          )}

                          {lead.campaignName && (
                            <span
                              style={{
                                fontSize: "0.68rem",
                                background: "#f1f5f9",
                                color: "#475569",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                maxWidth: "120px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={`Campaign: ${lead.campaignName}`}
                            >
                              {lead.campaignName}
                            </span>
                          )}
                        </div>

                        {/* Intent Readiness Pill */}
                        {intent && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "2px 7px",
                              borderRadius: "4px",
                              background:
                                intent.type === "ready"
                                  ? "#ecfdf5"
                                  : intent.type === "budget"
                                  ? "#fffbeb"
                                  : "#f8fafc",
                              color:
                                intent.type === "ready"
                                  ? "#065f46"
                                  : intent.type === "budget"
                                  ? "#92400e"
                                  : "#475569",
                              border:
                                intent.type === "ready"
                                  ? "1px solid #a7f3d0"
                                  : intent.type === "budget"
                                  ? "1px solid #fde68a"
                                  : "1px solid #e2e8f0",
                            }}
                            title={intent.fullText}
                          >
                            {intent.type === "ready" ? <Check size={11} /> : intent.type === "budget" ? <XCircle size={11} /> : null} {intent.shortLabel}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: "0.82rem", color: "#334155" }}>
                        {(lead.preferredSlots && lead.preferredSlots.length > 0) || lead.status === "trial_booked" || lead.trialScheduledAt ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <strong style={{ color: "#15803d", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <CalendarCheck2 size={13} color="#15803d" />
                              {lead.preferredSlots && lead.preferredSlots.length > 0
                                ? lead.preferredSlots.join(" · ")
                                : lead.trialScheduledAt
                                ? `${niceDate(lead.trialScheduledAt)} at ${timeAt(lead.trialScheduledAt)}`
                                : "Trial Booked"}
                            </strong>
                            {(lead.trialMeetUrl || (lead as any).meetUrl) && (
                              <a
                                href={lead.trialMeetUrl || (lead as any).meetUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: "0.74rem",
                                  color: (lead as any).trialClassroomProvider === "google_meet" ? "#1a73e8" : "#4f46e5",
                                  fontWeight: 600,
                                  textDecoration: "underline",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                }}
                              >
                                <Video size={11} />
                                {(lead as any).trialClassroomProvider === "google_meet" ? "Open Google Meet →" : "Open Studio Room →"}
                              </a>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {((lead as any).trialTeacher || lead.teacherName) && (
                                <span style={{ fontSize: "0.70rem", color: "#64748b" }}>
                                  Teacher: {(lead as any).trialTeacher || lead.teacherName}
                                </span>
                              )}
                              <button
                                type="button"
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  fontSize: "0.70rem",
                                  color: "#0f766e",
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                }}
                                onClick={() => openTrialBookingModal(lead)}
                              >
                                Edit Trial
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            <span style={{ color: "#94a3b8" }}>No trial booked yet</span>
                            <button
                              type="button"
                              className="btn small ghost"
                              style={{
                                fontSize: "0.72rem",
                                padding: "1px 7px",
                                color: "#15803d",
                                borderColor: "#bbf7d0",
                                background: "#f0fdf4",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                cursor: "pointer",
                              }}
                              onClick={() => openTrialBookingModal(lead)}
                              title="Schedule date, time, teacher & video room for free trial assessment"
                            >
                              <CalendarCheck2 size={11} />
                              Book Trial
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => setSelectedLead(lead)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            fontSize: "0.76rem",
                            color: "#0f766e",
                            fontWeight: 600,
                            cursor: "pointer",
                            textDecoration: "underline",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          View Questionnaire ({hasMeta ? "Meta Form" : "Details"}) →
                        </button>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#334155" }}>
                        {lead.owner}
                      </div>
                      <div className="row-actions" style={{ marginTop: 4, display: "flex", gap: 3 }}>
                        <button
                          className="icon-btn"
                          aria-label={`Email ${displayName}`}
                          title={`Email ${lead.email}`}
                          onClick={() =>
                            openEmailComposer(
                              "lead",
                              lead.id,
                              lead.email,
                              displayName
                            )
                          }
                        >
                          <MessageCircle size={13} />
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`WhatsApp Live Chat with ${displayName}`}
                          title={phone ? `WhatsApp Live Chat (${phone})` : "No phone available"}
                          disabled={!phone}
                          style={{
                            color: phone ? "#059669" : "#cbd5e1",
                            background: phone ? "#ecfdf5" : undefined,
                            borderColor: phone ? "#a7f3d0" : undefined,
                            fontWeight: 800,
                            fontSize: "0.72rem",
                            cursor: phone ? "pointer" : "not-allowed",
                            padding: "0 6px",
                          }}
                          onClick={() => {
                            if (!phone) return;
                            openWhatsAppChat(lead);
                          }}
                        >
                          WA
                        </button>
                      </div>
                    </td>

                    <td style={{ textAlign: "center", position: "relative" }}>
                      {/* Move Stage Dropdown - Always displays Current Status */}
                      {(() => {
                        const isUpdatingThisLead = updatingStageLeadId === lead.id;
                        return (
                          <div style={{ position: "relative", display: "inline-block" }}>
                            <button
                              type="button"
                              disabled={isUpdatingThisLead}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDropdownLeadId((prev) => (prev === lead.id ? null : lead.id));
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "7px",
                                padding: "6px 12px",
                                borderRadius: "9999px",
                                fontSize: "0.80rem",
                                fontWeight: 700,
                                background: getStageDisplay(lead.status).pillColor.bg,
                                color: getStageDisplay(lead.status).pillColor.text,
                                border: `1.5px solid ${getStageDisplay(lead.status).pillColor.border}`,
                                cursor: isUpdatingThisLead ? "not-allowed" : "pointer",
                                opacity: isUpdatingThisLead ? 0.65 : 1,
                                whiteSpace: "nowrap",
                                transition: "all 0.15s ease",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                              }}
                              title={`Current Stage: ${getStageDisplay(lead.status).label} (Click to change)`}
                            >
                              {isUpdatingThisLead ? (
                                <RefreshCw size={11} className="spin" />
                              ) : (
                                <span
                                  style={{
                                    width: "7px",
                                    height: "7px",
                                    borderRadius: "50%",
                                    backgroundColor: getStageDisplay(lead.status).pillColor.dot,
                                    display: "inline-block",
                                  }}
                                />
                              )}
                              <span>{isUpdatingThisLead ? "Updating..." : getStageDisplay(lead.status).label}</span>
                              <ChevronDown size={13} style={{ opacity: 0.75 }} />
                            </button>

                            {/* Move Stage Popover Dropdown matching image */}
                            {activeDropdownLeadId === lead.id && (
                              <>
                                <div
                                  style={{
                                    position: "fixed",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    zIndex: 998,
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdownLeadId(null);
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "calc(100% + 4px)",
                                    right: 0,
                                    zIndex: 999,
                                    background: "#ffffff",
                                    borderRadius: "14px",
                                    boxShadow:
                                      "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.08)",
                                    padding: "8px 6px",
                                    minWidth: "195px",
                                    textAlign: "left",
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div
                                    style={{
                                      fontSize: "0.72rem",
                                      fontWeight: 700,
                                      color: "#94a3b8",
                                      padding: "4px 10px 6px 10px",
                                      letterSpacing: "0.02em",
                                    }}
                                  >
                                    Move Stage
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    {PIPELINE_STAGES.map((s) => {
                                      const isSelected = getStageDisplay(lead.status).id === s.id;
                                      return (
                                        <button
                                          key={s.id}
                                          type="button"
                                          disabled={isUpdatingThisLead}
                                          onClick={() => {
                                            handleStageChange(lead, s.id);
                                            setActiveDropdownLeadId(null);
                                          }}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "8px 10px",
                                        borderRadius: "8px",
                                        fontSize: "0.82rem",
                                        fontWeight: isSelected ? 700 : 500,
                                        background: isSelected ? "#eef2ff" : "transparent",
                                        color: isSelected ? "#4338ca" : "#334155",
                                        border: "none",
                                        cursor: "pointer",
                                        width: "100%",
                                        textAlign: "left",
                                        transition: "background 0.12s ease",
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!isSelected) {
                                          e.currentTarget.style.background = "#f8fafc";
                                          e.currentTarget.style.color = "#0f172a";
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (!isSelected) {
                                          e.currentTarget.style.background = "transparent";
                                          e.currentTarget.style.color = "#334155";
                                        }
                                      }}
                                    >
                                      <span>{s.label}</span>
                                      {isSelected && (
                                        <Check
                                          size={15}
                                          style={{ color: "#4f46e5", strokeWidth: 2.5 }}
                                        />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </td>
              </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && (
            <Empty
              title="No enquiry matches"
              detail="No leads found matching the selected filter criteria."
            />
          )}
        </div>
      </section>

      {/* LEAD DETAILS & QUESTIONNAIRE MODAL */}
      <PortalModal
        open={Boolean(selectedLead)}
        onClose={() => setSelectedLead(null)}
        title={cleanName(selectedLead?.parentName)}
        eyebrow={
          selectedLead?.platform === "ig" || selectedLead?.metaPlatform === "ig"
            ? "Meta Lead Ads · Instagram"
            : selectedLead?.platform === "fb" || selectedLead?.metaPlatform === "fb"
            ? "Meta Lead Ads · Facebook"
            : "Academy CRM Lead"
        }
        subtitle={
          selectedLead
            ? `Enquiry arrived on ${niceDate(selectedLead.arrivedAt)} at ${timeAt(selectedLead.arrivedAt)}`
            : undefined
        }
        size="lg"
        footer={
          (() => {
            const modalPhone = selectedLead ? resolveLeadPhone(selectedLead) : "";
            return (
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {selectedLead && (
                    <>
                      <button
                        type="button"
                        className="btn small"
                        disabled={!modalPhone}
                        onClick={() => {
                          if (!modalPhone) return;
                          openWhatsAppChat(selectedLead);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: modalPhone ? "#059669" : "#f1f5f9",
                          color: modalPhone ? "#ffffff" : "#94a3b8",
                          borderColor: modalPhone ? "#047857" : "#e2e8f0",
                          fontWeight: 700,
                        }}
                      >
                        <MessageSquare size={14} /> In-App WhatsApp Chat
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => {
                          openEmailComposer(
                            "lead",
                            selectedLead.id,
                            selectedLead.email,
                            cleanName(selectedLead.parentName)
                          );
                          setSelectedLead(null);
                        }}
                      >
                        <Send size={13} style={{ marginRight: 4 }} />
                        Send Email
                      </button>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => setSelectedLead(null)}
                >
                  Close
                </button>
              </div>
            );
          })()
        }
      >
        {selectedLead && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Header Core Overview Card */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
                padding: "1.1rem",
                borderRadius: "8px",
                background: "var(--surface-muted, #f8fafc)",
                border: "1px solid var(--border-color, #e2e8f0)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                  Candidate / Learner
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: 2, color: "#0f172a" }}>
                  {cleanName(selectedLead.parentName)}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#0f766e", fontWeight: 600, marginTop: 2 }}>
                  Instrument: {selectedLead.instrument || "Piano"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                  Contact Information
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 2, color: "#0f172a" }}>
                  {resolveLeadPhone(selectedLead) || "No phone provided"}
                </div>
                <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 2 }}>
                  {selectedLead.email || "No email provided"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                  Status & Rep
                </div>
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill>{selectedLead.status.replaceAll("_", " ")}</Pill>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 3 }}>
                  Owner: {selectedLead.owner || "Unassigned"}
                </div>
              </div>
            </div>

            {/* Meta Ad Attribution Card (if available) */}
            {isMetaLead(selectedLead) && (
              <div
                style={{
                  border: "1px solid #bfdbfe",
                  borderRadius: "8px",
                  padding: "1rem",
                  background: "#eff6ff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#1e40af" }}>
                    Meta Lead Ads Attribution
                  </span>
                  <span
                    title={
                      selectedLead.platform === "ig" || selectedLead.metaPlatform === "ig"
                        ? "Instagram Lead Ad"
                        : "Facebook Lead Ad"
                    }
                    style={{
                      background: selectedLead.platform === "ig" || selectedLead.metaPlatform === "ig" ? "#db2777" : "#1877f2",
                      color: "#fff",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "4px 8px",
                      borderRadius: "8px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <img
                      src={
                        selectedLead.platform === "ig" || selectedLead.metaPlatform === "ig"
                          ? "/icons/instagram.svg"
                          : "/icons/facebook.svg"
                      }
                      alt="Platform"
                      width={14}
                      height={14}
                      style={{ display: "block", borderRadius: "2px" }}
                    />
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", fontSize: "0.82rem" }}>
                  {selectedLead.campaignName && (
                    <div>
                      <span style={{ color: "#64748b" }}>Campaign: </span>
                      <strong>{selectedLead.campaignName}</strong>
                    </div>
                  )}
                  {selectedLead.adName && (
                    <div>
                      <span style={{ color: "#64748b" }}>Ad Creative: </span>
                      <strong>{selectedLead.adName}</strong>
                    </div>
                  )}
                  <div>
                    <span style={{ color: "#64748b" }}>Form ID: </span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{selectedLead.metaFormId || "—"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>Meta Lead ID: </span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{selectedLead.metaLeadId || "—"}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Custom Lead Form Answers Section */}
            <div
              style={{
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "8px",
                padding: "1.1rem",
                background: "#ffffff",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: "0.85rem", color: "#0f172a" }}>
                Lead Form Questionnaire Responses
              </div>

              {selectedLead.customAnswers && Object.keys(selectedLead.customAnswers).length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {Object.entries(selectedLead.customAnswers).map(([rawQuestion, rawAnswer]) => {
                    const cleanQ = cleanQuestionLabel(rawQuestion);
                    const answerStr = String(rawAnswer).replace(/_/g, " ");
                    const isPositive = answerStr.toLowerCase().includes("yes") || answerStr.toLowerCase().includes("ready");
                    const isNegative = answerStr.toLowerCase().includes("no") || answerStr.toLowerCase().includes("not");

                    return (
                      <div
                        key={rawQuestion}
                        style={{
                          padding: "0.75rem 0.9rem",
                          background: isPositive ? "#f0fdf4" : isNegative ? "#fffbeb" : "#f8fafc",
                          borderRadius: "6px",
                          border: isPositive ? "1px solid #bbf7d0" : isNegative ? "1px solid #fef3c7" : "1px solid #f1f5f9",
                        }}
                      >
                        <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>
                          {cleanQ}
                        </div>
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: isPositive ? "#166534" : isNegative ? "#92400e" : "#0f172a",
                            marginTop: 3,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {isPositive && <CheckCircle2 size={15} color="#15803d" />}
                          {isNegative && <XCircle size={15} color="#b45309" />}
                          <span>{answerStr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: "0.85rem", color: "#64748b", background: "#f8fafc", padding: "0.75rem", borderRadius: "6px" }}>
                  {selectedLead.notes || "No custom form questionnaire responses recorded."}
                </div>
              )}
            </div>

            {/* Move Stage in Modal */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.03em" }}>
                Move Stage
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {PIPELINE_STAGES.map((s) => {
                  const isSelected = getStageDisplay(selectedLead.status).id === s.id;
                  const isUpdatingModalLead = updatingStageLeadId === selectedLead.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={isUpdatingModalLead}
                      className={`btn small ${isSelected ? "primary" : "ghost"}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: isSelected ? "#4f46e5" : undefined,
                        borderColor: isSelected ? "#4f46e5" : undefined,
                        color: isSelected ? "#ffffff" : undefined,
                        fontWeight: isSelected ? 700 : 500,
                        cursor: isUpdatingModalLead ? "not-allowed" : "pointer",
                        opacity: isUpdatingModalLead ? 0.65 : 1,
                      }}
                      onClick={() => {
                        if (s.id === "trial_booked") {
                          openTrialBookingModal(selectedLead);
                          return;
                        }
                        handleStageChange(selectedLead, s.id);
                        setSelectedLead((prev) => (prev ? { ...prev, status: s.id } : null));
                      }}
                    >
                      {isUpdatingModalLead && isSelected ? (
                        <RefreshCw size={12} className="spin" />
                      ) : isSelected ? (
                        <Check size={13} style={{ strokeWidth: 2.5 }} />
                      ) : null}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </PortalModal>

      {/* In-App WhatsApp Live Chat Modal */}
      <PortalModal
        open={Boolean(whatsAppLead)}
        onClose={() => setWhatsAppLead(null)}
        title={
          whatsAppLead
            ? `WhatsApp Live Chat — ${cleanName(whatsAppLead.parentName)}`
            : "WhatsApp Live Chat"
        }
        subtitle={
          whatsAppLead
            ? dynamicSchoolPhone
              ? `Academy (${dynamicSchoolPhone}) ⟷ ${resolveLeadPhone(whatsAppLead)}`
              : `WhatsApp Live Chat ⟷ ${resolveLeadPhone(whatsAppLead)}`
            : undefined
        }
        size="lg"
      >
        {whatsAppLead && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {/* Meta Cloud API Connection Pill & Info */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "0.8rem",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#166534", fontWeight: 600 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#22c55e",
                      boxShadow: "0 0 0 2px #bbf7d0",
                    }}
                  />
                  Meta Cloud API Active
                </div>

                {/* AI vs Human Takeover Badge */}
                {isManualTakeover ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                      color: "#92400e",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                    }}
                    title="A staff member has messaged this customer. Automated AI replies are paused for this chat."
                  >
                    <UserCheck size={12} />
                    Human Active · AI Paused
                  </span>
                ) : (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#e0e7ff",
                      border: "1px solid #c7d2fe",
                      color: "#3730a3",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                    }}
                    title="AI Auto-Reply & Intake is active. It will pause automatically as soon as a staff member sends a message."
                  >
                    <Bot size={12} />
                    AI Auto-Reply Active
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn small"
                  disabled={resettingChat}
                  style={{
                    fontSize: "0.74rem",
                    padding: "3px 9px",
                    background: isManualTakeover ? "#dcfce7" : "#e0e7ff",
                    borderColor: isManualTakeover ? "#86efac" : "#c7d2fe",
                    color: isManualTakeover ? "#15803d" : "#4338ca",
                    fontWeight: 700,
                    cursor: resettingChat ? "not-allowed" : "pointer",
                    opacity: resettingChat ? 0.65 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={handleRetriggerAutoReply}
                  title="Preserves chat history and re-enables AI auto-reply for the next incoming customer message"
                >
                  <RotateCcw size={12} className={resettingChat ? "spin" : ""} />
                  {resettingChat ? "Arming..." : isManualTakeover ? "Re-arm AI Auto-Reply" : "Retrigger Auto-Reply"}
                </button>

                <button
                  type="button"
                  className="btn small ghost"
                  style={{ fontSize: "0.75rem", padding: "2px 8px", color: "#065f46", display: "inline-flex", alignItems: "center", gap: 4 }}
                  onClick={() => {
                    const phone = resolveLeadPhone(whatsAppLead);
                    if (phone) {
                      openExternal(
                        "whatsapp",
                        phone,
                        cleanName(whatsAppLead.parentName),
                        `Hello ${cleanName(whatsAppLead.parentName)}, this is ProsperWork Music Academy regarding your music lessons inquiry.`
                      );
                    }
                  }}
                >
                  Open in WhatsApp Web <ExternalLink size={11} />
                </button>
              </div>
            </div>

            {/* Quick Action Automated Response Chips */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                Quick Action Prompts
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn small"
                  disabled={sendingWhatsApp}
                  style={{
                    fontSize: "0.76rem",
                    padding: "3px 9px",
                    background: "#f0fdf4",
                    borderColor: "#86efac",
                    color: "#15803d",
                    fontWeight: 700,
                    cursor: sendingWhatsApp ? "not-allowed" : "pointer",
                    opacity: sendingWhatsApp ? 0.6 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={() => {
                    if (sendingWhatsApp) return;
                    const parentName = cleanName(whatsAppLead.parentName).split(" ")[0];
                    setWhatsAppDraft(
                      `Hello ${parentName}! Welcome to ProsperWork Music Academy.\n\nWe received your application and are so excited to help your child start a fun, confidence-building musical journey!\n\nTo match your child with the perfect expert teacher: What is your child's name, how old are they, and which musical instrument would they like to learn?`
                    );
                  }}
                >
                  <UserCheck size={13} />
                  Welcome & Assessment
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={sendingWhatsApp}
                  style={{
                    fontSize: "0.76rem",
                    padding: "3px 9px",
                    background: "#ecfdf5",
                    borderColor: "#a7f3d0",
                    color: "#065f46",
                    fontWeight: 600,
                    cursor: sendingWhatsApp ? "not-allowed" : "pointer",
                    opacity: sendingWhatsApp ? 0.6 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={() => {
                    if (sendingWhatsApp) return;
                    const parentName = cleanName(whatsAppLead.parentName).split(" ")[0];
                    const promptText = `Hello ${parentName}! Would you like to schedule your trial lesson for ${whatsAppLead.instrument || "Piano"} with our director? Tap a button below to confirm:`;
                    handleSendWhatsApp(
                      promptText,
                      [
                        { id: "pw_book_trial", title: "Book Trial Lesson" },
                        { id: "pw_view_schedule", title: "View Schedule" },
                      ]
                    );
                  }}
                >
                  {sendingWhatsApp ? <RefreshCw size={11} className="spin" /> : <CalendarCheck2 size={13} />}
                  Trial Booking Prompt
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={sendingWhatsApp}
                  style={{
                    fontSize: "0.76rem",
                    padding: "3px 9px",
                    background: "#eff6ff",
                    borderColor: "#bfdbfe",
                    color: "#1d4ed8",
                    fontWeight: 600,
                    cursor: sendingWhatsApp ? "not-allowed" : "pointer",
                    opacity: sendingWhatsApp ? 0.6 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={() => {
                    if (sendingWhatsApp) return;
                    const parentName = cleanName(whatsAppLead.parentName).split(" ")[0];
                    setWhatsAppDraft(
                      `Hello ${parentName}! Thank you for enquiring about music lessons with ProsperWork Music Academy. Which days of the week work best for your child's 1-on-1 lesson?`
                    );
                  }}
                >
                  <Calendar size={13} />
                  Availability Query
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={sendingWhatsApp}
                  style={{
                    fontSize: "0.76rem",
                    padding: "3px 9px",
                    background: "#faf5ff",
                    borderColor: "#e9d5ff",
                    color: "#7e22ce",
                    fontWeight: 600,
                    cursor: sendingWhatsApp ? "not-allowed" : "pointer",
                    opacity: sendingWhatsApp ? 0.6 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={() => {
                    if (sendingWhatsApp) return;
                    setWhatsAppDraft(
                      dynamicPricing ||
                        "Our premium 1-on-1 weekly lessons include curriculum books, performance assessments, and interactive classroom access. Our admissions team will share plan details shortly."
                    );
                  }}
                >
                  <CreditCard size={13} />
                  Pricing & Plan
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={sendingWhatsApp}
                  style={{
                    fontSize: "0.76rem",
                    padding: "3px 9px",
                    background: showAdminHandover ? "#ccfbf1" : "#f0fdfa",
                    borderColor: "#5eead4",
                    color: "#0f766e",
                    fontWeight: 700,
                    cursor: sendingWhatsApp ? "not-allowed" : "pointer",
                    opacity: sendingWhatsApp ? 0.6 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={() => setShowAdminHandover((prev) => !prev)}
                  title="Refer parent to an administrator and assign admin owner"
                >
                  <UserCog size={13} />
                  Admin Handover
                </button>
              </div>

              {/* Admin Referral & Handover Assistant Panel */}
              {showAdminHandover && (
                <div
                  style={{
                    background: "#f0fdfa",
                    border: "1px solid #99f6e4",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginTop: 2,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#115e59", display: "flex", alignItems: "center", gap: 5 }}>
                      <UserCog size={14} />
                      Admin Referral & Handover
                    </div>
                    <button
                      type="button"
                      className="btn small ghost"
                      style={{ padding: "1px 6px", fontSize: "0.72rem" }}
                      onClick={() => setShowAdminHandover(false)}
                    >
                      Close
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ fontSize: "0.72rem", color: "#374151", fontWeight: 600, display: "block", marginBottom: 3 }}>
                        Select Administrator
                      </label>
                      <select
                        value={selectedAdminName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedAdminName(val);
                          const matched = dynamicAdmins.find((a) => a.name === val);
                          if (matched) {
                            setSelectedAdminPhone(matched.phone);
                          }
                        }}
                        style={{ width: "100%", padding: "5px 8px", fontSize: "0.78rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff" }}
                      >
                        {dynamicAdmins.length === 0 && (
                          <option value="">Loading administrators...</option>
                        )}
                        {dynamicAdmins.map((adm) => (
                          <option key={adm.name} value={adm.name}>
                            {adm.name} {adm.phone ? `(${adm.phone})` : ""}
                          </option>
                        ))}
                        <option value="Custom">Custom Administrator...</option>
                      </select>
                      {selectedAdminName === "Custom" && (
                        <input
                          type="text"
                          placeholder="Administrator Name"
                          value={customAdminName}
                          onChange={(e) => setCustomAdminName(e.target.value)}
                          style={{ width: "100%", padding: "4px 8px", fontSize: "0.78rem", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: 4, background: "#fff" }}
                        />
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: "0.72rem", color: "#374151", fontWeight: 600, display: "block", marginBottom: 3 }}>
                        Admin Direct Phone
                      </label>
                      <input
                        type="text"
                        value={selectedAdminPhone}
                        onChange={(e) => setSelectedAdminPhone(e.target.value)}
                        placeholder="Enter direct phone number"
                        style={{ width: "100%", padding: "5px 8px", fontSize: "0.78rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff" }}
                      />
                    </div>
                  </div>

                  {/* Message Preview */}
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, marginBottom: 2 }}>
                      Message Preview:
                    </div>
                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid #ccfbf1",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        fontSize: "0.76rem",
                        color: "#1e293b",
                        lineHeight: 1.4,
                      }}
                    >
                      &ldquo;You will get a message from one of our administrators, {effectiveAdminName}, on {selectedAdminPhone}, or you can send a message directly to {selectedAdminPhone}.&rdquo;
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.74rem", color: "#374151", cursor: "pointer", fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={assignAsOwner}
                        onChange={(e) => setAssignAsOwner(e.target.checked)}
                      />
                      Assign {effectiveAdminName} as lead owner in CRM
                    </label>

                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn small secondary"
                        style={{ fontSize: "0.74rem", padding: "3px 9px" }}
                        onClick={() => {
                          const msg = `You will get a message from one of our administrators, ${effectiveAdminName}, on ${selectedAdminPhone}, or you can send a message directly to ${selectedAdminPhone}.`;
                          setWhatsAppDraft(msg);
                          setShowAdminHandover(false);
                        }}
                      >
                        Populate Draft
                      </button>
                      <button
                        type="button"
                        className="btn small primary"
                        disabled={sendingWhatsApp}
                        style={{ fontSize: "0.74rem", padding: "3px 10px", background: "#0f766e", borderColor: "#0d9488" }}
                        onClick={async () => {
                          const msg = `You will get a message from one of our administrators, ${effectiveAdminName}, on ${selectedAdminPhone}, or you can send a message directly to ${selectedAdminPhone}.`;
                          await handleSendWhatsApp(msg, undefined, assignAsOwner ? effectiveAdminName : undefined);
                          setShowAdminHandover(false);
                        }}
                      >
                        {sendingWhatsApp ? "Sending..." : "Send & Handover"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Conversation Feed */}
            <div
              style={{
                height: "360px",
                overflowY: "auto",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {loadingWhatsApp ? (
                <div style={{ textAlign: "center", color: "#64748b", margin: "auto", fontSize: "0.85rem" }}>
                  <RefreshCw size={18} className="spin" style={{ margin: "0 auto 6px auto" }} />
                  Loading WhatsApp messages...
                </div>
              ) : whatsAppMessages.length === 0 ? (
                <div style={{ textAlign: "center", color: "#64748b", margin: "auto", maxWidth: "340px" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                    <MessageCircle size={28} color="#94a3b8" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1e293b" }}>
                    No messages sent yet
                  </div>
                  <div style={{ fontSize: "0.78rem", marginTop: 4 }}>
                    Start the conversation using the composer below or click one of the quick action buttons. Outbound messages send directly through Meta Cloud API.
                  </div>
                </div>
              ) : (
                whatsAppMessages.map((msg) => {
                  const isOutbound = msg.direction === "outbound";
                  const isFailed = msg.status === "failed";
                  return (
                    <div
                      key={msg.id || msg.wa_message_id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isOutbound ? "flex-end" : "flex-start",
                        maxWidth: "80%",
                        alignSelf: isOutbound ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          background: isOutbound ? (isFailed ? "#fef2f2" : "#dcf8c6") : "#ffffff",
                          color: isFailed ? "#991b1b" : "#0f172a",
                          border: isOutbound
                            ? isFailed
                              ? "1px solid #fecaca"
                              : "1px solid #bbf7d0"
                            : "1px solid #e2e8f0",
                          borderRadius: isOutbound
                            ? "14px 14px 2px 14px"
                            : "14px 14px 14px 2px",
                          padding: "8px 12px",
                          fontSize: "0.86rem",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                          wordBreak: "break-word",
                        }}
                      >
                        {!isOutbound && msg.sender_name && (
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#0f766e", marginBottom: 2 }}>
                            {msg.sender_name}
                          </div>
                        )}
                        <div>{msg.body}</div>

                        {msg.message_type === "interactive" && msg.metadata?.requestBody?.interactive?.action?.buttons && (
                          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                            {msg.metadata.requestBody.interactive.action.buttons.map((b: any) => (
                              <span
                                key={b.reply?.id}
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #86efac",
                                  color: "#166534",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                }}
                              >
                                {b.reply?.title}
                              </span>
                            ))}
                          </div>
                        )}

                        <div
                          style={{
                            fontSize: "0.68rem",
                            color: isFailed ? "#ef4444" : "#64748b",
                            marginTop: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: 3,
                          }}
                        >
                          <span>{niceDate(msg.created_at)} {timeAt(msg.created_at)}</span>
                          {isOutbound && !isFailed && (
                            <span
                              title={
                                msg.status === "read"
                                  ? "Read by recipient"
                                  : msg.status === "delivered"
                                  ? "Delivered to recipient device"
                                  : "Sent to WhatsApp network"
                              }
                              style={{ display: "inline-flex", alignItems: "center", marginLeft: 2 }}
                            >
                              {msg.status === "read" ? (
                                <CheckCheck size={14} color="#0284c7" strokeWidth={2.5} />
                              ) : msg.status === "delivered" ? (
                                <CheckCheck size={14} color="#64748b" strokeWidth={2} />
                              ) : (
                                <Check size={13} color="#64748b" strokeWidth={2} />
                              )}
                            </span>
                          )}
                          {isFailed && <span>• Failed</span>}
                        </div>
                      </div>
                      {isFailed && msg.error_message && (
                        <div style={{ fontSize: "0.68rem", color: "#dc2626", marginTop: 2 }}>
                          {msg.error_message}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Message Input & Send Bar */}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
              <textarea
                disabled={sendingWhatsApp}
                value={whatsAppDraft}
                onChange={(e) => setWhatsAppDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!sendingWhatsApp && whatsAppDraft.trim()) {
                      handleSendWhatsApp();
                    }
                  }
                }}
                placeholder={
                  sendingWhatsApp
                    ? "Dispatching message via Meta Cloud API..."
                    : "Type your WhatsApp reply (Press Enter to send)..."
                }
                rows={2}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  resize: "none",
                  fontFamily: "inherit",
                  opacity: sendingWhatsApp ? 0.65 : 1,
                  background: sendingWhatsApp ? "#f8fafc" : "#ffffff",
                  cursor: sendingWhatsApp ? "not-allowed" : "text",
                }}
              />
              <button
                type="button"
                className="btn primary"
                disabled={sendingWhatsApp || !whatsAppDraft.trim()}
                onClick={() => {
                  if (!sendingWhatsApp && whatsAppDraft.trim()) {
                    handleSendWhatsApp();
                  }
                }}
                style={{
                  height: "46px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: sendingWhatsApp || !whatsAppDraft.trim() ? "#94a3b8" : "#059669",
                  borderColor: sendingWhatsApp || !whatsAppDraft.trim() ? "#94a3b8" : "#047857",
                  fontWeight: 700,
                  cursor: sendingWhatsApp || !whatsAppDraft.trim() ? "not-allowed" : "pointer",
                  opacity: sendingWhatsApp || !whatsAppDraft.trim() ? 0.65 : 1,
                  transition: "all 0.15s ease",
                }}
              >
                {sendingWhatsApp ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </PortalModal>

      {/* Book Trial Assessment Modal */}
      <PortalModal
        open={Boolean(trialBookingLead)}
        onClose={() => !bookingTrialLoading && setTrialBookingLead(null)}
        title={
          trialBookingLead
            ? `Book Trial Assessment — ${cleanName(trialBookingLead.parentName)}`
            : "Book Trial Assessment"
        }
        subtitle={
          trialBookingLead
            ? `Schedule trial lesson date, time, instructor & meeting link for ${cleanName(trialBookingLead.childName || "learner")}`
            : undefined
        }
        size="md"
      >
        {trialBookingLead && (
          <form onSubmit={handleConfirmTrialBooking} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Child Name & Instrument */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <User size={13} /> Student / Child Name *
                </label>
                <input
                  type="text"
                  required
                  value={trialForm.childName}
                  onChange={(e) => setTrialForm({ ...trialForm, childName: e.target.value })}
                  placeholder="e.g. David"
                  style={{
                    padding: "8px 11px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.86rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Music2 size={13} /> Musical Instrument *
                </label>
                <select
                  required
                  value={trialForm.instrument}
                  onChange={(e) => setTrialForm({ ...trialForm, instrument: e.target.value })}
                  style={{
                    padding: "8px 11px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.86rem",
                    background: "#ffffff",
                  }}
                >
                  {catalogInstruments.map((inst) => (
                    <option key={inst} value={inst}>
                      {inst}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date, Time & Parent Timezone */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Calendar size={13} /> Assessment Date *
                </label>
                <input
                  type="date"
                  required
                  value={trialForm.date}
                  onChange={(e) => setTrialForm({ ...trialForm, date: e.target.value })}
                  style={{
                    padding: "8px 11px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.86rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Clock3 size={13} /> Assessment Time *
                </label>
                <input
                  type="time"
                  required
                  value={trialForm.time}
                  onChange={(e) => setTrialForm({ ...trialForm, time: e.target.value })}
                  style={{
                    padding: "8px 11px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.86rem",
                  }}
                />
              </div>
            </div>

            {/* Teacher & Parent Timezone */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <UserCheck size={13} /> Assigned Teacher *
                </label>
                <select
                  required
                  value={trialForm.teacherName}
                  onChange={(e) => setTrialForm({ ...trialForm, teacherName: e.target.value })}
                  style={{
                    padding: "8px 11px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.86rem",
                    background: "#ffffff",
                  }}
                >
                  <option value="">Select Teacher...</option>
                  {activeTeachers.map((t) => (
                    <option key={t.id || t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Globe size={13} /> Parent / Learner Timezone *
                </label>
                <select
                  required
                  value={trialForm.timezone}
                  onChange={(e) => setTrialForm({ ...trialForm, timezone: e.target.value })}
                  style={{
                    padding: "8px 11px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.86rem",
                    background: "#ffffff",
                  }}
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Meeting Link & Classroom Provider */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Video size={13} /> Classroom / Meeting Room *
              </label>

              {/* Provider Selection Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                <div
                  onClick={() => handleSelectProvider("inbuilt")}
                  style={{
                    border: trialForm.classroomProvider === "inbuilt" ? "2px solid #6366f1" : "1px solid #cbd5e1",
                    background: trialForm.classroomProvider === "inbuilt" ? "#eef2ff" : "#ffffff",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "6px",
                      background: "#e0e7ff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Video size={16} color="#4338ca" />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#1e1b4b" }}>
                      Inbuilt Video Studio
                    </div>
                    <div style={{ fontSize: "0.71rem", color: "#64748b" }}>
                      Built-in interactive room
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => handleSelectProvider("google_meet")}
                  style={{
                    border: trialForm.classroomProvider === "google_meet" ? "2px solid #059669" : "1px solid #cbd5e1",
                    background: trialForm.classroomProvider === "google_meet" ? "#ecfdf5" : "#ffffff",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "6px",
                      background: "#dcfce7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Link2 size={16} color="#047857" />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#064e3b" }}>
                      Google Meet
                    </div>
                    <div style={{ fontSize: "0.71rem", color: "#64748b" }}>
                      Paste or create active Meet
                    </div>
                  </div>
                </div>
              </div>

              {/* Meeting Link Preview / Customizer */}
              <div style={{ marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="url"
                    required
                    value={trialForm.meetUrl}
                    onChange={(e) => setTrialForm({ ...trialForm, meetUrl: e.target.value })}
                    placeholder={
                      trialForm.classroomProvider === "google_meet"
                        ? "Paste Google Meet link (e.g. https://meet.google.com/xxx-yyyy-zzz)"
                        : "In-App Studio URL"
                    }
                    style={{
                      flex: 1,
                      padding: "8px 11px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.82rem",
                      fontFamily: "monospace",
                      background: "#f8fafc",
                    }}
                  />
                  {trialForm.classroomProvider === "google_meet" && (
                    <a
                      href="https://meet.google.com/new"
                      target="_blank"
                      rel="noreferrer"
                      className="btn small"
                      style={{
                        padding: "7px 11px",
                        fontSize: "0.75rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: "#1a73e8",
                        color: "#ffffff",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                      title="Open Google Meet in a new tab to create an instant active room"
                    >
                      <ExternalLink size={12} />
                      Create on Google Meet ↗
                    </a>
                  )}
                </div>
                <div style={{ fontSize: "0.70rem", color: "#64748b", marginTop: 4 }}>
                  {trialForm.classroomProvider === "google_meet"
                    ? "Google Meet requires an active room generated on Google's servers. Click 'Create on Google Meet' to get a live link, then paste it here."
                    : "In-App Live Video Studio is hosted directly inside ProsperWork. Zero login or Google account required for parent or teacher."}
                </div>
              </div>
            </div>

            {/* Optional Notes */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <FileText size={13} /> Assessment Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={trialForm.notes}
                onChange={(e) => setTrialForm({ ...trialForm, notes: e.target.value })}
                placeholder="e.g. Free 30-min trial assessment. Beginner level."
                style={{
                  padding: "7px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.84rem",
                  resize: "vertical",
                }}
              />
            </div>

            {/* WhatsApp Notification Checkbox */}
            {resolveLeadPhone(trialBookingLead) && (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <input
                  type="checkbox"
                  id="send_wa_check"
                  checked={trialForm.sendWhatsAppConfirmation}
                  onChange={(e) => setTrialForm({ ...trialForm, sendWhatsAppConfirmation: e.target.checked })}
                  style={{ cursor: "pointer", width: 16, height: 16 }}
                />
                <label
                  htmlFor="send_wa_check"
                  style={{ fontSize: "0.78rem", color: "#166534", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  <MessageSquare size={13} /> Send instant booking confirmation to parent via WhatsApp ({resolveLeadPhone(trialBookingLead)})
                </label>
              </div>
            )}

            {/* Footer Buttons */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
                marginTop: "0.5rem",
                borderTop: "1px solid #f1f5f9",
                paddingTop: "0.85rem",
              }}
            >
              <button
                type="button"
                className="btn ghost"
                disabled={bookingTrialLoading}
                onClick={() => setTrialBookingLead(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={bookingTrialLoading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 700,
                  background: "#15803d",
                  borderColor: "#166534",
                }}
              >
                {bookingTrialLoading ? (
                  <>
                    <RefreshCw size={13} className="spin" />
                    <span>Booking Assessment...</span>
                  </>
                ) : (
                  <>
                    <CalendarCheck2 size={14} />
                    <span>Confirm & Book Trial</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </PortalModal>
    </>
  );
}
