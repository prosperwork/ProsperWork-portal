"use client";

import { useEffect, useRef, useState } from "react";
import type { AcademyData } from "./types";
import type { AcademyProfile } from "./supabase/identity";

const empty: AcademyData = { students: [], lessons: [], leads: [], payments: [], staff: [], payroll: [], resources: [], homework: [], expenses: [], audit: [] };
const modules = ["students", "lessons", "leads", "payments", "payroll", "resources", "homework", "expenses"] as const;
interface Snapshot { data: AcademyData; revisions: Record<string, number>; profile: AcademyProfile }

export function useAcademyData() {
  const [data, setData] = useState<AcademyData>(empty);
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const snapshot = useRef<Snapshot | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  function accept(next: Snapshot) {
    snapshot.current = next; setData(next.data); setProfile(next.profile); setReady(true);
  }
  async function reload() {
    try {
      const response = await fetch("/api/academy", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        if (result.policyRequired || result.error === "Policy acknowledgement required.") {
          window.location.replace("/onboarding");
          return;
        }
        throw new Error(result.error || "Records could not be loaded.");
      }
      accept(result); setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Records could not be loaded.");
      setReady(true);
    }
  }
  useEffect(() => {
    void reload();
    // Background refresh goes through the same verified, scoped API.
    const refresh = () => { if (document.visibilityState === "visible") void queue.current.then(reload); };
    const interval = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  function updateData(updater: (current: AcademyData) => AcademyData): Promise<boolean> {
    pending.current++;
    const work = queue.current.then(async () => {
      if (!snapshot.current) { pending.current--; setError("Load the workspace before saving."); return false; }
      setSaving(true); setError("");
      try {
        const previous = snapshot.current;
        const next = updater(structuredClone(previous.data));
        if (JSON.stringify(next.staff) !== JSON.stringify(previous.data.staff)) throw new Error("Manage staff accounts through authorized invitations and account controls.");
        const changes = [];
        for (const module of modules) {
          const old = new Map(previous.data[module].map((record) => [record.id, record]));
          for (const record of next[module]) {
            const before = old.get(record.id);
            if (!before || JSON.stringify(before) !== JSON.stringify(record)) changes.push({
              module, operation: before ? "update" : "insert", record,
              revision: previous.revisions[`${module}:${record.id}`],
            });
          }
          if (previous.data[module].some((record) => !next[module].some((item) => item.id === record.id))) throw new Error("Permanent deletion requires a separate owner confirmation workflow.");
        }
        // Client-authored audit entries are intentionally ignored.
        if (!changes.length) return true;
        const response = await fetch("/api/academy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "The change could not be saved.");
        accept(result); return true;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "The change could not be saved.");
        return false;
      } finally { pending.current--; setSaving(pending.current > 0); }
    });
    queue.current = work;
    return work;
  }
  function afterSave(callback: () => void) {
    if (!pending.current) callback();
    else void queue.current.then((ok) => { if (ok === true) callback(); });
  }
  return { data, profile, ready, saving, error, updateData, reload, afterSave };
}
