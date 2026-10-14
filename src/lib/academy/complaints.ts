import { z } from "zod";

export const COMPLAINT_CATEGORIES = [
  { value: "lesson_quality", label: "Lesson Quality & Teaching" },
  { value: "punctuality", label: "Teacher Punctuality & Attendance" },
  { value: "scheduling", label: "Scheduling & Rescheduling" },
  { value: "billing", label: "Billing & Invoices" },
  { value: "technical", label: "Technical & Virtual Classroom" },
  { value: "customer_service", label: "Customer Service & Admin" },
  { value: "other", label: "General Concern / Other" },
] as const;

export type ComplaintCategory =
  | "lesson_quality"
  | "punctuality"
  | "scheduling"
  | "billing"
  | "technical"
  | "customer_service"
  | "other";

export type ComplaintUrgency = "normal" | "high" | "urgent";
export type ComplaintStatus = "open" | "in_progress" | "resolved";

export interface ComplaintRecord {
  id: string;
  ticket_number: string;
  parent_id: string;
  parent_name: string;
  parent_email: string;
  student_id: string | null;
  student_name: string | null;
  category: ComplaintCategory;
  urgency: ComplaintUrgency;
  subject: string;
  message: string;
  status: ComplaintStatus;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export const createComplaintSchema = z
  .object({
    action: z.literal("create"),
    studentId: z.string().trim().optional().nullable(),
    studentName: z.string().trim().max(120).optional().nullable(),
    category: z.enum([
      "lesson_quality",
      "punctuality",
      "scheduling",
      "billing",
      "technical",
      "customer_service",
      "other",
    ]),
    urgency: z.enum(["normal", "high", "urgent"]).default("normal"),
    subject: z.string().trim().min(3).max(200),
    message: z.string().trim().min(10).max(5000),
  })
  .strict();

export const updateComplaintSchema = z
  .object({
    action: z.enum(["update_status", "resolve"]),
    complaintId: z.string().uuid(),
    status: z.enum(["open", "in_progress", "resolved"]),
    resolutionNotes: z.string().trim().min(3).max(5000),
    notifyParent: z.boolean().default(true),
  })
  .strict();

export const complaintActionSchema = z.discriminatedUnion("action", [
  createComplaintSchema,
  updateComplaintSchema,
]);

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;
export type ComplaintActionInput = z.infer<typeof complaintActionSchema>;

export function categoryLabel(cat: ComplaintCategory | string): string {
  const match = COMPLAINT_CATEGORIES.find((c) => c.value === cat);
  return match ? match.label : cat.replace(/_/g, " ");
}

export function urgencyBadge(urgency: ComplaintUrgency | string): {
  label: string;
  className: string;
} {
  switch (urgency) {
    case "urgent":
      return { label: "Urgent", className: "badge-urgent" };
    case "high":
      return { label: "High Priority", className: "badge-high" };
    default:
      return { label: "Standard", className: "badge-normal" };
  }
}

export function statusBadge(status: ComplaintStatus | string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "resolved":
      return { label: "Resolved", className: "badge-resolved" };
    case "in_progress":
      return { label: "Under Review", className: "badge-in-progress" };
    default:
      return { label: "Submitted", className: "badge-open" };
  }
}
