import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { databaseClient } from "./database-client.mjs";

// Real development-provider/API test. Credentials and session cookies stay in memory.
if (!process.argv.includes("--development") || !process.env.REPLIT_DEV_DOMAIN) {
  console.error("Development configuration and --development are required.");
  process.exit(1);
}
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const db = databaseClient();
const email = `pw-test-${randomUUID()}@permissions-test.invalid`;
const password = randomBytes(36).toString("base64url");
const cookies = new Map();
let userId;
let checks = 0;
function passed(label) { checks++; console.log(`PASS ${label}`); }
async function request(path, body, origin = base) {
  const response = await fetch(new URL(path, base), {
    method: body ? "POST" : "GET", redirect: "manual",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...(cookies.size ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";")[0], separator = pair.indexOf("=");
    const name = pair.slice(0, separator), content = pair.slice(separator + 1);
    if (content) cookies.set(name, content); else cookies.delete(name);
  }
  return response;
}
try {
  let response = await request("/");
  assert.equal(response.status, 307); assert.match(response.headers.get("location"), /\/login$/); passed("Signed-out visitors are sent to sign-in");
  response = await request("/api/academy");
  assert.equal(response.status, 403); passed("Anonymous requests cannot read academy records");
  for (const path of ["/api/workflows", "/api/files?id=10000000-0000-0000-0000-000000000001", "/api/lesson-history?studentId=test-child&month=2026-10", "/api/settings", "/api/email", "/api/classroom?lessonId=test-lesson", "/api/payroll"]) {
    response = await request(path); assert.equal(response.status, 403); passed(`Anonymous access is blocked at ${path.split("?")[0]}`);
  }
  response = await request("/api/auth", { action: "logout" }, "https://foreign-origin.invalid");
  assert.equal(response.status, 403); passed("Cross-origin authentication changes are rejected");
  const settings = await fetch(new URL("/auth/v1/settings", process.env.NEXT_PUBLIC_SUPABASE_URL), { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY } });
  const provider = await settings.json();
  console.log(`Owner email confirmation safeguard available: ${provider.mailer_autoconfirm === false}`);
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Temporary API test account" } });
  if (error || !data.user) throw new Error("TEST_ACCOUNT_SETUP_FAILED");
  userId = data.user.id;
  response = await request("/api/auth", { action: "login", email, password });
  assert.equal(response.status, 200); passed("Real Supabase password sign-in creates session cookies");
  response = await request("/api/session");
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(session.profile.role, "parent"); assert.equal(session.profile.status, "pending"); passed("New accounts have pending parent access, not elevated roles");
  response = await request("/api/academy");
  assert.equal(response.status, 403); passed("A valid session does not bypass account activation");
  response = await request("/");
  assert.equal(response.status, 307); assert.match(response.headers.get("location"), /\/access-pending$/); passed("Pending accounts cannot enter the workspace");
  await db.connect();
  const fixture = await db.query("update public.pw_profiles set status='active',role='finance' where id=$1 and email=$2", [userId, email]);
  assert.equal(fixture.rowCount, 1);
  response = await request("/api/academy");
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.profile.role, "finance"); assert.ok(Array.isArray(snapshot.data.payments)); passed("Active users receive database-backed records under their actual role");
  response = await request("/api/workflows");
  assert.equal(response.status, 200);
  const workflows = await response.json();
  assert.equal(workflows.profile.role, "finance"); assert.equal(workflows.homework.length, 0); assert.equal(workflows.lessons.length, 0);
  passed("Finance's submission workspace does not expose teaching records");
  response=await request("/api/payroll?payDate=2026-10-28");
  assert.equal(response.status,200);
  const salaries=await response.json();
  assert.equal(salaries.profile.role,"finance");
  assert.equal(typeof salaries.rulesConfigured,"boolean");
  assert(Array.isArray(salaries.batches));
  assert(salaries.billingStudents.every(s=>Object.keys(s).every(k=>["id","name"].includes(k))));
  passed("Finance salary access returns scoped data without private child dossiers");
  response=await request("/api/payroll",{action:"generate",payDate:"2026-10-28"},"https://foreign-origin.invalid");
  assert.equal(response.status,403);passed("Cross-origin salary changes are rejected");
  for (const path of ["/api/settings", "/api/email", "/api/classroom?lessonId=test-lesson"]) {
    response = await request(path);assert.equal(response.status,403);passed(`Finance access is blocked at ${path.split("?")[0]}`);
  }
  response = await request("/api/classroom",{lessonId:"test-lesson"});
  assert.equal(response.status,403);passed("Finance cannot obtain a LiveKit join token");
  response = await request("/api/email/test",{});
  assert.equal(response.status,403);passed("Finance cannot send an owner SMTP test");
  response = await request("/api/classroom",{lessonId:"test-lesson"},"https://foreign-origin.invalid");
  assert.equal(response.status,403);passed("Cross-origin classroom token requests are rejected");
  response = await request("/api/homework", { id: "test-homework", feedback: "Unauthorized feedback" });
  assert.equal(response.status, 403); passed("Finance cannot review homework through the API");
  response = await request("/api/lesson-history?studentId=test-child&month=2026-10");
  assert.equal(response.status, 403); passed("Finance cannot read private lesson history through the API");
  response = await request("/api/reschedules", { action: "request", lessonId: "test-lesson", slots: [new Date(Date.now() + 86400000).toISOString()], reason: "Unauthorized request" });
  assert.equal(response.status, 403); passed("Finance cannot request a class move through the API");
  response = await request("/api/accounts");
  assert.equal(response.status, 403); passed("Finance cannot access owner account administration");
  response = await request("/api/academy", { changes: [{ module: "resources", operation: "insert", record: { id: `auth-test-${randomUUID()}`, title: "Unauthorized test", type: "guide", instrument: "Piano", level: "Beginner", summary: "" } }] });
  assert.equal(response.status, 403);
  const rejection = await response.json();
  assert.match(rejection.error, /database rejected/i); passed("User-scoped writes are rejected by database permissions");
  response = await request("/api/auth", { action: "logout" });
  assert.equal(response.status, 200);
  response = await request("/api/session");
  assert.equal(response.status, 401); passed("Sign-out clears the authenticated session");
  console.log(`${checks} authentication/API checks passed.`);
} catch {
  console.error("Authentication/API checks failed; no credentials or provider errors have been printed.");
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) { console.error("Temporary test account cleanup failed."); process.exitCode = 1; }
    else console.log("Temporary test account removed.");
  }
}
