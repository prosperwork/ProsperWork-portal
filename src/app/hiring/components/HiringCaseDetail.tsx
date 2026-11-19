"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  FileUp,
  LoaderCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import {
  type HiringCase,
  type HiringDirectory,
  type HiringEvent,
  type HiringFile,
} from "@/lib/academy/hiring";
import { PortalModal } from "@/app/_components/PortalModal";
import {
  COMMON_IANA_TIMEZONES,
  formatDate,
  isMusicEducationRole,
  roleLabel,
  titleCase,
  uploadTypes,
  type HiringData,
  type PendingUpload,
} from "../hiring-types";

export interface HiringCaseDetailProps {
  selectedCase: HiringCase;
  data: HiringData;
  viewMode: "next_step" | "timeline" | "applicant";
  isApplicant: boolean;
  isOwner: boolean;
  isHR: boolean;
  isQC: boolean;
  isActive: boolean;
  busy: string;
  actionError?: string;
  deviceTimezone: string;
  staffName: (id: string) => string;
  currentFiles: HiringFile[];
  eventsForCase: HiringEvent[];
  canSchedule: boolean;
  canGuidelines: boolean;
  canAgreement: boolean;
  canUploadEvidence: boolean;
  canAccept: boolean;
  canHandoff: boolean;
  canReturn: boolean;
  canActivate: boolean;
  canReject: boolean;
  applicantNameMatches: boolean;
  matchingApplicants: (candidate: HiringCase) => HiringDirectory[];
  pendingUploads: Record<string, PendingUpload>;
  fileInputRevision: Record<string, number>;
  onSubmitSchedule: (at: string, notes: string) => Promise<boolean>;
  onBindApplicant: (
    candidate: HiringCase,
    staffId: string,
    notes: string
  ) => Promise<boolean>;
  onInviteApplicant: (
    candidate: HiringCase,
    timezone: string
  ) => Promise<boolean>;
  onUploadFile: (
    candidate: HiringCase,
    category: "hiring_guidelines" | "hiring_agreement" | "hiring_evidence",
    file: File | null,
    note: string
  ) => Promise<boolean>;
  onSubmitAccept: (signedName: string, agreed: boolean) => Promise<boolean>;
  onSubmitHandoff: (startDate: string, notes: string) => Promise<boolean>;
  onSubmitReturn: (notes: string) => Promise<boolean>;
  onSubmitActivation: (notes: string) => Promise<boolean>;
  onRejectCase: (notes: string) => Promise<boolean>;
  requestedModal?: ActiveModal;
  onRequestModalChange?: (modal: ActiveModal) => void;
}

export type ActiveModal =
  | null
  | "schedule"
  | "identity"
  | "evidence"
  | "guidelines"
  | "agreement"
  | "handoff"
  | "return"
  | "activate"
  | "reject";

export default function HiringCaseDetail({
  selectedCase,
  data,
  viewMode,
  isApplicant,
  isOwner,
  isHR,
  isQC: _isQC,
  isActive,
  busy,
  actionError,
  deviceTimezone,
  staffName,
  currentFiles,
  eventsForCase,
  canSchedule,
  canGuidelines,
  canAgreement,
  canUploadEvidence,
  canAccept,
  canHandoff,
  canReturn,
  canActivate,
  canReject,
  applicantNameMatches,
  matchingApplicants,
  pendingUploads,
  fileInputRevision,
  onSubmitSchedule,
  onBindApplicant,
  onInviteApplicant,
  onUploadFile,
  onSubmitAccept,
  onSubmitHandoff,
  onSubmitReturn,
  onSubmitActivation,
  onRejectCase,
  requestedModal,
  onRequestModalChange,
}: HiringCaseDetailProps) {
  const [internalModal, setInternalModal] = useState<ActiveModal>(null);
  const activeModal =
    requestedModal !== undefined ? requestedModal : internalModal;
  const setActiveModal = (modal: ActiveModal) => {
    if (onRequestModalChange) {
      onRequestModalChange(modal);
    }
    setInternalModal(modal);
  };

  const [interviewAt, setInterviewAt] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [bindStaffId, setBindStaffId] = useState("");
  const [bindNotes, setBindNotes] = useState("");
  const [inviteTimezone, setInviteTimezone] = useState(
    data.profile.timezone || "Africa/Lagos"
  );
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>(
    {}
  );
  const [documentFiles, setDocumentFiles] = useState<
    Record<string, File | null>
  >({});
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [signedName, setSignedName] = useState(data.profile.name || "");
  const [agreed, setAgreed] = useState(false);
  const [handoffStartDate, setHandoffStartDate] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [activateNotes, setActivateNotes] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  const matches = matchingApplicants(selectedCase);

  const handleSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onSubmitSchedule(interviewAt, interviewNotes);
    if (ok) {
      setInterviewAt("");
      setInterviewNotes("");
      setActiveModal(null);
    }
  };

  const handleBind = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onBindApplicant(selectedCase, bindStaffId, bindNotes);
    if (ok) {
      setBindStaffId("");
      setBindNotes("");
      setActiveModal(null);
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onInviteApplicant(selectedCase, inviteTimezone);
    if (ok) {
      setActiveModal(null);
    }
  };

  const handleUpload = async (
    category: "hiring_evidence" | "hiring_guidelines" | "hiring_agreement",
    file: File | null,
    note: string
  ) => {
    const ok = await onUploadFile(selectedCase, category, file, note);
    if (ok) {
      if (category === "hiring_evidence") {
        setEvidenceFile(null);
      } else {
        const key =
          category === "hiring_guidelines"
            ? `${selectedCase.id}:guidelines`
            : `${selectedCase.id}:agreement`;
        setDocumentFiles((prev) => ({ ...prev, [key]: null }));
        setDocumentNotes((prev) => ({ ...prev, [key]: "" }));
      }
      setActiveModal(null);
    }
  };

  const handleHandoff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onSubmitHandoff(handoffStartDate, handoffNotes);
    if (ok) {
      setHandoffStartDate("");
      setHandoffNotes("");
      setActiveModal(null);
    }
  };

  const handleReturn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onSubmitReturn(returnNotes);
    if (ok) {
      setReturnNotes("");
      setActiveModal(null);
    }
  };

  const handleActivate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onSubmitActivation(activateNotes);
    if (ok) {
      setActivateNotes("");
      setActiveModal(null);
    }
  };

  const handleReject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onRejectCase(rejectNotes);
    if (ok) {
      setRejectNotes("");
      setActiveModal(null);
    }
  };

  const handleAccept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmitAccept(signedName, agreed);
  };

  // Timeline tab view
  if (viewMode === "timeline" && !isApplicant) {
    return (
      <section className="hire-section" aria-labelledby="timeline-heading">
        <div className="hire-section-head">
          <h3 id="timeline-heading">Immutable manager timeline</h3>
          <span>
            {eventsForCase.length} recorded action
            {eventsForCase.length === 1 ? "" : "s"}
          </span>
        </div>
        {eventsForCase.length > 0 ? (
          eventsForCase.map((event) => (
            <article className="hire-event" key={event.id}>
              <i />
              <div>
                <strong>
                  {titleCase(event.action)} · {staffName(event.actor_id)}
                </strong>
                <small>
                  {formatDate(event.created_at, data.profile.timezone)}
                </small>
                {event.notes && <p>{event.notes}</p>}
              </div>
            </article>
          ))
        ) : (
          <div className="hire-empty">
            <strong>No timeline events yet</strong>
            Stage changes, schedules, and approvals will be logged here.
          </div>
        )}
      </section>
    );
  }

  // Applicant view
  if (isApplicant || viewMode === "applicant") {
    return (
      <section
        className="hire-section"
        aria-labelledby="applicant-accept-heading"
      >
        <div className="hire-section-head">
          <h3 id="applicant-accept-heading">Your current documents</h3>
          <span>Private to your linked account</span>
        </div>
        <div className="hire-callout" style={{ marginBottom: 9 }}>
          <FileText size={14} />
          <p>
            Your current agreement PDF is the offer presented to you. This
            Hiring page does not display pay or bank numbers for other staff.
          </p>
        </div>
        <div className="hire-files">
          {(
            [
              ["guidelines", selectedCase.guidelines_file],
              ["agreement", selectedCase.agreement_file],
            ] as const
          ).map(([kindValue, fileId]) => {
            if (!fileId) {
              return (
                <div className="hire-file-row" key={kindValue}>
                  <div>
                    <strong>{titleCase(kindValue)}</strong>
                    <small>No current PDF attached</small>
                  </div>
                  <span className="hire-pill">Awaiting Owner</span>
                </div>
              );
            }
            const fileRecord = currentFiles.find((file) => file.id === fileId);
            return (
              <div className="hire-file-row" key={kindValue}>
                <div>
                  <strong>
                    {fileRecord?.original_name ?? `Current ${kindValue} PDF`}
                  </strong>
                  <small>
                    {titleCase(kindValue)} ·{" "}
                    {fileRecord?.mime ?? "application/pdf"} · current case
                    version
                  </small>
                </div>
                <a
                  className="hire-doc-link"
                  href={`/api/files?id=${encodeURIComponent(fileId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open private PDF
                </a>
              </div>
            );
          })}
        </div>
        {selectedCase.guidelines_file && selectedCase.agreement_file ? (
          selectedCase.accepted_at ? (
            <div className="hire-callout" style={{ marginTop: 10 }}>
              <CheckCircle2 size={14} />
              <p>
                Your acceptance of current guidelines and agreement is recorded
                at{" "}
                {formatDate(selectedCase.accepted_at, data.profile.timezone)}.
              </p>
            </div>
          ) : (
            <form onSubmit={handleAccept} style={{ marginTop: 12 }}>
              <div className="hire-callout">
                <FileText size={14} />
                <p>
                  Open and review both current PDFs above. Sign using your full
                  name on this signed-in applicant account.
                </p>
              </div>
              {!applicantNameMatches && (
                <div className="hire-callout warning" style={{ marginTop: 8 }}>
                  <AlertCircle size={14} />
                  <p>
                    The signed-in account name does not match the application
                    name. Acceptance is blocked until Owner correction.
                  </p>
                </div>
              )}
              <div className="hire-form-field" style={{ marginTop: 10 }}>
                <label htmlFor="applicant-signature">
                  Your actual full name
                </label>
                <input
                  id="applicant-signature"
                  value={signedName}
                  onChange={(event) => setSignedName(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  required
                />
              </div>
              <label className="hire-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  required
                />{" "}
                I have read the current guidelines and agreement PDFs and accept
                this version.
              </label>
              <div className="hire-actions">
                <button
                  type="submit"
                  className="hire-button primary"
                  disabled={!canAccept || !agreed || busy.startsWith("accept:")}
                >
                  {busy.startsWith("accept:") ? (
                    <>
                      <LoaderCircle size={13} /> Recording…
                    </>
                  ) : (
                    "Record my acceptance"
                  )}
                </button>
              </div>
            </form>
          )
        ) : (
          <div className="hire-empty">
            <strong>Documents are not ready</strong>The Owner must attach
            current actual guidelines and agreement PDFs before you can accept
            them.
          </div>
        )}
      </section>
    );
  }

  // Manager / Reviewer "Next Step & Docs" view
  return (
    <>
      {/* Interview Schedule Summary & Action */}
      {(selectedCase.interview_at || ((isOwner || isHR) && canSchedule)) && (
        <section className="hire-section" aria-labelledby="schedule-heading">
          <div
            className="hire-section-head"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 id="schedule-heading">Joint interview schedule</h3>
              <span>
                {selectedCase.interview_at
                  ? "Scheduled interview time"
                  : "HR/Owner scheduling"}
              </span>
            </div>
            {(isOwner || isHR) && canSchedule && (
              <button
                type="button"
                className="hire-button primary"
                onClick={() => setActiveModal("schedule")}
                disabled={!isActive || Boolean(busy)}
              >
                <CalendarClock size={13} />{" "}
                {selectedCase.interview_at
                  ? "Reschedule Interview"
                  : "Schedule Interview"}
              </button>
            )}
          </div>
          {selectedCase.interview_at ? (
            <div className="hire-callout">
              <Clock3 size={14} />
              <p>
                Scheduled for{" "}
                <strong>
                  {formatDate(selectedCase.interview_at, data.profile.timezone)}
                </strong>{" "}
                · {data.profile.timezone}
              </p>
            </div>
          ) : (
            <div className="hire-callout">
              <CalendarClock size={14} />
              <p>
                No joint interview scheduled yet. Scheduling moves this case to
                the Interview stage.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Applicant Identity Section (Selected Stage) */}
      {selectedCase.stage === "selected" && (
        <section className="hire-section" aria-labelledby="identity-heading">
          <div
            className="hire-section-head"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 id="identity-heading">Applicant account identity</h3>
              <span>Owner provisioned</span>
            </div>
            {!selectedCase.staff_id && isOwner && isActive && (
              <button
                type="button"
                className="hire-button primary"
                onClick={() => setActiveModal("identity")}
                disabled={Boolean(busy)}
              >
                <UserPlus size={13} />{" "}
                {matches.length > 0 ? "Link Account" : "Invite Account"}
              </button>
            )}
          </div>
          {selectedCase.staff_id ? (
            <div className="hire-callout">
              <CheckCircle2 size={14} />
              <p>
                Linked applicant account:{" "}
                <strong>{staffName(selectedCase.staff_id)}</strong>. Account
                remains unprivileged until Owner activation.
              </p>
            </div>
          ) : (
            <div className="hire-callout warning">
              <UserPlus size={14} />
              <p>
                {matches.length > 0
                  ? `${matches.length} matching applicant account(s) found. Link the account before publishing agreements.`
                  : "No applicant account linked yet. Invite the applicant by email to create their restricted account."}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Private Documents & Evidence */}
      <section className="hire-section" aria-labelledby="documents-heading">
        <div
          className="hire-section-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 id="documents-heading">Private documents and evidence</h3>
            <span>Authenticated file links</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canUploadEvidence && (
              <button
                type="button"
                className="hire-button"
                onClick={() => setActiveModal("evidence")}
                disabled={Boolean(busy)}
              >
                <Upload size={13} /> Upload Evidence
              </button>
            )}
            {selectedCase.stage === "selected" && canGuidelines && (
              <button
                type="button"
                className="hire-button"
                onClick={() => setActiveModal("guidelines")}
                disabled={Boolean(busy)}
              >
                <FileUp size={13} /> Publish Guidelines PDF
              </button>
            )}
            {selectedCase.stage === "selected" && canAgreement && (
              <button
                type="button"
                className="hire-button primary"
                onClick={() => setActiveModal("agreement")}
                disabled={Boolean(busy)}
              >
                <ShieldCheck size={13} /> Publish Agreement PDF
              </button>
            )}
          </div>
        </div>

        <div className="hire-files">
          {(["guidelines", "agreement"] as const).map((kindValue) => {
            const fileId =
              kindValue === "guidelines"
                ? selectedCase.guidelines_file
                : selectedCase.agreement_file;
            const fileRecord = currentFiles.find((file) => file.id === fileId);
            return fileId ? (
              <div className="hire-file-row" key={kindValue}>
                <div>
                  <strong>
                    {fileRecord?.original_name ?? `Current ${kindValue} PDF`}
                  </strong>
                  <small>
                    {titleCase(kindValue)} ·{" "}
                    {fileRecord?.mime ?? "application/pdf"} · current version
                    for this case
                  </small>
                </div>
                <a
                  className="hire-doc-link"
                  href={`/api/files?id=${encodeURIComponent(fileId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open private PDF
                </a>
              </div>
            ) : (
              <div className="hire-file-row" key={kindValue}>
                <div>
                  <strong>{titleCase(kindValue)} PDF</strong>
                  <small>No current PDF attached</small>
                </div>
                <span className="hire-pill">
                  {["applied", "interview"].includes(selectedCase.stage)
                    ? "Pending selection"
                    : "Awaiting upload"}
                </span>
              </div>
            );
          })}

          {["applied", "interview"].includes(selectedCase.stage) && (
            <div
              style={{
                marginTop: 8,
                fontSize: "11.5px",
                color: "var(--muted, #64748b)",
              }}
            >
              <em>
                Note: Guidelines and employment agreement PDFs are uploaded by
                the academy once the candidate passes their interview reviews.
                The applicant does not upload these documents.
              </em>
            </div>
          )}

          {currentFiles
            .filter((file) => file.category === "hiring_evidence")
            .map((file) => (
              <div className="hire-file-row" key={file.id}>
                <div>
                  <strong>{file.original_name}</strong>
                  <small>Private evidence · {file.mime}</small>
                </div>
                <a
                  className="hire-doc-link"
                  href={`/api/files?id=${encodeURIComponent(file.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open private file
                </a>
              </div>
            ))}
        </div>

        {isOwner &&
          selectedCase.stage === "selected" &&
          !selectedCase.staff_id && (
            <div className="hire-callout warning" style={{ marginTop: 10 }}>
              <UserPlus size={14} />
              <p>
                Link or invite the applicant account first. Then approve its
                initial salary offer in <Link href="/payroll">Payroll</Link>;
                agreement publication unlocks once the identity is linked.
              </p>
            </div>
          )}

        {selectedCase.accepted_at && (
          <div className="hire-callout" style={{ marginTop: 10 }}>
            <CheckCircle2 size={14} />
            <p>
              Applicant accepted guidelines &amp; agreement on{" "}
              {formatDate(selectedCase.accepted_at, data.profile.timezone)}.
            </p>
          </div>
        )}
      </section>

      {/* Finalize Handoff Section */}
      {canHandoff && (
        <section
          className="hire-section"
          aria-labelledby="handoff-action-heading"
        >
          <div
            className="hire-section-head"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 id="handoff-action-heading">Finalize employment handoff</h3>
              <span>
                Assigned supervisor:{" "}
                {roleLabel(
                  isMusicEducationRole(selectedCase.desired_role) ? "qc" : "hr"
                )}
              </span>
            </div>
            <button
              type="button"
              className="hire-button primary"
              onClick={() => setActiveModal("handoff")}
              disabled={!isActive || Boolean(busy)}
            >
              <Send size={13} /> Finalize Handoff
            </button>
          </div>
          <div className="hire-callout warning">
            <ShieldCheck size={14} />
            <p>
              Training, linked applicant identity, and candidate acceptance are
              verified. Finalizing moves this candidate to the Ready stage after
              checking approved pay and bank details in Payroll.
            </p>
          </div>
        </section>
      )}

      {/* Ready Stage Actions (Activate / Return for Correction) */}
      {(canActivate || canReturn) && (
        <section className="hire-section" aria-labelledby="ready-actions-heading">
          <div
            className="hire-section-head"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 id="ready-actions-heading">Ready for activation</h3>
              <span>Final approval boundary</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canReturn && (
                <button
                  type="button"
                  className="hire-button"
                  onClick={() => setActiveModal("return")}
                  disabled={Boolean(busy)}
                >
                  <RotateCcw size={13} /> Return for Correction
                </button>
              )}
              {canActivate && (
                <button
                  type="button"
                  className="hire-button primary"
                  onClick={() => setActiveModal("activate")}
                  disabled={!isActive || Boolean(busy)}
                >
                  <UserCheck size={13} /> Activate Account
                </button>
              )}
            </div>
          </div>
          <div className="hire-callout">
            <ShieldCheck size={14} />
            <p>
              Start date:{" "}
              <strong>{selectedCase.start_date ?? "Not recorded"}</strong>.
              Activating promotes the linked applicant account to active{" "}
              {roleLabel(selectedCase.desired_role)} status.
            </p>
          </div>
        </section>
      )}

      {/* Reject Candidate Footer */}
      {canReject && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            paddingTop: 14,
            marginTop: 8,
            borderTop: "1px solid var(--line)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Need to close this hiring case without onboarding?
          </span>
          <button
            type="button"
            className="hire-button danger"
            onClick={() => setActiveModal("reject")}
            disabled={!isActive || Boolean(busy)}
          >
            <XCircle size={13} /> Reject Candidate
          </button>
        </div>
      )}

      {/* ========== MODALS ========== */}

      {/* Schedule / Reschedule Interview Modal */}
      <PortalModal
        open={activeModal === "schedule"}
        onClose={() => setActiveModal(null)}
        eyebrow="Joint interview"
        title={
          selectedCase.interview_at
            ? "Reschedule interview"
            : "Schedule interview"
        }
        subtitle={`${selectedCase.name} · ${roleLabel(selectedCase.desired_role)}`}
        size="md"
        busy={busy.startsWith("schedule:")}
      >
        <form onSubmit={handleSchedule} style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}
          <div className="hire-form-field">
            <label htmlFor="interview-at">
              Interview time · device timezone ({deviceTimezone})
            </label>
            <input
              id="interview-at"
              type="datetime-local"
              value={interviewAt}
              onChange={(event) => setInterviewAt(event.target.value)}
              required
            />
            <small>
              {interviewAt && Number.isFinite(new Date(interviewAt).getTime())
                ? `Saved as UTC ${new Date(interviewAt).toISOString()}`
                : "The selected local time is converted to an ISO timestamp with an explicit UTC offset."}
            </small>
          </div>
          <div className="hire-form-field">
            <label htmlFor="interview-notes">
              Scheduling notes · at least 5 characters
            </label>
            <textarea
              id="interview-notes"
              rows={3}
              value={interviewNotes}
              onChange={(event) => setInterviewNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setActiveModal(null)}
              disabled={busy.startsWith("schedule:")}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hire-button primary"
              disabled={!isActive || busy.startsWith("schedule:")}
            >
              {busy.startsWith("schedule:") ? (
                <>
                  <LoaderCircle size={13} /> Saving…
                </>
              ) : (
                "Save interview time"
              )}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Link / Invite Account Modal */}
      <PortalModal
        open={activeModal === "identity"}
        onClose={() => setActiveModal(null)}
        eyebrow="Owner identity binding"
        title={
          matches.length > 0
            ? "Link existing applicant account"
            : "Invite applicant by email"
        }
        subtitle={`${selectedCase.name} · ${selectedCase.email}`}
        size="md"
        busy={
          busy === `bind:${selectedCase.id}` ||
          busy === `invite:${selectedCase.id}`
        }
      >
        {actionError && (
          <div className="hire-alert" role="alert">
            <AlertCircle size={15} />
            <p>{actionError}</p>
          </div>
        )}
        {matches.length > 0 ? (
          <form onSubmit={handleBind} style={{ display: "grid", gap: 12 }}>
            <div className="hire-form-field">
              <label htmlFor="existing-applicant">
                Existing applicant account · exact email and role match
              </label>
              <select
                id="existing-applicant"
                value={bindStaffId}
                onChange={(event) => setBindStaffId(event.target.value)}
                required
              >
                <option value="">Select matching applicant</option>
                {matches.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="hire-form-field">
              <label htmlFor="bind-notes">
                Linking note · at least 5 characters
              </label>
              <textarea
                id="bind-notes"
                rows={3}
                value={bindNotes}
                onChange={(event) => setBindNotes(event.target.value)}
                minLength={5}
                maxLength={2000}
                required
              />
            </div>
            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="hire-button tertiary"
                onClick={() => setActiveModal(null)}
                disabled={Boolean(busy)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="hire-button primary"
                disabled={
                  !bindStaffId || bindNotes.trim().length < 5 || Boolean(busy)
                }
              >
                {busy === `bind:${selectedCase.id}` ? (
                  <>
                    <LoaderCircle size={13} /> Linking…
                  </>
                ) : (
                  "Link existing applicant"
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleInvite} style={{ display: "grid", gap: 12 }}>
            <div className="hire-callout warning">
              <UserPlus size={14} />
              <p>
                Invitation creates a restricted applicant account and links it
                to this case; it does not activate full staff access.
              </p>
            </div>
            <div className="hire-form-field">
              <label htmlFor="invite-timezone">
                Applicant timezone · IANA identifier
              </label>
              <input
                id="invite-timezone"
                list="hiring-iana-timezones"
                value={inviteTimezone}
                onChange={(event) => setInviteTimezone(event.target.value)}
                maxLength={100}
                placeholder="Africa/Lagos"
                required
              />
              <datalist id="hiring-iana-timezones">
                {COMMON_IANA_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </div>
            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="hire-button tertiary"
                onClick={() => setActiveModal(null)}
                disabled={Boolean(busy)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="hire-button primary"
                disabled={!inviteTimezone.trim() || Boolean(busy)}
              >
                {busy === `invite:${selectedCase.id}` ? (
                  <>
                    <LoaderCircle size={13} /> Inviting…
                  </>
                ) : (
                  "Invite applicant by email"
                )}
              </button>
            </div>
          </form>
        )}
      </PortalModal>

      {/* Upload Evidence Modal */}
      <PortalModal
        open={activeModal === "evidence"}
        onClose={() => setActiveModal(null)}
        eyebrow="Private evidence"
        title="Upload case evidence"
        subtitle="PDF, images, audio, or video up to 50 MiB."
        size="md"
        busy={busy === `upload:${selectedCase.id}:evidence`}
      >
        <div style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}
          <div className="hire-form-field">
            <label htmlFor="evidence-file">
              Select file · up to 50 MiB
            </label>
            <input
              key={fileInputRevision.evidence ?? 0}
              id="evidence-file"
              type="file"
              accept={uploadTypes}
              disabled={Boolean(pendingUploads[`${selectedCase.id}:evidence`])}
              onChange={(event) =>
                setEvidenceFile(event.target.files?.[0] ?? null)
              }
            />
            {pendingUploads[`${selectedCase.id}:evidence`] && (
              <small>
                Checking for earlier private upload of{" "}
                {pendingUploads[`${selectedCase.id}:evidence`]?.fileName}. Retry
                checks without duplicate upload.
              </small>
            )}
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setActiveModal(null)}
              disabled={Boolean(busy)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="hire-button primary"
              onClick={() =>
                void handleUpload("hiring_evidence", evidenceFile, "")
              }
              disabled={
                (!evidenceFile &&
                  !pendingUploads[`${selectedCase.id}:evidence`]) ||
                Boolean(busy)
              }
            >
              {busy === `upload:${selectedCase.id}:evidence` ? (
                <>
                  <LoaderCircle size={13} /> Uploading…
                </>
              ) : pendingUploads[`${selectedCase.id}:evidence`] ? (
                "Check existing upload"
              ) : (
                "Upload private evidence"
              )}
            </button>
          </div>
        </div>
      </PortalModal>

      {/* Publish Guidelines PDF Modal */}
      <PortalModal
        open={activeModal === "guidelines"}
        onClose={() => setActiveModal(null)}
        eyebrow="Onboarding documents"
        title="Publish guidelines PDF"
        subtitle={`Attach the current academy guidelines for ${selectedCase.name}.`}
        size="md"
        busy={busy === `upload:${selectedCase.id}:guidelines`}
      >
        <div style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}
          <div className="hire-callout warning">
            <FileText size={14} />
            <p>
              Upload the approved PDF itself. Replacing the current version
              resets applicant acceptance and requires fresh review.
            </p>
          </div>
          <div className="hire-form-field">
            <label htmlFor="guideline-pdf">Upload actual guidelines PDF</label>
            <input
              key={fileInputRevision[`${selectedCase.id}:guidelines`] ?? 0}
              id="guideline-pdf"
              type="file"
              accept="application/pdf,.pdf"
              disabled={Boolean(
                pendingUploads[`${selectedCase.id}:guidelines`]
              )}
              onChange={(event) =>
                setDocumentFiles((prev) => ({
                  ...prev,
                  [`${selectedCase.id}:guidelines`]:
                    event.target.files?.[0] ?? null,
                }))
              }
            />
            {pendingUploads[`${selectedCase.id}:guidelines`] && (
              <small>
                Checking earlier upload:{" "}
                {pendingUploads[`${selectedCase.id}:guidelines`]?.fileName}.
              </small>
            )}
          </div>
          <div className="hire-form-field">
            <label htmlFor="guideline-notes">
              Guidelines publication note · at least 5 characters
            </label>
            <textarea
              id="guideline-notes"
              rows={3}
              value={documentNotes[`${selectedCase.id}:guidelines`] ?? ""}
              onChange={(event) =>
                setDocumentNotes((prev) => ({
                  ...prev,
                  [`${selectedCase.id}:guidelines`]: event.target.value,
                }))
              }
              minLength={5}
              maxLength={2000}
            />
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setActiveModal(null)}
              disabled={Boolean(busy)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="hire-button primary"
              onClick={() =>
                void handleUpload(
                  "hiring_guidelines",
                  documentFiles[`${selectedCase.id}:guidelines`] ?? null,
                  documentNotes[`${selectedCase.id}:guidelines`] ?? ""
                )
              }
              disabled={Boolean(busy)}
            >
              {busy === `upload:${selectedCase.id}:guidelines` ? (
                <>
                  <LoaderCircle size={13} /> Uploading…
                </>
              ) : pendingUploads[`${selectedCase.id}:guidelines`] ? (
                "Check existing PDF"
              ) : (
                "Publish current guidelines"
              )}
            </button>
          </div>
        </div>
      </PortalModal>

      {/* Publish Agreement PDF Modal */}
      <PortalModal
        open={activeModal === "agreement"}
        onClose={() => setActiveModal(null)}
        eyebrow="Owner offer publication"
        title="Publish agreement PDF"
        subtitle={`Attach the employment agreement pinned to ${selectedCase.name}'s approved Payroll terms.`}
        size="md"
        busy={busy === `upload:${selectedCase.id}:agreement`}
      >
        <div style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}
          <div className="hire-callout warning">
            <ShieldCheck size={14} />
            <p>
              Before publishing, approve this applicant’s initial salary offer
              in <Link href="/payroll">Payroll</Link>. This PDF is pinned to
              that approved offer.
            </p>
          </div>
          <div className="hire-form-field">
            <label htmlFor="agreement-pdf">Upload actual agreement PDF</label>
            <input
              key={fileInputRevision[`${selectedCase.id}:agreement`] ?? 0}
              id="agreement-pdf"
              type="file"
              accept="application/pdf,.pdf"
              disabled={Boolean(pendingUploads[`${selectedCase.id}:agreement`])}
              onChange={(event) =>
                setDocumentFiles((prev) => ({
                  ...prev,
                  [`${selectedCase.id}:agreement`]:
                    event.target.files?.[0] ?? null,
                }))
              }
            />
            {pendingUploads[`${selectedCase.id}:agreement`] && (
              <small>
                Checking earlier upload:{" "}
                {pendingUploads[`${selectedCase.id}:agreement`]?.fileName}.
              </small>
            )}
          </div>
          <div className="hire-form-field">
            <label htmlFor="agreement-notes">
              Owner publication note · at least 5 characters
            </label>
            <textarea
              id="agreement-notes"
              rows={3}
              value={documentNotes[`${selectedCase.id}:agreement`] ?? ""}
              onChange={(event) =>
                setDocumentNotes((prev) => ({
                  ...prev,
                  [`${selectedCase.id}:agreement`]: event.target.value,
                }))
              }
              minLength={5}
              maxLength={2000}
            />
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setActiveModal(null)}
              disabled={Boolean(busy)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="hire-button primary"
              onClick={() =>
                void handleUpload(
                  "hiring_agreement",
                  documentFiles[`${selectedCase.id}:agreement`] ?? null,
                  documentNotes[`${selectedCase.id}:agreement`] ?? ""
                )
              }
              disabled={Boolean(busy)}
            >
              {busy === `upload:${selectedCase.id}:agreement` ? (
                <>
                  <LoaderCircle size={13} /> Uploading…
                </>
              ) : pendingUploads[`${selectedCase.id}:agreement`] ? (
                "Check existing PDF"
              ) : (
                "Owner publish agreement"
              )}
            </button>
          </div>
        </div>
      </PortalModal>

      {/* Finalize Handoff Modal */}
      <PortalModal
        open={activeModal === "handoff"}
        onClose={() => setActiveModal(null)}
        eyebrow="Ready handoff"
        title="Finalize employment handoff"
        subtitle={`Move ${selectedCase.name} to Ready for Owner activation.`}
        size="md"
        busy={busy.startsWith("handoff:")}
      >
        <form onSubmit={handleHandoff} style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}
          <div className="hire-callout warning">
            <ShieldCheck size={14} />
            <p>
              Owner/Finance must complete private pay and bank setup in Payroll.
              The server blocks handoff until approved pay and bank currency are
              verified.
            </p>
          </div>
          <div className="hire-form-field">
            <label htmlFor="start-date">Actual staff start date</label>
            <input
              id="start-date"
              type="date"
              value={handoffStartDate}
              onChange={(event) => setHandoffStartDate(event.target.value)}
              required
            />
          </div>
          <div className="hire-form-field">
            <label htmlFor="handoff-notes">
              Handoff notes · at least 5 characters
            </label>
            <textarea
              id="handoff-notes"
              rows={3}
              value={handoffNotes}
              onChange={(event) => setHandoffNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setActiveModal(null)}
              disabled={Boolean(busy)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hire-button primary"
              disabled={!isActive || Boolean(busy)}
            >
              {busy.startsWith("handoff:") ? (
                <>
                  <LoaderCircle size={13} /> Finalizing…
                </>
              ) : (
                "Send to ready handoff"
              )}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Return for Correction Modal */}
      <PortalModal
        open={activeModal === "return"}
        onClose={() => setActiveModal(null)}
        eyebrow="Correction workflow"
        title="Return ready case for correction?"
        subtitle={`${selectedCase.name} · resets stage to Selected`}
        size="sm"
        busy={busy.startsWith("return:")}
      >
        <form onSubmit={handleReturn} style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}
          <div className="hire-callout warning">
            <AlertTriangle size={15} />
            <p>
              <strong>Warning:</strong> Returning this case resets it to{" "}
              <strong>Selected</strong> and permanently{" "}
              <strong>
                clears the pinned agreement PDF and applicant acceptance
              </strong>
              . The agreement must be republished and re-accepted before handoff
              can run again.
            </p>
          </div>
          <div className="hire-form-field">
            <label htmlFor="return-notes">
              Correction reason · at least 5 characters
            </label>
            <textarea
              id="return-notes"
              rows={3}
              value={returnNotes}
              onChange={(event) => setReturnNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setActiveModal(null)}
              disabled={Boolean(busy)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hire-button"
              disabled={returnNotes.trim().length < 5 || Boolean(busy)}
            >
              {busy.startsWith("return:") ? (
                <>
                  <LoaderCircle size={13} /> Returning…
                </>
              ) : (
                "Confirm Return to Selected"
              )}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Activate Account Modal */}
      <PortalModal
        open={activeModal === "activate"}
        onClose={() => setActiveModal(null)}
        eyebrow="Owner activation"
        title="Activate staff account"
        subtitle={`Promote ${selectedCase.name} to active ${roleLabel(
          selectedCase.desired_role
        )}`}
        size="sm"
        busy={busy.startsWith("activate:")}
      >
        <form onSubmit={handleActivate} style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}
          <div className="hire-callout">
            <ShieldCheck size={14} />
            <p>
              Activation grants full {roleLabel(selectedCase.desired_role)}{" "}
              workspace permissions to the linked applicant account.
            </p>
          </div>
          <div className="hire-form-field">
            <label htmlFor="activate-notes">
              Activation note · at least 5 characters
            </label>
            <textarea
              id="activate-notes"
              rows={3}
              value={activateNotes}
              onChange={(event) => setActivateNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setActiveModal(null)}
              disabled={Boolean(busy)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hire-button primary"
              disabled={
                !isActive || activateNotes.trim().length < 5 || Boolean(busy)
              }
            >
              {busy.startsWith("activate:") ? (
                <>
                  <LoaderCircle size={13} /> Activating…
                </>
              ) : (
                "Activate staff account"
              )}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Reject Candidate Danger Modal */}
      <PortalModal
        open={activeModal === "reject"}
        onClose={() => setActiveModal(null)}
        eyebrow="Permanent closure"
        title="Reject candidate?"
        subtitle={`Close hiring case for ${selectedCase.name} (${roleLabel(
          selectedCase.desired_role
        )})`}
        size="sm"
        busy={busy.startsWith("reject:")}
      >
        <form onSubmit={handleReject} style={{ display: "grid", gap: 12 }}>
          {actionError && (
            <div className="hire-alert" role="alert">
              <AlertCircle size={15} />
              <p>{actionError}</p>
            </div>
          )}
          <div className="hire-callout warning">
            <AlertTriangle size={15} />
            <p>
              This permanently marks the hiring case as{" "}
              <strong>Rejected</strong> and ends the onboarding workflow.
            </p>
          </div>
          <div className="hire-form-field">
            <label htmlFor="reject-notes">
              Rejection reason · at least 5 characters
            </label>
            <textarea
              id="reject-notes"
              rows={3}
              value={rejectNotes}
              onChange={(event) => setRejectNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
            />
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => setActiveModal(null)}
              disabled={Boolean(busy)}
            >
              Keep case open
            </button>
            <button
              type="submit"
              className="hire-button danger"
              disabled={
                !isActive || rejectNotes.trim().length < 5 || Boolean(busy)
              }
            >
              {busy.startsWith("reject:") ? (
                <>
                  <LoaderCircle size={13} /> Rejecting…
                </>
              ) : (
                "Confirm Rejection"
              )}
            </button>
          </div>
        </form>
      </PortalModal>
    </>
  );
}
