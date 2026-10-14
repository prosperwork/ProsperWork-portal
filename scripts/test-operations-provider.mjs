import assert from"node:assert/strict";
import{randomUUID,randomBytes}from"node:crypto";
import{createClient}from"@supabase/supabase-js";
import{databaseClient,safeFailure}from"./database-client.mjs";
if(!process.argv.includes("--development"))throw Error("Development fixtures only");
const db=databaseClient(),admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),base=`https://${process.env.REPLIT_DEV_DOMAIN}`,ids=[];
const password=randomBytes(24).toString("base64url")+"Aa9!";let cookie="",checks=0,stage="setup",createdCurrency=false;
function pass(s){checks++;console.log("PASS "+s);}
function merge(h){const jar=new Map(cookie.split("; ").filter(Boolean).map(s=>[s.split("=")[0],s.slice(s.indexOf("=")+1)]));for(const v of h.getSetCookie()){const t=v.split(";")[0],k=t.split("=")[0],value=t.slice(t.indexOf("=")+1);if(value)jar.set(k,value);else jar.delete(k);}cookie=[...jar].map(([k,v])=>k+"="+v).join("; ");}
async function request(path,data,origin=base){const res=await fetch(base+path,{method:data?"POST":"GET",headers:{Cookie:cookie,...data?{"Content-Type":"application/json",Origin:origin}:{}},body:data?JSON.stringify(data):undefined,redirect:"manual"});merge(res.headers);return{status:res.status,data:res.headers.get("content-type")?.includes("application/json")?await res.json():null};}
async function user(role){const email=`ops-${randomUUID()}@permissions-test.invalid`;const u=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:"Temporary operations "+role}});if(u.error)throw Error("Fixture creation unavailable");const id=u.data.user.id;ids.push(id);await db.query("update public.pw_profiles set role=$2,status='active',timezone='UTC' where id=$1",[id,role]);return{id,email};}
async function login(u){cookie="";assert.equal((await request("/api/auth",{action:"login",email:u.email,password})).status,200);}
try{
 await db.connect();stage="signed-in roles";const owner=await user("super_admin"),teacher=await user("teacher"),social=await user("social_media");
 const anonymous=await request("/api/operations");assert.equal(anonymous.status,401);pass("Unauthenticated requests cannot read operations");
 await login(teacher);stage="teacher scope";let state=await request("/api/operations");assert.equal(state.status,200);assert.deepEqual(state.data.financial,[]);assert.equal(state.data.settings,null);pass("Real teacher session loads own operations without financial controls");
 assert.equal((await request("/operations")).status,200);pass("Protected Operations page serves to an active authenticated teacher");
 const slot=await request("/api/operations",{action:"availability",staffId:teacher.id,weekday:1,from:"09:00",to:"17:00",notes:"Isolated provider availability fixture"});assert.equal(slot.status,200);
 state=await request("/api/operations");assert(state.data.availability.some(a=>a.id===slot.data.id));pass("Hosted availability POST persists and reloads through native RLS");
 assert.equal((await request("/api/operations",{action:"expense",title:"Forbidden fixture",amount:10,currency:"NGN",date:"2026-10-13",category:"Test",notes:"Teacher cannot add financial records"})).status,403);pass("Teacher cannot write expense records through the real API");
 assert.equal((await request("/api/operations",{action:"availability",staffId:teacher.id,weekday:2,from:"09:00",to:"17:00",notes:"Cross-origin request must be rejected"},"https://untrusted.invalid")).status,403);pass("Cross-origin writes are rejected");
 await login(owner);stage="central currency";
 let catalog=await request("/api/currencies");assert.equal(catalog.status,200);assert(!catalog.data.currencies.some(c=>c.code==="XTS"),"Do not overwrite any existing test-code configuration");
 assert.equal((await request("/api/currencies",{code:"XTS",name:"Reserved isolated provider test",symbol:"XTS",enabled:true,notes:"Temporary provider currency fixture"})).status,200);createdCurrency=true;
 catalog=await request("/api/currencies");assert(catalog.data.currencies.some(c=>c.code==="XTS"));pass("Owner creates and reloads a centrally stored currency through authenticated API");
 assert.equal((await request("/api/operations",{action:"fx",currency:"XTS",date:"2026-10-13",rate:100,notes:"Reserved isolated conversion test"})).status,200);pass("New currency is accepted by the real conversion-rate API without a code release");
 await login(teacher);catalog=await request("/api/currencies");assert.equal(catalog.data.rates.length,0);assert.equal(catalog.data.financeRules,null);
 assert.equal((await request("/api/currencies",{code:"XTS",name:"Forbidden rewrite",symbol:"XTS",enabled:false,notes:"Teacher has no financial control"})).status,403);pass("Teacher sees currency choices without financial rates or write access");
 await login(owner);stage="owner observation";assert.equal((await request("/api/operations",{action:"observe",staffId:teacher.id,kind:"coaching",score:85,notes:"Owner private coaching fixture, not real employee data"})).status,200);
 await login(teacher);state=await request("/api/operations");assert(state.data.observations.some(o=>o.staff_id===teacher.id&&o.score===85));pass("Private coaching persists and is visible to its employee");
 await login(social);state=await request("/api/operations");assert.equal(state.status,200);assert.equal(state.data.observations.length,0);assert.deepEqual(state.data.financial,[]);pass("Social Media receives neither staff coaching nor financial reports");
 console.log(`${checks} hosted operations checks passed; isolated account, availability, currency/rate and coaching fixtures cleaned up.`);
}catch(e){console.error("Hosted operations stage: "+stage);console.error(safeFailure(e));process.exitCode=1;}
finally{
 await db.query("begin").catch(()=>{});
 try{await db.query("set local session_replication_role=replica");
  await db.query("delete from public.pw_quality_observations where staff_id=any($1::uuid[]) or reviewer_id=any($1::uuid[])",[ids]);
  await db.query("delete from public.pw_availability where staff_id=any($1::uuid[])",[ids]);
  await db.query("delete from public.pw_operations_events where actor=any($1::uuid[])",[ids]);
  if(createdCurrency){await db.query("delete from public.pw_fx_rates where currency='XTS' and approved_by=any($1::uuid[])",[ids]);await db.query("delete from public.pw_currencies where code='XTS'");}
  await db.query("delete from public.pw_audit where actor_id=any($1::uuid[]) or subject_id=any($1::uuid[])",[ids]);await db.query("commit");
 }catch{await db.query("rollback");console.error("Scoped fixture cleanup needs review.");process.exitCode=1;}
 for(const id of [...ids].reverse())if((await admin.auth.admin.deleteUser(id)).error){console.error("Temporary identity cleanup needs review.");process.exitCode=1;}
 await db.end();
}
