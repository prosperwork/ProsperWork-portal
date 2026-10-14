import { NextResponse } from "next/server";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
import { academySettingsSchema } from "@/lib/academy/settings";

export async function GET() {
  try {
    const { client, profile } = await identity();
    if (profile?.role !== "super_admin" || profile.status !== "active")
      return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
    const { data, error } = await client.from("pw_settings").select("settings,revision").eq("singleton", true).single();
    if (error || !data) return NextResponse.json({ error: "Academy settings are unavailable." }, { status: 503 });
    return NextResponse.json({
      profile, ...data,
      integrations: {
        livekitConfigured: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
        smtpConfigured: Boolean(process.env.SMTP_PASSWORD),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Settings could not be loaded." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { client, profile } = await identity();
    if (profile?.role !== "super_admin" || profile.status !== "active")
      return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
    const input = z.object({ revision: z.number().int().positive(), settings: academySettingsSchema }).strict().safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Check the values and allowed ranges." }, { status: 400 });
    const { data, error } = await client.rpc("pw_save_settings", { p_revision: input.data.revision, p_settings: input.data.settings });
    if (error) return NextResponse.json({ error: error.code === "40001" ? "Settings changed. Reload before saving." : "Settings could not be saved." }, { status: error.code === "40001" ? 409 : 400 });
    return NextResponse.json({ ok: true, revision: data });
  } catch { return NextResponse.json({ error: "Settings could not be saved." }, { status: 400 }); }
}
