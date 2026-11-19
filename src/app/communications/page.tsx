"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Eye,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import { PortalModal } from "@/app/_components/PortalModal";

type Profile = {
  id: string;
  name?: string;
  role: string;
  department?: string;
  permissions?: string[];
};
type Contact = {
  id: string;
  leadId: string | null;
  guardianId: string | null;
  email: string;
  consent: boolean;
  eligible: boolean;
  evidence: string | null;
  changedAt: string | null;
};
type Lead = { id: string; name: string; email: string };
type Campaign = {
  id: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  queued: number;
  sent: number;
  failed: number;
  cancelled: number;
};
type Snapshot = {
  profile: Profile;
  contacts: Contact[];
  leads: Lead[];
  campaigns: Campaign[];
};
type Audience = "families" | "leads" | "all";
type ResultBody = {
  ok?: boolean;
  error?: string;
  message?: string;
  result?: { id?: string; recipients?: number };
};
type DirectoryEntry = {
  key: string;
  kind: "family" | "lead";
  displayName: string;
  email: string;
  guardianId: string | null;
  leadId: string | null;
  consent: boolean;
  eligible: boolean;
  evidence: string | null;
  changedAt: string | null;
  editable: boolean;
};

const normalizeRole = (role: string) => role.toLowerCase().replace(/[\s-]+/g, "_");
const roleLabel = (role: string) => role.replaceAll("_", " ");
const niceDate = (value: string | null) => {
  if (!value) return "No change recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : value;
};
const makeRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
};
async function readResult(response: Response): Promise<ResultBody> {
  const parsed = await response.json().catch(() => ({}));
  return parsed && typeof parsed === "object" ? (parsed as ResultBody) : {};
}
function errorMessage(response: Response, result: ResultBody) {
  return result.error || result.message || `Request failed (${response.status}).`;
}
function statusTone(status: string) {
  if (["sent", "complete", "completed"].includes(status.toLowerCase())) return "";
  if (["failed", "cancelled", "canceled"].includes(status.toLowerCase()))
    return "red";
  if (["queued", "pending", "sending"].includes(status.toLowerCase()))
    return "amber";
  return "blue";
}

export default function CommunicationsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Page tabs & filters
  const [activeTab, setActiveTab] = useState<"campaigns" | "consent">("campaigns");
  const [consentFilter, setConsentFilter] = useState<
    "all" | "families" | "leads" | "missing"
  >("all");
  const [consentSearch, setConsentSearch] = useState("");

  // New Campaign modal state
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignModalError, setCampaignModalError] = useState("");
  const [audience, setAudience] = useState<Audience>("families");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [sendConfirm, setSendConfirm] = useState("");
  const [requestId, setRequestId] = useState("");

  // Update Consent modal state
  const [consentModalEntry, setConsentModalEntry] =
    useState<DirectoryEntry | null>(null);
  const [consentTargetEnabled, setConsentTargetEnabled] = useState(false);
  const [consentReason, setConsentReason] = useState("");
  const [consentModalError, setConsentModalError] = useState("");

  // Cancel Campaign modal state
  const [cancelModalCampaign, setCancelModalCampaign] =
    useState<Campaign | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelModalError, setCancelModalError] = useState("");

  // View Message modal state
  const [viewCampaign, setViewCampaign] = useState<Campaign | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/communications", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await readResult(response);
      if (!response.ok || result.error)
        throw new Error(errorMessage(response, result));
      const data = result as unknown as Snapshot;
      if (
        !data.profile ||
        !Array.isArray(data.contacts) ||
        !Array.isArray(data.leads) ||
        !Array.isArray(data.campaigns)
      ) {
        throw new Error("The communications response was incomplete.");
      }
      setSnapshot(data);
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Communications records could not be loaded."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const role = normalizeRole(snapshot?.profile.role ?? "");
  const isParent = ["parent", "guardian", "family_parent"].includes(role);
  const isOwner = ["super_admin", "owner"].includes(role);
  const perms = useMemo(
    () => new Set(snapshot?.profile.permissions ?? []),
    [snapshot?.profile?.permissions]
  );
  // Guard isSales with !isOwner && !isParent so Owner/Super Admin is NEVER locked strictly to "leads"
  const isSales =
    !isOwner &&
    !isParent &&
    (role === "sales_marketing" ||
      perms.has("workspace.communications") ||
      perms.has("workspace.leads"));
  const canSend =
    isOwner ||
    isSales ||
    (!isParent && perms.has("workspace.communications"));
  const canRecordLeadConsent =
    isOwner ||
    isSales ||
    (!isParent && perms.has("workspace.communications"));

  const contacts = snapshot?.contacts ?? [];
  const leads = snapshot?.leads ?? [];
  const campaigns = snapshot?.campaigns ?? [];

  // Default parents directly to the Consent Directory tab
  const effectiveTab = canSend ? activeTab : "consent";

  const effectiveAudience: Audience = isSales ? "leads" : audience;
  const audienceCounts = useMemo(() => {
    let families = 0;
    let leadCount = 0;
    let all = 0;
    for (const contact of contacts) {
      if (!contact.consent || contact.eligible === false) continue;
      if (contact.guardianId) families += 1;
      if (contact.leadId) leadCount += 1;
      if (contact.guardianId || contact.leadId) all += 1;
    }
    return { families, leads: leadCount, all };
  }, [contacts]);

  const recipientCount =
    effectiveAudience === "families"
      ? audienceCounts.families
      : effectiveAudience === "leads"
      ? audienceCounts.leads
      : audienceCounts.all;

  // Unified, deduplicated Consent Directory merging family contacts and leads
  const directoryEntries = useMemo<DirectoryEntry[]>(() => {
    if (isParent) {
      return contacts
        .filter(
          (contact) =>
            contact.guardianId === snapshot?.profile.id && !contact.leadId
        )
        .map((contact) => ({
          key: `contact:${contact.id}`,
          kind: "family" as const,
          displayName: snapshot?.profile.name || contact.email,
          email: contact.email,
          guardianId: contact.guardianId,
          leadId: null,
          consent: contact.consent,
          eligible: contact.eligible,
          evidence: contact.evidence,
          changedAt: contact.changedAt,
          editable: true,
        }));
    }

    const entries: DirectoryEntry[] = [];
    const seenLeadIds = new Set<string>();

    // Family contacts
    for (const contact of contacts) {
      if (contact.guardianId && !contact.leadId) {
        entries.push({
          key: `family:${contact.id}`,
          kind: "family",
          displayName: contact.email,
          email: contact.email,
          guardianId: contact.guardianId,
          leadId: null,
          consent: contact.consent,
          eligible: contact.eligible,
          evidence: contact.evidence,
          changedAt: contact.changedAt,
          editable: false,
        });
      }
    }

    // Leads merged with their contact consent records
    for (const lead of leads) {
      seenLeadIds.add(lead.id);
      const contact = contacts.find((item) => item.leadId === lead.id);
      entries.push({
        key: `lead:${lead.id}`,
        kind: "lead",
        displayName: lead.name || "Lead",
        email: lead.email || contact?.email || "No email",
        guardianId: null,
        leadId: lead.id,
        consent: contact?.consent ?? false,
        eligible: contact?.eligible ?? true,
        evidence: contact?.evidence ?? null,
        changedAt: contact?.changedAt ?? null,
        editable: canRecordLeadConsent,
      });
    }

    // Any remaining lead contacts not present in leads array
    for (const contact of contacts) {
      if (contact.leadId && !seenLeadIds.has(contact.leadId)) {
        entries.push({
          key: `contact-lead:${contact.id}`,
          kind: "lead",
          displayName: contact.email,
          email: contact.email,
          guardianId: null,
          leadId: contact.leadId,
          consent: contact.consent,
          eligible: contact.eligible,
          evidence: contact.evidence,
          changedAt: contact.changedAt,
          editable: canRecordLeadConsent,
        });
      }
    }

    return entries;
  }, [
    contacts,
    leads,
    isParent,
    snapshot?.profile.id,
    snapshot?.profile.name,
    canRecordLeadConsent,
  ]);

  const filteredDirectory = useMemo(() => {
    const q = consentSearch.trim().toLowerCase();
    return directoryEntries.filter((entry) => {
      if (!isParent) {
        if (consentFilter === "families" && entry.kind !== "family")
          return false;
        if (consentFilter === "leads" && entry.kind !== "lead") return false;
        if (consentFilter === "missing" && entry.consent) return false;
      }
      if (q) {
        const hay = [entry.displayName, entry.email, entry.evidence || ""]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [directoryEntries, consentFilter, consentSearch, isParent]);

  const directoryCounts = useMemo(() => {
    let families = 0;
    let leadRows = 0;
    let missing = 0;
    for (const entry of directoryEntries) {
      if (entry.kind === "family") families += 1;
      else leadRows += 1;
      if (!entry.consent) missing += 1;
    }
    return {
      all: directoryEntries.length,
      families,
      leads: leadRows,
      missing,
    };
  }, [directoryEntries]);

  const postAction = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/communications", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await readResult(response);
    if (!response.ok || result.ok === false || result.error)
      throw new Error(errorMessage(response, result));
    if (
      !result.result ||
      typeof result.result.id !== "string" ||
      typeof result.result.recipients !== "number"
    ) {
      throw new Error(
        "The action response could not be confirmed. Refresh records before retrying."
      );
    }
    return result.result;
  }, []);

  const openConsentModal = (entry: DirectoryEntry) => {
    setConsentModalEntry(entry);
    setConsentTargetEnabled(!entry.consent);
    setConsentReason("");
    setConsentModalError("");
  };

  const handleSaveConsent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!consentModalEntry || !consentModalEntry.editable || busyRef.current)
      return;
    const evidence = consentReason.trim();
    if (evidence.length < 5) {
      setConsentModalError(
        "Add at least five characters of explicit consent evidence or reason."
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setConsentModalError("");
    setActionError("");
    setNotice("");
    try {
      await postAction({
        action: "consent",
        ...(isParent
          ? {}
          : consentModalEntry.leadId
          ? { leadId: consentModalEntry.leadId }
          : {}),
        enabled: consentTargetEnabled,
        reason: evidence,
      });
      await load(true);
      setNotice(
        `Marketing consent ${
          consentTargetEnabled ? "recorded" : "withdrawn"
        } for ${consentModalEntry.email}.`
      );
      setConsentModalEntry(null);
      setConsentReason("");
    } catch (cause) {
      setConsentModalError(
        cause instanceof Error ? cause.message : "Consent could not be updated."
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const resetCampaignDraft = () => {
    setSubject("");
    setBody("");
    setReason("");
    setReviewed(false);
    setSendConfirm("");
    setRequestId("");
    setCampaignModalError("");
  };

  const submitCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || busyRef.current) return;
    if (!reviewed) {
      setCampaignModalError(
        "Confirm that you have reviewed the audience and message before sending."
      );
      return;
    }
    if (sendConfirm !== "SEND") {
      setCampaignModalError("Type SEND exactly to authorize this campaign.");
      return;
    }
    if (reason.trim().length < 5) {
      setCampaignModalError(
        "A campaign reason of at least five characters is required."
      );
      return;
    }
    if (recipientCount < 1) {
      setCampaignModalError("There are no consented contacts in this audience.");
      return;
    }
    const stableRequestId = requestId || makeRequestId();
    setRequestId(stableRequestId);
    busyRef.current = true;
    setBusy(true);
    setCampaignModalError("");
    setActionError("");
    setNotice("");
    try {
      const result = await postAction({
        action: "campaign",
        requestId: stableRequestId,
        subject: subject.trim(),
        body: body.trim(),
        audience: effectiveAudience,
        confirm: "SEND",
        reason: reason.trim(),
      });
      await load(true);
      resetCampaignDraft();
      setCampaignModalOpen(false);
      setActiveTab("campaigns");
      setNotice(
        `Campaign request accepted for ${result.recipients} eligible recipient${
          result.recipients === 1 ? "" : "s"
        }. Stored status is shown below.`
      );
    } catch (cause) {
      setCampaignModalError(
        cause instanceof Error
          ? cause.message
          : "Campaign could not be submitted. The same request ID is retained for a safe retry."
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleCancelCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cancelModalCampaign || busyRef.current) return;
    const why = cancelReason.trim();
    if (why.length < 5) {
      setCancelModalError(
        "A cancellation reason of at least five characters is required."
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setCancelModalError("");
    setActionError("");
    setNotice("");
    try {
      const result = await postAction({
        action: "cancel",
        id: cancelModalCampaign.id,
        reason: why,
      });
      await load(true);
      setCancelModalCampaign(null);
      setCancelReason("");
      setNotice(
        `Campaign cancellation recorded (${result.recipients} recipient${
          result.recipients === 1 ? "" : "s"
        } affected).`
      );
    } catch (cause) {
      setCancelModalError(
        cause instanceof Error
          ? cause.message
          : "Campaign could not be cancelled."
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <main className="cm-page">
        <div className="cm-shell">
          <div className="cm-skeleton" style={{ marginTop: 30 }} />
          <div className="cm-skeleton" style={{ marginTop: 15 }} />
        </div>
      </main>
    );
  }

  return (
    <main className="cm-page">
      <div className="cm-shell">
        <section className="cm-heading">
          <div>
            <h1>Consent &amp; campaigns</h1>
          </div>
          <div className="cm-links">
            <button
              type="button"
              className="cm-link"
              onClick={() => void load(true)}
              disabled={refreshing}
            >
              <RefreshCw size={14} /> {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            {canSend && (
              <button
                type="button"
                className="cm-btn primary"
                onClick={() => {
                  setCampaignModalError("");
                  setCampaignModalOpen(true);
                }}
              >
                <Plus size={14} /> New Campaign
              </button>
            )}
          </div>
        </section>

        {loadError && (
          <div className="cm-alert error" role="alert">
            {loadError}
            <button
              type="button"
              className="cm-btn"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        )}
        {actionError && (
          <div className="cm-alert error" role="alert">
            {actionError}
          </div>
        )}
        {notice && (
          <div className="cm-alert" role="status">
            <Check size={16} />
            {notice}
          </div>
        )}

        <div className="cm-banner">
          <span className="cm-banner-icon">
            <Mail size={17} />
          </span>
          <div>
            <strong>Email only · WhatsApp provider unavailable</strong>
            <span>
              Referral source and media-sharing consent are never treated as
              marketing permission.
            </span>
          </div>
        </div>

        {/* Audience summary cards for staff */}
        {!isParent && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            {!isSales && (
              <div className="cm-card" style={{ padding: "14px 16px" }}>
                <div className="cm-hint">Consented families</div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "var(--cm-teal)",
                    marginTop: 4,
                  }}
                >
                  {audienceCounts.families}
                </div>
              </div>
            )}
            <div className="cm-card" style={{ padding: "14px 16px" }}>
              <div className="cm-hint">Consented leads</div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: "var(--cm-teal)",
                  marginTop: 4,
                }}
              >
                {audienceCounts.leads}
              </div>
            </div>
            {isOwner && (
              <div className="cm-card" style={{ padding: "14px 16px" }}>
                <div className="cm-hint">All consented contacts</div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "var(--cm-teal)",
                    marginTop: 4,
                  }}
                >
                  {audienceCounts.all}
                </div>
              </div>
            )}
            {canSend && (
              <div className="cm-card" style={{ padding: "14px 16px" }}>
                <div className="cm-hint">Recorded campaigns</div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "var(--cm-ink)",
                    marginTop: 4,
                  }}
                >
                  {campaigns.length}
                </div>
              </div>
            )}
          </div>
        )}

        {isParent && (
          <div className="cm-note" style={{ marginBottom: 18 }}>
            <strong>Your choice is yours</strong>
            Only your own guardian marketing consent is shown and can be changed
            here. This action does not update a child&apos;s media-sharing
            preference.
          </div>
        )}

        {/* Primary Workspace Tabs */}
        {canSend && (
          <nav className="portal-tabs" aria-label="Communications sections">
            <button
              type="button"
              className={`portal-tab ${
                effectiveTab === "campaigns" ? "active" : ""
              }`}
              onClick={() => setActiveTab("campaigns")}
            >
              <Send size={14} /> Campaigns
              <span className="portal-tab-badge">{campaigns.length}</span>
            </button>
            <button
              type="button"
              className={`portal-tab ${
                effectiveTab === "consent" ? "active" : ""
              }`}
              onClick={() => setActiveTab("consent")}
            >
              <ShieldCheck size={14} /> Consent Directory
              <span className="portal-tab-badge">{directoryEntries.length}</span>
            </button>
          </nav>
        )}

        {/* TAB 1: Campaigns */}
        {effectiveTab === "campaigns" && canSend && (
          <section className="cm-card">
            <div className="cm-card-head">
              <div>
                <h2>Campaign history</h2>
                <p>
                  Stored status and delivery counts returned by the
                  communications service.
                </p>
              </div>
              <span className="cm-count">
                {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
              </span>
            </div>

            {campaigns.length ? (
              <div className="cm-list">
                {campaigns.map((campaign) => (
                  <article className="cm-row" key={campaign.id}>
                    <div style={{ minWidth: 0 }}>
                      <h3>{campaign.subject}</h3>
                      <p
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {campaign.body}
                      </p>
                      <div className="cm-row-meta">
                        <span
                          className={`cm-pill ${statusTone(campaign.status)}`}
                        >
                          {campaign.status.replaceAll("_", " ")}
                        </span>
                        <span className="cm-pill blue">
                          Created {niceDate(campaign.createdAt)}
                        </span>
                        <span className="cm-pill">
                          Queued {campaign.queued}
                        </span>
                        <span className="cm-pill">Sent {campaign.sent}</span>
                        <span
                          className={`cm-pill ${
                            campaign.failed ? "red" : ""
                          }`}
                        >
                          Failed {campaign.failed}
                        </span>
                        <span className="cm-pill">
                          Cancelled {campaign.cancelled}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        alignItems: "flex-end",
                        justifyContent: "flex-start",
                      }}
                    >
                      <button
                        type="button"
                        className="cm-btn"
                        onClick={() => setViewCampaign(campaign)}
                      >
                        <Eye size={13} /> View Message
                      </button>
                      {campaign.status.toLowerCase() === "queued" && (
                        <button
                          type="button"
                          className="cm-btn danger"
                          disabled={busy}
                          onClick={() => {
                            setCancelModalCampaign(campaign);
                            setCancelReason("");
                            setCancelModalError("");
                          }}
                        >
                          Cancel Campaign
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="cm-empty">
                <strong>No campaigns yet</strong>
                Use New Campaign above to prepare an email for consented
                recipients.
              </div>
            )}
          </section>
        )}

        {/* TAB 2: Unified Consent Directory */}
        {effectiveTab === "consent" && (
          <section className="cm-card">
            <div className="cm-card-head">
              <div>
                <h2>
                  {isParent
                    ? "Your marketing preference"
                    : "Consent Directory"}
                </h2>
                <p>
                  {isParent
                    ? "Change your own guardian marketing preference at any time."
                    : "Unified family and lead marketing consent records. Do not infer consent from referrals or media permission."}
                </p>
              </div>
              <span className="cm-count">
                {filteredDirectory.length} of {directoryEntries.length}
              </span>
            </div>

            {!isParent && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(
                    [
                      { id: "all", label: "All", count: directoryCounts.all },
                      {
                        id: "families",
                        label: "Families",
                        count: directoryCounts.families,
                      },
                      {
                        id: "leads",
                        label: "Leads",
                        count: directoryCounts.leads,
                      },
                      {
                        id: "missing",
                        label: "Missing Consent",
                        count: directoryCounts.missing,
                      },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      className={`portal-tab ${
                        consentFilter === pill.id ? "active" : ""
                      }`}
                      style={{ padding: "6px 11px", fontSize: 11.5 }}
                      onClick={() => setConsentFilter(pill.id)}
                    >
                      {pill.label}
                      <span className="portal-tab-badge">{pill.count}</span>
                    </button>
                  ))}
                </div>

                <div className="search" style={{ maxWidth: 280 }}>
                  <Search size={14} />
                  <input
                    type="search"
                    placeholder="Search name, email, or evidence…"
                    value={consentSearch}
                    onChange={(event) => setConsentSearch(event.target.value)}
                  />
                </div>
              </div>
            )}

            {filteredDirectory.length ? (
              <div className="cm-list">
                {filteredDirectory.map((entry) => (
                  <article className="cm-row" key={entry.key}>
                    <div className="pw-person-inline" style={{ minWidth: 0 }}>
                      <ProfileAvatar
                        profileId={entry.guardianId}
                        name={entry.displayName}
                        size={34}
                      />
                      <div style={{ minWidth: 0 }}>
                        <h3>
                          {entry.displayName}
                          {entry.displayName !== entry.email && (
                            <span className="cm-hint"> · {entry.email}</span>
                          )}
                        </h3>
                        <p>
                          {entry.kind === "family"
                            ? "Family contact"
                            : "Lead contact"}{" "}
                          · Updated {niceDate(entry.changedAt)}
                        </p>
                        <div className="cm-row-meta">
                          <span
                            className={`cm-pill ${entry.consent ? "" : "red"}`}
                          >
                            {entry.consent
                              ? "Marketing consented"
                              : "No marketing consent"}
                          </span>
                          <span className="cm-pill blue">
                            {entry.kind === "family" ? "Family" : "Lead"}
                          </span>
                          {entry.evidence && (
                            <span className="cm-pill">Evidence on file</span>
                          )}
                        </div>
                        {entry.evidence && (
                          <p style={{ marginTop: 7 }}>
                            Evidence: {entry.evidence}
                          </p>
                        )}
                      </div>
                    </div>

                    {entry.editable && (
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <button
                          type="button"
                          className="cm-btn"
                          disabled={busy}
                          onClick={() => openConsentModal(entry)}
                        >
                          Update Consent
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="cm-empty">
                <strong>
                  {isParent
                    ? "No guardian marketing preference returned"
                    : "No matching consent records"}
                </strong>
                {isParent
                  ? "Your authenticated profile may not have a marketing contact attached."
                  : "Try adjusting your filter or search query."}
              </div>
            )}
          </section>
        )}

        <footer className="cm-footer">
          <span>
            ProsperWork Music Concepts · live, account-scoped communications
          </span>
          <span>
            {snapshot
              ? `Signed in as ${
                  snapshot.profile.name || roleLabel(snapshot.profile.role)
                }`
              : "Communications"}
          </span>
        </footer>
      </div>

      {/* + New Campaign Modal */}
      <PortalModal
        open={campaignModalOpen}
        onClose={() => {
          if (!busy) setCampaignModalOpen(false);
        }}
        title="Prepare an Email Campaign"
        eyebrow="Consented Broadcast"
        subtitle="Only contacts with explicit, active marketing consent in the selected audience will receive this email."
        size="lg"
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="cm-btn"
              onClick={resetCampaignDraft}
              disabled={busy}
            >
              <X size={14} /> Reset draft
            </button>
            <button
              type="button"
              className="cm-btn"
              onClick={() => setCampaignModalOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-campaign-form"
              className="cm-btn primary"
              disabled={
                busy ||
                !reviewed ||
                !subject.trim() ||
                body.trim().length < 5 ||
                reason.trim().length < 5 ||
                sendConfirm !== "SEND" ||
                recipientCount < 1
              }
            >
              <Send size={14} />
              {busy ? "Submitting…" : "Send campaign"}
            </button>
          </>
        }
      >
        <form
          id="new-campaign-form"
          onSubmit={(event) => void submitCampaign(event)}
        >
          <div className="cm-recipient-summary">
            <Users size={14} />
            <strong>{recipientCount}</strong> eligible recipient
            {recipientCount === 1 ? "" : "s"} with recorded marketing consent
          </div>

          <div className="cm-form">
            <div className="cm-field">
              <label htmlFor="cm-audience">Audience</label>
              <select
                id="cm-audience"
                value={effectiveAudience}
                onChange={(event) =>
                  setAudience(event.target.value as Audience)
                }
                disabled={isSales}
              >
                {isSales ? (
                  <option value="leads">Your leads</option>
                ) : (
                  <>
                    <option value="families">Families</option>
                    <option value="leads">Leads</option>
                    {isOwner && (
                      <option value="all">All consented contacts</option>
                    )}
                  </>
                )}
              </select>
              <small>
                {isSales
                  ? "Sales campaigns are limited to your own leads returned by the server."
                  : "Audience size reflects consented contacts, not total profiles."}
              </small>
            </div>

            <div className="cm-field">
              <label htmlFor="cm-subject">Subject</label>
              <input
                id="cm-subject"
                required
                maxLength={160}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="A specific, useful subject"
              />
            </div>

            <div className="cm-field full">
              <label htmlFor="cm-body">Email message</label>
              <textarea
                id="cm-body"
                required
                minLength={5}
                maxLength={5000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write the message families or leads have explicitly agreed to receive."
              />
              <small>{body.length}/5000 characters</small>
            </div>

            <div className="cm-field full">
              <label htmlFor="cm-reason">Reason for sending</label>
              <textarea
                id="cm-reason"
                required
                minLength={5}
                maxLength={2000}
                style={{ minHeight: 70 }}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Campaign purpose and why this audience should receive it."
              />
            </div>
          </div>

          <label className="cm-send-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I have reviewed the audience and message.
          </label>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div className="cm-field" style={{ maxWidth: 220, flex: "1 1 180px" }}>
              <label htmlFor="cm-type-send">Type SEND to confirm</label>
              <input
                id="cm-type-send"
                value={sendConfirm}
                onChange={(event) => setSendConfirm(event.target.value)}
                autoComplete="off"
                placeholder="SEND"
              />
            </div>
            <span className="cm-hint" style={{ maxWidth: 400 }}>
              Retries retain the same request ID so duplicate campaigns are
              prevented automatically.
            </span>
          </div>

          {campaignModalError && (
            <div
              className="cm-alert error"
              role="alert"
              style={{ marginTop: 12, marginBottom: 0 }}
            >
              {campaignModalError}
            </div>
          )}
        </form>
      </PortalModal>

      {/* Update Consent Modal */}
      <PortalModal
        open={Boolean(consentModalEntry)}
        onClose={() => {
          if (!busy) setConsentModalEntry(null);
        }}
        title="Update Marketing Consent"
        eyebrow={consentModalEntry?.kind === "family" ? "Family Contact" : "Lead Contact"}
        subtitle={
          consentModalEntry
            ? `${consentModalEntry.displayName} (${consentModalEntry.email})`
            : undefined
        }
        size="sm"
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="cm-btn"
              onClick={() => setConsentModalEntry(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="update-consent-form"
              className={
                consentTargetEnabled ? "cm-btn primary" : "cm-btn danger"
              }
              disabled={busy || consentReason.trim().length < 5}
            >
              {busy
                ? "Saving…"
                : consentTargetEnabled
                ? "Record Consent"
                : "Withdraw Consent"}
            </button>
          </>
        }
      >
        <form
          id="update-consent-form"
          onSubmit={(event) => void handleSaveConsent(event)}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <button
              type="button"
              className={`portal-tab ${consentTargetEnabled ? "active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setConsentTargetEnabled(true)}
            >
              Grant Marketing Consent
            </button>
            <button
              type="button"
              className={`portal-tab ${!consentTargetEnabled ? "active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setConsentTargetEnabled(false)}
            >
              Withdraw Consent
            </button>
          </div>

          <div className="cm-field">
            <label htmlFor="consent-modal-reason">
              {isParent
                ? "Reason for changing this preference (5+ chars)"
                : "Explicit consent evidence & date (5+ chars)"}
            </label>
            <textarea
              id="consent-modal-reason"
              required
              minLength={5}
              maxLength={2000}
              value={consentReason}
              onChange={(event) => setConsentReason(event.target.value)}
              placeholder={
                isParent
                  ? "e.g. Updating my marketing email preference"
                  : "e.g. Written opt-in captured on inquiry form on 2026-11-18"
              }
            />
            <small>
              Referrals or child media permission never qualify as marketing
              consent.
            </small>
          </div>

          {consentModalError && (
            <div
              className="cm-alert error"
              role="alert"
              style={{ marginTop: 12, marginBottom: 0 }}
            >
              {consentModalError}
            </div>
          )}
        </form>
      </PortalModal>

      {/* Cancel Queued Campaign Modal */}
      <PortalModal
        open={Boolean(cancelModalCampaign)}
        onClose={() => {
          if (!busy) setCancelModalCampaign(null);
        }}
        title="Cancel Queued Campaign"
        eyebrow="Stop Delivery"
        subtitle={cancelModalCampaign?.subject}
        size="sm"
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="cm-btn"
              onClick={() => setCancelModalCampaign(null)}
              disabled={busy}
            >
              Keep Campaign
            </button>
            <button
              type="submit"
              form="cancel-campaign-form"
              className="cm-btn danger"
              disabled={busy || cancelReason.trim().length < 5}
            >
              {busy ? "Cancelling…" : "Confirm Cancellation"}
            </button>
          </>
        }
      >
        <form
          id="cancel-campaign-form"
          onSubmit={(event) => void handleCancelCampaign(event)}
        >
          <div className="cm-field">
            <label htmlFor="cancel-campaign-reason">
              Cancellation reason (5+ characters required)
            </label>
            <textarea
              id="cancel-campaign-reason"
              required
              minLength={5}
              maxLength={2000}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Explain why this queued campaign is being stopped…"
            />
          </div>
          {cancelModalError && (
            <div
              className="cm-alert error"
              role="alert"
              style={{ marginTop: 12, marginBottom: 0 }}
            >
              {cancelModalError}
            </div>
          )}
        </form>
      </PortalModal>

      {/* View Full Campaign Message Modal */}
      <PortalModal
        open={Boolean(viewCampaign)}
        onClose={() => setViewCampaign(null)}
        title={viewCampaign?.subject || "Campaign Message"}
        eyebrow="Campaign Record"
        subtitle={
          viewCampaign ? `Created ${niceDate(viewCampaign.createdAt)}` : undefined
        }
        size="md"
        footer={
          <button
            type="button"
            className="cm-btn"
            onClick={() => setViewCampaign(null)}
          >
            Close
          </button>
        }
      >
        {viewCampaign && (
          <>
            <div className="cm-row-meta" style={{ marginTop: 0 }}>
              <span className={`cm-pill ${statusTone(viewCampaign.status)}`}>
                {viewCampaign.status.replaceAll("_", " ")}
              </span>
              <span className="cm-pill">Queued {viewCampaign.queued}</span>
              <span className="cm-pill">Sent {viewCampaign.sent}</span>
              <span className={`cm-pill ${viewCampaign.failed ? "red" : ""}`}>
                Failed {viewCampaign.failed}
              </span>
              <span className="cm-pill">Cancelled {viewCampaign.cancelled}</span>
            </div>
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 10,
                border: "1px solid var(--cm-line)",
                background: "#fffefa",
                fontSize: 13,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "50vh",
                overflowY: "auto",
              }}
            >
              {viewCampaign.body}
            </div>
          </>
        )}
      </PortalModal>
    </main>
  );
}
