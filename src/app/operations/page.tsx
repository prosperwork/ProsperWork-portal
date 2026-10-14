"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function OperationsPage() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedView, setSelectedView] = useState<OperationsView>("finance");

  const { confirm, ConfirmDialog } = useConfirmModal();
  const { currencies: currencyRows } = useCurrencies();
  const currencies = useMemo(
    () =>
      currencyRows.length
        ? currencyRows.map((c) => c.code)
        : ["NGN", "USD", "GBP", "EUR", "CAD"],
    [currencyRows]
  );

  const load = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/operations", {
        method: "GET",
        credentials: "include",
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
  const isOwner = role === "super_admin";
  const isHead = role === "head_admin";
  const isAdmin = role === "admin";
  const isFinance = role === "finance";
  const isTeacher = role === "teacher";
  const isQc = role === "qc";
  const isSales = role === "sales_marketing";
  const isSocial = role === "social_media" || isOwner;

  const canBilling = isOwner || isFinance;
  const canSchedule = isOwner || isHead || isAdmin || isTeacher || isQc;
  const canAvailability = isOwner || isTeacher || isQc || isAdmin || isHead;
  const canReadQuality = isOwner || isHead || isQc || isTeacher;
  const canObserve = isOwner || isQc;
  const canReadLeads = isOwner || isHead || isSales;
  const canTrial = isOwner || isHead || isSales;
  const canAssignLeads = isOwner || isHead;
  const canConvert = isOwner || isHead;
  const canSeeEvents = isOwner || isHead || isFinance || isAdmin;

  const views = useMemo(() => {
    const list: { id: OperationsView; title: string }[] = [];
    if (canBilling) list.push({ id: "finance", title: "Finance" });
    if (canSchedule) list.push({ id: "academy", title: "Academy" });
    if (canAvailability || canReadQuality)
      list.push({ id: "team", title: "Team" });
    if (canReadLeads) list.push({ id: "leads", title: "Leads" });
    if (canBilling || canSeeEvents)
      list.push({ id: "records", title: "Records" });
    if (isOwner || isFinance || isSales)
      list.push({ id: "referrals", title: "Referrals" });
    if (isSocial || isTeacher || isQc || isAdmin || isHead)
      list.push({ id: "media", title: "Media Studio" });
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
          ["teacher", "qc"].includes(person.role) && person.status === "active"
      ),
    [data?.staff]
  );
  const activeAdmins = useMemo(
    () =>
      (data?.staff ?? []).filter(
        (person) =>
          ["admin", "head_admin"].includes(person.role) &&
          person.status === "active"
      ),
    [data?.staff]
  );
  const activeSales = useMemo(
    () =>
      (data?.staff ?? []).filter(
        (person) =>
          person.role === "sales_marketing" && person.status === "active"
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
      const fresh = await load();
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
    <main className="pw-ops ops-page">
      <div className="ops-main ops-shell">
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
                <nav className="ops-tabs" aria-label="Operations work areas">
                  {views.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      className={`ops-tab ${
                        activeView === view.id ? "active" : ""
                      }`}
                      aria-current={activeView === view.id ? "page" : undefined}
                      onClick={() => setSelectedView(view.id)}
                    >
                      {view.title}
                    </button>
                  ))}
                </nav>
              )}

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
            </>
          )
        )}

        {canBilling &&
          data?.contracts.some((c) => c.active && c.billing_hold) && (
            <section
              hidden={activeView !== "finance"}
              className="ops-inline-summary"
            >
              <h2>Billing review after a pause</h2>
              <p>
                Held contracts do not back-charge paused months. Agree the
                resume date before generating invoices.
              </p>
            </section>
          )}

        {data && (
          <>
            <div hidden={activeView !== "referrals"}>
              <OperationsExtras
                data={data}
                students={data.students}
                view="referrals"
              />
            </div>
            <div hidden={activeView !== "media"}>
              <OperationsExtras
                data={data}
                students={data.students}
                view="media"
              />
            </div>
          </>
        )}
      </div>
      <ConfirmDialog />
    </main>
  );
}
