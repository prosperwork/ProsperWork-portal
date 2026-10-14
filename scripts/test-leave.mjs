import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {databaseClient,safeFailure} from "./database-client.mjs";
const db=databaseClient(),ids=Object.fromEntries(["owner","hr","head_admin","admin","coveradmin","teacher","coverteacher","otherteacher","finance","parent"].map(k=>[k,randomUUID()]));
const childId="leave-"+randomUUID(),lessonId="leave-class-"+randomUUID();let count=0;
const pass=s=>{count++;console.log("PASS "+s);};
async function as(k){await db.query("reset role");await db.query("set local role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[ids[k],JSON.stringify({sub:ids[k],role:"authenticated"})]);}
async function root(){await db.query("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[ids.owner,JSON.stringify({sub:ids.owner,role:"authenticated"})]);}
async function reject(label,sql,args=[],code="42501"){await db.query("savepoint denied");try{await db.query(sql,args);assert.fail(label);}catch(e){assert.equal(e.code,code,label);await db.query("rollback to savepoint denied");}await db.query("release savepoint denied");pass(label);}
const action=(k,id=null,staff=null,route=null,kind=null,start=null,end=null,reason=null,student=null,cover=null)=>db.query("select public.pw_leave_action($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id",[k,id,staff,route,kind,start,end,reason,student,cover]);
try{
 await db.connect();await db.query("begin");
 for(const [label,id] of Object.entries(ids)){
  await db.query("insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values($1,$2,$3,now(),now())",[id,`${id}@leave-test.invalid`,JSON.stringify({name:"Isolated "+label})]);
  await db.query("update public.pw_profiles set role=$2,status='active' where id=$1",[id,label==="owner"?"super_admin":["coverteacher","otherteacher"].includes(label)?"teacher":label==="coveradmin"?"admin":label]);
 }
 await db.query("update public.pw_profiles set head_admin_id=$2 where id=any($1::uuid[])",[Object.values(ids),ids.head_admin]);
 const child={id:childId,name:"Isolated learner",dob:"2017-01-01",parentName:"Isolated guardian",parentEmail:"fixture@leave-test.invalid",teacherName:"Isolated teacher",adminName:"Isolated admin",instrument:"Piano",timezone:"Africa/Lagos",consent:false,rank:"Novice",songsDone:[],songsToDo:[],status:"active",monthlyLessons:4,lessonsTaken:0};
 await db.query("insert into public.pw_students(id,parent_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[childId,ids.parent,ids.teacher,ids.admin,child]);
 const start=new Date(Date.now()+24*3600000),end=new Date(Date.now()+48*3600000),at=new Date(start.getTime()+3600000);
 const lesson={id:lessonId,studentId:childId,studentName:child.name,parentName:child.parentName,teacherId:ids.teacher,teacherName:child.teacherName,adminId:ids.admin,adminName:child.adminName,title:"Isolated leave class",startsAt:at.toISOString(),timezone:"Africa/Lagos",kind:"standard",status:"scheduled",notes:"",nextTopics:""};
 await db.query("insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[lessonId,childId,ids.teacher,ids.admin,lesson]);
 await as("parent");await reject("Families cannot request staff leave","select public.pw_leave_action('request',null,$1,'hr','leave',$2,$3,'Invalid staff request')",[ids.parent,start,end]);
 await as("teacher");const leave=(await action("request",null,null,"head_admin","sick_leave",start,end,"Private health reason for isolated fixture")).rows[0].id;pass("Staff requests dated leave through Head Admin");
 await reject("Teacher cannot approve leave","select public.pw_leave_action('hr_approve',$1,null,null,null,null,null,'Self approval')",[leave]);
 await as("hr");await reject("Head-routed requests must be forwarded before HR approval","select public.pw_leave_action('hr_approve',$1,null,null,null,null,null,'Approved review')",[leave]);
 await as("head_admin");await action("forward",leave);pass("Head Admin forwards request to HR");
 await as("hr");await action("hr_approve",leave,null,null,null,null,null,"HR approves official dated leave");pass("Independent HR approves and routes for cover");
 await as("head_admin");await reject("Finalization requires complete active learner cover","select public.pw_leave_action('finalize',$1)",[leave],"23514");
 await action("plan",leave,null,null,null,null,null,null,childId,ids.coverteacher);await action("finalize",leave);pass("Head plans compatible cover and finalizes leave");
 const assigned=await db.query("select teacher_id,payload->>'kind' kind from public.pw_lessons where id=$1",[lessonId]);
 assert.equal(assigned.rows[0].teacher_id,ids.coverteacher);assert.equal(assigned.rows[0].kind,"cover");pass("Scheduled class uses actual cover teacher and cover earning kind");
 assert.equal((await db.query("select teacher_id from public.pw_students where id=$1",[childId])).rows[0].teacher_id,ids.teacher);pass("Primary student ownership is preserved");
 await as("coverteacher");assert.equal((await db.query("select count(*)::int n from public.pw_leaves where id=$1",[leave])).rows[0].n,0);pass("Cover teacher cannot read medical reasons");
 assert.equal((await db.query("select count(*)::int n from public.pw_leave_cover_timeline() where id=$1",[leave])).rows[0].n,1);pass("Cover teacher receives sanitized exact timeline");
 assert.equal((await db.query("select public.pw_can_student($1) ok",[childId])).rows[0].ok,false);pass("Temporary dossier access does not start early");
 await root();await db.query("update public.pw_leaves set starts_at=clock_timestamp()-interval '1 hour',ends_at=clock_timestamp()+interval '2 hours' where id=$1",[leave]);
 await db.query("update public.pw_lessons set payload=jsonb_set(payload,'{startsAt}',to_jsonb((clock_timestamp()-interval '10 minutes')::text)) where id=$1",[lessonId]);
 await db.query("select public.pw_reconcile_leaves()");
 assert.equal((await db.query("select status from public.pw_profiles where id=$1",[ids.teacher])).rows[0].status,"on_leave");pass("Worker activates staff status on the exact date");
 await as("coverteacher");assert.equal((await db.query("select public.pw_can_student($1) ok",[childId])).rows[0].ok,true);pass("Cover teacher gains dossier access during approved interval");
 await db.query("update public.pw_lessons set payload=jsonb_set(payload,'{status}','\"teacher_done\"') where id=$1",[lessonId]);pass("Cover teacher marks their actual class done");
 await as("admin");await db.query("update public.pw_lessons set payload=jsonb_set(payload,'{status}','\"completed\"') where id=$1",[lessonId]);pass("Assigned admin verifies actual cover attendance");
 await root();await db.query("update public.pw_leaves set ends_at=clock_timestamp()-interval '1 second' where id=$1",[leave]);await db.query("select public.pw_reconcile_leaves()");
 assert.equal((await db.query("select status from public.pw_profiles where id=$1",[ids.teacher])).rows[0].status,"active");pass("Worker restores staff access when leave ends");
 assert.equal((await db.query("select teacher_id from public.pw_attendance where lesson_id=$1",[lessonId])).rows[0].teacher_id,ids.coverteacher);pass("Expiry cannot rewrite signed cover attendance");
 await as("coverteacher");assert.equal((await db.query("select public.pw_can_student($1) ok",[childId])).rows[0].ok,false);pass("Temporary dossier access expires without waiting for a client refresh");
 await root();assert.equal((await db.query("select public.pw_admin_leave_bonus($1,'2026-11-28',2,900,5) amount",[ids.coveradmin])).rows[0].amount,"2700");pass("No-cover quota calculation remains unchanged");
 const a=new Date("2026-10-27T23:00:00Z"),b=new Date("2026-11-27T23:00:00Z"),span=b-a,c1=new Date(+a+span/4),c2=new Date(+a+span/2),pause=new Date(+a+span*3/8);
 await db.query("update public.pw_salary_history_epoch set begins_at=$1",[new Date(+a-86400000)]);
 const adminLeave=(await db.query("insert into public.pw_leaves(staff_id,submitted_by,route,kind,reason,starts_at,ends_at,state) values($1,$2,'hr','leave','Isolated prorated bonus',$3,$4,'completed') returning id",[ids.admin,ids.owner,c1,c2])).rows[0].id;
 await db.query("insert into public.pw_leave_covers(leave_id,student_id,cover_id,duty,original_id,created_by) values($1,$2,$3,'admin',$4,$5)",[adminLeave,childId,ids.coveradmin,ids.admin,ids.owner]);
 await db.query("insert into public.pw_salary_roster_history(student_id,parent_id,admin_id,student_status,parent_status,recorded_at) values($1,$2,$3,'active','active',$4),($1,$2,$3,'active','paused',$5)",[childId,ids.parent,ids.admin,a,pause]);
 const bonus=(await db.query("select public.pw_admin_leave_bonus($1,'2026-11-28',0,900,0) amount",[ids.coveradmin])).rows[0].amount;assert.equal(bonus,"112.50");pass("Cover excess-parent bonus is prorated exactly and stops at parent pause");
 await db.query("update public.pw_salary_history_epoch set begins_at=$1",[new Date(+a+86400000)]);
 assert.equal((await db.query("select public.pw_admin_leave_bonus($1,'2026-11-28',0,900,0) amount",[ids.coveradmin])).rows[0].amount,null);pass("Missing historical duration facts block automatic bonus instead of guessing");
 await as("head_admin");await reject("Head Admin cannot call private compensation calculator","select public.pw_admin_leave_bonus($1,'2026-11-28',0,900,0)",[ids.coveradmin]);
 await as("admin");const adminRequest=(await action("request",null,null,"hr","exam_break",start,end,"Exam break for isolated admin")).rows[0].id;pass("Administrator can route an exam-break request directly to HR");
 await as("hr");await action("hr_approve",adminRequest,null,null,null,null,null,"Independent HR approves exam break");
 await as("head_admin");await action("plan",adminRequest,null,null,null,null,null,null,childId,ids.coveradmin);
 await action("finalize",adminRequest);pass("HR-first approval is finalized by Head Admin, not HR");
 await root();await db.query("update public.pw_leaves set starts_at=clock_timestamp()-interval '1 hour',ends_at=clock_timestamp()+interval '2 hours' where id=$1",[adminRequest]);await db.query("select public.pw_reconcile_leaves()");
 await as("coveradmin");assert.equal((await db.query("select public.pw_manage_student($1) ok",[childId])).rows[0].ok,true);pass("Cover administrator gains actual scoped verification permission");
 await as("owner");await action("cancel",adminRequest,null,null,null,null,null,"Owner ends the temporary cover");
 await as("coveradmin");assert.equal((await db.query("select public.pw_manage_student($1) ok",[childId])).rows[0].ok,false);pass("Cover administrator loses verification authority when cover ends");
 await root();
 const bad=(await db.query("insert into public.pw_leaves(staff_id,submitted_by,route,kind,reason,starts_at,ends_at,state) values($1,$2,'hr','leave','Isolated changed plan',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '2 hours','approved') returning id",[ids.teacher,ids.owner])).rows[0].id;
 await db.query("insert into public.pw_leave_covers(leave_id,student_id,cover_id,duty,original_id,created_by) values($1,$2,$3,'teacher',$4,$5)",[bad,childId,ids.coverteacher,ids.teacher,ids.owner]);
 const changed={...lesson,id:"changed-"+randomUUID(),teacherId:ids.otherteacher,startsAt:new Date(Date.now()+1800000).toISOString()};
 await db.query("insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[changed.id,childId,ids.otherteacher,ids.admin,changed]);
 const healthy=(await db.query("insert into public.pw_leaves(staff_id,submitted_by,route,kind,reason,starts_at,ends_at,state) values($1,$2,'hr','leave','Isolated healthy plan',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '2 hours','approved') returning id",[ids.finance,ids.owner])).rows[0].id;
 await db.query("select public.pw_reconcile_leaves()");
 assert.match((await db.query("select synchronization_error from public.pw_leaves where id=$1",[bad])).rows[0].synchronization_error,/review/);pass("A changed cover plan exposes an actionable reconciliation error");
 assert.equal((await db.query("select state from public.pw_leaves where id=$1",[healthy])).rows[0].state,"active");pass("One failing leave cannot prevent other leave activation");
 await db.query("rollback");console.log(`${count} leave/cover checks passed; all fixtures rolled back.`);
}catch(e){await db.query("rollback").catch(()=>{});console.error(safeFailure(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
