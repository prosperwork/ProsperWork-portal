import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { provisioningClient } from "@/lib/supabase/server";

export interface SyncResult {
  scanned: number;
  imported: number;
  errors: string[];
}

/**
 * Strips out quoted email headers, signatures, and previous replies
 * so only the fresh parent reply appears in the portal chat thread.
 */
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

  // Filter out any lines starting with '>' (traditional email quote markers)
  const lines = cleaned.split(/\r?\n/).filter((line) => !line.trim().startsWith(">"));
  cleaned = lines.join("\n").trim();

  return cleaned || text.trim();
}

/**
 * Extracts ticket number (e.g. CMP-20261015-DA6905) from email subject or body
 */
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

/**
 * Connects to Spacemail via IMAP, inspects incoming replies to complaint tickets,
 * and ingests new parent responses directly into the complaint chat thread.
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

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search for messages with "CMP-" in the subject
      const searchCriteria = {
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

          if (!ticketNumber) {
            continue; // Not a complaint ticket email
          }

          const messageId =
            parsed.messageId ||
            `imap-${msg.uid}-${ticketNumber}-${parsed.date?.getTime() || Date.now()}`;

          // Check if this email message was already processed
          const { data: existingMsg } = await adminClient
            .from("pw_complaint_messages")
            .select("id")
            .eq("email_message_id", messageId)
            .maybeSingle();

          if (existingMsg) {
            continue; // Already ingested
          }

          // Locate the complaint ticket in database
          const { data: complaint, error: compErr } = await adminClient
            .from("pw_complaints")
            .select("id, parent_id, parent_name, parent_email, status")
            .eq("ticket_number", ticketNumber)
            .maybeSingle();

          if (compErr || !complaint) {
            continue; // Ticket not found or error
          }

          // Clean the message text
          const cleanedText = extractCleanEmailReply(parsed.text || "");
          if (!cleanedText || cleanedText.length < 1) {
            continue;
          }

          // Check if sender matches parent or administration
          const senderEmail = parsed.from?.value?.[0]?.address?.toLowerCase() || "";
          const isFromParent =
            senderEmail === complaint.parent_email.toLowerCase() ||
            !senderEmail.includes("prosperworkmusic.com");

          const senderRole = isFromParent ? "parent" : "admin";
          const senderName = isFromParent
            ? parsed.from?.value?.[0]?.name || complaint.parent_name
            : "Academy Administration";

          // Insert reply into ticket conversation thread
          const { error: insertErr } = await adminClient
            .from("pw_complaint_messages")
            .insert({
              complaint_id: complaint.id,
              sender_id: complaint.parent_id,
              sender_name: senderName,
              sender_role: senderRole,
              message: cleanedText,
              email_message_id: messageId,
            });

          if (insertErr) {
            result.errors.push(
              `Failed inserting reply for #${ticketNumber}: ${insertErr.message}`
            );
            continue;
          }

          // Mark ticket as in_progress and update timestamp
          await adminClient
            .from("pw_complaints")
            .update({
              status: "in_progress",
              updated_at: new Date().toISOString(),
            })
            .eq("id", complaint.id);

          // Mark email as Seen on the mail server
          try {
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]);
          } catch {
            // Non-critical if flag update fails
          }

          result.imported++;
        } catch (msgErr) {
          result.errors.push(
            `Error processing message UID ${msg.uid}: ${
              msgErr instanceof Error ? msgErr.message : String(msgErr)
            }`
          );
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (connErr) {
    result.errors.push(
      `IMAP connection error: ${
        connErr instanceof Error ? connErr.message : String(connErr)
      }`
    );
  }

  return result;
}

