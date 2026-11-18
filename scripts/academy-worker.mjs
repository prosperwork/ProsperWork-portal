import { createClient } from "@supabase/supabase-js";
import { RoomServiceClient } from "livekit-server-sdk";
import { deliverEmail, safeEmailError } from "../src/lib/email/transport.mjs";
import { academyTick } from "../supabase/functions/_shared/academy-tick.mjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Academy worker misconfigured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const appUrl =
  process.env.APP_BASE_URL ||
  (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : null);

let stopping = false;
let roomService;
if (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
  const url = new URL(process.env.LIVEKIT_URL);
  if (url.protocol !== "wss:") throw new Error("LIVEKIT_URL must use wss");
  url.protocol = "https:";
  roomService = new RoomServiceClient(url.origin, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    requestTimeout: 10,
  });
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
console.log("Academy worker ready: shared bounded automation tick.");

let failures = 0;
while (!stopping) {
  try {
    await academyTick({
      client,
      roomService,
      appUrl,
      deliverEmail: process.env.SMTP_PASSWORD ? deliverEmail : null,
      safeEmailError,
    });
    failures = 0;
  } catch (err) {
    failures++;
    if (failures === 1 || failures % 10 === 0) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "UNKNOWN";
      const msg = err instanceof Error ? err.message : "Unexpected worker error";
      console.error(`Academy automation tick failed (${code}): ${msg}`);
    }
  }
  for (let i = 0; i < 30 && !stopping; i++) {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
