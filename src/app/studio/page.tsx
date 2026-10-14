"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  AlertCircle,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  FileText,
  Headphones,
  LoaderCircle,
  Mic,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Timer,
  Trophy,
  Upload,
} from "lucide-react";

import { useConfirmModal } from "@/app/_components/ConfirmModal";
import { readJson } from "@/lib/academy/web-client";
import {
  type Payload,
  type StudentRow,
  type PracticeRow,
  type RequestKind,
  type RequestStatus,
  type RequestRow,
  type ReplyRow,
  type EvaluationRow,
  type RepertoireEvent,
  type LessonRow,
  type FileRow,
  type StudioData,
  type JsonResult,
  quizPrompts,
  rubric,
  mimeChoices,
  roleKey,
  textValue,
  numberValue,
  studentName,
  dateOfBirth,
  studentTimezone,
  avatarId,
  initials,
  validDate,
  localParts,
  ageOn,
  dayKey,
  completedPracticeStreak,
  birthdayDaysAway,
  formatDate,
  formatDuration,
  songsSummary,
  songIsListed,
  dueLessons,
  errorMessage,
  titleCase,
} from "./studio-types";
import StudioBirthdaySection from "./components/StudioBirthdaySection";
import {
  StudioAskSection,
  StudioThreadsSection,
} from "./components/StudioRequestsSection";
import StudioStudentDossier from "./components/StudioStudentDossier";
import StudioPracticeHistorySection from "./components/StudioPracticeHistorySection";
import StudioEvaluationsSection from "./components/StudioEvaluationsSection";
import StudioPracticeControlsSection from "./components/StudioPracticeControlsSection";

/**
 * ============================================================================
 * PROSPERWORK MUSIC ACADEMY - STUDIO WORKSPACE CONTROLLER
 * ============================================================================
 * Coordinates the music student practice studio, audio recording clips,
 * teacher pedagogical evaluations, repertoire milestone tracking,
 * birthday tribute generators, and asynchronous studio requests.
 *
 * Modularized Components:
 * - StudioBirthdaySection: AI-powered personalized birthday cards & tributes.
 * - StudioAskSection: Family / student request submission form.
 * - StudioThreadsSection: Saved request queue with staff decisions & replies.
 * - ConfirmModal: Centralized confirmation dialogs (e.g. rejecting requests).
 * - studio-types: Strongly typed contracts and pure domain helpers.
 */
export default function StudioPage() {
  // --------------------------------------------------------------------------
  // Core Server Data & Clock Sync State
  // --------------------------------------------------------------------------
  const [data, setData] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [serverClockAnchor, setServerClockAnchor] = useState<{
    serverMs: number;
    clientMs: number;
  } | null>(null);
  const [tick, setTick] = useState(0);

  // --------------------------------------------------------------------------
  // Request & Conversation State
  // --------------------------------------------------------------------------
  const [requestKind, setRequestKind] = useState<RequestKind>("song");
  const [requestBody, setRequestBody] = useState("");
  const [requestLessonId, setRequestLessonId] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [decisionStatuses, setDecisionStatuses] = useState<
    Record<string, Exclude<RequestStatus, "open">>
  >({});

  // --------------------------------------------------------------------------
  // Curriculum, Repertoire & Evaluation Draft State
  // --------------------------------------------------------------------------
  const [repertoireDrafts, setRepertoireDrafts] = useState<
    Record<string, string>
  >({});
  const [quizAnswers, setQuizAnswers] = useState<string[]>(Array(6).fill(""));
  const [reportMonths, setReportMonths] = useState<Record<string, string>>({});

  // --------------------------------------------------------------------------
  // Media Recorder & Audio Synthesis State
  // --------------------------------------------------------------------------
  const [recording, setRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<"audio" | "video" | null>(
    null
  );
  const [captureError, setCaptureError] = useState("");
  const [clipError, setClipError] = useState("");
  const [clipBlob, setClipBlob] = useState<Blob | null>(null);
  const [clipPreviewUrl, setClipPreviewUrl] = useState("");
  const [clipPracticeId, setClipPracticeId] = useState<string | null>(null);
  const [clipUploading, setClipUploading] = useState(false);
  const [keyboardNote, setKeyboardNote] = useState("");

  // --------------------------------------------------------------------------
  // Modal Confirmations & Hardware Refs
  // --------------------------------------------------------------------------
  const { confirm, ConfirmDialog } = useConfirmModal();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const load = useCallback(async (): Promise<StudioData | null> => {
    setError("");
    setRefreshing(true);
    try {
      const response = await fetch("/api/studio", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await readJson(response);
      if (response.status === 401) {
        window.location.assign("/login");
        return null;
      }
      if (!response.ok) throw new Error(errorMessage(result, response.status));
      const payload = result as unknown as StudioData;
      if (
        !payload.profile ||
        !Array.isArray(payload.students) ||
        !Array.isArray(payload.practice) ||
        !Array.isArray(payload.requests) ||
        !Array.isArray(payload.replies) ||
        !Array.isArray(payload.evaluations) ||
        !Array.isArray(payload.lessons) ||
        !Array.isArray(payload.files) ||
        !Array.isArray(payload.repertoire) ||
        typeof payload.serverNow !== "string"
      ) {
        throw new Error("The studio response was incomplete.");
      }
      const serverMs = Date.parse(payload.serverNow);
      setServerClockAnchor({
        serverMs: Number.isFinite(serverMs) ? serverMs : Date.now(),
        clientMs: Date.now(),
      });
      setData(payload);
      return payload;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The studio could not be loaded."
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
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!clipBlob) {
      setClipPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(clipBlob);
    setClipPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clipBlob]);
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const role = roleKey(data?.profile.role ?? "");
  const isActive = data?.profile.status.trim().toLowerCase() === "active";
  const isOwner = role === "owner" || role === "super_admin";
  const isQualityControl =
    role === "qc" || role === "quality_control" || role === "quality_assurance";
  const isTeacher = role === "teacher";
  const isHeadAdmin = role === "head_admin" || role === "headadmin";
  const isAdmin =
    role === "admin" || role === "administrator" || isHeadAdmin || isOwner;
  const isStaff = isAdmin || isTeacher || isQualityControl;
  const isFamily = [
    "parent",
    "guardian",
    "student",
    "family",
    "family_parent",
    "parent_student",
  ].includes(role);
  const selectedChild =
    data?.students.find((student) => student.id === selectedChildId) ??
    data?.students[0] ??
    null;
  const canPractice = Boolean(isActive && isFamily && selectedChild);
  const canCreateRequest = Boolean(isActive && isFamily && selectedChild);
  const canEvaluate = Boolean(
    isActive && selectedChild && (isTeacher || isQualityControl || isOwner)
  );
  const canEditRepertoire = Boolean(
    isActive && (isTeacher || isQualityControl || isOwner)
  );
  const canReply = Boolean(isActive && (isFamily || isStaff));
  const canManageSong = Boolean(
    isActive && (isTeacher || isQualityControl || isOwner)
  );
  const clientNowMs = tick || Date.now();
  const clockNowMs = serverClockAnchor
    ? serverClockAnchor.serverMs + (clientNowMs - serverClockAnchor.clientMs)
    : clientNowMs;
  const serverNowDate = useMemo(
    () =>
      data
        ? validDate(data.serverNow) ?? new Date(clockNowMs)
        : new Date(clockNowMs),
    [data?.serverNow, clockNowMs]
  );
  const selectedPractice =
    data?.practice
      .filter((row) => row.student_id === selectedChild?.id)
      .slice()
      .sort((a, b) => b.started_at.localeCompare(a.started_at)) ?? [];
  const activeRun =
    selectedPractice.find(
      (row) => row.status === "running" || row.status === "paused"
    ) ?? null;
  const runningElapsed = activeRun
    ? activeRun.seconds +
      (activeRun.status === "running" &&
      activeRun.resumed_at &&
      validDate(activeRun.resumed_at)
        ? Math.max(0, (clockNowMs - Date.parse(activeRun.resumed_at)) / 1000)
        : 0)
    : 0;
  const selectedStudentTimezone = selectedChild
    ? studentTimezone(selectedChild, data?.profile.timezone ?? "UTC")
    : "UTC";
  const selectedDueLessons = useMemo(
    () =>
      selectedChild && data
        ? dueLessons(data.lessons, selectedChild.id, clockNowMs)
        : [],
    [data?.lessons, selectedChild?.id, clockNowMs]
  );
  const allDueBirthdays = useMemo(
    () =>
      data
        ? data.students
            .map((student) => {
              const timezone = studentTimezone(
                student,
                data.profile.timezone ?? "UTC"
              );
              return {
                student,
                days: birthdayDaysAway(
                  dateOfBirth(student),
                  serverNowDate,
                  timezone
                ),
                timezone,
              };
            })
            .filter(
              (
                item
              ): item is {
                student: StudentRow;
                days: number;
                timezone: string;
              } => item.days !== null
            )
            .sort((a, b) => a.days - b.days)
        : [],
    [data?.students, data?.profile.timezone, serverNowDate]
  );
  const escalations = useMemo(
    () =>
      data && isHeadAdmin
        ? data.requests
            .filter(
              (row) =>
                row.kind === "class_not_started" &&
                (row.status === "open" || row.status === "in_progress") &&
                clockNowMs - Date.parse(row.created_at) >= 15 * 60000
            )
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
        : [],
    [data?.requests, isHeadAdmin, clockNowMs]
  );
  const activeStudentIds = new Set(
    data?.practice
      .filter((row) => row.status === "running" || row.status === "paused")
      .map((row) => row.student_id) ?? []
  );
  const profileActive = Boolean(isActive);

  const currentPracticeForStudent = (studentId: string) =>
    data?.practice
      .filter(
        (row) =>
          row.student_id === studentId &&
          (row.status === "running" || row.status === "paused")
      )
      .slice()
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;

  const apiPost = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/studio", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await readJson(response);
    if (!response.ok || result.ok === false)
      throw new Error(errorMessage(result, response.status));
    return result;
  };

  const practiceOperation = async (
    operation: "create" | "pause" | "resume" | "complete" | "quiz",
    answers?: number[]
  ) => {
    if (!canPractice || !selectedChild) return;
    if (operation === "create" && activeRun) return;
    if (operation !== "create" && !activeRun) return;
    if (operation === "quiz" && (!activeRun || activeRun.status !== "running"))
      return;
    setBusy(`practice:${operation}`);
    setActionError("");
    setNotice("");
    const beforeIds = new Set(data?.practice.map((row) => row.id) ?? []);
    try {
      const body: Record<string, unknown> = { action: "practice", operation };
      if (operation === "create") body.childId = selectedChild.id;
      else if (activeRun) body.id = activeRun.id;
      if (operation === "quiz" && answers) body.answers = answers;
      const result = await apiPost(body);
      const fresh = await load();
      const responseId = typeof result.id === "string" ? result.id : null;
      const row = fresh?.practice.find((item) =>
        responseId
          ? item.id === responseId
          : operation === "create"
          ? !beforeIds.has(item.id) && item.student_id === selectedChild.id
          : item.id === activeRun?.id
      );
      if (!row)
        throw new Error(
          "The operation was accepted, but no matching saved practice record was returned. Refresh before relying on its state."
        );
      const valid =
        operation === "create" || operation === "resume"
          ? row.status === "running"
          : operation === "pause"
          ? row.status === "paused"
          : operation === "complete"
          ? row.status === "complete" && Boolean(row.ended_at)
          : row.game_score !== null &&
            row.game_score !== undefined &&
            row.game_total !== null &&
            row.game_total !== undefined;
      if (!valid)
        throw new Error(
          "The studio has not returned the requested saved practice state yet."
        );
      setNotice(
        operation === "quiz"
          ? `Saved score: ${row.game_score} / ${row.game_total}.`
          : operation === "complete"
          ? `Practice finished at ${formatDate(
              row.ended_at,
              selectedStudentTimezone
            )}.`
          : `Practice ${
              operation === "create"
                ? "started"
                : operation === "pause"
                ? "paused"
                : "resumed"
            } and saved.`
      );
      if (operation === "quiz") setQuizAnswers(Array(6).fill(""));
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The practice action could not be saved."
      );
    } finally {
      setBusy("");
    }
  };

  const createRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateRequest || !selectedChild) return;
    const bodyText = requestBody.trim();
    if (!bodyText) {
      setActionError("Add a message before sending the request.");
      return;
    }
    let lessonId: string | undefined;
    if (requestKind === "class_not_started") {
      if (!selectedDueLessons.some((lesson) => lesson.id === requestLessonId)) {
        setActionError(
          "Choose a currently due lesson from the selected student."
        );
        return;
      }
      lessonId = requestLessonId;
    }
    setBusy("request:create");
    setActionError("");
    setNotice("");
    try {
      const before = new Set(data?.requests.map((row) => row.id) ?? []);
      const result = await apiPost({
        action: "request",
        childId: selectedChild.id,
        kind: requestKind,
        body: bodyText,
        ...(lessonId ? { lessonId } : {}),
      });
      const fresh = await load();
      const saved =
        typeof result.id === "string"
          ? fresh?.requests.some((row) => row.id === result.id)
          : fresh?.requests.some(
              (row) =>
                !before.has(row.id) &&
                row.student_id === selectedChild.id &&
                row.kind === requestKind &&
                row.body === bodyText
            );
      if (!saved)
        throw new Error(
          "The request endpoint responded, but the saved request is not visible yet. Refresh to check its status."
        );
      setRequestBody("");
      setRequestLessonId("");
      setNotice(
        "Request recorded in the studio queue. Email delivery is not part of this queue."
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The request could not be recorded."
      );
    } finally {
      setBusy("");
    }
  };

  const sendReply = async (request: RequestRow) => {
    if (!canReply) return;
    const body = (replyBodies[request.id] ?? "").trim();
    if (!body) {
      setActionError("Write a reply before sending it.");
      return;
    }
    setBusy(`reply:${request.id}`);
    setActionError("");
    setNotice("");
    try {
      const before = new Set(data?.replies.map((reply) => reply.id) ?? []);
      const result = await apiPost({ action: "reply", id: request.id, body });
      const fresh = await load();
      const saved =
        typeof result.id === "string"
          ? fresh?.replies.some(
              (reply) =>
                reply.id === result.id && reply.request_id === request.id
            )
          : fresh?.replies.some(
              (reply) =>
                !before.has(reply.id) &&
                reply.request_id === request.id &&
                reply.body === body
            );
      if (!saved)
        throw new Error(
          "The reply endpoint responded, but the saved reply is not visible yet. Refresh to check the thread."
        );
      setReplyBodies((previous) => ({ ...previous, [request.id]: "" }));
      setNotice("Reply saved to the request thread.");
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The reply could not be saved."
      );
    } finally {
      setBusy("");
    }
  };

  const canDecideRequest = (request: RequestRow) => {
    if (!isActive) return false;
    if (!isOwner && request.handled_by !== data?.profile.id) return false;
    if (request.kind === "song") return canManageSong;
    return isAdmin;
  };
  const decideRequest = async (
    event: FormEvent<HTMLFormElement>,
    request: RequestRow
  ) => {
    event.preventDefault();
    if (!canDecideRequest(request)) return;
    const form = new FormData(event.currentTarget);
    const body = String(form.get("decisionBody") ?? "").trim();
    const status = decisionStatuses[request.id] ?? "in_progress";
    if (!body) {
      setActionError("A decision note is required.");
      return;
    }
    setBusy(`decide:${request.id}`);
    setActionError("");
    setNotice("");
    try {
      const priorReplyIds = new Set(
        data?.replies.map((reply) => reply.id) ?? []
      );
      const result = await apiPost({
        action: "decide",
        id: request.id,
        status,
        body,
      });
      const fresh = await load();
      const saved = fresh?.requests.find((row) => row.id === request.id);
      const replySaved = fresh?.replies.some(
        (reply) =>
          !priorReplyIds.has(reply.id) &&
          reply.request_id === request.id &&
          reply.body === body
      );
      if (!saved || saved.status !== status || !replySaved)
        throw new Error(
          "The request status and decision note are not both visible in the saved thread yet. Refresh before treating this decision as complete."
        );
      if (typeof result.ok === "boolean" && result.ok === false)
        throw new Error("The request decision was not accepted.");
      setNotice(
        `Request marked ${titleCase(
          status
        )}. The note is recorded in the thread.`
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The request decision could not be saved."
      );
    } finally {
      setBusy("");
    }
  };

  const submitEvaluation = async (evaluation: {
    title: string;
    scores: Record<string, string>;
    notes: string;
  }): Promise<boolean> => {
    if (!canEvaluate || !selectedChild) return false;
    const title = evaluation.title.trim();
    if (!title) {
      setActionError("Add an evaluation title.");
      return false;
    }
    const scores: Record<string, number> = {};
    for (const [key] of rubric) {
      const value = evaluation.scores[key];
      if (
        value === undefined ||
        value === "" ||
        !Number.isInteger(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 100
      ) {
        setActionError(
          "Enter a whole-number score from 0 to 100 in every rubric field."
        );
        return false;
      }
      scores[key] = Number(value);
    }
    setBusy("evaluation");
    setActionError("");
    setNotice("");
    try {
      const before = new Set(data?.evaluations.map((row) => row.id) ?? []);
      const result = await apiPost({
        action: "evaluate",
        childId: selectedChild.id,
        title,
        scores,
        notes: evaluation.notes.trim(),
      });
      const fresh = await load();
      const saved =
        typeof result.id === "string"
          ? fresh?.evaluations.some((row) => row.id === result.id)
          : fresh?.evaluations.some(
              (row) =>
                !before.has(row.id) &&
                row.student_id === selectedChild.id &&
                row.title === title
            );
      if (!saved)
        throw new Error(
          "The evaluation endpoint responded, but no matching saved evaluation is visible yet. Refresh to verify it."
        );
      setNotice("Evaluation saved and visible in the student record.");
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The evaluation could not be saved."
      );
      return false;
    } finally {
      setBusy("");
    }
  };

  const updateRepertoire = async (
    student: StudentRow,
    operation: "plan" | "complete"
  ) => {
    if (!canEditRepertoire) return;
    const song = (repertoireDrafts[student.id] ?? "").trim();
    if (song.length < 2 || song.length > 150) {
      setActionError("Enter a song title between 2 and 150 characters.");
      return;
    }
    setBusy(`repertoire:${student.id}`);
    setActionError("");
    setNotice("");
    try {
      const priorCount = (data?.repertoire ?? []).filter(
        (event) =>
          event.student_id === student.id &&
          event.song.trim().toLowerCase() === song.toLowerCase() &&
          event.operation === operation
      ).length;
      await apiPost({
        action: "repertoire",
        childId: student.id,
        song,
        operation,
      });
      const fresh = await load();
      const savedEvents =
        fresh?.repertoire.filter(
          (event) =>
            event.student_id === student.id &&
            event.song.trim().toLowerCase() === song.toLowerCase() &&
            event.operation === operation
        ).length ?? 0;
      const canonicalUpdated =
        operation === "plan"
          ? songIsListed(
              fresh?.students.find((row) => row.id === student.id)?.payload ??
                {},
              ["songsToDo", "songs_to_do"],
              song
            )
          : songIsListed(
              fresh?.students.find((row) => row.id === student.id)?.payload ??
                {},
              ["songsDone", "songs_done"],
              song
            ) &&
            !songIsListed(
              fresh?.students.find((row) => row.id === student.id)?.payload ??
                {},
              ["songsToDo", "songs_to_do"],
              song
            );
      if (!fresh || savedEvents <= priorCount || !canonicalUpdated) {
        throw new Error(
          "The repertoire action was accepted, but its updated student song list and audit record are not both visible yet. Refresh before retrying."
        );
      }
      setRepertoireDrafts((previous) => ({ ...previous, [student.id]: "" }));
      setNotice(
        operation === "plan"
          ? "Song added to the student’s practice plan."
          : "Song marked complete in the student’s song list."
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The song list could not be updated."
      );
    } finally {
      setBusy("");
    }
  };

  const startRecording = async (mode: "audio" | "video") => {
    if (!activeRun || activeRun.status !== "running") return;
    if (clipBlob) {
      setCaptureError(
        "Upload or discard the previous practice clip before recording another one."
      );
      return;
    }
    let acquiredStream: MediaStream | null = null;
    setCaptureError("");
    setClipError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setCaptureError(
        "This browser does not support recording. Try a current browser with microphone or camera access."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mode === "audio" ? { audio: true } : { audio: true, video: true }
      );
      acquiredStream = stream;
      const chosenMime = mimeChoices[mode].find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      setClipPracticeId(activeRun.id);
      setRecordingMode(mode);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setCaptureError(
          "The browser recording failed. Your studio session is unchanged."
        );
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || chosenMime || "";
        const blob = new Blob(chunksRef.current, { type: mime });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (!/^(audio|video)\/(webm|mp4)/i.test(mime)) {
          setCaptureError(
            "This browser produced a format outside the supported WebM/MP4 upload formats."
          );
          return;
        }
        setClipBlob(blob);
        if (blob.size > 50 * 1024 * 1024)
          setClipError(
            "This recording is larger than 50 MiB and cannot be uploaded. Discard it and record a shorter practice clip."
          );
      };
      recorder.start();
      setRecording(true);
    } catch (cause) {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCaptureError(
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "Microphone or camera permission was denied. Allow access in your browser settings, then try again."
          : cause instanceof Error
          ? cause.message
          : "The recording device could not be opened."
      );
      setRecording(false);
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };
  const discardClip = () => {
    setClipBlob(null);
    setClipPracticeId(null);
    setClipError("");
    setCaptureError("");
  };
  const uploadClip = async () => {
    if (!clipBlob || !clipPracticeId || clipBlob.size > 50 * 1024 * 1024)
      return;
    const sessionExists = data?.practice.some(
      (row) => row.id === clipPracticeId
    );
    if (!sessionExists) {
      setClipError(
        "The original practice record is no longer available in this account. The recording has been kept for retry after refresh."
      );
      return;
    }
    setClipUploading(true);
    setClipError("");
    setNotice("");
    try {
      const baseMime = clipBlob.type.split(";")[0].trim().toLowerCase();
      if (!/^(audio|video)\/(webm|mp4)$/.test(baseMime))
        throw new Error(
          "Only audio/video WebM and MP4 recordings can be uploaded."
        );
      const extension = baseMime.endsWith("mp4") ? "mp4" : "webm";
      const file = new File(
        [clipBlob],
        `practice-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.${extension}`,
        { type: baseMime }
      );
      const form = new FormData();
      form.set("category", "practice");
      form.set("targetId", clipPracticeId);
      form.set("file", file);
      const response = await fetch("/api/files", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const result = await readJson(response);
      if (!response.ok || result.ok === false)
        throw new Error(errorMessage(result, response.status));
      setClipBlob(null);
      setClipPracticeId(null);
      setNotice("Practice recording upload was accepted by the file service.");
      await load();
    } catch (cause) {
      setClipError(
        cause instanceof Error
          ? cause.message
          : "Practice recording upload failed. The recording is retained so you can retry."
      );
    } finally {
      setClipUploading(false);
    }
  };

  const submitQuiz = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answers = quizAnswers.map((value) => Number(value));
    if (
      answers.length !== 6 ||
      quizAnswers.some((value) => value === "") ||
      answers.some((value) => !Number.isInteger(value) || value < 0)
    ) {
      setActionError("Enter a whole-number answer for all six prompts.");
      return;
    }
    setActionError("");
    await practiceOperation("quiz", answers);
  };

  const playNote = (frequency: number, label: string) => {
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.11, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.35
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.36);
      setKeyboardNote(label);
      window.setTimeout(() => {
        void context.close();
        setKeyboardNote("");
      }, 450);
    } catch {
      setKeyboardNote("Audio playback is not supported here.");
    }
  };

  const selectedStreak = selectedChild
    ? completedPracticeStreak(
        data?.practice ?? [],
        selectedChild.id,
        selectedStudentTimezone,
        serverNowDate
      )
    : 0;
  const openRequests =
    data?.requests
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [];
  const evaluationsForChild =
    data?.evaluations
      .filter((row) => row.student_id === selectedChild?.id)
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [];
  const monthDefault =
    data?.serverNow && /^\d{4}-\d{2}/.test(data.serverNow)
      ? data.serverNow.slice(0, 7)
      : new Date().toISOString().slice(0, 7);

  return (
    <main className="pw-family studio-page">
      <section className="family-content">
        {error && (
          <div className="family-alert studio-alert" role="alert">
            <AlertCircle size={16} />
            <p>{error}</p>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}
        {actionError && (
          <div className="family-alert studio-alert" role="alert">
            <AlertCircle size={16} />
            <p>{actionError}</p>
          </div>
        )}
        {notice && (
          <div className="family-alert success studio-alert" role="status">
            <Check size={16} />
            <p>{notice}</p>
          </div>
        )}
        {loading && !data ? (
          <div className="family-grid">
            <div className="family-card family-card-body">
              <div className="family-stack">
                <div className="family-skeleton" />
                <div className="family-skeleton" />
                <div className="family-skeleton" />
              </div>
            </div>
            <div className="family-card family-card-body">
              <div className="family-skeleton" />
              <div className="family-skeleton" />
            </div>
          </div>
        ) : (
          data && (
            <>
              <div className="studio-heading">
                <h1>Studio</h1>
                <button
                  type="button"
                  className="family-button subtle"
                  onClick={() => void load()}
                  disabled={refreshing}
                >
                  <RefreshCw size={14} />{" "}
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              {!profileActive && (
                <div className="family-alert info studio-alert" role="status">
                  <ShieldCheck size={16} />
                  <p>
                    This profile is not active. Studio writing controls are
                    unavailable; saved records remain viewable according to your
                    account access.
                  </p>
                </div>
              )}
              {escalations.length > 0 && (
                <section
                  className="studio-card studio-escalation"
                  aria-labelledby="escalation-title"
                >
                  <div className="studio-card-head">
                    <div>
                      <h2 id="escalation-title">
                        <ShieldAlert
                          size={15}
                          style={{
                            verticalAlign: "text-bottom",
                            marginRight: 5,
                          }}
                        />{" "}
                        Class-not-started escalation queue
                      </h2>
                      <p>
                        Head Admin view · unresolved reports at least 15 minutes
                        old.
                      </p>
                    </div>
                    <span className="studio-status open">
                      {escalations.length} aged
                    </span>
                  </div>
                  <div className="studio-card-body">
                    {escalations.map((request) => (
                      <div className="studio-request" key={request.id}>
                        <div className="studio-request-head">
                          <div>
                            <h3>
                              {studentName(
                                data.students.find(
                                  (student) => student.id === request.student_id
                                ) ?? { id: request.student_id, payload: {} }
                              )}{" "}
                              · reported{" "}
                              {formatDate(
                                request.created_at,
                                data.profile.timezone
                              )}
                            </h3>
                            <div className="studio-request-meta">
                              Waiting{" "}
                              {Math.max(
                                15,
                                Math.floor(
                                  (clockNowMs -
                                    Date.parse(request.created_at)) /
                                    60000
                                )
                              )}{" "}
                              minutes · Request {request.id}
                            </div>
                          </div>
                          <span className={`studio-status ${request.status}`}>
                            {titleCase(request.status)}
                          </span>
                        </div>
                        <p className="studio-request-body">{request.body}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <StudioBirthdaySection
                allDueBirthdays={allDueBirthdays}
                setNotice={setNotice}
                setActionError={setActionError}
              />

              <div
                className="studio-layout"
                data-portal-layout="studio-workspace"
                data-studio-has-student={selectedChild ? "true" : "false"}
              >
                <div className="studio-record-column">
                  <StudioStudentDossier
                    students={data.students}
                    selectedChild={selectedChild}
                    recording={recording}
                    activeStudentIds={activeStudentIds}
                    data={data}
                    serverNowDate={serverNowDate}
                    canEditRepertoire={canEditRepertoire}
                    repertoireDrafts={repertoireDrafts}
                    reportMonths={reportMonths}
                    monthDefault={monthDefault}
                    busy={busy}
                    onSelectStudent={setSelectedChildId}
                    onRepertoireChange={(studentId, value) =>
                      setRepertoireDrafts((previous) => ({
                        ...previous,
                        [studentId]: value,
                      }))
                    }
                    onReportMonthChange={(studentId, month) =>
                      setReportMonths((previous) => ({
                        ...previous,
                        [studentId]: month,
                      }))
                    }
                    onUpdateRepertoire={updateRepertoire}
                  />

                  {selectedChild && (
                    <div className="studio-support-ledgers">
                      <StudioPracticeHistorySection
                        practiceList={selectedPractice}
                        files={data.files}
                        studentTimezone={selectedStudentTimezone}
                      />

                      <StudioEvaluationsSection
                        canEvaluate={canEvaluate}
                        evaluationsForChild={evaluationsForChild}
                        timezone={data.profile.timezone || "Africa/Lagos"}
                        busy={busy}
                        studentCount={data.students.length}
                        onSubmitEvaluation={submitEvaluation}
                      />
                    </div>
                  )}
                </div>

                {selectedChild && (
                  <div className="studio-practice-column">
                    <StudioPracticeControlsSection
                      selectedChild={selectedChild}
                      selectedStudentTimezone={selectedStudentTimezone}
                      canPractice={canPractice}
                      isStaff={isStaff}
                      activeRun={activeRun}
                      runningElapsed={runningElapsed}
                      busy={busy}
                      recording={recording}
                      recordingMode={recordingMode ?? "audio"}
                      captureError={captureError}
                      clipError={clipError}
                      clipBlob={clipBlob}
                      clipPreviewUrl={clipPreviewUrl}
                      clipPracticeId={clipPracticeId ?? ""}
                      clipUploading={clipUploading}
                      keyboardNote={keyboardNote}
                      quizAnswers={quizAnswers}
                      setQuizAnswers={setQuizAnswers}
                      onPracticeOperation={practiceOperation}
                      onSubmitQuiz={submitQuiz}
                      onStartRecording={startRecording}
                      onStopRecording={stopRecording}
                      onUploadClip={uploadClip}
                      onDiscardClip={discardClip}
                      onPlayNote={playNote}
                    />

                    <StudioAskSection
                      selectedChild={selectedChild}
                      selectedStudentTimezone={selectedStudentTimezone}
                      selectedDueLessons={selectedDueLessons}
                      canRequest={canCreateRequest}
                      busy={busy}
                      createRequest={createRequest}
                      requestKind={requestKind}
                      setRequestKind={setRequestKind}
                      requestLessonId={requestLessonId}
                      setRequestLessonId={setRequestLessonId}
                      requestBody={requestBody}
                      setRequestBody={setRequestBody}
                    />
                  </div>
                )}
              </div>

              <StudioThreadsSection
                data={data}
                selectedChild={selectedChild}
                openRequests={openRequests}
                canReply={canReply}
                canDecideRequest={canDecideRequest}
                busy={busy}
                sendReply={sendReply}
                decideRequest={decideRequest}
                replyBodies={replyBodies}
                setReplyBodies={setReplyBodies}
                decisionStatuses={decisionStatuses}
                setDecisionStatuses={setDecisionStatuses}
                confirm={confirm}
              />
            </>
          )
        )}
      </section>
      <ConfirmDialog />
    </main>
  );
}
