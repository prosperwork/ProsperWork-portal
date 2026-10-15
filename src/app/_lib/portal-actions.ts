import type {
  AcademyData,
  AuditEntry,
  Currency,
  Expense,
  HomeworkItem,
  Lead,
  Lesson,
  Payment,
  PayrollItem,
  Resource,
  Role,
  Student,
} from "../../lib/types";
import { makeId, niceDate, roleNames } from "./portal-formatters";
import type { FormKind } from "../_components/modals/ActionModal";

export type FormSubmitContext = {
  modal: FormKind;
  values: Record<string, string>;
  role: Role;
  data: AcademyData;
  profileName?: string;
  todayKey: string;
};

export type FormSubmitResult = {
  updater: (current: AcademyData) => AcademyData;
  notificationMessage: string;
  createdStudentId?: string;
};

/**
 * Pure generator for updating portal data state upon submitting an ActionModal form.
 * Decouples the business logic and audit entry creation from the UI component.
 */
export function handleActionModalSubmit({
  modal,
  values,
  role,
  data,
  profileName,
  todayKey,
}: FormSubmitContext): FormSubmitResult | null {
  if (modal === "student") {
    const student: Student = {
      id: makeId("stu"),
      name: values.name,
      dob: values.dob,
      parentName: values.parentName,
      parentEmail: values.parentEmail,
      instrument: values.instrument,
      teacherName: data.staff.find((s) => s.id === values.teacherName || s.name === values.teacherName)?.name || values.teacherName || "Assigned Teacher",
      adminName: data.staff.find((s) => s.id === values.adminName || s.name === values.adminName)?.name || values.adminName || "Academy Administration",
      timezone: values.timezone,
      consent: values.consent === "true",
      rank: "Novice",
      songsDone: [],
      songsToDo: [],
      status: "active",
      monthlyLessons: 4,
      lessonsTaken: 0,
    };
    return {
      createdStudentId: student.id,
      notificationMessage: "Student profile created with DOB and consent recorded.",
      updater: (current) => ({
        ...current,
        students: [student, ...current.students],
        audit: [
          {
            id: makeId("audit"),
            action: "Student enrolled",
            record: student.name,
            actor: roleNames[role],
            at: new Date().toISOString(),
            detail: `DOB recorded; social consent ${student.consent ? "granted" : "not granted"}.`,
          },
          ...current.audit,
        ],
      }),
    };
  }

  if (modal === "lead") {
    const lead: Lead = {
      id: makeId("lead"),
      parentName: values.parentName,
      childName: values.childName,
      email: values.email,
      phone: values.phone,
      instrument: values.instrument,
      source: values.source,
      referralFrom: values.referralFrom || undefined,
      preferredSlots: values.preferredSlots
        ? values.preferredSlots.split(",").map((s) => s.trim())
        : [],
      notes: values.notes || "",
      status: "new",
      arrivedAt: new Date().toISOString(),
      owner: roleNames[role],
    };
    return {
      notificationMessage: "Lead captured. First response timer is ticking.",
      updater: (current) => ({
        ...current,
        leads: [lead, ...current.leads],
        audit: [
          {
            id: makeId("audit"),
            action: "Lead captured",
            record: lead.parentName,
            actor: roleNames[role],
            at: new Date().toISOString(),
            detail: `Enquiry from ${lead.source}; response timer started.`,
          },
          ...current.audit,
        ],
      }),
    };
  }

  if (modal === "lesson") {
    const targetStudent = data.students.find((s) => s.id === values.studentId);
    const customDuration = values.durationMinutes ? Number(values.durationMinutes) : undefined;
    const lesson: Lesson = {
      id: makeId("les"),
      studentId: values.studentId,
      studentName: targetStudent ? targetStudent.name : "Learner",
      teacherName: data.staff.find((s) => s.id === values.teacherName || s.name === values.teacherName)?.name || values.teacherName || "Assigned Teacher",
      adminName: data.staff.find((s) => s.id === values.adminName || s.name === values.adminName)?.name || values.adminName || "",
      title: values.title?.trim() || "Music Lesson",
      startsAt: new Date(values.startsAt).toISOString(),
      studentTimezone: targetStudent ? targetStudent.timezone : "Africa/Lagos",
      instrument: targetStudent ? targetStudent.instrument : "Piano",
      kind: (values.kind as Lesson["kind"]) || "standard",
      status: "scheduled",
      notes: values.notes || "",
      nextTopics: "",
      durationMinutes: customDuration,
      durationReason: customDuration ? values.durationReason : undefined,
    };
    return {
      notificationMessage: "Class scheduled. Added to both teacher and student diaries.",
      updater: (current) => ({
        ...current,
        lessons: [lesson, ...current.lessons],
        audit: [
          {
            id: makeId("audit"),
            action: "Class scheduled",
            record: `${lesson.studentName} · ${lesson.title}`,
            actor: roleNames[role],
            at: new Date().toISOString(),
            detail: `Scheduled for ${niceDate(lesson.startsAt)} (student timezone: ${lesson.studentTimezone}).`,
          },
          ...current.audit,
        ],
      }),
    };
  }

  if (modal === "payment") {
    const payment: Payment = {
      id: makeId("pay"),
      parentName: values.parentName,
      studentName: values.studentName,
      amount: Number(values.amount),
      currency: (values.currency as Currency) || "NGN",
      dueDate: values.dueDate,
      terms: (values.terms as Payment["terms"]) || "upfront",
      referralDiscount: Number(values.referralDiscount) || 0,
      status: "due",
    };
    return {
      notificationMessage: "Payment record created. Invoice available for this family.",
      updater: (current) => ({
        ...current,
        payments: [payment, ...current.payments],
        audit: [
          {
            id: makeId("audit"),
            action: "Billing entry created",
            record: `${payment.parentName} · ${payment.amount} ${payment.currency}`,
            actor: roleNames[role],
            at: new Date().toISOString(),
            detail: `Terms: ${payment.terms}; referral deduction ${payment.referralDiscount}.`,
          },
          ...current.audit,
        ],
      }),
    };
  }

  if (modal === "expense") {
    const expense: Expense = {
      id: makeId("exp"),
      title: values.title,
      category: values.category,
      amount: Number(values.amount),
      currency: (values.currency as Currency) || "NGN",
      date: values.date,
    };
    return {
      notificationMessage: "Expense logged in academy accounts.",
      updater: (current) => ({
        ...current,
        expenses: [expense, ...current.expenses],
        audit: [
          {
            id: makeId("audit"),
            action: "Expense logged",
            record: `${expense.title} · ${expense.amount} ${expense.currency}`,
            actor: roleNames[role],
            at: new Date().toISOString(),
            detail: `Category ${expense.category}.`,
          },
          ...current.audit,
        ],
      }),
    };
  }

  if (modal === "resource") {
    const resource: Resource = {
      id: makeId("res"),
      title: values.title,
      type: values.type as Resource["type"],
      instrument: values.instrument,
      level: values.level,
      summary: values.summary || "",
    };
    return {
      notificationMessage: "Curriculum item added to the shared library.",
      updater: (current) => ({
        ...current,
        resources: [resource, ...current.resources],
        audit: [
          {
            id: makeId("audit"),
            action: "Resource added",
            record: resource.title,
            actor: roleNames[role],
            at: new Date().toISOString(),
            detail: `Curriculum item: ${resource.type} · ${resource.level}.`,
          },
          ...current.audit,
        ],
      }),
    };
  }

  if (modal === "homework") {
    const target = data.students.find((s) => s.id === values.studentId);
    const item: HomeworkItem = {
      id: makeId("hw"),
      studentId: values.studentId,
      studentName: target ? target.name : "Learner",
      teacherName: profileName || "Teacher",
      title: values.title,
      dueDate: values.dueDate,
      note: values.note || "",
      status: "assigned",
    };
    return {
      notificationMessage: "Practice assignment sent to the student notebook.",
      updater: (current) => ({
        ...current,
        homework: [item, ...current.homework],
        audit: [
          {
            id: makeId("audit"),
            action: "Homework assigned",
            record: `${item.studentName} · ${item.title}`,
            actor: roleNames[role],
            at: new Date().toISOString(),
            detail: `Due ${niceDate(item.dueDate)}.`,
          },
          ...current.audit,
        ],
      }),
    };
  }

  if (modal === "payroll") {
    const item: PayrollItem = {
      id: makeId("payr"),
      staffName: values.staffName,
      role: values.role as Role,
      period: todayKey.slice(0, 7),
      currency: (values.currency as Currency) || "NGN",
      base: Number(values.base),
      standardLessons: Number(values.standardLessons),
      trialLessons: Number(values.trialLessons),
      coverLessons: Number(values.coverLessons),
      bonus: Number(values.bonus) || 0,
      deduction: Number(values.deduction) || 0,
      deductionReason: values.deductionReason || "",
      status: "draft",
    };
    return {
      notificationMessage: "Payroll entry saved as draft for Super Admin approval.",
      updater: (current) => ({
        ...current,
        payroll: [item, ...current.payroll],
        audit: [
          {
            id: makeId("audit"),
            action: "Payroll drafted",
            record: `${item.staffName} · ${item.role}`,
            actor: roleNames[role],
            at: new Date().toISOString(),
            detail: `Maker-checker: draft submitted for Super Admin review.`,
          },
          ...current.audit,
        ],
      }),
    };
  }

  return null;
}
