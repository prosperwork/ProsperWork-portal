"use client";
import CurrencySelect from "@/lib/academy/CurrencySelect";
import ProfileAvatar from "@/app/_components/ProfileAvatar";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  Landmark,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import PayrollBatchesSection from "./components/PayrollBatchesSection";
import PayrollRatesSection, {
  RateInputs,
} from "./components/PayrollRatesSection";
import PayrollAdjustmentModal from "./components/PayrollAdjustmentModal";

type PayrollItem = {
  kind: string;
  sourceKey: string;
  amount: number;
  data?: {
    studentId?: string | number;
    studentName?: string;
    lessonId?: string | number;
    startsAt?: string;
    startDate?: string;
    weekTier?: string | number;
    weeklyFrequency?: number;
    rateId?: string | number;
    reason?: string;
  };
};
type Adjustment = {
  id: string | number;
  kind: string;
  amount: number;
  reason: string;
};
type Statement = {
  id: string | number;
  staff_id: string | number;
  staff_name: string;
  role: string;
  currency: string;
  net: number;
  items: PayrollItem[];
  adjustments: Adjustment[];
  paid_at?: string | null;
  transfer_reference?: string | null;
};
type PreviewStatement = {
  staffId: string | number;
  staffName: string;
  role: string;
  currency: string;
  net: number;
  items: PayrollItem[];
};
type Issue = { staffId: string | number; staffName: string; message: string };
type Batch = {
  id: string | number;
  pay_date: string;
  status: "draft" | "submitted" | "approved" | "paid" | "rejected";
  revision: number;
  created_at: string;
  approval_mode?: string;
  statements: Statement[];
};
type Terms = {
  monthlyStudentRate: number;
  trialRate: number;
  coverRate: number;
  baseSalary: number;
  adminExtraParentRate: number;
  adminQuota: number;
  advanceEligible: boolean;
  currency: string;
};
type Rate = {
  id: string | number;
  staff_id: string | number;
  effective_from: string;
  status?: string;
  reason?: string;
  managementFirstPeriod?: "full_month" | "manual_adjustment";
  terms: Terms;
  proposed_by?: string;
};
type Staff = {
  id: string | number;
  name: string;
  role: string;
  status: string;
};
type Course = {
  student_id: string | number;
  student_name: string;
  start_date: string;
  effective_from: string;
  weekly_frequency: number;
};
type BillingStudent = { id: string | number; name: string };
type RateDraft = {
  staffId: string;
  effectiveFrom: string;
  currency: string;
  monthlyStudentRate: string;
  trialRate: string;
  coverRate: string;
  baseSalary: string;
  adminExtraParentRate: string;
  adminQuota: string;
  advanceEligible: boolean;
  reason: string;
  initialAgreed: boolean;
  managementFirstPeriod: "" | "full_month" | "manual_adjustment";
};
type PayrollData = {
  profile: { id: string | number; name: string; role: string; status: string };
  rulesConfigured: boolean;
  preview: null | {
    payDate: string;
    from: string;
    to: string;
    statements: PreviewStatement[];
    issues: Issue[];
  };
  batches: Batch[];
  rateProposals: Rate[];
  rates: Rate[];
  staff: Staff[];
  courses: Course[];
  billingStudents: BillingStudent[];
  bankConfiguredIds: (string | number)[];
};
type BankDetails = {
  bank_name: string;
  account_name: string;
  account_number: string;
  routing_code: string;
  currency: string;
};
type Tab = "overview" | "batches" | "rates" | "onboarding";
type ModalState = {
  title: string;
  description: string;
  action: Record<string, unknown>;
  requireReason?: boolean;
  submitLabel?: string;
} | null;

const label = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const today = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
function targetMonth() {
  const month = new Date(
    today.getFullYear(),
    today.getMonth() + (today.getDate() > 28 ? 1 : 0),
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
function readJson(response: Response) {
  return response.json().catch(() => ({}));
}
function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}
function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : value;
}
function isOwnerRole(role: string) {
  return role === "super_admin";
}
function isPayrollRole(role: string) {
  return role === "finance" || isOwnerRole(role);
}
function isHRRole(role: string) {
  return role === "hr" || role === "qc";
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
  const [modal, setModal] = useState<ModalState>(null);
  const [modalReason, setModalReason] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [rateForm, setRateForm] = useState<RateDraft>({
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
  });
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
  const payrollAccess = isPayrollRole(role);
  const owner = isOwnerRole(role);
  const hrAccess = isHRRole(role);
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
        const result = await readJson(response);
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
    data?.staff.filter((staff) => staff.role === "admin") ?? [];
  const selectedPayDateIsFuture =
    new Date(`${payDate}T00:00:00`).getTime() > Date.now();
  const selectedStatement = allHistorical.find(
    (item) => String(item.id) === adjustForm.statementId
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
  ) {
    if (pending) return false;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/payroll", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const result = await readJson(response);
      if (response.status === 409) {
        const refreshed = await load(true);
        setError(
          refreshed
            ? sensitive
              ? "These private bank details changed elsewhere. The latest payroll data was reloaded; check the selected currency again."
              : result.error ||
                "This payroll record changed elsewhere. The latest revision has been reloaded; review it before retrying."
            : sensitive
            ? "Private bank details changed elsewhere and the latest payroll data could not be reloaded."
            : "This payroll record changed elsewhere, and its latest revision could not be reloaded. Refresh before taking another action."
        );
        return false;
      }
      if (!response.ok || result.ok !== true)
        throw new Error(
          sensitive
            ? "Private bank details could not be saved. Review the form and try again."
            : result.error || "The payroll action was not confirmed."
        );
      const refreshed = await load(true);
      if (!refreshed) {
        setError(
          "The action was accepted, but payroll could not be reloaded to confirm it. Refresh before taking another action."
        );
        return false;
      }
      setNotice(successText);
      return true;
    } catch (cause) {
      setError(
        sensitive
          ? "Private bank details could not be saved. Review the form and try again."
          : cause instanceof Error
          ? cause.message
          : "The payroll action could not be completed."
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  async function submitRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || !data) return;
    const initial =
      hrAccess ||
      !data.rates.some((rate) => String(rate.staff_id) === rateForm.staffId);
    if (initial && !rateForm.initialAgreed) {
      setError(
        "Confirm that this is the initial pay agreed with the assigned staff member."
      );
      return;
    }
    if (
      !initial &&
      rateForm.effectiveFrom <= new Date().toISOString().slice(0, 10)
    ) {
      setError(
        "A raise must have a future effective date. Past dates are only for recording initial agreed pay."
      );
      return;
    }
    if (!rateForm.managementFirstPeriod) {
      setError(
        "Choose a first-period policy for this staff member’s management salary."
      );
      return;
    }
    const action = {
      action: "propose_rate",
      staffId: rateForm.staffId,
      effectiveFrom: rateForm.effectiveFrom,
      currency: rateForm.currency.trim().toUpperCase(),
      monthlyStudentRate: Number(rateForm.monthlyStudentRate),
      trialRate: Number(rateForm.trialRate),
      coverRate: Number(rateForm.coverRate),
      baseSalary: Number(rateForm.baseSalary),
      adminExtraParentRate: Number(rateForm.adminExtraParentRate),
      adminQuota: Number(rateForm.adminQuota),
      advanceEligible: rateForm.advanceEligible,
      managementFirstPeriod: rateForm.managementFirstPeriod,
      reason: rateForm.reason.trim(),
    };
    const ok = await postAction(
      action,
      "Pay proposal saved and payroll reloaded."
    );
    if (ok)
      setRateForm({
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
      });
  }

  async function submitCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const startDate =
      courseForm.mode === "frequency_change" && originalCourseStart
        ? originalCourseStart
        : courseForm.startDate;
    const effectiveFrom =
      courseForm.mode === "frequency_change" ? nextFuture28th() : startDate;
    const ok = await postAction(
      {
        action: "course",
        studentId: courseForm.studentId,
        startDate,
        effectiveFrom,
        weeklyFrequency: Number(courseForm.weeklyFrequency),
      },
      "Course terms saved and payroll reloaded."
    );
    if (ok)
      setCourseForm({
        studentId: "",
        startDate: "",
        effectiveFrom: "",
        weeklyFrequency: "1",
        mode: "initial",
      });
  }

  function BankPanel({
    profileId,
    profileName,
    staff,
    ownOnly,
    initialOnly,
    pending,
    onSave,
  }: {
    profileId: string | number;
    profileName: string;
    staff: Staff[];
    ownOnly: boolean;
    initialOnly: boolean;
    pending: boolean;
    onSave: (
      action: Record<string, unknown>,
      successText: string,
      sensitive?: boolean
    ) => Promise<boolean>;
  }) {
    const [staffId, setStaffId] = useState(String(profileId));
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
        const result = await readJson(response);
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
      const ok = await onSave(
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
      if (ok) clearSensitive();
    }

    return (
      <section className="pr-card">
        <header className="pr-card-head">
          <div>
            <h2>Private bank instructions</h2>
            <p>
              Load one staff-and-currency instruction on demand. Each currency
              is checked separately; the general setup flag is not proof that
              this currency is on file.
            </p>
          </div>
          <Landmark size={17} color="#54856a" />
        </header>
        <div className="pr-card-body">
          <div className="pr-form pr-section-rule">
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
                    <option value={profileId}>
                      {profileName} · your account
                    </option>
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
                  <strong className="pr-sensitive-value">
                    {bank.account_number}
                  </strong>
                </div>
                <div>
                  <small>Routing / sort code</small>
                  <strong>{bank.routing_code}</strong>
                </div>
                {canEdit && (
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
                )}
                {!canEdit && (
                  <p className="pr-subtitle">
                    HR and QC can add initial instructions only. An owner,
                    Finance, or the account holder can make changes.
                  </p>
                )}
              </div>
            )}
            {visible && !bank && (
              <div className="pr-side-note" role="status">
                <strong>
                  No instruction returned for {currency.toUpperCase()}
                </strong>
                Add the initial receiving details below. The response is for
                this currency only.
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
                <div className="pr-action-row">
                  <button
                    className="pr-button"
                    type="submit"
                    disabled={busy || pending}
                  >
                    {busy || pending
                      ? "Saving…"
                      : "Save private bank instruction"}
                  </button>
                  <button
                    className="pr-button outline"
                    type="button"
                    onClick={clearSensitive}
                    disabled={busy}
                  >
                    Cancel &amp; clear
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    );
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const ok = await postAction(
      {
        action: "adjust",
        statementId: adjustForm.statementId,
        kind: adjustForm.kind,
        amount: Number(adjustForm.amount),
        reason: adjustForm.reason.trim(),
      },
      "Statement adjustment saved and payroll reloaded."
    );
    if (ok)
      setAdjustForm({ statementId: "", kind: "bonus", amount: "", reason: "" });
  }

  async function submitPaid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || !paidForm.confirmed) return;
    const ok = await postAction(
      {
        action: "paid",
        statementId: paidForm.statementId,
        transferReference: paidForm.transferReference.trim(),
        confirmed: true,
      },
      "Manual transfer record saved and payroll reloaded."
    );
    if (ok)
      setPaidForm({ statementId: "", transferReference: "", confirmed: false });
  }

  async function submitAdminSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !owner ||
      !event.currentTarget.reportValidity() ||
      !adminSnapshotForm.confirmed
    )
      return;
    if (selectedPayDateIsFuture) {
      setError(
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
      setError("Enter an actual whole-number parent count from 0 to 1,000.");
      return;
    }
    if (reason.length < 5 || reason.length > 2000) {
      setError("Provide a source and reason between 5 and 2,000 characters.");
      return;
    }
    const ok = await postAction(
      {
        action: "admin_snapshot",
        staffId: adminSnapshotForm.staffId,
        payDate,
        activeParents: actualCount,
        reason,
      },
      "Historical admin parent count saved and payroll reloaded."
    );
    if (ok)
      setAdminSnapshotForm({
        staffId: "",
        activeParents: "",
        reason: "",
        confirmed: false,
      });
  }

  function openDecision(
    title: string,
    description: string,
    action: Record<string, unknown>,
    submitLabel?: string,
    requireReason = true
  ) {
    setModal({ title, description, action, submitLabel, requireReason });
    setModalReason("");
  }
  async function submitModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modalBusy) return;
    if (modal.requireReason && !modalReason.trim()) return;
    setModalBusy(true);
    const actionType = modal.action.action;
    const includesReason =
      modal.requireReason ||
      actionType === "decide_rate" ||
      actionType === "batch";
    const action = {
      ...modal.action,
      ...(includesReason ? { reason: modalReason.trim() } : {}),
    };
    const ok = await postAction(action, "Decision saved and payroll reloaded.");
    setModalBusy(false);
    if (ok) {
      setModal(null);
      setModalReason("");
    }
  }

  function renderItems(items: PayrollItem[], currency: string) {
    if (!items.length)
      return (
        <div className="pr-earning">
          <div className="pr-earning-label">
            <strong>No earning lines</strong>
            <small>
              No verified attendance or approved earnings were returned for this
              statement.
            </small>
          </div>
          <span className="pr-earning-amount">—</span>
        </div>
      );
    return items.map((item, index) => {
      const detail = item.data ?? {};
      const kind = label(item.kind);
      const who = detail.studentName ? ` · ${detail.studentName}` : "";
      const lessonDate = detail.startsAt
        ? dateLabel(detail.startsAt.slice(0, 10))
        : detail.startDate
        ? `Start ${dateLabel(detail.startDate)}`
        : "";
      const week = detail.weekTier ? `Week ${detail.weekTier}` : "";
      const frequency = detail.weeklyFrequency
        ? `${detail.weeklyFrequency}× weekly`
        : "";
      const context = [lessonDate, week, frequency].filter(Boolean).join(" · ");
      return (
        <div className="pr-earning" key={`${item.sourceKey}-${index}`}>
          <div className="pr-earning-label">
            <strong>
              {kind}
              {who}
            </strong>
            <small>
              {context ||
                detail.reason ||
                `Verified source · ${item.sourceKey}`}
            </small>
          </div>
          <span className="pr-earning-amount">
            {money(item.amount, currency)}
          </span>
        </div>
      );
    });
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
          {renderItems(statement.items, statement.currency)}
        </div>
      </article>
    );
  }

  function renderHistoricalStatement(statement: Statement, batch?: Batch) {
    return (
      <article
        className="pr-statement"
        key={`${statement.id}-${batch?.id ?? "wallet"}`}
      >
        <div className="pr-statement-top">
          <div className="pr-person">
            <ProfileAvatar
              profileId={String(statement.staff_id)}
              name={statement.staff_name}
              size={34}
              className="pr-person-mark"
            />
            <span>
              <h3>{statement.staff_name}</h3>
              <p>
                {label(statement.role)} · {dateLabel(batch?.pay_date)}
                {batch ? ` · ${label(batch.status)}` : ""}
              </p>
            </span>
          </div>
          <div className={`pr-net ${statement.net < 0 ? "is-debt" : ""}`}>
            {money(statement.net, statement.currency)}
            <small>
              {statement.net < 0
                ? "Debt carried forward · not a bank transfer"
                : `${statement.currency} · ${
                    statement.paid_at
                      ? `Paid ${dateLabel(statement.paid_at)}`
                      : "Net statement"
                  }`}
            </small>
          </div>
        </div>
        <div className="pr-item-list">
          {renderItems(statement.items, statement.currency)}
          {statement.adjustments?.map((adjustment) => (
            <div className="pr-earning adjustment" key={adjustment.id}>
              <div className="pr-earning-label">
                <strong>{label(adjustment.kind)}</strong>
                <small>{adjustment.reason}</small>
              </div>
              <span className="pr-earning-amount">
                {money(adjustment.amount, statement.currency)}
              </span>
            </div>
          ))}
        </div>
        {statement.transfer_reference && statement.net >= 0 && (
          <div className="pr-table-small">
            Transfer reference: {statement.transfer_reference}
          </div>
        )}
        {payrollAccess && batch && batch.status !== "paid" && (
          <div className="pr-action-row">
            {owner && batch.status === "draft" && (
              <button
                type="button"
                className="pr-button outline small"
                onClick={() => {
                  setAdjustForm({
                    statementId: String(statement.id),
                    kind: "bonus",
                    amount: "",
                    reason: "",
                  });
                  setTab("onboarding");
                }}
              >
                Adjust draft
              </button>
            )}
            {owner && batch.status === "approved" && statement.net > 0 && (
              <button
                type="button"
                className="pr-button secondary small"
                onClick={() => {
                  setPaidForm({
                    statementId: String(statement.id),
                    transferReference: "",
                    confirmed: false,
                  });
                  setTab("onboarding");
                }}
              >
                Record completed transfer
              </button>
            )}
          </div>
        )}
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

  return (
    <main className="pw-payroll">
      <div className="pr-content">
        <div className="pr-heading">
          <div>
            <h1>{payrollAccess ? "Payroll workbench" : "Your pay"}</h1>
          </div>
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
                  Staff &amp; courses
                </button>
              </nav>
            )}

            {!payrollAccess && (
              <>
                <div className="pr-layout">
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
                            <strong>
                              No statement returned for this cycle
                            </strong>
                            <p>
                              Your statement appears when verified attendance
                              and approved pay terms are available. No earnings
                              are estimated here.
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
                            Payroll rules or your account’s permitted visibility
                            may still be in setup. Contact Finance for a status
                            update.
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
                          renderHistoricalStatement(item, item.batch)
                        )
                      ) : (
                        <div className="pr-empty">
                          <span className="pr-empty-icon">
                            <FileText size={17} />
                          </span>
                          <strong>No saved statements yet</strong>
                          <p>
                            Completed payroll statements will be listed here
                            after a pay batch is prepared.
                          </p>
                        </div>
                      )}
                    </section>
                  </div>
                  <aside className="pr-stack">
                    {hrAccess && (
                      <section className="pr-card">
                        <header className="pr-card-head">
                          <div>
                            <h2>Initial pay agreement</h2>
                            <p>
                              HR and QC can submit initial terms for assigned
                              staff only. Existing rates and other staff
                              salaries are not shown here.
                            </p>
                          </div>
                          <Users size={17} color="#54856a" />
                        </header>
                        <div className="pr-card-body">
                          <form className="pr-form" onSubmit={submitRate}>
                            <label className="pr-field">
                              <span>Assigned staff</span>
                              <select
                                required
                                value={rateForm.staffId}
                                onChange={(event) =>
                                  setRateForm({
                                    ...rateForm,
                                    staffId: event.target.value,
                                  })
                                }
                              >
                                <option value="">Choose staff</option>
                                {activeStaff
                                  .filter(
                                    (staff) =>
                                      !data.rates.some(
                                        (rate) =>
                                          String(rate.staff_id) ===
                                          String(staff.id)
                                      )
                                  )
                                  .map((staff) => (
                                    <option key={staff.id} value={staff.id}>
                                      {staff.name} · {label(staff.role)}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            {activeStaff.filter(
                              (staff) =>
                                !data.rates.some(
                                  (rate) =>
                                    String(rate.staff_id) === String(staff.id)
                                )
                            ).length === 0 && (
                              <p className="pr-subtitle">
                                No assigned staff awaiting initial terms are
                                available in this response. Ask the owner to
                                assign staff access first.
                              </p>
                            )}
                            <RateInputs
                              value={rateForm}
                              onChange={setRateForm}
                              initialOnly
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
                                I confirm these are the initial pay terms agreed
                                with this staff member. An effective date in the
                                past is only for recording that initial
                                agreement.
                              </span>
                            </label>
                            <button
                              className="pr-button"
                              type="submit"
                              disabled={
                                pending ||
                                !activeStaff.some(
                                  (staff) =>
                                    !data.rates.some(
                                      (rate) =>
                                        String(rate.staff_id) ===
                                        String(staff.id)
                                    )
                                )
                              }
                            >
                              <Plus size={14} />
                              Submit initial terms for owner review
                            </button>
                          </form>
                        </div>
                      </section>
                    )}
                    <BankPanel
                      profileId={data.profile.id}
                      profileName={data.profile.name}
                      staff={data.staff}
                      ownOnly
                      initialOnly={hrAccess}
                      pending={pending}
                      onSave={postAction}
                    />
                  </aside>
                </div>
              </>
            )}

            {payrollAccess && tab === "overview" && (
              <div className="pr-layout pr-run-layout">
                <div className="pr-stack">
                  {!data.rulesConfigured && (
                    <div className="pr-rule-state">
                      <AlertCircle size={15} />
                      <span>
                        <strong>Payroll rules are not configured.</strong>{" "}
                        Preview and generation are unavailable until the owner
                        completes payroll foundations in{" "}
                        <a href="/settings">Settings</a>.
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
                        <span>
                          Pay date {dateLabel(currentPreview.payDate)}
                        </span>
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
                                  Generation is blocked by these returned
                                  issues:
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
                                    There are no payable staff statements in
                                    this preview. The system does not replace
                                    missing attendance with estimates.
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
                      {role === "finance" && (
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
                            <strong>
                              No submitted batches awaiting review
                            </strong>
                          </div>
                        ))}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {payrollAccess && tab === "batches" && (
              <PayrollBatchesSection
                data={data}
                role={role}
                owner={owner}
                pending={pending}
                canSubmitOnDate={canSubmitOnDate}
                payrollAccess={payrollAccess}
                openDecision={openDecision}
                onSetAdjustForm={(statement) => {
                  setAdjustForm({
                    statementId: String(statement.id),
                    kind: "bonus",
                    amount: "",
                    reason: "",
                  });
                  setTab("onboarding");
                }}
                onSetPaidForm={(statement) => {
                  setPaidForm({
                    statementId: String(statement.id),
                    transferReference: "",
                    confirmed: false,
                  });
                  setTab("onboarding");
                }}
              />
            )}

            {payrollAccess && tab === "rates" && (
              <PayrollRatesSection
                data={data}
                activeStaff={activeStaff}
                owner={owner}
                pending={pending}
                rateForm={rateForm}
                setRateForm={setRateForm}
                onSubmitRate={submitRate}
                openDecision={openDecision}
              />
            )}

            {payrollAccess && tab === "onboarding" && (
              <div className="pr-layout">
                <div className="pr-stack">
                  <section className="pr-card">
                    <header className="pr-card-head">
                      <div>
                        <h2>Staff directory</h2>
                        <p>
                          Names, roles and account status only. Sensitive bank
                          details and private wallet balances are not shown
                          here.
                        </p>
                      </div>
                      <Users size={17} color="#54856a" />
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
                  <section className="pr-card">
                    <header className="pr-card-head">
                      <div>
                        <h2>Course terms</h2>
                        <p>
                          Capture the exact start date and weekly frequency used
                          by the payroll service.
                        </p>
                      </div>
                      <CalendarDays size={17} color="#54856a" />
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
                          Once billing students exist, add a course start date
                          and frequency. A missing course is not treated as a
                          zero-earnings lesson.
                        </p>
                      </div>
                    )}
                  </section>
                  {owner && (
                    <div className="pr-card" id="pr-adjust-form">
                      <header className="pr-card-head">
                        <div>
                          <h2>Statement adjustments</h2>
                          <p>
                            Adjustments and removals always require a written
                            reason and are included in the statement history.
                          </p>
                        </div>
                        <Plus size={17} color="#54856a" />
                      </header>
                      <div className="pr-card-body">
                        {!allHistorical.some(
                          (item) => item.batch.status === "draft"
                        ) ? (
                          <div className="pr-empty">
                            <strong>No open drafts to adjust</strong>
                            <p>
                              Owner adjustments are available only while a
                              generated batch is still a draft.
                            </p>
                          </div>
                        ) : (
                          <form className="pr-form" onSubmit={submitAdjustment}>
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
                                {allHistorical
                                  .filter(
                                    (item) => item.batch.status === "draft"
                                  )
                                  .map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.staff_name} ·{" "}
                                      {dateLabel(item.batch.pay_date)} ·{" "}
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
                                      kind: event.target
                                        .value as typeof adjustForm.kind,
                                    })
                                  }
                                >
                                  <option value="bonus">Bonus</option>
                                  <option value="deduction">Deduction</option>
                                  <option value="loan_deduction">
                                    Loan deduction
                                  </option>
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
                                value={adjustForm.reason}
                                onChange={(event) =>
                                  setAdjustForm({
                                    ...adjustForm,
                                    reason: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <button
                              className="pr-button secondary"
                              type="submit"
                              disabled={
                                pending ||
                                !allHistorical.some(
                                  (item) => item.batch.status === "draft"
                                )
                              }
                            >
                              Add documented adjustment
                            </button>
                            {selectedStatement?.batch.status === "draft" &&
                            selectedStatement.adjustments?.length ? (
                              <div className="pr-section-rule">
                                <strong style={{ fontSize: 10 }}>
                                  Existing adjustments
                                </strong>
                                {selectedStatement.adjustments.map(
                                  (adjustment) => (
                                    <div
                                      className="pr-proposal"
                                      key={adjustment.id}
                                    >
                                      <div className="pr-proposal-top">
                                        <span>
                                          <h3>
                                            {label(adjustment.kind)} ·{" "}
                                            {money(
                                              adjustment.amount,
                                              selectedStatement.currency
                                            )}
                                          </h3>
                                          <p>{adjustment.reason}</p>
                                        </span>
                                        <button
                                          type="button"
                                          className="pr-button danger small"
                                          disabled={pending}
                                          onClick={() =>
                                            openDecision(
                                              "Remove adjustment?",
                                              "A written reversal reason is required. This records a removal; it does not erase the adjustment history.",
                                              {
                                                action: "remove_adjustment",
                                                statementId:
                                                  selectedStatement.id,
                                                adjustmentId: adjustment.id,
                                              },
                                              "Remove with reason",
                                              true
                                            )
                                          }
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            ) : null}
                          </form>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <aside className="pr-stack">
                  <section className="pr-card">
                    <header className="pr-card-head">
                      <div>
                        <h2>Add course terms</h2>
                        <p>
                          Only current billing students returned by the service
                          are selectable.
                        </p>
                      </div>
                    </header>
                    <div className="pr-card-body">
                      {data.billingStudents.length === 0 ? (
                        <div className="pr-empty">
                          <strong>Billing students are missing</strong>
                          <p>
                            There are no billing students to assign. Complete
                            student billing setup before adding a course.
                          </p>
                        </div>
                      ) : (
                        <form className="pr-form" onSubmit={submitCourse}>
                          <label className="pr-field">
                            <span>Course change</span>
                            <select
                              value={courseForm.mode}
                              onChange={(event) =>
                                setCourseForm({
                                  ...courseForm,
                                  mode: event.target.value as
                                    | "initial"
                                    | "frequency_change",
                                  studentId: "",
                                  startDate: "",
                                  effectiveFrom: "",
                                })
                              }
                            >
                              <option value="initial">
                                Add initial course terms
                              </option>
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
                                    (course) =>
                                      String(course.student_id) === studentId
                                  )
                                  .sort((a, b) =>
                                    b.effective_from.localeCompare(
                                      a.effective_from
                                    )
                                  )[0];
                                setCourseForm({
                                  ...courseForm,
                                  studentId,
                                  startDate:
                                    courseForm.mode === "initial"
                                      ? ""
                                      : match?.start_date || "",
                                  effectiveFrom:
                                    courseForm.mode === "initial"
                                      ? ""
                                      : nextFuture28th(),
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
                                          String(course.student_id) ===
                                          String(student.id)
                                      )
                                    : data.courses.some(
                                        (course) =>
                                          String(course.student_id) ===
                                          String(student.id)
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
                            <>
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
                                <small className="pr-subtitle">
                                  Initial course terms take effect on the exact
                                  original start date.
                                </small>
                              </label>
                            </>
                          ) : (
                            <>
                              <label className="pr-field">
                                <span>
                                  Original course start date · retained
                                </span>
                                <input
                                  type="date"
                                  readOnly
                                  value={originalCourseStart}
                                />
                              </label>
                              <label className="pr-field">
                                <span>Frequency change effective from</span>
                                <input
                                  type="date"
                                  readOnly
                                  value={nextFuture28th()}
                                />
                                <small className="pr-subtitle">
                                  A frequency change begins at the next future
                                  28th; the original start date stays unchanged.
                                </small>
                              </label>
                            </>
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
                        </form>
                      )}
                    </div>
                  </section>
                  <BankPanel
                    profileId={data.profile.id}
                    profileName={data.profile.name}
                    staff={data.staff}
                    ownOnly={false}
                    initialOnly={false}
                    pending={pending}
                    onSave={postAction}
                  />
                  {owner && (
                    <section className="pr-card">
                      <header className="pr-card-head">
                        <div>
                          <h2>Manual transfer records</h2>
                          <p>For owner-confirmed transfers after approval.</p>
                        </div>
                        <Banknote size={17} color="#54856a" />
                      </header>
                      <div className="pr-card-body">
                        <div className="pr-section-rule">
                          {allHistorical.filter(
                            (item) =>
                              item.batch.status === "approved" &&
                              !item.paid_at &&
                              item.net > 0
                          ).length === 0 ? (
                            <p className="pr-subtitle">
                              There are no approved, unpaid positive-net
                              statements returned for this period. Negative-net
                              rows carry forward as debt, not transfers.
                            </p>
                          ) : (
                            allHistorical
                              .filter(
                                (item) =>
                                  item.batch.status === "approved" &&
                                  !item.paid_at &&
                                  item.net > 0
                              )
                              .map((item) => (
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
                                      onClick={() =>
                                        setPaidForm({
                                          statementId: String(item.id),
                                          transferReference: "",
                                          confirmed: false,
                                        })
                                      }
                                    >
                                      Record
                                    </button>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                  {owner && (
                    <section className="pr-card">
                      <header className="pr-card-head">
                        <div>
                          <h2>Historical admin parent count</h2>
                          <p>
                            Owner-confirmed records for an earlier selected
                            payday.
                          </p>
                        </div>
                        <Users size={17} color="#54856a" />
                      </header>
                      <div className="pr-card-body">
                        <p className="pr-status-note">
                          Source-verified historical counts only.
                        </p>
                        <form
                          className="pr-form"
                          onSubmit={submitAdminSnapshot}
                          style={{ marginTop: 12 }}
                        >
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
                          <label className="pr-field">
                            <span>Selected payday</span>
                            <input
                              type="date"
                              required
                              readOnly
                              value={payDate}
                            />
                            <small className="pr-subtitle">
                              Uses the payday selected above. Future pay dates
                              are not allowed.
                            </small>
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
                              placeholder="Enter the confirmed archived count"
                            />
                            <small className="pr-subtitle">
                              Enter the count from the source record; no default
                              or estimate is provided.
                            </small>
                          </label>
                          <label className="pr-field">
                            <span>Source and reason</span>
                            <textarea
                              required
                              minLength={5}
                              maxLength={2000}
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
                              I confirm this is the actual archived count for
                              this admin and payday, supported by the source
                              stated above.
                            </span>
                          </label>
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
                            Save confirmed historical count
                          </button>
                        </form>
                      </div>
                    </section>
                  )}
                  {owner && (
                    <section className="pr-card">
                      <header className="pr-card-head">
                        <div>
                          <h2>Record completed transfer</h2>
                          <p>
                            Only confirm an already completed manual bank
                            transfer.
                          </p>
                        </div>
                        <Landmark size={17} color="#54856a" />
                      </header>
                      <div className="pr-card-body">
                        {paidForm.statementId ? (
                          <form className="pr-form" onSubmit={submitPaid}>
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
                                <option value="">
                                  Choose approved statement
                                </option>
                                {allHistorical
                                  .filter(
                                    (item) =>
                                      item.batch.status === "approved" &&
                                      !item.paid_at &&
                                      item.net > 0
                                  )
                                  .map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.staff_name} ·{" "}
                                      {dateLabel(item.batch.pay_date)} ·{" "}
                                      {money(item.net, item.currency)}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label className="pr-field">
                              <span>Transfer reference</span>
                              <input
                                required
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
                                I confirm this bank transfer has already
                                completed. I understand this only records the
                                transfer and does not send money.
                              </span>
                            </label>
                            <div className="pr-action-row">
                              <button
                                className="pr-button"
                                type="submit"
                                disabled={pending || !paidForm.confirmed}
                              >
                                Mark completed transfer
                              </button>
                              <button
                                className="pr-button outline"
                                type="button"
                                onClick={() =>
                                  setPaidForm({
                                    statementId: "",
                                    transferReference: "",
                                    confirmed: false,
                                  })
                                }
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="pr-empty">
                            <strong>No statement selected</strong>
                            <p>
                              Select an approved positive-net statement to
                              record a completed transfer. Negative net is debt
                              carried forward, never a negative bank transfer.
                            </p>
                            <button
                              type="button"
                              className="pr-button secondary small"
                              onClick={() => {
                                const item = allHistorical.find(
                                  (entry) =>
                                    entry.batch.status === "approved" &&
                                    !entry.paid_at &&
                                    entry.net > 0
                                );
                                if (item)
                                  setPaidForm({
                                    statementId: String(item.id),
                                    transferReference: "",
                                    confirmed: false,
                                  });
                              }}
                              disabled={
                                !allHistorical.some(
                                  (item) =>
                                    item.batch.status === "approved" &&
                                    !item.paid_at &&
                                    item.net > 0
                                )
                              }
                            >
                              Select an approved statement
                            </button>
                          </div>
                        )}
                      </div>
                    </section>
                  )}
                </aside>
              </div>
            )}
          </>
        )}
        <footer className="pr-footer">
          <span>ProsperWork · Music Concepts</span>
          <span>Private staff pay · verified attendance only</span>
        </footer>
      </div>

      <PayrollAdjustmentModal
        modal={modal}
        modalReason={modalReason}
        setModalReason={setModalReason}
        modalBusy={modalBusy}
        pending={pending}
        error={error}
        onClose={() => setModal(null)}
        onSubmitModal={submitModal}
      />
    </main>
  );
}
