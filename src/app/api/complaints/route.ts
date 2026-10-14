import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { identity } from "@/lib/supabase/identity";
import { provisioningClient, sameOrigin } from "@/lib/supabase/server";
import { publicAppUrl } from "@/lib/supabase/app-url.mjs";
import { deliverEmail } from "@/lib/email/transport.mjs";
import {
  complaintActionSchema,
  categoryLabel,
  type ComplaintRecord,
} from "@/lib/academy/complaints";

export const dynamic = "force-dynamic";

const reply = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET(request: Request) {
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") {
      return reply({ error: "Active academy session required." }, 403);
    }

    const { searchParams } = new URL(request.url);
    const filterStatus = searchParams.get("status");
    const query = searchParams.get("q")?.trim().toLowerCase();

    const adminClient = provisioningClient();

    let queryBuilder = adminClient
      .from("pw_complaints")
      .select("*")
      .order("created_at", { ascending: false });

    // Restrict parent to own complaints only
    if (profile.role === "parent") {
      queryBuilder = queryBuilder.eq("parent_id", profile.id);
    } else if (
      ![
        "super_admin",
        "general_manager",
        "head_admin",
        "admin",
        "qc",
      ].includes(profile.role)
    ) {
      return reply(
        { error: "You do not have access to view complaints." },
        403
      );
    }

    if (filterStatus && filterStatus !== "all") {
      queryBuilder = queryBuilder.eq("status", filterStatus);
    }

    const result = await queryBuilder;
    if (result.error) {
      console.error("Failed to load complaints:", result.error);
      return reply({ error: "Complaints could not be loaded." }, 500);
    }

    let list = (result.data || []) as ComplaintRecord[];

    if (query) {
      list = list.filter(
        (c) =>
          c.ticket_number.toLowerCase().includes(query) ||
          c.subject.toLowerCase().includes(query) ||
          c.message.toLowerCase().includes(query) ||
          c.parent_name.toLowerCase().includes(query) ||
          (c.student_name && c.student_name.toLowerCase().includes(query)) ||
          c.category.toLowerCase().includes(query)
      );
    }

    return reply({ complaints: list });
  } catch (error) {
    console.error("GET /api/complaints error:", error);
    return reply({ error: "An unexpected error occurred." }, 500);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return reply({ error: "Invalid request origin." }, 403);
  }

  try {
    const { profile, user } = await identity();
    if (!profile || profile.status !== "active" || !user) {
      return reply({ error: "Active academy account required." }, 403);
    }

    const raw = await request.json().catch(() => null);
    const parsed = complaintActionSchema.safeParse(raw);
    if (!parsed.success) {
      return reply(
        {
          error:
            "Invalid complaint form submission. Please check all required fields.",
        },
        400
      );
    }

    const input = parsed.data;
    const adminClient = provisioningClient();
    const appUrl = publicAppUrl("/").origin;

    if (input.action === "create") {
      const parentName = profile.name || "Guardian";
      const parentEmail =
        profile.email || user.email || "support@prosperworkmusic.com";

      let finalStudentName: string | null = input.studentName || null;

      if (input.studentId && !finalStudentName) {
        const studentRow = await adminClient
          .from("pw_students")
          .select("id,payload")
          .eq("id", input.studentId)
          .maybeSingle();

        if (studentRow.data?.payload) {
          finalStudentName =
            (studentRow.data.payload as any).name ||
            (studentRow.data.payload as any).childName ||
            null;
        }
      }

      const insertResult = await adminClient
        .from("pw_complaints")
        .insert({
          parent_id: profile.id,
          parent_name: parentName,
          parent_email: parentEmail,
          student_id: input.studentId || null,
          student_name: finalStudentName,
          category: input.category,
          urgency: input.urgency,
          subject: input.subject,
          message: input.message,
          status: "open",
        })
        .select()
        .single();

      if (insertResult.error || !insertResult.data) {
        console.error("Failed to insert complaint:", insertResult.error);
        return reply({ error: "Could not file complaint. Please try again." }, 500);
      }

      const complaint = insertResult.data as ComplaintRecord;

      // Send operational email alert to academy complaints inbox
      try {
        await deliverEmail(
          {
            id: randomUUID(),
            lease_id: randomUUID(),
            category: "complaints",
            email: "complaints@prosperworkmusic.com",
            subject: `[Complaint ${complaint.ticket_number}] ${complaint.urgency.toUpperCase()}: ${complaint.subject}`,
            template: "parent_complaint_alert",
            payload: {
              ticketNumber: complaint.ticket_number,
              parentName: complaint.parent_name,
              parentEmail: complaint.parent_email,
              studentName: complaint.student_name,
              category: complaint.category,
              categoryLabel: categoryLabel(complaint.category),
              urgency: complaint.urgency,
              subject: complaint.subject,
              message: complaint.message,
            },
          },
          appUrl
        );
      } catch (emailErr) {
        console.error("Complaint alert email failed:", emailErr);
      }

      // Send confirmation receipt to parent
      try {
        await deliverEmail(
          {
            id: randomUUID(),
            lease_id: randomUUID(),
            category: "complaints",
            email: complaint.parent_email,
            subject: `[${complaint.ticket_number}] We have received your inquiry: ${complaint.subject}`,
            template: "parent_complaint_acknowledgement",
            payload: {
              ticketNumber: complaint.ticket_number,
              parentName: complaint.parent_name,
              studentName: complaint.student_name,
              category: complaint.category,
              categoryLabel: categoryLabel(complaint.category),
              urgency: complaint.urgency,
              subject: complaint.subject,
            },
          },
          appUrl
        );
      } catch (parentEmailErr) {
        console.error("Complaint acknowledgement email failed:", parentEmailErr);
      }

      return reply({
        ok: true,
        message: "Your complaint has been submitted successfully.",
        complaint,
      });
    }

    if (input.action === "update_status" || input.action === "resolve") {
      const allowedRoles = [
        "super_admin",
        "general_manager",
        "head_admin",
        "admin",
        "qc",
      ];
      if (!allowedRoles.includes(profile.role)) {
        return reply(
          { error: "Administrative permission required to resolve complaints." },
          403
        );
      }

      const existingResult = await adminClient
        .from("pw_complaints")
        .select("*")
        .eq("id", input.complaintId)
        .single();

      if (existingResult.error || !existingResult.data) {
        return reply({ error: "Complaint ticket not found." }, 404);
      }

      const prev = existingResult.data as ComplaintRecord;
      const isResolved = input.status === "resolved";

      const updateResult = await adminClient
        .from("pw_complaints")
        .update({
          status: input.status,
          resolution_notes: input.resolutionNotes,
          resolved_by: profile.id,
          resolved_by_name: profile.name,
          resolved_at: isResolved
            ? prev.resolved_at || new Date().toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.complaintId)
        .select()
        .single();

      if (updateResult.error || !updateResult.data) {
        console.error("Failed to update complaint:", updateResult.error);
        return reply({ error: "Could not update complaint status." }, 500);
      }

      const updated = updateResult.data as ComplaintRecord;

      // Notify parent via email if requested
      if (input.notifyParent !== false && updated.parent_email) {
        try {
          await deliverEmail(
            {
              id: randomUUID(),
              lease_id: randomUUID(),
              category: "complaints",
              email: updated.parent_email,
              subject: `[${updated.ticket_number}] Update on your inquiry: ${updated.subject}`,
              template: "parent_complaint_resolved",
              payload: {
                ticketNumber: updated.ticket_number,
                parentName: updated.parent_name,
                subject: updated.subject,
                status: updated.status,
                resolutionNotes: updated.resolution_notes,
                resolvedByName: updated.resolved_by_name,
              },
            },
            appUrl
          );
        } catch (notifyErr) {
          console.error("Parent resolution notification email failed:", notifyErr);
        }
      }

      return reply({
        ok: true,
        message: isResolved
          ? "Complaint marked as resolved."
          : "Complaint status updated.",
        complaint: updated,
      });
    }

    return reply({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("POST /api/complaints error:", error);
    return reply({ error: "An unexpected error occurred." }, 500);
  }
}
