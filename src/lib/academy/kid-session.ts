import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export interface SavedParent {
  id: string;
  child: string;
  session: string;
  access: string;
  refresh: string;
  until: number;
}

function baseSecret(): string {
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV !== "production" ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined);
  if (!secret) throw new Error("SESSION_SECRET must be configured.");
  return secret;
}

function cookieKey(): Buffer {
  return createHmac("sha256", baseSecret()).update("pw-kid-cookie-v2").digest();
}

function legacyPinKey(): Buffer {
  return createHash("sha256").update(baseSecret()).digest();
}

export function seal(value: SavedParent): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cookieKey(), iv);
  const bytes = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), bytes]).toString("base64url");
}

export function open(value: string): SavedParent | null {
  if (!value) return null;
  for (const k of [cookieKey(), legacyPinKey()]) {
    try {
      const b = Buffer.from(value, "base64url");
      if (b.length <= 28) return null;
      const d = createDecipheriv("aes-256-gcm", k, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      const saved = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString()) as SavedParent;
      if (saved.until > Date.now() && saved.id && saved.child && saved.session) return saved;
    } catch {
      // try legacy key
    }
  }
  return null;
}

export function pinDigest(pin: string, salt: string): string {
  const pepper = createHmac("sha256", baseSecret()).update("pw-family-pin-v2").digest("hex");
  return scryptSync(pin + pepper, salt, 64).toString("hex");
}

export function pinMatches(pin: string, salt: string, expected: string): boolean {
  const expectedBuf = Buffer.from(expected, "hex");
  const v2 = Buffer.from(pinDigest(pin, salt), "hex");
  if (v2.length === expectedBuf.length && timingSafeEqual(v2, expectedBuf)) return true;
  // Backwards-compatible check for PINs hashed before v2 key separation
  const legacy = Buffer.from(scryptSync(pin + legacyPinKey().toString("hex"), salt, 64).toString("hex"), "hex");
  return legacy.length === expectedBuf.length && timingSafeEqual(legacy, expectedBuf);
}

export function sessionId(token: string): string {
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  if (!/^[0-9a-f-]{36}$/i.test(claims.session_id || "")) throw new Error("Verified session required.");
  return claims.session_id as string;
}
