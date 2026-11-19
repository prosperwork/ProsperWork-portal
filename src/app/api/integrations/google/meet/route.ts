import { NextRequest, NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
import { createGoogleCalendarEvent } from "@/lib/calendar/google";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { profile } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active account required." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const summary = body.summary || "ProsperWork Music Academy - Trial Assessment";
    const startsAt = body.startsAt || new Date(Date.now() + 86400000).toISOString();
    const durationMinutes = Number(body.durationMinutes) || 45;
    const endIso = new Date(new Date(startsAt).getTime() + durationMinutes * 60000).toISOString();

    const calEvent = await createGoogleCalendarEvent({
      summary,
      description: body.description || "ProsperWork 1-on-1 trial assessment lesson.",
      startIso: startsAt,
      endIso,
      createMeetLink: true,
      attendeeEmails: body.attendeeEmails || [],
    });

    if (calEvent?.meetUrl) {
      return NextResponse.json({
        ok: true,
        meetUrl: calEvent.meetUrl,
        eventId: calEvent.eventId,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Calendar API rejected the request. The Google OAuth refresh token has expired (invalid_grant).",
      },
      { status: 502 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google Meet generation failed.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
