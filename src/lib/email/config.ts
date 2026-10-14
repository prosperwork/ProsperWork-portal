/**
 * ProsperWork Music Academy — Centralised Official Email Configuration
 *
 * Mailboxes (Real Spacemail accounts):
 * 1. Leadership: stephen@prosperworkmusic.com
 * 2. School Communications: info@prosperworkmusic.com
 * 3. Administration & Technology: dev@prosperworkmusic.com
 *
 * All other addresses are verified domain aliases routed to one of these mailboxes.
 */

export const OFFICIAL_MAILBOXES = {
  leadership: "stephen@prosperworkmusic.com",
  communications: "info@prosperworkmusic.com",
  adminTech: "dev@prosperworkmusic.com",
} as const;

export const ACADEMY_EMAILS = {
  // A. Leadership Mailbox & Aliases (Primary: stephen@prosperworkmusic.com)
  leadership: {
    primary: "stephen@prosperworkmusic.com",
    official: "official@prosperworkmusic.com",
    business: "business@prosperworkmusic.com",
    management: "management@prosperworkmusic.com",
    director: "director@prosperworkmusic.com",
    founder: "founder@prosperworkmusic.com",
    personal: "stephenmatthew@prosperworkmusic.com",
  },

  // B. School Communications Mailbox & Aliases (Primary: info@prosperworkmusic.com)
  communications: {
    primary: "info@prosperworkmusic.com",
    enquiries: "enquiries@prosperworkmusic.com",
    admissions: "admissions@prosperworkmusic.com",
    students: "students@prosperworkmusic.com",
    support: "support@prosperworkmusic.com",
    courses: "courses@prosperworkmusic.com",
    fees: "fees@prosperworkmusic.com",
    registration: "registration@prosperworkmusic.com",
    partnerships: "partnerships@prosperworkmusic.com",
    feedback: "feedback@prosperworkmusic.com",
    complaints: "complaints@prosperworkmusic.com",
    events: "events@prosperworkmusic.com",
  },

  // C. Administration & Technology Mailbox & Aliases (Primary: dev@prosperworkmusic.com)
  adminTech: {
    primary: "dev@prosperworkmusic.com",
    noreply: "noreply@prosperworkmusic.com",
    admin: "admin@prosperworkmusic.com",
    accounts: "accounts@prosperworkmusic.com",
    finance: "finance@prosperworkmusic.com",
    billing: "billing@prosperworkmusic.com",
    tech: "tech@prosperworkmusic.com",
    security: "security@prosperworkmusic.com",
    systems: "systems@prosperworkmusic.com",
    alerts: "alerts@prosperworkmusic.com",
  },
} as const;

/**
 * Functional role-based mapping for public views, student views, and staff portals
 */
export const PORTAL_EMAILS = {
  // Public website & gateway
  general: ACADEMY_EMAILS.communications.primary,
  enquiries: ACADEMY_EMAILS.communications.enquiries,
  admissions: ACADEMY_EMAILS.communications.admissions,
  courses: ACADEMY_EMAILS.communications.courses,
  partnerships: ACADEMY_EMAILS.communications.partnerships,
  events: ACADEMY_EMAILS.communications.events,
  feedback: ACADEMY_EMAILS.communications.feedback,
  complaints: ACADEMY_EMAILS.communications.complaints,

  // Student / Family Portal
  students: ACADEMY_EMAILS.communications.students,
  support: ACADEMY_EMAILS.communications.support,
  registration: ACADEMY_EMAILS.communications.registration,
  fees: ACADEMY_EMAILS.communications.fees,

  // Admin & Staff Dashboard
  admin: ACADEMY_EMAILS.adminTech.admin,
  accounts: ACADEMY_EMAILS.adminTech.accounts,
  finance: ACADEMY_EMAILS.adminTech.finance,
  billing: ACADEMY_EMAILS.adminTech.billing,
  technical: ACADEMY_EMAILS.adminTech.tech,
  developer: ACADEMY_EMAILS.adminTech.primary,
  security: ACADEMY_EMAILS.adminTech.security,
  systems: ACADEMY_EMAILS.adminTech.systems,
  alerts: ACADEMY_EMAILS.adminTech.alerts,

  // Leadership Escalation
  management: ACADEMY_EMAILS.leadership.management,
  director: ACADEMY_EMAILS.leadership.director,
  official: ACADEMY_EMAILS.leadership.official,
} as const;

/**
 * Sender categories used by SMTP mail transport and the EmailComposerDialog
 */
export const SENDER_CATEGORY_MAP = Object.freeze({
  admin: ACADEMY_EMAILS.adminTech.admin,
  admissions: ACADEMY_EMAILS.communications.admissions,
  support: ACADEMY_EMAILS.communications.support,
  payments: ACADEMY_EMAILS.communications.fees,
  fees: ACADEMY_EMAILS.communications.fees,
  contact: ACADEMY_EMAILS.communications.primary,
  students: ACADEMY_EMAILS.communications.students,
  registration: ACADEMY_EMAILS.communications.registration,
  finance: ACADEMY_EMAILS.adminTech.finance,
  billing: ACADEMY_EMAILS.adminTech.billing,
  automated: ACADEMY_EMAILS.adminTech.noreply,
  alerts: ACADEMY_EMAILS.adminTech.alerts,
  management: ACADEMY_EMAILS.leadership.management,
  director: ACADEMY_EMAILS.leadership.director,
  official: ACADEMY_EMAILS.leadership.official,
});

/**
 * Standard professional email signature block
 */
export const ACADEMY_EMAIL_SIGNATURE = `
Warm regards,
ProsperWork Music Academy Team
Website: https://www.prosperworkmusic.com
Portal: https://portal.prosperworkmusic.com
General Enquiries: ${ACADEMY_EMAILS.communications.primary}
Student Support: ${ACADEMY_EMAILS.communications.support}
`;

