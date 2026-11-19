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
import { createBrowserClient } from "@supabase/ssr";
import {
  BookOpen,
  ClipboardList,
  FileText,
  RefreshCw,
  Video,
  X,
} from "lucide-react";
import type { LearningResponse, LiveBoard } from "@/lib/academy/learning";
import {
  LEARNING_CACHE_KEY,
  getCachedJson,
  saveCachedJson,
} from "@/lib/storage";
import ProfileAvatar from "@/app/_components/ProfileAvatar";
import {
  blankResource,
  dateLabel,
  localMonth,
  roleKey,
  supportedFileExtensions,
  supportedFileMimes,
  type BoardDraft,
  type LearningLesson,
  type PendingBoardPost,
  type ResourceDraft,
  type ResourceRow,
} from "./learning-types";
import LearningLiveBoard from "./components/LearningLiveBoard";
import LearningReportsSection from "./components/LearningReportsSection";
import LearningResourcesSection from "./components/LearningResourcesSection";

type LearningTab = "board" | "resources" | "reports";

async function jsonOf(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

function canUserEditBoard(
  profile: LearningResponse["profile"] | undefined,
  lesson: LearningLesson | null | undefined
): boolean {
  if (!profile || !lesson) return false;
  if (profile.status.trim().toLowerCase() !== "active") return false;
  const roleValue = roleKey(profile.role);
  const permissions = new Set(profile.permissions ?? []);
  return (
    roleValue === "owner" ||
    roleValue === "super_admin" ||
    roleValue === "qc" ||
    roleValue === "quality_control" ||
    permissions.has("workspace.curriculum") ||
    lesson.teacherId === profile.id
  );
}

export default function LearningPage() {
  const [data, setData] = useState<LearningResponse | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [activeTab, setActiveTab] = useState<LearningTab>("board");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connection, setConnection] = useState<
    "connecting" | "live" | "error" | "disconnected"
  >("connecting");
  const [draft, setDraft] = useState<BoardDraft>({
    notes: "",
    nextTopics: "",
    completedTopics: [],
  });
  const [boardStatus, setBoardStatus] = useState<
    "clean" | "dirty" | "saving" | "saved" | "conflict" | "error"
  >("clean");
  const [conflictMessage, setConflictMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [resourceDraft, setResourceDraft] =
    useState<ResourceDraft>(blankResource);
  const [editingResource, setEditingResource] = useState<ResourceRow | null>(
    null
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [createdResourceId, setCreatedResourceId] = useState<string | null>(
    null
  );
  const [createdResourceRevision, setCreatedResourceRevision] = useState<
    number | null
  >(null);
  const [resourceFilter, setResourceFilter] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<ResourceRow | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [reportMonth, setReportMonth] = useState(localMonth);
  const [reportBusy, setReportBusy] = useState<"progress" | "birthday" | null>(
    null
  );
  const [reportError, setReportError] = useState("");

  const dataRef = useRef<LearningResponse | null>(null);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const revisionRef = useRef<Record<string, number>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const latestSaveRef = useRef<() => Promise<boolean>>(async () => true);
  const saveRef = useRef<() => Promise<boolean>>(async () => true);
  const ownRevisionRef = useRef<Record<string, number>>({});
  const pendingBoardPostRef = useRef<PendingBoardPost | null>(null);
  const deepLinkLessonRef = useRef<string | null>(null);
  const selectedIdRef = useRef(selectedLessonId);
  const mountedRef = useRef(true);

  const role = roleKey(data?.profile.role ?? "");
  const isActive = data?.profile.status.trim().toLowerCase() === "active";
  const perms = useMemo(
    () => new Set(data?.profile.permissions ?? []),
    [data?.profile.permissions]
  );
  const canManageResources =
    role === "owner" ||
    role === "qc" ||
    role === "quality_control" ||
    role === "super_admin" ||
    perms.has("workspace.curriculum") ||
    perms.has("workspace.learning");
  const canEditResources = Boolean(isActive && canManageResources);
  const canReadResources =
    canManageResources ||
    !["parent", "student"].includes(role) ||
    role === "parent" ||
    role === "student";
  const selectedLesson = useMemo(
    () =>
      data?.lessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [data?.lessons, selectedLessonId]
  );
  const selectedBoard = useMemo(
    () =>
      data?.boards.find((board) => board.lesson_id === selectedLessonId) ??
      null,
    [data?.boards, selectedLessonId]
  );
  const canEditBoard = useMemo(
    () => canUserEditBoard(data?.profile, selectedLesson),
    [data?.profile, selectedLesson]
  );

  const canDownloadRecordings = Boolean(
    data &&
      isActive &&
      ([
        "owner",
        "super_admin",
        "head_admin",
        "admin",
        "qc",
        "quality_control",
      ].includes(role) ||
        perms.has("workspace.learning") ||
        perms.has("workspace.studio") ||
        perms.has("workspace.curriculum"))
  );

  const visibleResources = useMemo(() => {
    const resources = data?.resources ?? [];
    const query = resourceFilter.trim().toLowerCase();
    return resources.filter((row) => {
      const item = row.payload;
      return (
        !query ||
        [item.title, item.instrument, item.level, item.type, item.summary].some(
          (value) => value.toLowerCase().includes(query)
        )
      );
    });
  }, [data?.resources, resourceFilter]);

  const lessonRecordings = useMemo(() => {
    const all = data?.recordings ?? [];
    return all.filter((r) => r.target_id === selectedLessonId);
  }, [data?.recordings, selectedLessonId]);

  const adoptData = useCallback(
    (fresh: LearningResponse, preserveDirty = true, persist = true) => {
      dataRef.current = fresh;
      setData(fresh);
      if (persist) {
        saveCachedJson(LEARNING_CACHE_KEY, fresh);
      }
      const requested = deepLinkLessonRef.current;
      const currentId = selectedIdRef.current;
      const chosen =
        currentId && fresh.lessons.some((item) => item.id === currentId)
          ? currentId
          : requested && fresh.lessons.some((item) => item.id === requested)
          ? requested
          : fresh.lessons[0]?.id ?? "";
      selectedIdRef.current = chosen;
      setSelectedLessonId(chosen);
      if (!preserveDirty || !dirtyRef.current) {
        const lesson = fresh.lessons.find((item) => item.id === chosen);
        const board = fresh.boards.find((item) => item.lesson_id === chosen);
        const next = {
          notes: board?.notes ?? lesson?.notes ?? "",
          nextTopics: board?.next_topics ?? lesson?.nextTopics ?? "",
          completedTopics: board?.completed_topics ?? [],
        };
        draftRef.current = next;
        dirtyRef.current = false;
        conflictRef.current = false;
        revisionRef.current[chosen] = board?.revision ?? 0;
        setDraft(next);
        setBoardStatus("clean");
      } else {
        for (const board of fresh.boards)
          revisionRef.current[board.lesson_id] = board.revision;
      }
    },
    []
  );

  const load = useCallback(
    async (preserveDirty = true) => {
      setIsRefreshing(true);
      setLoadError("");
      try {
        const response = await fetch("/api/learning", {
          credentials: "include",
          cache: "no-store",
        });
        const result = await jsonOf(response);
        if (response.status === 401) {
          window.location.assign("/login");
          return false;
        }
        if (!response.ok)
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : `Learning data could not be loaded (${response.status}).`
          );
        const fresh = result as unknown as LearningResponse;
        if (
          !fresh ||
          !fresh.profile ||
          !Array.isArray(fresh.lessons) ||
          !Array.isArray(fresh.boards) ||
          !Array.isArray(fresh.resources)
        )
          throw new Error("The learning response was incomplete.");
        adoptData(fresh, preserveDirty, true);
        return true;
      } catch (cause) {
        setLoadError(
          cause instanceof Error
            ? cause.message
            : "Learning data could not be loaded."
        );
        return false;
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [adoptData]
  );

  useEffect(() => {
    mountedRef.current = true;
    deepLinkLessonRef.current = new URLSearchParams(window.location.search).get(
      "lessonId"
    );
    const cached = getCachedJson<LearningResponse>(LEARNING_CACHE_KEY, (p) =>
      Boolean(
        p &&
          p.profile &&
          Array.isArray(p.lessons) &&
          Array.isArray(p.boards) &&
          Array.isArray(p.resources)
      )
    );
    if (cached) {
      adoptData(cached, true, false);
      setLoading(false);
    }
    void load(true);
    return () => {
      mountedRef.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [adoptData, load]);

  useEffect(() => {
    selectedIdRef.current = selectedLessonId;
  }, [selectedLessonId]);

  const replaceDraft = useCallback((next: BoardDraft, dirty: boolean) => {
    draftRef.current = next;
    dirtyRef.current = dirty;
    setDraft(next);
    if (dirty && !conflictRef.current) setBoardStatus("dirty");
  }, []);

  const saveBoard = useCallback(async (): Promise<boolean> => {
    const lessonId = selectedIdRef.current;
    const current = dataRef.current;
    if (!lessonId || !dirtyRef.current || !current) return true;
    if (conflictRef.current) return false;
    if (savingRef.current && savePromiseRef.current) {
      return savePromiseRef.current;
    }

    const lesson = current.lessons.find((item) => item.id === lessonId);
    if (!canUserEditBoard(current.profile, lesson)) return true;

    const sent = {
      ...draftRef.current,
      completedTopics: [...draftRef.current.completedTopics],
    };
    const revision =
      revisionRef.current[lessonId] ??
      current.boards.find((board) => board.lesson_id === lessonId)?.revision ??
      0;
    const pendingPost: PendingBoardPost = { lessonId, revision, ...sent };
    pendingBoardPostRef.current = pendingPost;
    savingRef.current = true;
    setBoardStatus("saving");

    const run = (async (): Promise<boolean> => {
      try {
        const response = await fetch("/api/learning", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "board",
            lessonId,
            revision,
            notes: sent.notes,
            nextTopics: sent.nextTopics,
            completedTopics: sent.completedTopics,
          }),
        });
        const result = await jsonOf(response);
        if (response.status === 409) {
          conflictRef.current = true;
          setBoardStatus("conflict");
          setConflictMessage(
            typeof result.error === "string"
              ? result.error
              : "This board changed elsewhere. Your draft is still here; reload before saving again."
          );
          return false;
        }
        if (
          !response.ok ||
          result.ok !== true ||
          !result.board ||
          typeof result.board !== "object"
        ) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : `Board changes were not saved (${response.status}).`
          );
        }
        const board = result.board as LiveBoard;
        revisionRef.current[lessonId] = board.revision;
        ownRevisionRef.current[lessonId] = board.revision;
        dataRef.current = dataRef.current
          ? {
              ...dataRef.current,
              boards: [
                ...dataRef.current.boards.filter(
                  (existing) => existing.lesson_id !== lessonId
                ),
                board,
              ],
            }
          : null;
        if (dataRef.current) setData(dataRef.current);
        const unchanged =
          selectedIdRef.current === lessonId &&
          JSON.stringify(draftRef.current) === JSON.stringify(sent);
        if (conflictRef.current) {
          setBoardStatus("conflict");
          return false;
        } else if (unchanged) {
          dirtyRef.current = false;
          setBoardStatus("saved");
          return true;
        } else if (dirtyRef.current && !conflictRef.current) {
          setBoardStatus("dirty");
          return false;
        }
        return true;
      } catch (cause) {
        setBoardStatus("error");
        setNotice(
          cause instanceof Error
            ? cause.message
            : "The board could not be saved. Your text remains on this device."
        );
        return false;
      } finally {
        if (pendingBoardPostRef.current === pendingPost)
          pendingBoardPostRef.current = null;
        savingRef.current = false;
        savePromiseRef.current = null;
        if (mountedRef.current && dirtyRef.current && !conflictRef.current) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            if (mountedRef.current) void saveRef.current();
          }, 800);
        }
      }
    })();

    savePromiseRef.current = run;
    return run;
  }, []);
  saveRef.current = saveBoard;
  latestSaveRef.current = saveBoard;

  useEffect(() => {
    if (!canEditBoard || !dirtyRef.current || conflictRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void latestSaveRef.current();
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, canEditBoard]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    let client: ReturnType<typeof createBrowserClient> | null = null;
    let channel: ReturnType<
      ReturnType<typeof createBrowserClient>["channel"]
    > | null = null;
    const connect = async () => {
      setConnection("connecting");
      try {
        const browserClient = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        client = browserClient;
        const { data: authData, error: authError } =
          await browserClient.auth.getSession();
        if (authError) throw authError;
        if (authData.session?.access_token)
          await browserClient.realtime.setAuth(authData.session.access_token);
        if (cancelled) return;
        let liveChannel = browserClient.channel(
          `pw-learning-live-${selectedLessonId || "resources"}`
        );
        if (selectedLessonId)
          liveChannel = liveChannel.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "pw_lesson_boards",
              filter: `lesson_id=eq.${selectedLessonId}`,
            },
            (payload) => {
              const row = (
                payload.new && Object.keys(payload.new).length
                  ? payload.new
                  : payload.old
              ) as (Partial<LiveBoard> & { lesson_id?: string }) | null;
              const lessonId = row?.lesson_id;
              if (!row || !lessonId) {
                void load(true);
                return;
              }
              const incomingRevision =
                typeof row.revision === "number" ? row.revision : -1;
              if (ownRevisionRef.current[lessonId] === incomingRevision) {
                delete ownRevisionRef.current[lessonId];
                return;
              }
              const pending = pendingBoardPostRef.current;
              const topicsMatch =
                Array.isArray(row.completed_topics) &&
                JSON.stringify(row.completed_topics) ===
                  JSON.stringify(pending?.completedTopics);
              const isPostedVersion = Boolean(
                pending &&
                  pending.lessonId === lessonId &&
                  incomingRevision === pending.revision + 1 &&
                  row.notes === pending.notes &&
                  row.next_topics === pending.nextTopics &&
                  topicsMatch
              );
              if (isPostedVersion) {
                ownRevisionRef.current[lessonId] = incomingRevision;
                return;
              }
              if (
                incomingRevision >= 0 &&
                incomingRevision <= (revisionRef.current[lessonId] ?? -1)
              )
                return;
              if (lessonId === selectedIdRef.current && dirtyRef.current) {
                conflictRef.current = true;
                setBoardStatus("conflict");
                setConflictMessage(
                  "A newer board version arrived while your draft was being edited. Your local text has been preserved."
                );
                return;
              }
              void load(true);
            }
          );
        channel = liveChannel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pw_resources" },
            () => {
              void load(true);
            }
          )
          .subscribe((status) => {
            if (cancelled) return;
            if (status === "SUBSCRIBED") setConnection("live");
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setConnection("error");
              void load(true);
            } else if (status === "CLOSED") setConnection("disconnected");
          });
        if (cancelled && channel) {
          void browserClient.removeChannel(channel);
          channel = null;
        }
      } catch {
        if (!cancelled) setConnection("error");
      }
    };
    void connect();
    return () => {
      cancelled = true;
      if (client && channel) {
        void client.removeChannel(channel);
      } else if (channel) {
        void channel.unsubscribe();
      }
    };
  }, [data?.profile.id, load, selectedLessonId]);

  const selectLesson = useCallback(
    async (id: string) => {
      if (id === selectedIdRef.current) return;
      if (conflictRef.current) {
        setNotice(
          "Resolve the current board conflict before switching lessons. Your draft has been preserved."
        );
        return;
      }
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (savingRef.current && savePromiseRef.current) {
        await savePromiseRef.current;
      }
      if (dirtyRef.current && !conflictRef.current) {
        const flushed = await saveBoard();
        if (!flushed || conflictRef.current || dirtyRef.current) {
          return;
        }
      }
      selectedIdRef.current = id;
      setSelectedLessonId(id);
      const current = dataRef.current;
      const board = current?.boards.find((item) => item.lesson_id === id);
      const lesson = current?.lessons.find((item) => item.id === id);
      const next = {
        notes: board?.notes ?? lesson?.notes ?? "",
        nextTopics: board?.next_topics ?? lesson?.nextTopics ?? "",
        completedTopics: board?.completed_topics ?? [],
      };
      dirtyRef.current = false;
      conflictRef.current = false;
      revisionRef.current[id] = board?.revision ?? 0;
      draftRef.current = next;
      setDraft(next);
      setBoardStatus("clean");
      setConflictMessage("");
    },
    [saveBoard]
  );

  const reloadBoard = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const success = await load(false);
    if (success) setConflictMessage("");
    else setBoardStatus("conflict");
  }, [load]);

  const keepDraftForCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        `Lesson board draft\nNotes:\n${
          draftRef.current.notes
        }\n\nNext topics:\n${
          draftRef.current.nextTopics
        }\n\nCompleted topics:\n${draftRef.current.completedTopics.join("\n")}`
      );
      setNotice(
        "Your local draft was copied. Reload the latest board before making further edits."
      );
    } catch {
      setNotice(
        "Clipboard access is unavailable. Your draft remains visible; select and copy it before reloading."
      );
    }
  }, []);

  const openCreate = () => {
    setEditingResource(null);
    setCreatedResourceId(null);
    setCreatedResourceRevision(null);
    setResourceDraft(blankResource);
    setPendingFile(null);
    setResourceError("");
    setModalOpen(true);
  };

  const openEdit = (row: ResourceRow) => {
    const item = row.payload;
    setEditingResource(row);
    setCreatedResourceId(null);
    setCreatedResourceRevision(null);
    setResourceDraft({
      title: item.title,
      type: item.type,
      instrument: item.instrument,
      level: item.level,
      summary: item.summary,
    });
    setPendingFile(null);
    setResourceError("");
    setModalOpen(true);
  };

  const closeResourceModal = () => {
    if (!resourceBusy) {
      setModalOpen(false);
      setResourceError("");
      setCreatedResourceId(null);
      setCreatedResourceRevision(null);
    }
  };

  const uploadFor = useCallback(async (resourceId: string, file: File) => {
    const form = new FormData();
    form.set("category", "curriculum");
    form.set("targetId", resourceId);
    form.set("file", file);
    const response = await fetch("/api/files", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const result = await jsonOf(response);
    if (!response.ok)
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : `File upload failed (${response.status}).`
      );
    return result;
  }, []);

  const downloadReport = useCallback(
    async (
      kind: "progress" | "birthday",
      studentId: string,
      month?: string
    ) => {
      setReportBusy(kind);
      setReportError("");
      try {
        const params = new URLSearchParams({ kind, id: studentId });
        if (kind === "progress" && month) params.set("month", month);
        const response = await fetch(`/api/reports?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          let message = body;
          try {
            const parsed = JSON.parse(body) as {
              error?: unknown;
              message?: unknown;
            };
            if (typeof parsed.error === "string") message = parsed.error;
            else if (typeof parsed.message === "string")
              message = parsed.message;
          } catch {
            /* Keep the endpoint's plain-text error. */
          }
          throw new Error(
            message || `Report could not be downloaded (${response.status}).`
          );
        }
        const contentType =
          response.headers.get("content-type")?.toLowerCase() ?? "";
        if (contentType.includes("json") || contentType.startsWith("text/")) {
          const body = await response.text().catch(() => "");
          let message = body || "The report endpoint did not return a PDF.";
          try {
            const parsed = JSON.parse(body) as {
              error?: unknown;
              message?: unknown;
            };
            if (typeof parsed.error === "string") message = parsed.error;
            else if (typeof parsed.message === "string")
              message = parsed.message;
          } catch {
            /* Keep the endpoint's response text. */
          }
          throw new Error(message);
        }
        const blob = await response.blob();
        const disposition = response.headers.get("content-disposition") ?? "";
        const nameMatch = disposition.match(
          /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i
        );
        const suppliedName = nameMatch?.[1]
          ? decodeURIComponent(nameMatch[1])
          : nameMatch?.[2];
        const fallbackName =
          kind === "progress"
            ? `progress-${studentId}-${month ?? localMonth()}.pdf`
            : `birthday-${studentId}.pdf`;
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = suppliedName || fallbackName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (cause) {
        setReportError(
          cause instanceof Error
            ? cause.message
            : "The requested report could not be downloaded."
        );
      } finally {
        setReportBusy(null);
      }
    },
    []
  );

  const submitResource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditResources) return;
    const fileExtension =
      pendingFile?.name.toLowerCase().split(".").pop() ?? "";
    if (
      pendingFile &&
      (pendingFile.size > 50 * 1024 * 1024 ||
        (!supportedFileMimes.includes(pendingFile.type) &&
          !supportedFileExtensions.includes(fileExtension)))
    ) {
      setResourceError(
        "Choose a PDF, PNG, JPEG, MP4, WebM, MP3, WAV, or OGG file up to 50 MiB."
      );
      return;
    }
    setResourceBusy(true);
    setResourceError("");
    setNotice("");
    try {
      const id =
        editingResource?.payload.id ?? createdResourceId ?? crypto.randomUUID();
      const response = await fetch("/api/learning", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "resource",
          id,
          ...resourceDraft,
          revision: editingResource?.revision ?? createdResourceRevision ?? 0,
        }),
      });
      const result = await jsonOf(response);
      if (!response.ok || typeof result.revision !== "number")
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : `Curriculum could not be saved (${response.status}).`
        );
      if (!editingResource) {
        setCreatedResourceId(id);
        setCreatedResourceRevision(result.revision);
      }
      if (pendingFile) {
        await uploadFor(id, pendingFile);
        const responseAfterUpload = await fetch("/api/learning", {
          credentials: "include",
          cache: "no-store",
        });
        const fresh = await jsonOf(responseAfterUpload);
        if (!responseAfterUpload.ok)
          throw new Error(
            "Curriculum was saved, but the uploaded file could not be verified. Refresh before attaching another file."
          );
        adoptData(fresh as unknown as LearningResponse, true);
        const attached = (fresh as unknown as LearningResponse).resources?.some(
          (row) => row.payload.id === id && Boolean(row.payload.fileId)
        );
        if (!attached)
          throw new Error(
            "The file upload response did not confirm an attachment. Refresh to check its status."
          );
        setNotice("Curriculum and attachment saved.");
      } else {
        const refreshed = await load(true);
        if (!refreshed)
          throw new Error(
            "Curriculum was saved, but the updated list could not be refreshed."
          );
        setNotice(
          editingResource
            ? "Curriculum changes saved."
            : "Curriculum resource created."
        );
      }
      setModalOpen(false);
      setPendingFile(null);
      setCreatedResourceId(null);
      setCreatedResourceRevision(null);
    } catch (cause) {
      setResourceError(
        cause instanceof Error
          ? cause.message
          : "Curriculum changes could not be confirmed."
      );
    } finally {
      setResourceBusy(false);
    }
  };

  const archiveResource = async () => {
    if (!archiveTarget || !canEditResources) return;
    setArchiving(true);
    setNotice("");
    try {
      const response = await fetch("/api/learning", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "archive_resource",
          id: archiveTarget.payload.id,
          revision: archiveTarget.revision,
        }),
      });
      const result = await jsonOf(response);
      if (!response.ok)
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : `Resource was not archived (${response.status}).`
        );
      const refreshed = await load(true);
      if (!refreshed)
        throw new Error(
          "Archive was accepted, but the curriculum list could not be refreshed."
        );
      if (
        dataRef.current?.resources.some(
          (row) => row.payload.id === archiveTarget.payload.id
        )
      ) {
        throw new Error(
          "The archive request was accepted, but the resource is still active. Refresh the list before trying again."
        );
      }
      setNotice("Resource archived.");
      setArchiveTarget(null);
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : "The resource could not be archived."
      );
    } finally {
      setArchiving(false);
    }
  };

  const addTopic = () => {
    const value = topicInput.trim();
    if (!value || draft.completedTopics.includes(value)) return;
    replaceDraft(
      {
        ...draftRef.current,
        completedTopics: [...draftRef.current.completedTopics, value],
      },
      true
    );
    setTopicInput("");
  };

  const saveStatusText =
    boardStatus === "saving"
      ? "Saving changes…"
      : boardStatus === "saved"
      ? "Saved just now"
      : boardStatus === "dirty"
      ? "Changes pending"
      : boardStatus === "conflict"
      ? "Conflict — draft preserved"
      : boardStatus === "error"
      ? "Save needs attention"
      : "All changes saved";

  const noticeIsSuccess = [
    "Curriculum and attachment saved.",
    "Curriculum changes saved.",
    "Curriculum resource created.",
    "Resource archived.",
    "Your local draft was copied. Reload the latest board before making further edits.",
  ].includes(notice);

  return (
    <main className="pw-learning">
      <section className="learn-content">
        <div className="learn-heading">
          <h1>Lesson boards</h1>
          <button
            type="button"
            className="learn-refresh"
            onClick={() => void load(true)}
            disabled={isRefreshing}
            aria-label="Refresh learning data"
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={isRefreshing ? "learn-spinning" : ""}
            />
            <span>{isRefreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>

        {data && !isActive && (
          <p className="learn-readonly-notice" role="status">
            Profile status: {data.profile.status}. Boards and curriculum are
            read-only while your account is not active.
          </p>
        )}

        {loadError && (
          <div className="learn-alert" role="alert">
            <div>
              <strong>Learning space unavailable</strong>
              <p>{loadError}</p>
            </div>
            <button
              type="button"
              className="learn-button subtle"
              onClick={() => void load(true)}
            >
              Try again
            </button>
          </div>
        )}
        {notice && (
          <div
            className={`learn-alert ${noticeIsSuccess ? "success" : ""}`}
            role="status"
          >
            <p>{notice}</p>
            <button
              type="button"
              className="learn-button subtle"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {loading && !data ? (
          <div className="learn-loading" aria-label="Loading learning data">
            <div className="learn-skeleton" />
            <div className="learn-card learn-card-body">
              <div className="learn-stack">
                <div className="learn-skeleton" />
                <div className="learn-skeleton" />
                <div className="learn-skeleton" />
              </div>
            </div>
          </div>
        ) : data ? (
          <>
            {/* Top-level Learning Tabs */}
            <div
              className="portal-tabs"
              role="tablist"
              aria-label="Learning sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "board"}
                className={`portal-tab ${
                  activeTab === "board" ? "active" : ""
                }`}
                onClick={() => setActiveTab("board")}
              >
                <ClipboardList size={14} aria-hidden="true" />
                Lesson Board
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "resources"}
                className={`portal-tab ${
                  activeTab === "resources" ? "active" : ""
                }`}
                onClick={() => setActiveTab("resources")}
              >
                <BookOpen size={14} aria-hidden="true" />
                Curriculum Library
                {data.resources.length > 0 && (
                  <span className="portal-tab-badge">
                    {data.resources.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "reports"}
                className={`portal-tab ${
                  activeTab === "reports" ? "active" : ""
                }`}
                onClick={() => setActiveTab("reports")}
              >
                <FileText size={14} aria-hidden="true" />
                Student Reports
              </button>
            </div>

            {/* Lesson Picker (for Lesson Board & Student Reports tabs) */}
            {(activeTab === "board" || activeTab === "reports") && (
              <div className="learn-lesson-picker">
                <div className="learn-lesson-picker-control">
                  <label htmlFor="lesson-picker">Your lessons</label>
                  <select
                    id="lesson-picker"
                    value={selectedLessonId}
                    onChange={(event) => void selectLesson(event.target.value)}
                    disabled={!data.lessons.length}
                  >
                    <option value="" disabled>
                      {data.lessons.length
                        ? "Choose a lesson"
                        : "No lessons assigned"}
                    </option>
                    {data.lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {dateLabel(lesson.startsAt, lesson.studentTimezone)} ·{" "}
                        {lesson.title} — {lesson.studentName}
                        {lesson.status ? ` (${lesson.status})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedLesson ? (
                  <div className="learn-lesson-context">
                    <div className="learn-lesson-people">
                      <span className="pw-person-inline">
                        <ProfileAvatar
                          profileId={selectedLesson.studentId}
                          name={selectedLesson.studentName}
                          size={27}
                        />
                        <span>{selectedLesson.studentName}</span>
                      </span>
                      <span className="pw-person-inline">
                        <ProfileAvatar
                          profileId={selectedLesson.teacherId}
                          name={selectedLesson.teacherName}
                          size={27}
                        />
                        <span>{selectedLesson.teacherName}</span>
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <time>
                        {dateLabel(
                          selectedLesson.startsAt,
                          selectedLesson.studentTimezone
                        )}
                      </time>
                      <Link
                        href={`/classroom?lessonId=${encodeURIComponent(
                          selectedLesson.id
                        )}`}
                        className="learn-button primary"
                        style={{ textDecoration: "none" }}
                      >
                        <Video size={13} aria-hidden="true" /> Join Classroom
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className="learn-lesson-picker-note">
                    Lessons appear here when they are assigned to your account.
                  </p>
                )}
              </div>
            )}

            {/* Tab 1: Lesson Board */}
            {activeTab === "board" && (
              <LearningLiveBoard
                selectedLesson={selectedLesson}
                selectedBoard={selectedBoard}
                boardStatus={boardStatus}
                saveStatusText={saveStatusText}
                draft={draft}
                topicInput={topicInput}
                setTopicInput={setTopicInput}
                canEditBoard={canEditBoard}
                isConflict={conflictRef.current}
                conflictMessage={conflictMessage}
                isDirty={dirtyRef.current}
                onReplaceDraft={replaceDraft}
                onSaveBoard={() => void saveBoard()}
                onReloadBoard={reloadBoard}
                onKeepDraftForCopy={keepDraftForCopy}
                onAddTopic={addTopic}
                hasLessons={data.lessons.length > 0}
                recordings={lessonRecordings}
                canDownloadRecordings={canDownloadRecordings}
              />
            )}

            {/* Tab 2: Curriculum Library */}
            {activeTab === "resources" && (
              <LearningResourcesSection
                canReadResources={canReadResources}
                canEditResources={canEditResources}
                resourceFilter={resourceFilter}
                setResourceFilter={setResourceFilter}
                visibleResources={visibleResources}
                onOpenCreate={openCreate}
                onOpenEdit={openEdit}
                onSetArchiveTarget={setArchiveTarget}
                modalOpen={modalOpen}
                editingResource={editingResource}
                resourceDraft={resourceDraft}
                setResourceDraft={setResourceDraft}
                pendingFile={pendingFile}
                setPendingFile={setPendingFile}
                resourceBusy={resourceBusy}
                resourceError={resourceError}
                onCloseResourceModal={closeResourceModal}
                onSubmitResource={submitResource}
                archiveTarget={archiveTarget}
                archiving={archiving}
                onArchiveResource={archiveResource}
              />
            )}

            {/* Tab 3: Student Reports */}
            {activeTab === "reports" && (
              <LearningReportsSection
                selectedLesson={selectedLesson}
                reportMonth={reportMonth}
                setReportMonth={setReportMonth}
                reportBusy={reportBusy}
                reportError={reportError}
                setReportError={setReportError}
                onDownloadReport={downloadReport}
              />
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
