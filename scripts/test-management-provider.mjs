import assert from"node:assert/strict";
import{randomUUID,randomBytes}from"node:crypto";
import{createClient}from"@supabase/supabase-js";
import{databaseClient,safeFailure}from"./database-client.mjs";
if(!process.argv.includes("--development"))throw Error("Development fixtures only");
const root=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base="https://"+process.env.REPLIT_DEV_DOMAIN,db=databaseClient(),users=[],files=[];let checks=0,item=null;
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64");
const pass=s=>{checks++;console.log("PASS "+s);};
try{
 await db.connect();
 assert.equal((await fetch(base+"/api/management")).status,403);pass("Anonymous management API is protected");
 for(const role of["teacher","admin","head_admin","hr","qc","finance","sales_marketing","social_media","super_admin"]){
  const email="management-"+randomUUID()+"@example.invalid",password=randomBytes(30).toString("base64url");
  const created=await root.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:"Isolated "+role}});
  if(created.error||!created.data.user)throw Error("FIXTURE_CREATION_FAILED");
  const id=created.data.user.id;users.push(id);
  await db.query("update public.pw_profiles set role=$2,status='active' where id=$1",[id,role]);
  const login=await fetch(base+"/api/auth",{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({action:"login",email,password})});
  assert.equal(login.status,200,"Fixture sign-in");
  const cookie=login.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
  const get=path=>fetch(base+path,{headers:{Cookie:cookie}});
  const response=await get("/api/management");assert.equal(response.status,200,role+" snapshot");
  const state=await response.json();assert.equal(state.profile.role,role);assert(Array.isArray(state.items));assert(!("bank" in state));pass(role+" gets authenticated scoped management data");
  const form=new FormData();form.set("category","avatar");form.set("targetId",id);form.set("file",new Blob([png],{type:"image/png"}),"fixture-avatar.png");
  const upload=await fetch(base+"/api/files",{method:"POST",headers:{Origin:base,Cookie:cookie},body:form});assert.equal(upload.status,200,role+" photo upload");
  const own=await get("/api/profile");assert.equal(own.status,200);const photo=await own.json();assert(photo.profile.avatar_file_id&&photo.avatarUrl);
  files.push(photo.profile.avatar_file_id);
  const bytes=await fetch(photo.avatarUrl);assert.equal(bytes.status,200);assert(Buffer.from(await bytes.arrayBuffer()).equals(png));pass(role+" uploads and opens actual private profile-photo bytes");
  const bad=new FormData();bad.set("category","avatar");bad.set("targetId",id);bad.set("file",new Blob(["not a photo"],{type:"image/png"}),"forged.png");
  assert.equal((await fetch(base+"/api/files",{method:"POST",headers:{Origin:base,Cookie:cookie},body:bad})).status,400);pass(role+" cannot upload forged image content");
  if(role==="head_admin"){
   const body={action:"create",kind:"monthly_report",assignedTo:id,at:new Date(Date.now()+3600000).toISOString(),slots:[],notes:"Isolated report for hosted API verification."};
   assert.equal((await fetch(base+"/api/management",{method:"POST",headers:{Origin:"https://untrusted.invalid",Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify(body)})).status,403);pass("Management rejects cross-origin writes");
   const result=await fetch(base+"/api/management",{method:"POST",headers:{Origin:base,Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify(body)});assert.equal(result.status,200);
   item=(await result.json()).result.id;
   assert.equal((await db.query("select count(*)::int n from public.pw_emails where source_id=$1 and template='academy_notice'",[item])).rows[0].n,2);pass("Authenticated case creation persists immediate and due notifications");
   await db.query("update public.pw_emails set status='cancelled' where source_id=$1",[item]);
   const update=await fetch(base+"/api/management",{method:"POST",headers:{Origin:base,Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify({action:"update",id:item,revision:1,status:"completed",notes:"Isolated report reviewed and completed."})});assert.equal(update.status,200);pass("Hosted case review persists its revision and history");
  }
 }
 console.log(checks+" hosted management/photo checks passed. No real account was signed into or changed.");
}catch(e){console.error(safeFailure(e));console.error(e.message?.slice(0,160));process.exitCode=1;}
finally{
 try{
  if(item){await db.query("delete from public.pw_emails where source_id=$1",[item]);await db.query("delete from public.pw_desk_history where item_id=$1",[item]);await db.query("delete from public.pw_desk_items where id=$1",[item]);}
  if(users.length){
   const stored=(await db.query("select id,path from public.pw_files where uploader_id=any($1::uuid[])",[users])).rows;
   if(stored.length){const removed=await root.storage.from("pw-private").remove(stored.map(f=>f.path));if(removed.error)throw Error("FIXTURE_STORAGE_CLEANUP_FAILED");}
   await db.query("update public.pw_profiles set avatar_file_id=null where id=any($1::uuid[])",[users]);
   await db.query("delete from public.pw_files where uploader_id=any($1::uuid[])",[users]);
   await db.query("delete from public.pw_audit where actor_id=any($1::uuid[])",[users]);
   await db.query("delete from public.pw_emails where recipient_id=any($1::uuid[])",[users]);
   for(const id of users){const deleted=await root.auth.admin.deleteUser(id);if(deleted.error)throw Error("FIXTURE_ACCOUNT_CLEANUP_FAILED");}
  }
  console.log("Temporary accounts, uploaded photos and notification fixtures removed.");
 }catch(e){console.error(safeFailure(e));process.exitCode=1;}
 await db.end();
}
