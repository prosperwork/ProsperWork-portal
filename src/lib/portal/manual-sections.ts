import type { Role } from "@/lib/types";

export type ManualSection = {
  id: string;
  title: string;
  summary: string;
  href: string;
  roles: Role[];
  steps: { title: string; text: string }[];
};

const everyone: Role[] = ["super_admin","general_manager","head_admin","admin","teacher","qc","hr","finance","sales_marketing","social_media","parent","student"];
const academy: Role[] = ["super_admin","head_admin","admin"];
const educators: Role[] = [...academy,"teacher","qc"];
const family: Role[] = ["parent","student"];

export const manualSections: ManualSection[] = [
  {
    id:"navigation",title:"Getting around",summary:"Find your workspace and the records you need.",href:"/",roles:everyone,
    steps:[
      {title:"Open a section",text:"Use the sidebar to move between workspaces. Only sections available to your role appear. On a phone, open the menu in the top bar."},
      {title:"Work from the record",text:"Find the relevant student, lesson, invoice, staff member or request first. Row actions apply to that exact record; creation forms are separate and require an explicit target."},
      {title:"Account controls",text:"Open the avatar menu in the top bar for View profile and Sign out. Module navigation remains in the sidebar."},
      {title:"Saved changes",text:"Wait for the saved result before leaving a form. If a record changed while you were editing it, reload the current version rather than overwriting another person's work."},
    ],
  },
  {
    id:"profile",title:"Your profile",summary:"Update personal details and your private profile photo.",href:"/profile",roles:everyone,
    steps:[
      {title:"Edit your details",text:"Open View profile from the top-bar avatar menu. You can change your display name and IANA time zone; email, username, role and account status are read-only."},
      {title:"Update your photo",text:"Use the profile photo control to upload a PNG or JPEG up to 5 MiB. The private photo belongs to your own signed-in account."},
    ],
  },
  {
    id:"dashboard",title:"Dashboard",summary:"Review today's workload and items awaiting action.",href:"/",roles:everyone,
    steps:[
      {title:"Review your scope",text:"Counts and lists reflect records your account can access. Teachers see their assigned teaching work; parents see their family; staff see their authorized operational scope."},
      {title:"Open the relevant workspace",text:"Use the sidebar for a module and its page-level actions for its records. An empty list means no matching records are available; do not create sample records to fill it."},
    ],
  },
  {
    id:"schedule",title:"Schedule",summary:"Find lessons and their assigned teaching teams.",href:"/schedule",roles:[...educators,...family],
    steps:[
      {title:"Find a lesson",text:"Filter the schedule and check the student's name, lesson date, displayed timezone and assigned teacher."},
      {title:"Open the classroom",text:"Use that lesson's classroom link. Entry depends on the lesson window, your assignment or family relationship and the account's access status."},
      {title:"Complete attendance",text:"The assigned tutor marks Teacher Done after teaching. The assigned administrator verifies attendance separately. Tutors, including QC tutors, cannot verify their own attendance."},
    ],
  },
  {
    id:"workflows",title:"Workflow records",summary:"Review the requests and saved updates available to your role.",href:"/workflows",roles:everyone,
    steps:[
      {title:"Use the record list",text:"Payment and reschedule records are scoped to your account; private family and payroll details are not part of this workspace. Parents and students use Homework for practice submissions and feedback."},
      {title:"Keep changes with the record",text:"Submit reschedule proposals to their lesson. Teachers review assigned homework submissions here; parents and students use the Homework page for their assignments."},
    ],
  },
  {
    id:"classroom",title:"Live classroom",summary:"Join the correct lesson and manage audio and video.",href:"/schedule",roles:[...educators,...family],
    steps:[
      {title:"Join from the lesson",text:"Open the classroom from a scheduled lesson rather than reusing another lesson's link. The app checks the permitted participants and session time."},
      {title:"Allow devices",text:"Allow browser microphone and camera access when prompted. Check the selected devices and mute or turn off video when needed."},
      {title:"Finish the lesson",text:"Leave the room when finished. Teachers complete the lesson record and administrators verify it in their workspaces. Joining a room is not, by itself, verified attendance."},
      {title:"Recording",text:"Do not assume a class is being recorded or that a replay exists. Recording and replay availability must be explicitly configured and authorized."},
    ],
  },
  {
    id:"students",title:"Families and students",summary:"Maintain student records and teaching assignments.",href:"/students",roles:[...educators,"sales_marketing",...family],
    steps:[
      {title:"Choose the student",text:"Search for the student and inspect the linked family and teaching team before changing their record."},
      {title:"Update the appropriate fields",text:"Use the student-specific editing actions available to your role. Administrative assignment changes and academic updates have different permissions."},
      {title:"Assignment changes",text:"Authorized staff manage teacher, administrator and QC assignments through Operations. A one-class cover does not change the student's permanent roster."},
    ],
  },
  {
    id:"family",title:"Family accounts and consent",summary:"Manage linked children, privacy and family access.",href:"/family",roles:[...academy,...family],
    steps:[
      {title:"Review family links",text:"Open the family record and check which children and accounts are linked. Do not use another family's details to create or access an account."},
      {title:"Student accounts and Kid Mode",text:"Use the family controls for student access and secure Kid Mode. Follow the saved family PIN and account checks; do not share a staff account with a child."},
      {title:"Your account photo",text:"Update your own profile photo through Photo in the shared account header. Family accounts is for child-specific logins, privacy choices and guardian access."},
      {title:"Privacy choices",text:"Record each available consent choice explicitly. Media permission, referrals and marketing email consent are separate choices."},
      {title:"Policies",text:"Read and accept the currently required academy policies when prompted. An active login alone does not remove policy or family-access requirements."},
    ],
  },
  {
    id:"learning",title:"Lesson boards",summary:"Maintain lesson notes and student progress.",href:"/learning",roles:[...educators,...family],
    steps:[
      {title:"Select the learner and lesson",text:"Open Lesson boards, refresh the current lesson list if needed, and choose the appropriate student's board before adding notes, practice tasks or song progress."},
      {title:"Teacher updates",text:"Assigned tutors maintain their lesson notes and the next practice tasks. QC supervision and a QC tutor's own teaching assignment are distinct."},
      {title:"Progress",text:"Move songs and update learning progress only after the relevant work has been completed. Saving academic notes does not verify attendance or payment."},
    ],
  },
  {
    id:"homework",title:"Homework",summary:"Submit practice work and review assignment feedback.",href:"/homework",roles:[...educators,...family],
    steps:[
      {title:"Find the assignment",text:"Open the learner's assigned homework item. Check its instructions and due date before submitting."},
      {title:"Submit work",text:"Parents or students attach their practice file to the relevant assignment and submit it. A homework upload is separate from a payment receipt."},
      {title:"Review and feedback",text:"The authorized teacher opens the student's submission, reviews it and records feedback. Follow the feedback before completing the next practice task."},
    ],
  },
  {
    id:"resources",title:"Curriculum library",summary:"Find and maintain teaching resources.",href:"/curriculum",roles:[...educators,"social_media"],
    steps:[
      {title:"Find a resource",text:"Search or filter by the resource's title, instrument or category and open its approved link or file."},
      {title:"Maintain the library",text:"If your role has editing access, add or update the resource record and verify that the destination is usable. Do not place private family files in a public resource link."},
    ],
  },
  {
    id:"studio",title:"Media studio",summary:"Submit and review student media within its consent scope.",href:"/studio",roles:[...educators,"social_media","parent"],
    steps:[
      {title:"Choose the student",text:"Open the relevant student's media workflow and check the available consent and submission controls."},
      {title:"Submit and review",text:"Attach the permitted file to its actual student/media record. Use the available review and approval actions rather than sending a private file through an unrelated record."},
      {title:"Respect consent",text:"A file upload is not permission to publish it. Publication eligibility depends on recorded consent and the required reviews."},
    ],
  },
  {
    id:"leads",title:"Leads and handoffs",summary:"Track enquiries, callbacks and trial requests.",href:"/leads",roles:[...academy,"sales_marketing"],
    steps:[
      {title:"Open the lead",text:"Check the prospect's contact details, assigned Sales person, current state and prior notes."},
      {title:"Callbacks",text:"Set a future callback date on a callback lead. The assigned Sales follow-up is scheduled automatically; changing the date, assignment or state closes obsolete follow-ups."},
      {title:"Trials",text:"Submit the family's preferred future slots to the responsible Head Admin. A trial request is not a booked or verified trial."},
      {title:"Nursery",text:"Unbooked inactive leads are moved to nursery after the owner's configured follow-up threshold. Work the assigned follow-up and record the actual contact outcome."},
      {title:"Referrals",text:"Retain the actual referral relationship when supplied. Referrals do not automatically grant marketing consent or guarantee a discount before the configured eligibility rules are met."},
    ],
  },
  {
    id:"operations",title:"Operations",summary:"Handle assignments, enrolment, trials and billing agreements.",href:"/operations",roles:[...academy,"finance","qc","sales_marketing"],
    steps:[
      {title:"Choose a work area",text:"Role-scoped tabs separate Finance, Academy, Team and quality, Leads, and Payments and audit records. Referral and private media workflows appear when relevant."},
      {title:"Choose the workflow and record",text:"Open the relevant student, trial, assignment or billing agreement. Controls are limited to the current role's operational responsibilities."},
      {title:"Assignments and trials",text:"Authorized administrators select the actual teacher/QC tutor, administrator and future class slots. Review the conflict or capacity result before confirming."},
      {title:"Billing agreements",text:"Authorized staff use approved currencies and rates and agree the child's frequency, billing terms and applicable tuition details."},
      {title:"Pause and resume",text:"Review the child's billing state when lessons pause or resume. Resuming teaching does not silently back-charge a paused period; Finance agrees the restart anchor."},
    ],
  },
  {
    id:"finance",title:"Finance and receipts",summary:"Work from student invoices and review attached payment evidence.",href:"/finance",roles:["super_admin","finance","parent"],
    steps:[
      {title:"Find the invoice",text:"Search for the family or student, then check the invoice amount, currency, due date, terms and state."},
      {title:"Family receipt upload",text:"Parents upload against a specific outstanding invoice. Confirm the selected student and payment record before attaching the file. Uploading does not mark the invoice paid."},
      {title:"Staff receipt review",text:"Finance and the owner review the receipt attached to the student's invoice and verify payment through the authorized action. They do not need a general personal Upload receipt button."},
      {title:"Expenses and currencies",text:"Record an expense with its category, amount and approved currency. Review currency-specific totals; a configured conversion rate is not proof that a payment gateway converted the funds."},
    ],
  },
  {
    id:"documents",title:"Invoices and payment documents",summary:"Open private invoices and verified receipts.",href:"/documents",roles:["super_admin","finance","parent"],
    steps:[
      {title:"Select the billing record",text:"Choose the correct student and invoice before opening or downloading its document."},
      {title:"Receipt state",text:"A submitted receipt is evidence awaiting review. A verified receipt or paid status depends on the authorized payment verification."},
      {title:"Private links",text:"Signed file links can expire. Reopen the file from its record to obtain a current authorized link; do not circulate private family documents publicly."},
    ],
  },
  {
    id:"payroll",title:"Payroll and salary",summary:"Review agreements, calculations and salary approvals.",href:"/payroll",roles:["super_admin","finance","head_admin","admin","teacher","hr","sales_marketing","social_media"],
    steps:[
      {title:"Select the period and staff member",text:"Review the relevant salary period and the saved rate agreement. Staff salary access is limited to the authorized account and scope."},
      {title:"Teacher agreements",text:"Teacher pay follows the agreed monthly amount per assigned child and lesson frequency. Four versus five weekly lessons in a month does not itself change a fixed monthly child rate; additional weekly frequency follows the agreement."},
      {title:"Fixed staff salaries",text:"Other staff use their agreed monthly salary. Rate changes are explicit, attributed changes rather than edits to historical settled payroll."},
      {title:"Resolve readiness",text:"The preview uses server-verified attendance and approved pay terms. Resolve the actual server-returned issues; do not estimate missing earnings or combine currencies."},
      {title:"Prepare and approve",text:"Finance generates drafts and submits them for review. The owner approves or returns submitted batches unless the server reports an authorized delegation."},
      {title:"Record transfers",text:"After owner approval, transfer funds separately through the normal bank process. Record a transfer reference only after the payment has already completed; this app never sends money."},
      {title:"Record changes",text:"Explain adjustments and reconcile the source records before finalizing. For earlier pay dates, submit only an owner-confirmed archived parent count with its actual source and reason; never estimate a historical value."},
      {title:"Status and cutoffs",text:"Restricting or pausing a staff member stops recurring fixed base salary and admin capacity bonuses, while preserving earned verified lesson earnings. Staff on approved leave retain agreed base salary."},
    ],
  },
  {
    id:"management",title:"Management desk",summary:"Work assigned cases, follow-ups and quality alerts.",href:"/management",roles:everyone,
    steps:[
      {title:"Open an assigned case",text:"Check its kind, student/lead/staff relationship, owner, due time and history. Work only cases in your permitted scope."},
      {title:"Update the case",text:"Choose the appropriate state and record the actual outcome. A trial request requires a real scheduled trial before it can be completed."},
      {title:"Senior escalation review",text:"Unresolved parent complaints and class-not-started reports escalate to Senior Management. Only the assigned Head Admin or Owner can resolve or complete an escalation; parent creators cannot close their own complaints."},
      {title:"Quality supervision",text:"QC reviews authorized teaching quality information. Unobserved punctuality or incomplete retention periods are unknown, not invented zero scores. Financial information is not part of QC supervision."},
      {title:"Emergency cover",text:"Authorized staff choose a cover for the actual class. The temporary cover's access is time-limited and the permanent student roster remains unchanged."},
      {title:"Owner controls",text:"Owner-only hierarchy, announcements, thresholds and restricted account actions are separate from ordinary case work. Read-only support previews do not grant another person's write privileges."},
    ],
  },
  {
    id:"requests",title:"Submissions and reschedule requests",summary:"Submit work and track the required approvals.",href:"/workflows",roles:everyone,
    steps:[
      {title:"Select the actual record",text:"A receipt belongs to a payment, homework to an assignment, and a reschedule request to a lesson. Check the record details before submitting."},
      {title:"Request another time",text:"Offer permitted future alternatives and a written reason. A request does not move the booked lesson immediately."},
      {title:"Counterproposals",text:"If the assigned teacher offers alternatives, the linked guardian accepts a specific option before teacher confirmation."},
      {title:"Final approval",text:"The teacher confirms first and the assigned administrator finalizes after rechecking conflicts. Review the saved status rather than assuming submission means approval."},
    ],
  },
  {
    id:"people",title:"People and staff",summary:"Inspect staff roles, capacity and assignments.",href:"/people",roles:[...academy,"hr","qc"],
    steps:[
      {title:"Find the staff member",text:"Review their current role, active state, department, timezone and permitted assignments."},
      {title:"Role-specific detail",text:"Use Hiring for recruitment, Leave for time off, Payroll for pay and Accounts for privileged access management rather than mixing those actions into a generic staff card."},
      {title:"Capacity and hierarchy",text:"Authorized staff review assigned quotas and supervisor relationships before changing the teaching team."},
    ],
  },
  {
    id:"hiring",title:"Hiring and onboarding",summary:"Review applicants and complete the activation handoff.",href:"/hiring",roles:["super_admin","head_admin","admin","hr","finance"],
    steps:[
      {title:"Open or create a case",text:"Review the applicant index and select the matching case. HR and Owner can use New applicant to open a case with an independent role-appropriate reviewer; cases and their saved events are append-only."},
      {title:"Reviews and agreements",text:"Complete the review and handoff required for your role. Confirm the initial rate and required acceptance rather than assuming an applicant has agreed."},
      {title:"Corrections",text:"If agreement details change, complete correction and re-acceptance before activation. An application or invitation alone does not grant active staff access."},
    ],
  },
  {
    id:"leave",title:"Leave and cover",summary:"Request time off and review its teaching impact.",href:"/leave",roles:everyone.filter(role=>!["parent","student","general_manager"].includes(role)),
    steps:[
      {title:"Find or request leave",text:"Review the saved leave records first. Use Request leave to open a new time-off form and enter the actual future period in device-local time."},
      {title:"Review impact",text:"Authorized reviewers check affected duties and classes and arrange permitted cover. Leave approvals and cover assignments are distinct decisions."},
      {title:"Temporary access",text:"Cover permissions depend on the approved period and assignment. Do not use a permanent roster reassignment as an undocumented substitute for a temporary cover."},
    ],
  },
  {
    id:"communications",title:"Email communications",summary:"Manage explicit marketing consent and consented campaigns.",href:"/communications",roles:["super_admin","sales_marketing","parent"],
    steps:[
      {title:"Consent first",text:"Parents manage their own preference. Authorized Sales staff record explicit permission evidence for their assigned leads. Do not infer marketing permission from a referral, media consent or class enrolment. Marketing choices never affect lesson or academy access."},
      {title:"Prepare the message",text:"Choose the allowed audience, enter the subject and message, and review the eligible recipient count. Do not include individual private family records in a broadcast."},
      {title:"Confirm sending",text:"Provide the required confirmation and reason. A queued message is not yet delivered. If an attempt is interrupted, the same send request protects against duplicate campaigns."},
      {title:"Cancellation and unsubscribe",text:"Cancel an open campaign with a reason. Recipients can confirm withdrawal through their private unsubscribe link. Withdrawal stops future queued marketing but cannot recall an email already in flight; operational lesson reminders remain separate."},
      {title:"Other reminders",text:"Operational lesson and billing reminders are separate from marketing consent. WhatsApp sending is not connected in the current setup."},
    ],
  },
  {
    id:"accounts",title:"Accounts and access",summary:"Activate the right person with the correct role.",href:"/accounts",roles:["super_admin"],
    steps:[
      {title:"Verify identity and purpose",text:"Review the account and intended academy responsibility before activation or privilege changes. Public registration never grants staff or owner privileges."},
      {title:"Invitations and recovery",text:"Use the configured invitation or password-recovery flow. The person must complete their own secure email link; do not share staff passwords or use another person's session."},
      {title:"Restriction",text:"Check active duties before restricting an account. Restricted access preserves audit history; it is not permanent record deletion."},
    ],
  },
  {
    id:"settings",title:"Rules and settings",summary:"Maintain academy-wide business rules and approved values.",href:"/settings",roles:["super_admin"],
    steps:[
      {title:"Choose the settings group",text:"Open the relevant group for classes, payroll rules, referral rules, currencies/rates or operational thresholds."},
      {title:"Make an explicit change",text:"Review the value and required reason, then save. Class length, approved rates and business-rule values are managed here rather than assumed from an old agreement."},
      {title:"Historical obligations",text:"Disabling a currency does not cancel historical agreements or obligations. New agreements must use enabled approved currencies; conversion rates remain explicit."},
      {title:"Follow-up thresholds",text:"Configure the management follow-up and escalation thresholds. Cold unbooked lead handling uses the configured follow-up threshold."},
    ],
  },
  {
    id:"policies",title:"Policies and agreements",summary:"Publish approved documents and complete required acceptances.",href:"/policies",roles:everyone,
    steps:[
      {title:"Read the correct version",text:"Open the required policy for your account and review its current version."},
      {title:"Accept when required",text:"Complete the actual acceptance control. A billing arrangement field is not proof that a legal document has been accepted."},
      {title:"Owner publication",text:"Review version history first. Owner creates a new policy from New policy by attaching the actual academy-approved PDF, then publishes the saved version. Do not publish test or draft legal text as an approved policy."},
    ],
  },
  {
    id:"reports",title:"Audit and reports",summary:"Review operational changes within your permitted scope.",href:"/reports",roles:["super_admin","head_admin","hr","qc","finance"],
    steps:[
      {title:"Select the relevant records",text:"Review the change history or report for the period and records available to your role."},
      {title:"Interpret the figures",text:"Check currency, period, source state and verification before treating a number as settled. Unknown observations are not reliable zero values."},
      {title:"Audit trail",text:"Use attributed history to understand who changed a record and why. Correct through the authorized workflow; do not erase the history to conceal a correction."},
    ],
  },
  {
    id:"ai-assistant",title:"AI Assistant & Birthday Celebrations",summary:"Use the role-aware AI assistant and birthday radar.",href:"/",roles:everyone,
    steps:[
      {title:"Role-aware assistant",text:"Use the floating chat bubble in the bottom right corner of the portal to ask questions about your lessons, practice, or portal tasks. The assistant answers only according to your role's permitted scope and stays strictly focused on music and ProsperWork operations."},
      {title:"Birthday radar",text:"The Birthday radar tracks upcoming student birthdays in the next 7 days across the Overview and Media Studio pages. Staff can generate personalized AI musical tributes tailored to the student's instrument, level, and repertoire."},
      {title:"WhatsApp copy and PDF cards",text:"Click AI Tribute to generate a custom greeting, then use Copy for WhatsApp to send it to the parent, or download the official branded PDF Birthday Card with the tribute embedded."},
      {title:"Practice tips",text:"Students and teachers can receive bite-sized, motivating practice tips tailored to their instrument and current practice topics."},
    ],
  },
];
