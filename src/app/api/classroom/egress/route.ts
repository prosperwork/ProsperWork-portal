import { NextResponse } from "next/server";
import { EgressClient, EncodedFileOutput } from "livekit-server-sdk";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, sameOrigin } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/academy/roles";

export const runtime = "nodejs";

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const egressActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), lessonId: idSchema }).strict(),
  z.object({ action: z.literal("stop"), egressId: z.string().regex(/^[a-zA-Z0-9_-]{4,128}$/), lessonId: idSchema.optional() }).strict(),
  z.object({ action: z.literal("list"), lessonId: idSchema.optional() }).strict(),
]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { profile, client } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active academy access required." }, { status: 403 });
    }
    const blocked = impersonationBlocked(profile);
    if (blocked) return blocked;

    const canRecord = await hasPermission(client, profile, "classroom.record");
    if (!canRecord) {
      return NextResponse.json({ error: "Only educators and administrators can manage cloud recordings." }, { status: 403 });
    }

    const raw = await request.json().catch(() => null);
    const parsed = egressActionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid cloud recording request." }, { status: 400 });
    }

    const serverUrl = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;

    if (!serverUrl || !key || !secret) {
      return NextResponse.json({ error: "LiveKit server credentials are not configured." }, { status: 503 });
    }

    const httpUrl = serverUrl.replace("wss://", "https://");
    const egressClient = new EgressClient(httpUrl, key, secret);
    const input = parsed.data;

    if (input.action === "start") {
      const infoRes = await client.rpc("pw_classroom_egress_info", { p_lesson: input.lessonId });
      if (infoRes.error) {
        return NextResponse.json({ error: "You are not authorized to record this classroom." }, { status: 403 });
      }
      const authorizedRoomName = (infoRes.data as { roomName?: string | null } | null)?.roomName;
      if (!authorizedRoomName) {
        return NextResponse.json({ error: "Open the live classroom before starting cloud recording." }, { status: 409 });
      }

      const safeLessonToken = input.lessonId.replace(/[^a-zA-Z0-9_-]/g, "");
      const fileName = `livekit_lesson_${safeLessonToken}_${Date.now()}.mp4`;

      try {
        const info = await egressClient.startRoomCompositeEgress(authorizedRoomName, {
          file: new EncodedFileOutput({
            filepath: fileName,
          }),
        });

        const { error: metaErr } = await client.rpc("pw_set_lesson_egress", {
          p_lesson: input.lessonId,
          p_egress_id: info.egressId,
        });
        if (metaErr) {
          console.warn("[LiveKit Egress] Metadata sync failed:", metaErr.code);
        }

        return NextResponse.json({
          ok: true,
          egressId: info.egressId,
          status: info.status,
          message: "LiveKit Cloud server-side recording started.",
        }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (egressErr) {
        console.warn("[LiveKit Egress] Start failed:", egressErr);
        return NextResponse.json({
          ok: false,
          error: "Could not start cloud recording. Ensure cloud recording storage is configured.",
        }, { status: 400 });
      }
    }

    if (input.action === "stop") {
      if (profile.role !== "super_admin" && profile.role !== "owner") {
        if (!input.lessonId) {
          return NextResponse.json({ error: "lessonId is required to stop recording." }, { status: 400 });
        }
        const infoRes = await client.rpc("pw_classroom_egress_info", { p_lesson: input.lessonId });
        const roomName = (infoRes.data as { roomName?: string | null } | null)?.roomName;
        if (infoRes.error || !roomName) {
          return NextResponse.json({ error: "You are not authorized to stop this recording." }, { status: 403 });
        }
        const roomJobs = await egressClient.listEgress({ roomName });
        if (!roomJobs.some((job) => job.egressId === input.egressId)) {
          return NextResponse.json({ error: "Recording does not belong to this classroom." }, { status: 403 });
        }
      }

      const info = await egressClient.stopEgress(input.egressId);
      if (input.lessonId) {
        await client.rpc("pw_set_lesson_egress", { p_lesson: input.lessonId, p_egress_id: null });
      }
      return NextResponse.json({
        ok: true,
        egressId: info.egressId,
        status: info.status,
        message: "LiveKit Cloud recording stopped.",
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    // action === "list"
    if (profile.role !== "super_admin" && profile.role !== "owner") {
      if (!input.lessonId) {
        return NextResponse.json({ error: "Specify a lessonId to list classroom recordings." }, { status: 400 });
      }
      const infoRes = await client.rpc("pw_classroom_egress_info", { p_lesson: input.lessonId });
      const roomName = (infoRes.data as { roomName?: string | null } | null)?.roomName;
      if (infoRes.error || !roomName) {
        return NextResponse.json({ error: "You are not authorized to view recordings for this classroom." }, { status: 403 });
      }
      const list = await egressClient.listEgress({ roomName });
      return NextResponse.json({ ok: true, egressList: list }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const list = await egressClient.listEgress();
    return NextResponse.json({ ok: true, egressList: list }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    console.error("LiveKit Egress error:", cause);
    return NextResponse.json(
      { error: "Failed to communicate with LiveKit Egress." },
      { status: 500 },
    );
  }
}
