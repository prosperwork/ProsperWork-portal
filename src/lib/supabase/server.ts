import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function sessionClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (values) => {
          for (const { name, value, options } of values) store.set(name, value, options);
        },
      },
    },
  );
}

// Never import this server-only module into client components.
export function provisioningClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const reqUrl = new URL(request.url);
    const hostMatch = originUrl.host === reqUrl.host || originUrl.host === request.headers.get("host");
    if (!hostMatch) return false;
    const isLocal = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
    if (process.env.NODE_ENV === "production" && !isLocal && originUrl.protocol !== "https:") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function timingSafeSecretMatch(
  provided: string | null | undefined,
  expected: string | null | undefined,
  minLength = 16,
): boolean {
  if (!provided || !expected || expected.length < minLength) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) && provided.length === expected.length;
}

function tokenSigningKey(purpose: string): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Application signing secret is not configured.");
  return createHmac("sha256", secret).update(`pw-token:${purpose}`).digest();
}

export function signCookieToken(purpose: string, payload: string): string {
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", tokenSigningKey(purpose)).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyCookieToken(purpose: string, token: string | undefined | null): string | null {
  if (!token || !token.includes(".")) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  try {
    const expectedSig = createHmac("sha256", tokenSigningKey(purpose)).update(encoded).digest("base64url");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function parseViewAsCookie(cookieValue: string | undefined | null, realAdminId: string): string | null {
  const raw = verifyCookieToken("view_as", cookieValue);
  if (!raw) return null;
  const [adminId, targetId] = raw.split(":");
  if (
    adminId !== realAdminId ||
    !targetId ||
    !/^[0-9a-f-]{36}$/i.test(targetId) ||
    targetId === realAdminId
  ) {
    return null;
  }
  return targetId;
}

export function createViewAsCookie(realAdminId: string, targetId: string): string {
  return signCookieToken("view_as", `${realAdminId}:${targetId}`);
}

export function createPasswordResetCookie(userId: string, ttlMs = 15 * 60 * 1000): string {
  return signCookieToken("pw_reset", `${userId}:${Date.now() + ttlMs}`);
}

export function verifyPasswordResetCookie(cookieValue: string | undefined | null, userId: string): boolean {
  const raw = verifyCookieToken("pw_reset", cookieValue);
  if (!raw) return false;
  const [id, expStr] = raw.split(":");
  const exp = Number(expStr);
  return id === userId && Number.isFinite(exp) && exp > Date.now();
}

export function impersonationBlocked(profile: { impersonated?: boolean } | null | undefined) {
  if (!profile?.impersonated) return null;
  return NextResponse.json(
    { error: "View-As mode is read-only. Exit View-As before making changes." },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  );
}
