import { NextResponse } from "next/server";
import { createPasswordResetCookie, sessionClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { publicAppUrl } from "@/lib/supabase/app-url.mjs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const client = await sessionClient();
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const requestedNext = url.searchParams.get("next");
  const reason = url.searchParams.get("reason") || (type === "invite" ? "invite" : "");
  const isPasswordFlow = requestedNext === "/reset-password" || type === "recovery" || type === "invite";
  const next = isPasswordFlow
    ? (reason ? `/reset-password?reason=${encodeURIComponent(reason)}` : "/reset-password")
    : requestedNext === "/hiring"
      ? "/hiring"
      : requestedNext === "/welcome" || type === "signup" || type === "email"
        ? "/welcome"
        : "/";

  let verifiedUserId: string | null = null;
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error) verifiedUserId = data.user?.id ?? null;
  } else if (hash && type && ["email", "signup", "invite", "recovery"].includes(type)) {
    const { data, error } = await client.auth.verifyOtp({ token_hash: hash, type: type as EmailOtpType });
    if (!error) verifiedUserId = data.user?.id ?? null;
  }

  if (verifiedUserId) {
    const res = NextResponse.redirect(publicAppUrl(next), 303);
    if (isPasswordFlow) {
      res.cookies.set("pw_pw_reset", createPasswordResetCookie(verifiedUserId), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 900,
      });
    }
    return res;
  }

  // Admin invitations may return tokens in the browser-only URL fragment.
  // A server route cannot read that fragment; preserve it through the redirect.
  if (!code && !hash && !url.searchParams.has("error")) {
    const destination = publicAppUrl("/auth/finish");
    destination.searchParams.set("next", next);
    return NextResponse.redirect(destination, 303);
  }
  return NextResponse.redirect(publicAppUrl("/login?confirmation=expired"), 303);
}
