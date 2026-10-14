import { z } from "zod";

export const academySettingsSchema = z.object({
  standardMinutes: z.number().int().min(45).max(60),
  trialMinutes: z.number().int().min(45).max(60),
  coverMinutes: z.number().int().min(45).max(60),
  rescheduleNoticeHours: z.number().int().min(2).max(72),
  adminConcurrentClasses: z.number().int().min(2).max(3),
  joinBeforeHours: z.number().int().min(0).max(2),
  joinAfterHours: z.number().int().min(5).max(6),
  payrollWeekAnchor: z.enum(["not_configured", "calendar_month", "pay_cycle"]),
  advanceEligibility: z.enum(["not_configured", "owner_selected", "previous_period_verified", "disabled"]),
  vacationAutoApprove: z.boolean(),
  adminParentQuota: z.number().int().min(0).max(1000),
}).strict();
