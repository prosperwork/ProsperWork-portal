const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

let createClient;
try {
  createClient = require("@supabase/supabase-js").createClient;
} catch {
  createClient = require(path.resolve(process.cwd(), "portal/node_modules/@supabase/supabase-js")).createClient;
}

// Load portal/.env directly
const envPath = path.resolve(process.cwd(), "portal/.env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xuxgqomuxchbexwuxkhb.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Cannot run database integration test.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failedTests++;
  }
}

// -------------------------------------------------------------
// Unit Test 1: HMAC-SHA256 Signature Verification
// -------------------------------------------------------------
console.log("\n=== Test Suite 1: HMAC-SHA256 Webhook Signature Verification ===");

function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "sha256") return false;
  const signature = parts[1];
  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

const testAppSecret = "mock_meta_app_secret_99887766";
const testPayload = JSON.stringify({
  object: "page",
  entry: [
    {
      id: "100200300",
      time: 1731900000,
      changes: [
        {
          field: "leadgen",
          value: {
            leadgen_id: "lead_test_12345",
            page_id: "100200300",
            form_id: "form_test_888",
            created_time: 1731900000,
          },
        },
      ],
    },
  ],
});

const validSignatureHex = crypto
  .createHmac("sha256", testAppSecret)
  .update(testPayload, "utf8")
  .digest("hex");

const validHeader = `sha256=${validSignatureHex}`;
const tamperedHeader = `sha256=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;

assert(
  verifyMetaSignature(testPayload, validHeader, testAppSecret) === true,
  "Valid HMAC-SHA256 signature passes verification"
);
assert(
  verifyMetaSignature(testPayload, tamperedHeader, testAppSecret) === false,
  "Tampered / invalid HMAC-SHA256 signature is rejected"
);
assert(
  verifyMetaSignature(testPayload, null, testAppSecret) === false,
  "Missing signature header is rejected"
);
assert(
  verifyMetaSignature(testPayload + "tampered", validHeader, testAppSecret) === false,
  "Tampered payload body is rejected with mismatched signature"
);

// -------------------------------------------------------------
// Unit Test 2: Webhook GET Challenge Verification
// -------------------------------------------------------------
console.log("\n=== Test Suite 2: Webhook GET Challenge Handshake ===");

function handleWebhookChallenge(mode, token, challenge, configuredToken) {
  if (mode === "subscribe" && token && token === configuredToken) {
    return { status: 200, challenge };
  }
  return { status: 403, error: "Forbidden" };
}

const verifyToken = "my_custom_webhook_secret_token_2026";
const validChallenge = handleWebhookChallenge(
  "subscribe",
  verifyToken,
  "CHALLENGE_STRING_12345",
  verifyToken
);
assert(
  validChallenge.status === 200 && validChallenge.challenge === "CHALLENGE_STRING_12345",
  "Meta challenge handshake succeeds with valid mode & token"
);

const invalidChallenge = handleWebhookChallenge(
  "subscribe",
  "wrong_token",
  "CHALLENGE_STRING_12345",
  verifyToken
);
assert(
  invalidChallenge.status === 403,
  "Meta challenge handshake fails with 403 when verify_token does not match"
);

// -------------------------------------------------------------
// Unit Test 3: Normalization & Field Mapping Logic
// -------------------------------------------------------------
console.log("\n=== Test Suite 3: Lead Field Normalization & Question Mapping ===");

function normalizeLeadFieldData(fieldData, createdTime, platformOverride) {
  let fullName = "";
  let firstName = "";
  let lastName = "";
  let email = "";
  let phone = "";
  let childName = "";
  let instrument = "";
  let readiness = "";
  const customQuestions = {};

  for (const field of fieldData) {
    const key = (field.name || "").toLowerCase().trim();
    const value = (field.values?.[0] || "").trim();
    if (!value) continue;

    if (key === "full_name") {
      fullName = value;
    } else if (key === "first_name") {
      firstName = value;
    } else if (key === "last_name") {
      lastName = value;
    } else if (key === "email") {
      email = value.toLowerCase();
    } else if (key === "phone_number" || key === "phone") {
      phone = value;
    } else if (
      key.includes("child") ||
      key.includes("student") ||
      key.includes("kid") ||
      key.includes("learner")
    ) {
      childName = value;
      customQuestions[field.name] = value;
    } else if (
      key.includes("instrument") ||
      key.includes("course") ||
      key.includes("lesson_type")
    ) {
      instrument = value;
      customQuestions[field.name] = value;
    } else if (
      key.includes("ready") ||
      key.includes("interested") ||
      key.includes("start") ||
      key.includes("age")
    ) {
      readiness = value;
      customQuestions[field.name] = value;
    } else {
      customQuestions[field.name] = value;
    }
  }

  if (!fullName) {
    fullName = [firstName, lastName].filter(Boolean).join(" ");
  }
  if (!fullName) {
    fullName = "ProsperWork Meta Lead";
  }

  let platform = "fb";
  if (platformOverride === "ig" || platformOverride === "instagram") {
    platform = "ig";
  }

  return {
    fullName,
    email,
    phone,
    childName: childName || undefined,
    instrument: instrument || undefined,
    readiness: readiness || undefined,
    platform,
    customQuestions,
    createdTime,
  };
}

// Sample mock Meta lead payload matching real Instagram ad from user's Google Sheet
const mockFieldData = [
  { name: "full_name", values: ["Rotimi Adeyanju"] },
  { name: "phone_number", values: ["08132240320"] },
  { name: "email", values: ["rotimireubena@gmail.com"] },
  { name: "Are you ready to begin music lessons?", values: ["yes, i am ready"] },
  { name: "Preferred Instrument", values: ["Piano"] },
  { name: "Child or Learner's Age", values: ["7 years old"] },
];

const normalized = normalizeLeadFieldData(mockFieldData, "2026-11-17T02:40:28-05:00", "ig");

assert(normalized.fullName === "Rotimi Adeyanju", "Maps full_name correctly");
assert(normalized.email === "rotimireubena@gmail.com", "Maps email correctly");
assert(normalized.phone === "08132240320", "Maps phone number correctly");
assert(normalized.platform === "ig", "Preserves Instagram platform flag");
assert(normalized.readiness === "yes, i am ready", "Extracts readiness answer");
assert(normalized.instrument === "Piano", "Extracts instrument answer");
assert(
  normalized.customQuestions["Child or Learner's Age"] === "7 years old",
  "Preserves custom questions in customQuestions record"
);

// -------------------------------------------------------------
// Database Test 4: Idempotency & Duplicate Prevention
// -------------------------------------------------------------
async function runDatabaseTests() {
  console.log("\n=== Test Suite 4: Database Ingestion & Deduplication Constraints ===");

  const testMetaLeadId = `test_meta_lead_${Date.now()}`;
  const testFormId = "test_form_demo_001";

  try {
    // 1. Ingest test lead into pw_meta_leads
    const metaInsert1 = await db.from("pw_meta_leads").upsert(
      {
        id: testMetaLeadId,
        form_id: testFormId,
        page_id: "test_page_123",
        platform: "fb",
        field_data: mockFieldData,
        answers: normalized.customQuestions,
        sync_source: "manual",
        raw_payload: { test: true },
        created_time: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    assert(!metaInsert1.error, "First insertion into pw_meta_leads succeeds");

    // 2. Ingest corresponding lead into pw_leads
    const leadInsert1 = await db.from("pw_leads").upsert(
      {
        id: `lead_meta_${testMetaLeadId}`,
        meta_lead_id: testMetaLeadId,
        meta_form_id: testFormId,
        platform: "fb",
        payload: {
          id: `lead_meta_${testMetaLeadId}`,
          parentName: "Test Lead Name",
          email: "test.lead@example.com",
          phone: "+447000000000",
          childName: "Test Child",
          instrument: "Violin",
          source: "Meta - Facebook",
          status: "new",
          arrivedAt: new Date().toISOString(),
          owner: "Unassigned",
          notes: "Automated test lead",
          metaLeadId: testMetaLeadId,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "meta_lead_id" }
    );

    if (leadInsert1.error) console.error("leadInsert1 error:", leadInsert1.error);
    assert(!leadInsert1.error, "First insertion into pw_leads succeeds with meta_lead_id");

    // 3. Attempt duplicate insertion with same meta_lead_id
    const duplicateInsert = await db.from("pw_leads").upsert(
      {
        id: `lead_meta_${testMetaLeadId}`,
        meta_lead_id: testMetaLeadId,
        meta_form_id: testFormId,
        platform: "fb",
        payload: {
          id: `lead_meta_${testMetaLeadId}`,
          parentName: "Test Lead Name (Updated)",
          email: "test.lead@example.com",
          phone: "+447000000000",
          childName: "Test Child",
          instrument: "Violin",
          source: "Meta - Facebook",
          status: "new",
          arrivedAt: new Date().toISOString(),
          owner: "Unassigned",
          notes: "Automated test lead updated without duplicate creation",
          metaLeadId: testMetaLeadId,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "meta_lead_id" }
    );

    assert(!duplicateInsert.error, "Duplicate ingestion gracefully upserts on meta_lead_id conflict");

    // 4. Verify there is only ONE row with this meta_lead_id
    const { count } = await db
      .from("pw_leads")
      .select("id", { count: "exact", head: true })
      .eq("meta_lead_id", testMetaLeadId);

    assert(count === 1, `Exact count for meta_lead_id is 1 (prevented duplicate rows; got ${count})`);

    // 5. Clean up test record
    await db.from("pw_leads").delete().eq("meta_lead_id", testMetaLeadId);
    await db.from("pw_meta_leads").delete().eq("id", testMetaLeadId);
    console.log("  [CLEANUP] Test records cleaned up from database.");

  } catch (err) {
    console.error("Database test error:", err);
    failedTests++;
  }

  console.log("\n==========================================");
  console.log(`Test Results: ${passedTests} passed, ${failedTests} failed.`);
  console.log("==========================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDatabaseTests();
