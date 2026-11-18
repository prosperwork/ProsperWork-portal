import { z } from "zod";

const timezoneString = z.string().trim().min(2).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Enter a valid IANA timezone, such as Africa/Lagos or Europe/London.");

const academyEmailsSchema = z.object({
  admissions: z.string().trim().email().max(254),
  complaints: z.string().trim().email().max(254),
  support: z.string().trim().email().max(254),
  fees: z.string().trim().email().max(254),
  info: z.string().trim().email().max(254),
}).strict();

export const academySettingsSchema = z.object({
  standardMinutes: z.number().int().min(1).max(180),
  trialMinutes: z.number().int().min(1).max(180),
  coverMinutes: z.number().int().min(1).max(180),
  rescheduleNoticeHours: z.number().int().min(0).max(72),
  adminConcurrentClasses: z.number().int().min(1).max(20),
  joinBeforeHours: z.number().int().min(0).max(2),
  joinAfterHours: z.number().int().min(5).max(6),
  payrollWeekAnchor: z.enum(["not_configured", "calendar_month", "pay_cycle"]),
  advanceEligibility: z.enum(["not_configured", "owner_selected", "previous_period_verified", "disabled"]),
  vacationAutoApprove: z.boolean(),
  adminParentQuota: z.number().int().min(0).max(1000),
  inactivityTimeoutMinutes: z.number().int().min(15).max(480).optional(),
  defaultTimezone: timezoneString.optional(),
  emails: academyEmailsSchema.optional(),
}).strict();
