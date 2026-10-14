import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {databaseClient,safeFailure} from "./database-client.mjs";
if(!process.argv.includes("--development"))throw new Error("Use --development for isolated temporary fixtures only.");
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sdk=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const db=databaseClient(),owner=randomUUID(),parent=randomUUID(),studentId=`learning-${randomUUID()}`,lessonId=`lesson-${randomUUID()}`,resourceId=`resource-${randomUUID()}`;
const email=`learning-${randomUUID()}@permissions-test.invalid`,password=randomBytes(30).toString("base64url");
const base=`https://${process.env.REPLIT_DEV_DOMAIN}`;
const paymentId=`payment-${randomUUID()}`;
let user,channel,path,timer,stage="fixture setup",checks=0;
function pass(label){checks++;console.log(`PASS ${label}`);}
try{
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:"Temporary learning test"}});
 if(created.error)throw new Error("Temporary account unavailable");user=created.data.user.id;
 await db.connect();await db.query("begin");
 await db.query("insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values($1,$2,'{\"name\":\"Temporary fixture authority\"}',now(),now())",[owner,`authority-${owner}@permissions-test.invalid`]);
 await db.query("insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values($1,$2,'{\"name\":\"Temporary guardian\"}',now(),now())",[parent,`guardian-${parent}@permissions-test.invalid`]);
 await db.query("update public.pw_profiles set role='parent',status='active' where id=$1",[parent]);
 await db.query("update public.pw_profiles set role='super_admin',status='active' where id=$1",[owner]);
 await db.query("update public.pw_profiles set role='teacher',status='active' where id=$1",[user]);
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[owner,JSON.stringify({sub:owner,role:"authenticated"})]);
 const student={id:studentId,name:"Temporary learning child",dob:"2017-01-01",parentName:"Temporary guardian",parentEmail:"guardian@permissions-test.invalid",teacherName:"Temporary learning test",adminName:"Temporary fixture authority",instrument:"Piano",timezone:"Europe/London",consent:false,rank:"Novice",songsDone:[],songsToDo:[],status:"active",monthlyLessons:4,lessonsTaken:0};
 const lesson={id:lessonId,studentId,studentName:student.name,teacherName:student.teacherName,adminName:student.adminName,title:"Temporary realtime class",instrument:"Piano",startsAt:"2099-01-10T12:00:00.000Z",studentTimezone:"Europe/London",status:"scheduled",kind:"standard",notes:"Original teaching instruction",nextTopics:""};
 await db.query("insert into public.pw_students(id,parent_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[studentId,parent,user,owner,JSON.stringify(student)]);
 await db.query("insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[lessonId,studentId,user,owner,JSON.stringify(lesson)]);
 await db.query("commit");
 stage="provider sign-in";
 const login=await sdk.auth.signInWithPassword({email,password});if(login.error)throw new Error("Provider sign-in unavailable");
 await sdk.realtime.setAuth(login.data.session.access_token);
 let resolveEvent,rejectEvent;
 const delivered=new Promise((resolve,reject)=>{resolveEvent=resolve;rejectEvent=reject;});
 delivered.catch(()=>{});
 timer=setTimeout(()=>rejectEvent(new Error("Private realtime delivery timed out")),20000);
 stage="realtime subscription";
 await new Promise((resolve,reject)=>{
  const subscriptionTimeout=setTimeout(()=>reject(new Error("Realtime subscription timed out")),15000);
  channel=sdk.channel(`learning-test-${randomUUID()}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"pw_lesson_boards",filter:`lesson_id=eq.${lessonId}`},event=>resolveEvent(event.new))
   .subscribe(status=>{if(status==="SUBSCRIBED"){clearTimeout(subscriptionTimeout);resolve();}if(["CHANNEL_ERROR","TIMED_OUT"].includes(status)){clearTimeout(subscriptionTimeout);reject(new Error("Realtime subscribe unavailable"));}});
 });
 stage="provider board save";
 const saved=await sdk.rpc("pw_save_board",{p_lesson:lessonId,p_revision:0,p_notes:"Actual realtime note",p_next:"Next scale",p_topics:["C major"]});
 if(saved.error){console.error("Board provider error code:",saved.error.code);throw new Error("Provider board save failed");}
 stage="private realtime event";
 const event=await delivered;clearTimeout(timer);assert.equal(event.notes,"Actual realtime note");assert.equal(event.original_notes,"Original teaching instruction");pass("Authenticated private board changes arrive through actual Supabase Realtime");
 stage="private PDF download";
 const signed=await fetch(`${base}/api/auth`,{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify({action:"login",email,password})});
 assert.equal(signed.status,200);
 const cookie=signed.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
 const pdf=await fetch(`${base}/api/reports?kind=progress&id=${studentId}&month=2099-01`,{headers:{Cookie:cookie}});
 assert.equal(pdf.status,200);assert.equal(pdf.headers.get("content-type"),"application/pdf");
 assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),"%PDF-");pass("Signed-in monthly progress downloads as an actual private PDF");
 const birthday=await fetch(`${base}/api/reports?kind=birthday&id=${studentId}`,{headers:{Cookie:cookie}});assert.equal(birthday.status,200);assert.equal(Buffer.from(await birthday.arrayBuffer()).subarray(0,5).toString(),"%PDF-");pass("Assigned teaching staff can download a private learner birthday card");
 await db.query("update public.pw_profiles set role='qc' where id=$1",[user]);
 const resource={id:resourceId,title:"Temporary PDF guide",type:"guide",instrument:"Piano",level:"Novice",summary:"Isolated upload verification"};
 const made=await sdk.rpc("pw_save_resource",{p_id:resourceId,p_revision:0,p_payload:resource,p_archive:false});if(made.error)throw new Error("Provider resource create failed");
 const bytes=Buffer.from("%PDF-1.4\n% temporary provider test\n%%EOF");
 const reserved=await sdk.rpc("pw_reserve_file",{p_category:"curriculum",p_target:resourceId,p_name:"test-guide.pdf",p_mime:"application/pdf",p_bytes:bytes.length});
 if(reserved.error)throw new Error("Provider reservation failed");path=reserved.data.path;
 const upload=await sdk.storage.from("pw-private").upload(path,bytes,{contentType:"application/pdf"});if(upload.error)throw new Error("Private storage upload failed");
 const finished=await sdk.rpc("pw_finish_curriculum_file",{p_id:reserved.data.id});if(finished.error)throw new Error("Actual stored file validation failed");
 const file=await fetch(`${base}/api/files?id=${reserved.data.id}`,{headers:{Cookie:cookie},redirect:"manual"});assert.equal(file.status,307);pass("Actual private curriculum upload finishes and opens with an expiring scoped link");
 const anonymous=await fetch(`${base}/api/files?id=${reserved.data.id}`,{redirect:"manual"});assert.equal(anonymous.status,403);pass("Anonymous users cannot open curriculum files");
 stage="billing documents";
 await db.query("begin");
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[owner,JSON.stringify({sub:owner,role:"authenticated"})]);
 const payment={id:paymentId,parentName:"Temporary guardian",studentName:student.name,amount:10,currency:"GBP",dueDate:"2099-01-10",status:"due",terms:"upfront",referralDiscount:0};
 await db.query("insert into public.pw_payments(id,student_id,parent_id,payload) values($1,$2,$3,$4)",[paymentId,studentId,parent,JSON.stringify(payment)]);
 await db.query("commit");
 await db.query("update public.pw_profiles set role='finance' where id=$1",[user]);
 const invoice=await fetch(`${base}/api/reports?kind=invoice&id=${paymentId}`,{headers:{Cookie:cookie}});assert.equal(invoice.status,200);assert.equal(Buffer.from(await invoice.arrayBuffer()).subarray(0,5).toString(),"%PDF-");pass("Finance downloads an actual recorded-currency invoice PDF");
 const receipt=await fetch(`${base}/api/reports?kind=receipt&id=${paymentId}`,{headers:{Cookie:cookie}});assert.equal(receipt.status,409);pass("Unverified payments cannot generate verified receipt documents");
 const denied=await fetch(`${base}/api/reports?kind=progress&id=${studentId}`,{headers:{Cookie:cookie}});assert.equal(denied.status,403);pass("Finance cannot download private learning reports");
 console.log(`${checks} live learning provider checks passed. No email sent or live room created.`);
}catch(error){console.error("Learning check stage:",stage,safeFailure(error),error.code==="23502"?`Required fixture column: ${error.column}`:"");process.exitCode=1;}
finally{
 clearTimeout(timer);
 if(channel)await Promise.race([sdk.removeChannel(channel),new Promise(resolve=>setTimeout(resolve,1500))]);
 sdk.realtime.disconnect();
 if(path)await admin.storage.from("pw-private").remove([path]);
 if(user){
  await db.query("rollback").catch(()=>{});
  try{
   await db.query("begin");
   // Privileged development-fixture cleanup only, limited to these freshly generated IDs.
   // Session-local: no application permission, schema or shared trigger is changed.
   await db.query("set local session_replication_role=replica");
   await db.query("delete from public.pw_lesson_events where student_id=$1",[studentId]);
   await db.query("delete from public.pw_salary_roster_history where student_id=$1",[studentId]);
   await db.query("delete from public.pw_lesson_boards where lesson_id=$1",[lessonId]);
   await db.query("delete from public.pw_files where target_id=$1",[resourceId]);
   await db.query("delete from public.pw_resources where id=$1",[resourceId]);
   await db.query("delete from public.pw_classrooms where lesson_id=$1",[lessonId]);
   await db.query("delete from public.pw_payments where id=$1",[paymentId]);
   await db.query("delete from public.pw_lessons where id=$1",[lessonId]);
   await db.query("delete from public.pw_students where id=$1",[studentId]);
   await db.query("delete from public.pw_audit where actor_id in($1,$2)",[owner,user]);
   await db.query("delete from public.pw_emails where recipient_id in($1,$2,$3)",[owner,user,parent]);
   await db.query("delete from public.pw_profiles where id in($1,$2)",[owner,parent]);
   await db.query("delete from auth.users where id in($1,$2)",[owner,parent]);
   await db.query("commit");console.log("Temporary learning records removed.");
  }catch(error){await db.query("rollback");console.error("Isolated fixture cleanup failed:",safeFailure(error));process.exitCode=1;}
  const deleted=await admin.auth.admin.deleteUser(user);if(deleted.error){console.error("Temporary user cleanup failed.");process.exitCode=1;}
 }
 await db.end();
}
