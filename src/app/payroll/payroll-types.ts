export type PayrollItem = {
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

export type Adjustment = {
  id: string | number;
  kind: string;
  amount: number;
  reason: string;
};

export type Statement = {
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

export type PreviewStatement = {
  staffId: string | number;
  staffName: string;
  role: string;
  currency: string;
  net: number;
  items: PayrollItem[];
};

export type Issue = {
  staffId: string | number;
  staffName: string;
  message: string;
};

export type Batch = {
  id: string | number;
  pay_date: string;
  status: "draft" | "submitted" | "approved" | "paid" | "rejected";
  revision: number;
  created_at: string;
  approval_mode?: string;
  statements: Statement[];
};

export type Terms = {
  monthlyStudentRate: number;
  trialRate: number;
  coverRate: number;
  baseSalary: number;
  adminExtraParentRate: number;
  adminQuota: number;
  advanceEligible: boolean;
  currency: string;
};

export type Rate = {
  id: string | number;
  staff_id: string | number;
  effective_from: string;
  status?: string;
  reason?: string;
  managementFirstPeriod?: "full_month" | "manual_adjustment";
  terms: Terms;
  proposed_by?: string;
};

export type Staff = {
  id: string | number;
  name: string;
  role: string;
  status: string;
};

export type Course = {
  student_id: string | number;
  student_name: string;
  start_date: string;
  effective_from: string;
  weekly_frequency: number;
};

export type BillingStudent = {
  id: string | number;
  name: string;
};

export type RateDraft = {
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

export type PayrollData = {
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

export type BankDetails = {
  bank_name: string;
  account_name: string;
  account_number: string;
  routing_code: string;
  currency: string;
};

export type Tab = "overview" | "batches" | "rates" | "onboarding";

export type ModalState = {
  title: string;
  description: string;
  action: Record<string, unknown>;
  requireReason?: boolean;
  submitLabel?: string;
} | null;

export const label = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function money(amount: number, currency: string) {
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

export function dateLabel(value?: string | null) {
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

export function isOwnerRole(role: string) {
  return role === "super_admin";
}

export function isPayrollRole(role: string) {
  return role === "finance" || isOwnerRole(role);
}

export function isHRRole(role: string) {
  return role === "hr" || role === "qc";
}

