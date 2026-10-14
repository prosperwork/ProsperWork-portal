import { NextResponse } from "next/server";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), lessonId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), slots: z.array(z.string().datetime({ offset: true })).min(1).max(10), reason: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ action: z.literal("decide"), id: z.string().uuid(), decision: z.enum(["approve", "reject"]), selectedSlot: z.string().datetime({ offset: true }).optional(), note: z.string().max(4000).default("") }).strict().refine(d=>d.decision!=="reject"||d.note.trim().length>=5),
  z.object({action:z.literal("counter"),id:z.string().uuid(),slots:z.array(z.string().datetime({offset:true})).min(1).max(10),reason:z.string().trim().min(5).max(4000)}).strict(),
  z.object({action:z.literal("accept_counter"),id:z.string().uuid(),selectedSlot:z.string().datetime({offset:true})}).strict(),
]);
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") return NextResponse.json({ error: "An active academy account is required." }, { status: 403 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Provide a reason and valid proposed dates, or a valid approval decision." }, { status: 400 });
    const input = parsed.data;
    const result = input.action === "request"
      ? await client.rpc("pw_request_reschedule", { p_lesson: input.lessonId, p_slots: [...new Set(input.slots)], p_reason: input.reason })
      : input.action==="counter" ? await client.rpc("pw_counter_reschedule",{p_id:input.id,p_slots:[...new Set(input.slots)],p_reason:input.reason})
      : input.action==="accept_counter" ? await client.rpc("pw_accept_counter",{p_id:input.id,p_slot:input.selectedSlot})
      : await client.rpc("pw_decide_reschedule", { p_id: input.id, p_decision: input.decision, p_slot: input.selectedSlot || null, p_note: input.note });
    const messages: Record<string, string> = {
      PW001: "Requests and proposed slots must satisfy the academy’s configured notice period.",
      PW002: "The teacher must confirm a slot before an administrator can approve it.",
      PW003: "That slot conflicts with the teacher's calendar or exceeds the admin's class limit.",
      "23505": "A pending request already exists for this class.",
      "40001": "This request is no longer current. Refresh before continuing.",
      "22023": "Choose an offered future slot and provide the required reason.",
    };
    if (result.error) return NextResponse.json({ error: messages[result.error.code] || "Your account cannot make this change." }, { status: result.error.code === "42501" ? 403 : 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "The request could not be saved." }, { status: 400 }); }
}
