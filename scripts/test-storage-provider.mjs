import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
if (!process.argv.includes("--development")) { console.error("Use --development for an isolated storage smoke test."); process.exit(1); }
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const path = `provider-check/${randomUUID()}`;
const contents = Buffer.from("%PDF-1.4\n% isolated provider connectivity test\n%%EOF");
let created=false;
try {
  const uploaded=await client.storage.from("pw-private").upload(path,contents,{contentType:"application/pdf",upsert:false});
  if(uploaded.error) throw new Error("UPLOAD_FAILED");
  created=true;
  const downloaded=await client.storage.from("pw-private").download(path);
  if(downloaded.error || !downloaded.data) throw new Error("DOWNLOAD_FAILED");
  assert.deepEqual(Buffer.from(await downloaded.data.arrayBuffer()),contents);
  const anonymous=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const forbidden=await anonymous.storage.from("pw-private").download(path);
  assert.ok(forbidden.error);
  console.log("PASS Actual Supabase storage round-trip preserves uploaded bytes");
  console.log("PASS Anonymous visitors cannot download the private object");
} catch { console.error("Private storage provider check failed; no credentials or provider details printed.");process.exitCode=1; }
finally {
  if(created) {
    const removed=await client.storage.from("pw-private").remove([path]);
    if(removed.error){console.error("Provider test object cleanup failed.");process.exitCode=1;}
    else console.log("Temporary provider test object removed; no academy records created.");
  }
}
