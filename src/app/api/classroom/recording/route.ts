import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, sameOrigin } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/academy/roles";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_RECORDING_BYTES = 50 * 1024 * 1024; // 50 MiB private storage cap
const ALLOWED_VIDEO_MIMES = new Set(["video/webm", "video/mp4"]);

function matchesVideoMagic(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 12) return false;
  const hex = (start: number, count: number) =>
    Buffer.from(bytes.slice(start, start + count)).toString("hex");
  if (mime === "video/webm") return hex(0, 4) === "1a45dfa3";
  if (mime === "video/mp4") return hex(4, 4) === "66747970";
  return false;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_RECORDING_BYTES + 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Recording exceeds the 50 MiB upload limit." }, { status: 413 });
  }

  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active academy access is required." }, { status: 403 });
    }
    const blocked = impersonationBlocked(profile);
    if (blocked) return blocked;

    const canRecord = await hasPermission(client, profile, "classroom.record");
    if (!canRecord) {
      return NextResponse.json({ error: "Only educators and administrators can upload lesson recordings." }, { status: 403 });
    }

    const form = await request.formData();
    const lessonId = String(form.get("lessonId") || "").trim();
    const file = form.get("file");

    if (!lessonId || !/^[a-zA-Z0-9_-]{1,100}$/.test(lessonId)) {
      return NextResponse.json({ error: "Invalid lesson selected." }, { status: 400 });
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No video recording file provided." }, { status: 400 });
    }

    if (file.size > MAX_RECORDING_BYTES) {
      return NextResponse.json({ error: "Recording exceeds the 50 MiB upload limit." }, { status: 413 });
    }

    const mime = (file.type || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_VIDEO_MIMES.has(mime)) {
      return NextResponse.json({ error: "Only WebM and MP4 video recordings are accepted." }, { status: 400 });
    }

    // Verify caller has authorized classroom access to this lesson
    const access = await client.rpc("pw_classroom_access", { p_lesson: lessonId, p_join: false });
    if (access.error || !access.data) {
      return NextResponse.json({ error: "Lesson not found or inaccessible." }, { status: 403 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesVideoMagic(bytes, mime)) {
      return NextResponse.json({ error: "Recording file contents do not match its declared video format." }, { status: 400 });
    }

    const ext = mime === "video/mp4" ? "mp4" : "webm";
    const fileName = `lesson_${lessonId}_${new Date().toISOString().slice(0, 10)}.${ext}`;

    // Store strictly inside private Supabase storage (pw-private) with RLS + signed URL access
    const reservation = await client.rpc("pw_reserve_file", {
      p_category: "lesson_recording",
      p_target: lessonId,
      p_name: fileName.slice(0, 200),
      p_mime: mime,
      p_bytes: file.size,
    });
    if (reservation.error || !reservation.data) {
      return NextResponse.json({ error: "You cannot attach a recording to this lesson." }, { status: 403 });
    }

    const { id: fileId, path } = reservation.data as { id: string; path: string };
    const upload = await client.storage.from("pw-private").upload(path, bytes, {
      contentType: mime,
      upsert: false,
    });
    const finished = upload.error
      ? null
      : await client.rpc("pw_finish_recording_file", { p_id: fileId });

    if (upload.error || finished?.error) {
      await client.storage.from("pw-private").remove([path]).catch(() => undefined);
      await client.rpc("pw_abort_file", { p_id: fileId });
      return NextResponse.json({ error: "Recording upload could not be finalized. Please retry." }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      message: "Lesson recording saved securely to private academy storage.",
      fileId,
      recordingUrl: `/api/files?id=${encodeURIComponent(fileId)}`,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("Recording upload failed:", err);
    return NextResponse.json({ error: "Recording upload failed. Please try again." }, { status: 500 });
  }
}
