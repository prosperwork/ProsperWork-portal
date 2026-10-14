import { NextResponse } from "next/server";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
import { senderAliases, replyToAliases, smtpTransport, safeEmailError } from "@/lib/email/transport.mjs";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";

const validCategories = [
  "admin", "admissions", "support", "payments", "fees", "contact",
  "students", "registration", "finance", "billing", "technical",
  "official", "management"
] as const;

const schema = z.object({
  recipientType: z.enum(["staff", "family", "lead"]),
  recipientId: z.string().trim().min(1).max(100).regex(/^[\w-]+$/),
  fromCategory: z.enum(validCategories),
  subject: z.string().trim().min(1).max(160).refine((value) => !/[\r\n]/.test(value)),
  message: z.string().trim().min(1).max(10000),
}).strict();

const allowedRoles: Record<z.infer<typeof schema>["recipientType"], Role[]> = {
  staff: ["super_admin", "general_manager", "head_admin", "hr"],
  family: ["super_admin", "general_manager", "head_admin", "admin"],
  lead: ["super_admin", "general_manager", "head_admin", "admin", "sales_marketing"],
};

function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  try {
    const { client, user, profile } = await identity();
    if (!profile || profile.status !== "active" || !user?.email_confirmed_at) {
      return NextResponse.json({ error: "An active, verified academy account is required." }, { status: 403 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Check the recipient, subject and message." }, { status: 400 });
    const input = parsed.data;
    if (!allowedRoles[input.recipientType].includes(profile.role)) {
      return NextResponse.json({ error: "You do not have permission to email this contact." }, { status: 403 });
    }
    if (!process.env.SMTP_PASSWORD) return NextResponse.json({ error: "Academy email is not configured." }, { status: 503 });

    let recipientEmail = "";
    if (input.recipientType === "staff") {
      const { data, error } = await client.from("pw_profiles")
        .select("id,email,role").eq("id", input.recipientId).maybeSingle();
      if (error || !data || data.role === "super_admin" || ["parent", "student"].includes(data.role)) {
        return NextResponse.json({ error: "This staff contact is unavailable." }, { status: 404 });
      }
      recipientEmail = data.email;
    } else if (input.recipientType === "family") {
      const { data, error } = await client.from("pw_students")
        .select("id,payload").eq("id", input.recipientId).maybeSingle();
      if (error || !data) return NextResponse.json({ error: "This family contact is unavailable." }, { status: 404 });
      const payload = data.payload as Record<string, unknown>;
      recipientEmail = typeof payload.parentEmail === "string" ? payload.parentEmail : "";
    } else {
      const { data, error } = await client.from("pw_leads")
        .select("id,owner_id,payload").eq("id", input.recipientId).maybeSingle();
      if (error || !data || (profile.role === "sales_marketing" && data.owner_id !== profile.id)) {
        return NextResponse.json({ error: "This enquiry is unavailable." }, { status: 404 });
      }
      const payload = data.payload as Record<string, unknown>;
      recipientEmail = typeof payload.email === "string" ? payload.email : "";
    }

    if (!validEmail(recipientEmail)) {
      return NextResponse.json({ error: "This contact has no valid email address." }, { status: 400 });
    }
    const from = senderAliases[input.fromCategory];
    if (!from) return NextResponse.json({ error: "The selected sender address is unavailable." }, { status: 400 });

    const replyTo = replyToAliases[input.fromCategory] || replyToAliases.default;

    const signature = `\n\n--\nProsperWork Music Academy\nWebsite: https://www.prosperworkmusic.com\nStudent Support: support@prosperworkmusic.com`;

    const result = await smtpTransport().sendMail({
      from: { name: "ProsperWork Music Academy", address: from },
      replyTo,
      to: recipientEmail.trim(),
      subject: input.subject,
      text: `${input.message}${signature}`,
    });
    if (!result.accepted?.length) return NextResponse.json({ error: "The email provider did not accept this message." }, { status: 502 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = safeEmailError(error);
    return NextResponse.json({
      error: code === "NOT_CONFIGURED" ? "Academy email is not configured." : "The email could not be sent. Check the address and try again.",
    }, { status: code === "NOT_CONFIGURED" ? 503 : 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
