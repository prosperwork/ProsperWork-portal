"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import {
  type HiringCase,
  type HiringDirectory,
  type HiringEvent,
  type HiringFile,
} from "@/lib/academy/hiring";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import {
  formatDate,
  roleLabel,
  titleCase,
  uploadTypes,
  type HiringData,
  type PendingUpload,
} from "../hiring-types";

export interface HiringCaseDetailProps {
  selectedCase: HiringCase;
  data: HiringData;
  isApplicant: boolean;
  isOwner: boolean;
  isHR: boolean;
  isQC: boolean;
  isActive: boolean;
  busy: string;
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
  ) => Promise<void>;
  onInviteApplicant: (candidate: HiringCase, timezone: string) => Promise<void>;
  onUploadFile: (
    candidate: HiringCase,
    category: "hiring_guidelines" | "hiring_agreement" | "hiring_evidence",
    file: File | null,
    note: string
  ) => Promise<void>;
  onSubmitAccept: (signedName: string, agreed: boolean) => Promise<void>;
  onSubmitHandoff: (startDate: string, notes: string) => Promise<void>;
  onSubmitReturn: (notes: string) => Promise<void>;
  onSubmitActivation: (notes: string) => Promise<void>;
  onRejectCase: (notes: string) => Promise<void>;
}

export default function HiringCaseDetail({
  selectedCase,
  data,
  isApplicant,
  isOwner,
  isHR,
  isQC: _isQC,
  isActive,
  busy,
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
}: HiringCaseDetailProps) {
  const [interviewAt, setInterviewAt] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [bindStaffId, setBindStaffId] = useState("");
  const [bindNotes, setBindNotes] = useState("");
  const [inviteTimezone, setInviteTimezone] = useState("");
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

  const handleSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onSubmitSchedule(interviewAt, interviewNotes);
    if (ok) {
      setInterviewAt("");
      setInterviewNotes("");
    }
  };

  const handleHandoff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmitHandoff(handoffStartDate, handoffNotes);
    setHandoffStartDate("");
    setHandoffNotes("");
  };

  const handleAccept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmitAccept(signedName, agreed);
  };

  return (
    <>
      {!isApplicant && (
        <section
          className="hire-section"
          style={{
            background: "#f8faf9",
            border: "1px solid #dce7e1",
            marginBottom: 16,
          }}
        >
          <div>
            <span
              className="hire-pill ready"
              style={{
                textTransform: "uppercase",
                fontSize: "10px",
                fontWeight: 800,
              }}
            >
              Current Stage: {titleCase(selectedCase.stage)}
            </span>
            <h3
              style={{
                margin: "6px 0 2px",
                fontSize: "15px",
                color: "var(--foreground, #0f172a)",
              }}
            >
              {selectedCase.stage === "applied" &&
                "Step 1: Schedule Joint Interview"}
              {selectedCase.stage === "interview" &&
                "Step 2: Complete Audition & Department Reviews"}
              {selectedCase.stage === "selected" &&
                "Step 3: Account Invitation & Official Agreements"}
              {selectedCase.stage === "ready" &&
                "Step 4: Finalize Training, Bank & Activate"}
              {selectedCase.stage === "activated" &&
                "Active Academy Staff Member"}
              {selectedCase.stage === "rejected" && "Case Closed (Rejected)"}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                color: "var(--muted, #64748b)",
              }}
            >
              {selectedCase.stage === "applied" &&
                "Select an interview date and time below to move this applicant to the interview stage."}
              {selectedCase.stage === "interview" &&
                "Record the HR interview and teacher audition. Passing reviews allow selecting the applicant."}
              {selectedCase.stage === "selected" &&
                "Invite the applicant by email to create their password, and upload the approved academy agreement PDF."}
              {selectedCase.stage === "ready" &&
                "All requirements and payroll checks are met. Click Activate to grant full academy permissions."}
              {selectedCase.stage === "activated" &&
                "This teacher account is active and teaching in the academy."}
              {selectedCase.stage === "rejected" &&
                "This recruitment case has been concluded."}
            </p>
          </div>
        </section>
      )}

      {!isApplicant && (isOwner || isHR) && canSchedule && (
        <section className="hire-section" aria-labelledby="schedule-heading">
          <div className="hire-section-head">
            <h3 id="schedule-heading">Joint interview schedule</h3>
            <span>
              {selectedCase.interview_at
                ? "Rescheduling appends a new event"
                : "HR/Owner scheduling"}
            </span>
          </div>
          {selectedCase.interview_at && (
            <div className="hire-callout" style={{ marginBottom: 9 }}>
              <Clock3 size={14} />
              <p>
                Current interview:{" "}
                {formatDate(selectedCase.interview_at, data.profile.timezone)} ·{" "}
                {data.profile.timezone}
              </p>
            </div>
          )}
          <form onSubmit={handleSchedule}>
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
                value={interviewNotes}
                onChange={(event) => setInterviewNotes(event.target.value)}
                minLength={5}
                maxLength={2000}
                required
              />
            </div>
            <div className="hire-actions">
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
        </section>
      )}

      {!isApplicant && selectedCase.stage === "selected" && (
        <section className="hire-section" aria-labelledby="identity-heading">
          <div className="hire-section-head">
            <h3 id="identity-heading">Applicant account identity</h3>
            <span>Owner provisioned</span>
          </div>
          {selectedCase.staff_id ? (
            <div className="hire-callout">
              <CheckCircle2 size={14} />
              <p>
                Linked applicant account: {staffName(selectedCase.staff_id)}.
                Account remains unprivileged until Owner activation.
              </p>
            </div>
          ) : (
            isOwner &&
            isActive && (
              <div className="hire-column">
                {matchingApplicants(selectedCase).length > 0 ? (
                  <div className="hire-review-form">
                    <div className="hire-form-field">
                      <label htmlFor="existing-applicant">
                        Existing applicant account · exact email and role match
                      </label>
                      <select
                        id="existing-applicant"
                        value={bindStaffId}
                        onChange={(event) => setBindStaffId(event.target.value)}
                      >
                        <option value="">Select matching applicant</option>
                        {matchingApplicants(selectedCase).map((person) => (
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
                        value={bindNotes}
                        onChange={(event) => setBindNotes(event.target.value)}
                        minLength={5}
                        maxLength={2000}
                      />
                    </div>
                    <div className="hire-actions">
                      <button
                        type="button"
                        className="hire-button primary"
                        onClick={() =>
                          void onBindApplicant(
                            selectedCase,
                            bindStaffId,
                            bindNotes
                          )
                        }
                        disabled={
                          !bindStaffId ||
                          bindNotes.trim().length < 5 ||
                          Boolean(busy)
                        }
                      >
                        Link existing applicant
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="hire-review-form">
                    <div className="hire-callout warning">
                      <UserPlus size={14} />
                      <p>
                        No owner-visible applicant account matches this email
                        and role. Invitation creates a restricted applicant
                        account and links it to this case; it does not activate
                        staff access.
                      </p>
                    </div>
                    <div className="hire-form-field" style={{ marginTop: 9 }}>
                      <label htmlFor="invite-timezone">
                        Applicant timezone · IANA identifier
                      </label>
                      <input
                        id="invite-timezone"
                        value={inviteTimezone}
                        onChange={(event) =>
                          setInviteTimezone(event.target.value)
                        }
                        maxLength={100}
                        placeholder="Enter the applicant’s timezone"
                      />
                    </div>
                    <div className="hire-actions">
                      <button
                        type="button"
                        className="hire-button primary"
                        onClick={() =>
                          void onInviteApplicant(selectedCase, inviteTimezone)
                        }
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
                  </div>
                )}
              </div>
            )
          )}
        </section>
      )}

      {!isApplicant && (
        <section className="hire-section" aria-labelledby="documents-heading">
          <div className="hire-section-head">
            <h3 id="documents-heading">Private documents and evidence</h3>
            <span>Authenticated file links</span>
          </div>
          <div className="hire-files">
            {(["guidelines", "agreement"] as const).map((kindValue) => {
              const fileId =
                kindValue === "guidelines"
                  ? selectedCase.guidelines_file
                  : selectedCase.agreement_file;
              const fileRecord = currentFiles.find(
                (file) => file.id === fileId
              );
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
                  the academy once the candidate passes their audition and
                  interview. The applicant does not upload these documents.
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
                  initial salary offer in Payroll; the agreement publication
                  control appears once the identity is linked.
                </p>
              </div>
            )}
          {canUploadEvidence && (
            <div className="hire-review-form" style={{ marginTop: 10 }}>
              <div className="hire-form-field">
                <label htmlFor="evidence-file">
                  Upload case-scoped evidence · up to 50 MiB
                </label>
                <input
                  key={fileInputRevision.evidence ?? 0}
                  id="evidence-file"
                  type="file"
                  accept={uploadTypes}
                  disabled={Boolean(
                    pendingUploads[`${selectedCase.id}:evidence`]
                  )}
                  onChange={(event) =>
                    setEvidenceFile(event.target.files?.[0] ?? null)
                  }
                />
                {pendingUploads[`${selectedCase.id}:evidence`] && (
                  <small>
                    Checking for earlier private upload of{" "}
                    {pendingUploads[`${selectedCase.id}:evidence`]?.fileName}.
                    Retry checks without duplicate upload.
                  </small>
                )}
              </div>
              <div className="hire-actions">
                <button
                  type="button"
                  className="hire-button"
                  onClick={() =>
                    void onUploadFile(
                      selectedCase,
                      "hiring_evidence",
                      evidenceFile,
                      ""
                    )
                  }
                  disabled={
                    (!evidenceFile &&
                      !pendingUploads[`${selectedCase.id}:evidence`]) ||
                    Boolean(busy)
                  }
                >
                  {pendingUploads[`${selectedCase.id}:evidence`]
                    ? "Check existing upload"
                    : "Upload private evidence"}
                </button>
              </div>
            </div>
          )}
          {selectedCase.stage === "selected" &&
            (canGuidelines || canAgreement) && (
              <div className="hire-form-row" style={{ marginTop: 11 }}>
                {canGuidelines && (
                  <div className="hire-review-form">
                    <div className="hire-callout warning">
                      <FileText size={14} />
                      <p>
                        Upload the approved PDF itself. Replacing the current
                        version resets applicant acceptance and requires fresh
                        review.
                      </p>
                    </div>
                    <div className="hire-form-field" style={{ marginTop: 8 }}>
                      <label htmlFor="guideline-pdf">
                        Upload actual guidelines PDF
                      </label>
                      <input
                        key={
                          fileInputRevision[`${selectedCase.id}:guidelines`] ??
                          0
                        }
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
                          {
                            pendingUploads[`${selectedCase.id}:guidelines`]
                              ?.fileName
                          }
                          .
                        </small>
                      )}
                    </div>
                    <div className="hire-form-field">
                      <label htmlFor="guideline-notes">
                        Guidelines publication note · at least 5 characters
                      </label>
                      <textarea
                        id="guideline-notes"
                        value={
                          documentNotes[`${selectedCase.id}:guidelines`] ?? ""
                        }
                        onChange={(event) =>
                          setDocumentNotes((prev) => ({
                            ...prev,
                            [`${selectedCase.id}:guidelines`]:
                              event.target.value,
                          }))
                        }
                        minLength={5}
                        maxLength={2000}
                      />
                    </div>
                    <button
                      type="button"
                      className="hire-button"
                      onClick={() =>
                        void onUploadFile(
                          selectedCase,
                          "hiring_guidelines",
                          documentFiles[`${selectedCase.id}:guidelines`] ??
                            null,
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
                )}
                {canAgreement && (
                  <div className="hire-review-form">
                    <div className="hire-callout warning">
                      <ShieldCheck size={14} />
                      <p>
                        Before publishing, approve this applicant’s initial
                        salary offer in <Link href="/payroll">Payroll</Link>.
                        Pinned to that approved offer.
                      </p>
                    </div>
                    <div className="hire-form-field" style={{ marginTop: 8 }}>
                      <label htmlFor="agreement-pdf">
                        Upload actual agreement PDF
                      </label>
                      <input
                        key={
                          fileInputRevision[`${selectedCase.id}:agreement`] ?? 0
                        }
                        id="agreement-pdf"
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={Boolean(
                          pendingUploads[`${selectedCase.id}:agreement`]
                        )}
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
                          {
                            pendingUploads[`${selectedCase.id}:agreement`]
                              ?.fileName
                          }
                          .
                        </small>
                      )}
                    </div>
                    <div className="hire-form-field">
                      <label htmlFor="agreement-notes">
                        Owner publication note · at least 5 characters
                      </label>
                      <textarea
                        id="agreement-notes"
                        value={
                          documentNotes[`${selectedCase.id}:agreement`] ?? ""
                        }
                        onChange={(event) =>
                          setDocumentNotes((prev) => ({
                            ...prev,
                            [`${selectedCase.id}:agreement`]:
                              event.target.value,
                          }))
                        }
                        minLength={5}
                        maxLength={2000}
                      />
                    </div>
                    <button
                      type="button"
                      className="hire-button primary"
                      onClick={() =>
                        void onUploadFile(
                          selectedCase,
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
                )}
              </div>
            )}
        </section>
      )}

      {isApplicant && (
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
              const fileRecord = currentFiles.find(
                (file) => file.id === fileId
              );
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
              <div className="hire-callout">
                <CheckCircle2 size={14} />
                <p>
                  Your acceptance of current guidelines and agreement is
                  recorded at{" "}
                  {formatDate(selectedCase.accepted_at, data.profile.timezone)}.
                </p>
              </div>
            ) : (
              <form onSubmit={handleAccept}>
                <div className="hire-callout">
                  <FileText size={14} />
                  <p>
                    Open and review both current PDFs above. Sign using your
                    full name on this signed-in applicant account.
                  </p>
                </div>
                {!applicantNameMatches && (
                  <div
                    className="hire-callout warning"
                    style={{ marginTop: 8 }}
                  >
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
                  I have read the current guidelines and agreement PDFs and
                  accept this version.
                </label>
                <div className="hire-actions">
                  <button
                    type="submit"
                    className="hire-button primary"
                    disabled={
                      !canAccept || !agreed || busy.startsWith("accept:")
                    }
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
      )}

      {!isApplicant && canHandoff && (
        <section
          className="hire-section"
          aria-labelledby="handoff-action-heading"
        >
          <div className="hire-section-head">
            <h3 id="handoff-action-heading">Finalize employment handoff</h3>
            <span>
              Assigned supervisor:{" "}
              {roleLabel(selectedCase.desired_role === "teacher" ? "qc" : "hr")}
            </span>
          </div>
          <div className="hire-callout warning">
            <ShieldCheck size={14} />
            <p>
              Training, linked applicant identity, and candidate acceptance are
              visible. The service separately verifies an Owner-approved initial
              pay rate and matching bank currency.
            </p>
          </div>
          <form onSubmit={handleHandoff} style={{ marginTop: 10 }}>
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
                value={handoffNotes}
                onChange={(event) => setHandoffNotes(event.target.value)}
                minLength={5}
                maxLength={2000}
                required
              />
            </div>
            <p className="hire-privacy">
              Owner/Finance must complete private pay and bank setup in payroll.
              The service blocks handoff until approved pay and bank currency
              are verified.
            </p>
            <div className="hire-actions">
              <button
                type="submit"
                className="hire-button primary"
                disabled={!isActive || Boolean(busy)}
              >
                Send to ready handoff
              </button>
            </div>
          </form>
        </section>
      )}

      {!isApplicant && canReturn && (
        <section className="hire-section" aria-labelledby="return-heading">
          <div className="hire-section-head">
            <h3 id="return-heading">Return ready case for correction</h3>
            <span>HR / Owner · before activation</span>
          </div>
          <div className="hire-callout warning">
            <AlertCircle size={14} />
            <p>
              Use when approved initial pay or bank facts changed after handoff.
              Returning resets it to selected and clears pinned agreement and
              applicant acceptance.
            </p>
          </div>
          <div className="hire-form-field" style={{ marginTop: 9 }}>
            <label htmlFor="return-notes">
              Correction reason · at least 5 characters
            </label>
            <textarea
              id="return-notes"
              value={returnNotes}
              onChange={(event) => setReturnNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
            />
          </div>
          <div className="hire-actions">
            <button
              type="button"
              className="hire-button"
              onClick={() => void onSubmitReturn(returnNotes)}
              disabled={returnNotes.trim().length < 5 || Boolean(busy)}
            >
              {busy.startsWith("return:") ? (
                <>
                  <LoaderCircle size={13} /> Returning…
                </>
              ) : (
                "Return to selected"
              )}
            </button>
          </div>
        </section>
      )}

      {!isApplicant && canActivate && (
        <section className="hire-section" aria-labelledby="activate-heading">
          <div className="hire-section-head">
            <h3 id="activate-heading">Owner activation</h3>
            <span>Final privilege boundary</span>
          </div>
          <div className="hire-callout">
            <ShieldCheck size={14} />
            <p>
              Activation changes the linked applicant account to active staff.
              Review verified ready state before proceeding.
            </p>
          </div>
          <div className="hire-form-field" style={{ marginTop: 9 }}>
            <label htmlFor="activate-notes">
              Activation note · at least 5 characters
            </label>
            <textarea
              id="activate-notes"
              value={activateNotes}
              onChange={(event) => setActivateNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
            />
          </div>
          <div className="hire-actions">
            <button
              type="button"
              className="hire-button primary"
              onClick={() => void onSubmitActivation(activateNotes)}
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
        </section>
      )}

      {!isApplicant && canReject && (
        <section className="hire-section" aria-labelledby="reject-heading">
          <div className="hire-section-head">
            <h3 id="reject-heading">Close case</h3>
            <span>HR/Owner · permanent rejection</span>
          </div>
          <div className="hire-form-field">
            <label htmlFor="reject-notes">
              Rejection reason · at least 5 characters
            </label>
            <textarea
              id="reject-notes"
              value={rejectNotes}
              onChange={(event) => setRejectNotes(event.target.value)}
              minLength={5}
              maxLength={2000}
            />
          </div>
          <div className="hire-actions">
            <button
              type="button"
              className="hire-button danger"
              onClick={() => void onRejectCase(rejectNotes)}
              disabled={
                !isActive || rejectNotes.trim().length < 5 || Boolean(busy)
              }
            >
              Reject case
            </button>
          </div>
        </section>
      )}

      {!isApplicant && eventsForCase.length > 0 && (
        <section className="hire-section" aria-labelledby="timeline-heading">
          <div className="hire-section-head">
            <h3 id="timeline-heading">Immutable manager timeline</h3>
            <span>
              {eventsForCase.length} recorded action
              {eventsForCase.length === 1 ? "" : "s"}
            </span>
          </div>
          {eventsForCase.map((event) => (
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
          ))}
        </section>
      )}
    </>
  );
}
