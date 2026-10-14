import nodemailer from "nodemailer";
import process from "node:process";

/**
 * ProsperWork Music Academy — Centralised Sender Aliases
 * Mapped to the official school email addresses:
 * - Leadership: stephen@prosperworkmusic.com (and aliases)
 * - School Communications: info@prosperworkmusic.com (and aliases)
 * - Administration & Technology: dev@prosperworkmusic.com (and aliases)
 */
export const senderAliases = Object.freeze({
  // Administrative & Technology
  admin: "admin@prosperworkmusic.com",
  automated: "noreply@prosperworkmusic.com",
  technical: "tech@prosperworkmusic.com",
  developer: "dev@prosperworkmusic.com",
  security: "security@prosperworkmusic.com",
  systems: "systems@prosperworkmusic.com",
  alerts: "alerts@prosperworkmusic.com",
  finance: "finance@prosperworkmusic.com",
  accounts: "accounts@prosperworkmusic.com",
  billing: "billing@prosperworkmusic.com",

  // School Communications
  admissions: "admissions@prosperworkmusic.com",
  support: "support@prosperworkmusic.com",
  payments: "fees@prosperworkmusic.com",
  fees: "fees@prosperworkmusic.com",
  contact: "info@prosperworkmusic.com",
  enquiries: "enquiries@prosperworkmusic.com",
  students: "students@prosperworkmusic.com",
  registration: "registration@prosperworkmusic.com",
  courses: "courses@prosperworkmusic.com",
  partnerships: "partnerships@prosperworkmusic.com",
  feedback: "feedback@prosperworkmusic.com",
  complaints: "complaints@prosperworkmusic.com",
  events: "events@prosperworkmusic.com",

  // Leadership
  management: "management@prosperworkmusic.com",
  director: "director@prosperworkmusic.com",
  official: "official@prosperworkmusic.com",
  leadership: "stephen@prosperworkmusic.com",
});

/**
 * Purpose-aware Reply-To mapping so automated responses land in the appropriate inbox
 */
export const replyToAliases = Object.freeze({
  automated: "support@prosperworkmusic.com",
  alerts: "dev@prosperworkmusic.com",
  security: "security@prosperworkmusic.com",
  payments: "fees@prosperworkmusic.com",
  fees: "fees@prosperworkmusic.com",
  admissions: "admissions@prosperworkmusic.com",
  registration: "registration@prosperworkmusic.com",
  students: "students@prosperworkmusic.com",
  complaints: "complaints@prosperworkmusic.com",
  management: "management@prosperworkmusic.com",
  director: "director@prosperworkmusic.com",
  official: "official@prosperworkmusic.com",
  default: "info@prosperworkmusic.com",
});

let transport;
export function smtpTransport() {
  if (!process.env.SMTP_PASSWORD) throw Object.assign(new Error("SMTP is not configured."), { code: "NOT_CONFIGURED" });
  const user = process.env.SMTP_USER || "dev@prosperworkmusic.com";
  transport ||= nodemailer.createTransport({
    host: "mail.spacemail.com", port: 465, secure: true,
    auth: { user, pass: process.env.SMTP_PASSWORD },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 45000,
    logger: false, debug: false,
  });
  return transport;
}

export function safeEmailError(error) {
  return ["EAUTH","ESOCKET","ECONNECTION","ETIMEDOUT","EMESSAGE","EENVELOPE","NOT_CONFIGURED","DELIVERY_REJECTED"].includes(error?.code)
    ? error.code : "DELIVERY_FAILED";
}

function localTime(value, timezone) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: timezone || "Africa/Lagos" }).format(new Date(value));
}

export function emailText(job, appUrl) {
  const p = job.payload;
  const signature = `\n\n--\nProsperWork Music Academy\nWebsite: https://www.prosperworkmusic.com\nPortal: ${appUrl}\nStudent Support: support@prosperworkmusic.com`;

  switch (job.template) {
    case "owner_test":
      return `Your ProsperWork application SMTP connection is working. This is a verification message, not a password reset.\n\nSupabase continues to send authentication emails separately.${signature}`;
    case "class_reminder":
      return `${p.title} for ${p.studentName} starts at ${localTime(p.startsAt,p.timezone)} (${p.timezone}).\n\nJoin your private in-app classroom:\n${appUrl}/classroom?lessonId=${encodeURIComponent(p.lessonId)}\n\nCamera and microphone access require your permission. Recordings are not started automatically.${signature}`;
    case "payment_reminder":
      return `A payment of ${Math.max(0,Number(p.amount)-Number(p.referralDiscount||0)).toFixed(2)} ${p.currency} for ${p.studentName} is ${p.reminderDay === 1 ? "overdue" : "due"} on ${p.dueDate}.\n\nPlease sign in to view your billing record and upload your payment receipt:\n${appUrl}/workflows\n\nFor payment questions or assistance, reply to this email or write to fees@prosperworkmusic.com.${signature}`;
    case "payment_verified":
      return `Your payment of ${Math.max(0,Number(p.amount)-Number(p.referralDiscount||0)).toFixed(2)} ${p.currency} for ${p.studentName} has been verified by the academy.\nReference: ${p.id}\n\nView the record in your academy account:\n${appUrl}/workflows${signature}`;
    case "homework_review":
      return `${p.studentName}'s homework "${p.title}" has been awaiting review for 48 hours.\n\nOpen submissions and provide feedback:\n${appUrl}/workflows${signature}`;
    case "marketing_update":
      if(typeof p.body!=="string"||!p.body.trim()||typeof p.unsubscribeToken!=="string"||!/^[a-f0-9-]{36}$/i.test(p.unsubscribeToken))throw Object.assign(new Error("Invalid marketing message."),{code:"EMESSAGE"});
      return `${p.body}\n\nYou received this academy update because marketing email consent was recorded.\nStop marketing emails: ${appUrl}/unsubscribe?token=${encodeURIComponent(p.unsubscribeToken)}\nOperational class and billing reminders are separate.${signature}`;
    case "account_activated":
      return `Hello ${p.name || "there"},\n\nGreat news! Your ProsperWork Music Academy account has been reviewed and activated by our administration.\n\nYou now have full access to your lessons, classroom, practice schedule, and academy workspace.\n\nSign in to your portal:\n${appUrl}/login\n\nIf you have any questions or need assistance getting started, please reply to this email or contact support@prosperworkmusic.com.${signature}`;
    default: throw Object.assign(new Error("Unknown email template."), { code: "EMESSAGE" });
  }
}

export function emailHtml(job, appUrl) {
  const p = job.payload;
  if (job.template === "account_activated") {
    const name = p.name || "there";
    const roleTitle = typeof p.roleTitle === "string" ? p.roleTitle : "Academy Member";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Academy Account is Active</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f7f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e2924;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f7f4; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; border: 1px solid #dce6df; box-shadow: 0 4px 24px rgba(10, 46, 34, 0.05); overflow: hidden;">
          <tr>
            <td style="background-color: #0d3527; padding: 28px 32px; text-align: left;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 12px;">
                    <div style="width: 38px; height: 38px; background-color: #1a5e46; border-radius: 10px; text-align: center; line-height: 38px; font-size: 18px; color: #ffffff; font-weight: bold;">
                      PW
                    </div>
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="display: block; color: #ffffff; font-size: 17px; font-weight: 700; letter-spacing: -0.3px; line-height: 1.2;">ProsperWork</span>
                    <span style="display: block; color: #8fcaab; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px; margin-top: 2px;">Music Academy Portal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 28px;">
              <div style="display: inline-block; padding: 4px 10px; background-color: #edf6f1; border-radius: 16px; font-size: 11px; font-weight: 700; color: #1c7a5d; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 14px;">
                Account Verified
              </div>
              <h1 style="margin: 0 0 16px; color: #0a2e22; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.3;">
                Your academy account has been activated
              </h1>
              <div style="font-size: 14.5px; line-height: 1.65; color: #374740; margin-bottom: 22px;">
                Hello <strong>${name}</strong>,<br><br>
                Great news! Your <strong>${roleTitle}</strong> account has been approved and activated by the ProsperWork administration. You now have full access to your academy workspace.
              </div>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center" style="border-radius: 10px; background-color: #135b45;">
                    <a href="${appUrl}/login" target="_blank" style="display: inline-block; padding: 13px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px; background-color: #135b45; letter-spacing: 0.1px;">
                      Sign in to Portal &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <div style="padding: 14px 16px; background-color: #f7faf8; border-left: 3px solid #135b45; border-radius: 4px; font-size: 12.5px; line-height: 1.55; color: #5a6e64;">
                <strong>Next Steps:</strong> When you sign in, you can view your private dashboard, confirm any policy acknowledgements, explore your schedule, and access live classroom resources.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f7faf8; padding: 26px 32px; border-top: 1px solid #e6ede8;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size: 11.5px; line-height: 1.6; color: #62756b;">
                    <strong style="color: #0a2e22; font-size: 12px;">ProsperWork Music Academy</strong><br>
                    Official Portal: <a href="https://portal.prosperworkmusic.com" style="color: #135b45; text-decoration: none; font-weight: 600;">portal.prosperworkmusic.com</a><br>
                    Website: <a href="https://www.prosperworkmusic.com" style="color: #135b45; text-decoration: none;">www.prosperworkmusic.com</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 14px; font-size: 11px; line-height: 1.5; color: #7f9187; border-top: 1px solid #eaf0ec; margin-top: 14px;">
                    <strong>Inquiries & Support:</strong> <a href="mailto:info@prosperworkmusic.com" style="color: #135b45; text-decoration: none;">info@prosperworkmusic.com</a> &bull; <a href="mailto:support@prosperworkmusic.com" style="color: #135b45; text-decoration: none;">support@prosperworkmusic.com</a><br>
                    <strong>Admissions:</strong> <a href="mailto:admissions@prosperworkmusic.com" style="color: #135b45; text-decoration: none;">admissions@prosperworkmusic.com</a> &bull; <strong>Accounts & Fees:</strong> <a href="mailto:fees@prosperworkmusic.com" style="color: #135b45; text-decoration: none;">fees@prosperworkmusic.com</a><br><br>
                    <em>This is an official automated notification from ProsperWork Music Academy.</em>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
  return null;
}

export async function deliverEmail(job, appUrl) {
  const from = senderAliases[job.category] || senderAliases.automated;
  if (!from) throw Object.assign(new Error("Unknown sender purpose."), { code: "EMESSAGE" });

  // Intelligent Reply-To routing: never reply to noreply
  const replyTo = replyToAliases[job.category] || replyToAliases.default;

  const html = emailHtml(job, appUrl);
  const options = {
    from: { name: "ProsperWork Music Academy", address: from },
    replyTo,
    to: job.email, subject: job.subject, text: emailText(job, appUrl),
    messageId: `<${job.id}@prosperworkmusic.com>`,
  };
  if (html) options.html = html;

  const result = await smtpTransport().sendMail(options);
  if (!result.accepted?.length) throw Object.assign(new Error("Delivery was rejected."), { code: "DELIVERY_REJECTED" });
}
