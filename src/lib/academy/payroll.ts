import { z } from "zod";
import{currencyCode}from"./currency";

const money = z.number().finite().min(0).max(1_000_000_000).multipleOf(0.01);
const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Use an actual calendar date.");
const payDate = date.refine(v => v.endsWith("-28"), "Choose the 28th pay date.");
const reason = z.string().trim().min(5).max(2000);
const currency = currencyCode;
export const payrollDateSchema = payDate;
export const payrollActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("salary_end"), staffId: id, endDate: date.nullable(), reason }).strict(),
  z.object({ action: z.literal("propose_rate"), staffId: id, effectiveFrom: date, currency,
    monthlyStudentRate: money, trialRate: money, coverRate: money, baseSalary: money,
    adminExtraParentRate: money, adminQuota: z.number().int().min(0).max(1000),
    advanceEligible: z.boolean(), managementFirstPeriod: z.enum(["full_month","manual_adjustment"]).default("manual_adjustment"), reason }).strict(),
  z.object({ action: z.literal("decide_rate"), id, decision: z.enum(["approve","reject"]), reason }).strict(),
  z.object({ action: z.literal("course"), studentId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), startDate: date, effectiveFrom: date, weeklyFrequency: z.number().int().min(1).max(3) }).strict(),
  z.object({ action: z.literal("bank"), staffId: id, bankName: z.string().trim().min(2).max(120), accountName: z.string().trim().min(2).max(120),
    accountNumber: z.string().trim().min(5).max(64), routingCode: z.string().trim().max(32), currency }).strict(),
  z.object({ action: z.literal("admin_snapshot"), staffId: id, payDate, activeParents: z.number().int().min(0).max(1000), reason }).strict(),
  z.object({ action: z.literal("generate"), payDate }).strict(),
  z.object({ action: z.literal("adjust"), statementId: id, kind: z.enum(["bonus","deduction","loan_deduction"]), amount: money.refine(v=>v>0), reason }).strict(),
  z.object({ action: z.literal("remove_adjustment"), statementId: id, adjustmentId: id, reason }).strict(),
  z.object({ action: z.literal("batch"), id, decision: z.enum(["submit","approve","reject"]), reason: z.string().trim().max(2000).default("") }).strict(),
  z.object({ action: z.literal("paid"), statementId: id, transferReference: z.string().trim().min(5).max(160), confirmed: z.literal(true) }).strict(),
]);

export function nextPayDate() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", year:"numeric",month:"2-digit",day:"2-digit" }).formatToParts(new Date());
  const v = (k: string) => Number(parts.find(p=>p.type===k)?.value);
  const d = new Date(Date.UTC(v("year"),v("month")-1+(v("day")>28?1:0),28));
  return d.toISOString().slice(0,10);
}
