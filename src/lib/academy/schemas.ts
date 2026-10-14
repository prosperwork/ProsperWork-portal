import { z } from "zod";
import{currencyCode}from"./currency";

const text = z.string().max(4000);
const name = z.string().trim().min(1).max(120);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const amount = z.number().finite().nonnegative().max(1_000_000_000);
const currency = currencyCode;
const zone = z.string().max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Enter a valid timezone, such as Europe/London.");
const role = z.enum(["super_admin", "general_manager", "head_admin", "admin", "hr", "qc", "teacher", "parent", "student", "finance", "sales_marketing", "social_media"]);

export const recordSchemas = {
  students: z.object({
    id, name, dob: date.refine((value) => value <= new Date().toISOString().slice(0, 10), "Date of birth cannot be in the future."),
    parentName: name, parentEmail: z.string().email().max(254), instrument: name,
    teacherName: text, adminName: text, timezone: zone, consent: z.boolean(),
    rank: z.enum(["Novice", "Beginner", "Amateur", "Master"]), songsDone: z.array(name).max(500), songsToDo: z.array(name).max(500),
    status: z.enum(["active", "paused", "inactive"]), monthlyLessons: z.number().int().min(1).max(60), lessonsTaken: z.number().int().nonnegative(),
    admissionStatus: z.enum(["pending_review", "approved", "rejected"]).optional(),
    lessonDuration: z.string().max(80).optional(),
    extraTimeNotes: z.string().max(250).optional(),
    preferredDays: z.string().max(250).optional(),
    gender: z.string().max(80).optional(),
    experience: z.string().max(80).optional(),
    hasInstrument: z.string().max(80).optional(),
    learningGoals: z.string().max(250).optional(),
    specialNeeds: z.string().max(500).optional(),
    notes: z.string().max(500).optional(),
  }).strict(),
  lessons: z.object({
    id, studentId: id, studentName: name, teacherName: name, adminName: text,
    title: name, instrument: name, startsAt: z.string().datetime({ offset: true }), studentTimezone: zone,
    status: z.enum(["scheduled", "teacher_done", "completed", "missed", "cancelled", "rescheduled"]), kind: z.enum(["standard", "trial", "cover"]),
    notes: text, nextTopics: text, requestedSlots: z.array(text).max(10).optional(),
    durationMinutes: z.number().int().min(45).max(180).optional(), durationReason: z.string().trim().max(2000).optional(),
    leaveOriginalKind:z.enum(["standard","trial","cover"]).optional(),
    verification: z.object({ teacher: text, admin: text, at: z.string() }).strict().optional(),
  }).strict(),
  leads: z.object({
    id, parentName: name, email: z.string().email().max(254), phone: z.string().max(40), childName: name, instrument: name,
    source: name, status: z.enum(["new", "contacted", "callback", "trial_requested", "trial_booked", "trial_verified", "converted", "nursery", "winback"]),
    arrivedAt: z.string().datetime({ offset: true }), firstResponseAt: z.string().datetime({ offset: true }).optional(), callbackAt: z.string().optional(),
    owner: text, notes: text, referralFrom: text.optional(), preferredSlots: z.array(text).max(10).optional(), teacherName: text.optional(), adminName: text.optional(),
  }).strict(),
  payments: z.object({
    id, parentName: name, studentName: name, amount, currency, dueDate: date,
    status: z.enum(["due", "receipt_uploaded", "paid"]), terms: z.enum(["upfront", "after_service"]), referralDiscount: amount,
    receiptName: text.optional(), receiptPath: text.optional(),
  }).strict(),
  payroll: z.object({
    id, staffName: name, role: text, period: text, currency, base: amount,
    standardLessons: z.number().int().nonnegative(), trialLessons: z.number().int().nonnegative(), coverLessons: z.number().int().nonnegative(),
    bonus: amount, deduction: amount, deductionReason: text.optional(), status: z.enum(["draft", "pending_approval", "approved", "paid"]),
  }).strict(),
  resources: z.object({ id, title: name, type: z.enum(["song", "guide", "exercise", "video"]), instrument: name, level: name, summary: text, fileId:z.string().uuid().optional(),fileName:z.string().max(200).optional() }).strict(),
  homework: z.object({
    id, studentId: id, studentName: name, title: name, dueDate: date, status: z.enum(["assigned", "submitted", "reviewed"]),
    teacherName: name, note: text, mediaName: text.optional(), mediaPath: text.optional(), submissionNote: text.optional(),
  }).strict(),
  expenses: z.object({ id, title: name, amount, currency, date, category: name }).strict(),
};
export type Module = keyof typeof recordSchemas;
export const batchSchema = z.object({
  changes: z.array(z.object({
    module: z.enum(["students", "lessons", "leads", "payments", "payroll", "resources", "homework", "expenses"]),
    operation: z.enum(["insert", "update"]), record: z.record(z.string(), z.unknown()),
    revision: z.number().int().positive().optional(),
  }).strict()).max(50),
}).strict();
export const accountSchema = z.object({
  email: z.string().email().max(254), name, role, timezone: zone,
}).strict();
