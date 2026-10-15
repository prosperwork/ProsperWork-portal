import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export interface StudentPermissions {
  piano: boolean;
  whiteboard: boolean;
  metronome: boolean;
  tuner: boolean;
  drone: boolean;
  chat: boolean;
  reactions: boolean;
}

function resolveStudentPermissions(payload: Record<string, unknown>): StudentPermissions {
  const rawPerms = (payload.studentPermissions as Partial<StudentPermissions>) || {};
  return {
    piano: Boolean(rawPerms.piano),
    whiteboard: Boolean(rawPerms.whiteboard),
    metronome: Boolean(rawPerms.metronome),
    tuner: Boolean(rawPerms.tuner),
    drone: Boolean(rawPerms.drone),
    chat: Boolean(rawPerms.chat),
    reactions: Boolean(rawPerms.reactions),
  };
}

export async function GET(request: Request) {
  const urlObj = new URL(request.url);
  const parsed = idSchema.safeParse(urlObj.searchParams.get("lessonId"));
  if (!parsed.success) return NextResponse.json({ error: "Choose a class from your schedule." }, { status: 400 });
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") return NextResponse.json({ error: "Active academy access is required." }, { status: 403 });
    const { data, error } = await client.rpc("pw_classroom_access", { p_lesson: parsed.data, p_join: false });
    if (error) return NextResponse.json({ error: "You do not have access to this classroom." }, { status: error.code === "42501" ? 403 : 503 });

    // Fetch lesson payload, admin_id, and student_id
    const { data: lessonRow } = await client.from("pw_lessons").select("admin_id, student_id, payload").eq("id", parsed.data).single();
    const payload = (lessonRow?.payload || {}) as Record<string, unknown>;

    const asStudent = urlObj.searchParams.get("as") === "student" || urlObj.searchParams.get("role") === "student";
    const staffRoles = ["super_admin", "admin", "head_admin", "general_manager", "teacher", "qc"];
    const isStaff = staffRoles.includes(String(profile.role || "").toLowerCase());

    // Permission check: Only super_admin, head_admin, or the admin assigned to this student can grant features
    const canGrantAccess = !asStudent && (
      profile.role === "super_admin" ||
      (profile.role === "admin" && profile.id === lessonRow?.admin_id) ||
      profile.role === "head_admin"
    );

    const isRestrictedRole = asStudent || !isStaff || ["student", "parent"].includes(String(profile.role || "").toLowerCase()) || profile.id === lessonRow?.student_id;
    const studentPermissions = resolveStudentPermissions(payload);
    const studentFeaturesEnabled = Object.values(studentPermissions).some(Boolean);

    const enrichedData = {
      ...data,
      classroomProvider: payload.classroomProvider || "inbuilt",
      meetUrl: payload.meetUrl || undefined,
      userRole: asStudent ? "student" : profile.role,
      canGrantAccess,
      isRestrictedRole,
      studentFeaturesEnabled,
      studentPermissions,
    };

    return NextResponse.json(enrichedData, { headers });
  } catch { return NextResponse.json({ error: "Classroom details are unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") return NextResponse.json({ error: "Active academy access is required." }, { status: 403 });
    const bodyJson = await request.json().catch(() => ({}));
    const input = z.object({ lessonId: idSchema, asRole: z.string().optional() }).safeParse(bodyJson);
    if (!input.success) return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });
    const serverUrl = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
    if (!serverUrl || !key || !secret) return NextResponse.json({ error: "Live classes are not configured yet." }, { status: 503 });
    const url = new URL(serverUrl);
    if (url.protocol !== "wss:") return NextResponse.json({ error: "LiveKit requires a secure project WebSocket URL." }, { status: 503 });
    const { data, error } = await client.rpc("pw_classroom_access", { p_lesson: input.data.lessonId, p_join: true });
    if (error) return NextResponse.json({ error: error.code === "PW006" ? "This class is outside its permitted join window." : error.code === "PW429" ? "Too many join attempts. Wait one minute and try again." : "You do not have access to this classroom." }, { status: error.code === "PW006" ? 409 : error.code === "PW429" ? 429 : error.code === "42501" ? 403 : 503 });
    const ttl = Math.min(300, Math.floor((Date.parse(data.closesAt) - Date.now()) / 1000));
    if (ttl < 1) return NextResponse.json({ error: "This classroom has closed." }, { status: 409 });
    const access = new AccessToken(key, secret, { identity: profile.id, name: profile.name, ttl });
    const canRecord = ["super_admin", "admin", "head_admin", "qc", "teacher"].includes(profile.role);
    access.addGrant({
      roomJoin: true, room: data.roomName, roomAdmin: Boolean(data.host),
      canPublish: true, canSubscribe: true, canPublishData: true,
      canUpdateOwnMetadata: true, roomRecord: canRecord,
    });

    const { data: lessonRow } = await client.from("pw_lessons").select("admin_id, student_id, payload").eq("id", input.data.lessonId).single();
    const payload = (lessonRow?.payload || {}) as Record<string, unknown>;

    const requestUrl = new URL(request.url);
    const asStudent = requestUrl.searchParams.get("as") === "student" || requestUrl.searchParams.get("role") === "student" || input.data.asRole === "student";
    const staffRoles = ["super_admin", "admin", "head_admin", "general_manager", "teacher", "qc"];
    const isStaff = staffRoles.includes(String(profile.role || "").toLowerCase());

    const canGrantAccess = !asStudent && (
      profile.role === "super_admin" ||
      (profile.role === "admin" && profile.id === lessonRow?.admin_id) ||
      profile.role === "head_admin"
    );

    const isRestrictedRole = asStudent || !isStaff || ["student", "parent"].includes(String(profile.role || "").toLowerCase()) || profile.id === lessonRow?.student_id;
    const studentPermissions = resolveStudentPermissions(payload);
    const studentFeaturesEnabled = Object.values(studentPermissions).some(Boolean);

    return NextResponse.json({
      token: await access.toJwt(),
      serverUrl,
      roomName: data.roomName,
      closesAt: data.closesAt,
      lessonId: input.data.lessonId,
      canRecord,
      userRole: asStudent ? "student" : profile.role,
      canGrantAccess,
      isRestrictedRole,
      studentFeaturesEnabled,
      studentPermissions,
    }, { headers });
  } catch { return NextResponse.json({ error: "The classroom could not be opened." }, { status: 503 }); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") return NextResponse.json({ error: "Active academy access required." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const { lessonId, studentPermissions, feature, enabled, studentFeaturesEnabled } = body;
    if (!lessonId) {
      return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
    }

    const { data: lessonRow, error: fetchErr } = await client
      .from("pw_lessons")
      .select("id, admin_id, payload")
      .eq("id", lessonId)
      .single();

    if (fetchErr || !lessonRow) {
      return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    }

    // Strict role check: Only super_admin, head_admin, or the assigned admin for this lesson can grant student access
    const canGrantAccess =
      profile.role === "super_admin" ||
      (profile.role === "admin" && profile.id === lessonRow.admin_id) ||
      profile.role === "head_admin";

    if (!canGrantAccess) {
      return NextResponse.json(
        { error: "Only the assigned admin usher or super admin can grant student feature access." },
        { status: 403 }
      );
    }

    const currentPayload = (lessonRow.payload || {}) as Record<string, unknown>;
    const currentPerms = resolveStudentPermissions(currentPayload);

    let nextPerms: StudentPermissions = { ...currentPerms };

    if (studentPermissions && typeof studentPermissions === "object") {
      nextPerms = { ...nextPerms, ...studentPermissions };
    } else if (typeof feature === "string" && typeof enabled === "boolean" && feature in nextPerms) {
      nextPerms[feature as keyof StudentPermissions] = enabled;
    } else if (typeof studentFeaturesEnabled === "boolean") {
      // Toggle all at once
      for (const k of Object.keys(nextPerms) as (keyof StudentPermissions)[]) {
        nextPerms[k] = studentFeaturesEnabled;
      }
    }

    const hasAnyEnabled = Object.values(nextPerms).some(Boolean);

    const updatedPayload = {
      ...currentPayload,
      studentPermissions: nextPerms,
      studentFeaturesEnabled: hasAnyEnabled,
      studentFeaturesUpdatedBy: profile.name,
      studentFeaturesUpdatedAt: new Date().toISOString(),
    };

    const { error: updateErr } = await client
      .from("pw_lessons")
      .update({ payload: updatedPayload, updated_at: new Date().toISOString() })
      .eq("id", lessonId);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to update student access." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      studentPermissions: nextPerms,
      studentFeaturesEnabled: hasAnyEnabled,
    });
  } catch (cause: any) {
    return NextResponse.json({ error: cause?.message || "Could not update access." }, { status: 500 });
  }
}
