import { getGoogleDriveClient } from "@/lib/calendar/google";
import { Readable } from "stream";

let cachedRecordingsFolderId: string | null = null;

async function getOrCreateRecordingsFolder(drive: any): Promise<string | null> {
  if (cachedRecordingsFolderId) return cachedRecordingsFolderId;

  try {
    const listRes = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and name = 'ProsperWork Lesson Recordings' and trashed = false",
      fields: "files(id, name)"
    });

    if (listRes.data.files && listRes.data.files.length > 0) {
      cachedRecordingsFolderId = listRes.data.files[0].id;
      return cachedRecordingsFolderId;
    }

    const createRes = await drive.files.create({
      requestBody: {
        name: "ProsperWork Lesson Recordings",
        mimeType: "application/vnd.google-apps.folder"
      },
      fields: "id, name"
    });

    cachedRecordingsFolderId = createRes.data.id || null;
    return cachedRecordingsFolderId;
  } catch (err) {
    console.error("[GoogleDrive] Error fetching/creating Lesson Recordings folder:", err);
    return null;
  }
}

export interface UploadRecordingParams {
  lessonId: string;
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
}

export interface UploadRecordingResult {
  success: boolean;
  fileId?: string;
  webViewLink?: string;
  webContentLink?: string;
  error?: string;
}

/**
 * Uploads a full-length lesson video recording directly to Google Drive
 * in the "ProsperWork Lesson Recordings" folder.
 */
export async function uploadLessonRecordingToDrive(
  params: UploadRecordingParams
): Promise<UploadRecordingResult> {
  try {
    const driveClient = getGoogleDriveClient();
    if (!driveClient?.drive) {
      return { success: false, error: "Google Drive integration is not configured." };
    }

    const { drive } = driveClient;
    const folderId = await getOrCreateRecordingsFolder(drive);

    const stream = new Readable();
    stream.push(params.buffer);
    stream.push(null);

    const uploadRes = await drive.files.create({
      requestBody: {
        name: params.fileName,
        parents: folderId ? [folderId] : [],
        description: `Class recording for Lesson ID: ${params.lessonId}`
      },
      media: {
        mimeType: params.mimeType || "video/webm",
        body: stream
      },
      fields: "id, name, webViewLink, webContentLink"
    });

    // Make file viewable by anyone with link or within academy
    try {
      if (uploadRes.data.id) {
        await (drive.permissions as any).create({
          fileId: uploadRes.data.id,
          requestBody: {
            role: "reader",
            type: "anyone"
          }
        });
      }
    } catch (permErr: any) {
      console.warn("[GoogleDrive] Permission notice for recording file:", permErr?.message);
    }


    return {
      success: true,
      fileId: uploadRes.data.id || undefined,
      webViewLink: uploadRes.data.webViewLink || undefined,
      webContentLink: uploadRes.data.webContentLink || undefined
    };
  } catch (err: any) {
    console.error("[GoogleDrive] Upload recording error:", err);
    return { success: false, error: err?.message || "Failed to upload recording to Drive." };
  }
}

