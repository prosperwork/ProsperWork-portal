import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {databaseClient,safeFailure} from "./database-client.mjs";
if(!process.argv.includes("--development"))throw Error("Development fixtures only");
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base=`https://${process.env.REPLIT_DEV_DOMAIN}`,db=databaseClient(),users=[],cases=[],paths=[],fileIds=[];
const password=randomBytes(24).toString("base64url")+"Aa9!";
let cookie="",stage="setup",checks=0;
const pass=s=>{checks++;console.log("PASS "+s);};
function merge(h){const jar=new Map(cookie.split("; ").filter(Boolean).map(s=>[s.split("=")[0],s.slice(s.indexOf("=")+1)]));for(const v of h.getSetCookie()){const t=v.split(";")[0],k=t.split("=")[0],value=t.slice(t.indexOf("=")+1);if(value)jar.set(k,value);else jar.delete(k);}cookie=[...jar].map(([k,v])=>k+"="+v).join("; ");}
async function post(path,data){const r=await fetch(base+path,{method:"POST",headers:{Origin:base,"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify(data),redirect:"manual"});merge(r.headers);return{status:r.status,data:await r.json()};}
async function login(u){cookie="";const r=await post("/api/auth",{action:"login",email:u.email,password});assert.equal(r.status,200);}
async function get(path){const r=await fetch(base+path,{headers:{Cookie:cookie},redirect:"manual"});merge(r.headers);return{status:r.status,data:r.headers.get("content-type")?.includes("json")?await r.json():null,location:r.headers.get("location")};}
async function user(role,status="active"){
 const email=`hiring-${randomUUID()}@permissions-test.invalid`,name="Temporary "+role;
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name}});if(made.error)throw Error("Fixture account unavailable");
 const id=made.data.user.id;users.push(id);await db.query("update public.pw_profiles set role=$2,status=$3 where id=$1",[id,role,status]);return{id,email,name};
}
async function ok(data){const r=await post("/api/hiring",data);assert.equal(r.status,200,stage);return r.data;}
async function upload(category,id){
 const form=new FormData();form.set("category",category);form.set("targetId",id);
 form.set("file",new Blob([Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF")],{type:"application/pdf"}),"isolated-provider-proof.pdf");
 const r=await fetch(base+"/api/files",{method:"POST",headers:{Origin:base,Cookie:cookie},body:form});assert.equal(r.status,200,stage);
 const file=(await db.query("select id,path from public.pw_files where target_id=$1 and category=$2 and complete order by created_at desc limit 1",[id,category])).rows[0];assert(file);paths.push(file.path);fileIds.push(file.id);return file.id;
}
try{
 await db.connect();const owner=await user("super_admin"),hr=await user("hr"),qc=await user("qc"),candidate=await user("teacher","applicant");
 await login(hr);stage="native HR create";
 const made=await ok({action:"create",name:candidate.name,email:candidate.email,role:"teacher",reviewerId:qc.id,notes:"Isolated authenticated teacher recruitment fixture"});cases.push(made.id);const id=made.id;pass("Signed-in HR creates a real hosted recruitment case");
 await ok({action:"schedule",id,at:new Date(Date.now()-3600000).toISOString(),notes:"Isolated interview took place before this check"});
 await ok({action:"review",id,kind:"hr_interview",score:85,passed:true,notes:"Isolated HR interview completed with recorded evidence"});
 await login(qc);
 for(const kind of["department_interview","audition"])await ok({action:"review",id,kind,score:85,passed:true,notes:"Isolated reviewer assessment with explicit result"});
 await login(hr);await ok({action:"select",id,notes:"Both independent interviews and teacher audition passed"});pass("Hosted HR/QC joint assessment and selection persist");
 await login(owner);await ok({action:"bind",id,staffId:candidate.id,notes:"Owner links matching applicant identity without activation"});
 await login(qc);await ok({action:"review",id,kind:"training",score:90,passed:true,notes:"Curriculum, academy guidelines and class operations training recorded"});
 const terms={action:"propose_rate",staffId:candidate.id,effectiveFrom:"2026-10-28",currency:"NGN",monthlyStudentRate:25000,trialRate:1000,coverRate:1000,baseSalary:0,adminExtraParentRate:0,adminQuota:0,advanceEligible:false,managementFirstPeriod:"manual_adjustment",reason:"Isolated initial offer for hosted onboarding test"};
 stage="initial approved compensation";
 const proposed=await post("/api/payroll",terms);assert.equal(proposed.status,200);
 const rate=(await db.query("select id from public.pw_salary_rates where staff_id=$1",[candidate.id])).rows[0].id;
 const bank=await post("/api/payroll",{action:"bank",staffId:candidate.id,bankName:"Isolated test bank",accountName:candidate.name,accountNumber:"TEST-HIRING-0001",routingCode:"",currency:"NGN"});assert.equal(bank.status,200);
 await login(owner);const approved=await post("/api/payroll",{action:"decide_rate",id:rate,decision:"approve",reason:"Owner approves isolated initial offer"});assert.equal(approved.status,200);pass("Existing payroll API handles owner-approved initial pay and confidential bank capture");
 stage="actual private document upload";
 const guidelines=await upload("hiring_guidelines",id),agreement=await upload("hiring_agreement",id);
 await ok({action:"document",id,kind:"guidelines",fileId:guidelines,notes:"Isolated provider PDF, not academy legal content"});
 await ok({action:"document",id,kind:"agreement",fileId:agreement,notes:"Owner approves fixture PDF linked to actual initial offer"});pass("Actual private guidelines/agreement files upload and publish");
 await login(candidate);stage="applicant portal";
 const portal=await get("/api/hiring");assert.equal(portal.status,200);assert.equal(portal.data.cases.length,1);assert.equal(portal.data.reviews.length,0);assert.equal(portal.data.directory.length,0);pass("Applicant portal exposes only their case and no private review/directory");
 assert.equal((await get("/hiring")).status,200);assert.equal((await get("/")).status,307);pass("Applicant reaches hiring, not the normal staff workspace");
 const privateFile=await get("/api/files?id="+agreement);assert.equal(privateFile.status,307);const actual=await fetch(privateFile.location);assert.equal(actual.status,200);assert.equal(Buffer.from(await actual.arrayBuffer()).subarray(0,5).toString(),"%PDF-");pass("Applicant opens an actual protected PDF through signed storage delivery");
 const forbidden=await post("/api/hiring",{action:"activate",id,notes:"Applicant attempts to grant their own staff privileges"});assert.equal(forbidden.status,403);
 await ok({action:"accept",id,signedName:candidate.name,agreed:true});pass("Verified applicant signature persists without granting staff privileges");
 await login(qc);stage="final handoff";
 await ok({action:"handoff",id,startDate:"2026-10-28",notes:"QC finalizes training, documents, accepted offer and bank setup"});
 const view=await get("/api/hiring");assert(!view.data.files.some(f=>f.id===agreement));pass("Finalized handoff removes QC access to employment pay PDFs");
 await login(owner);await ok({action:"activate",id,notes:"Owner authorizes fully onboarded employee activation"});
 assert.equal((await db.query("select status from public.pw_profiles where id=$1",[candidate.id])).rows[0].status,"active");pass("Owner activation completes the hosted onboarding workflow");
 console.log(`${checks} hosted hiring checks passed. No real employee changed; no invitation/email sent.`);
}catch(e){console.error("Hosted hiring stage: "+stage);console.error(safeFailure(e));process.exitCode=1;}
finally{
 if(paths.length)await admin.storage.from("pw-private").remove(paths);
 await db.query("begin").catch(()=>{});
 try{
  await db.query("set local session_replication_role=replica");
  await db.query("delete from public.pw_hiring_events where case_id=any($1::uuid[])",[cases]);
  await db.query("delete from public.pw_hiring_reviews where case_id=any($1::uuid[])",[cases]);
  await db.query("delete from public.pw_hiring_cases where id=any($1::uuid[])",[cases]);
  await db.query("delete from public.pw_files where id=any($1::uuid[]) or uploader_id=any($2::uuid[])",[fileIds,users]);
  await db.query("delete from public.pw_salary_rates where staff_id=any($1::uuid[])",[users]);
  await db.query("delete from public.pw_salary_banks where staff_id=any($1::uuid[])",[users]);
  await db.query("delete from public.pw_audit where actor_id=any($1::uuid[]) or subject_id=any($1::uuid[])",[users]);
  await db.query("commit");
 }catch{await db.query("rollback");console.error("Fixture cleanup needs review.");process.exitCode=1;}
 for(const id of [...users].reverse())if((await admin.auth.admin.deleteUser(id)).error){console.error("Temporary identity cleanup needs review.");process.exitCode=1;}
 await db.end();
}
