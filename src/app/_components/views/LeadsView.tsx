"use client";

import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Download,
  ExternalLink,
  MessageCircle,
  Music2,
  PhoneCall,
  RefreshCw,
  Send,
  Timer,
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
  const [stageFilter, setStageFilter] = useState<Lead["status"] | "all">("all");
  const [platformFilter, setPlatformFilter] = useState<"all" | "fb" | "ig" | "meta" | "other">("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [syncingMeta, setSyncingMeta] = useState(false);

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

  const searchedLeads = data.leads.filter((lead) => {
    const matchesQuery = `${lead.parentName} ${lead.childName} ${lead.instrument} ${lead.source} ${lead.status} ${lead.email} ${lead.phone}`
      .toLowerCase()
      .includes(query.toLowerCase());

    if (!matchesQuery) return false;

    if (platformFilter === "all") return true;
    const plat = getLeadPlatform(lead);
    if (platformFilter === "fb") return plat === "fb";
    if (platformFilter === "ig") return plat === "ig";
    if (platformFilter === "meta") return isMetaLead(lead);
    if (platformFilter === "other") return plat === "other" && !isMetaLead(lead);
    return true;
  });

  const list =
    stageFilter === "all"
      ? searchedLeads
      : searchedLeads.filter((lead) => lead.status === stageFilter);

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

  // Manual Meta leads sync action
  const handleSyncMeta = async () => {
    if (syncingMeta) return;
    setSyncingMeta(true);
    notify("Connecting to Meta Graph API and synchronizing leads...");
    try {
      const res = await fetch("/api/integrations/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Meta synchronization failed.");
      }
      notify(
        `Meta sync completed: ${data.inserted || 0} new lead(s) retrieved, ${
          data.skipped || 0
        } already up to date.`
      );
      if (reload) {
        await reload();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync error";
      notify(`Meta sync error: ${message}`);
    } finally {
      setSyncingMeta(false);
    }
  };

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
      "Preferred / Trial Slots",
      "Meta Form ID",
      "Campaign",
      "Ad",
      "Notes / Custom Responses",
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
        escapeCsv(lead.parentName),
        escapeCsv(lead.phone),
        escapeCsv(lead.email),
        escapeCsv(lead.status),
        escapeCsv(lead.instrument),
        escapeCsv(lead.preferredSlots?.join(" · ") || ""),
        escapeCsv(lead.metaFormId || ""),
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
        <div style={{ display: "flex", gap: "0.4rem", marginLeft: "auto", flexWrap: "wrap" }}>
          {(adminAccess || role === "sales_marketing") && (
            <button
              type="button"
              className="btn small secondary"
              onClick={handleSyncMeta}
              disabled={syncingMeta}
              title="Sync newest leads from Meta (Facebook and Instagram)"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <RefreshCw size={13} className={syncingMeta ? "spin" : ""} />
              {syncingMeta ? "Syncing Meta..." : "Sync Meta Leads"}
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
            Trials in motion{" "}
            <span className="stat-icon">
              <Music2 size={15} />
            </span>
          </div>
          <div className="stat-value">
            {
              data.leads.filter((lead) =>
                ["trial_requested", "trial_booked", "trial_verified"].includes(
                  lead.status
                )
              ).length
            }
          </div>
          <div className="stat-foot">Handoff to teacher and usher</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Meta Ad Leads{" "}
            <span className="stat-icon">
              <ExternalLink size={15} />
            </span>
          </div>
          <div className="stat-value">
            {data.leads.filter((lead) => isMetaLead(lead)).length}
          </div>
          <div className="stat-foot">Retrieved via Webhook & API</div>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <SectionTitle
            title="Enquiries & trial classes"
            detail="Follow-ups, Meta Lead Ad submissions, trial bookings, and CRM handoffs."
          />
          {/* Quick Platform Filter Pills */}
          <div style={{ display: "flex", gap: "0.25rem", background: "var(--surface-muted, #f8fafc)", padding: "3px", borderRadius: "8px", border: "1px solid var(--border-color, #e2e8f0)" }}>
            <button
              type="button"
              className={`btn small ${platformFilter === "all" ? "primary" : "ghost"}`}
              style={{ padding: "3px 10px", fontSize: "0.75rem", borderRadius: "6px" }}
              onClick={() => setPlatformFilter("all")}
            >
              All Sources
            </button>
            <button
              type="button"
              className={`btn small ${platformFilter === "meta" ? "primary" : "ghost"}`}
              style={{ padding: "3px 10px", fontSize: "0.75rem", borderRadius: "6px" }}
              onClick={() => setPlatformFilter("meta")}
            >
              Meta Ads ({data.leads.filter(isMetaLead).length})
            </button>
            <button
              type="button"
              className={`btn small ${platformFilter === "fb" ? "primary" : "ghost"}`}
              style={{ padding: "3px 10px", fontSize: "0.75rem", borderRadius: "6px" }}
              onClick={() => setPlatformFilter("fb")}
            >
              Facebook
            </button>
            <button
              type="button"
              className={`btn small ${platformFilter === "ig" ? "primary" : "ghost"}`}
              style={{ padding: "3px 10px", fontSize: "0.75rem", borderRadius: "6px" }}
              onClick={() => setPlatformFilter("ig")}
            >
              Instagram
            </button>
          </div>
        </div>

        <div
          className="portal-tabs"
          role="tablist"
          aria-label="Filter leads by pipeline stage"
        >
          <button
            type="button"
            role="tab"
            aria-selected={stageFilter === "all"}
            className={`portal-tab${stageFilter === "all" ? " active" : ""}`}
            onClick={() => setStageFilter("all")}
          >
            All
            <span className="portal-tab-badge">{searchedLeads.length}</span>
          </button>
          {stages.map((stage) => {
            const count = searchedLeads.filter(
              (lead) => lead.status === stage
            ).length;
            return (
              <button
                key={stage}
                type="button"
                role="tab"
                aria-selected={stageFilter === stage}
                className={`portal-tab${stageFilter === stage ? " active" : ""}`}
                onClick={() => setStageFilter(stage)}
              >
                {stage.replaceAll("_", " ")}
                <span className="portal-tab-badge">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Arrived / response</th>
                <th>Family & learner</th>
                <th>Source & Channel</th>
                <th>Follow-up & trial detail</th>
                <th>Owner & Contact</th>
                <th>Pipeline</th>
                <th>Next step</th>
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

                return (
                  <tr key={lead.id}>
                    <td>
                      <strong>{niceDate(lead.arrivedAt)}</strong>
                      <div className="table-small">
                        {timeAt(lead.arrivedAt)} ·{" "}
                        {minutes === null
                          ? "Response due"
                          : `First reply ${minutes}m`}
                      </div>
                    </td>
                    <td>
                      <div
                        className="pw-person-inline"
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedLead(lead)}
                        title="Click to view complete lead responses and details"
                      >
                        <ProfileAvatar name={lead.parentName} size={32} />
                        <span>
                          <strong style={{ color: "var(--accent-color, #0f766e)" }}>
                            {lead.parentName}
                          </strong>
                          <small>
                            {lead.childName} · {lead.instrument}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-start" }}>
                        {plat === "fb" && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "#ebf5ff",
                              color: "#1877f2",
                              fontWeight: 600,
                              fontSize: "0.72rem",
                              padding: "2px 7px",
                              borderRadius: "4px",
                              border: "1px solid #bfdbfe",
                            }}
                          >
                            <span style={{ fontWeight: 800 }}>f</span> Facebook
                          </span>
                        )}
                        {plat === "ig" && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "#fdf2f8",
                              color: "#db2777",
                              fontWeight: 600,
                              fontSize: "0.72rem",
                              padding: "2px 7px",
                              borderRadius: "4px",
                              border: "1px solid #fbcfe8",
                            }}
                          >
                            <span style={{ fontWeight: 800 }}>◎</span> Instagram
                          </span>
                        )}
                        {plat === "other" && (
                          <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                            {lead.source}
                          </span>
                        )}

                        {lead.readiness && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              color: lead.readiness.toLowerCase().includes("yes") ? "#059669" : "#64748b",
                              background: lead.readiness.toLowerCase().includes("yes") ? "#ecfdf5" : "#f1f5f9",
                              padding: "1px 5px",
                              borderRadius: "3px",
                              maxWidth: "140px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={`Readiness: ${lead.readiness}`}
                          >
                            {lead.readiness}
                          </span>
                        )}
                        <span className="table-small" style={{ color: "#64748b" }}>
                          {lead.email}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div
                        style={{
                          maxHeight: "3.5em",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: "0.85rem",
                        }}
                      >
                        {lead.notes}
                      </div>
                      <div className="table-small" style={{ marginTop: 2 }}>
                        {lead.preferredSlots?.join(" · ") ||
                          "No preferred trial times yet"}
                        {lead.callbackAt &&
                          ` · callback ${niceDate(lead.callbackAt)}`}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span>{lead.owner}</span>
                        {hasMeta && (
                          <button
                            type="button"
                            className="icon-btn"
                            title="Inspect full Meta Lead Ads questionnaire"
                            onClick={() => setSelectedLead(lead)}
                            style={{ padding: "2px 4px", fontSize: "0.7rem", color: "#0f766e" }}
                          >
                            View
                          </button>
                        )}
                      </div>
                      <div className="row-actions" style={{ marginTop: 5 }}>
                        <button
                          className="icon-btn"
                          aria-label={`Email ${lead.parentName}`}
                          title={`Send Email to ${lead.email}`}
                          onClick={() =>
                            openEmailComposer(
                              "lead",
                              lead.id,
                              lead.email,
                              lead.parentName
                            )
                          }
                        >
                          <MessageCircle size={13} />
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`WhatsApp ${lead.parentName}`}
                          title={`Send WhatsApp to ${lead.parentName}`}
                          onClick={() =>
                            openExternal(
                              "whatsapp",
                              lead.phone,
                              lead.parentName,
                              `Hello ${lead.parentName}, this is ProsperWork Music Academy regarding ${lead.childName}'s music lessons inquiry. How can we assist you today?`
                            )
                          }
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#059669",
                            }}
                          >
                            WA
                          </span>
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`Call ${lead.parentName}`}
                          title={`Call ${lead.phone}`}
                          onClick={() =>
                            openExternal("phone", lead.phone, lead.parentName)
                          }
                        >
                          <ArrowUpRight size={13} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <Pill>{lead.status.replaceAll("_", " ")}</Pill>
                    </td>
                    <td>
                      <div className="row-actions">
                        {lead.status === "new" &&
                          statusButton("Contacted", () =>
                            setLeadStatus(lead, "contacted")
                          )}
                        {(lead.status === "contacted" ||
                          lead.status === "callback") &&
                          statusButton(
                            "Request trial",
                            () => setLeadStatus(lead, "trial_requested"),
                            "secondary"
                          )}
                        {lead.status === "trial_requested" &&
                          statusButton(
                            "Book trial",
                            () => setLeadStatus(lead, "trial_booked"),
                            "secondary"
                          )}
                        {lead.status === "trial_booked" &&
                          statusButton(
                            "Trial done",
                            () => setLeadStatus(lead, "trial_verified"),
                            "secondary"
                          )}
                        {lead.status === "trial_verified" &&
                          statusButton(
                            "Convert",
                            () => setLeadStatus(lead, "converted"),
                            "secondary"
                          )}
                        {lead.status === "converted" &&
                          (financeAccess ? (
                            statusButton("First payment", () => {
                              changeView("finance");
                              notify(
                                "Add the first payment record in Finance."
                              );
                            })
                          ) : (
                            <span className="table-small">
                              Handoff to Finance for billing
                            </span>
                          ))}
                        {!["converted", "winback"].includes(lead.status) &&
                          statusButton(
                            lead.status === "nursery" ? "Win-back" : "Nursery",
                            () =>
                              setLeadStatus(
                                lead,
                                lead.status === "nursery"
                                  ? "winback"
                                  : "nursery"
                              )
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
              detail="Capture a new family enquiry or sync leads from Meta to populate the pipeline."
            />
          )}
        </div>
      </section>

      {/* LEAD DETAILS & QUESTIONNAIRE MODAL */}
      <PortalModal
        open={Boolean(selectedLead)}
        onClose={() => setSelectedLead(null)}
        title={selectedLead?.parentName || "Lead Details"}
        eyebrow={
          selectedLead?.platform === "ig" || selectedLead?.metaPlatform === "ig"
            ? "Meta Lead Ads · Instagram"
            : selectedLead?.platform === "fb" || selectedLead?.metaPlatform === "fb"
            ? "Meta Lead Ads · Facebook"
            : "Academy Lead"
        }
        subtitle={
          selectedLead
            ? `Arrived ${niceDate(selectedLead.arrivedAt)} at ${timeAt(selectedLead.arrivedAt)}`
            : undefined
        }
        size="lg"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {selectedLead && (
                <>
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={() => {
                      openExternal(
                        "whatsapp",
                        selectedLead.phone,
                        selectedLead.parentName,
                        `Hello ${selectedLead.parentName}, this is ProsperWork Music Academy regarding ${selectedLead.childName}'s music lessons inquiry. How can we assist you today?`
                      );
                    }}
                  >
                    WhatsApp Chat
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      openExternal("phone", selectedLead.phone, selectedLead.parentName);
                    }}
                  >
                    <PhoneCall size={13} style={{ marginRight: 4 }} />
                    Call
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      openEmailComposer(
                        "lead",
                        selectedLead.id,
                        selectedLead.email,
                        selectedLead.parentName
                      );
                      setSelectedLead(null);
                    }}
                  >
                    <Send size={13} style={{ marginRight: 4 }} />
                    Email
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
        }
      >
        {selectedLead && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Lead Status & Core Info Card */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
                padding: "1rem",
                borderRadius: "8px",
                background: "var(--surface-muted, #f8fafc)",
                border: "1px solid var(--border-color, #e2e8f0)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                  Candidate / Learner
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: 2 }}>
                  {selectedLead.childName || selectedLead.parentName}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#0f766e", marginTop: 2 }}>
                  Instrument: {selectedLead.instrument || "Not specified"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                  Contact Information
                </div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 2 }}>
                  {selectedLead.phone || "No phone"}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 2 }}>
                  {selectedLead.email || "No email"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                  Current Status
                </div>
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill>{selectedLead.status.replaceAll("_", " ")}</Pill>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    Assigned: {selectedLead.owner}
                  </span>
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
                  background: "#f0f9ff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1e40af" }}>
                    Meta Lead Ads Attribution
                  </span>
                  <span
                    style={{
                      background: "#1877f2",
                      color: "#fff",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "12px",
                    }}
                  >
                    {selectedLead.platform === "ig" || selectedLead.metaPlatform === "ig"
                      ? "Instagram Lead Form"
                      : "Facebook Lead Form"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.82rem" }}>
                  <div>
                    <span style={{ color: "#64748b" }}>Meta Lead ID: </span>
                    <strong style={{ fontFamily: "monospace" }}>{selectedLead.metaLeadId || "—"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>Meta Form ID: </span>
                    <strong style={{ fontFamily: "monospace" }}>{selectedLead.metaFormId || "—"}</strong>
                  </div>
                  {selectedLead.campaignName && (
                    <div>
                      <span style={{ color: "#64748b" }}>Campaign: </span>
                      <strong>{selectedLead.campaignName}</strong>
                    </div>
                  )}
                  {selectedLead.adName && (
                    <div>
                      <span style={{ color: "#64748b" }}>Ad Name: </span>
                      <strong>{selectedLead.adName}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Custom Lead Form Answers Section */}
            <div
              style={{
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "8px",
                padding: "1rem",
                background: "#ffffff",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                Form Responses & Questions
              </div>

              {selectedLead.customAnswers && Object.keys(selectedLead.customAnswers).length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {Object.entries(selectedLead.customAnswers).map(([question, answer]) => (
                    <div
                      key={question}
                      style={{
                        padding: "0.6rem 0.75rem",
                        background: "var(--surface-muted, #f8fafc)",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color, #f1f5f9)",
                      }}
                    >
                      <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 600 }}>
                        {question}
                      </div>
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0f172a", marginTop: 2 }}>
                        {String(answer)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", color: "#334155", background: "#f8fafc", padding: "0.75rem", borderRadius: "6px" }}>
                  {selectedLead.notes || "No custom form questionnaire responses recorded."}
                </div>
              )}
            </div>

            {/* Quick Status Progression Buttons in Modal */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                Advance Pipeline Stage
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {selectedLead.status !== "contacted" && (
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      setLeadStatus(selectedLead, "contacted");
                      setSelectedLead((prev) => prev ? { ...prev, status: "contacted" } : null);
                    }}
                  >
                    Mark Contacted
                  </button>
                )}
                {selectedLead.status !== "trial_requested" && (
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={() => {
                      setLeadStatus(selectedLead, "trial_requested");
                      setSelectedLead((prev) => prev ? { ...prev, status: "trial_requested" } : null);
                    }}
                  >
                    Request Trial
                  </button>
                )}
                {selectedLead.status !== "trial_booked" && (
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={() => {
                      setLeadStatus(selectedLead, "trial_booked");
                      setSelectedLead((prev) => prev ? { ...prev, status: "trial_booked" } : null);
                    }}
                  >
                    Book Trial
                  </button>
                )}
                {selectedLead.status !== "trial_verified" && (
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={() => {
                      setLeadStatus(selectedLead, "trial_verified");
                      setSelectedLead((prev) => prev ? { ...prev, status: "trial_verified" } : null);
                    }}
                  >
                    Verify Trial Completed
                  </button>
                )}
                {selectedLead.status !== "converted" && (
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => {
                      setLeadStatus(selectedLead, "converted");
                      setSelectedLead((prev) => prev ? { ...prev, status: "converted" } : null);
                    }}
                  >
                    Convert to Student
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </PortalModal>
    </>
  );
}
