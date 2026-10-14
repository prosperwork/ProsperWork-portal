export type Payload = Record<string, unknown>;

export type StudentRow = { id: string; payload: Payload };

export type PracticeRow = {
  id: string;
  student_id: string;
  created_by: string;
  started_at: string;
  resumed_at: string | null;
  seconds: number;
  status: "running" | "paused" | "complete";
  ended_at: string | null;
  game_score: number | null;
  game_total: number | null;
};

export type RequestKind = "song" | "tutor" | "message" | "class_not_started";
export type RequestStatus = "open" | "in_progress" | "resolved" | "rejected";

export type RequestRow = {
  id: string;
  student_id: string;
  lesson_id: string | null;
  kind: RequestKind;
  body: string;
  status: RequestStatus;
  created_at: string;
  handled_by: string | null;
};

export type ReplyRow = {
  id: string;
  request_id: string;
  created_by: string;
  body: string;
  created_at: string;
};

export type EvaluationRow = {
  id: string;
  student_id: string;
  educator_id: string;
  title: string;
  scores: Record<string, number>;
  notes: string;
  created_at: string;
};

export type RepertoireEvent = {
  student_id: string;
  song: string;
  operation: "plan" | "complete";
  created_at: string;
  educator_id: string;
};

export type LessonRow = { id: string; student_id: string; payload: Payload };

export type FileRow = {
  id: string;
  target_id: string;
  original_name: string;
  mime: string;
};

export type StudioData = {
  profile: {
    id: string;
    name: string;
    role: string;
    status: string;
    timezone?: string;
  };
  students: StudentRow[];
  practice: PracticeRow[];
  requests: RequestRow[];
  replies: ReplyRow[];
  evaluations: EvaluationRow[];
  lessons: LessonRow[];
  files: FileRow[];
  repertoire: RepertoireEvent[];
  serverNow: string;
};

export type JsonResult = Record<string, unknown>;

export const quizPrompts = [
  "How many quarter notes fit in one whole note?",
  "How many half notes fit in one whole note?",
  "How many beats are in a 3/4 measure?",
  "How many eighth notes fit in one whole note?",
  "How many semitones from C to C-sharp?",
  "How many eighth notes fit in one 3/4 measure?",
];

export const rubric = [
  ["rhythm", "Rhythm"],
  ["pitch", "Pitch"],
  ["technique", "Technique"],
  ["tone", "Tone"],
  ["musicality", "Musicality"],
  ["sight_reading", "Sight reading"],
  ["posture", "Posture"],
  ["practice_habits", "Practice habits"],
] as const;

export const mimeChoices = {
  audio: ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"],
  video: ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"],
};

export function roleKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

export function textValue(source: Payload, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function numberValue(source: Payload, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "string" &&
      value.trim() &&
      Number.isFinite(Number(value))
    )
      return Number(value);
  }
  return null;
}

export function studentName(student: StudentRow) {
  return (
    textValue(
      student.payload,
      "name",
      "fullName",
      "full_name",
      "displayName",
      "display_name"
    ) ?? "Student record"
  );
}

export function dateOfBirth(student: StudentRow) {
  return textValue(
    student.payload,
    "dob",
    "dateOfBirth",
    "date_of_birth",
    "birthDate",
    "birth_date"
  );
}

export function studentTimezone(student: StudentRow, fallback: string) {
  return (
    textValue(
      student.payload,
      "timezone",
      "timeZone",
      "studentTimezone",
      "student_timezone"
    ) ??
    fallback ??
    "UTC"
  );
}

export function avatarId(student: StudentRow) {
  return textValue(
    student.payload,
    "avatarFileId",
    "avatar_file_id",
    "avatarId",
    "avatar_id"
  );
}

export function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "S"
  );
}

export function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function localParts(date: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const find = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);
    return { year: find("year"), month: find("month"), day: find("day") };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }
}

export function ageOn(dob: string | null, now: Date, timezone: string): number | null {
  if (!dob) return null;
  const parsed = validDate(dob);
  if (!parsed) return null;
  const [year, month, day] = dob.slice(0, 10).split("-").map(Number);
  if (
    ![year, month, day].every(Number.isFinite) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const today = localParts(now, timezone);
  let age = today.year - year;
  if (today.month < month || (today.month === month && today.day < day))
    age -= 1;
  return age >= 0 && age < 125 ? age : null;
}

export function dayKey(date: Date, timezone: string) {
  const part = localParts(date, timezone);
  return `${part.year}-${String(part.month).padStart(2, "0")}-${String(
    part.day
  ).padStart(2, "0")}`;
}

export function completedPracticeStreak(
  rows: PracticeRow[],
  studentId: string,
  timezone: string,
  now: Date
) {
  const keys = new Set(
    rows
      .filter(
        (row) =>
          row.student_id === studentId &&
          row.status === "complete" &&
          row.seconds >= 60 &&
          row.ended_at
      )
      .map((row) => dayKey(new Date(row.ended_at as string), timezone))
  );
  const today = localParts(now, timezone);
  let cursor = Date.UTC(today.year, today.month - 1, today.day);
  if (!keys.has(new Date(cursor).toISOString().slice(0, 10)))
    cursor -= 86400000;
  let streak = 0;
  while (keys.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= 86400000;
  }
  return streak;
}

export function birthdayDaysAway(dob: string | null, now: Date, timezone: string) {
  if (!dob || !validDate(dob)) return null;
  const [, monthText, dayText] = dob.slice(0, 10).split("-");
  const month = Number(monthText),
    day = Number(dayText);
  if (!month || !day) return null;
  const today = localParts(now, timezone);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  let next = Date.UTC(today.year, month - 1, day);
  if (next < todayUtc) next = Date.UTC(today.year + 1, month - 1, day);
  const distance = Math.round((next - todayUtc) / 86400000);
  return distance >= 0 && distance <= 7 ? distance : null;
}

export function formatDate(value: string | null, timezone?: string) {
  if (!value) return "Date unavailable";
  const date = validDate(value);
  if (!date) return "Date unavailable";
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

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
      )}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(
        2,
        "0"
      )}`;
}

export function songsSummary(payload: Payload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const titles = value
        .map((item) =>
          typeof item === "string"
            ? item
            : item && typeof item === "object"
            ? textValue(item as Payload, "title", "name", "song")
            : null
        )
        .filter((item): item is string => Boolean(item));
      return titles.length
        ? titles.join(", ")
        : value.length === 0
        ? "0"
        : null;
    }
  }
  return null;
}

export function songIsListed(payload: Payload, keys: string[], song: string) {
  const sought = song.trim().toLowerCase();
  for (const key of keys) {
    const value = payload[key];
    if (
      Array.isArray(value) &&
      value.some((item) => {
        const title =
          typeof item === "string"
            ? item
            : item && typeof item === "object"
            ? textValue(item as Payload, "title", "name", "song")
            : null;
        return title?.trim().toLowerCase() === sought;
      })
    )
      return true;
    if (
      typeof value === "string" &&
      value
        .split(/[,;\n|]/)
        .some((item) => item.trim().toLowerCase() === sought)
    )
      return true;
  }
  return false;
}

export function dueLessons(lessons: LessonRow[], studentId: string, now: number) {
  return lessons.filter((lesson) => {
    if (lesson.student_id !== studentId) return false;
    const payload = lesson.payload;
    const startValue = textValue(
      payload,
      "startsAt",
      "starts_at",
      "startAt",
      "start_at",
      "scheduledAt",
      "scheduled_at"
    );
    const start = startValue ? Date.parse(startValue) : NaN;
    if (!Number.isFinite(start) || start > now) return false;
    const status = (textValue(payload, "status", "state") ?? "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (
      ["cancelled", "canceled", "complete", "completed", "no_show"].includes(
        status
      )
    )
      return false;
    const endValue = textValue(payload, "endsAt", "ends_at", "endAt", "end_at");
    if (endValue) {
      const end = Date.parse(endValue);
      return Number.isFinite(end) && now <= end;
    }
    const duration = numberValue(
      payload,
      "durationMinutes",
      "duration_minutes",
      "duration"
    );
    if (duration !== null && duration > 0)
      return now <= start + duration * 60000;
    return status === "in_progress" || status === "current";
  });
}

export function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function errorMessage(result: JsonResult, status: number) {
  if (typeof result.error === "string") return result.error;
  if (typeof result.message === "string") return result.message;
  return `The request could not be completed (${status}).`;
}

