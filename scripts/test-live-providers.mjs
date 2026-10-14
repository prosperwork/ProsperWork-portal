import { RoomServiceClient } from "livekit-server-sdk";
import { smtpTransport, safeEmailError } from "../src/lib/email/transport.mjs";

let failed = false;
try {
  await smtpTransport().verify();
  console.log("PASS SMTP TLS connection and mailbox authentication; no email sent.");
} catch (error) {
  console.error(`FAIL SMTP connection: ${safeEmailError(error)}.`);
  failed = true;
}
try {
  const url = new URL(process.env.LIVEKIT_URL);
  if (url.protocol !== "wss:") throw new Error("INVALID_URL");
  url.protocol = "https:";
  const rooms = new RoomServiceClient(url.origin, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  await rooms.listRooms();
  console.log("PASS LiveKit authenticated server connection; no room or recording created.");
} catch {
  console.error("FAIL LiveKit connection. Check the project WebSocket URL, API key and matching API secret in Secrets.");
  failed = true;
}
process.exitCode = failed ? 1 : 0;
