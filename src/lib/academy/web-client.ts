/**
 * Centralized Web & HTTP Client Utilities for ProsperWork Academy Portal
 * Eliminates duplicate readJson, error extraction, and date helpers across route pages.
 */

/**
 * Safely parses JSON from a Fetch Response. If parsing fails, returns error text.
 */
export async function readJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  const copy = response.clone();
  try {
    return (await response.json()) as T;
  } catch {
    const text = await copy.text().catch(() => "");
    return (text ? { error: text } : {}) as T;
  }
}

/**
 * Extracts a human-friendly error message from an API response object or fallback status.
 */
export function apiErrorMessage(
  result: Record<string, unknown> | null | undefined,
  status: number,
  fallback = "The request could not be completed"
): string {
  if (typeof result?.error === "string" && result.error.trim()) return result.error;
  if (typeof result?.message === "string" && result.message.trim()) return result.message;
  return `${fallback} (${status}).`;
}

/**
 * Formats an ISO string, date, or date-time into a readable localized format.
 */
export function formatDateLabel(value?: string | null, timezone?: string): string {
  if (!value) return "Not recorded";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: value.includes("T") ? "short" : undefined,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: value.includes("T") ? "short" : undefined,
    }).format(date);
  }
}

/**
 * Returns a local YYYY-MM-DDTHH:mm string suitable for <input type="datetime-local" />
 */
export function localDateTimeInput(date: Date = new Date(Date.now() + 60_000)): string {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

/**
 * Returns current date formatted as YYYY-MM-DD in local time
 */
export function isoToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

