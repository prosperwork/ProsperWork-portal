import { NextResponse } from "next/server";
import { z } from "zod";
import { provisioningClient, sameOrigin, sessionClient } from "@/lib/supabase/server";
import{publicAppUrl}from"@/lib/supabase/app-url.mjs";
import { PARENT_TERMS_VERSION, PRIVACY_POLICY_VERSION } from "@/lib/legal/consent-versions";

const fields = z.object({
  action: z.enum(["login", "register", "reset", "updatePassword", "logout"]),
  email: z.string().trim().min(3).max(254).optional(),
  password: z.string().max(128).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  legalAcceptance: z.object({
    accepted: z.literal(true),
    termsVersion: z.literal(PARENT_TERMS_VERSION),
    privacyVersion: z.literal(PRIVACY_POLICY_VERSION),
  }).strict().optional(),
}).strict();

export async function POST(request: Request) {
  if (!sameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "This request must come from the academy website." }, { status: 403 });
  }
  const parsed = fields.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check your form entries." }, { status: 400 });
  const { action, email, password, name, legalAcceptance } = parsed.data;
  if(["register","reset"].includes(action)&&!z.string().email().safeParse(email).success)return NextResponse.json({error:"Enter a valid email address."},{status:400});
  if (["login", "register", "reset"].includes(action) && !email) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
  if (["register", "updatePassword"].includes(action) && (!password || password.length < 12)) {
    return NextResponse.json({ error: "Choose a password with at least 12 characters." }, { status: 400 });
  }
  if (action === "register" && !legalAcceptance) {
    return NextResponse.json({ error: "Accept the Parent Terms and Privacy Policy before creating an account." }, { status: 400 });
  }
  try {
    const client = await sessionClient();
    if (action === "logout") {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      return NextResponse.json({ ok: true, redirect: "/login" });
    }
    if (action === "login") {
      if (!password) return NextResponse.json({ error: "Enter your password." }, { status: 400 });
      let loginEmail=email!;
      if(!email!.includes("@")){
        const lookup=await provisioningClient().rpc("pw_login_email_for_username",{p_username:email!.trim()});
        if(lookup.error||typeof lookup.data!=="string"||!lookup.data)return NextResponse.json({error:"Sign-in failed. Check your details and email verification."},{status:401});
        loginEmail=lookup.data;
      }
      const { error } = await client.auth.signInWithPassword({ email: loginEmail, password });
      if (error) return NextResponse.json({ error: "Sign-in failed. Check your details and email verification." }, { status: 401 });
      // Root proxy runs account/role validation after establishing the session.
      return NextResponse.json({ ok: true, redirect: "/welcome" });
    }
    if (action === "register") {
      if (!name) return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
      const { data, error } = await client.auth.signUp({
        email: email!, password: password!,
        options: { data: { name }, emailRedirectTo: publicAppUrl("/auth/confirm").href },
      });
      if (error) return NextResponse.json({ error: "Registration could not be completed. Try again later or contact the academy." }, { status: 400 });
      const createdUser = data.user;
      if (createdUser?.identities?.some(identity => identity.provider === "email")) {
        const admin = provisioningClient();
        const consent = await admin.from("pw_signup_consents").insert({
          user_id: createdUser.id,
          terms_version: legalAcceptance!.termsVersion,
          privacy_version: legalAcceptance!.privacyVersion,
        });
        if (consent.error) {
          await admin.auth.admin.deleteUser(createdUser.id).catch(() => undefined);
          return NextResponse.json({ error: "Registration could not be completed. Try again later or contact the academy." }, { status: 503 });
        }
      }
      return NextResponse.json({ ok: true, message: "Check your email to confirm your account. Academy access requires activation." });
    }
    if (action === "reset") {
      const normalizedEmail = email!.trim().toLowerCase();
      const admin = provisioningClient();

      // Check attempts in rolling 1-hour window
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: attempts } = await admin
        .from("pw_password_reset_attempts")
        .select("created_at")
        .eq("email", normalizedEmail)
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: true });

      const recentAttempts = attempts || [];

      // 1. Max 5 attempts in 1 hour rule:
      if (recentAttempts.length >= 5) {
        const oldestAttempt = new Date(recentAttempts[0].created_at).getTime();
        const unlockTime = oldestAttempt + 60 * 60 * 1000;
        const remainingSeconds = Math.max(1, Math.ceil((unlockTime - Date.now()) / 1000));
        return NextResponse.json({
          error: "You have requested 5 reset codes in a row. For your protection, please wait 1 hour before requesting another.",
          rateLimited: true,
          maxAttemptsReached: true,
          retryAfter: remainingSeconds,
        }, { status: 429 });
      }

      // 2. 2-minute cooldown between individual requests:
      if (recentAttempts.length > 0) {
        const lastAttempt = new Date(recentAttempts[recentAttempts.length - 1].created_at).getTime();
        const nextAllowed = lastAttempt + 120 * 1000;
        const cooldownRemaining = Math.ceil((nextAllowed - Date.now()) / 1000);
        if (cooldownRemaining > 0) {
          return NextResponse.json({
            error: "A reset email was requested recently. Please wait before requesting another.",
            rateLimited: true,
            retryAfter: cooldownRemaining,
          }, { status: 429 });
        }
      }

      const targetUrl = publicAppUrl("/auth/confirm");
      targetUrl.searchParams.set("next", "/reset-password");
      const { error } = await client.auth.resetPasswordForEmail(email!, {
        redirectTo: targetUrl.href,
      });

      if (error) {
        const isRateLimit = (error as { status?: number; code?: string }).status === 429
          || (error as { status?: number; code?: string }).code === "over_email_send_rate_limit"
          || (typeof error.message === "string" && error.message.toLowerCase().includes("rate limit"));
        if (isRateLimit) {
          return NextResponse.json({
            error: "A reset email was sent recently. For security, please wait before requesting another.",
            rateLimited: true,
            retryAfter: 120,
          }, { status: 429 });
        }
        return NextResponse.json({ error: "The reset request could not be sent. Please try again later." }, { status: 400 });
      }

      // Record this attempt in database
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      await admin.from("pw_password_reset_attempts").insert({
        email: normalizedEmail,
        ip: clientIp,
      });

      const nextCount = recentAttempts.length + 1;
      const isMaxReached = nextCount >= 5;
      return NextResponse.json({
        ok: true,
        message: isMaxReached
          ? "Password reset email sent. You have reached the limit of 5 requests for this hour. Please wait 1 hour before requesting another."
          : "If an account exists, a password reset email will be sent. Check your inbox and spam folder.",
        retryAfter: isMaxReached ? 3600 : 120,
        maxAttemptsReached: isMaxReached,
      });
    }
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Open a valid recovery link before changing your password." }, { status: 401 });
    const { error } = await client.auth.updateUser({ password });
    if (error) return NextResponse.json({ error: "Your password could not be updated." }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Password updated.", redirect: "/" });
  } catch {
    return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
  }
}
