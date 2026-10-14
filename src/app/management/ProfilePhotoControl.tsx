"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Camera } from "lucide-react";

type ProfileResponse = { profile?: { id: string; name: string; avatar_file_id?: string | null }; avatarUrl?: string | null; error?: string };

export default function ProfilePhotoControl({ userId, name, onPhoto }: { userId: string; name: string; onPhoto?: (url: string | null) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/profile", { credentials: "include", cache: "no-store" });
      const result = await response.json() as ProfileResponse;
      if (!response.ok) throw new Error(result.error || "Photo unavailable.");
      const next = result.avatarUrl || null;
      setUrl(next); onPhoto?.(next);
    } catch { setUrl(null); onPhoto?.(null); }
  }, [onPhoto]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 90_000); return () => window.clearInterval(timer); }, [refresh]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a PNG or JPEG up to 5 MiB."); return;
    }
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.set("category", "avatar"); form.set("targetId", userId); form.set("note", "Profile photo"); form.set("file", file);
      const response = await fetch("/api/files", { method: "POST", credentials: "include", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) throw new Error(result.error || "Photo upload failed.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Photo upload failed."); }
    finally { setBusy(false); }
  }
  return <div className="mw-photo-control">
    {url ? <img className="mw-photo" src={url} alt={`${name} profile`} onError={() => { setUrl(null); window.setTimeout(() => void refresh(), 1000); }} /> : <span className="mw-photo" aria-label={`${name} initials`}>{initials}</span>}
    <label className="mw-button" aria-disabled={busy} title="Update your profile photo"><Camera size={14} /> {busy ? "Uploading…" : "Photo"}<input className="mw-file" type="file" accept="image/png,image/jpeg" disabled={busy} onChange={upload} /></label>
    {error && <span role="alert" className="mw-hint">{error}</span>}
  </div>;
}
