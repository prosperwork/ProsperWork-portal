"use client";

import CurrencySelect from "@/lib/academy/CurrencySelect";
import { PortalModal } from "@/app/_components/PortalModal";
import ProfileAvatar from "@/app/_components/ProfileAvatar";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  Check,
  Clock3,
  FileCheck2,
  FileText,
  History,
  Landmark,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";
import { readJson } from "@/lib/academy/web-client";
import {
  dateLabel,
  isHRRole,
  isOwnerRole,
  isPayrollRole,
  label,
  money,
  type BankDetails,
  type Batch,
  type ModalState,
  type PayrollData,
  type PreviewStatement,
  type RateDraft,
  type Staff,
  type Statement,
  type Tab,
} from "./payroll-types";
import PayrollBatchesSection, {
  renderHistoricalStatementItem,
  renderPayrollItems,
} from "./components/PayrollBatchesSection";
import PayrollRatesSection, {
  RateInputs,
  applyRoleDefaultsToRateDraft,
} from "./components/PayrollRatesSection";
import PayrollAdjustmentModal from "./components/PayrollAdjustmentModal";

const pad = (n: number) => String(n).padStart(2, "0");
function targetMonth() {
  const now = new Date();
  const month = new Date(
    now.getFullYear(),
    now.getMonth() + (now.getDate() > 28 ? 1 : 0),
    1
  );
  return `${month.getFullYear()}-${pad(month.getMonth() + 1)}`;
}
function nextFuture28th() {
  const current = new Date();
  const month = new Date(
    current.getFullYear(),
    current.getMonth() + (current.getDate() >= 28 ? 1 : 0),
    28
  );
  return `${month.getFullYear()}-${pad(month.getMonth() + 1)}-28`;
}
function payDateForMonth(month: string) {
  return `${month}-28`;
}

const emptyRateDraft: RateDraft = {
  staffId: "",
  effectiveFrom: "",
  currency: "",
  monthlyStudentRate: "",
  trialRate: "",
  coverRate: "",
  baseSalary: "",
  adminExtraParentRate: "",
  adminQuota: "",
  advanceEligible: false,
  reason: "",
  initialAgreed: false,
  managementFirstPeriod: "",
};

function BankModalContent({
  profileId,
  profileName,
  initialStaffId,
  staff,
  ownOnly,
  initialOnly,
  pending,
  onSave,
  onDone,
}: {
  profileId: string | number;
  profileName: string;
  initialStaffId?: string;
  staff: Staff[];
  ownOnly: boolean;
  initialOnly: boolean;
  pending: boolean;
  onSave: (
    action: Record<string, unknown>,
    successText: string,
    sensitive?: boolean
  ) => Promise<{ ok: boolean; errorMessage?: string }>;
  onDone: () => void;
}) {
  const [staffId, setStaffId] = useState(
    ownOnly ? String(profileId) : initialStaffId || String(profileId)
  );
  const [currency, setCurrency] = useState("");
  const [bank, setBank] = useState<BankDetails | null>(null);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    bank_name: "",
    account_name: "",
    account_number: "",
    routing_code: "",
  });

  const selectedStaffName =
    staff.find((person) => String(person.id) === staffId)?.name ||
    (staffId === String(profileId) ? profileName : "Selected staff");
  const canEdit = !initialOnly || !bank;

  function clearSensitive() {
    setBank(null);
    setVisible(false);
    setEditing(false);
    setDraft({
      bank_name: "",
      account_name: "",
      account_number: "",
      routing_code: "",
    });
    setError("");
  }

  async function revealBank() {
    if (!staffId || !/^[A-Za-z]{3}$/.test(currency.trim())) {
      setError(
        "Choose a staff member and enter a three-letter currency code to check that specific instruction."
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        bankStaffId: staffId,
        currency: currency.trim().toUpperCase(),
      });
      const response = await fetch(`/api/payroll?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const result = await readJson<{
        bank?: BankDetails | null;
        error?: string;
      }>(response);
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok)
        throw new Error(
          "This bank instruction is unavailable. Check access and try again."
        );
      const saved = (result.bank ?? null) as BankDetails | null;
      setBank(saved);
      setVisible(true);
      setEditing(!saved);
      if (saved)
        setDraft({
          bank_name: saved.bank_name,
          account_name: saved.account_name,
          account_number: saved.account_number,
          routing_code: saved.routing_code,
        });
      else
        setDraft({
          bank_name: "",
          account_name: "",
          account_number: "",
          routing_code: "",
        });
    } catch {
      setError(
        "This bank instruction is unavailable. Check access and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || !currency) return;
    setBusy(true);
    setError("");
    const result = await onSave(
      {
        action: "bank",
        staffId,
        bankName: draft.bank_name.trim(),
        accountName: draft.account_name.trim(),
        accountNumber: draft.account_number,
        routingCode: draft.routing_code.trim(),
        currency: currency.trim().toUpperCase(),
      },
      "Bank details saved and payroll reloaded.",
      true
    );
    setBusy(false);
    if (result.ok) {
      clearSensitive();
      onDone();
    } else if (result.errorMessage) {
      setError(result.errorMessage);
    }
  }

  return (
    <div className="pr-form">
      {!ownOnly && (
        <label className="pr-field">
          <span>Staff member</span>
          <select
            value={staffId}
            onChange={(event) => {
              setStaffId(event.target.value);
              clearSensitive();
            }}
          >
            <option value="">Select staff</option>
            {!staff.some(
              (person) => String(person.id) === String(profileId)
            ) && (
              <option value={profileId}>{profileName} · your account</option>
            )}
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {label(person.role)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="pr-field">
        <span>Currency</span>
        <CurrencySelect
          value={currency}
          onChange={(value) => {
            setCurrency(value);
            clearSensitive();
          }}
          required
        />
      </label>
      <div className="pr-action-row">
        <button
          type="button"
          className="pr-button secondary"
          onClick={() => void revealBank()}
          disabled={busy || pending || (!ownOnly && !staffId)}
        >
          <ShieldCheck size={13} />
          {busy ? "Checking…" : "Reveal this currency’s details"}
        </button>
        {visible && (
          <button
            type="button"
            className="pr-button outline"
            onClick={clearSensitive}
          >
            Hide &amp; clear details
          </button>
        )}
      </div>
      {error && (
        <div className="pr-alert" role="alert" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
      {visible && bank && !editing && (
        <div className="pr-bank-reveal" aria-live="polite">
          <div>
            <small>Staff</small>
            <strong>{selectedStaffName}</strong>
          </div>
          <div>
            <small>Currency</small>
            <strong>{bank.currency}</strong>
          </div>
          <div>
            <small>Bank</small>
            <strong>{bank.bank_name}</strong>
          </div>
          <div>
            <small>Account name</small>
            <strong>{bank.account_name}</strong>
          </div>
          <div>
            <small>Account number</small>
            <strong className="pr-sensitive-value">{bank.account_number}</strong>
          </div>
          <div>
            <small>Routing / sort code</small>
            <strong>{bank.routing_code}</strong>
          </div>
          {canEdit ? (
            <button
              type="button"
              className="pr-button outline small"
              onClick={() => {
                setDraft({
                  bank_name: bank.bank_name,
                  account_name: bank.account_name,
                  account_number: bank.account_number,
                  routing_code: bank.routing_code,
                });
                setEditing(true);
              }}
            >
              Edit this instruction
            </button>
          ) : (
            <p className="pr-subtitle">
              HR and QC can add initial instructions only. An owner, Finance, or
              the account holder can make changes.
            </p>
          )}
        </div>
      )}
      {visible && !bank && (
        <div className="pr-side-note" role="status">
          <strong>No instruction returned for {currency.toUpperCase()}</strong>
          Add the initial receiving details below. The response is for this
          currency only.
        </div>
      )}
      {visible && editing && canEdit && (
        <form
          className="pr-form pr-bank-form"
          onSubmit={saveBank}
          autoComplete="off"
        >
          <p className="pr-subtitle">
            {bank
              ? "Update the revealed instruction. Saving replaces the record for this currency."
              : `Add the initial ${currency.toUpperCase()} receiving instruction for ${selectedStaffName}.`}
          </p>
          <label className="pr-field">
            <span>Bank name</span>
            <input
              required
              value={draft.bank_name}
              onChange={(event) =>
                setDraft({ ...draft, bank_name: event.target.value })
              }
              autoComplete="off"
            />
          </label>
          <label className="pr-field">
            <span>Account name</span>
            <input
              required
              value={draft.account_name}
              onChange={(event) =>
                setDraft({ ...draft, account_name: event.target.value })
              }
              autoComplete="off"
            />
          </label>
          <label className="pr-field">
            <span>Account number</span>
            <input
              required
              inputMode="numeric"
              autoComplete="new-password"
              value={draft.account_number}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  account_number: event.target.value,
                })
              }
            />
          </label>
          <label className="pr-field">
            <span>Routing / sort code</span>
            <input
              required
              autoComplete="off"
              value={draft.routing_code}
              onChange={(event) =>
                setDraft({ ...draft, routing_code: event.target.value })
              }
            />
          </label>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              className="pr-button outline"
              type="button"
              onClick={clearSensitive}
              disabled={busy}
            >
              Cancel &amp; clear
            </button>
            <button
              className="pr-button"
              type="submit"
              disabled={busy || pending}
            >
              {busy || pending ? "Saving…" : "Save private bank instruction"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function PayrollPage() {
  const [data, setData] = useState<PayrollData | null>(null);
  const [month, setMonth] = useState(targetMonth);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);

  // Decision modal (scoped error so stale errors never leak)
  const [modal, setModal] = useState<ModalState>(null);
  const [modalReason, setModalReason] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");

  // Scoped dialog modals (zero tab-teleportation, no giant sidebars)
  const [dialogError, setDialogError] = useState("");
  const [bankModal, setBankModal] = useState<{
    open: boolean;
    staffId?: string;
  }>({ open: false });
  const [initialRateModalOpen, setInitialRateModalOpen] = useState(false);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [paidModalOpen, setPaidModalOpen] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);

  const [rateForm, setRateForm] = useState<RateDraft>(emptyRateDraft);
  const [courseForm, setCourseForm] = useState({
    studentId: "",
    startDate: "",
    effectiveFrom: "",
    weeklyFrequency: "1",
    mode: "initial" as "initial" | "frequency_change",
  });
  const [adjustForm, setAdjustForm] = useState<{
    statementId: string;
    kind: "bonus" | "deduction" | "loan_deduction";
    amount: string;
    reason: string;
  }>({ statementId: "", kind: "bonus", amount: "", reason: "" });
  const [paidForm, setPaidForm] = useState({
    statementId: "",
    transferReference: "",
    confirmed: false,
  });
  const [adminSnapshotForm, setAdminSnapshotForm] = useState({
    staffId: "",
    activeParents: "",
    reason: "",
    confirmed: false,
  });

  const role = data?.profile.role || "";
  const perms = data?.profile.permissions ?? [];
  const payrollAccess = isPayrollRole(role, perms);
  const owner = isOwnerRole(role);
  const hrAccess = isHRRole(role, perms);
  const isFinanceTeam =
    role === "finance" ||
    owner ||
    perms.includes("workspace.finance") ||
    perms.includes("workspace.payroll");
  const payDate = payDateForMonth(month);

  const load = useCallback(
    async (quiet = false): Promise<boolean> => {
      if (!quiet) setLoading(true);
      setError("");
      setDenied(false);
      try {
        const response = await fetch(
          `/api/payroll?payDate=${encodeURIComponent(payDateForMonth(month))}`,
          { method: "GET", credentials: "include", cache: "no-store" }
        );
        const result = await readJson<Partial<PayrollData> & { error?: string }>(
          response
        );
        if (response.status === 401) {
          window.location.assign("/login");
          return false;
        }
        if (!response.ok) {
          if (response.status === 403) setDenied(true);
          throw new Error(
            result.error ||
              (response.status === 403
                ? "Payroll access is restricted for this account."
                : "Payroll could not be loaded.")
          );
        }
        setData(result as PayrollData);
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Payroll could not be loaded."
        );
        return false;
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [month]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const currentPreview = data?.preview;
  const ownCurrent = currentPreview?.statements ?? [];
  const allHistorical = useMemo(() => {
    if (!data) return [];
    return data.batches.flatMap((batch) =>
      batch.statements.map((statement) => ({ ...statement, batch }))
    );
  }, [data]);
  const walletStatements = useMemo(() => {
    if (!data)
      return {
        historical: [] as (Statement & { batch: Batch })[],
        active: [] as PreviewStatement[],
      };
    const ownId = String(data.profile.id);
    const historical = allHistorical.filter(
      (item) => String(item.staff_id) === ownId
    );
    const active = ownCurrent.filter((item) => String(item.staffId) === ownId);
    return { historical, active };
  }, [allHistorical, data, ownCurrent]);
  const currencyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const statement of currentPreview?.statements ?? [])
      totals.set(
        statement.currency,
        (totals.get(statement.currency) ?? 0) + statement.net
      );
    return [...totals.entries()];
  }, [currentPreview]);

  const activeStaff =
    data?.staff.filter((staff) => staff.status === "active") ?? [];
  const directoryAdmins =
    data?.staff.filter(
      (staff) =>
        ["admin", "head_admin", "general_manager", "super_admin"].includes(
          staff.role
        ) ||
        (staff.department !== "Music Education" &&
          staff.role !== "parent" &&
          staff.role !== "student")
    ) ?? [];
  const draftStatements = useMemo(
    () => allHistorical.filter((item) => item.batch.status === "draft"),
    [allHistorical]
  );
  const unpaidApprovedStatements = useMemo(
    () =>
      allHistorical.filter(
        (item) =>
          item.batch.status === "approved" && !item.paid_at && item.net > 0
      ),
    [allHistorical]
  );
  const staffAwaitingInitialTerms = useMemo(
    () =>
      activeStaff.filter(
        (staff) =>
          !data?.rates.some((rate) => String(rate.staff_id) === String(staff.id))
      ),
    [activeStaff, data?.rates]
  );

  const selectedPayDateIsFuture =
    new Date(`${payDate}T00:00:00`).getTime() > Date.now();
  const selectedStatement = allHistorical.find(
    (item) => String(item.id) === adjustForm.statementId
  );
  const selectedPaidStatement = allHistorical.find(
    (item) => String(item.id) === paidForm.statementId
  );
  const courseHistory =
    data?.courses.filter(
      (course) => String(course.student_id) === courseForm.studentId
    ) ?? [];
  const selectedCourse = [...courseHistory].sort((a, b) =>
    b.effective_from.localeCompare(a.effective_from)
  )[0];
  const originalCourseStart =
    courseHistory.map((course) => course.start_date).sort()[0] || "";
  const canSubmitOnDate =
    new Date(`${payDate}T23:59:59`).getTime() <= Date.now();
  const canGenerate =
    !!data?.rulesConfigured &&
    !!currentPreview &&
    currentPreview.issues.length === 0 &&
    !pending;

  async function postAction(
    action: Record<string, unknown>,
    successText: string,
    sensitive = false
  ): Promise<{ ok: boolean; errorMessage?: string }> {
    if (pending) return { ok: false };
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/payroll", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const result = await readJson<{ ok?: boolean; error?: string }>(response);
      if (response.status === 409) {
        const refreshed = await load(true);
        const msg = refreshed
          ? sensitive
            ? "These private bank details changed elsewhere. The latest payroll data was reloaded; check the selected currency again."
            : result.error ||
              "This payroll record changed elsewhere. The latest revision has been reloaded; review it before retrying."
          : sensitive
            ? "Private bank details changed elsewhere and the latest payroll data could not be reloaded."
            : "This payroll record changed elsewhere, and its latest revision could not be reloaded. Refresh before taking another action.";
        return { ok: false, errorMessage: msg };
      }
      if (!response.ok || result.ok !== true)
        throw new Error(
          sensitive
            ? "Private bank details could not be saved. Review the form and try again."
            : result.error || "The payroll action was not confirmed."
        );
      const refreshed = await load(true);
      if (!refreshed) {
        return {
          ok: false,
          errorMessage:
            "The action was accepted, but payroll could not be reloaded to confirm it. Refresh before taking another action.",
        };
      }
      setNotice(successText);
      return { ok: true };
    } catch (cause) {
      const msg = sensitive
        ? "Private bank details could not be saved. Review the form and try again."
        : cause instanceof Error
          ? cause.message
          : "The payroll action could not be completed.";
      return { ok: false, errorMessage: msg };
    } finally {
      setPending(false);
    }
  }

  async function submitRate(
    event: FormEvent<HTMLFormElement>
  ): Promise<boolean> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || !data) return false;
    setDialogError("");
    const initial =
      (hrAccess && !payrollAccess) ||
      !data.rates.some((rate) => String(rate.staff_id) === rateForm.staffId);
    if (initial && !rateForm.initialAgreed) {
      setDialogError(
        "Confirm that this is the initial pay agreed with the assigned staff member."
      );
      return false;
    }
    if (
      !initial &&
      rateForm.effectiveFrom <= new Date().toISOString().slice(0, 10)
    ) {
      setDialogError(
        "A raise must have a future effective date. Past dates are only for recording initial agreed pay."
      );
      return false;
    }
    const policy = rateForm.managementFirstPeriod || "full_month";
    const action = {
      action: "propose_rate",
      staffId: rateForm.staffId,
      effectiveFrom: rateForm.effectiveFrom,
      currency: rateForm.currency.trim().toUpperCase(),
      monthlyStudentRate: Number(rateForm.monthlyStudentRate || 0),
      trialRate: Number(rateForm.trialRate || 0),
      coverRate: Number(rateForm.coverRate || 0),
      baseSalary: Number(rateForm.baseSalary || 0),
      adminExtraParentRate: Number(rateForm.adminExtraParentRate || 0),
      adminQuota: Number(rateForm.adminQuota || 0),
      advanceEligible: rateForm.advanceEligible,
      managementFirstPeriod: policy,
      reason: rateForm.reason.trim(),
    };
    const res = await postAction(
      action,
      "Pay proposal saved and payroll reloaded."
    );
    if (res.ok) {
      setRateForm(emptyRateDraft);
      setInitialRateModalOpen(false);
      return true;
    }
    if (res.errorMessage) setDialogError(res.errorMessage);
    return false;
  }

  async function submitCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setDialogError("");
    const startDate =
      courseForm.mode === "frequency_change" && originalCourseStart
        ? originalCourseStart
        : courseForm.startDate;
    const effectiveFrom =
      courseForm.mode === "frequency_change" ? nextFuture28th() : startDate;
    const res = await postAction(
      {
        action: "course",
        studentId: courseForm.studentId,
        startDate,
        effectiveFrom,
        weeklyFrequency: Number(courseForm.weeklyFrequency),
      },
      "Course terms saved and payroll reloaded."
    );
    if (res.ok) {
      setCourseForm({
        studentId: "",
        startDate: "",
        effectiveFrom: "",
        weeklyFrequency: "1",
        mode: "initial",
      });
      setCourseModalOpen(false);
    } else if (res.errorMessage) {
      setDialogError(res.errorMessage);
    }
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setDialogError("");
    const res = await postAction(
      {
        action: "adjust",
        statementId: adjustForm.statementId,
        kind: adjustForm.kind,
        amount: Number(adjustForm.amount),
        reason: adjustForm.reason.trim(),
      },
      "Statement adjustment saved and payroll reloaded."
    );
    if (res.ok) {
      setAdjustForm({ statementId: "", kind: "bonus", amount: "", reason: "" });
      setAdjustModalOpen(false);
    } else if (res.errorMessage) {
      setDialogError(res.errorMessage);
    }
  }

  async function submitPaid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || !paidForm.confirmed) return;
    setDialogError("");
    const res = await postAction(
      {
        action: "paid",
        statementId: paidForm.statementId,
        transferReference: paidForm.transferReference.trim(),
        confirmed: true,
      },
      "Manual transfer record saved and payroll reloaded."
    );
    if (res.ok) {
      setPaidForm({ statementId: "", transferReference: "", confirmed: false });
      setPaidModalOpen(false);
    } else if (res.errorMessage) {
      setDialogError(res.errorMessage);
    }
  }

  async function submitAdminSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !owner ||
      !event.currentTarget.reportValidity() ||
      !adminSnapshotForm.confirmed
    )
      return;
    setDialogError("");
    if (selectedPayDateIsFuture) {
      setDialogError(
        "Historical parent counts cannot be recorded for a future pay date."
      );
      return;
    }
    const actualCount = Number(adminSnapshotForm.activeParents);
    const reason = adminSnapshotForm.reason.trim();
    if (
      !Number.isInteger(actualCount) ||
      actualCount < 0 ||
      actualCount > 1000
    ) {
      setDialogError(
        "Enter an actual whole-number parent count from 0 to 1,000."
      );
      return;
    }
    if (reason.length < 5 || reason.length > 2000) {
      setDialogError(
        "Provide a source and reason between 5 and 2,000 characters."
      );
      return;
    }
    const res = await postAction(
      {
        action: "admin_snapshot",
        staffId: adminSnapshotForm.staffId,
        payDate,
        activeParents: actualCount,
        reason,
      },
      "Historical admin parent count saved and payroll reloaded."
    );
    if (res.ok) {
      setAdminSnapshotForm({
        staffId: "",
        activeParents: "",
        reason: "",
        confirmed: false,
      });
      setSnapshotModalOpen(false);
    } else if (res.errorMessage) {
      setDialogError(res.errorMessage);
    }
  }

  function openDecision(
    title: string,
    description: string,
    action: Record<string, unknown>,
    submitLabel?: string,
    requireReason = true
  ) {
    setModalError("");
    setModal({ title, description, action, submitLabel, requireReason });
    setModalReason("");
  }

  async function submitModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modalBusy) return;
    if (modal.requireReason && !modalReason.trim()) return;
    setModalBusy(true);
    setModalError("");
    const actionType = modal.action.action;
    const includesReason =
      modal.requireReason ||
      actionType === "decide_rate" ||
      actionType === "batch";
    const action = {
      ...modal.action,
      ...(includesReason ? { reason: modalReason.trim() } : {}),
    };
    const res = await postAction(action, "Decision saved and payroll reloaded.");
    setModalBusy(false);
    if (res.ok) {
      setModal(null);
      setModalReason("");
      setModalError("");
    } else if (res.errorMessage) {
      setModalError(res.errorMessage);
    }
  }

  function openAdjustModalFor(statement?: Statement) {
    setDialogError("");
    setAdjustForm({
      statementId: statement ? String(statement.id) : "",
      kind: "bonus",
      amount: "",
      reason: "",
    });
    setAdjustModalOpen(true);
  }

  function openPaidModalFor(statement?: Statement) {
    setDialogError("");
    setPaidForm({
      statementId: statement ? String(statement.id) : "",
      transferReference: "",
      confirmed: false,
    });
    setPaidModalOpen(true);
  }

  function renderPreviewStatement(statement: PreviewStatement) {
    return (
      <article className="pr-statement" key={String(statement.staffId)}>
        <div className="pr-statement-top">
          <div className="pr-person">
            <ProfileAvatar
              profileId={String(statement.staffId)}
              name={statement.staffName}
              size={34}
              className="pr-person-mark"
            />
            <span>
              <h3>{statement.staffName}</h3>
              <p>{label(statement.role)} · verified earnings</p>
            </span>
          </div>
          <div className={`pr-net ${statement.net < 0 ? "is-debt" : ""}`}>
            {money(statement.net, statement.currency)}
            <small>
              {statement.net < 0
                ? "Debt carried forward · no transfer"
                : `Net · ${statement.currency}`}
            </small>
          </div>
        </div>
        <div className="pr-item-list">
          {renderPayrollItems(statement.items, statement.currency)}
        </div>
      </article>
    );
  }

  if (loading && !data)
    return (
      <main className="pw-payroll">
        <div className="pr-content">
          <div
            className="pr-skeleton"
            style={{ width: 250, marginBottom: 14 }}
          />
          <div
            className="pr-skeleton"
            style={{ width: 420, height: 25, marginBottom: 24 }}
          />
          <div className="pr-skeleton large" />
          <p className="pr-hidden" aria-live="polite">
            Loading payroll workspace
          </p>
        </div>
      </main>
    );

  const initialRateSelectedStaff =
    staffAwaitingInitialTerms.find((s) => String(s.id) === rateForm.staffId) ??
    null;

  return (
    <main className="pw-payroll">
      <div className="pr-content">
        <div
          className="pr-heading"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1>{payrollAccess ? "Payroll workbench" : "Your pay"}</h1>
          </div>
          {!denied && data && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!payrollAccess && hrAccess && (
                <button
                  type="button"
                  className="pr-button"
                  onClick={() => {
                    setDialogError("");
                    setRateForm(emptyRateDraft);
                    setInitialRateModalOpen(true);
                  }}
                >
                  <Plus size={14} />+ Submit Initial Pay Terms
                </button>
              )}
              <button
                type="button"
                className="pr-button secondary"
                onClick={() =>
                  setBankModal({
                    open: true,
                    staffId: String(data.profile.id),
                  })
                }
              >
                <Landmark size={14} />
                Bank Details
              </button>
            </div>
          )}
        </div>

        <div className="pr-banner" role="note">
          <Landmark size={15} aria-hidden="true" />
          <span>
            <strong>Manual transfers only.</strong> This app never sends money.
          </span>
        </div>

        {error && (
          <div className="pr-alert" role="alert">
            <AlertCircle size={16} />
            <div>
              <strong>Action needs attention</strong>
              <p>{error}</p>
            </div>
            <button
              className="pr-button outline small"
              type="button"
              onClick={() => void load()}
              disabled={loading || pending}
            >
              Reload payroll
            </button>
          </div>
        )}
        {notice && (
          <div className="pr-alert success" role="status">
            <Check size={16} />
            <div>
              <strong>Confirmed</strong>
              <p>{notice}</p>
            </div>
          </div>
        )}
        {denied && (
          <section className="pr-restricted">
            <span className="pr-empty-icon">
              <ShieldCheck size={20} />
            </span>
            <h2>This payroll area is private</h2>
            <p>{error || "Your account does not have access to payroll."}</p>
            <button
              type="button"
              className="pr-button outline"
              onClick={() => void load()}
              disabled={loading}
            >
              Try again
            </button>
          </section>
        )}

        {!denied && data && (
          <>
            <div className="pr-toolbar">
              <div className="pr-toolbar-copy">
                <span className="pr-toolbar-mark">
                  <CalendarDays size={17} />
                </span>
                <span>
                  <strong>
                    {payrollAccess ? "Pay run period" : "Pay date"}
                  </strong>
                  <small>
                    {currentPreview
                      ? `${dateLabel(currentPreview.from)} — ${dateLabel(
                          currentPreview.to
                        )}`
                      : "Statements are available when pay rules and access allow."}
                  </small>
                </span>
              </div>
              <label className="pr-date">
                <span>Pay date</span>
                <input
                  type="month"
                  value={month}
                  onChange={(event) => {
                    setMonth(event.target.value || targetMonth());
                    setNotice("");
                  }}
                  aria-label="Choose pay month"
                />
              </label>
            </div>

            {payrollAccess && (
              <nav className="pr-tabs" aria-label="Payroll sections">
                <button
                  type="button"
                  className={`pr-tab ${tab === "overview" ? "active" : ""}`}
                  onClick={() => setTab("overview")}
                >
                  Run overview
                </button>
                <button
                  type="button"
                  className={`pr-tab ${tab === "batches" ? "active" : ""}`}
                  onClick={() => setTab("batches")}
                >
                  Pay batches{" "}
                  <span className="pr-tab-count">{data.batches.length}</span>
                </button>
                <button
                  type="button"
                  className={`pr-tab ${tab === "rates" ? "active" : ""}`}
                  onClick={() => setTab("rates")}
                >
                  Pay terms{" "}
                  <span className="pr-tab-count">
                    {data.rateProposals.length}
                  </span>
                </button>
                <button
                  type="button"
                  className={`pr-tab ${tab === "onboarding" ? "active" : ""}`}
                  onClick={() => setTab("onboarding")}
                >
                  Adjustments &amp; staff
                </button>
              </nav>
            )}

            {/* Non-payroll staff view (full-width, Bank & Initial Pay Terms via header modals) */}
            {!payrollAccess && (
              <div className="pr-stack">
                <section className="pr-card">
                  <header className="pr-card-head">
                    <div>
                      <h2>This pay period</h2>
                      <p>
                        {dateLabel(payDate)} · {ownCurrent.length} statement
                        {ownCurrent.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </header>
                  {currentPreview ? (
                    ownCurrent.length ? (
                      ownCurrent.map(renderPreviewStatement)
                    ) : (
                      <div className="pr-empty">
                        <span className="pr-empty-icon">
                          <Wallet size={17} />
                        </span>
                        <strong>No statement returned for this cycle</strong>
                        <p>
                          Your statement appears when verified attendance and
                          approved pay terms are available. No earnings are
                          estimated here.
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="pr-empty">
                      <span className="pr-empty-icon">
                        <Clock3 size={17} />
                      </span>
                      <strong>This period is not ready to preview</strong>
                      <p>
                        Payroll rules or your account’s permitted visibility may
                        still be in setup. Contact Finance for a status update.
                      </p>
                    </div>
                  )}
                </section>
                <section className="pr-card">
                  <header className="pr-card-head">
                    <div>
                      <h2>Previous statements</h2>
                      <p>
                        Historical earnings and transfer records, limited to
                        you.
                      </p>
                    </div>
                  </header>
                  {walletStatements.historical.length ? (
                    walletStatements.historical.map((item) =>
                      renderHistoricalStatementItem(
                        item,
                        item.batch,
                        false,
                        false
                      )
                    )
                  ) : (
                    <div className="pr-empty">
                      <span className="pr-empty-icon">
                        <FileText size={17} />
                      </span>
                      <strong>No saved statements yet</strong>
                      <p>
                        Completed payroll statements will be listed here after a
                        pay batch is prepared.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* Overview Tab */}
            {payrollAccess && tab === "overview" && (
              <div className="pr-stack">
                {!data.rulesConfigured && (
                  <div className="pr-rule-state">
                    <AlertCircle size={15} />
                    <span>
                      <strong>Payroll rules are not configured.</strong> Preview
                      and generation are unavailable until the owner completes
                      payroll foundations in <a href="/settings">Settings</a>.
                    </span>
                  </div>
                )}
                <section className="pr-card">
                  <header className="pr-card-head">
                    <div>
                      <h2>Verified earnings preview</h2>
                      <p>
                        {currentPreview
                          ? `${dateLabel(currentPreview.from)} – ${dateLabel(
                              currentPreview.to
                            )}`
                          : "Preview unavailable for this date."}
                      </p>
                    </div>
                  </header>
                  {currentPreview && (
                    <div
                      className={`pr-preview-status ${
                        currentPreview.issues.length ? "has-issues" : ""
                      }`}
                      aria-live="polite"
                    >
                      <span>
                        {currentPreview.statements.length} statement
                        {currentPreview.statements.length === 1 ? "" : "s"}
                      </span>
                      <span>
                        {currentPreview.issues.length} server readiness issue
                        {currentPreview.issues.length === 1 ? "" : "s"}
                      </span>
                      <span>Pay date {dateLabel(currentPreview.payDate)}</span>
                    </div>
                  )}
                  <div className="pr-card-body" style={{ paddingTop: 14 }}>
                    {!currentPreview ? (
                      <div className="pr-empty">
                        <span className="pr-empty-icon">
                          <Clock3 size={17} />
                        </span>
                        <strong>Preview is not available</strong>
                        <p>
                          Initial onboarding or restricted setup may prevent a
                          preview. No zero-value payroll has been fabricated.
                        </p>
                      </div>
                    ) : (
                      <>
                        {currencyTotals.length > 0 && (
                          <div
                            className="pr-currency-totals"
                            aria-label="Current preview subtotals by currency"
                          >
                            {currencyTotals.map(([currency, total]) => (
                              <span
                                key={currency}
                                className="pr-currency-chip"
                              >
                                {currency}
                                <strong>{money(total, currency)}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                        {currentPreview.issues.length > 0 && (
                          <div className="pr-section-rule">
                            <p className="pr-subtitle">
                              <strong>
                                Generation is blocked by these returned issues:
                              </strong>
                            </p>
                            <div className="pr-issue-list">
                              {currentPreview.issues.map((issue, index) => (
                                <div
                                  className="pr-issue"
                                  key={`${issue.staffId}-${index}`}
                                >
                                  <AlertCircle size={13} />
                                  <ProfileAvatar
                                    profileId={String(issue.staffId)}
                                    name={issue.staffName}
                                    size={30}
                                  />
                                  <span>
                                    <strong>{issue.staffName}</strong> ·{" "}
                                    {issue.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {currentPreview.statements.length
                          ? currentPreview.statements.map(
                              renderPreviewStatement
                            )
                          : currentPreview.issues.length === 0 && (
                              <div className="pr-empty">
                                <span className="pr-empty-icon">
                                  <FileCheck2 size={17} />
                                </span>
                                <strong>No statements to generate</strong>
                                <p>
                                  There are no payable staff statements in this
                                  preview. The system does not replace missing
                                  attendance with estimates.
                                </p>
                              </div>
                            )}
                      </>
                    )}
                  </div>
                </section>

                <section className="pr-card">
                  <header className="pr-card-head">
                    <div>
                      <h2>
                        {owner
                          ? "Submitted for your approval"
                          : "Pay-run actions"}
                      </h2>
                    </div>
                    <button
                      className="pr-button outline small"
                      type="button"
                      onClick={() => void load()}
                      disabled={pending || loading}
                    >
                      <RefreshCw size={13} />
                      Refresh preview
                    </button>
                  </header>
                  <div className="pr-card-body">
                    {isFinanceTeam && (
                      <div className="pr-action-row">
                        <button
                          className="pr-button"
                          type="button"
                          disabled={!canGenerate}
                          onClick={() =>
                            openDecision(
                              "Generate a draft pay batch?",
                              `Create a draft for ${dateLabel(
                                payDate
                              )} from the verified preview. This is not a payment.`,
                              { action: "generate", payDate },
                              "Generate draft",
                              false
                            )
                          }
                        >
                          <Plus size={14} />
                          Generate draft batch
                        </button>
                      </div>
                    )}
                    {owner &&
                      (data.batches.filter(
                        (batch) => batch.status === "submitted"
                      ).length ? (
                        <div className="pr-review-list">
                          {data.batches
                            .filter((batch) => batch.status === "submitted")
                            .map((batch) => (
                              <article
                                className="pr-review-row"
                                key={batch.id}
                              >
                                <div>
                                  <strong>
                                    {dateLabel(batch.pay_date)} pay run
                                  </strong>
                                  <span>
                                    Revision {batch.revision} ·{" "}
                                    {batch.statements.length} statements
                                  </span>
                                </div>
                                <div className="pr-action-row">
                                  <button
                                    className="pr-button secondary small"
                                    type="button"
                                    onClick={() =>
                                      openDecision(
                                        "Approve pay batch?",
                                        "Approval authorizes Finance to carry out transfers manually.",
                                        {
                                          action: "batch",
                                          id: batch.id,
                                          decision: "approve",
                                        },
                                        "Approve batch",
                                        false
                                      )
                                    }
                                    disabled={pending}
                                  >
                                    <Check size={13} />
                                    Approve
                                  </button>
                                  <button
                                    className="pr-button danger small"
                                    type="button"
                                    onClick={() =>
                                      openDecision(
                                        "Return batch to Finance?",
                                        "A written reason is required for the record.",
                                        {
                                          action: "batch",
                                          id: batch.id,
                                          decision: "reject",
                                        },
                                        "Return with reason",
                                        true
                                      )
                                    }
                                    disabled={pending}
                                  >
                                    Return
                                  </button>
                                </div>
                              </article>
                            ))}
                        </div>
                      ) : (
                        <div className="pr-empty">
                          <strong>No submitted batches awaiting review</strong>
                        </div>
                      ))}
                  </div>
                </section>
              </div>
            )}

            {/* Pay Batches Tab — ZERO TAB TELEPORTATION! */}
            {payrollAccess && tab === "batches" && (
              <PayrollBatchesSection
                data={data}
                role={role}
                owner={owner}
                pending={pending}
                canSubmitOnDate={canSubmitOnDate}
                payrollAccess={payrollAccess}
                openDecision={openDecision}
                onSetAdjustForm={(statement) => openAdjustModalFor(statement)}
                onSetPaidForm={(statement) => openPaidModalFor(statement)}
              />
            )}

            {/* Pay Terms Tab */}
            {payrollAccess && tab === "rates" && (
              <PayrollRatesSection
                data={data}
                activeStaff={activeStaff}
                owner={owner}
                pending={pending}
                rateForm={rateForm}
                setRateForm={setRateForm}
                formError={dialogError}
                onClearFormError={() => setDialogError("")}
                onSubmitRate={submitRate}
                openDecision={openDecision}
              />
            )}

            {/* Adjustments & Staff Tab — Full Width, All Forms in Modals */}
            {payrollAccess && tab === "onboarding" && (
              <div className="pr-stack">
                {/* Staff Directory */}
                <section className="pr-card">
                  <header className="pr-card-head">
                    <div>
                      <h2>Staff directory</h2>
                      <p>
                        Names, roles, and rate readiness. Click Bank Details on
                        any row to reveal or update private receiving accounts.
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {owner && (
                        <button
                          type="button"
                          className="pr-button outline small"
                          disabled={
                            selectedPayDateIsFuture || !directoryAdmins.length
                          }
                          title={
                            selectedPayDateIsFuture
                              ? "Select a past pay month above to record a historical count"
                              : "Record verified historical active-parent count for an admin"
                          }
                          onClick={() => {
                            setDialogError("");
                            setSnapshotModalOpen(true);
                          }}
                        >
                          <History size={13} /> Record Historical Count
                        </button>
                      )}
                      <button
                        type="button"
                        className="pr-button secondary small"
                        onClick={() =>
                          setBankModal({
                            open: true,
                            staffId: String(data.profile.id),
                          })
                        }
                      >
                        <Landmark size={13} /> Bank Details
                      </button>
                    </div>
                  </header>
                  {data.staff.length ? (
                    <div className="pr-table-wrap">
                      <table className="pr-table">
                        <thead>
                          <tr>
                            <th>Staff member</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Rate record</th>
                            <th style={{ textAlign: "right" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.staff.map((person) => {
                            const hasRate = data.rates.some(
                              (rate) =>
                                String(rate.staff_id) === String(person.id)
                            );
                            return (
                              <tr key={person.id}>
                                <td>
                                  <div className="pw-person-inline">
                                    <ProfileAvatar
                                      profileId={String(person.id)}
                                      name={person.name}
                                      size={30}
                                    />
                                    <strong>{person.name}</strong>
                                  </div>
                                </td>
                                <td>{label(person.role)}</td>
                                <td>
                                  <span className="pr-pill">
                                    {label(person.status)}
                                  </span>
                                </td>
                                <td>
                                  {hasRate
                                    ? "Approved terms on file"
                                    : "Initial terms needed"}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    type="button"
                                    className="pr-button outline small"
                                    onClick={() =>
                                      setBankModal({
                                        open: true,
                                        staffId: String(person.id),
                                      })
                                    }
                                  >
                                    <Landmark size={12} /> Bank
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="pr-empty">
                      <span className="pr-empty-icon">
                        <Users size={17} />
                      </span>
                      <strong>No staff in the payroll response</strong>
                      <p>
                        Invite staff and confirm their active account status
                        before onboarding pay terms.
                      </p>
                    </div>
                  )}
                </section>

                {/* Course Terms */}
                <section className="pr-card">
                  <header className="pr-card-head">
                    <div>
                      <h2>Course terms</h2>
                      <p>
                        Capture the exact start date and weekly frequency used
                        by the payroll service.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="pr-button small"
                      disabled={data.billingStudents.length === 0}
                      onClick={() => {
                        setDialogError("");
                        setCourseModalOpen(true);
                      }}
                    >
                      <Plus size={13} />+ Add / Update Course Terms
                    </button>
                  </header>
                  {data.courses.length ? (
                    <div className="pr-table-wrap">
                      <table className="pr-table">
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Course start</th>
                            <th>Effective from</th>
                            <th>Weekly frequency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.courses.map((course, index) => (
                            <tr
                              key={`${course.student_id}-${course.effective_from}-${index}`}
                            >
                              <td>
                                <strong>{course.student_name}</strong>
                              </td>
                              <td>{dateLabel(course.start_date)}</td>
                              <td>{dateLabel(course.effective_from)}</td>
                              <td>{course.weekly_frequency}× weekly</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="pr-empty">
                      <span className="pr-empty-icon">
                        <CalendarDays size={17} />
                      </span>
                      <strong>No course terms available</strong>
                      <p>
                        Once billing students exist, add a course start date and
                        frequency.
                      </p>
                    </div>
                  )}
                </section>

                {/* Owner Adjustments Summary & Trigger */}
                {owner && (
                  <section className="pr-card" id="pr-adjust-form">
                    <header className="pr-card-head">
                      <div>
                        <h2>Statement adjustments</h2>
                        <p>
                          Bonuses, deductions, and loan deductions on open draft
                          statements require a written reason.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="pr-button secondary small"
                        disabled={draftStatements.length === 0}
                        onClick={() => openAdjustModalFor()}
                      >
                        <SlidersHorizontal size={13} />+ Add Adjustment
                      </button>
                    </header>
                    <div className="pr-card-body">
                      {draftStatements.length === 0 ? (
                        <div className="pr-empty">
                          <strong>No open drafts to adjust</strong>
                          <p>
                            Owner adjustments are available only while a
                            generated batch is still a draft.
                          </p>
                        </div>
                      ) : (
                        draftStatements.map((item) => (
                          <div className="pr-proposal" key={item.id}>
                            <div className="pr-proposal-top">
                              <span>
                                <h3>{item.staff_name}</h3>
                                <p>
                                  {dateLabel(item.batch.pay_date)} · Net{" "}
                                  {money(item.net, item.currency)} ·{" "}
                                  {item.adjustments?.length ?? 0} adjustment
                                  {(item.adjustments?.length ?? 0) === 1
                                    ? ""
                                    : "s"}
                                </p>
                              </span>
                              <button
                                type="button"
                                className="pr-button outline small"
                                onClick={() => openAdjustModalFor(item)}
                              >
                                Adjust draft
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                )}

                {/* Manual Transfer Records */}
                {owner && (
                  <section className="pr-card">
                    <header className="pr-card-head">
                      <div>
                        <h2>Manual transfer records</h2>
                        <p>
                          Record completed manual bank transfers for approved
                          positive-net statements.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="pr-button secondary small"
                        disabled={unpaidApprovedStatements.length === 0}
                        onClick={() =>
                          openPaidModalFor(unpaidApprovedStatements[0])
                        }
                      >
                        <Banknote size={13} /> Record Completed Transfer
                      </button>
                    </header>
                    <div className="pr-card-body">
                      {unpaidApprovedStatements.length === 0 ? (
                        <p className="pr-subtitle">
                          There are no approved, unpaid positive-net statements
                          returned for this period. Negative-net rows carry
                          forward as debt, not transfers.
                        </p>
                      ) : (
                        unpaidApprovedStatements.map((item) => (
                          <div className="pr-proposal" key={item.id}>
                            <div className="pr-proposal-top">
                              <span>
                                <h3>{item.staff_name}</h3>
                                <p>
                                  {dateLabel(item.batch.pay_date)} ·{" "}
                                  {money(item.net, item.currency)}
                                </p>
                              </span>
                              <button
                                className="pr-button small secondary"
                                type="button"
                                onClick={() => openPaidModalFor(item)}
                              >
                                Record transfer
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}

        <footer className="pr-footer">
          <span>ProsperWork · Music Concepts</span>
          <span>Private staff pay · verified attendance only</span>
        </footer>
      </div>

      {/* ========== MODALS ========== */}

      {/* Bank Details Modal */}
      {data && (
        <PortalModal
          open={bankModal.open}
          onClose={() => setBankModal({ open: false })}
          eyebrow="Private receiving details"
          title="Bank instructions"
          subtitle="Load one staff-and-currency instruction on demand. Each currency is checked separately."
          size="md"
          busy={pending}
        >
          <BankModalContent
            key={bankModal.staffId ?? String(data.profile.id)}
            profileId={data.profile.id}
            profileName={data.profile.name}
            initialStaffId={bankModal.staffId}
            staff={data.staff}
            ownOnly={!payrollAccess}
            initialOnly={!payrollAccess && hrAccess}
            pending={pending}
            onSave={postAction}
            onDone={() => setBankModal({ open: false })}
          />
        </PortalModal>
      )}

      {/* HR/QC Submit Initial Pay Terms Modal */}
      {data && !payrollAccess && hrAccess && (
        <PortalModal
          open={initialRateModalOpen}
          onClose={() => {
            setInitialRateModalOpen(false);
            setDialogError("");
          }}
          eyebrow="Onboarding pay terms"
          title="Submit initial pay agreement"
          subtitle="HR and QC can submit initial terms for assigned staff awaiting setup."
          size="lg"
          busy={pending}
        >
          <form className="pr-form" onSubmit={submitRate}>
            {dialogError && (
              <div className="pr-alert" role="alert">
                <AlertCircle size={15} />
                <p>{dialogError}</p>
              </div>
            )}
            <label className="pr-field">
              <span>Assigned staff</span>
              <select
                required
                value={rateForm.staffId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const staff =
                    staffAwaitingInitialTerms.find(
                      (s) => String(s.id) === nextId
                    ) ?? null;
                  setRateForm((prev) =>
                    applyRoleDefaultsToRateDraft(
                      { ...prev, staffId: nextId },
                      staff
                    )
                  );
                }}
              >
                <option value="">Choose staff</option>
                {staffAwaitingInitialTerms.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} · {label(staff.role)}
                  </option>
                ))}
              </select>
            </label>
            {staffAwaitingInitialTerms.length === 0 && (
              <p className="pr-subtitle">
                No assigned staff awaiting initial terms are available in this
                response. Ask the owner to assign staff access first.
              </p>
            )}
            <RateInputs
              value={rateForm}
              onChange={setRateForm}
              initialOnly
              selectedStaff={initialRateSelectedStaff}
            />
            <label className="pr-check">
              <input
                type="checkbox"
                checked={rateForm.initialAgreed}
                onChange={(event) =>
                  setRateForm({
                    ...rateForm,
                    initialAgreed: event.target.checked,
                  })
                }
              />
              <span>
                I confirm these are the initial pay terms agreed with this staff
                member. An effective date in the past is only for recording that
                initial agreement.
              </span>
            </label>
            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="pr-button outline"
                onClick={() => setInitialRateModalOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                className="pr-button"
                type="submit"
                disabled={pending || staffAwaitingInitialTerms.length === 0}
              >
                <Plus size={14} />
                {pending
                  ? "Submitting…"
                  : "Submit initial terms for owner review"}
              </button>
            </div>
          </form>
        </PortalModal>
      )}

      {/* Add / Update Course Terms Modal */}
      {data && payrollAccess && (
        <PortalModal
          open={courseModalOpen}
          onClose={() => {
            setCourseModalOpen(false);
            setDialogError("");
          }}
          eyebrow="Billing alignment"
          title="Add or update course terms"
          subtitle="Set the exact start date or schedule a future weekly frequency change."
          size="md"
          busy={pending}
        >
          <form className="pr-form" onSubmit={submitCourse}>
            {dialogError && (
              <div className="pr-alert" role="alert">
                <AlertCircle size={15} />
                <p>{dialogError}</p>
              </div>
            )}
            <label className="pr-field">
              <span>Course change</span>
              <select
                value={courseForm.mode}
                onChange={(event) =>
                  setCourseForm({
                    ...courseForm,
                    mode: event.target.value as "initial" | "frequency_change",
                    studentId: "",
                    startDate: "",
                    effectiveFrom: "",
                  })
                }
              >
                <option value="initial">Add initial course terms</option>
                <option value="frequency_change">
                  Change an existing frequency
                </option>
              </select>
            </label>
            <label className="pr-field">
              <span>Billing student</span>
              <select
                required
                value={courseForm.studentId}
                onChange={(event) => {
                  const studentId = event.target.value;
                  const match = data.courses
                    .filter(
                      (course) => String(course.student_id) === studentId
                    )
                    .sort((a, b) =>
                      b.effective_from.localeCompare(a.effective_from)
                    )[0];
                  setCourseForm({
                    ...courseForm,
                    studentId,
                    startDate:
                      courseForm.mode === "initial"
                        ? ""
                        : match?.start_date || "",
                    effectiveFrom:
                      courseForm.mode === "initial" ? "" : nextFuture28th(),
                    weeklyFrequency: match
                      ? String(match.weekly_frequency)
                      : courseForm.weeklyFrequency,
                  });
                }}
              >
                <option value="">Select student</option>
                {data.billingStudents
                  .filter((student) =>
                    courseForm.mode === "initial"
                      ? !data.courses.some(
                          (course) =>
                            String(course.student_id) === String(student.id)
                        )
                      : data.courses.some(
                          (course) =>
                            String(course.student_id) === String(student.id)
                        )
                  )
                  .map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
              </select>
            </label>
            {courseForm.mode === "initial" ? (
              <div className="pr-form-grid">
                <label className="pr-field">
                  <span>Exact course start date</span>
                  <input
                    type="date"
                    required
                    value={courseForm.startDate}
                    onChange={(event) =>
                      setCourseForm({
                        ...courseForm,
                        startDate: event.target.value,
                        effectiveFrom: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="pr-field">
                  <span>Effective from</span>
                  <input
                    type="date"
                    required
                    readOnly
                    value={courseForm.effectiveFrom}
                  />
                </label>
              </div>
            ) : (
              <div className="pr-form-grid">
                <label className="pr-field">
                  <span>Original course start · retained</span>
                  <input type="date" readOnly value={originalCourseStart} />
                </label>
                <label className="pr-field">
                  <span>Effective from (next 28th)</span>
                  <input type="date" readOnly value={nextFuture28th()} />
                </label>
              </div>
            )}
            <label className="pr-field">
              <span>Weekly frequency</span>
              <select
                required
                value={courseForm.weeklyFrequency}
                onChange={(event) =>
                  setCourseForm({
                    ...courseForm,
                    weeklyFrequency: event.target.value,
                  })
                }
              >
                <option value="1">1 lesson weekly</option>
                <option value="2">2 lessons weekly</option>
                <option value="3">3 lessons weekly</option>
              </select>
            </label>
            {courseForm.mode === "frequency_change" &&
              selectedCourse &&
              Number(courseForm.weeklyFrequency) ===
                selectedCourse.weekly_frequency && (
                <p className="pr-subtitle">
                  Choose a different frequency to record a change.
                </p>
              )}
            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="pr-button outline"
                onClick={() => setCourseModalOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                className="pr-button"
                type="submit"
                disabled={
                  pending ||
                  !courseForm.studentId ||
                  (courseForm.mode === "frequency_change" &&
                    (!selectedCourse ||
                      Number(courseForm.weeklyFrequency) ===
                        selectedCourse.weekly_frequency))
                }
              >
                <Plus size={14} />
                {courseForm.mode === "initial"
                  ? "Save initial course terms"
                  : "Schedule frequency change"}
              </button>
            </div>
          </form>
        </PortalModal>
      )}

      {/* Statement Adjustment Modal (Pre-bound from Pay Batches or Adjustments tab — NO TAB TELEPORTATION) */}
      {data && owner && (
        <PortalModal
          open={adjustModalOpen}
          onClose={() => {
            setAdjustModalOpen(false);
            setDialogError("");
          }}
          eyebrow="Draft statement adjustment"
          title={
            selectedStatement
              ? `Adjust draft · ${selectedStatement.staff_name}`
              : "Add statement adjustment"
          }
          subtitle={
            selectedStatement
              ? `${dateLabel(selectedStatement.batch.pay_date)} · Current net ${money(
                  selectedStatement.net,
                  selectedStatement.currency
                )}`
              : "Adjustments and removals always require a written reason."
          }
          size="md"
          busy={pending}
        >
          <form className="pr-form" onSubmit={submitAdjustment}>
            {dialogError && (
              <div className="pr-alert" role="alert">
                <AlertCircle size={15} />
                <p>{dialogError}</p>
              </div>
            )}
            <label className="pr-field">
              <span>Draft statement</span>
              <select
                required
                value={adjustForm.statementId}
                onChange={(event) =>
                  setAdjustForm({
                    ...adjustForm,
                    statementId: event.target.value,
                  })
                }
              >
                <option value="">Choose statement</option>
                {draftStatements.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.staff_name} · {dateLabel(item.batch.pay_date)} ·{" "}
                    {item.currency} {item.net.toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
            <div className="pr-form-grid">
              <label className="pr-field">
                <span>Adjustment type</span>
                <select
                  value={adjustForm.kind}
                  onChange={(event) =>
                    setAdjustForm({
                      ...adjustForm,
                      kind: event.target.value as typeof adjustForm.kind,
                    })
                  }
                >
                  <option value="bonus">Bonus</option>
                  <option value="deduction">Deduction</option>
                  <option value="loan_deduction">Loan deduction</option>
                </select>
              </label>
              <label className="pr-field">
                <span>Amount</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={adjustForm.amount}
                  onChange={(event) =>
                    setAdjustForm({
                      ...adjustForm,
                      amount: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label className="pr-field">
              <span>Written reason</span>
              <textarea
                required
                minLength={3}
                rows={3}
                value={adjustForm.reason}
                onChange={(event) =>
                  setAdjustForm({
                    ...adjustForm,
                    reason: event.target.value,
                  })
                }
              />
            </label>
            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="pr-button outline"
                onClick={() => setAdjustModalOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                className="pr-button secondary"
                type="submit"
                disabled={pending || !adjustForm.statementId}
              >
                {pending ? "Saving…" : "Add documented adjustment"}
              </button>
            </div>

            {selectedStatement?.batch.status === "draft" &&
            selectedStatement.adjustments?.length ? (
              <div className="pr-section-rule" style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 11 }}>
                  Existing adjustments on this draft
                </strong>
                {selectedStatement.adjustments.map((adjustment) => (
                  <div className="pr-proposal" key={adjustment.id}>
                    <div className="pr-proposal-top">
                      <span>
                        <h3>
                          {label(adjustment.kind)} ·{" "}
                          {money(adjustment.amount, selectedStatement.currency)}
                        </h3>
                        <p>{adjustment.reason}</p>
                      </span>
                      <button
                        type="button"
                        className="pr-button danger small"
                        disabled={pending}
                        onClick={() => {
                          setAdjustModalOpen(false);
                          openDecision(
                            "Remove adjustment?",
                            "A written reversal reason is required. This records a removal; it does not erase the adjustment history.",
                            {
                              action: "remove_adjustment",
                              statementId: selectedStatement.id,
                              adjustmentId: adjustment.id,
                            },
                            "Remove with reason",
                            true
                          );
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </form>
        </PortalModal>
      )}

      {/* Record Completed Transfer Modal (Pre-bound from Pay Batches or Adjustments tab) */}
      {data && owner && (
        <PortalModal
          open={paidModalOpen}
          onClose={() => {
            setPaidModalOpen(false);
            setDialogError("");
          }}
          eyebrow="Manual transfer confirmation"
          title={
            selectedPaidStatement
              ? `Record transfer · ${selectedPaidStatement.staff_name}`
              : "Record completed transfer"
          }
          subtitle="Only confirm an already completed manual bank transfer. This does not send money."
          size="md"
          busy={pending}
        >
          <form className="pr-form" onSubmit={submitPaid}>
            {dialogError && (
              <div className="pr-alert" role="alert">
                <AlertCircle size={15} />
                <p>{dialogError}</p>
              </div>
            )}
            <label className="pr-field">
              <span>Approved statement</span>
              <select
                required
                value={paidForm.statementId}
                onChange={(event) =>
                  setPaidForm({
                    ...paidForm,
                    statementId: event.target.value,
                  })
                }
              >
                <option value="">Choose approved statement</option>
                {unpaidApprovedStatements.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.staff_name} · {dateLabel(item.batch.pay_date)} ·{" "}
                    {money(item.net, item.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label className="pr-field">
              <span>Transfer reference</span>
              <input
                required
                placeholder="Bank receipt or wire reference"
                value={paidForm.transferReference}
                onChange={(event) =>
                  setPaidForm({
                    ...paidForm,
                    transferReference: event.target.value,
                  })
                }
              />
            </label>
            <label className="pr-check">
              <input
                type="checkbox"
                required
                checked={paidForm.confirmed}
                onChange={(event) =>
                  setPaidForm({
                    ...paidForm,
                    confirmed: event.target.checked,
                  })
                }
              />
              <span>
                I confirm this bank transfer has already completed. I understand
                this only records the transfer and does not send money.
              </span>
            </label>
            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button
                className="pr-button outline"
                type="button"
                onClick={() => setPaidModalOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                className="pr-button"
                type="submit"
                disabled={pending || !paidForm.confirmed || !paidForm.statementId}
              >
                {pending ? "Saving…" : "Mark completed transfer"}
              </button>
            </div>
          </form>
        </PortalModal>
      )}

      {/* Historical Admin Parent Count Modal */}
      {data && owner && (
        <PortalModal
          open={snapshotModalOpen}
          onClose={() => {
            setSnapshotModalOpen(false);
            setDialogError("");
          }}
          eyebrow="Historical audit record"
          title="Record historical admin parent count"
          subtitle={`Source-verified archived count for payday ${dateLabel(
            payDate
          )}.`}
          size="md"
          busy={pending}
        >
          <form className="pr-form" onSubmit={submitAdminSnapshot}>
            {dialogError && (
              <div className="pr-alert" role="alert">
                <AlertCircle size={15} />
                <p>{dialogError}</p>
              </div>
            )}
            <label className="pr-field">
              <span>Admin in the staff directory</span>
              <select
                required
                value={adminSnapshotForm.staffId}
                onChange={(event) =>
                  setAdminSnapshotForm({
                    ...adminSnapshotForm,
                    staffId: event.target.value,
                  })
                }
              >
                <option value="">Select an admin</option>
                {directoryAdmins.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="pr-form-grid">
              <label className="pr-field">
                <span>Selected payday</span>
                <input type="date" required readOnly value={payDate} />
              </label>
              <label className="pr-field">
                <span>Actual active-parent count</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000}
                  step={1}
                  required
                  value={adminSnapshotForm.activeParents}
                  onChange={(event) =>
                    setAdminSnapshotForm({
                      ...adminSnapshotForm,
                      activeParents: event.target.value,
                    })
                  }
                  placeholder="0–1000"
                />
              </label>
            </div>
            <label className="pr-field">
              <span>Source and reason</span>
              <textarea
                required
                minLength={5}
                maxLength={2000}
                rows={3}
                value={adminSnapshotForm.reason}
                onChange={(event) =>
                  setAdminSnapshotForm({
                    ...adminSnapshotForm,
                    reason: event.target.value,
                  })
                }
                placeholder="Identify the archived source and why this historical count is being recorded."
              />
            </label>
            <label className="pr-check">
              <input
                type="checkbox"
                required
                checked={adminSnapshotForm.confirmed}
                onChange={(event) =>
                  setAdminSnapshotForm({
                    ...adminSnapshotForm,
                    confirmed: event.target.checked,
                  })
                }
              />
              <span>
                I confirm this is the actual archived count for this admin and
                payday, supported by the source stated above.
              </span>
            </label>
            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="pr-button outline"
                onClick={() => setSnapshotModalOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                className="pr-button secondary"
                type="submit"
                disabled={
                  pending ||
                  selectedPayDateIsFuture ||
                  !directoryAdmins.length ||
                  !adminSnapshotForm.confirmed
                }
              >
                {pending ? "Saving…" : "Save confirmed historical count"}
              </button>
            </div>
          </form>
        </PortalModal>
      )}

      {/* Decision Confirmation Modal (scoped modalError prevents stale page error leakage) */}
      <PayrollAdjustmentModal
        modal={modal}
        modalReason={modalReason}
        setModalReason={setModalReason}
        modalBusy={modalBusy}
        pending={pending}
        error={modalError}
        onClose={() => {
          setModal(null);
          setModalError("");
        }}
        onSubmitModal={submitModal}
      />
    </main>
  );
}
