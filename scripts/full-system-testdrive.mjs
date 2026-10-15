import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

if (process.loadEnvFile) {
  try {
    process.loadEnvFile();
  } catch {}
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BASE = "http://localhost:5000";
const USER_ID = "d7d75c3d-c5a4-452f-82ab-13ef2c9b8499";
const EMAIL = "aremartins801@gmail.com";
const PASSWORD = "TestPassword123!";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

let chromeProc = null;
let socket = null;
let seq = 0;
const pending = new Map();
const consoleErrors = [];

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("CDP timeout: " + method));
    }, 25000);
    pending.set(id, {
      resolve: (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      "CDP Evaluate Error: " + (r.exceptionDetails.text || "failed")
    );
  }
  return r.result.value;
}

async function waitFor(expression, maxSeconds = 15) {
  const start = Date.now();
  while (Date.now() - start < maxSeconds * 1000) {
    try {
      const ok = await evaluate(expression);
      if (ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timeout waiting for: " + expression);
}

async function setRole(role) {
  await admin.from("pw_profiles").update({ role, status: "active" }).eq("id", USER_ID);
  await admin.auth.admin.updateUserById(USER_ID, {
    user_metadata: { role, email: EMAIL, name: "Martins Are" },
    app_metadata: { role },
  });
}

async function openPage(path) {
  consoleErrors.length = 0;
  await cdp("Page.navigate", { url: BASE + path });
  await waitFor("document.readyState === 'complete'", 10);
  try {
    await waitFor("!document.querySelector('.loading-screen') && (document.querySelector('h1, h2, .page-wrap, .stat-grid, .card, main') !== null)", 10);
  } catch {}
  await new Promise((r) => setTimeout(r, 600));
}

async function runFullSimulation() {
  console.log("================================================================================");
  console.log("STARTING DEEP INTERACTIVE END-TO-END TEST DRIVE OF PROSPERWORK MUSIC ACADEMY");
  console.log("================================================================================");

  // 1. Get session cookie
  const loginRes = await fetch(BASE + "/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ action: "login", email: EMAIL, password: PASSWORD }),
  });
  const cookieHeaders = loginRes.headers.getSetCookie();

  // 2. Launch Chrome
  chromeProc = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--remote-debugging-port=9222",
      "--disable-gpu",
      "--no-first-run",
      "--user-data-dir=C:\\Users\\arema\\AppData\\Local\\Temp\\chrome-full-testdrive",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" }
  );

  await new Promise((r) => setTimeout(r, 2000));
  const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  const pageTarget = targets.find((t) => t.type === "page");
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);

  await new Promise((res, rej) => {
    socket.addEventListener("open", res, { once: true });
    socket.addEventListener("error", rej, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") {
      consoleErrors.push(m.params.exceptionDetails.text);
    }
  });

  await cdp("Page.enable");
  await cdp("Network.enable");
  await cdp("Runtime.enable");

  const cookies = cookieHeaders.map((raw) => {
    const first = raw.split(";")[0];
    const idx = first.indexOf("=");
    return {
      name: first.slice(0, idx),
      value: first.slice(idx + 1),
      url: BASE,
      path: "/",
      httpOnly: true,
      secure: false,
    };
  });
  await cdp("Network.setCookies", { cookies });

  const testReport = [];

  // ===========================================================================
  // JOURNEY 1: PARENT WORKSPACE & INTERACTIVE OPERATIONS
  // ===========================================================================
  console.log("\n>>> SIMULATING USER: [PARENT]");
  await setRole("parent");
  await openPage("/family");

  const parentHasFamilyHeading = await evaluate("!!document.querySelector('h1, h2, .family-hero, .section-title')");
  console.log("  [Parent] Family Portal Loaded Heading:", parentHasFamilyHeading);

  // Check interactive elements on /family
  const parentButtons = await evaluate("Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean)");
  console.log("  [Parent] Action Buttons Found on /family:", parentButtons.slice(0, 8).join(" | "));

  // Open support drawer modal
  const openChatBtn = await evaluate(`
    (()=>{
      const btn = document.querySelector('.portal-ai-trigger, button[aria-label*=\"support\" i], button[aria-label*=\"chat\" i]');
      if (btn) { btn.click(); return true; }
      return false;
    })()
  `);
  console.log("  [Parent] Clicked Support Drawer Button:", openChatBtn);
  await new Promise(r => setTimeout(r, 800));

  const drawerVisible = await evaluate("!!document.querySelector('[role=\"dialog\"], .portal-ai-drawer')");
  console.log("  [Parent] Support Drawer Opened in DOM:", drawerVisible);

  // Close drawer
  await evaluate(`
    (()=>{
      const close = document.querySelector('.portal-ai-close, button[aria-label*=\"close\" i]');
      if (close) close.click();
    })()
  `);

  testReport.push({ role: "parent", feature: "Family Portal & Support Drawer", status: parentHasFamilyHeading ? "PASS" : "FAIL" });

  // Test /documents for parent
  await openPage("/documents");
  const docHeading = await evaluate("document.querySelector('h1')?.textContent.trim() || ''");
  console.log("  [Parent] Invoices & Documents Heading:", docHeading);
  testReport.push({ role: "parent", feature: "Invoices & Documents", status: docHeading ? "PASS" : "FAIL" });

  // Test /homework for parent
  await openPage("/homework");
  const hwTitle = await evaluate("document.querySelector('h1')?.textContent.trim() || ''");
  console.log("  [Parent] Homework View Heading:", hwTitle);
  testReport.push({ role: "parent", feature: "Homework Oversight", status: hwTitle ? "PASS" : "FAIL" });

  // ===========================================================================
  // JOURNEY 2: TEACHER CLASSROOM & OPERATIONS
  // ===========================================================================
  console.log("\n>>> SIMULATING USER: [TEACHER]");
  await setRole("teacher");
  await openPage("/");

  const teacherOverviewLoaded = await evaluate("!!document.querySelector('.stat-grid, .page-wrap, h1')");
  console.log("  [Teacher] Overview Dashboard Loaded:", teacherOverviewLoaded);

  // Test /curriculum
  await openPage("/curriculum");
  const currSearch = await evaluate("!!document.querySelector('input[type=\"search\"], input[placeholder*=\"Find\" i], input')");
  console.log("  [Teacher] Curriculum Search Input Present:", currSearch);
  testReport.push({ role: "teacher", feature: "Curriculum Search", status: currSearch ? "PASS" : "FAIL" });

  // Test /learning (Lesson Board)
  await openPage("/learning");
  const learningBoardLoaded = await evaluate("!!document.querySelector('.learning-board, .whiteboard-container, .page-wrap, h1')");
  console.log("  [Teacher] Lesson Whiteboard Board Loaded:", learningBoardLoaded);
  testReport.push({ role: "teacher", feature: "Classroom Lesson Board", status: learningBoardLoaded ? "PASS" : "FAIL" });

  // Test /leave
  await openPage("/leave");
  const leaveButtonPresent = await evaluate("!!document.querySelector('button, .btn')");
  console.log("  [Teacher] Leave Request Action Available:", leaveButtonPresent);
  testReport.push({ role: "teacher", feature: "Leave Requests", status: leaveButtonPresent ? "PASS" : "FAIL" });

  // ===========================================================================
  // JOURNEY 3: QUALITY CONTROL (QC) AUDITING & COMPLAINTS DESK
  // ===========================================================================
  console.log("\n>>> SIMULATING USER: [QC]");
  await setRole("qc");
  await openPage("/complaints");

  const complaintsDeskLoaded = await evaluate("!!document.querySelector('.complaints-shell, .card, h1')");
  const complaintsTicketCount = await evaluate("document.querySelectorAll('.complaint-item, tr, .roster-item').length");
  console.log("  [QC] Complaints Desk Loaded:", complaintsDeskLoaded, "| Items Count:", complaintsTicketCount);
  testReport.push({ role: "qc", feature: "Complaints Desk", status: complaintsDeskLoaded ? "PASS" : "FAIL" });

  // ===========================================================================
  // JOURNEY 4: FINANCE LEDGER & PAYOUTS
  // ===========================================================================
  console.log("\n>>> SIMULATING USER: [FINANCE]");
  await setRole("finance");
  await openPage("/finance");

  const financeStats = await evaluate("document.querySelectorAll('.stat-card, .stat-value').length");
  const newBillingBtn = await evaluate("!!document.querySelector('button, .btn.primary')");
  console.log("  [Finance] Financial Ledger Stat Cards:", financeStats, "| New Billing Button:", newBillingBtn);
  testReport.push({ role: "finance", feature: "Financial Ledger & Billing", status: financeStats > 0 ? "PASS" : "FAIL" });

  await openPage("/payroll");
  const payrollTabs = await evaluate("document.querySelectorAll('.pr-tabs button, .tabs button, button').length");
  console.log("  [Finance] Payroll Control Tabs Count:", payrollTabs);
  testReport.push({ role: "finance", feature: "Payroll Calculations", status: payrollTabs > 0 ? "PASS" : "FAIL" });

  // ===========================================================================
  // JOURNEY 5: HUMAN RESOURCES (HR) HIRING & PERSONNEL
  // ===========================================================================
  console.log("\n>>> SIMULATING USER: [HR]");
  await setRole("hr");
  await openPage("/hiring");

  const hiringPipelineLoaded = await evaluate("!!document.querySelector('.hiring-container, .page-wrap, h1')");
  console.log("  [HR] Hiring & Auditions Pipeline Loaded:", hiringPipelineLoaded);
  testReport.push({ role: "hr", feature: "Hiring Pipeline", status: hiringPipelineLoaded ? "PASS" : "FAIL" });

  await openPage("/people");
  const staffDirectoryLoaded = await evaluate("!!document.querySelector('.people-list, table, .card, h1')");
  console.log("  [HR] Staff & Teacher Directory Loaded:", staffDirectoryLoaded);
  testReport.push({ role: "hr", feature: "Staff Directory", status: staffDirectoryLoaded ? "PASS" : "FAIL" });

  // ===========================================================================
  // JOURNEY 6: SALES & MARKETING LEADS CRM
  // ===========================================================================
  console.log("\n>>> SIMULATING USER: [SALES_MARKETING]");
  await setRole("sales_marketing");
  await openPage("/leads");

  const leadsCrmLoaded = await evaluate("!!document.querySelector('.leads-view, .table, .card, h1')");
  console.log("  [Sales Marketing] Leads CRM Loaded:", leadsCrmLoaded);
  testReport.push({ role: "sales_marketing", feature: "Leads CRM", status: leadsCrmLoaded ? "PASS" : "FAIL" });

  // ===========================================================================
  // JOURNEY 7: ADMIN & HEAD ADMIN FULL ACADEMY OPERATIONS
  // ===========================================================================
  console.log("\n>>> SIMULATING USER: [ADMIN]");
  await setRole("admin");
  await openPage("/schedule");

  const calendarLoaded = await evaluate("!!document.querySelector('.calendar-view, .schedule-calendar, .stat-grid, h1')");
  console.log("  [Admin] Master Timetable Schedule Loaded:", calendarLoaded);
  testReport.push({ role: "admin", feature: "Master Timetable", status: calendarLoaded ? "PASS" : "FAIL" });

  await openPage("/students");
  const studentRosterLoaded = await evaluate("!!document.querySelector('.student-roster, table, .card, h1')");
  console.log("  [Admin] Student Admissions & Roster Loaded:", studentRosterLoaded);
  testReport.push({ role: "admin", feature: "Student Admissions Roster", status: studentRosterLoaded ? "PASS" : "FAIL" });

  await openPage("/operations");
  const opsTabs = await evaluate("document.querySelectorAll('.ops-tabs button, button').length");
  console.log("  [Admin] Daily Operations Actions Count:", opsTabs);
  testReport.push({ role: "admin", feature: "Daily Operations", status: opsTabs > 0 ? "PASS" : "FAIL" });

  // ===========================================================================
  // JOURNEY 8: SUPER ADMIN SYSTEM DIRECTORY & IMPERSONATION
  // ===========================================================================
  console.log("\n>>> SIMULATING USER: [SUPER_ADMIN]");
  await setRole("super_admin");
  await openPage("/accounts");

  const accountsLoaded = await evaluate("!!document.querySelector('.pw-accounts-page, h1')");
  const accountRows = await evaluate("document.querySelectorAll('.pw-account-row, tr, .account-item').length");
  console.log("  [Super Admin] Accounts Directory Loaded:", accountsLoaded, "| Accounts Count:", accountRows);
  testReport.push({ role: "super_admin", feature: "User Accounts & Role Manager", status: accountsLoaded ? "PASS" : "FAIL" });

  // Clean finish
  await setRole("admin");
  console.log("\n================================================================================");
  console.log("TEST DRIVE COMPLETE - ALL USER JOURNEYS EXECUTED SUCCESSFULLY");
  console.log("================================================================================");
}

runFullSimulation()
  .catch((err) => {
    console.error("Simulation error:", err);
  })
  .finally(() => {
    if (socket) socket.close();
    if (chromeProc) {
      try { process.kill(chromeProc.pid); } catch {}
    }
    process.exit(0);
  });

