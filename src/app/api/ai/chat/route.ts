import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, sameOrigin } from "@/lib/supabase/server";
import { generateAcademyChatResponse } from "@/lib/ai/groq";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { fetchRoleRecord } from "@/lib/academy/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reply = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return reply("Invalid request origin.", 403);
  }
  try {
    const { client, profile } = await identity();
    if (!profile || !["active", "on_leave"].includes(profile.status)) {
      return reply("Sign in to ask questions to the ProsperWork AI Assistant.", 403);
    }
    const blocked = impersonationBlocked(profile);
    if (blocked) return blocked;

    const rate = checkRateLimit(`chat:${profile.id}`, 15, 60000);
    if (!rate.allowed) {
      return reply(
        `Too many requests. Please wait ${rate.resetInSec} seconds before asking another question.`,
        429,
      );
    }

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return reply("Please provide a question.", 400);
    }

    if (message.length > 600) {
      return reply("Question is too long (maximum 600 characters).", 400);
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (item: unknown): item is { role: "user" | "assistant"; content: string } =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  "role" in item &&
                  "content" in item &&
                  (item.role === "user" || item.role === "assistant") &&
                  typeof item.content === "string" &&
                  item.content.trim().length > 0,
              ),
          )
          .slice(-6)
          .map((item: { role: "user" | "assistant"; content: string }) => ({
            role: item.role,
            content: item.content.trim().slice(0, 600),
          }))
      : [];

    const roleRecord = await fetchRoleRecord(client, profile.role);
    const answer = await generateAcademyChatResponse({
      message,
      history,
      role: profile.role,
      permissions: roleRecord?.enabled ? roleRecord.permissions : undefined,
      userName: profile.name,
    });

    return NextResponse.json(
      { reply: answer },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return reply("Unable to process your request at this time.", 500);
  }
}
