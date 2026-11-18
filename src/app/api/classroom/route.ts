import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, sameOrigin } from "@/lib/supabase/server";
import { fetchRoleRecord } from "@/lib/academy/roles";

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const permissionKeySchema = z.enum(["piano", "whiteboard", "metronome", "tuner", "drone", "chat", "reactions"]);
const studentPermissionsPatchSchema = z.object({
  lessonId: idSchema,
  studentPermissions: z.object({
    piano: z.boolean().optional(),
    whiteboard: z.boolean().optional(),
    metronome: z.boolean().optional(),
    tuner: z.boolean().optional(),
    drone: z.boolean().optional(),
    chat: z.boolean().optional(),
    reactions: z.boolean().optional(),
  }).strict().optional(),
  feature: permissionKeySchema.optional(),
  enabled: z.boolean().optional(),
  studentFeaturesEnabled: z.boolean().optional(),
}).strict();
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
    const roleRecord = await fetchRoleRecord(client, profile.role);
    const isStaff = profile.role === "super_admin" || Boolean(roleRecord?.enabled && roleRecord.is_staff);
    const hasGrantPerm =
      profile.role === "super_admin" ||
      Boolean(roleRecord?.enabled && roleRecord.permissions.includes("classroom.grant_tools"));

    // Permission check: Roles with classroom.grant_tools (scoped to assigned admin for regular admin)
    const canGrantAccess = !asStudent && (
      profile.role === "super_admin" ||
      (profile.role === "admin" ? hasGrantPerm && profile.id === lessonRow?.admin_id : hasGrantPerm)
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
    const blocked = impersonationBlocked(profile);
    if (blocked) return blocked;
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
    const requestUrl = new URL(request.url);
    const asStudent = requestUrl.searchParams.get("as") === "student" || requestUrl.searchParams.get("role") === "student" || input.data.asRole === "student";
    const roleRecord = await fetchRoleRecord(client, profile.role);
    const isStaff = !asStudent && (profile.role === "super_admin" || Boolean(roleRecord?.enabled && roleRecord.is_staff));

    const { data: lessonRow } = await client.from("pw_lessons").select("admin_id, student_id, payload").eq("id", input.data.lessonId).single();
    const payload = (lessonRow?.payload || {}) as Record<string, unknown>;

    const hasGrantPerm =
      profile.role === "super_admin" ||
      Boolean(roleRecord?.enabled && roleRecord.permissions.includes("classroom.grant_tools"));
    const canGrantAccess = !asStudent && (
      profile.role === "super_admin" ||
      (profile.role === "admin" ? hasGrantPerm && profile.id === lessonRow?.admin_id : hasGrantPerm)
    );

    const isRestrictedRole = asStudent || !isStaff || ["student", "parent"].includes(String(profile.role || "").toLowerCase()) || profile.id === lessonRow?.student_id;
    const studentPermissions = resolveStudentPermissions(payload);
    const studentFeaturesEnabled = Object.values(studentPermissions).some(Boolean);

    const access = new AccessToken(key, secret, {
      identity: profile.id,
      name: profile.name,
      metadata: JSON.stringify({
        role: asStudent ? "student" : profile.role,
        isStaff: isStaff && !isRestrictedRole,
      }),
      attributes: {
        role: asStudent ? "student" : profile.role,
        isStaff: isStaff && !isRestrictedRole ? "true" : "false",
      },
      ttl,
    });
    const canRecord =
      profile.role === "super_admin" ||
      Boolean(roleRecord?.enabled && roleRecord.permissions.includes("classroom.record"));
    access.addGrant({
      roomJoin: true, room: data.roomName, roomAdmin: Boolean(data.host),
      canPublish: true, canSubscribe: true, canPublishData: true,
      canUpdateOwnMetadata: true, roomRecord: canRecord,
    });

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
    const blocked = impersonationBlocked(profile);
    if (blocked) return blocked;

    const rawBody = await request.json().catch(() => null);
    const parsed = studentPermissionsPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
    }
    const { lessonId, studentPermissions, feature, enabled, studentFeaturesEnabled } = parsed.data;

    const { data: lessonRow, error: fetchErr } = await client
      .from("pw_lessons")
      .select("id, admin_id, payload")
      .eq("id", lessonId)
      .single();

    if (fetchErr || !lessonRow) {
      return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    }

    const roleRecord = await fetchRoleRecord(client, profile.role);
    const hasGrantPerm =
      profile.role === "super_admin" ||
      Boolean(roleRecord?.enabled && roleRecord.permissions.includes("classroom.grant_tools"));
    const canGrantAccess =
      profile.role === "super_admin" ||
      (profile.role === "admin" ? hasGrantPerm && profile.id === lessonRow.admin_id : hasGrantPerm);

    if (!canGrantAccess) {
      return NextResponse.json(
        { error: "Only the assigned admin usher or super admin can grant student feature access." },
        { status: 403 }
      );
    }

    const currentPayload = (lessonRow.payload || {}) as Record<string, unknown>;
    const currentPerms = resolveStudentPermissions(currentPayload);

    let nextPerms: StudentPermissions = { ...currentPerms };

    if (studentPermissions) {
      for (const k of Object.keys(nextPerms) as (keyof StudentPermissions)[]) {
        if (typeof studentPermissions[k] === "boolean") {
          nextPerms[k] = studentPermissions[k]!;
        }
      }
    } else if (feature && typeof enabled === "boolean") {
      nextPerms[feature] = enabled;
    } else if (typeof studentFeaturesEnabled === "boolean") {
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
    }, { headers });
  } catch (cause) {
    console.error("PATCH /api/classroom error:", cause);
    return NextResponse.json({ error: "Could not update access." }, { status: 500 });
  }
}
