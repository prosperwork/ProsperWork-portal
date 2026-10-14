import nodemailer from "nodemailer";
import process from"node:process";

export const senderAliases = Object.freeze({
  admin: "admin@prosperworkmusic.com",
  admissions: "admissions@prosperworkmusic.com",
  support: "support@prosperworkmusic.com",
  payments: "payments@prosperworkmusic.com",
  contact: "contact@prosperworkmusic.com",
  automated: "noreply@prosperworkmusic.com",
});
let transport;
export function smtpTransport() {
  if (!process.env.SMTP_PASSWORD) throw Object.assign(new Error("SMTP is not configured."), { code: "NOT_CONFIGURED" });
  transport ||= nodemailer.createTransport({
    host: "mail.spacemail.com", port: 465, secure: true,
    auth: { user: "info@prosperworkmusic.com", pass: process.env.SMTP_PASSWORD },
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
  switch (job.template) {
    case "owner_test":
      return "Your ProsperWork application SMTP connection is working. This is a verification message, not a password reset.\n\nSupabase continues to send authentication emails separately.";
    case "class_reminder":
      return `${p.title} for ${p.studentName} starts at ${localTime(p.startsAt,p.timezone)} (${p.timezone}).\n\nJoin your private in-app classroom:\n${appUrl}/classroom?lessonId=${encodeURIComponent(p.lessonId)}\n\nCamera and microphone access require your permission. Recordings are not started automatically.`;
    case "payment_reminder":
      return `A payment of ${Math.max(0,Number(p.amount)-Number(p.referralDiscount||0)).toFixed(2)} ${p.currency} for ${p.studentName} is ${p.reminderDay === 1 ? "overdue" : "due"} on ${p.dueDate}.\n\nPlease sign in to view your billing record and upload your payment receipt:\n${appUrl}/workflows\n\nIf you need help, reply to this email.`;
    case "payment_verified":
      return `Your payment of ${Math.max(0,Number(p.amount)-Number(p.referralDiscount||0)).toFixed(2)} ${p.currency} for ${p.studentName} has been verified by the academy.\nReference: ${p.id}\n\nView the record in your academy account:\n${appUrl}/workflows`;
    case "homework_review":
      return `${p.studentName}'s homework "${p.title}" has been awaiting review for 48 hours.\n\nOpen submissions and provide feedback:\n${appUrl}/workflows`;
    case "marketing_update":
      if(typeof p.body!=="string"||!p.body.trim()||typeof p.unsubscribeToken!=="string"||!/^[a-f0-9-]{36}$/i.test(p.unsubscribeToken))throw Object.assign(new Error("Invalid marketing message."),{code:"EMESSAGE"});
      return `${p.body}\n\nYou received this academy update because marketing email consent was recorded.\nStop marketing emails: ${appUrl}/unsubscribe?token=${encodeURIComponent(p.unsubscribeToken)}\nOperational class and billing reminders are separate.`;
    case "academy_notice":
      if(typeof p.body!=="string"||!p.body.trim())throw Object.assign(new Error("Missing notice."),{code:"EMESSAGE"});
      return `${p.body}\n\nOpen your private academy workspace:\n${appUrl}/management\n\nLeave plans and cover assignments are available at:\n${appUrl}/leave`;
    default: throw Object.assign(new Error("Unknown email template."), { code: "EMESSAGE" });
  }
}
export async function deliverEmail(job, appUrl) {
  const from = senderAliases[job.category];
  if (!from) throw Object.assign(new Error("Unknown sender purpose."), { code: "EMESSAGE" });
  const result = await smtpTransport().sendMail({
    from: { name: "ProsperWork Music Academy", address: from },
    replyTo: "info@prosperworkmusic.com",
    to: job.email, subject: job.subject, text: emailText(job, appUrl),
    messageId: `<${job.id}@prosperworkmusic.com>`,
  });
  if (!result.accepted?.length) throw Object.assign(new Error("Delivery was rejected."), { code: "DELIVERY_REJECTED" });
}
