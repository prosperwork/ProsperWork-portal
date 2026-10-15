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
  // Administrative & Technology (verified Spacemail aliases for dev@prosperworkmusic.com)
  admin: "admin@prosperworkmusic.com",
  automated: "noreply@prosperworkmusic.com",
  technical: "tech@prosperworkmusic.com",
  developer: "dev@prosperworkmusic.com",
  security: "security@prosperworkmusic.com",
  systems: "systems@prosperworkmusic.com",
  alerts: "alerts@prosperworkmusic.com",
  finance: "finance@prosperworkmusic.com",
  accounts: "finance@prosperworkmusic.com",
  billing: "finance@prosperworkmusic.com",

  // School Communications (sent via verified admin/finance alias with purpose-aware Reply-To)
  admissions: "admin@prosperworkmusic.com",
  support: "admin@prosperworkmusic.com",
  payments: "finance@prosperworkmusic.com",
  fees: "finance@prosperworkmusic.com",
  contact: "admin@prosperworkmusic.com",
  enquiries: "admin@prosperworkmusic.com",
  students: "admin@prosperworkmusic.com",
  registration: "admin@prosperworkmusic.com",
  courses: "admin@prosperworkmusic.com",
  partnerships: "admin@prosperworkmusic.com",
  feedback: "admin@prosperworkmusic.com",
  complaints: "admin@prosperworkmusic.com",
  events: "admin@prosperworkmusic.com",

  // Leadership
  management: "admin@prosperworkmusic.com",
  director: "admin@prosperworkmusic.com",
  official: "admin@prosperworkmusic.com",
  leadership: "admin@prosperworkmusic.com",
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
    case "account_activated": {
      const isOnboardingRole = ["parent", "student"].includes(p.role);
      const targetPath = isOnboardingRole ? "/onboarding" : "/";
      const actionText = isOnboardingRole ? "Complete your academy onboarding" : "Sign in to your portal";
      return `Hello ${p.name || "there"},\n\nGreat news! Your ProsperWork Music Academy account has been reviewed and activated by our administration.\n\n${isOnboardingRole ? "To complete your setup and access family and lesson records, please review and acknowledge the academy policies:" : "You now have full access to your lessons, classroom, practice schedule, and academy workspace."}\n\n${actionText}:\n${appUrl}${targetPath}\n\nIf you have any questions or need assistance getting started, please reply to this email or contact support@prosperworkmusic.com.${signature}`;
    }
    case "student_registration_alert":
      return `Attention Academy Admissions & Admin,\n\nA new student registration has been submitted and is awaiting your review.\n\n` +
        `Student Details:\n` +
        `• Name: ${p.childName}\n` +
        `• Date of Birth: ${p.dob || "Not provided"}\n` +
        `• Gender: ${p.gender || "Not specified"}\n` +
        `• Instrument: ${p.instrument}\n` +
        `• Experience Level: ${p.experience || "Beginner"}\n` +
        `• Lesson Duration: ${p.lessonDuration || "1 hour (Standard)"}\n` +
        (p.extraTimeNotes ? `• Extra Time Notes: ${p.extraTimeNotes}\n` : "") +
        `• Preferred Schedule: ${p.preferredDays || "Not specified"}\n` +
        (p.learningGoals ? `• Learning Goals: ${p.learningGoals}\n` : "") +
        (p.specialNeeds ? `• Accommodations / Health: ${p.specialNeeds}\n` : "") +
        (p.notes ? `• Special Notes: ${p.notes}\n` : "") +
        `\nGuardian Information:\n` +
        `• Guardian: ${p.parentName}\n` +
        `• Email: ${p.parentEmail}\n\n` +
        `Review and approve this registration in the Academy Portal:\n` +
        `${appUrl}/students${signature}`;
    case "student_registration_received":
      return `Hello ${p.parentName || "Guardian"},\n\n` +
        `Thank you for registering ${p.childName} with ProsperWork Music Academy!\n\n` +
        `We have received your registration details. Our admissions team is currently reviewing your preferred schedule (${p.preferredDays || "Flexible"}) and duration (${p.lessonDuration || "1 hour (Standard)"}) to match ${p.childName} with the ideal qualified instructor.\n\n` +
        `What happens next:\n` +
        `1. Our administration team will review your lesson preferences.\n` +
        `2. You will receive an email confirmation once instructor placement and schedule are approved.\n` +
        `3. Your live classroom and lesson schedule will be activated in your Family Portal.\n\n` +
        `View your family dashboard:\n` +
        `${appUrl}/family${signature}`;
    case "student_admission_approved":
      return `Hello ${p.parentName || "Guardian"},\n\n` +
        `Great news! The registration for ${p.childName} has been approved and enrolled at ProsperWork Music Academy.\n\n` +
        `Enrollment Details:\n` +
        `• Student: ${p.childName}\n` +
        `• Instrument: ${p.instrument}\n` +
        `• Assigned Instructor: ${p.teacherName}\n` +
        `• Lesson Duration: ${p.lessonDuration || "1 hour (Standard)"}\n\n` +
        `You can now access your family portal, view your lessons, and prepare for class:\n` +
        `${appUrl}/family${signature}`;
    case "parent_complaint_alert":
      return `Attention Academy Administration & Quality Team,\n\n` +
        `A new parent complaint / issue ticket has been raised in the Family Portal.\n\n` +
        `Ticket Reference: ${p.ticketNumber}\n` +
        `Urgency: ${p.urgency?.toUpperCase() || "NORMAL"}\n` +
        `Category: ${p.categoryLabel || p.category}\n` +
        `Subject: ${p.subject}\n\n` +
        `Guardian: ${p.parentName} (${p.parentEmail})\n` +
        (p.studentName ? `Student: ${p.studentName}\n` : "") +
        `\nComplaint Details:\n${p.message}\n\n` +
        `Review and resolve this ticket in the Academy Complaints Portal:\n` +
        `${appUrl}/complaints${signature}`;
    case "parent_complaint_acknowledgement":
      return `Hello ${p.parentName || "Guardian"},\n\n` +
        `We have received your inquiry regarding "${p.subject}".\n\n` +
        `Official Ticket Reference: #${p.ticketNumber}\n` +
        `Urgency: ${p.urgency?.toUpperCase() || "NORMAL"}\n` +
        `Category: ${p.categoryLabel || p.category}\n` +
        (p.studentName ? `Student: ${p.studentName}\n` : "") +
        `Status: Under Review by Academy Administration\n\n` +
        `Your Submitted Statement:\n${p.message || p.subject}\n\n` +
        `Our administrative and quality assurance leadership has been notified and is actively investigating your report. We aim to address all parent concerns promptly and with the utmost care.\n\n` +
        `You can track live status or chat with academy leadership in the Academy Portal:\n` +
        `${appUrl}${signature}`;
    case "parent_complaint_resolved":
      return `Hello ${p.parentName || "Guardian"},\n\n` +
        `This is an update regarding your complaint ticket #${p.ticketNumber}: "${p.subject}".\n\n` +
        `Status: ${p.status === "resolved" ? "RESOLVED" : "UNDER REVIEW"}\n` +
        (p.resolvedByName ? `Handled By: ${p.resolvedByName}\n` : "") +
        `\nAcademy Response & Resolution Notes:\n${p.resolutionNotes}\n\n` +
        `You can review your complete inquiry and resolution history in your Family Portal:\n` +
        `${appUrl}/family${signature}`;
    case "complaint_reply_alert":
      return `Hello ${p.recipientName},\n\n` +
        `A new reply has been posted on inquiry #${p.ticketNumber} ("${p.subject}").\n\n` +
        `From: ${p.senderName} (${p.senderRole === "parent" ? "Parent" : "Academy Leadership"})\n\n` +
        `Message:\n${p.message}\n\n` +
        `View the full conversation thread and reply:\n` +
        `${appUrl}${p.senderRole === "parent" ? "/complaints" : "/family"}${signature}`;
    default: throw Object.assign(new Error("Unknown email template."), { code: "EMESSAGE" });
  }
}

function emailWrapper({ title, badge, heading, bodyHtml, buttonLabel, buttonUrl, noteHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f7f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e2924;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f7f4; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; border: 1px solid #dce6df; box-shadow: 0 4px 24px rgba(10, 46, 34, 0.05); overflow: hidden;">
          <tr>
            <td style="background-color: #0d3527; padding: 26px 32px; text-align: left;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 12px;">
                    <div style="width: 38px; height: 38px; background-color: #1a5e46; border-radius: 10px; text-align: center; line-height: 38px; font-size: 18px; color: #ffffff; font-weight: bold;">
                      PW
                    </div>
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="display: block; color: #ffffff; font-size: 17px; font-weight: 700; letter-spacing: -0.3px; line-height: 1.2;">ProsperWork</span>
                    <span style="display: block; color: #8fcaab; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px; margin-top: 2px;">Music Academy</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 34px 32px 28px;">
              ${badge ? `<div style="display: inline-block; padding: 4px 10px; background-color: #edf6f1; border-radius: 16px; font-size: 11px; font-weight: 700; color: #1c7a5d; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 14px;">${badge}</div>` : ""}
              <h1 style="margin: 0 0 16px; color: #0a2e22; font-size: 21px; font-weight: 700; letter-spacing: -0.4px; line-height: 1.3;">
                ${heading}
              </h1>
              <div style="font-size: 14.5px; line-height: 1.65; color: #374740; margin-bottom: 22px;">
                ${bodyHtml}
              </div>
              ${buttonLabel && buttonUrl ? `
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                <tr>
                  <td align="center" style="border-radius: 10px; background-color: #135b45;">
                    <a href="${buttonUrl}" target="_blank" style="display: inline-block; padding: 13px 26px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px; background-color: #135b45; letter-spacing: 0.1px;">
                      ${buttonLabel}
                    </a>
                  </td>
                </tr>
              </table>` : ""}
              ${noteHtml ? `
              <div style="padding: 14px 16px; background-color: #f7faf8; border-left: 3px solid #135b45; border-radius: 4px; font-size: 12.5px; line-height: 1.55; color: #5a6e64;">
                ${noteHtml}
              </div>` : ""}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f7faf8; padding: 24px 32px; border-top: 1px solid #e6ede8;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size: 11.5px; line-height: 1.6; color: #62756b;">
                    <strong style="color: #0a2e22; font-size: 12px;">ProsperWork Music Academy</strong><br>
                    Official Portal: <a href="https://portal.prosperworkmusic.com" style="color: #135b45; text-decoration: none; font-weight: 600;">portal.prosperworkmusic.com</a> &bull; <a href="https://www.prosperworkmusic.com" style="color: #135b45; text-decoration: none;">www.prosperworkmusic.com</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 12px; font-size: 11px; line-height: 1.5; color: #7f9187; border-top: 1px solid #eaf0ec; margin-top: 12px;">
                    <strong>Admissions:</strong> <a href="mailto:admissions@prosperworkmusic.com" style="color: #135b45; text-decoration: none;">admissions@prosperworkmusic.com</a> &bull; <strong>Support:</strong> <a href="mailto:support@prosperworkmusic.com" style="color: #135b45; text-decoration: none;">support@prosperworkmusic.com</a><br><br>
                    <em>ProsperWork Music Academy — Developing Musical Excellence.</em>
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

export function emailHtml(job, appUrl) {
  const p = job.payload;
  if (job.template === "account_activated") {
    const name = p.name || "there";
    const roleTitle = typeof p.roleTitle === "string" ? p.roleTitle : "Academy Member";
    const isOnboardingRole = ["parent", "student"].includes(p.role);
    const targetUrl = isOnboardingRole ? `${appUrl}/onboarding` : `${appUrl}/login`;
    const buttonLabel = isOnboardingRole ? "Complete Academy Onboarding &rarr;" : "Sign in to Portal &rarr;";
    return emailWrapper({
      title: "Your Academy Account is Active",
      badge: "Account Verified",
      heading: "Your academy account has been activated",
      bodyHtml: `Hello <strong>${name}</strong>,<br><br>Great news! Your <strong>${roleTitle}</strong> account has been approved and activated by the ProsperWork administration. You now have full access to your academy workspace.`,
      buttonLabel,
      buttonUrl: targetUrl,
      noteHtml: `<strong>Next Steps:</strong> ${isOnboardingRole ? "Please review and acknowledge the academy policies to complete your onboarding and open your family workspace." : "When you sign in, you can view your private dashboard, explore your schedule, and access live classroom resources."}`
    });
  }

  if (job.template === "student_registration_alert") {
    const targetUrl = `${appUrl}/students`;
    const bodyHtml = `A new student registration has been submitted from the Family Portal and is awaiting administrative review.<br><br>
      <table style="width: 100%; border-collapse: collapse; font-size: 13.5px; margin-top: 10px;">
        <tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64; width: 38%;">Student Name</td><td style="padding: 8px 4px; color: #0a2e22; font-weight: 700;">${p.childName}</td></tr>
        <tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Date of Birth</td><td style="padding: 8px 4px; color: #2a3d34;">${p.dob || "Not provided"}</td></tr>
        <tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Instrument & Level</td><td style="padding: 8px 4px; color: #2a3d34;">${p.instrument} (${p.experience || "Beginner"})</td></tr>
        <tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Lesson Duration</td><td style="padding: 8px 4px; color: #0a2e22; font-weight: 600;">${p.lessonDuration || "1 hour (Standard)"}</td></tr>
        ${p.extraTimeNotes ? `<tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #d97706;">Extra Time Notes</td><td style="padding: 8px 4px; color: #92400e;">${p.extraTimeNotes}</td></tr>` : ""}
        <tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Preferred Schedule</td><td style="padding: 8px 4px; color: #2a3d34;">${p.preferredDays || "Not specified"}</td></tr>
        ${p.learningGoals ? `<tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Learning Goals</td><td style="padding: 8px 4px; color: #2a3d34;">${p.learningGoals}</td></tr>` : ""}
        ${p.specialNeeds ? `<tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Accommodations</td><td style="padding: 8px 4px; color: #2a3d34;">${p.specialNeeds}</td></tr>` : ""}
        <tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Guardian</td><td style="padding: 8px 4px; color: #2a3d34;">${p.parentName} (<a href="mailto:${p.parentEmail}" style="color: #135b45;">${p.parentEmail}</a>)</td></tr>
      </table>`;
    return emailWrapper({
      title: "New Student Registration Awaiting Review",
      badge: "Action Required",
      heading: `New Student Registration: ${p.childName}`,
      bodyHtml,
      buttonLabel: "Review & Enroll in Portal &rarr;",
      buttonUrl: targetUrl,
      noteHtml: "Please review the family's preferred days, duration request, and assign a qualified teacher to finalize admission."
    });
  }

  if (job.template === "student_registration_received") {
    const targetUrl = `${appUrl}/family`;
    const bodyHtml = `Hello <strong>${p.parentName || "Guardian"}</strong>,<br><br>
      Thank you for registering <strong>${p.childName}</strong> with ProsperWork Music Academy!<br><br>
      We have received your registration details for <strong>${p.instrument}</strong> lessons (${p.lessonDuration || "1 hour"}). Our admissions team is currently reviewing your schedule preferences (<em>${p.preferredDays || "Flexible"}</em>) to place ${p.childName} with the ideal teacher.`;
    return emailWrapper({
      title: "Registration Received",
      badge: "Registration Received",
      heading: `We've received ${p.childName}'s registration`,
      bodyHtml,
      buttonLabel: "View Family Workspace &rarr;",
      buttonUrl: targetUrl,
      noteHtml: "<strong>What happens next:</strong> Our school admissions team will confirm instructor assignment and class timing. You will receive an email once enrollment is active."
    });
  }

  if (job.template === "student_admission_approved") {
    const targetUrl = `${appUrl}/family`;
    const bodyHtml = `Hello <strong>${p.parentName || "Guardian"}</strong>,<br><br>
      Great news! The admission and enrollment for <strong>${p.childName}</strong> has been officially confirmed by ProsperWork Music Academy.<br><br>
      <div style="background-color: #f7faf8; padding: 16px; border-radius: 8px; border: 1px solid #dce6df; margin: 16px 0;">
        <strong style="color: #0a2e22; font-size: 15px;">Enrollment Summary</strong><br>
        &bull; <strong>Student:</strong> ${p.childName}<br>
        &bull; <strong>Instrument:</strong> ${p.instrument}<br>
        &bull; <strong>Assigned Teacher:</strong> ${p.teacherName}<br>
        &bull; <strong>Lesson Duration:</strong> ${p.lessonDuration || "1 hour (Standard)"}
      </div>
      You can now sign in to your Family Portal to view upcoming classes, access resources, and enter the live classroom when classes commence.`;
    return emailWrapper({
      title: "Admission Confirmed",
      badge: "Enrollment Confirmed",
      heading: `Welcome ${p.childName} to ProsperWork!`,
      bodyHtml,
      buttonLabel: "Open Family Portal &rarr;",
      buttonUrl: targetUrl,
      noteHtml: "If you have any questions before classes begin, our support desk is ready to help at support@prosperworkmusic.com."
    });
  }

  if (job.template === "parent_complaint_alert") {
    const targetUrl = `${appUrl}/complaints`;
    const urgencyColor = p.urgency === "urgent" ? "#dc2626" : p.urgency === "high" ? "#d97706" : "#2563eb";
    const bodyHtml = `A parent has submitted a formal complaint / support ticket through the Family Portal and is awaiting administrative resolution.<br><br>
      <div style="background-color: #fef2f2; border-left: 4px solid ${urgencyColor}; padding: 12px 16px; margin-bottom: 16px; border-radius: 4px;">
        <strong style="color: #991b1b; font-size: 14px;">Ticket #${p.ticketNumber} &bull; Urgency: ${p.urgency?.toUpperCase() || "NORMAL"}</strong>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13.5px; margin-top: 10px;">
        <tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64; width: 34%;">Subject</td><td style="padding: 8px 4px; color: #0a2e22; font-weight: 700;">${p.subject}</td></tr>
        <tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Category</td><td style="padding: 8px 4px; color: #2a3d34;">${p.categoryLabel || p.category}</td></tr>
        <tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Guardian</td><td style="padding: 8px 4px; color: #2a3d34;">${p.parentName} (<a href="mailto:${p.parentEmail}" style="color: #135b45;">${p.parentEmail}</a>)</td></tr>
        ${p.studentName ? `<tr style="border-bottom: 1px solid #eef2ef;"><td style="padding: 8px 4px; font-weight: 600; color: #5a6e64;">Student</td><td style="padding: 8px 4px; color: #2a3d34; font-weight: 600;">${p.studentName}</td></tr>` : ""}
      </table>
      <div style="margin-top: 16px; padding: 14px; background-color: #f7faf8; border-radius: 6px; border: 1px solid #dce6df;">
        <strong style="color: #0a2e22; font-size: 13px; display: block; margin-bottom: 6px;">Complaint Description:</strong>
        <p style="margin: 0; white-space: pre-line; color: #2a3d34; font-size: 13px; line-height: 1.5;">${p.message}</p>
      </div>`;
    return emailWrapper({
      title: `[${p.ticketNumber}] ${p.subject}`,
      badge: `${p.urgency?.toUpperCase() || "NORMAL"} URGENCY`,
      heading: `Parent Complaint: ${p.subject}`,
      bodyHtml,
      buttonLabel: "Open Complaints Desk &rarr;",
      buttonUrl: targetUrl,
      noteHtml: "Please review and take prompt corrective action. Updating this ticket will automatically notify the family."
    });
  }

  if (job.template === "parent_complaint_acknowledgement") {
    const targetUrl = appUrl;
    const bodyHtml = `Hello <strong>${p.parentName || "Guardian"}</strong>,<br><br>
      Thank you for contacting ProsperWork Music Academy. We have logged your inquiry regarding <strong>${p.subject}</strong> under ticket reference <strong>#${p.ticketNumber}</strong>.<br><br>
      <div style="background-color: #f7faf8; padding: 18px; border-radius: 10px; border: 1px solid #dce6df; margin: 16px 0;">
        <strong style="color: #0a2e22; font-size: 14px; display: block; margin-bottom: 8px;">Official Ticket Receipt</strong>
        &bull; <strong>Ticket Reference:</strong> #${p.ticketNumber}<br>
        &bull; <strong>Category:</strong> ${p.categoryLabel || p.category}<br>
        &bull; <strong>Urgency:</strong> ${p.urgency?.toUpperCase() || "NORMAL"}<br>
        ${p.studentName ? `&bull; <strong>Student / Learner:</strong> ${p.studentName}<br>` : ""}
        &bull; <strong>Status:</strong> Under Review by Academy Administration<br><br>
        <div style="margin-top: 10px; padding-top: 12px; border-top: 1px solid #dce6df;">
          <strong style="color: #0a2e22; font-size: 13px;">Inquiry Subject:</strong> ${p.subject}<br><br>
          <strong style="color: #0a2e22; font-size: 13px;">Your Submitted Statement:</strong>
          <div style="white-space: pre-line; color: #1e2924; font-size: 13.5px; line-height: 1.6; margin-top: 6px; padding: 12px; background: #ffffff; border-radius: 8px; border: 1px solid #e2ece7;">
            ${p.message || p.subject}
          </div>
        </div>
      </div>
      Our administrative and quality assurance leadership has been notified and is actively investigating your report. We aim to address all concerns promptly and with the utmost care. Whenever academy staff replies to this ticket, you will receive an immediate response by email and in your portal.`;
    return emailWrapper({
      title: `Complaint Receipt #${p.ticketNumber}`,
      badge: "Inquiry Receipt",
      heading: `Ticket Receipt #${p.ticketNumber}`,
      bodyHtml,
      buttonLabel: "Open Academy Portal &rarr;",
      buttonUrl: targetUrl,
      noteHtml: "Please keep this receipt for your records. You can check ticket updates or chat with our team at any time in the portal."
    });
  }

  if (job.template === "parent_complaint_resolved") {
    const targetUrl = appUrl;
    const isResolved = p.status === "resolved";
    const bodyHtml = `Hello <strong>${p.parentName || "Guardian"}</strong>,<br><br>
      We are writing to provide an update regarding your complaint ticket <strong>#${p.ticketNumber}</strong> (<em>${p.subject}</em>).<br><br>
      <div style="background-color: ${isResolved ? "#f0fdf4" : "#eff6ff"}; padding: 16px; border-radius: 8px; border: 1px solid ${isResolved ? "#bbf7d0" : "#bfdbfe"}; margin: 16px 0;">
        <strong style="color: ${isResolved ? "#166534" : "#1e40af"}; font-size: 14px;">Resolution Update: ${isResolved ? "RESOLVED" : "IN PROGRESS"}</strong><br>
        ${p.resolvedByName ? `<span style="font-size: 12px; color: #5a6e64;">Handled by ${p.resolvedByName}</span><br><br>` : "<br>"}
        <div style="white-space: pre-line; color: #1e2924; font-size: 13.5px; line-height: 1.55;">
          ${p.resolutionNotes}
        </div>
      </div>
      Thank you for bringing this matter to our attention and for your partnership as we continuously uphold the highest standard of music education.`;
    return emailWrapper({
      title: `Complaint Update #${p.ticketNumber}`,
      badge: isResolved ? "Resolved" : "Under Review",
      heading: `Update on Ticket #${p.ticketNumber}`,
      bodyHtml,
      buttonLabel: "Open Academy Portal &rarr;",
      buttonUrl: targetUrl,
      noteHtml: "If you have any further questions or follow-up regarding this matter, please feel free to reach out to complaints@prosperworkmusic.com."
    });
  }

  if (job.template === "complaint_reply_alert") {
    const isFromStaff = p.senderRole !== "parent";
    const targetUrl = isFromStaff ? appUrl : `${appUrl}/complaints`;
    const bodyHtml = `Hello <strong>${p.recipientName}</strong>,<br><br>
      A new response has been posted regarding inquiry ticket <strong>#${p.ticketNumber}</strong> (<em>${p.subject}</em>):<br><br>
      <div style="background-color: #f7faf8; padding: 18px; border-radius: 10px; border: 1px solid #dce6df; margin: 16px 0;">
        <strong style="color: #0a2e22; font-size: 14px;">${p.senderName}</strong>
        <span style="display: inline-block; margin-left: 8px; font-size: 11px; padding: 2px 8px; border-radius: 12px; background-color: ${isFromStaff ? "#edf6f1" : "#fef3c7"}; color: ${isFromStaff ? "#1c7a5d" : "#92400e"}; font-weight: 700; text-transform: uppercase;">${isFromStaff ? "Academy Administration" : "Family / Guardian"}</span><br><br>
        <div style="white-space: pre-line; color: #1e2924; font-size: 13.5px; line-height: 1.6; padding: 12px; background: #ffffff; border-radius: 8px; border: 1px solid #e2ece7;">
          ${p.message}
        </div>
      </div>
      You can review the full discussion thread and send a reply directly through your Academy Portal.`;
    return emailWrapper({
      title: `Response on Ticket #${p.ticketNumber}`,
      badge: "Inquiry Response",
      heading: `Response on Ticket #${p.ticketNumber}`,
      bodyHtml,
      buttonLabel: isFromStaff ? "View & Reply in Academy Portal &rarr;" : "Open Complaints Desk &rarr;",
      buttonUrl: targetUrl,
      noteHtml: "This is a direct response notification from ProsperWork Music Academy Support."
    });
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
