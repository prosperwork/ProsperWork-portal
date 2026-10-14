# ProsperWork Music Academy - Codebase Architecture & Developer Manual

> **Version:** Phase 1 Production-Ready  
> **Framework:** Next.js 16.4.0 (Turbopack, App Router, React 19)  
> **Language:** TypeScript 5.x Strict Mode  
> **Audience:** Core Engineers, AI Agents, Integration Partners

---

## 1. Executive Summary & Design Philosophy

The ProsperWork Music Academy Portal is an enterprise-grade administrative, pedagogical, and financial management system designed for synchronous and asynchronous musical education.

The system is constructed with strict modularity, high cohesion, low coupling, and zero tolerance for data inconsistency or unverified state fabrications. Every UI mutation mirrors a persistent backend record in storage and audit ledgers.

### Core Architectural Principles

1. **Modularity over Monoliths**: Heavy components, page controllers, and stylesheets are broken down into isolated, single-responsibility modules.
2. **Centralized Protocol & Helpers**: Network fetching, API error extraction, multi-currency conversion, date-time formatting, and confirmation modals are centralized in standard libraries (`src/lib/academy/` and `src/_components/`).
3. **No Native Browser Dialogues**: Native `alert()` and `confirm()` are strictly prohibited. All destructive or state-changing operations invoke the uniform `useConfirmModal` system.
4. **Resilient Phase 2 Integration Readiness**: Core domains (Finance, Operations, Studio, Workflows) are isolated with clean interfaces, so incoming Phase 2 dimensions (Public SaaS, Stripe Webhooks, Facebook Lead Ads, AI voice analysis) can integrate without refactoring existing operational routines.

---

## 2. Directory Hierarchy

```
portal/
├── src/
│   ├── app/                                 # Next.js App Router Root
│   │   ├── _components/                     # Shared UI Components & Modals
│   │   │   ├── ConfirmModal.tsx             # Centralized confirmation modal & hook
│   │   │   ├── BrandEmblem.tsx              # Academy branding assets
│   │   │   ├── EmailComposerDialog.tsx      # In-portal email authoring dialog
│   │   │   ├── PortalAiChatBubble.tsx       # AI assist floating drawer
│   │   │   ├── ProfileAvatar.tsx            # Authenticated user & student avatar
│   │   │   ├── modals/                      # Domain-specific modal dialogs
│   │   │   │   ├── ActionModal.tsx          # Dynamic entity creation/edit modal
│   │   │   │   ├── EmergencyCoverModal.tsx  # 1-click substitute teacher reassignment
│   │   │   │   └── KidPinDialog.tsx         # Parental PIN control for kid practice
│   │   │   └── views/                       # Modular views extracted from main portal
│   │   │       ├── OverviewView.tsx         # Executive dashboard & metrics
│   │   │       ├── ScheduleView.tsx         # Class calendar & emergency replacement
│   │   │       ├── FamiliesView.tsx         # Students, guardians, and enrollments
│   │   │       ├── LeadsView.tsx            # Inbound trial leads & sales tracking
│   │   │       ├── FinanceView.tsx          # Multi-currency balances & transactions
│   │   │       ├── PeopleView.tsx           # Teachers, staff, and payroll rates
│   │   │       ├── CurriculumView.tsx       # Pedagogical milestones & repertoire
│   │   │       ├── LearningView.tsx         # Student practice records & homework
│   │   │       ├── ReportsView.tsx          # Operational, financial, & QC audits
│   │   │       └── SettingsView.tsx         # Academy rules, FX, & preferences
│   │   ├── _lib/                            # App-internal navigation & formatters
│   │   │   ├── portal-navigation.ts         # Role-based workspace route definitions
│   │   │   └── portal-formatters.ts         # Localized dates, numbers, & titles
│   │   ├── operations/                      # Administrative Operations Workspace
│   │   │   ├── page.tsx                     # Thin controller orchestrating operations
│   │   │   ├── ops-types.ts                 # Shared types, roles, & formatters
│   │   │   ├── OperationsExtras.tsx         # Supplemental utilities & metrics
│   │   │   └── views/                       # Granular Operations Subviews
│   │   │       ├── OpsFinanceView.tsx       # Contracts, FX rates, expenses, tax
│   │   │       ├── OpsAcademyView.tsx       # Series scheduling, pause, reassign
│   │   │       ├── OpsTeamView.tsx          # Teacher availability & coaching notes
│   │   │       ├── OpsLeadsView.tsx         # Lead pipeline, trials, sales reps
│   │   │       └── OpsRecordsView.tsx       # Accounts receivable & audit log
│   │   ├── studio/                          # Music Practice & Studio Workspace
│   │   │   ├── page.tsx                     # Studio controller & recording engine
│   │   │   ├── studio-types.ts              # Strongly-typed models & domain logic
│   │   │   └── components/                  # Dedicated Studio Subcomponents
│   │   │       ├── StudioBirthdaySection.tsx # AI birthday tribute & card PDF
│   │   │       └── StudioRequestsSection.tsx # Ask the studio & request threads
│   │   ├── styles/                          # Modular Global Stylesheets
│   │   │   ├── base.css                     # Reset, design variables, typography
│   │   │   ├── auth.css                     # Login, onboarding, reset password
│   │   │   ├── accounts.css                 # Account management, user cards
│   │   │   ├── workspaces.css               # Operations, tables, pipelines, badges
│   │   │   └── portal-frame.css             # Navigation shell, header, modal overlays
│   │   ├── workflows/                       # Reschedules, Homework & Receipts
│   │   │   └── page.tsx                     # Workflow controller & negotiation flow
│   │   ├── accounts/                        # Multi-user account administration
│   │   ├── communications/                  # Academy email broadcast engine
│   │   ├── hiring/                          # Educator interview & hiring pipeline
│   │   ├── payroll/                         # Multi-currency salary generation
│   │   ├── api/                             # REST API Endpoints (56 routes)
│   │   ├── globals.css                      # Modular root stylesheet importing styles/
│   │   └── page.tsx                         # Main Portal routing hub
│   └── lib/                                 # Centralized Utilities & Data Layer
│       ├── academy/                         # Core Academy Shared Services
│       │   ├── web-client.ts                # HTTP response parser & error extractor
│       │   ├── use-currencies.ts            # Live currency rates & active symbols
│       │   └── multi-currency.ts            # FX conversion & audit normalization
│       ├── storage.ts                       # Persistent academy state repository
│       └── types.ts                         # Universal platform type declarations
└── public/                                  # Static assets, logos, and emblems
```

---

## 3. Centralized Services & Shared Helpers

### 3.1 Web Client & HTTP (`src/lib/academy/web-client.ts`)

Standardizes JSON network requests and error parsing to prevent repetitive try/catch clones across the portal:

- `readJson<T>(response: Response): Promise<T>`: Safely parses JSON with fallback text error retrieval.
- `apiErrorMessage(result: unknown, status: number): string`: Extracts descriptive server messages or falls back to clear HTTP error indicators.
- `formatDateLabel(iso: string, timezone?: string): string`: Uniform medium date and short time formatter.
- `localDateTimeInput(date?: Date): string`: Outputs `YYYY-MM-DDTHH:mm` for form `<input type="datetime-local">`.
- `isoToday(): string`: Returns current date in `YYYY-MM-DD`.

### 3.2 Modal Confirmation System (`src/app/_components/ConfirmModal.tsx`)

Replaces all native browser dialogs (`window.alert`, `window.confirm`) with an accessible, styled modal matching ProsperWork design tokens.

```tsx
import { useConfirmModal } from "@/app/_components/ConfirmModal";

export default function MyComponent() {
  const { confirm, ConfirmDialog } = useConfirmModal();

  const handleAction = () => {
    confirm({
      title: "Terminate Student Contract?",
      message: "This will stop upcoming billing and archive the active series.",
      confirmLabel: "Terminate Contract",
      tone: "danger", // 'danger' | 'warning' | 'primary' | 'info'
      onConfirm: async () => {
        await executeTermination();
      },
    });
  };

  return (
    <>
      <button onClick={handleAction}>Terminate</button>
      <ConfirmDialog />
    </>
  );
}
```

### 3.3 Multi-Currency System (`src/lib/academy/use-currencies.ts` & `multi-currency.ts`)

- Supports dynamic active currencies (e.g. `NGN`, `USD`, `GBP`, `EUR`, `CAD`).
- Every salary statement, invoice, contract, and expense is preserved in its origin currency with historical exchange rates recorded at settlement time.

---

## 4. Workspaces & Modular Boundaries

### 4.1 Operations (`src/app/operations/`)

Refactored from an monolithic file down into a modular controller and 5 dedicated view modules:

- `OpsFinanceView`: Multi-currency contracts, exchange rates, operating expenses, and tax withholding settings.
- `OpsAcademyView`: Recurring series management, leave interval replacements, student lesson pauses, and roster reassignments.
- `OpsTeamView`: Weekly availability slot matrix, teacher quality metrics, and pedagogical coaching logs.
- `OpsLeadsView`: Inbound trial pipeline, sales rep assignment, trial lesson scheduler, and lead conversion wizard.
- `OpsRecordsView`: Accounts receivable buckets (0–30, 31–60, 61–90+ days) and timestamped operational event trail.

### 4.2 Studio (`src/app/studio/`)

Encapsulates real-time musical practice and asynchronous pedagogical interactions:

- `StudioBirthdaySection`: 7-day birthday radar with instant AI-powered personalized birthday messages, WhatsApp deep-link generation, and direct private PDF birthday card links.
- `StudioAskSection`: Student and parent inquiry portal with support for class-not-started reports.
- `StudioThreadsSection`: Staff decision dashboard with reply threads and rejection confirmations.
- Real-time Media Recorder: WebM/Opus audio and WebM/VP8 video recording with direct private file upload.

### 4.3 Workflows (`src/app/workflows/`)

Educational continuity, homework submissions, and reschedule negotiations:

- `WorkflowPaymentsSection`: Invoice records, payment status chips, and parent receipt upload forms.
- `WorkflowHomeworkSection`: Student homework reflection submissions, media file attachments, and teacher feedback evaluation.
- `WorkflowRescheduleSection`: Multi-role lesson reschedule negotiation engine with counter-proposals, teacher availability verification, and final administrative approval.
- `workflow-types.tsx`: Centralized data contracts, date formatters, and empty state representations.

### 4.4 Accounts Directory (`src/app/accounts/`)

Super Admin restricted identity, lifecycle status, and security directory:

- `AccountInviteForm`: Email invitation workflow with role delegation and timezone binding.
- `AccountList`: Searchable account directory with real-time text query filtering, status pills, and "View as user" session impersonation.
- `AccountModals`: Status change confirmation modal and guarded permanent account purge dialog with dependency blocker detection.
- `accounts-types.ts` & `AccountIcon.tsx`: Reusable account status definitions, role helpers, and SVG icons.

### 4.5 Hiring Pipeline (`src/app/hiring/`)

Teacher recruitment, audition reviews, applicant document contracts, and staff activation:

- `HiringCandidateForm`: Inbound job applicant creation and department reviewer assignment.
- `HiringReviewForm`: Structured independent HR, departmental, audition, and training evaluation gates.
- `HiringCaseDetail`: Schedule interviews, candidate file attachments (agreements, guidelines, evidence), and handoffs.
- `hiring-types.ts`: Strongly typed applicant schemas, stage status transitions, and date formatters.

### 4.6 Payroll & Compensation (`src/app/payroll/`)

Multi-currency attendance-backed compensation and salary payouts:

- `PayrollBatchesSection`: Immutable monthly pay batches with standard, trial, and cover breakdowns, CSV downloads, and payout receipts.
- `PayrollRatesSection`: Staff compensation tiers, trial rate overrides, and emergency replacement bonuses.
- `PayrollAdjustmentModal`: Maker-checker adjustments with reasoned audit explanations.
- `payroll-types.ts`: Centralized payroll item models, batch structures, and rate records.

### 4.7 Learning & Shared Lesson Boards (`src/app/learning/`)

Real-time collaborative lesson boards and curriculum media repository:

- `LearningLiveBoard`: Supabase Realtime multi-user live whiteboard with optimistic revision tracking, conflict resolution, notes, and topic checklists.
- `LearningReportsSection`: Monthly student progress PDF generation and private birthday card download service.
- `LearningResourcesSection`: Curriculum library with media uploads, full-text search, resource editing, and soft-archive confirmations.
- `learning-types.ts`: Shared lesson models, MIME type verifiers, and date helpers.

### 4.8 Portal Home (`src/app/page.tsx`)

The primary viewport router delegating role-based screens into 10 domain views located in `src/app/_components/views/`. Form submissions, entity audit trails, and multi-currency updates are decoupled and handled through `src/app/_lib/portal-actions.ts`.

---

## 5. Style Architecture (`src/app/styles/`)

The monolithic `globals.css` (3,274 lines) has been decomposed into five semantic CSS modules:

1. `base.css`: CSS reset, font declarations, primary Pine Green palette (`#135B45`), background tones (`#F6F8F6`), and button typography.
2. `auth.css`: Authentication forms, onboarding wizard, reset password, and access-pending screens.
3. `accounts.css`: Multi-profile identity cards, user permissions tables, and avatar pickers.
4. `workspaces.css`: Data tables, badges, tab navigators, kanban pipelines, and metrics cards.
5. `portal-frame.css`: Application shell, top navigation bar, sidebar drawer, and modal dialog overlays.

---

## 6. Rules for Future AI Agents & Developers

When extending or integrating new modules into this codebase:

1. **Do Not Introduce Native Dialogs**: Never write `window.confirm()` or `window.alert()`. Always import and use `useConfirmModal`.
2. **Preserve Type Safety**: Run `npm run typecheck` (`tsc --noEmit`) before completing any task. All files must pass with **0 errors**.
3. **Verify Build Integrity**: Run `npm run build` to ensure Next.js Turbopack compiles all 56 pages with zero errors.
4. **Use Shared Network Utilities**: For frontend API calls, use `readJson` and `apiErrorMessage` from `@/lib/academy/web-client`.
5. **Honor Scoped Styles**: Place workspace-specific CSS into the corresponding file in `src/app/styles/` rather than creating sprawling inline style blocks or unbounded CSS files.
6. **Phase 2 Isolation**: Maintain clean decoupling between internal academy state (`useAcademyData`) and external webhooks/gateways to ensure upcoming SaaS extensions plug in seamlessly.
