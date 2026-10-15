"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { hiringAction, type HiringCase } from "@/lib/academy/hiring";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import {
  expectedSupervisor,
  formatDate,
  maxFileBytes,
  roleKey,
  roleLabel,
  titleCase,
  type HiringData,
  type HiringRole,
  type JsonResult,
  type PendingUpload,
  type ReviewKind,
} from "./hiring-types";
import HiringCandidateForm from "./components/HiringCandidateForm";
import HiringReviewForm from "./components/HiringReviewForm";
import HiringCaseDetail from "./components/HiringCaseDetail";

async function readJson(response: Response): Promise<JsonResult> {
  const copy = response.clone();
  try {
    return (await response.json()) as JsonResult;
  } catch {
    const text = await copy.text().catch(() => "");
    return text ? { error: text } : {};
  }
}

function messageFrom(result: JsonResult, status: number) {
  if (typeof result.error === "string") return result.error;
  if (typeof result.message === "string") return result.message;
  return `The hiring request could not be completed (${status}).`;
}

export default function HiringPage() {
  const [data, setData] = useState<HiringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState("");

  const [deviceTimezone, setDeviceTimezone] = useState("device local time");
  const [fileInputRevision, setFileInputRevision] = useState<
    Record<string, number>
  >({});
  const [pendingUploads, setPendingUploads] = useState<
    Record<string, PendingUpload>
  >({});

  const load = useCallback(async (): Promise<HiringData | null> => {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/hiring", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await readJson(response);
      if (response.status === 401) {
        window.location.assign("/login");
        return null;
      }
      if (response.status === 403) setData(null);
      if (!response.ok) throw new Error(messageFrom(result, response.status));
      const payload = result as unknown as HiringData;
      if (
        !payload.profile ||
        !Array.isArray(payload.cases) ||
        !Array.isArray(payload.reviews) ||
        !Array.isArray(payload.events) ||
        !Array.isArray(payload.directory) ||
        !Array.isArray(payload.files) ||
        !Array.isArray(payload.handoffs) ||
        typeof payload.serverNow !== "string"
      ) {
        throw new Error("The hiring service returned an incomplete response.");
      }
      setData(payload);
      return payload;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Hiring records could not be loaded."
      );
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDeviceTimezone(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "device local time"
    );
  }, []);

  const role = roleKey(data?.profile.role ?? "");
  const isOwner = role === "super_admin";
  const isHR = role === "hr";
  const isQC = role === "qc";
  const isHead = role === "head_admin";
  const isFinance = role === "finance";
  const isAdmin = role === "admin";
  const isActive = data?.profile.status === "active";
  const isApplicant = data?.profile.status === "applicant";
  const isManager = isOwner || isHR;

  const serverNow = useMemo(() => {
    const value = data?.serverNow ? new Date(data.serverNow) : new Date();
    return Number.isFinite(value.getTime()) ? value : new Date();
  }, [data?.serverNow]);

  const profileId = data?.profile.id ?? "";
  const directoryById = useMemo(
    () =>
      new Map(
        (data?.directory ?? []).map((person) => [person.id, person] as const)
      ),
    [data?.directory]
  );
  const staffName = (id: string) =>
    id === profileId
      ? data?.profile.name ?? ""
      : directoryById.get(id)?.name ?? "Assigned academy reviewer";

  const applicantCases = useMemo(
    () =>
      data && isApplicant
        ? data.cases.filter((item) => item.staff_id === data.profile.id)
        : [],
    [data, isApplicant]
  );
  const visibleCases = isApplicant ? applicantCases : data?.cases ?? [];
  const selectedCase =
    visibleCases.find((item) => item.id === selectedCaseId) ??
    visibleCases[0] ??
    null;

  const reviewsForCase = useMemo(
    () =>
      data && selectedCase && !isApplicant
        ? data.reviews.filter((item) => item.case_id === selectedCase.id)
        : [],
    [data, selectedCase, isApplicant]
  );
  const eventsForCase = useMemo(
    () =>
      data && selectedCase && !isApplicant
        ? data.events
            .filter((item) => item.case_id === selectedCase.id)
            .slice()
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
        : [],
    [data, selectedCase, isApplicant]
  );
  const currentFiles = useMemo(
    () =>
      data?.files.filter(
        (file) => file.target_id === selectedCase?.id && file.complete
      ) ?? [],
    [data?.files, selectedCase?.id]
  );
  const maySeeReviewDetails = Boolean(
    selectedCase &&
      !isApplicant &&
      ((role !== "finance" && role !== "admin") ||
        selectedCase.reviewer_id === profileId ||
        isManager)
  );

  useEffect(() => {
    if (!data) return;
    const first =
      (isApplicant
        ? data.cases.find((item) => item.staff_id === data.profile.id)
        : data.cases[0]
      )?.id ?? "";
    if (!visibleCases.some((item) => item.id === selectedCaseId))
      setSelectedCaseId(first);
  }, [data, isApplicant, selectedCaseId, visibleCases]);

  const actionRequest = async (value: unknown): Promise<JsonResult> => {
    const parsed = hiringAction.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        issue
          ? `${issue.path.join(".") || "Action"}: ${issue.message}`
          : "The hiring action is invalid."
      );
    }
    const response = await fetch("/api/hiring", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const result = await readJson(response);
    if (response.status === 401) {
      window.location.assign("/login");
      throw new Error("Your session expired. Sign in again to continue.");
    }
    if (response.status === 403) setData(null);
    if (!response.ok || result.ok === false)
      throw new Error(messageFrom(result, response.status));
    return result;
  };

  const runAndConfirm = async (
    key: string,
    action: unknown,
    description: string,
    verify: (fresh: HiringData, result: JsonResult) => boolean
  ) => {
    if (
      !isActive &&
      !(isApplicant && (action as { action?: string }).action === "accept")
    )
      return null;
    setBusy(key);
    setActionError("");
    setNotice("");
    try {
      const result = await actionRequest(action);
      const fresh = await load();
      if (!fresh || !verify(fresh, result))
        throw new Error(
          "The change was accepted but is not present in the current hiring record yet. Refresh before retrying."
        );
      setNotice(description);
      return fresh;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The hiring change could not be saved."
      );
      return null;
    } finally {
      setBusy("");
    }
  };

  const submitCreate = async (formData: {
    name: string;
    email: string;
    role: HiringRole;
    reviewerId: string;
    notes: string;
  }): Promise<boolean> => {
    if (!data || !isActive || !(isOwner || isHR)) return false;
    const supervisorRole = expectedSupervisor(formData.role);
    const supervisor = data.directory.find(
      (person) =>
        person.id === formData.reviewerId &&
        person.status === "active" &&
        (roleKey(person.role) === supervisorRole || person.role === "super_admin")
    );
    if (!supervisor) {
      setActionError(
        `Choose an active, independent ${roleLabel(supervisorRole)} reviewer or Super Admin.`
      );
      return false;
    }

    setBusy("create");
    setActionError("");
    setNotice("");
    try {
      const before = new Set(data.cases.map((item) => item.id));
      const result = await actionRequest({
        action: "create",
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        reviewerId: formData.reviewerId,
        notes: formData.notes.trim(),
      });
      const fresh = await load();
      const created = fresh?.cases.find(
        (item) =>
          (typeof result.id === "string" && item.id === result.id) ||
          (!before.has(item.id) &&
            item.email.toLowerCase() === formData.email.trim().toLowerCase())
      );
      if (!fresh || !created)
        throw new Error(
          "The applicant was submitted but the new case is not visible yet. Refresh before submitting another."
        );
      setSelectedCaseId(created.id);
      setNotice(`Applicant case created for ${created.name}.`);
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The applicant case could not be created."
      );
      return false;
    } finally {
      setBusy("");
    }
  };

  const submitSchedule = async (
    at: string,
    notes: string
  ): Promise<boolean> => {
    if (!data || !selectedCase || !isActive || !(isOwner || isHR)) return false;
    const date = at ? new Date(at) : null;
    if (
      !date ||
      !Number.isFinite(date.getTime()) ||
      !notes.trim() ||
      notes.trim().length < 5
    ) {
      setActionError(
        "Choose an interview date and add scheduling notes of at least 5 characters."
      );
      return false;
    }
    const isoAt = date.toISOString();
    const fresh = await runAndConfirm(
      `schedule:${selectedCase.id}`,
      {
        action: "schedule",
        id: selectedCase.id,
        at: isoAt,
        notes: notes.trim(),
      },
      "Interview schedule saved.",
      (records) =>
        records.cases.some(
          (item) =>
            item.id === selectedCase.id &&
            item.stage === "interview" &&
            item.interview_at &&
            new Date(item.interview_at).getTime() === date.getTime()
        )
    );
    return Boolean(fresh);
  };

  const submitReview = async (formData: {
    kind: ReviewKind;
    score: number;
    passed: boolean;
    notes: string;
  }): Promise<boolean> => {
    if (!data || !selectedCase || !isActive) return false;
    if (
      !Number.isInteger(formData.score) ||
      formData.score < 0 ||
      formData.score > 100 ||
      formData.notes.trim().length < 5
    ) {
      setActionError(
        "Enter an integer score from 0 to 100 and written notes of at least 5 characters."
      );
      return false;
    }
    const action = {
      action: "review",
      id: selectedCase.id,
      kind: formData.kind,
      score: formData.score,
      passed: formData.passed,
      notes: formData.notes.trim(),
    };
    const fresh = await runAndConfirm(
      `review:${selectedCase.id}`,
      action,
      `Review recorded.`,
      (records) =>
        records.reviews.some(
          (item) =>
            item.case_id === selectedCase.id &&
            item.kind === formData.kind &&
            item.reviewer_id === data.profile.id &&
            item.score === formData.score &&
            item.passed === formData.passed
        )
    );
    return Boolean(fresh);
  };

  const postNoteAction = async (
    action: "select" | "reject" | "activate",
    notes: string,
    label: string
  ): Promise<boolean> => {
    if (!selectedCase || notes.trim().length < 5) {
      setActionError("Add a reason of at least 5 characters.");
      return false;
    }
    const expectedStage =
      action === "select"
        ? "selected"
        : action === "reject"
        ? "rejected"
        : "activated";
    const fresh = await runAndConfirm(
      `${action}:${selectedCase.id}`,
      { action, id: selectedCase.id, notes: notes.trim() },
      label,
      (records) =>
        records.cases.some(
          (item) => item.id === selectedCase.id && item.stage === expectedStage
        )
    );
    return Boolean(fresh);
  };

  const runInvite = async (candidate: HiringCase, inviteTz: string) => {
    if (!data || !isOwner || !isActive) return;
    try {
      new Intl.DateTimeFormat("en", { timeZone: inviteTz }).format();
    } catch {
      setActionError("Choose a valid IANA timezone before inviting.");
      return;
    }
    await runAndConfirm(
      `invite:${candidate.id}`,
      { action: "invite", id: candidate.id, timezone: inviteTz.trim() },
      "Owner invitation and applicant binding are confirmed.",
      (records) =>
        records.cases.some(
          (item) => item.id === candidate.id && Boolean(item.staff_id)
        )
    );
  };

  const matchingApplicants = (candidate: HiringCase) =>
    (data?.directory ?? []).filter(
      (person) =>
        person.status === "applicant" &&
        roleKey(person.role) === roleKey(candidate.desired_role) &&
        Boolean(person.email) &&
        person.email?.trim().toLowerCase() ===
          candidate.email.trim().toLowerCase()
    );

  const resetFileInput = (slot: string) =>
    setFileInputRevision((previous) => ({
      ...previous,
      [slot]: (previous[slot] ?? 0) + 1,
    }));

  const runBind = async (
    candidate: HiringCase,
    bindStaffId: string,
    bindNotes: string
  ) => {
    if (!data || !isOwner || !isActive || bindNotes.trim().length < 5) {
      setActionError(
        "Select the existing matching applicant account and provide a note of at least 5 characters."
      );
      return;
    }
    const eligible = matchingApplicants(candidate).find(
      (person) => person.id === bindStaffId
    );
    if (!eligible) {
      setActionError(
        "The account must match this applicant’s email and requested role and remain in applicant status."
      );
      return;
    }
    await runAndConfirm(
      `bind:${candidate.id}`,
      {
        action: "bind",
        id: candidate.id,
        staffId: eligible.id,
        notes: bindNotes.trim(),
      },
      "Existing applicant identity linked.",
      (records) =>
        records.cases.some(
          (item) => item.id === candidate.id && item.staff_id === eligible.id
        )
    );
  };

  const uploadFile = async (
    candidate: HiringCase,
    category: "hiring_evidence" | "hiring_guidelines" | "hiring_agreement",
    file: File | null,
    note: string
  ) => {
    if (!data || !isActive) return;
    const kind =
      category === "hiring_guidelines"
        ? "guidelines"
        : category === "hiring_agreement"
        ? "agreement"
        : "evidence";
    const slot = `${candidate.id}:${kind}`;
    if (kind !== "evidence" && note.trim().length < 5) {
      setActionError(
        "Add document notes of at least 5 characters before uploading and attaching this PDF."
      );
      return;
    }
    const existingPending = pendingUploads[slot];
    setBusy(`upload:${slot}`);
    setActionError("");
    setNotice("");
    try {
      let fresh = data;
      let uploaded = existingPending?.fileId
        ? fresh.files.find((f) => f.id === existingPending.fileId)
        : undefined;
      if (!uploaded && existingPending) {
        fresh = (await load()) ?? fresh;
        const matches = fresh.files.filter(
          (f) =>
            f.target_id === candidate.id &&
            f.category === category &&
            f.complete &&
            f.original_name === existingPending.fileName &&
            !existingPending.beforeIds.includes(f.id)
        );
        if (matches.length !== 1)
          throw new Error(
            matches.length > 1
              ? "More than one matching upload is visible. Choose the exact file from the uploaded file list before attaching; no duplicate was created."
              : "The earlier upload may still be processing. Refresh this record before retrying; do not upload it again."
          );
        uploaded = matches[0];
      }
      if (!uploaded) {
        if (!file) throw new Error("Choose a file first.");
        if (file.size <= 0 || file.size > maxFileBytes)
          throw new Error("Choose a non-empty file no larger than 50 MiB.");
        if (kind !== "evidence" && file.type !== "application/pdf")
          throw new Error(
            "Guidelines and agreements must be actual PDF files."
          );
        const beforeIds = fresh.files
          .filter(
            (item) =>
              item.target_id === candidate.id && item.category === category
          )
          .map((item) => item.id);
        const form = new FormData();
        form.set("category", category);
        form.set("targetId", candidate.id);
        form.set("file", file);
        let response: Response;
        try {
          response = await fetch("/api/files", {
            method: "POST",
            credentials: "include",
            body: form,
          });
        } catch {
          setPendingUploads((previous) => ({
            ...previous,
            [slot]: { beforeIds, fileName: file.name },
          }));
          await load();
          throw new Error(
            "Upload response was interrupted. Refresh to check for the saved private file before retrying."
          );
        }
        const result = await readJson(response);
        if (response.status === 401) {
          window.location.assign("/login");
          throw new Error("Your session expired. Sign in again to continue.");
        }
        if (response.status === 403) setData(null);
        if (!response.ok || result.ok !== true)
          throw new Error(messageFrom(result, response.status));
        const pending: PendingUpload = { beforeIds, fileName: file.name };
        setPendingUploads((previous) => ({ ...previous, [slot]: pending }));
        fresh = (await load()) ?? fresh;
        const matches = fresh.files.filter(
          (item) =>
            item.target_id === candidate.id &&
            item.category === category &&
            item.complete &&
            item.original_name === file.name &&
            !beforeIds.includes(item.id)
        );
        if (matches.length !== 1)
          throw new Error(
            matches.length > 1
              ? "The uploaded file name is ambiguous. Refresh and choose a unique filename before attaching."
              : "The upload completed but its private file record is not visible yet. Refresh before retrying; the file was not re-uploaded."
          );
        uploaded = matches[0];
        setPendingUploads((previous) => ({
          ...previous,
          [slot]: { ...pending, fileId: uploaded?.id },
        }));
      }

      if (kind === "evidence") {
        const latest = await load();
        if (
          !latest?.files.some(
            (item) => item.id === uploaded?.id && item.complete
          )
        )
          throw new Error(
            "Evidence is not yet visible as a completed private upload."
          );
        setPendingUploads((previous) => {
          const next = { ...previous };
          delete next[slot];
          return next;
        });
        resetFileInput("evidence");
        setNotice(`Private evidence uploaded: ${uploaded?.original_name}.`);
        return;
      }
      if (!uploaded)
        throw new Error(
          "The private PDF is not visible in the current file record. Refresh before attaching."
        );
      const notes = note.trim();
      fresh = (await load()) ?? fresh;
      const current = fresh.cases.find((item) => item.id === candidate.id);
      const alreadyAttached =
        kind === "guidelines"
          ? current?.guidelines_file === uploaded.id
          : current?.agreement_file === uploaded.id;
      if (alreadyAttached) {
        setPendingUploads((previous) => {
          const next = { ...previous };
          delete next[slot];
          return next;
        });
        resetFileInput(slot);
        setNotice(
          `${titleCase(
            kind
          )} PDF is already attached to the current applicant record.`
        );
        return;
      }
      await actionRequest({
        action: "document",
        id: candidate.id,
        kind,
        fileId: uploaded.id,
        notes,
      });
      const latest = await load();
      const updated = latest?.cases.find((item) => item.id === candidate.id);
      const savedId =
        kind === "guidelines"
          ? updated?.guidelines_file
          : updated?.agreement_file;
      if (savedId !== uploaded.id)
        throw new Error(
          "The PDF was uploaded but is not attached to the case yet. Refresh before trying to attach it again."
        );
      setPendingUploads((previous) => {
        const next = { ...previous };
        delete next[slot];
        return next;
      });
      resetFileInput(slot);
      setNotice(
        `${titleCase(kind)} PDF attached to the current applicant record.`
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The private upload could not be completed."
      );
    } finally {
      setBusy("");
    }
  };

  const submitAccept = async (signedName: string, agreed: boolean) => {
    if (!data || !selectedCase || !isApplicant || !agreed) return;
    if (
      data.profile.name.trim().toLocaleLowerCase() !==
        selectedCase.name.trim().toLocaleLowerCase() ||
      signedName.trim().toLocaleLowerCase() !==
        data.profile.name.trim().toLocaleLowerCase()
    ) {
      setActionError(
        "The signature must match your full name on the signed-in applicant account and application. Contact the Owner if either name is wrong."
      );
      return;
    }
    await runAndConfirm(
      `accept:${selectedCase.id}`,
      {
        action: "accept",
        id: selectedCase.id,
        signedName: signedName.trim(),
        agreed: true,
      },
      "Your acceptance of the current PDFs is recorded.",
      (records) =>
        records.cases.some(
          (item) => item.id === selectedCase.id && Boolean(item.accepted_at)
        )
    );
  };

  const submitHandoff = async (startDate: string, notes: string) => {
    if (!selectedCase || !data || !isActive) return;
    if (!startDate || notes.trim().length < 5) {
      setActionError(
        "Choose the actual start date and add handoff notes of at least 5 characters."
      );
      return;
    }
    await runAndConfirm(
      `handoff:${selectedCase.id}`,
      {
        action: "handoff",
        id: selectedCase.id,
        startDate,
        notes: notes.trim(),
      },
      "Handoff finalized; the service has moved the applicant to ready.",
      (records) =>
        records.cases.some(
          (item) =>
            item.id === selectedCase.id &&
            item.stage === "ready" &&
            item.start_date === startDate
        )
    );
  };

  const submitActivation = async (notes: string) => {
    if (!selectedCase) return;
    await runAndConfirm(
      `activate:${selectedCase.id}`,
      { action: "activate", id: selectedCase.id, notes: notes.trim() },
      "Owner activation is confirmed in the staff profile and hiring record.",
      (records) => {
        const current = records.cases.find(
          (item) => item.id === selectedCase.id
        );
        return Boolean(
          current?.stage === "activated" &&
            current.staff_id &&
            records.directory.some(
              (person) =>
                person.id === current.staff_id && person.status === "active"
            )
        );
      }
    );
  };

  const submitReturn = async (notes: string) => {
    if (!selectedCase || notes.trim().length < 5) {
      setActionError("Add a correction reason of at least 5 characters.");
      return;
    }
    await runAndConfirm(
      `return:${selectedCase.id}`,
      { action: "return", id: selectedCase.id, notes: notes.trim() },
      "Case returned to selected for correction. The current agreement and applicant acceptance have been cleared.",
      (records) =>
        records.cases.some(
          (item) =>
            item.id === selectedCase.id &&
            item.stage === "selected" &&
            !item.agreement_file &&
            !item.accepted_at
        )
    );
  };

  const currentCaseReviews = selectedCase ? reviewsForCase : [];
  const reviewOf = (kind: ReviewKind) =>
    currentCaseReviews.find((review) => review.kind === kind) ?? null;
  const reviewWhen = selectedCase?.interview_at
    ? new Date(selectedCase.interview_at).getTime() <= serverNow.getTime()
    : false;
  const hrReview = reviewOf("hr_interview");
  const departmentReview = reviewOf("department_interview");
  const auditionReview = reviewOf("audition");
  const trainingReview = reviewOf("training");
  const hrReviewerRole = hrReview
    ? roleKey(directoryById.get(hrReview.reviewer_id)?.role ?? "")
    : "";
  const independentInterviews = Boolean(
    hrReview &&
      departmentReview &&
      hrReviewerRole === "hr" &&
      departmentReview.reviewer_id === selectedCase?.reviewer_id &&
      hrReview.reviewer_id !== departmentReview.reviewer_id
  );
  const interviewGate = Boolean(
    hrReview?.passed &&
      departmentReview?.passed &&
      independentInterviews &&
      (selectedCase?.desired_role !== "teacher" ||
        Boolean(
          auditionReview?.passed &&
            auditionReview.reviewer_id === selectedCase?.reviewer_id
        ))
  );
  const reviewerIsCurrent = Boolean(
    selectedCase && selectedCase.reviewer_id === profileId
  );
  const canSchedule = Boolean(
    isActive &&
      (isHR || isOwner) &&
      selectedCase &&
      ["applied", "interview"].includes(selectedCase.stage) &&
      reviewsForCase.length === 0
  );
  const canRecordHrInterview = Boolean(
    isActive &&
      isHR &&
      selectedCase?.stage === "interview" &&
      reviewWhen &&
      !hrReview
  );
  const canRecordDepartment = Boolean(
    isActive &&
      reviewerIsCurrent &&
      selectedCase?.stage === "interview" &&
      reviewWhen &&
      !departmentReview
  );
  const canRecordAudition = Boolean(
    isActive &&
      reviewerIsCurrent &&
      selectedCase?.desired_role === "teacher" &&
      selectedCase.stage === "interview" &&
      reviewWhen &&
      !auditionReview
  );
  const canRecordTraining = Boolean(
    isActive &&
      reviewerIsCurrent &&
      selectedCase?.stage === "selected" &&
      !trainingReview
  );
  const reviewOptions: ReviewKind[] = [];
  if (canRecordHrInterview) reviewOptions.push("hr_interview");
  if (canRecordDepartment) reviewOptions.push("department_interview");
  if (canRecordAudition) reviewOptions.push("audition");
  if (canRecordTraining) reviewOptions.push("training");
  const allowedReviewKinds = new Set(reviewOptions);
  const maySelect = Boolean(
    isActive &&
      (isHR || isOwner) &&
      selectedCase?.stage === "interview" &&
      reviewWhen &&
      interviewGate
  );
  const canReject = Boolean(
    isActive &&
      (isHR || isOwner) &&
      selectedCase &&
      !["ready", "activated", "rejected"].includes(selectedCase.stage)
  );
  const canGuidelines = Boolean(
    isActive &&
      selectedCase &&
      selectedCase.stage === "selected" &&
      (isManager || reviewerIsCurrent)
  );
  const canAgreement = Boolean(
    isActive &&
      isOwner &&
      selectedCase?.stage === "selected" &&
      selectedCase.staff_id
  );
  const canUploadEvidence = Boolean(
    isActive &&
      selectedCase &&
      (isManager || reviewerIsCurrent) &&
      !["ready", "activated", "rejected"].includes(selectedCase.stage)
  );
  const applicantNameMatches = Boolean(
    data &&
      selectedCase &&
      data.profile.name.trim().toLocaleLowerCase() ===
        selectedCase.name.trim().toLocaleLowerCase()
  );
  const canAccept = Boolean(
    isApplicant &&
      selectedCase &&
      selectedCase.stage === "selected" &&
      selectedCase.guidelines_file &&
      selectedCase.agreement_file &&
      applicantNameMatches &&
      !selectedCase.accepted_at
  );
  const trainingVerified = Boolean(
    trainingReview?.passed &&
      selectedCase &&
      trainingReview.reviewer_id === selectedCase.reviewer_id
  );
  const canHandoff = Boolean(
    isActive &&
      selectedCase?.stage === "selected" &&
      selectedCase.staff_id &&
      selectedCase.accepted_at &&
      trainingVerified &&
      (selectedCase.desired_role === "teacher"
        ? isQC && reviewerIsCurrent
        : isHR)
  );
  const canActivate = Boolean(
    isActive && isOwner && selectedCase?.stage === "ready"
  );
  const canReturn = Boolean(
    isActive && (isOwner || isHR) && selectedCase?.stage === "ready"
  );
  const showHandoffs = Boolean(isOwner || isFinance || isAdmin || isHead);
  const pendingHandoffs = data?.handoffs ?? [];

  return (
    <main className="pw-family pw-hiring">
      <section className="hire-content">
        {error && (
          <div className="hire-alert" role="alert">
            <AlertCircle size={15} />
            <p>{error}</p>
            <button
              type="button"
              className="hire-button tertiary"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}
        {actionError && (
          <div className="hire-alert" role="alert">
            <AlertCircle size={15} />
            <p>{actionError}</p>
          </div>
        )}
        {notice && (
          <div className="hire-alert success" role="status">
            <CheckCircle2 size={15} />
            <p>{notice}</p>
          </div>
        )}
        {loading && !data ? (
          <div className="hire-layout">
            <section className="hire-card hire-card-body">
              <div className="hire-skeleton" />
              <div className="hire-skeleton" />
            </section>
            <section className="hire-card hire-card-body">
              <div className="hire-skeleton" />
              <div className="hire-skeleton" />
            </section>
          </div>
        ) : (
          data && (
            <>
              <div className="hire-heading">
                <h1>{isApplicant ? "Applicant case" : "Hiring"}</h1>
                <div className="hire-heading-actions">
                  {(isOwner || isFinance) && (
                    <Link href="/payroll" className="hire-button">
                      Payroll · private pay &amp; bank setup
                    </Link>
                  )}
                  <button
                    type="button"
                    className="hire-button tertiary"
                    onClick={() => void load()}
                    disabled={refreshing}
                  >
                    <RefreshCw size={13} />{" "}
                    {refreshing ? "Refreshing…" : "Refresh records"}
                  </button>
                </div>
              </div>
              {!isActive && !isApplicant && (
                <div className="hire-alert info" role="status">
                  <ShieldCheck size={15} />
                  <p>
                    This profile is {titleCase(data.profile.status)}. Hiring
                    records are readable, but creation, reviews, uploads,
                    approvals, and handoffs are disabled.
                  </p>
                </div>
              )}
              {isApplicant && (
                <div className="hire-alert info" role="status">
                  <ShieldCheck size={15} />
                  <p>
                    Applicant-only view: only your linked case and its current
                    guidelines/agreement are shown. Interview notes, other
                    applicants, staff lists, and internal events are not
                    displayed. If you arrived through an academy invitation,{" "}
                    <Link href="/reset-password">set your own password</Link>;
                    never share it with staff.
                  </p>
                </div>
              )}
              <div
                className="hire-layout"
                data-portal-layout="hiring-workspace"
                data-has-cases={
                  selectedCase || visibleCases.length ? "true" : "false"
                }
              >
                <div className="hire-column">
                  {!isApplicant && (
                    <section
                      className="hire-case-index"
                      aria-labelledby="cases-heading"
                    >
                      <div className="hire-card-head">
                        <div>
                          <h2 id="cases-heading">
                            {isOwner || isHR
                              ? "Applicant cases"
                              : "Assigned cases"}
                          </h2>
                          <p>
                            {visibleCases.length} actual{" "}
                            {visibleCases.length === 1 ? "record" : "records"}{" "}
                            in your native scope.
                          </p>
                        </div>
                        <BriefcaseBusiness
                          size={16}
                          color="#6a9d7b"
                          aria-hidden="true"
                        />
                      </div>
                      {visibleCases.length ? (
                        <div className="hire-list">
                          {visibleCases.map((candidate) => (
                            <button
                              type="button"
                              key={candidate.id}
                              className={`hire-case-pick ${
                                selectedCase?.id === candidate.id
                                  ? "selected"
                                  : ""
                              }`}
                              onClick={() => {
                                setSelectedCaseId(candidate.id);
                                resetFileInput("evidence");
                              }}
                            >
                              <span className="pw-person-inline">
                                <ProfileAvatar
                                  profileId={candidate.staff_id}
                                  name={candidate.name}
                                  size={32}
                                />
                                <span>
                                  <strong>{candidate.name}</strong>
                                  <small>
                                    {roleLabel(candidate.desired_role)} · opened{" "}
                                    {formatDate(
                                      candidate.created_at,
                                      data.profile.timezone
                                    )}
                                  </small>
                                </span>
                              </span>
                              <span className={`hire-pill ${candidate.stage}`}>
                                {titleCase(candidate.stage)}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="hire-card-body">
                          <div className="hire-empty">
                            <strong>No cases in this scope</strong>Cases appear
                            here only when the service assigns you as HR, Owner,
                            or departmental reviewer.
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {!isApplicant && (isOwner || isHR) && (
                    <HiringCandidateForm
                      data={data}
                      isActive={isActive}
                      busy={busy}
                      onSubmitCreate={submitCreate}
                    />
                  )}

                  {showHandoffs &&
                    !isApplicant &&
                    pendingHandoffs.length > 0 && (
                      <section
                        className="hire-flat-section"
                        aria-labelledby="handoffs-heading"
                      >
                        <div className="hire-card-head">
                          <div>
                            <h2 id="handoffs-heading">
                              Sanitized handoff summaries
                            </h2>
                            <p>
                              Role, date, timezone, and workflow stage only. No
                              salary amounts, bank instructions, or raw
                              interview reviews.
                            </p>
                          </div>
                          <ShieldCheck
                            size={16}
                            color="#6a9d7b"
                            aria-hidden="true"
                          />
                        </div>
                        {pendingHandoffs.length ? (
                          <div className="hire-card-body">
                            {pendingHandoffs.map((item) => (
                              <article className="hire-handoff" key={item.id}>
                                <div className="pw-person-inline">
                                  <ProfileAvatar
                                    profileId={item.staff_id}
                                    name={item.name}
                                    size={32}
                                  />
                                  <span>
                                    <strong>
                                      {item.name} · {roleLabel(item.role)}
                                    </strong>
                                    <small>
                                      {titleCase(item.stage)} · start{" "}
                                      {item.start_date ?? "not recorded"} ·{" "}
                                      {item.timezone} · finalized{" "}
                                      {formatDate(
                                        item.finalized_at,
                                        item.timezone
                                      )}
                                    </small>
                                  </span>
                                </div>
                                <span className={`hire-pill ${item.stage}`}>
                                  {titleCase(item.stage)}
                                </span>
                              </article>
                            ))}
                            {(isOwner || isFinance) && (
                              <div
                                className="hire-callout"
                                style={{ marginTop: 10 }}
                              >
                                <FileCheck2 size={14} />
                                <p>
                                  Initial pay and matching bank instructions
                                  stay in the private{" "}
                                  <Link href="/payroll">Payroll workspace</Link>
                                  . They are never read or rendered here.
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="hire-empty">
                            <strong>No handoffs returned</strong>Only
                            service-provided ready or activated summaries appear
                            here.
                          </div>
                        )}
                      </section>
                    )}
                </div>

                <div
                  className="hire-column"
                  hidden={!selectedCase && !isApplicant}
                >
                  {!selectedCase ? (
                    <section className="hire-card">
                      <div className="hire-card-body">
                        <div className="hire-empty">
                          <strong>
                            {isApplicant
                              ? "No linked application yet"
                              : "Choose a case to begin"}
                          </strong>
                          {isApplicant
                            ? "This account does not have an application linked yet. Contact the academy Owner; no staff workspace is available from an applicant account."
                            : "The service has not returned an applicant case in your scope."}
                        </div>
                      </div>
                    </section>
                  ) : (
                    <section
                      className="hire-card"
                      aria-labelledby="candidate-detail-heading"
                    >
                      <div className="hire-card-head">
                        <div
                          className="hire-detail-title"
                          style={{ width: "100%" }}
                        >
                          <div className="pw-person-inline">
                            <ProfileAvatar
                              profileId={selectedCase.staff_id}
                              name={selectedCase.name}
                              size={34}
                            />
                            <span>
                              <h2 id="candidate-detail-heading">
                                {selectedCase.name}
                              </h2>
                              <div className="hire-detail-meta">
                                {roleLabel(selectedCase.desired_role)} ·{" "}
                                {selectedCase.email}
                                <br />
                                Created{" "}
                                {formatDate(
                                  selectedCase.created_at,
                                  data.profile.timezone
                                )}{" "}
                                ·{" "}
                                {selectedCase.staff_id
                                  ? `linked account ${staffName(
                                      selectedCase.staff_id
                                    )}`
                                  : "not yet linked to an applicant account"}
                              </div>
                            </span>
                          </div>
                          <span className={`hire-pill ${selectedCase.stage}`}>
                            {titleCase(selectedCase.stage)}
                          </span>
                        </div>
                      </div>
                      <div className="hire-card-body">
                        {!isApplicant && maySeeReviewDetails && (
                          <HiringReviewForm
                            selectedCase={selectedCase}
                            reviewsForCase={reviewsForCase}
                            reviewWhen={reviewWhen}
                            hrReview={hrReview}
                            hrReviewerRole={hrReviewerRole}
                            reviewOptions={reviewOptions}
                            allowedReviewKinds={allowedReviewKinds}
                            maySelect={maySelect}
                            isActive={isActive}
                            busy={busy}
                            staffName={staffName}
                            onSubmitReview={submitReview}
                            onSelectApplicant={(notes) =>
                              postNoteAction(
                                "select",
                                notes,
                                "Applicant selected after verified passing interviews."
                              )
                            }
                          />
                        )}

                        <HiringCaseDetail
                          selectedCase={selectedCase}
                          data={data}
                          isApplicant={isApplicant}
                          isOwner={isOwner}
                          isHR={isHR}
                          isQC={isQC}
                          isActive={isActive}
                          busy={busy}
                          deviceTimezone={deviceTimezone}
                          staffName={staffName}
                          currentFiles={currentFiles}
                          eventsForCase={eventsForCase}
                          canSchedule={canSchedule}
                          canGuidelines={canGuidelines}
                          canAgreement={canAgreement}
                          canUploadEvidence={canUploadEvidence}
                          canAccept={canAccept}
                          canHandoff={canHandoff}
                          canReturn={canReturn}
                          canActivate={canActivate}
                          canReject={canReject}
                          applicantNameMatches={applicantNameMatches}
                          matchingApplicants={matchingApplicants}
                          pendingUploads={pendingUploads}
                          fileInputRevision={fileInputRevision}
                          onSubmitSchedule={submitSchedule}
                          onBindApplicant={runBind}
                          onInviteApplicant={runInvite}
                          onUploadFile={uploadFile}
                          onSubmitAccept={submitAccept}
                          onSubmitHandoff={submitHandoff}
                          onSubmitReturn={submitReturn}
                          onSubmitActivation={submitActivation}
                          onRejectCase={async (notes) => {
                            await postNoteAction(
                              "reject",
                              notes,
                              "The hiring case is marked rejected."
                            );
                          }}
                        />
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </>
          )
        )}
      </section>
    </main>
  );
}
