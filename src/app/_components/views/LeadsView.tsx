"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  HelpCircle,
  MessageCircle,
  MessageSquare,
  Music2,
  PhoneCall,
  RefreshCw,
  Send,
  Timer,
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
    id: "called_no_answer",
    label: "Called – No Answer",
    pillColor: { bg: "#fffbeb", text: "#b45309", border: "#fde68a", dot: "#f59e0b" },
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
    return PIPELINE_STAGES.find((s) => s.id === "called_no_answer")!;
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
  | "called_no_answer"
  | "contacted"
  | "trial_booked"
  | "converted"
  | "lost";

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
  setLeadStatus: (lead: Lead, status: Lead["status"]) => void;
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

  // In-App WhatsApp Live Chat State
  const [whatsAppLead, setWhatsAppLead] = useState<Lead | null>(null);
  const [whatsAppMessages, setWhatsAppMessages] = useState<any[]>([]);
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppDraft, setWhatsAppDraft] = useState("");

  const openWhatsAppChat = async (lead: Lead) => {
    setWhatsAppLead(lead);
    setWhatsAppMessages([]);
    setWhatsAppDraft("");
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
    } catch {
      // quiet fallback
    } finally {
      setLoadingWhatsApp(false);
    }
  };

  const handleSendWhatsApp = async (
    customText?: string,
    buttons?: Array<{ id: string; title: string }>
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
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setWhatsAppDraft("");
        notify("WhatsApp message dispatched via Meta Cloud API!");
        if (whatsAppLead.status === "new") {
          setLeadStatus(whatsAppLead, "contacted");
          setWhatsAppLead((prev) => (prev ? { ...prev, status: "contacted" } : null));
        }
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
          if (stageFilter === "called_no_answer") {
            return lead.status === "called_no_answer" || lead.status === "callback";
          }
          if (stageFilter === "contacted") return lead.status === "contacted";
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
      id: "called_no_answer",
      label: "Called – No Answer",
      count: searchedLeads.filter(
        (l) => l.status === "called_no_answer" || l.status === "callback"
      ).length,
    },
    {
      id: "contacted",
      label: "Contacted",
      count: searchedLeads.filter((l) => l.status === "contacted").length,
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
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
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
              }}
              onClick={() => setFilterMode("ready")}
            >
              ✓ Ready to Invest ({readyCount})
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
              }}
              onClick={() => setFilterMode("budget")}
            >
              ✕ Budget Mismatch ({budgetCount})
            </button>
            <button
              type="button"
              className={`btn small ${filterMode === "fb" ? "primary" : "ghost"}`}
              style={{ padding: "3px 9px", fontSize: "0.74rem", borderRadius: "6px" }}
              onClick={() => setFilterMode("fb")}
            >
              Facebook ({fbCount})
            </button>
            <button
              type="button"
              className={`btn small ${filterMode === "ig" ? "primary" : "ghost"}`}
              style={{ padding: "3px 9px", fontSize: "0.74rem", borderRadius: "6px" }}
              onClick={() => setFilterMode("ig")}
            >
              Instagram ({igCount})
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
                                <PhoneCall size={10} />
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
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                background: "#ebf5ff",
                                color: "#1877f2",
                                fontWeight: 700,
                                fontSize: "0.7rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                border: "1px solid #bfdbfe",
                              }}
                            >
                              <span style={{ fontWeight: 900 }}>f</span> Facebook
                            </span>
                          )}
                          {plat === "ig" && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                background: "#fdf2f8",
                                color: "#db2777",
                                fontWeight: 700,
                                fontSize: "0.7rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                border: "1px solid #fbcfe8",
                              }}
                            >
                              <span style={{ fontWeight: 900 }}>◎</span> Instagram
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
                            {intent.type === "ready" ? "✓" : intent.type === "budget" ? "✕" : "•"} {intent.shortLabel}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: "0.82rem", color: "#334155" }}>
                        {lead.preferredSlots && lead.preferredSlots.length > 0 ? (
                          <strong>{lead.preferredSlots.join(" · ")}</strong>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>No trial booked yet</span>
                        )}
                      </div>
                      <div style={{ marginTop: 3 }}>
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
                        <button
                          className="icon-btn"
                          aria-label={`Call ${displayName}`}
                          title={phone ? `Call ${phone}` : "No phone available"}
                          disabled={!phone}
                          style={{
                            color: phone ? "inherit" : "#cbd5e1",
                            cursor: phone ? "pointer" : "not-allowed",
                          }}
                          onClick={() => {
                            if (!phone) return;
                            openExternal("phone", phone, displayName);
                          }}
                        >
                          <PhoneCall size={12} />
                        </button>
                      </div>
                    </td>

                    <td style={{ textAlign: "center", position: "relative" }}>
                      {/* Move Stage Dropdown - Always displays Current Status */}
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <button
                          type="button"
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
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            transition: "all 0.15s ease",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                          }}
                          title={`Current Stage: ${getStageDisplay(lead.status).label} (Click to change)`}
                        >
                          <span
                            style={{
                              width: "7px",
                              height: "7px",
                              borderRadius: "50%",
                              backgroundColor: getStageDisplay(lead.status).pillColor.dot,
                              display: "inline-block",
                            }}
                          />
                          <span>{getStageDisplay(lead.status).label}</span>
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
                                      onClick={() => {
                                        setLeadStatus(lead, s.id);
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
                        disabled={!modalPhone}
                        onClick={() => {
                          if (!modalPhone) return;
                          openExternal("phone", modalPhone, cleanName(selectedLead.parentName));
                        }}
                      >
                        <PhoneCall size={13} style={{ marginRight: 4 }} />
                        Call Phone
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
                    style={{
                      background: selectedLead.platform === "ig" || selectedLead.metaPlatform === "ig" ? "#db2777" : "#1877f2",
                      color: "#fff",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "12px",
                    }}
                  >
                    {selectedLead.platform === "ig" || selectedLead.metaPlatform === "ig"
                      ? "Instagram Lead Ad"
                      : "Facebook Lead Ad"}
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
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`btn small ${isSelected ? "primary" : "ghost"}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: isSelected ? "#4f46e5" : undefined,
                        borderColor: isSelected ? "#4f46e5" : undefined,
                        color: isSelected ? "#ffffff" : undefined,
                        fontWeight: isSelected ? 700 : 500,
                      }}
                      onClick={() => {
                        setLeadStatus(selectedLead, s.id);
                        setSelectedLead((prev) => (prev ? { ...prev, status: s.id } : null));
                      }}
                    >
                      {isSelected && <Check size={13} style={{ strokeWidth: 2.5 }} />}
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
            ? `Prosperwork music (+44 7742 534931) ⟷ ${resolveLeadPhone(whatsAppLead)}`
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
              }}
            >
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
                Meta WhatsApp Business Cloud API Active (Prosperwork music)
              </div>
              <button
                type="button"
                className="btn small ghost"
                style={{ fontSize: "0.75rem", padding: "2px 8px", color: "#065f46" }}
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
                Open in WhatsApp Web <ExternalLink size={11} style={{ marginLeft: 3 }} />
              </button>
            </div>

            {/* Quick Action Automated Response Chips */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
                    background: "#ecfdf5",
                    borderColor: "#a7f3d0",
                    color: "#065f46",
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    const parentName = cleanName(whatsAppLead.parentName).split(" ")[0];
                    handleSendWhatsApp(
                      undefined,
                      [
                        { id: "pw_book_trial", title: "Book Trial Lesson" },
                        { id: "pw_view_schedule", title: "View Schedule" },
                      ]
                    );
                    setWhatsAppDraft(
                      `Hello ${parentName}! 🎹 Would you like to schedule your trial lesson for ${whatsAppLead.instrument || "Piano"} with our director? Tap a button below to confirm:`
                    );
                  }}
                >
                  🚀 Trial Booking Prompt with Buttons
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
                  }}
                  onClick={() => {
                    const parentName = cleanName(whatsAppLead.parentName).split(" ")[0];
                    setWhatsAppDraft(
                      `Hello ${parentName}! 👋 Thank you for enquiring about music lessons with ProsperWork Music Academy. Which days of the week work best for your child's 1-on-1 lesson?`
                    );
                  }}
                >
                  📅 Lesson Availability Query
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
                  }}
                  onClick={() => {
                    setWhatsAppDraft(
                      `Our premium 1-on-1 weekly lessons start from £45 / ₦78,000 monthly for 4 sessions, complete with curriculum books, performance assessments, and interactive classroom access.`
                    );
                  }}
                >
                  🎵 Pricing & Monthly Plan
                </button>
              </div>
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
                  <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 6px auto" }} />
                  Loading WhatsApp messages...
                </div>
              ) : whatsAppMessages.length === 0 ? (
                <div style={{ textAlign: "center", color: "#64748b", margin: "auto", maxWidth: "340px" }}>
                  <div style={{ fontSize: "1.8rem", marginBottom: 6 }}>💬</div>
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
                            <span title={`Status: ${msg.status}`}>
                              {msg.status === "read" || msg.status === "delivered" ? (
                                <CheckCheck size={12} color="#0284c7" />
                              ) : (
                                <Check size={12} color="#64748b" />
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
                value={whatsAppDraft}
                onChange={(e) => setWhatsAppDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendWhatsApp();
                  }
                }}
                placeholder="Type your WhatsApp reply (Press Enter to send)..."
                rows={2}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  resize: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                className="btn primary"
                disabled={sendingWhatsApp || !whatsAppDraft.trim()}
                onClick={() => handleSendWhatsApp()}
                style={{
                  height: "46px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#059669",
                  borderColor: "#047857",
                  fontWeight: 700,
                }}
              >
                {sendingWhatsApp ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Send
              </button>
            </div>
          </div>
        )}
      </PortalModal>
    </>
  );
}
