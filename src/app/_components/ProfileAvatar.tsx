"use client";

import { useEffect, useState } from "react";

type AvatarEntry = { url: string | null; refreshAt: number };
type AvatarSubscriber = (url: string | null) => void;
type AvatarRow = {
  id?: string;
  profileId?: string;
  profile_id?: string;
  userId?: string;
  user_id?: string;
  url?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  signedUrl?: string | null;
  signed_url?: string | null;
  expiresAt?: string | number;
  expires_at?: string | number;
};

const avatarCache = new Map<string, AvatarEntry>();
const subscribers = new Map<string, Set<AvatarSubscriber>>();
const queuedIds = new Set<string>();
const failedUrls = new Map<string, Set<string>>();
let flushQueued = false;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const defaultRefreshMs = 4 * 60_000;
const failureRetryMs = 60_000;
const requestBatchSize = 50;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function notify(id: string, url: string | null) {
  subscribers.get(id)?.forEach((listener) => listener(url));
}

function expiryTime(row?: AvatarRow | string | null): number | null {
  if (!row || typeof row === "string") return null;
  const value = row.expiresAt ?? row.expires_at;
  if (typeof value === "number")
    return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function urlExpiry(url: string | null) {
  if (!url) return null;
  try {
    const params = new URL(url, window.location.origin).searchParams;
    const epoch = params.get("Expires") ?? params.get("expires");
    if (epoch && /^\d+$/.test(epoch)) return Number(epoch) * 1000;
    const date = params.get("X-Amz-Date");
    const duration = params.get("X-Amz-Expires");
    if (date && duration) {
      const issued = Date.parse(
        `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(
          6,
          8
        )}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`
      );
      if (Number.isFinite(issued)) return issued + Number(duration) * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

function refreshAt(url: string | null, row?: AvatarRow | string | null) {
  const expiration = expiryTime(row) ?? urlExpiry(url);
  if (!expiration) return Date.now() + defaultRefreshMs;
  return Math.max(
    Date.now() + 5_000,
    Math.min(Date.now() + defaultRefreshMs, expiration - 30_000)
  );
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  let next = Number.POSITIVE_INFINITY;
  const now = Date.now();
  for (const [id, listeners] of subscribers) {
    if (!listeners.size || queuedIds.has(id)) continue;
    const entry = avatarCache.get(id);
    if (entry) next = Math.min(next, entry.refreshAt);
  }
  if (!Number.isFinite(next)) return;
  refreshTimer = setTimeout(() => {
    const due = Date.now();
    for (const [id, listeners] of subscribers) {
      const entry = avatarCache.get(id);
      if (listeners.size && entry && entry.refreshAt <= due + 250)
        queuedIds.add(id);
    }
    queueFlush();
  }, Math.max(1_000, next - now));
}

function queueFlush() {
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => {
    void flushBatch();
  });
}

function parseResponse(result: unknown, ids: string[]) {
  const source =
    result && typeof result === "object"
      ? (result as Record<string, unknown>).avatars ??
        (result as Record<string, unknown>).profiles ??
        (result as Record<string, unknown>).data ??
        (result as Record<string, unknown>).results
      : undefined;
  const mapped = new Map<
    string,
    { url: string | null; row?: AvatarRow | string | null }
  >();
  if (Array.isArray(source)) {
    for (const entry of source as AvatarRow[]) {
      const id =
        entry.id ??
        entry.profileId ??
        entry.profile_id ??
        entry.userId ??
        entry.user_id;
      if (!id || !ids.includes(id)) continue;
      mapped.set(id, {
        url:
          entry.url ??
          entry.avatarUrl ??
          entry.avatar_url ??
          entry.signedUrl ??
          entry.signed_url ??
          null,
        row: entry,
      });
    }
  } else if (source && typeof source === "object") {
    const object = source as Record<string, unknown>;
    for (const id of ids) {
      const value = object[id];
      if (typeof value === "string" || value == null)
        mapped.set(id, { url: value ?? null, row: value ?? null });
      else if (typeof value === "object") {
        const row = value as AvatarRow;
        mapped.set(id, {
          url:
            row.url ??
            row.avatarUrl ??
            row.avatar_url ??
            row.signedUrl ??
            row.signed_url ??
            null,
          row,
        });
      }
    }
  }
  return mapped;
}

async function flushBatch() {
  flushQueued = false;
  const ids = Array.from(queuedIds);
  queuedIds.clear();
  if (!ids.length) return;
  const retryAt = Date.now() + failureRetryMs;
  ids.forEach((id) => {
    avatarCache.set(id, {
      url: avatarCache.get(id)?.url ?? null,
      refreshAt: retryAt,
    });
  });
  const batches = Array.from(
    { length: Math.ceil(ids.length / requestBatchSize) },
    (_, index) =>
      ids.slice(index * requestBatchSize, (index + 1) * requestBatchSize)
  );
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const response = await fetch(
          `/api/profile/avatars?ids=${encodeURIComponent(batch.join(","))}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );
        if (!response.ok) throw new Error("Avatar request unavailable.");
        const result: unknown = await response.json();
        const rows = parseResponse(result, batch);
        for (const id of batch) {
          const row = rows.get(id);
          const url = row?.url ?? null;
          avatarCache.set(id, { url, refreshAt: refreshAt(url, row?.row) });
          notify(id, url);
        }
      } catch {
        for (const id of batch) {
          avatarCache.set(id, {
            url: null,
            refreshAt: Date.now() + failureRetryMs,
          });
          notify(id, null);
        }
      }
    })
  );
  scheduleRefresh();
}

function request(id: string) {
  queuedIds.add(id);
  const cached = avatarCache.get(id);
  if (cached)
    avatarCache.set(id, { ...cached, refreshAt: Date.now() + failureRetryMs });
  queueFlush();
}

function subscribe(id: string, listener: AvatarSubscriber) {
  let set = subscribers.get(id);
  if (!set) {
    set = new Set();
    subscribers.set(id, set);
  }
  set.add(listener);
  const cached = avatarCache.get(id);
  if (cached && cached.refreshAt > Date.now()) listener(cached.url);
  else request(id);
  scheduleRefresh();
  return () => {
    const current = subscribers.get(id);
    current?.delete(listener);
    if (!current?.size) subscribers.delete(id);
    scheduleRefresh();
  };
}

function failedImage(id: string, url: string) {
  const previous = failedUrls.get(id) ?? new Set<string>();
  if (previous.has(url)) {
    avatarCache.set(id, { url: null, refreshAt: Date.now() + failureRetryMs });
    notify(id, null);
    scheduleRefresh();
    return;
  }
  previous.add(url);
  failedUrls.set(id, previous);
  avatarCache.set(id, { url: null, refreshAt: Date.now() + failureRetryMs });
  notify(id, null);
  request(id);
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "·"
  );
}

export default function ProfileAvatar({
  profileId,
  name,
  size = 32,
  alt = "",
  className = "",
}: {
  profileId?: string | null;
  name: string;
  size?: number;
  alt?: string;
  className?: string;
}) {
  const id = profileId && isUuid(profileId) ? profileId : "";
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!id) return;
    return subscribe(id, setUrl);
  }, [id]);

  const initialsText = initials(name);
  const decorative = alt.length === 0;
  const fontSize = Math.max(10, Math.round(size * 0.38));
  return (
    <span
      className={`pw-profile-avatar${className ? ` ${className}` : ""}`}
      style={{
        width: size,
        height: size,
        fontSize,
        borderRadius: "50%",
        overflow: "hidden",
      }}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : alt}
    >
      {url && id ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => failedImage(id, url)}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            lineHeight: 1,
          }}
        >
          {initialsText}
        </span>
      )}
    </span>
  );
}
