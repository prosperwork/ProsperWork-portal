import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
import { uploadLessonRecordingToDrive } from "@/lib/calendar/recordings";

export const maxDuration = 300; // Allow sufficient time for larger full-length video uploads
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active academy access is required." }, { status: 403 });
    }

    // Role check: Only educators, admins, and QC can upload lesson recordings
    const allowedRoles = ["super_admin", "admin", "head_admin", "qc", "teacher"];
    if (!allowedRoles.includes(profile.role)) {
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

    // Verify user has access to this lesson
    const { data: lesson, error: lessonError } = await client
      .from("pw_lessons")
      .select("id, student_id, teacher_id, admin_id, payload")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      return NextResponse.json({ error: "Lesson not found or inaccessible." }, { status: 404 });
    }

    const fileName = `lesson_${lessonId}_${new Date().toISOString().slice(0, 10)}.webm`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload directly to Google Drive
    const uploadResult = await uploadLessonRecordingToDrive({
      lessonId,
      buffer,
      fileName,
      mimeType: file.type || "video/webm"
    });

    if (!uploadResult.success || !uploadResult.webViewLink) {
      return NextResponse.json({ error: uploadResult.error || "Failed to upload to Google Drive." }, { status: 502 });
    }

    // Update lesson payload with the Google Drive recording link
    const currentPayload = (lesson.payload || {}) as Record<string, unknown>;
    const updatedPayload = {
      ...currentPayload,
      recordingUrl: uploadResult.webViewLink,
      recordingDriveFileId: uploadResult.fileId,
      recordingUploadedAt: new Date().toISOString(),
      recordingUploadedBy: profile.name
    };

    const { error: updateError } = await client
      .from("pw_lessons")
      .update({ payload: updatedPayload, updated_at: new Date().toISOString() })
      .eq("id", lessonId);

    if (updateError) {
      console.warn("Could not attach recording link to lesson payload:", updateError);
    }

    // Also record file entry in pw_files for QC queue visibility
    try {
      await client.from("pw_files").insert({
        category: "lesson_recording",
        target_id: lessonId,
        uploader_id: profile.id,
        original_name: fileName,
        mime: file.type || "video/webm",
        bytes: file.size,
        path: uploadResult.webViewLink, // Store the Google Drive streaming link
        complete: true
      });
    } catch (pwFilesErr) {
      console.warn("Could not insert into pw_files:", pwFilesErr);
    }

    return NextResponse.json({
      ok: true,
      message: "Lesson recording uploaded to Google Drive successfully.",
      recordingUrl: uploadResult.webViewLink,
      fileId: uploadResult.fileId
    });
  } catch (err: any) {
    console.error("Recording upload failed:", err);
    return NextResponse.json({ error: err?.message || "Internal server error." }, { status: 500 });
  }
}

