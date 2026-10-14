import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { client, profile } = await identity();
    if (!profile || !["active", "on_leave"].includes(profile.status)) return NextResponse.json({ error: "Sign in with an active academy account." }, { status: 403 });
    const results = await Promise.all([
      client.from("pw_payments").select("payload"), client.from("pw_homework").select("payload"),
      client.from("pw_lessons").select("payload"), client.from("pw_reschedules").select("*").order("created_at", { ascending: false }),
      client.from("pw_files").select("id,category,target_id,original_name,mime,bytes,created_at,complete").eq("complete", true),
      client.from("pw_homework_reviews").select("homework_id,feedback,created_at"),
    ]);
    if (results.some((result) => result.error)) throw new Error("Workflow records could not be loaded.");
    return NextResponse.json({
      profile, payments: results[0].data?.map((row) => row.payload), homework: results[1].data?.map((row) => ({
        ...row.payload, feedback: results[5].data?.find((review) => review.homework_id === row.payload.id)?.feedback,
      })),
      lessons: results[2].data?.map((row) => row.payload), requests: results[3].data, files: results[4].data,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Workflow records could not be loaded." }, { status: 503 }); }
}
