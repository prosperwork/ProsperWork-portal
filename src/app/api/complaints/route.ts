import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, provisioningClient, sameOrigin } from "@/lib/supabase/server";
import { publicAppUrl } from "@/lib/supabase/app-url.mjs";
import {
  sendOrQueueEmail,
  processQueuedComplaintEmails,
} from "@/lib/email/queue";
import {
  complaintActionSchema,
  categoryLabel,
  type ComplaintRecord,
  type ComplaintMessageRecord,
} from "@/lib/academy/complaints";
import { hasPermission } from "@/lib/academy/roles";
import { fetchCatalogItems, fetchPublicAcademyConfig } from "@/lib/academy/catalogs";

export const dynamic = "force-dynamic";

let lastComplaintSyncAt = 0;

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

    const isStaff = await hasPermission(client, profile, "complaints.manage");
    const isParent = !isStaff && (profile.role === "parent" || (await hasPermission(client, profile, "complaints.create")));
    if (!isParent && !isStaff) {
      return reply({ error: "You do not have access to view complaints." }, 403);
    }

    const { searchParams } = new URL(request.url);
    const filterStatus = searchParams.get("status");
    const query = searchParams.get("q")?.trim().toLowerCase();
    const shouldSync = searchParams.get("sync") === "true";

    // Only authorized staff (never parents/impersonated sessions) can trigger sync, with a 30s cooldown
    if (shouldSync && isStaff && !profile.impersonated && Date.now() - lastComplaintSyncAt > 30_000) {
      lastComplaintSyncAt = Date.now();
      try {
        const appUrl = publicAppUrl("/").origin;
        const { syncComplaintEmailReplies } = await import("@/lib/email/inbox-sync");
        await Promise.allSettled([
          syncComplaintEmailReplies(),
          processQueuedComplaintEmails(appUrl),
        ]);
      } catch (syncErr) {
        console.error("Complaint email sync error on request:", syncErr);
      }
    }

    const adminClient = provisioningClient();

    let queryBuilder = adminClient
      .from("pw_complaints")
      .select("*")
      .order("created_at", { ascending: false });

    // Restrict parent to own complaints only
    if (isParent) {
      queryBuilder = queryBuilder.eq("parent_id", profile.id);
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

    if (list.length > 0) {
      const complaintIds = list.map((c) => c.id);
      const messagesRes = await adminClient
        .from("pw_complaint_messages")
        .select("*")
        .in("complaint_id", complaintIds)
        .order("created_at", { ascending: true });

      if (messagesRes.data) {
        const messagesByComplaint = new Map<string, ComplaintMessageRecord[]>();
        for (const msg of messagesRes.data as ComplaintMessageRecord[]) {
          const arr = messagesByComplaint.get(msg.complaint_id) || [];
          arr.push(msg);
          messagesByComplaint.set(msg.complaint_id, arr);
        }
        for (const c of list) {
          c.messages = messagesByComplaint.get(c.id) || [];
        }
      }
    }

    return reply({
      complaints: list,
      currentRole: profile.role,
      currentUserId: profile.id,
      currentName: profile.name,
    });
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
    const { client, profile, user } = await identity();
    if (!profile || profile.status !== "active" || !user) {
      return reply({ error: "Active academy account required." }, 403);
    }
    const blocked = impersonationBlocked(profile);
    if (blocked) return blocked;

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
    const [canManageComplaints, canCreateComplaints, academyConfig] = await Promise.all([
      hasPermission(client, profile, "complaints.manage"),
      hasPermission(client, profile, "complaints.create"),
      fetchPublicAcademyConfig(client),
    ]);

    if (input.action === "create") {
      if (!canCreateComplaints && !canManageComplaints) {
        return reply({ error: "Only parents or authorized staff can file support complaints." }, 403);
      }
      const categoryItems = await fetchCatalogItems(client, "complaint_categories");
      const enabledCategories = categoryItems.filter((c) => c.enabled);
      if (enabledCategories.length > 0 && !enabledCategories.some((c) => c.code === input.category)) {
        return reply({ error: "Selected complaint category is not currently enabled." }, 400);
      }
      const resolvedCategoryLabel = categoryLabel(input.category, categoryItems);
      const parentName = profile.name || "Guardian";
      const parentEmail =
        profile.email || user.email || academyConfig.emails.support;

      let finalStudentId: string | null = null;
      let finalStudentName: string | null = input.studentName || null;

      if (input.studentId) {
        // Query with RLS-bound client (and explicit parent_id match for parents) to prevent cross-family IDOR
        let studentQuery = client
          .from("pw_students")
          .select("id,parent_id,payload")
          .eq("id", input.studentId);
        if (profile.role === "parent") {
          studentQuery = studentQuery.eq("parent_id", profile.id);
        }
        const studentRow = await studentQuery.maybeSingle();
        if (!studentRow.data) {
          return reply({ error: "Selected student is not linked to your account." }, 403);
        }
        finalStudentId = studentRow.data.id;
        if (!finalStudentName && studentRow.data.payload) {
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
          student_id: finalStudentId,
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

      // Send operational email alert to academy complaints inbox and receipt to parent (guaranteed delivery)
      await Promise.allSettled([
        sendOrQueueEmail({
          recipientId: profile.id,
          email: academyConfig.emails.complaints,
          subject: `[Complaint ${complaint.ticket_number}] ${complaint.urgency.toUpperCase()}: ${complaint.subject}`,
          template: "parent_complaint_alert",
          payload: {
            ticketNumber: complaint.ticket_number,
            parentName: complaint.parent_name,
            parentEmail: complaint.parent_email,
            studentName: complaint.student_name,
            category: complaint.category,
            categoryLabel: resolvedCategoryLabel,
            urgency: complaint.urgency,
            subject: complaint.subject,
            message: complaint.message,
          },
          appUrl,
        }),
        sendOrQueueEmail({
          recipientId: complaint.parent_id,
          email: complaint.parent_email,
          subject: `[Receipt #${complaint.ticket_number}] Inquiry Logged: ${complaint.subject}`,
          template: "parent_complaint_acknowledgement",
          payload: {
            ticketNumber: complaint.ticket_number,
            parentName: complaint.parent_name,
            studentName: complaint.student_name,
            category: complaint.category,
            categoryLabel: resolvedCategoryLabel,
            urgency: complaint.urgency,
            subject: complaint.subject,
            message: complaint.message,
          },
          appUrl,
        }),
      ]);

      return reply({
        ok: true,
        message: "Your complaint has been submitted successfully.",
        complaint,
      });
    }

    if (input.action === "update_status" || input.action === "resolve") {
      if (!canManageComplaints) {
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

      const updateData: Record<string, any> = {
        status: input.status,
        updated_at: new Date().toISOString(),
      };
      if (input.resolutionNotes !== undefined) {
        updateData.resolution_notes = input.resolutionNotes;
      }
      if (isResolved) {
        updateData.resolved_by = profile.id;
        updateData.resolved_by_name = profile.name;
        updateData.resolved_at = prev.resolved_at || new Date().toISOString();
      } else if (input.status === "open") {
        updateData.resolved_by = null;
        updateData.resolved_by_name = null;
        updateData.resolved_at = null;
      }

      const updateResult = await adminClient
        .from("pw_complaints")
        .update(updateData)
        .eq("id", input.complaintId)
        .select()
        .single();

      if (updateResult.error || !updateResult.data) {
        console.error("Failed to update complaint:", updateResult.error);
        return reply({ error: "Could not update complaint status." }, 500);
      }

      const updated = updateResult.data as ComplaintRecord;

      // When resolved or requested, send official resolution email to parent (guaranteed retry)
      if ((isResolved || input.notifyParent === true) && updated.parent_email) {
        await sendOrQueueEmail({
          recipientId: updated.parent_id,
          email: updated.parent_email,
          subject: isResolved
            ? `[Resolved #${updated.ticket_number}] Issue Resolved: ${updated.subject}`
            : `[Update #${updated.ticket_number}] Status Update: ${updated.subject}`,
          template: "parent_complaint_resolved",
          payload: {
            ticketNumber: updated.ticket_number,
            parentName: updated.parent_name,
            subject: updated.subject,
            status: updated.status,
            resolutionNotes:
              updated.resolution_notes ||
              "Your inquiry has been investigated and marked as resolved by Academy Administration. Thank you for your partnership.",
            resolvedByName: updated.resolved_by_name || profile.name || "Academy Administration",
          },
          appUrl,
        });
      }

      return reply({
        ok: true,
        message: isResolved
          ? "Complaint marked as resolved."
          : "Complaint status updated.",
        complaint: updated,
      });
    }

    if (input.action === "reply") {
      if (!canManageComplaints && !canCreateComplaints) {
        return reply(
          { error: "You are not authorized to post replies on complaints." },
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

      const complaint = existingResult.data as ComplaintRecord;

      if (!canManageComplaints && complaint.parent_id !== profile.id) {
        return reply(
          { error: "You can only reply to your own inquiries." },
          403
        );
      }

      if (!canManageComplaints && complaint.status === "resolved") {
        return reply(
          {
            error:
              "This ticket has been marked as resolved and closed. Please submit a new inquiry if you need further assistance.",
          },
          400
        );
      }

      const senderName =
        profile.name ||
        (!canManageComplaints ? "Parent" : "Academy Administration");
      const senderRole = profile.role;

      const insertMsgResult = await adminClient
        .from("pw_complaint_messages")
        .insert({
          complaint_id: complaint.id,
          sender_id: profile.id,
          sender_name: senderName,
          sender_role: senderRole,
          message: input.message.trim(),
        })
        .select()
        .single();

      if (insertMsgResult.error || !insertMsgResult.data) {
        console.error("Failed to insert complaint message:", insertMsgResult.error);
        return reply(
          { error: "Could not send reply. Please try again." },
          500
        );
      }

      const newMessage = insertMsgResult.data as ComplaintMessageRecord;

      // Update complaint status and updated_at
      let nextStatus = complaint.status;
      if (canManageComplaints && complaint.status === "open") {
        nextStatus = "in_progress";
      }

      await adminClient
        .from("pw_complaints")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", complaint.id);

      // Deliver reply email alert to the opposite party
      const isStaff = canManageComplaints;
      const recipientEmail = isStaff
        ? complaint.parent_email
        : academyConfig.emails.complaints;
      const recipientName = isStaff
        ? complaint.parent_name
        : "Academy Administration";

      if (recipientEmail) {
        await sendOrQueueEmail({
          recipientId: isStaff ? complaint.parent_id : profile.id,
          email: recipientEmail,
          subject: isStaff
            ? `[Ticket #${complaint.ticket_number}] Response from Academy: ${complaint.subject}`
            : `[Ticket #${complaint.ticket_number}] New reply from ${senderName}: ${complaint.subject}`,
          template: "complaint_reply_alert",
          payload: {
            ticketNumber: complaint.ticket_number,
            subject: complaint.subject,
            recipientName,
            senderName,
            senderRole,
            message: newMessage.message,
          },
          appUrl,
        });
      }

      return reply({
        ok: true,
        message: "Reply sent successfully.",
        messageRecord: newMessage,
        status: nextStatus,
      });
    }

    return reply({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("POST /api/complaints error:", error);
    return reply({ error: "An unexpected error occurred." }, 500);
  }
}
