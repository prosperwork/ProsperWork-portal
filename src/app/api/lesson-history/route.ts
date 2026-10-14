import { NextResponse } from "next/server";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
const schema = z.object({
  studentId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  page: z.coerce.number().int().min(1).max(100000),
});
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { client, profile } = await identity();
    if (!profile || !["active", "on_leave"].includes(profile.status)) return NextResponse.json({ error: "An active academy account is required." }, { status: 403 });
    const url = new URL(request.url);
    const parsed = schema.safeParse({ studentId: url.searchParams.get("studentId"), month: url.searchParams.get("month"), page: url.searchParams.get("page") || 1 });
    if (!parsed.success) return NextResponse.json({ error: "Select a child, month and valid page." }, { status: 400 });
    const { data, error } = await client.rpc("pw_lesson_history", { p_student: parsed.data.studentId, p_month: parsed.data.month, p_page: parsed.data.page });
    if (error) return NextResponse.json({ error: "This child's history is not available to your account." }, { status: error.code === "42501" ? 403 : 400 });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Lesson history could not be loaded." }, { status: 503 }); }
}
