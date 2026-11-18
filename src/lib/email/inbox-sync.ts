import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { provisioningClient } from "@/lib/supabase/server";
import { fetchRoleCodesWithPermission } from "@/lib/academy/roles";
import { fetchPublicAcademyConfig } from "@/lib/academy/catalogs";

export interface SyncResult {
  scanned: number;
  imported: number;
  errors: string[];
}

export function extractCleanEmailReply(text: string): string {
  if (!text) return "";

  const splitPatterns = [
    /\r?\n\s*On\s+.+?(?:wrote|wrote:\s*)$/im,
    /\r?\n\s*On\s+[A-Za-z]+,\s+[A-Za-z0-9\s,:]+<[^>]+>\s*wrote:/im,
    /\r?\n\s*On\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}.+?wrote:/im,
    /\r?\n\s*-+\s*Original Message\s*-+/im,
    /\r?\n\s*From:\s+.*?\r?\nSent:\s+/im,
    /\r?\n\s*_{20,}\s*/m,
    /\r?\n\s*--\s*\r?\n/m,
  ];

  let cleaned = text;
  for (const pattern of splitPatterns) {
    const match = cleaned.search(pattern);
    if (match !== -1) {
      cleaned = cleaned.substring(0, match);
    }
  }

  const lines = cleaned.split(/\r?\n/).filter((line) => !line.trim().startsWith(">"));
  cleaned = lines.join("\n").trim();

  return cleaned || text.trim();
}

export function extractTicketNumber(subject: string, body?: string): string | null {
  const ticketRegex = /CMP-\d{8}-[A-F0-9]+/i;
  const matchSub = subject.match(ticketRegex);
  if (matchSub) return matchSub[0].toUpperCase();

  if (body) {
    const matchBody = body.match(ticketRegex);
    if (matchBody) return matchBody[0].toUpperCase();
  }

  return null;
}

function authResultsFailed(parsed: Awaited<ReturnType<typeof simpleParser>>): boolean {
  const authLines = (parsed.headerLines || [])
    .filter((h) => h.key.toLowerCase() === "authentication-results")
    .map((h) => h.line.toLowerCase());
  if (authLines.length === 0) return false;
  return authLines.some((line) => /\b(dmarc|dkim|spf)=fail\b/.test(line));
}

/**
 * Connects to Spacemail via IMAP, inspects UNSEEN incoming replies to complaint tickets,
 * strictly verifies sender identity against the ticket parent or active academy staff,
 * and ingests verified replies into the complaint chat thread.
 */
export async function syncComplaintEmailReplies(): Promise<SyncResult> {
  const result: SyncResult = {
    scanned: 0,
    imported: 0,
    errors: [],
  };

  const user = process.env.SMTP_USER || "dev@prosperworkmusic.com";
  const pass = process.env.SMTP_PASSWORD;

  if (!pass) {
    result.errors.push("IMAP/SMTP password is not configured.");
    return result;
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "mail.spacemail.com",
    port: parseInt(process.env.IMAP_PORT || "993", 10),
    secure: true,
    auth: { user, pass },
    logger: false,
    emitLogs: false,
  });

  const adminClient = provisioningClient();
  const [allowedStaffRoleList, academyConfig] = await Promise.all([
    fetchRoleCodesWithPermission(adminClient, "complaints.manage"),
    fetchPublicAcademyConfig(adminClient),
  ]);
  const allowedStaffRoles = new Set(allowedStaffRoleList);
  const complaintsInbox = academyConfig.emails.complaints.trim().toLowerCase();
  const academyDomain = complaintsInbox.includes("@") ? `@${complaintsInbox.split("@")[1]}` : "@prosperworkmusic.com";
  let connected = false;

  try {
    await client.connect();
    connected = true;
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Only scan unseen messages from the last 14 days to prevent unbounded inbox DoS
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const searchCriteria = {
        seen: false,
        since,
        or: [
          { subject: "CMP-" },
          { body: "CMP-" },
        ],
      };

      const messages = client.fetch(searchCriteria, {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
      });

      for await (const msg of messages) {
        result.scanned++;

        try {
          const rawSource = msg.source;
          if (!rawSource) continue;

          const parsed = await simpleParser(rawSource);
          const subject = parsed.subject || "";
          const ticketNumber = extractTicketNumber(subject, parsed.text);
          if (!ticketNumber) continue;

          const messageId =
            parsed.messageId ||
            `imap-${msg.uid}-${ticketNumber}-${parsed.date?.getTime() || Date.now()}`;

          const { data: existingMsg } = await adminClient
            .from("pw_complaint_messages")
            .select("id")
            .eq("email_message_id", messageId)
            .maybeSingle();

          if (existingMsg) {
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]).catch(() => undefined);
            continue;
          }

          const { data: complaint, error: compErr } = await adminClient
            .from("pw_complaints")
            .select("id, parent_id, parent_name, parent_email, status")
            .eq("ticket_number", ticketNumber)
            .maybeSingle();

          if (compErr || !complaint) continue;

          const cleanedText = extractCleanEmailReply(parsed.text || "");
          if (!cleanedText || cleanedText.length < 1) continue;

          const senderEmail = parsed.from?.value?.[0]?.address?.trim().toLowerCase() || "";
          const subjectLower = subject.toLowerCase().trim();

          // Ignore our own automated outbound alerts
          const isSystemGenerated =
            senderEmail === complaintsInbox &&
            !subjectLower.startsWith("re:") &&
            !subjectLower.startsWith("fwd:") &&
            !parsed.inReplyTo;

          if (
            isSystemGenerated ||
            cleanedText.includes("Attention Academy Administration") ||
            cleanedText.includes("A new parent complaint") ||
            cleanedText.includes("Official Ticket Receipt") ||
            cleanedText.includes("Review and resolve this ticket")
          ) {
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]).catch(() => undefined);
            continue;
          }

          // Reject spoofed mail failing SPF/DKIM/DMARC authentication checks
          if (authResultsFailed(parsed)) {
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]).catch(() => undefined);
            continue;
          }

          // Never reopen resolved tickets via inbound email regardless of sender
          if (complaint.status === "resolved") {
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]).catch(() => undefined);
            continue;
          }

          let senderId: string | null = null;
          let senderRole: string | null = null;
          let senderName = "";

          if (senderEmail === complaint.parent_email.trim().toLowerCase()) {
            // Exact match to ticket parent
            senderId = complaint.parent_id;
            senderRole = "parent";
            senderName = complaint.parent_name;
          } else if (senderEmail.endsWith(academyDomain)) {
            // Exact official domain match + verify against an active authorized staff profile
            const { data: staffProfile } = await adminClient
              .from("pw_profiles")
              .select("id, name, role, status")
              .ilike("email", senderEmail)
              .eq("status", "active")
              .maybeSingle();

            if (staffProfile && allowedStaffRoles.has(staffProfile.role)) {
              senderId = staffProfile.id;
              senderRole = staffProfile.role;
              senderName = staffProfile.name || "Academy Administration";
            }
          }

          // Reject any third-party or unverified sender
          if (!senderId || !senderRole) {
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]).catch(() => undefined);
            continue;
          }

          const { error: insertErr } = await adminClient
            .from("pw_complaint_messages")
            .insert({
              complaint_id: complaint.id,
              sender_id: senderId,
              sender_name: senderName,
              sender_role: senderRole,
              message: cleanedText.slice(0, 5000),
              email_message_id: messageId,
            });

          if (insertErr) {
            result.errors.push(`Failed inserting reply for #${ticketNumber}`);
            continue;
          }

          await adminClient
            .from("pw_complaints")
            .update({
              status: "in_progress",
              updated_at: new Date().toISOString(),
            })
            .eq("id", complaint.id)
            .neq("status", "resolved");

          await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]).catch(() => undefined);
          result.imported++;
        } catch (msgErr) {
          console.error("Complaint email message sync error:", msgErr);
          result.errors.push(`Error processing message UID ${msg.uid}`);
        }
      }
    } finally {
      lock.release();
    }
  } catch (connErr) {
    console.error("IMAP connection error:", connErr);
    result.errors.push("IMAP connection error.");
  } finally {
    if (connected) {
      await client.logout().catch(() => undefined);
    }
  }

  return result;
}
