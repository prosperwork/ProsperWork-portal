"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { operationsAction } from "@/lib/academy/operations";
import { useCurrencies } from "@/lib/academy/use-currencies";
import { readJson, apiErrorMessage } from "@/lib/academy/web-client";
import { useConfirmModal } from "@/app/_components/ConfirmModal";
import OperationsExtras from "./OperationsExtras";
import OpsFinanceView from "./views/OpsFinanceView";
import OpsAcademyView from "./views/OpsAcademyView";
import OpsTeamView from "./views/OpsTeamView";
import OpsLeadsView from "./views/OpsLeadsView";
import OpsRecordsView from "./views/OpsRecordsView";
import { type OperationsData, type OperationsView } from "./ops-types";

const validViews: OperationsView[] = [
  "finance",
  "academy",
  "team",
  "leads",
  "records",
  "referrals",
  "media",
];

export default function OperationsPage() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedView, setSelectedView] = useState<OperationsView>("finance");
  const didInitTabRef = useRef(false);

  const { confirm, ConfirmDialog } = useConfirmModal();
  const { currencies: currencyRows } = useCurrencies();
  const currencies = useMemo(
    () => currencyRows.map((c) => c.code),
    [currencyRows]
  );

  // Read initial ?tab= query param on mount
  useEffect(() => {
    if (didInitTabRef.current || typeof window === "undefined") return;
    didInitTabRef.current = true;
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param && validViews.includes(param as OperationsView)) {
      setSelectedView(param as OperationsView);
    }
  }, []);

  const selectView = useCallback((viewId: OperationsView) => {
    setSelectedView(viewId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", viewId);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  const load = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/operations", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const result = await readJson<Record<string, unknown>>(response);
      if (response.status === 401) {
        window.location.assign("/login");
        return null;
      }
      if (response.status === 403) {
        setData(null);
        setError("You do not have permission to view operations.");
        return null;
      }
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(
            result,
            response.status,
            "Operations could not be loaded"
          )
        );
      }
      if (typeof result.error === "string" && result.error.trim()) {
        throw new Error(result.error);
      }
      const payload = (
        result.data && typeof result.data === "object" ? result.data : result
      ) as OperationsData;
      setData(payload);
      return payload;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Operations could not be loaded."
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

  const role = data?.profile.role ?? "";
  const profileId = data?.profile.id ?? "";
  const isActive = data?.profile.status === "active";
  const isOwner = role === "super_admin" || role === "owner";
  const perms = useMemo(
    () => new Set(data?.profile.permissions ?? []),
    [data?.profile?.permissions]
  );

  const isHead = role === "head_admin" || perms.has("workspace.management");
  const isAdmin =
    role === "admin" ||
    perms.has("workspace.operations") ||
    perms.has("workspace.schedule");
  const isFinance = role === "finance" || perms.has("workspace.finance");
  const isTeacher =
    role === "teacher" ||
    data?.profile.department === "Music Education" ||
    role.includes("teacher") ||
    perms.has("workspace.learning");
  const isQc = role === "qc" || perms.has("reports.learning");
  const isSales = role === "sales_marketing" || perms.has("workspace.leads");
  const isSocial =
    role === "social_media" || isOwner || perms.has("workspace.curriculum");

  const canBilling = isOwner || isFinance || perms.has("workspace.finance");
  const canSchedule =
    isOwner ||
    isHead ||
    isAdmin ||
    isTeacher ||
    isQc ||
    perms.has("workspace.schedule");
  const canAvailability =
    isOwner ||
    isTeacher ||
    isQc ||
    isAdmin ||
    isHead ||
    perms.has("workspace.schedule");
  const canReadQuality =
    isOwner || isHead || isQc || isTeacher || perms.has("reports.learning");
  const canObserve = isOwner || isQc || perms.has("reports.learning");
  const canReadLeads =
    isOwner || isHead || isSales || perms.has("workspace.leads");
  const canTrial =
    isOwner || isHead || isSales || perms.has("workspace.leads");
  const canAssignLeads = isOwner || isHead || perms.has("workspace.leads");
  const canConvert = isOwner || isHead || perms.has("workspace.leads");
  const canSeeEvents =
    isOwner ||
    isHead ||
    isFinance ||
    isAdmin ||
    perms.has("workspace.operations");

  const views = useMemo(() => {
    const list: { id: OperationsView; title: string; count?: number }[] = [];
    if (canBilling) {
      list.push({
        id: "finance",
        title: "Finance",
        count: data?.contracts.filter((c) => c.active).length,
      });
    }
    if (canSchedule) {
      list.push({
        id: "academy",
        title: "Academy",
        count: data?.series.length,
      });
    }
    if (canAvailability || canReadQuality) {
      list.push({ id: "team", title: "Team" });
    }
    if (canReadLeads) {
      list.push({
        id: "leads",
        title: "Leads",
        count: data?.leads.filter((l) => !l.converted_at).length,
      });
    }
    if (canBilling || canSeeEvents) {
      list.push({ id: "records", title: "Records" });
    }
    if (isOwner || isFinance || isSales || role === "parent") {
      list.push({
        id: "referrals",
        title: "Referrals",
        count: data?.referrals?.length,
      });
    }
    if (isSocial || isTeacher || isQc || isAdmin || isHead) {
      list.push({
        id: "media",
        title: "Media Studio",
        count: data?.media?.length,
      });
    }
    return list;
  }, [
    canBilling,
    canSchedule,
    canAvailability,
    canReadQuality,
    canReadLeads,
    canSeeEvents,
    isOwner,
    isFinance,
    isSales,
    isSocial,
    isTeacher,
    isQc,
    isAdmin,
    isHead,
    role,
    data?.contracts,
    data?.series,
    data?.leads,
    data?.referrals,
    data?.media,
  ]);

  const activeView = useMemo(() => {
    if (views.some((view) => view.id === selectedView)) return selectedView;
    return views[0]?.id ?? "finance";
  }, [views, selectedView]);

  const activeStudents = useMemo(
    () =>
      (data?.students ?? []).filter(
        (student) => student.payload.status === "active"
      ),
    [data?.students]
  );
  const activeTeachers = useMemo(
    () =>
      (data?.staff ?? []).filter(
        (person) =>
          (person.department === "Music Education" ||
            ["teacher", "qc"].includes(person.role) ||
            person.role.includes("teacher") ||
            person.role.includes("tutor")) &&
          person.status === "active"
      ),
    [data?.staff]
  );
  const activeAdmins = useMemo(
    () =>
      (data?.staff ?? []).filter(
        (person) =>
          (["admin", "head_admin"].includes(person.role) ||
            (person.department !== "Music Education" &&
              person.role !== "parent" &&
              person.role !== "student")) &&
          person.status === "active"
      ),
    [data?.staff]
  );
  const activeSales = useMemo(
    () =>
      (data?.staff ?? []).filter(
        (person) =>
          (person.role === "sales_marketing" ||
            person.role.includes("sales") ||
            person.role.includes("marketing")) &&
          person.status === "active"
      ),
    [data?.staff]
  );
  const sortedLeads = useMemo(
    () => [...(data?.leads ?? [])].sort((a, b) => b.ageMinutes - a.ageMinutes),
    [data?.leads]
  );
  const visibleQuality = useMemo(
    () =>
      isTeacher
        ? (data?.quality ?? []).filter((item) => item.staffId === profileId)
        : data?.quality ?? [],
    [data?.quality, isTeacher, profileId]
  );
  const visibleObservations = useMemo(
    () =>
      isTeacher
        ? (data?.observations ?? []).filter(
            (item) => item.staff_id === profileId
          )
        : data?.observations ?? [],
    [data?.observations, isTeacher, profileId]
  );
  const visibleAvailability = useMemo(
    () =>
      isOwner
        ? data?.availability ?? []
        : (data?.availability ?? []).filter(
            (item) => item.staff_id === profileId
          ),
    [data?.availability, isOwner, profileId]
  );

  const submitAction = async (
    action: unknown,
    label: string
  ): Promise<boolean> => {
    if (busy) return false;
    if (!isActive) {
      setActionError("Only active profiles may write to Operations.");
      return false;
    }
    const parsed = operationsAction.safeParse(action);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setActionError(
        issue
          ? `${issue.path.join(".") || "Action"}: ${issue.message}`
          : "Check the form details."
      );
      return false;
    }
    setBusy(parsed.data.action);
    setActionError("");
    setNotice("");
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await readJson<Record<string, unknown>>(response);
      if (response.status === 401) {
        window.location.assign("/login");
        return false;
      }
      if (response.status === 403) setData(null);
      if (!response.ok || result.ok !== true) {
        throw new Error(
          apiErrorMessage(result, response.status, "Operations request failed")
        );
      }
      const fresh = await load(true);
      if (!fresh) {
        throw new Error(
          "The server accepted the action, but refreshed records could not be loaded. Reload to confirm before retrying."
        );
      }
      setNotice(label);
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The operation could not be saved."
      );
      return false;
    } finally {
      setBusy("");
    }
  };

  const showAnySection = views.length > 0;

  return (
    <main className="ops-page">
      <div className="ops-shell">
        {error && (
          <div className="ops-notice ops-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button
              className="ops-btn"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        )}
        {actionError && (
          <div className="ops-notice ops-error" role="alert">
            <AlertCircle size={16} />
            <span>{actionError}</span>
          </div>
        )}
        {notice && (
          <div className="ops-notice" role="status">
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </div>
        )}

        {loading && !data ? (
          <div className="ops-grid">
            <div className="ops-section span-12">
              <div className="ops-skeleton" />
              <div className="ops-skeleton" />
            </div>
          </div>
        ) : (
          data && (
            <>
              <div className="ops-page-heading">
                <h1>Operations</h1>
                <button
                  className="ops-btn"
                  type="button"
                  onClick={() => void load(true)}
                  disabled={refreshing}
                >
                  <RefreshCw size={14} />
                  {refreshing ? "Refreshing…" : "Refresh records"}
                </button>
              </div>

              {!isActive && (
                <div className="ops-notice ops-error" role="status">
                  <ShieldCheck size={16} />
                  <span>
                    This profile is read-only. Write controls require an active
                    staff profile.
                  </span>
                </div>
              )}

              {!showAnySection && (
                <div className="ops-section">
                  <div className="ops-empty">
                    <strong>No operations sections for this role</strong>
                    The service did not grant an operations workspace to this
                    profile.
                  </div>
                </div>
              )}

              {showAnySection && (
                <nav
                  className="portal-tabs"
                  aria-label="Operations work areas"
                >
                  {views.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      className={`portal-tab ${
                        activeView === view.id ? "active" : ""
                      }`}
                      aria-current={activeView === view.id ? "page" : undefined}
                      onClick={() => selectView(view.id)}
                    >
                      {view.title}
                      {typeof view.count === "number" && (
                        <span className="portal-tab-badge">{view.count}</span>
                      )}
                    </button>
                  ))}
                </nav>
              )}

              {(activeView === "finance" ||
                activeView === "academy" ||
                activeView === "team" ||
                activeView === "leads" ||
                activeView === "records") && (
                <div
                  className="ops-grid"
                  data-portal-layout="operations-workspace"
                >
                  {activeView === "finance" && (
                    <OpsFinanceView
                      data={data}
                      activeStudents={activeStudents}
                      isActive={isActive}
                      isOwner={isOwner}
                      canBilling={canBilling}
                      currencies={currencies}
                      busy={busy}
                      submitAction={submitAction}
                      confirm={confirm}
                    />
                  )}

                  {activeView === "academy" && (
                    <OpsAcademyView
                      data={data}
                      activeStudents={activeStudents}
                      activeTeachers={activeTeachers}
                      activeAdmins={activeAdmins}
                      isActive={isActive}
                      isOwner={isOwner}
                      isHead={isHead}
                      canSchedule={canSchedule}
                      busy={busy}
                      submitAction={submitAction}
                      confirm={confirm}
                    />
                  )}

                  {activeView === "team" && (
                    <OpsTeamView
                      data={data}
                      visibleAvailability={visibleAvailability}
                      visibleQuality={visibleQuality}
                      visibleObservations={visibleObservations}
                      isActive={isActive}
                      isOwner={isOwner}
                      canAvailability={canAvailability}
                      canReadQuality={canReadQuality}
                      canObserve={canObserve}
                      busy={busy}
                      submitAction={submitAction}
                      confirm={confirm}
                    />
                  )}

                  {activeView === "leads" && (
                    <OpsLeadsView
                      data={data}
                      sortedLeads={sortedLeads}
                      activeStudents={activeStudents}
                      activeTeachers={activeTeachers}
                      activeAdmins={activeAdmins}
                      activeSales={activeSales}
                      isActive={isActive}
                      canReadLeads={canReadLeads}
                      canTrial={canTrial}
                      canAssignLeads={canAssignLeads}
                      canConvert={canConvert}
                      busy={busy}
                      submitAction={submitAction}
                      confirm={confirm}
                    />
                  )}

                  {activeView === "records" && (
                    <OpsRecordsView
                      data={data}
                      isOwner={isOwner}
                      profileId={profileId}
                      canBilling={canBilling}
                      canSeeEvents={canSeeEvents}
                    />
                  )}
                </div>
              )}

              {activeView === "referrals" && (
                <OperationsExtras
                  data={data}
                  students={data.students}
                  view="referrals"
                  onRefresh={() => load(true)}
                />
              )}

              {activeView === "media" && (
                <OperationsExtras
                  data={data}
                  students={data.students}
                  view="media"
                  onRefresh={() => load(true)}
                />
              )}
            </>
          )
        )}
      </div>
      <ConfirmDialog />
    </main>
  );
}
