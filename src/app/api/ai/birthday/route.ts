import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { generateBirthdayTribute } from "@/lib/ai/groq";
import { checkRateLimit } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reply = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  try {
    const { client, profile } = await identity();
    if (!profile || !["active", "on_leave"].includes(profile.status)) {
      return reply("Sign in to access academy tools.", 403);
    }

    const rate = checkRateLimit(`bday:${profile.id}`, 10, 60000);
    if (!rate.allowed) {
      return reply(`Rate limit reached. Please wait ${rate.resetInSec} seconds before generating another tribute.`, 429);
    }

    if (["finance", "hr", "sales_marketing", "social_media"].includes(profile.role)) {
      return reply("Student celebration tools are restricted to instructional and management roles.", 403);
    }

    const body = await request.json().catch(() => ({}));
    const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";

    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(studentId)) {
      return reply("Choose a valid student.", 400);
    }

    const { data: student, error } = await client
      .from("pw_students")
      .select("payload")
      .eq("id", studentId)
      .maybeSingle();

    if (error || !student) {
      return reply("This student is not accessible to your account.", 404);
    }

    const s = student.payload;
    const age =
      typeof s.age === "number"
        ? s.age
        : s.dob
        ? Math.floor((Date.now() - new Date(s.dob).getTime()) / (365.25 * 24 * 3600 * 1000))
        : null;

    const tribute = await generateBirthdayTribute({
      name: s.name,
      age,
      instrument: s.instrument,
      rank: s.rank,
      songsDone: s.songsDone,
      teacherName: s.teacherName,
    });

    return NextResponse.json(
      {
        studentId,
        studentName: s.name,
        instrument: s.instrument,
        tribute,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return reply("Unable to generate birthday tribute at this time.", 500);
  }
}

