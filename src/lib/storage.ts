"use client";

import { useEffect, useRef, useState } from "react";
import type { AcademyData } from "./types";
import type { AcademyProfile } from "./supabase/identity";

const empty: AcademyData = {
  students: [],
  lessons: [],
  leads: [],
  payments: [],
  staff: [],
  payroll: [],
  resources: [],
  homework: [],
  expenses: [],
  audit: [],
};

const modules = [
  "students",
  "lessons",
  "leads",
  "payments",
  "payroll",
  "resources",
  "homework",
  "expenses",
] as const;

export interface Snapshot {
  data: AcademyData;
  revisions: Record<string, number>;
  profile: AcademyProfile;
}

const CACHE_KEY = "pw_academy_workspace_cache_v1";

export function clearAcademyCache() {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore storage access errors
    }
  }
}

export function getCachedWorkspace(): Snapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.data &&
      parsed.profile &&
      parsed.revisions &&
      Array.isArray(parsed.data.students) &&
      Array.isArray(parsed.data.lessons)
    ) {
      return parsed as Snapshot;
    }
  } catch {
    // Corrupted or inaccessible storage
  }
  return null;
}

function saveCachedSnapshot(snapshot: Snapshot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded or private browsing restrictions
  }
}

export function useAcademyData() {
  const [data, setData] = useState<AcademyData>(empty);
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState("");
  const snapshot = useRef<Snapshot | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);

  function accept(next: Snapshot, persist = true) {
    snapshot.current = next;
    setData(next.data);
    setProfile(next.profile);
    setReady(true);
    if (persist) {
      saveCachedSnapshot(next);
    }
  }

  async function reload() {
    setRevalidating(true);
    try {
      const response = await fetch("/api/academy", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          clearAcademyCache();
          window.location.replace("/login");
          return;
        }
        if (
          result.policyRequired ||
          result.error === "Policy acknowledgement required."
        ) {
          clearAcademyCache();
          window.location.replace("/onboarding");
          return;
        }
        throw new Error(result.error || "Records could not be loaded.");
      }
      accept(result, true);
      setError("");
    } catch (failure) {
      if (!snapshot.current) {
        setError(
          failure instanceof Error ? failure.message : "Records could not be loaded."
        );
      }
      setReady(true);
    } finally {
      setRevalidating(false);
    }
  }

  useEffect(() => {
    // 1. Immediately hydrate from client-side cache if present (0ms instant render)
    const cached = getCachedWorkspace();
    if (cached) {
      accept(cached, false);
    }

    // 2. Refresh from server in the background
    void reload();

    // 3. Periodic background revalidation
    const refresh = () => {
      if (document.visibilityState === "visible") void queue.current.then(reload);
    };
    const interval = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  function updateData(
    updater: (current: AcademyData) => AcademyData
  ): Promise<boolean> {
    pending.current++;
    const work = queue.current.then(async () => {
      if (!snapshot.current) {
        pending.current--;
        setError("Load the workspace before saving.");
        return false;
      }
      setSaving(true);
      setError("");
      try {
        const previous = snapshot.current;
        const next = updater(structuredClone(previous.data));
        if (
          JSON.stringify(next.staff) !== JSON.stringify(previous.data.staff)
        )
          throw new Error(
            "Manage staff accounts through authorized invitations and account controls."
          );
        const changes = [];
        for (const module of modules) {
          const old = new Map(
            previous.data[module].map((record) => [record.id, record])
          );
          for (const record of next[module]) {
            const before = old.get(record.id);
            if (!before || JSON.stringify(before) !== JSON.stringify(record))
              changes.push({
                module,
                operation: before ? "update" : "insert",
                record,
                revision: previous.revisions[`${module}:${record.id}`],
              });
          }
          if (
            previous.data[module].some(
              (record) => !next[module].some((item) => item.id === record.id)
            )
          )
            throw new Error(
              "Permanent deletion requires a separate owner confirmation workflow."
            );
        }
        // Client-authored audit entries are intentionally ignored.
        if (!changes.length) return true;
        const response = await fetch("/api/academy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "The change could not be saved.");
        accept(result, true);
        return true;
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "The change could not be saved."
        );
        return false;
      } finally {
        pending.current--;
        setSaving(pending.current > 0);
      }
    });
    queue.current = work;
    return work;
  }

  function afterSave(callback: () => void) {
    if (!pending.current) callback();
    else
      void queue.current.then((ok) => {
        if (ok === true) callback();
      });
  }

  return {
    data,
    profile,
    ready,
    saving,
    revalidating,
    error,
    updateData,
    reload,
    afterSave,
  };
}
