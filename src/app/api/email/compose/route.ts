import { NextResponse } from "next/server";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, sameOrigin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { senderAliases, replyToAliases, smtpTransport, safeEmailError } from "@/lib/email/transport.mjs";
import { hasPermission } from "@/lib/academy/roles";
import { fetchPublicAcademyConfig } from "@/lib/academy/catalogs";

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

const recipientPermissionMap: Record<z.infer<typeof schema>["recipientType"], string> = {
  staff: "email.compose_staff",
  family: "email.compose_family",
  lead: "email.compose_lead",
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
    const blocked = impersonationBlocked(profile);
    if (blocked) return blocked;
    const rate = checkRateLimit(`email-compose:${profile.id}`, 20, 60 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: `Email send limit reached. Please wait ${rate.resetInSec} seconds before sending another email.` },
        { status: 429 },
      );
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Check the recipient, subject and message." }, { status: 400 });
    const input = parsed.data;
    const canCompose = await hasPermission(client, profile, recipientPermissionMap[input.recipientType]);
    if (!canCompose) {
      return NextResponse.json({ error: "You do not have permission to email this contact." }, { status: 403 });
    }
    if (!process.env.SMTP_PASSWORD) return NextResponse.json({ error: "Academy email is not configured." }, { status: 503 });

    let recipientEmail = "";
    if (input.recipientType === "staff") {
      const { data, error } = await client.from("pw_profiles")
        .select("id,email,role").eq("id", input.recipientId).maybeSingle();
      if (error || !data || data.role === "super_admin" || data.role === "owner" || ["parent", "student"].includes(data.role)) {
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

    const academyConfig = await fetchPublicAcademyConfig(client);
    const from =
      (input.fromCategory === "admissions" && academyConfig.emails.admissions) ||
      (input.fromCategory === "support" && academyConfig.emails.support) ||
      ((input.fromCategory === "fees" || input.fromCategory === "payments" || input.fromCategory === "billing" || input.fromCategory === "finance") && academyConfig.emails.fees) ||
      senderAliases[input.fromCategory] ||
      academyConfig.emails.info ||
      "admin@prosperworkmusic.com";

    const replyTo =
      (input.fromCategory === "admissions" && academyConfig.emails.admissions) ||
      (input.fromCategory === "support" && academyConfig.emails.support) ||
      ((input.fromCategory === "fees" || input.fromCategory === "payments") && academyConfig.emails.fees) ||
      replyToAliases[input.fromCategory] ||
      academyConfig.emails.info;

    const signature = `\n\n--\nProsperWork Music Academy\nWebsite: https://www.prosperworkmusic.com\nStudent Support: ${academyConfig.emails.support}`;

    const transport = smtpTransport();
    try {
      const result = await transport.sendMail({
        from: { name: "ProsperWork Music Academy", address: from },
        replyTo,
        to: recipientEmail.trim(),
        subject: input.subject,
        text: `${input.message}${signature}`,
      });
      if (!result.accepted?.length) return NextResponse.json({ error: "The email provider did not accept this message." }, { status: 502 });
    } finally {
      transport.close();
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = safeEmailError(error);
    return NextResponse.json({
      error: code === "NOT_CONFIGURED" ? "Academy email is not configured." : "The email could not be sent. Check the address and try again.",
    }, { status: code === "NOT_CONFIGURED" ? 503 : 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
