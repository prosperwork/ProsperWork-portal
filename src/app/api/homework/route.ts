import { NextResponse } from "next/server";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
const schema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), feedback: z.string().trim().min(1).max(4000) }).strict();
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") return NextResponse.json({ error: "An active academy account is required." }, { status: 403 });
    const input = schema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Select submitted homework and write feedback." }, { status: 400 });
    const { error } = await client.rpc("pw_review_homework", { p_id: input.data.id, p_feedback: input.data.feedback });
    return NextResponse.json(error ? { error: "Only an authorized educator can review submitted practice." } : { ok: true }, { status: error ? 403 : 200 });
  } catch { return NextResponse.json({ error: "The review could not be saved." }, { status: 400 }); }
}
