import type { LearningResource, LearningResponse, LessonRecording, LiveBoard } from "@/lib/academy/learning";

export type LearningLesson = LearningResponse["lessons"][number];
export type { LessonRecording };

export type ResourceRow = { payload: LearningResource; revision: number };

export type ResourceDraft = {
  title: string;
  type: LearningResource["type"];
  instrument: string;
  level: string;
  summary: string;
};

export type BoardDraft = {
  notes: string;
  nextTopics: string;
  completedTopics: string[];
};

export type PendingBoardPost = {
  lessonId: string;
  revision: number;
  notes: string;
  nextTopics: string;
  completedTopics: string[];
};

export const blankResource: ResourceDraft = {
  title: "",
  type: "song",
  instrument: "",
  level: "",
  summary: "",
};

export const supportedFileMimes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
];

export const supportedFileExtensions = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "mp4",
  "webm",
  "mp3",
  "wav",
  "ogg",
];

export function roleKey(role: string): string {
  return role.toLowerCase().replace(/[\s-]+/g, "_");
}

export function dateLabel(value: string, timezone?: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time to be confirmed";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
}

export function localMonth(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}
