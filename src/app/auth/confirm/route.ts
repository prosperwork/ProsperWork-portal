import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import{publicAppUrl}from"@/lib/supabase/app-url.mjs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const client = await sessionClient();
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const requestedNext = url.searchParams.get("next");
  const next = requestedNext === "/reset-password" || type === "recovery"
    ? "/reset-password"
    : requestedNext === "/hiring"
      ? "/hiring"
      : requestedNext === "/welcome" || type === "signup" || type === "email"
        ? "/welcome"
        : "/";
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(publicAppUrl(next), 303);
  } else if (hash && type && ["email", "signup", "invite", "recovery"].includes(type)) {
    const { error } = await client.auth.verifyOtp({ token_hash: hash, type: type as EmailOtpType });
    if (!error) return NextResponse.redirect(publicAppUrl(next), 303);
  }
  // Admin invitations may return tokens in the browser-only URL fragment.
  // A server route cannot read that fragment; preserve it through the redirect.
  if(!code&&!hash&&!url.searchParams.has("error")){
    const destination=publicAppUrl("/auth/finish");destination.searchParams.set("next",next);
    return NextResponse.redirect(destination,303);
  }
  return NextResponse.redirect(publicAppUrl("/login?confirmation=expired"), 303);
}
