import { NextResponse } from "next/server";
import { EgressClient, EncodedFileOutput } from "livekit-server-sdk";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { profile, client } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active academy access required." }, { status: 403 });
    }

    const allowedRoles = ["super_admin", "admin", "head_admin", "qc", "teacher"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: "Only educators and administrators can manage cloud recordings." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { action, roomName, lessonId, egressId } = body;

    const serverUrl = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;

    if (!serverUrl || !key || !secret) {
      return NextResponse.json({ error: "LiveKit server credentials are not configured." }, { status: 503 });
    }

    // Convert wss:// to https:// for REST Egress Client
    const httpUrl = serverUrl.replace("wss://", "https://");
    const egressClient = new EgressClient(httpUrl, key, secret);

    if (action === "start") {
      if (!roomName || !lessonId) {
        return NextResponse.json({ error: "roomName and lessonId are required." }, { status: 400 });
      }

      // Start Cloud Room Composite Egress
      // Note: LiveKit Cloud records the room composite layout (all participants + audio)
      const fileName = `livekit_lesson_${lessonId}_${Date.now()}.mp4`;
      
      try {
        const info = await egressClient.startRoomCompositeEgress(roomName, {
          file: new EncodedFileOutput({
            filepath: fileName,
          }),
        });

        // Store active egress ID in lesson payload for tracking
        await client
          .from("pw_lessons")
          .update({
            payload: {
              activeEgressId: info.egressId,
              egressStartedAt: new Date().toISOString(),
            },
          })
          .eq("id", lessonId);

        return NextResponse.json({
          ok: true,
          egressId: info.egressId,
          status: info.status,
          message: "LiveKit Cloud server-side recording started.",
        });
      } catch (egressErr: any) {
        console.warn("[LiveKit Egress] Notice:", egressErr?.message);
        return NextResponse.json({
          ok: false,
          error: egressErr?.message || "Could not start LiveKit cloud egress. Ensure storage destination is configured in LiveKit Cloud console.",
        }, { status: 400 });
      }
    } else if (action === "stop") {
      if (!egressId) {
        return NextResponse.json({ error: "egressId is required." }, { status: 400 });
      }

      const info = await egressClient.stopEgress(egressId);
      return NextResponse.json({
        ok: true,
        egressId: info.egressId,
        status: info.status,
        message: "LiveKit Cloud recording stopped.",
      });
    } else if (action === "list") {
      const list = await egressClient.listEgress();
      return NextResponse.json({ ok: true, egressList: list });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (cause: any) {
    return NextResponse.json(
      { error: cause?.message || "Failed to communicate with LiveKit Egress." },
      { status: 500 }
    );
  }
}

