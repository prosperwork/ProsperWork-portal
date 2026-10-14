import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {databaseClient,safeFailure} from "./database-client.mjs";
if(!process.argv.includes("--development"))throw Error("Development fixtures only");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base=`https://${process.env.REPLIT_DEV_DOMAIN}`;
const db=databaseClient(),users=[],policies=[],paths=[],fileIds=[],childId=`family-${randomUUID()}`,username=`kid_${randomBytes(8).toString("hex")}`;
let checks=0,stage="setup",owner,parent,child,cookie="",parentCookie="",oldToken="",oldSid="";
const password=randomBytes(24).toString("base64url")+"Aa9!";
const pass=s=>{checks++;console.log("PASS "+s);};
function merge(headers){const jar=new Map(cookie.split("; ").filter(Boolean).map(s=>[s.split("=")[0],s.slice(s.indexOf("=")+1)]));for(const s of headers.getSetCookie()){const first=s.split(";")[0],k=first.split("=")[0],v=first.slice(first.indexOf("=")+1);if(v)jar.set(k,v);else jar.delete(k);}cookie=[...jar].map(([k,v])=>k+"="+v).join("; ");}
async function post(path,data){const r=await fetch(base+path,{method:"POST",headers:{Origin:base,"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify(data),redirect:"manual"});merge(r.headers);return {status:r.status,data:await r.json()};}
async function user(label,role){
 const email=`family-${label}-${randomUUID()}@permissions-test.invalid`;
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:"Temporary "+label}});
 if(made.error)throw Error("Temporary account create failed");
 const id=made.data.user.id;users.push(id);
 await db.query("update public.pw_profiles set role=$2,status='active' where id=$1",[id,role]);
 return {id,email};
}
try{
 await db.connect();owner=await user("authority","super_admin");parent=await user("guardian","parent");
 await db.query("begin");await db.query("insert into public.pw_students(id,parent_id,payload) values($1,$2,$3)",[childId,parent.id,JSON.stringify({id:childId,name:"Temporary family learner",dob:"2017-01-01",timezone:"Europe/London",status:"active",rank:"Novice",consent:false,songsDone:[],songsToDo:[]})]);await db.query("commit");
 stage="private approved documents";
 let login=await post("/api/auth",{action:"login",email:owner.email,password});assert.equal(login.status,200);
 for(const key of ["parent_agreement","terms_of_service","reschedule_policy"]){
  const draft=await post("/api/policies",{action:"draft",key,title:"Isolated provider fixture — not academy legal terms",audienceParentId:parent.id});assert.equal(draft.status,200);policies.push(draft.data.id);
  const form=new FormData();form.set("category","policy");form.set("targetId",draft.data.id);form.set("file",new Blob([Buffer.from("%PDF-1.4\n% isolated private fixture\n%%EOF")],{type:"application/pdf"}),"fixture.pdf");
  const uploaded=await fetch(base+"/api/files",{method:"POST",headers:{Origin:base,Cookie:cookie},body:form});assert.equal(uploaded.status,200);
  const file=await db.query("select id,path from public.pw_files where category='policy' and target_id=$1",[draft.data.id]);fileIds.push(file.rows[0].id);paths.push(file.rows[0].path);
  const published=await post("/api/policies",{action:"publish",id:draft.data.id});assert.equal(published.status,200);
 }
 pass("Owner publishes actual private PDF versions scoped only to the test guardian");
 cookie="";login=await post("/api/auth",{action:"login",email:parent.email,password});assert.equal(login.status,200);
 const before=await fetch(base+"/api/family",{headers:{Cookie:cookie}});assert.equal(before.status,403);pass("Guardian cannot access family data before accepting current policy versions");
 const listed=await fetch(base+"/api/policies",{headers:{Cookie:cookie}});assert.equal(listed.status,200);const list=await listed.json();assert.equal(list.setupRequired,false);
 const accepted=await post("/api/policies",{action:"accept",ids:policies});assert.equal(accepted.status,200);
 stage="student account";
 const created=await post("/api/family",{action:"student_account",childId,username,password});assert.equal(created.status,200);pass("Guardian provisions a real independent student account");
 const linked=await db.query("select student_user_id from public.pw_students where id=$1",[childId]);child=linked.rows[0].student_user_id;users.push(child);
 const family=await fetch(base+"/api/family",{headers:{Cookie:cookie}});assert.equal(family.status,200);const data=await family.json();assert.equal(data.children[0].username,username);pass("Multi-child directory resolves the actual linked student username");
 const badPin=await post("/api/family",{action:"pin",pin:"12345",password});assert.equal(badPin.status,400);
 const pin=await post("/api/family",{action:"pin",pin:"4927",password});assert.equal(pin.status,200);pass("Exactly four-digit return PIN is configured only after guardian password confirmation");
 parentCookie=cookie;
 const guardian=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await guardian.auth.signInWithPassword({email:parent.email,password});assert.ifError(auth.error);
 // Use the BFF session that entering Kid Mode will lock, not the separate SDK session.
 const cookieValue=cookie.split("; ").find(s=>s.includes("-auth-token="))?.split("=").slice(1).join("=");
 const decoded=JSON.parse(Buffer.from(decodeURIComponent(cookieValue).replace(/^base64-/,""),"base64url").toString());
 oldToken=decoded.access_token;oldSid=JSON.parse(Buffer.from(oldToken.split(".")[1],"base64url").toString()).session_id;
 stage="kid boundary";
 const entered=await post("/api/family",{action:"enter_kid",childId});assert.equal(entered.status,200);assert.equal(entered.data.redirect,"/kid");pass("Kid Mode enters a real student session without asking for the return PIN");
 const snapshot=await fetch(base+"/api/session",{headers:{Cookie:cookie}});assert.equal((await snapshot.json()).profile.role,"student");
 const raw=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${oldToken}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const denied=await raw.from("pw_students").select("id");assert.ifError(denied.error);assert.deepEqual(denied.data,[]);pass("Copied old parent JWT is revoked at database level during Kid Mode");
 const wrong=await post("/api/family",{action:"exit_kid",pin:"0000"});assert.equal(wrong.status,403);
 const returned=await post("/api/family",{action:"exit_kid",pin:"4927"});assert.equal(returned.status,200);
 const restored=await fetch(base+"/api/session",{headers:{Cookie:cookie}});assert.equal((await restored.json()).profile.role,"parent");pass("Wrong PIN cannot unlock; correct PIN restores the guardian session");
 cookie="";const studentLogin=await post("/api/auth",{action:"login",email:username,password});assert.equal(studentLogin.status,200);
 const independently=await fetch(base+"/api/session",{headers:{Cookie:cookie}});assert.equal((await independently.json()).profile.role,"student");pass("Independent student signs in with their username and password");
 const practice=await post("/api/studio",{action:"practice",operation:"start",childId});assert.equal(practice.status,200);
 const paused=await post("/api/studio",{action:"practice",operation:"pause",id:practice.data.id});assert.equal(paused.status,200);
 const quiz=await post("/api/studio",{action:"practice",operation:"quiz",id:practice.data.id,answers:[4,2,3,8,1,6]});assert.equal(quiz.status,200);
 const studio=await fetch(base+"/api/studio",{headers:{Cookie:cookie}});assert.equal(studio.status,200);const savedStudio=await studio.json();assert.equal(savedStudio.practice.find(p=>p.id===practice.data.id).game_score,6);pass("Independent student's timed practice and server-scored game persist");
 const wav=Buffer.alloc(44+3200);wav.write("RIFF",0);wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(3200,40);
 const recording=new FormData();recording.set("category","practice");recording.set("targetId",practice.data.id);recording.set("file",new Blob([wav],{type:"audio/wav"}),"isolated-recording.wav");
 const uploadedRecording=await fetch(base+"/api/files",{method:"POST",headers:{Origin:base,Cookie:cookie},body:recording});assert.equal(uploadedRecording.status,200);
 const audioRow=await db.query("select id,path from public.pw_files where category='practice' and target_id=$1",[practice.data.id]);fileIds.push(audioRow.rows[0].id);paths.push(audioRow.rows[0].path);
 const audio=await fetch(base+"/api/files?id="+audioRow.rows[0].id,{headers:{Cookie:cookie},redirect:"manual"});assert.equal(audio.status,307);pass("Actual private practice audio uploads and opens under the student scope");
 const request=await post("/api/studio",{action:"request",childId,kind:"tutor",body:"Please help with note reading."});assert.equal(request.status,200);pass("Human tutor request reaches the durable scoped queue");
 const pic=new FormData();pic.set("category","avatar");pic.set("targetId",child);pic.set("file",new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/SckAAAAASUVORK5CYII=","base64")],{type:"image/png"}),"fixture.png");
 const portrait=await fetch(base+"/api/files",{method:"POST",headers:{Origin:base,Cookie:cookie},body:pic});assert.equal(portrait.status,200);
 const portraitRow=await db.query("select id,path from public.pw_files where category='avatar' and target_id=$1",[child]);fileIds.push(portraitRow.rows[0].id);paths.push(portraitRow.rows[0].path);
 const avatar=await fetch(base+"/api/files?id="+portraitRow.rows[0].id,{headers:{Cookie:cookie},redirect:"manual"});assert.equal(avatar.status,307);pass("Actual profile picture uploads and opens with a scoped private link");
 const elevate=await post("/api/family",{action:"pin",pin:"4927",password});assert.equal(elevate.status,403);pass("Independent student cannot configure guardian security");
 await guardian.auth.signOut({scope:"local"});await raw.auth.signOut({scope:"local"}).catch(()=>{});
 console.log(`${checks} hosted family checks passed. No real family policy altered; no email sent.`);
}catch(e){console.error("Family check failed at",stage,e.name,e.code||"");process.exitCode=1;}
finally{
 try{
  if(paths.length){const removed=await admin.storage.from("pw-private").remove(paths);if(removed.error)throw Error("Fixture storage cleanup failed");}
  await db.query("rollback");await db.query("begin");await db.query("set local session_replication_role=replica");
  await db.query("delete from public.pw_kid_blocks where parent_id=any($1::uuid[])",[users]);
  await db.query("delete from public.pw_family_pins where parent_id=any($1::uuid[])",[users]);
  await db.query("delete from public.pw_policy_acceptances where parent_id=any($1::uuid[]) or policy_id=any($2::uuid[])",[users,policies]);
  await db.query("delete from public.pw_policy_versions where id=any($1::uuid[])",[policies]);
  await db.query("delete from public.pw_files where id=any($1::uuid[])",[fileIds]);
  await db.query("delete from public.pw_learning_replies where request_id in(select id from public.pw_learning_requests where student_id=$1)",[childId]);
  await db.query("delete from public.pw_learning_requests where student_id=$1",[childId]);
  await db.query("delete from public.pw_practice where student_id=$1",[childId]);
  await db.query("delete from public.pw_repertoire_events where student_id=$1",[childId]);
  await db.query("delete from public.pw_evaluations where student_id=$1",[childId]);
  await db.query("delete from public.pw_salary_roster_history where student_id=$1",[childId]);
  await db.query("delete from public.pw_students where id=$1",[childId]);
  await db.query("delete from public.pw_emails where recipient_id=any($1::uuid[])",[users]);
  await db.query("delete from public.pw_audit where actor_id=any($1::uuid[])",[users]);
  await db.query("commit");
  for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error)throw Error("Fixture account cleanup failed");}
  console.log("All private family fixtures and accounts removed.");
 }catch(e){console.error("Family fixture cleanup failed.",safeFailure(e));process.exitCode=1;}
 await db.end();
}
