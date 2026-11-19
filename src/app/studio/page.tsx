"use client";

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
  Check,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import { useConfirmModal } from "@/app/_components/ConfirmModal";
import { readJson } from "@/lib/academy/web-client";
import {
  type StudentRow,
  type RequestKind,
  type RequestStatus,
  type RequestRow,
  type StudioData,
  rubric,
  mimeChoices,
  roleKey,
  studentName,
  dateOfBirth,
  studentTimezone,
  avatarId,
  initials,
  validDate,
  completedPracticeStreak,
  birthdayDaysAway,
  formatDate,
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

type StudioTab = "practice" | "repertoire" | "requests";

export default function StudioPage() {
  // Core Server Data & Clock Sync State
  const [data, setData] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [activeTab, setActiveTab] = useState<StudioTab>("practice");
  const tabInitializedRef = useRef(false);
  const [showAllStudentsRequests, setShowAllStudentsRequests] = useState(false);
  const [serverClockAnchor, setServerClockAnchor] = useState<{
    serverMs: number;
    clientMs: number;
  } | null>(null);
  const [tick, setTick] = useState(0);

  // Request & Conversation State
  const [requestKind, setRequestKind] = useState<RequestKind>("song");
  const [requestBody, setRequestBody] = useState("");
  const [requestLessonId, setRequestLessonId] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [decisionStatuses, setDecisionStatuses] = useState<
    Record<string, Exclude<RequestStatus, "open">>
  >({});

  // Quiz & Reports State
  const [quizAnswers, setQuizAnswers] = useState<string[]>(Array(6).fill(""));
  const [reportMonths, setReportMonths] = useState<Record<string, string>>({});

  // Media Recorder & Audio Synthesis State
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

  // Modal Confirmations & Hardware Refs
  const { confirm, ConfirmDialog } = useConfirmModal();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

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
      if (!tabInitializedRef.current) {
        tabInitializedRef.current = true;
        const r = roleKey(payload.profile.role ?? "");
        const familyRole = [
          "parent",
          "guardian",
          "student",
          "family",
          "family_parent",
          "parent_student",
        ].includes(r);
        setActiveTab(familyRole ? "practice" : "repertoire");
      }
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

  const hasRunningPractice = Boolean(
    data?.practice.some((row) => row.status === "running")
  );
  useEffect(() => {
    if (!hasRunningPractice) return;
    setTick(Date.now());
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [hasRunningPractice]);

  useEffect(() => {
    if (!clipBlob) {
      setClipPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(clipBlob);
    setClipPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clipBlob]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (noteTimerRef.current) {
        clearTimeout(noteTimerRef.current);
        noteTimerRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
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
      streamRef.current = null;
      chunksRef.current = [];
    };
  }, []);

  const role = roleKey(data?.profile.role ?? "");
  const perms = useMemo(
    () => new Set(data?.profile.permissions ?? []),
    [data?.profile?.permissions]
  );
  const isActive = data?.profile.status.trim().toLowerCase() === "active";
  const isOwner = role === "owner" || role === "super_admin";
  const isQualityControl =
    role === "qc" ||
    role === "quality_control" ||
    role === "quality_assurance" ||
    perms.has("reports.learning");
  const isTeacher =
    role === "teacher" ||
    data?.profile.department === "Music Education" ||
    role.includes("teacher") ||
    perms.has("workspace.learning");
  const isHeadAdmin =
    role === "head_admin" ||
    role === "headadmin" ||
    perms.has("workspace.management");
  const isAdmin =
    role === "admin" ||
    role === "administrator" ||
    isHeadAdmin ||
    isOwner ||
    perms.has("workspace.studio");
  const isStaff = !["parent", "guardian", "student", "family"].includes(role);
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
  const activeStudentIds = useMemo(
    () =>
      new Set(
        data?.practice
          .filter((row) => row.status === "running" || row.status === "paused")
          .map((row) => row.student_id) ?? []
      ),
    [data?.practice]
  );
  const profileActive = Boolean(isActive);

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
  ): Promise<boolean> => {
    if (!canPractice || !selectedChild) return false;
    if (operation === "create" && activeRun) return false;
    if (operation !== "create" && !activeRun) return false;
    if (operation === "quiz" && (!activeRun || activeRun.status !== "running"))
      return false;
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
          "Your practice update was received, but could not be verified yet. Please refresh."
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
        throw new Error("The updated practice status is not visible yet.");
      setNotice(
        operation === "quiz"
          ? `Quiz score saved: ${row.game_score} / ${row.game_total}.`
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
            }.`
      );
      if (operation === "quiz") setQuizAnswers(Array(6).fill(""));
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The practice action could not be saved."
      );
      return false;
    } finally {
      setBusy("");
    }
  };

  const createRequest = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<boolean> => {
    event.preventDefault();
    if (!canCreateRequest || !selectedChild) return false;
    const bodyText = requestBody.trim();
    if (!bodyText) {
      setActionError("Add a message before sending your request.");
      return false;
    }
    let lessonId: string | undefined;
    if (requestKind === "class_not_started") {
      if (!selectedDueLessons.some((lesson) => lesson.id === requestLessonId)) {
        setActionError(
          "Choose a currently due lesson for the selected student."
        );
        return false;
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
          "Your request was sent, but is not visible yet. Refresh to confirm."
        );
      setRequestBody("");
      setRequestLessonId("");
      setNotice("Your request has been sent to the studio team.");
      setActiveTab("requests");
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The request could not be sent."
      );
      return false;
    } finally {
      setBusy("");
    }
  };

  const sendReply = async (request: RequestRow): Promise<boolean> => {
    if (!canReply) return false;
    const body = (replyBodies[request.id] ?? "").trim();
    if (!body) {
      setActionError("Write a reply before sending it.");
      return false;
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
          "Your reply was posted, but is not visible yet. Refresh to confirm."
        );
      setReplyBodies((previous) => ({ ...previous, [request.id]: "" }));
      setNotice("Reply posted to the thread.");
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The reply could not be saved."
      );
      return false;
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
    request: RequestRow,
    status: Exclude<RequestStatus, "open">,
    note: string
  ): Promise<boolean> => {
    if (!canDecideRequest(request)) return false;
    const body = note.trim();
    if (!body) {
      setActionError("A decision note is required.");
      return false;
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
          "The updated status and note are not visible yet. Please refresh to confirm."
        );
      if (typeof result.ok === "boolean" && result.ok === false)
        throw new Error("The request update was not accepted.");
      setNotice(`Request marked ${titleCase(status)}.`);
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The request decision could not be saved."
      );
      return false;
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
          "The evaluation was submitted, but is not visible yet. Refresh to verify."
        );
      setNotice("Evaluation saved.");
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
    operation: "plan" | "complete",
    songTitle: string
  ): Promise<boolean> => {
    if (!canEditRepertoire) return false;
    const song = songTitle.trim();
    if (song.length < 2 || song.length > 150) {
      setActionError("Enter a song title between 2 and 150 characters.");
      return false;
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
          "The song list update was accepted, but not yet reflected. Refresh before retrying."
        );
      }
      setNotice(
        operation === "plan"
          ? `Added "${song}" to ${studentName(student)}'s practice plan.`
          : `Marked "${song}" complete!`
      );
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The song list could not be updated."
      );
      return false;
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
      if (unmountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
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
        setCaptureError("Recording failed. Your practice session is unchanged.");
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        chunksRef.current = [];
        setRecording(false);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || chosenMime || "";
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (unmountedRef.current) return;
        setRecording(false);
        if (!/^(audio|video)\/(webm|mp4)/i.test(mime)) {
          setCaptureError(
            "This browser produced an unsupported format. Please use WebM or MP4."
          );
          return;
        }
        setClipBlob(blob);
        if (blob.size > 50 * 1024 * 1024)
          setClipError(
            "This recording is larger than 50 MiB. Discard it and record a shorter clip."
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
        "The original practice session could not be found. Refresh and try uploading again."
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
      setNotice("Practice recording saved.");
      await load();
    } catch (cause) {
      setClipError(
        cause instanceof Error
          ? cause.message
          : "Upload failed. Your clip is still here so you can retry."
      );
    } finally {
      setClipUploading(false);
    }
  };

  const submitQuiz = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<boolean> => {
    event.preventDefault();
    const answers = quizAnswers.map((value) => Number(value));
    if (
      answers.length !== 6 ||
      quizAnswers.some((value) => value === "") ||
      answers.some((value) => !Number.isInteger(value) || value < 0)
    ) {
      setActionError("Enter a whole-number answer for all six questions.");
      return false;
    }
    setActionError("");
    return practiceOperation("quiz", answers);
  };

  const playNote = (frequency: number, label: string) => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const context = audioCtxRef.current;
      if (context.state === "suspended") {
        void context.resume();
      }
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
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
      noteTimerRef.current = setTimeout(() => {
        setKeyboardNote("");
        noteTimerRef.current = null;
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

  const filteredRequests = useMemo(() => {
    const all = (data?.requests ?? [])
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (!selectedChild) return all;
    if (isStaff && showAllStudentsRequests) return all;
    return all.filter((row) => row.student_id === selectedChild.id);
  }, [data?.requests, selectedChild, isStaff, showAllStudentsRequests]);

  const pendingRequestCount = useMemo(
    () =>
      filteredRequests.filter(
        (row) => row.status === "open" || row.status === "in_progress"
      ).length,
    [filteredRequests]
  );

  const evaluationsForChild =
    data?.evaluations
      .filter((row) => row.student_id === selectedChild?.id)
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [];

  const monthDefault =
    data?.serverNow && /^\d{4}-\d{2}/.test(data.serverNow)
      ? data.serverNow.slice(0, 7)
      : new Date().toISOString().slice(0, 7);

  const askButtonElement = (
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
  );

  return (
    <main className="pw-family studio-page">
      <section className="family-content">
        {error && (
          <div className="family-alert studio-alert" role="alert">
            <AlertCircle size={16} />
            <p style={{ flex: 1 }}>{error}</p>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => void load()}
            >
              Try again
            </button>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              style={{ padding: "0 8px", minHeight: 30 }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {actionError && (
          <div className="family-alert studio-alert" role="alert">
            <AlertCircle size={16} />
            <p style={{ flex: 1 }}>{actionError}</p>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setActionError("")}
              aria-label="Dismiss error"
              style={{ padding: "0 8px", minHeight: 30 }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {notice && (
          <div className="family-alert success studio-alert" role="status">
            <Check size={16} />
            <p style={{ flex: 1 }}>{notice}</p>
            <button
              type="button"
              className="family-button subtle"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
              style={{ padding: "0 8px", minHeight: 30 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {loading && !data ? (
          <div className="family-card family-card-body">
            <div className="family-stack">
              <div className="family-skeleton" />
              <div className="family-skeleton" />
              <div className="family-skeleton" />
            </div>
          </div>
        ) : (
          data && (
            <>
              <div className="studio-heading">
                <h1>Studio</h1>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {canCreateRequest && activeTab !== "requests" && askButtonElement}
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
              </div>

              {!profileActive && (
                <div className="family-alert info studio-alert" role="status">
                  <ShieldCheck size={16} />
                  <p>
                    This profile is currently inactive. Records remain viewable,
                    while editing actions are paused.
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
                        Head Admin view · unresolved reports waiting 15+ minutes.
                      </p>
                    </div>
                    <span className="studio-status open">
                      {escalations.length} urgent
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
                              minutes
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

              {/* Top Student Selector Bar */}
              {data.students.length > 0 && selectedChild && (
                <div
                  className="studio-card"
                  style={{
                    padding: "12px 16px",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      minWidth: 0,
                      flex: "1 1 260px",
                    }}
                  >
                    <span className="studio-avatar">
                      {avatarId(selectedChild) ? (
                        <img
                          src={`/api/files?id=${encodeURIComponent(
                            avatarId(selectedChild) as string
                          )}`}
                          alt=""
                        />
                      ) : (
                        initials(studentName(selectedChild))
                      )}
                    </span>
                    <div style={{ display: "grid", gap: 3, minWidth: 200 }}>
                      <label
                        htmlFor="studio-top-student-select"
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "#516259",
                        }}
                      >
                        Active Student
                      </label>
                      {data.students.length > 1 ? (
                        <select
                          id="studio-top-student-select"
                          value={selectedChild.id}
                          onChange={(event) =>
                            setSelectedChildId(event.target.value)
                          }
                          disabled={recording}
                          style={{
                            border: "1px solid #dce7df",
                            borderRadius: 8,
                            padding: "6px 10px",
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#0c3527",
                            background: "#f7faf8",
                          }}
                        >
                          {data.students.map((student) => (
                            <option value={student.id} key={student.id}>
                              {studentName(student)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <strong style={{ fontSize: 15, color: "#0c3527" }}>
                          {studentName(selectedChild)}
                        </strong>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="studio-status">
                      {selectedStreak}-day streak
                    </span>
                    <span
                      className={`studio-status ${
                        activeStudentIds.has(selectedChild.id) ? "running" : ""
                      }`}
                    >
                      {activeStudentIds.has(selectedChild.id)
                        ? "Practice active"
                        : "Timer idle"}
                    </span>
                  </div>
                </div>
              )}

              {/* Top-level Workspace Tabs */}
              <div
                className="portal-tabs"
                role="tablist"
                aria-label="Studio sections"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "practice"}
                  className={`portal-tab ${
                    activeTab === "practice" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("practice")}
                >
                  <Activity size={14} aria-hidden="true" />
                  Practice Room
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "repertoire"}
                  className={`portal-tab ${
                    activeTab === "repertoire" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("repertoire")}
                >
                  <BookOpen size={14} aria-hidden="true" />
                  Repertoire &amp; Evaluations
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "requests"}
                  className={`portal-tab ${
                    activeTab === "requests" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("requests")}
                >
                  <MessageSquare size={14} aria-hidden="true" />
                  Studio Requests
                  {pendingRequestCount > 0 && (
                    <span className="portal-tab-badge">
                      {pendingRequestCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Tab 1: Practice Room */}
              {activeTab === "practice" && (
                <div>
                  {selectedChild ? (
                    canPractice ? (
                      <div
                        className="studio-layout"
                        data-portal-layout="studio-workspace"
                        data-studio-has-student="true"
                      >
                        <StudioPracticeControlsSection
                          selectedChild={selectedChild}
                          selectedStudentTimezone={selectedStudentTimezone}
                          canPractice={canPractice}
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
                        <StudioPracticeHistorySection
                          practiceList={selectedPractice}
                          files={data.files}
                          studentTimezone={selectedStudentTimezone}
                        />
                      </div>
                    ) : (
                      /* Staff view: hide StudioPracticeControlsSection & keyboard completely */
                      <StudioPracticeHistorySection
                        practiceList={selectedPractice}
                        files={data.files}
                        studentTimezone={selectedStudentTimezone}
                      />
                    )
                  ) : (
                    <div className="studio-card">
                      <div className="studio-empty">
                        <strong>No student selected</strong>
                        Practice logs will appear here once a student is linked
                        to this account.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Repertoire & Evaluations */}
              {activeTab === "repertoire" && (
                <div style={{ display: "grid", gap: 16 }}>
                  <StudioStudentDossier
                    students={data.students}
                    selectedChild={selectedChild}
                    activeStudentIds={activeStudentIds}
                    data={data}
                    serverNowDate={serverNowDate}
                    canEditRepertoire={canEditRepertoire}
                    reportMonths={reportMonths}
                    monthDefault={monthDefault}
                    busy={busy}
                    onReportMonthChange={(studentId, month) =>
                      setReportMonths((previous) => ({
                        ...previous,
                        [studentId]: month,
                      }))
                    }
                    onUpdateRepertoire={updateRepertoire}
                  />

                  {selectedChild && (
                    <StudioEvaluationsSection
                      canEvaluate={canEvaluate}
                      evaluationsForChild={evaluationsForChild}
                      timezone={data.profile.timezone || "Africa/Lagos"}
                      busy={busy}
                      studentCount={data.students.length}
                      studentDisplayName={studentName(selectedChild)}
                      currentProfileId={data.profile.id}
                      currentProfileName={data.profile.name}
                      onSubmitEvaluation={submitEvaluation}
                    />
                  )}
                </div>
              )}

              {/* Tab 3: Studio Requests */}
              {activeTab === "requests" && (
                <StudioThreadsSection
                  data={data}
                  selectedChild={selectedChild}
                  openRequests={filteredRequests}
                  isStaff={isStaff}
                  showAllStudents={showAllStudentsRequests}
                  onToggleShowAllStudents={setShowAllStudentsRequests}
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
                  askAction={canCreateRequest ? askButtonElement : undefined}
                />
              )}
            </>
          )
        )}
      </section>
      <ConfirmDialog />
    </main>
  );
}
