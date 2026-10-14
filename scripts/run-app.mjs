import { spawn } from "node:child_process";
if (process.loadEnvFile) { try { process.loadEnvFile(); } catch {} }
const mode = process.argv[2] === "start" ? "start" : "dev";
const env = { ...process.env, NODE_ENV: mode === "start" ? "production" : "development" };
const automation=process.env.ACADEMY_AUTOMATION_MODE||"worker";
if(!["worker","edge"].includes(automation))throw Error("ACADEMY_AUTOMATION_MODE must be worker or edge");
const children = [
  spawn(process.execPath, ["node_modules/next/dist/bin/next", mode, "--hostname", "0.0.0.0", "--port", "5000"], { stdio: "inherit", env }),
  ...(automation==="worker"?[spawn(process.execPath, ["scripts/academy-worker.mjs"], { stdio: "inherit", env })]:[]),
];
console.log(automation==="edge"?"Automation is hosted by the verified Supabase Edge schedule.":"Automation uses the local worker.");
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
    process.exit(code);
  }, 10000);
  Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise(resolve => child.once("exit", resolve))))
    .then(() => { clearTimeout(timer); process.exit(code); });
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", code => { if (!stopping) stop(code || 1); });
}
