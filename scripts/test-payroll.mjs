import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { databaseClient,safeFailure } from "./database-client.mjs";
const db=databaseClient();
const ids=Object.fromEntries(["owner","finance","teacher","otherteacher","admin","parent","otherparent","thirdparent","qc","hr"].map(k=>[k,randomUUID()]));
const prefix=`salary-test-${randomUUID().slice(0,8)}`;
let passed=0;
const pass=m=>{passed++;console.log(`PASS ${m}`);};
// Fiscal fixtures move with the actual WAT date. No hardcoded future deadline
// expires and no test overrides production clock/security functions.
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const [year,month,day]=today.split("-").map(Number);
const nextMonth=new Date(Date.UTC(year,month-1+(day>=28?1:0),28));
const months={8:new Date(Date.UTC(nextMonth.getUTCFullYear(),nextMonth.getUTCMonth()-2,1)),9:new Date(Date.UTC(nextMonth.getUTCFullYear(),nextMonth.getUTCMonth()-1,1)),10:new Date(Date.UTC(nextMonth.getUTCFullYear(),nextMonth.getUTCMonth(),1))};
function shiftedDate(value) {
 if(typeof value!=="string")return value;
 return value.replace(/2026-(08|09|10)-(\d{2})(T\d{2}:00:00Z)?/g,(_,m,d,time="")=>{
  if(m==="10"&&d==="14")return today+time;
  let base=months[Number(m)];
  if(m==="09"&&Number(d)>28&&base.getUTCFullYear()===year&&base.getUTCMonth()===month-1)
   base=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()-1,1));
  const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();
  const mappedDay=Math.min(Number(d),last);
  if(Number(d)>28&&last===28&&time)time=Number(d)===29?"T10:00:00Z":"T14:00:00Z";
  const date=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),mappedDay));
  if(m==="10"&&d==="30"&&mappedDay===28&&time)time="T16:00:00Z";
  return date.toISOString().slice(0,10)+time;
 });
}
const query=async(sql,params=[])=> (await db.query(shiftedDate(sql),params.map(shiftedDate))).rows;
async function as(role) {
  await db.query("reset role");await db.query("set local role authenticated");
  await query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[ids[role],JSON.stringify({sub:ids[role],role:"authenticated"})]);
}
async function reject(label,sql,params,codes) {
  await db.query("savepoint rejected");
  try {await query(sql,params);throw new Error(`${label}: unexpectedly permitted`);}
  catch(e){if(!codes.includes(e.code))throw e;await db.query("rollback to savepoint rejected");pass(label);}
  await db.query("release savepoint rejected");
}
const initial={monthlyStudentRate:20000.01,trialRate:2000,coverRate:3000,baseSalary:0,adminExtraParentRate:0,adminQuota:12,advanceEligible:true,currency:"NGN",managementFirstPeriod:"full_month"};
async function proposal(staff,terms,date="2026-08-01") {
  return (await query("select public.pw_propose_salary_rate($1,$2,$3,$4) id",[ids[staff],date,JSON.stringify(terms),"Initial agreed test contract"]))[0].id;
}
async function preview(date) {return (await query("select public.pw_preview_salary($1) data",[date]))[0].data;}
async function lesson(key,student,starts,kind="standard",staff="teacher",extra={}) {
  await as("owner");
  const id=`${prefix}-${key}`;
  await query("insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",
   [id,student,ids[staff],ids.admin,JSON.stringify({id,studentId:student,studentName:`Test ${student}`,teacherId:ids[staff],teacherName:`Salary test ${staff}`,adminId:ids.admin,adminName:"Salary test admin",title:"Test lesson",instrument:"Piano",studentTimezone:"Africa/Lagos",startsAt:starts,kind,status:"scheduled",notes:"",nextTopics:"",...extra})]);
  return id;
}
async function verify(id) {
  await as("admin");await query("update public.pw_lessons set payload=payload||'{\"status\":\"completed\"}' where id=$1",[id]);
}
try {
 await db.connect();await db.query("begin");
 for(const [role,id] of Object.entries(ids)) {
  await query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",[id,`${id}@salary-test.invalid`,JSON.stringify({name:`Salary test ${role}`})]);
  await query("update public.pw_profiles set role=$1,status='active',name=$2 where id=$3",[role==="owner"?"super_admin":role==="otherteacher"?"teacher":role.endsWith("parent")?"parent":role,`Salary test ${role}`,id]);
 }
 await query("update public.pw_profiles set qc_id=$1 where id=$2",[ids.qc,ids.teacher]);
 await as("owner");
 const child1=`${prefix}-child1`,child2=`${prefix}-child2`,paused=`${prefix}-paused`,child4=`${prefix}-child4`,child5=`${prefix}-child5`;
 for(const [id,parent,status,teacher] of [[child1,"parent","active","teacher"],[child2,"parent","active","teacher"],[paused,"otherparent","paused","otherteacher"],[child4,"thirdparent","active","otherteacher"],[child5,"thirdparent","active","otherteacher"]]) {
  await query("insert into public.pw_students(id,parent_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",
   [id,ids[parent],ids[teacher],ids.admin,JSON.stringify({id,name:`Test ${id}`,status,rank:"Novice",consent:false,timezone:"Africa/Lagos",teacherName:`Salary test ${teacher}`,adminName:"Salary test admin",monthlyLessons:teacher==="teacher"&&id===child2?8:4})]);
 }
 await as("owner");
 const settings=(await query("select settings,revision from public.pw_settings"))[0];
 await query("select public.pw_save_settings($1,$2)",[settings.revision,JSON.stringify({...settings.settings,payrollWeekAnchor:"calendar_month",advanceEligibility:"owner_selected",vacationAutoApprove:false})]);
 const teacherRate=await proposal("teacher",initial);
 const otherRate=await proposal("otherteacher",{...initial,monthlyStudentRate:80.01,currency:"GBP",advanceEligible:false});
 const adminRate=await proposal("admin",{...initial,monthlyStudentRate:0,baseSalary:10000,adminQuota:1,adminExtraParentRate:1000,advanceEligible:false});
 for(const id of [teacherRate,otherRate,adminRate])await query("select public.pw_decide_salary_rate($1,'approve','Confirmed initial agreement')",[id]);
 const missingPortfolio=await preview("2026-09-28");
 assert(missingPortfolio.issues.some(i=>i.staffId===ids.admin));
 pass("A historical admin bonus never guesses the past count from today's roster");
 await as("finance");await reject("Finance cannot confirm its own historical bonus basis","select public.pw_confirm_salary_parent_count($1,'2026-09-28',2,'Archived source fixture')",[ids.admin],["42501"]);
 await as("owner");
 await query("select public.pw_confirm_salary_parent_count($1,'2026-09-28',2,'Verified archived portfolio report for salary fixture')",[ids.admin]);
 await query("select public.pw_confirm_salary_parent_count($1,'2026-08-28',2,'Verified archived portfolio report for salary fixture')",[ids.admin]);
 await as("finance");
 await query("select public.pw_confirm_course($1,'2026-08-01','2026-08-01',1)",[child1]);
 await query("select public.pw_confirm_course($1,'2026-08-01','2026-08-01',2)",[child2]);
 await query("select public.pw_confirm_course($1,'2026-09-16','2026-09-16',1)",[child4]);
 await query("select public.pw_confirm_course($1,'2026-09-01','2026-09-01',1)",[child5]);
 await as("parent");
 await reject("Parents cannot calculate staff salaries","select public.pw_preview_salary('2026-09-28')",[],["42501"]);
 await reject("Parents cannot change course pay terms","select public.pw_confirm_course($1,'2026-08-01','2026-08-01',1)",[child1],["42501"]);
 await reject("Parents cannot create salary proposals","select public.pw_propose_salary_rate($1,'2026-08-01',$2,'Unauthorized test proposal')",[ids.teacher,JSON.stringify(initial)],["42501"]);
 await reject("Browser callers cannot invoke the unscoped calculator","select public.pw_calculate_salary('2026-09-28')",[],["42501"]);
 for(const day of [2,9,16,23,27]) {const id=await lesson(`once-${day}`,child1,`2026-09-${String(day).padStart(2,"0")}T10:00:00Z`,"standard","teacher",day===9?{durationMinutes:180,durationReason:"Family requested this longer class"}:{});await verify(id);}
 for(const day of [17,24]) {const id=await lesson(`midmonth-${day}`,child4,`2026-09-${day}T10:00:00Z`,"standard","otherteacher");await verify(id);}
 for(const day of [1,8]) {const id=await lesson(`rounding-early-${day}`,child5,`2026-09-${String(day).padStart(2,"0")}T10:00:00Z`,"standard","otherteacher");await verify(id);}
 const lateRounding=[];
 for(const day of [15,22])lateRounding.push(await lesson(`rounding-late-${day}`,child5,`2026-09-${day}T10:00:00Z`,"standard","otherteacher"));
 for(const day of [2,5,9,12,16,19,23,26]) {const id=await lesson(`twice-${day}`,child2,`2026-09-${String(day).padStart(2,"0")}T13:00:00Z`);await verify(id);}
 for(const kind of ["trial","cover"]) {const id=await lesson(kind,child1,`2026-09-${kind==="trial"?"06":"07"}T15:00:00Z`,kind);await verify(id);}
 const unverified=await lesson("unverified",child1,"2026-09-25T15:00:00Z");
 await as("finance");
 let data=await preview("2026-09-28");
 const teacher=data.statements.find(s=>s.staffId===ids.teacher);
 const admin=data.statements.find(s=>s.staffId===ids.admin);
 assert.equal(Number(teacher.net),65000.03);pass("Four-part rounding preserves the exact agreed monthly amounts");
 assert.equal(Number(data.statements.find(s=>s.staffId===ids.otherteacher).net),80.02);
 assert(data.statements.find(s=>s.staffId===ids.otherteacher).items.filter(i=>i.kind==="standard"&&i.data.studentId===child4).every(i=>i.data.weekTier===3&&i.data.startDate===shiftedDate("2026-09-16")));
 pass("A Week 3 exact start is limited to 2/4 of the monthly child rate");
 pass("A five-week month and an agreed three-hour class do not increase the fixed monthly teacher rate");
 assert.equal(teacher.items.filter(i=>i.kind==="standard").length,12);pass("1x and 2x frequency caps count four and eight verified classes");
 assert.equal(teacher.items.filter(i=>i.kind==="trial")[0].amount,2000);pass("Trial earnings are separate");
 assert.equal(teacher.items.filter(i=>i.kind==="cover")[0].amount,3000);pass("Cover earnings are separate");
 assert(!teacher.items.some(i=>i.data.lessonId===unverified));pass("Unverified lessons never become earned salary");
 assert.equal(Number(admin.net),11000);pass("Admin parents are distinct across siblings and paused children do not earn capacity bonuses");
 await db.query("reset role");
 await query("update public.pw_profiles set status='restricted' where id=$1",[ids.admin]);
 await as("finance");
 let d4Preview=await preview("2026-09-28");
 let d4Admin=d4Preview.statements.find(s=>s.staffId===ids.admin);
 assert(!d4Admin || Number(d4Admin.net)===0);
 assert(d4Preview.issues.some(i=>i.staffId===ids.admin && i.message.includes("Base salary withheld")));
 pass("D4: Restricted staff has fixed base salary and capacity bonus withheld");
 await db.query("reset role");
 await query("update public.pw_profiles set status='paused' where id=$1",[ids.admin]);
 await as("finance");
 d4Preview=await preview("2026-09-28");
 d4Admin=d4Preview.statements.find(s=>s.staffId===ids.admin);
 assert(!d4Admin || Number(d4Admin.net)===0);
 assert(d4Preview.issues.some(i=>i.staffId===ids.admin && i.message.includes("Base salary withheld")));
 pass("D4: Paused staff has fixed base salary and capacity bonus withheld");
 await db.query("reset role");
 await query("update public.pw_profiles set status='on_leave' where id=$1",[ids.admin]);
 await as("finance");
 d4Preview=await preview("2026-09-28");
 d4Admin=d4Preview.statements.find(s=>s.staffId===ids.admin);
 assert.equal(Number(d4Admin.items.find(i=>i.kind==='base').amount),10000);
 pass("D4: Staff on leave retains agreed base salary");
 await db.query("reset role");
 await query("update public.pw_profiles set status='active' where id=$1",[ids.admin]);
 await as("teacher");
 data=await preview("2026-09-28");
 assert(data.statements.every(s=>s.staffId===ids.teacher));pass("The live wallet calculates only the signed-in staff member");
 await reject("Teachers cannot propose their own pay raise","select public.pw_propose_salary_rate($1,'2026-12-01',$2,'Unauthorized raise')",[ids.teacher,JSON.stringify(initial)],["42501"]);
 await as("qc");
 const rates=await query("select * from public.pw_salary_rates where status='approved'");assert(rates.every(r=>r.staff_id===ids.qc));pass("QC cannot read other staff salary history");
 await reject("QC cannot raise an already-approved teacher rate","select public.pw_propose_salary_rate($1,'2026-12-01',$2,'Unauthorized QC raise')",[ids.teacher,JSON.stringify(initial)],["42501"]);
 await as("finance");
 await reject("Raises cannot be proposed after their effective date","select public.pw_propose_salary_rate($1,'2026-09-01',$2,'Backdated raise test')",[ids.teacher,JSON.stringify(initial)],["PW101"]);
 const batch=(await query("select public.pw_generate_salary('2026-09-28') id"))[0].id;
 let statement=(await query("select * from public.pw_salary_statements where batch_id=$1 and staff_id=$2",[batch,ids.teacher]))[0];
 await reject("Finance cannot approve its own prepared batch","select public.pw_salary_transition($1,'approve')",[batch],["42501"]);
 await query("select public.pw_adjust_salary($1,'bonus',2500,'Exceptional support bonus')",[statement.id]);
 await query("select public.pw_adjust_salary($1,'deduction',500,'Agreed test correction')",[statement.id]);
 await query("select public.pw_adjust_salary($1,'loan_deduction',1000,'Agreed loan repayment')",[statement.id]);
 statement=(await query("select * from public.pw_salary_statements where id=$1",[statement.id]))[0];
 assert.equal(Number(statement.net),66000.03);pass("Bonuses, deductions and loans have exact signed effects");
 await reject("An unexplained deduction is rejected","select public.pw_adjust_salary($1,'deduction',500,'')",[statement.id],["22023"]);
 await query("select public.pw_generate_salary('2026-09-28')");
 statement=(await query("select * from public.pw_salary_statements where batch_id=$1 and staff_id=$2",[batch,ids.teacher]))[0];
 assert.equal(Number(statement.net),66000.03);assert.equal(statement.adjustments.length,3);pass("Regeneration retains explicit adjustment amounts and reasons");
 await query("select public.pw_adjust_salary($1,'deduction',0,'Reverse discretionary bonus',$2)",[statement.id,statement.adjustments.find(a=>a.kind==="bonus").id]);
 await as("teacher");
 assert.equal((await query("select id from public.pw_salary_statements where batch_id=$1",[batch])).length,1);pass("Teachers cannot read another employee's batch statement");
 assert.equal((await query("select id from public.pw_salary_batches where id=$1",[batch])).length,1);pass("Teachers can see their own batch's safe header");
 await reject("Teachers cannot expose the full financial batch snapshot","select snapshot from public.pw_salary_batches where id=$1",[batch],["42501"]);
 await reject("Salary tables cannot be edited through browser credentials","update public.pw_salary_statements set net=1 where id=$1",[statement.id],["42501"]);
 await as("owner");
 await reject("Owner cannot bypass the Finance preparation step","select public.pw_generate_salary('2026-09-28')",[],["42501"]);
 await reject("Owner cannot approve a batch before Finance submits it","select public.pw_salary_transition($1,'approve')",[batch],["40001"]);
 await as("finance");await query("select public.pw_salary_transition($1,'submit')",[batch]);
 await as("owner");await query("select public.pw_salary_transition($1,'reject','Confirm corrected bonus amounts')",[batch]);
 await as("finance");await query("select public.pw_salary_transition($1,'submit')",[batch]);
 await as("owner");await query("select public.pw_salary_transition($1,'approve')",[batch]);
 assert.equal((await query("select status from public.pw_salary_batches where id=$1",[batch]))[0].status,"approved");pass("Finance submit, owner return, resubmit and independent approval persist");
 await as("finance");
 await reject("Approved salaries cannot be adjusted","select public.pw_adjust_salary($1,'bonus',1,'Late invalid edit')",[statement.id],["40001"]);
 await reject("Approved batches cannot be regenerated","select public.pw_generate_salary('2026-09-28')",[],["40001"]);
 for(const id of lateRounding)await verify(id);
 await as("finance");
 const latePreview=await preview("2026-10-28");
 assert.equal(Number(latePreview.statements.find(s=>s.staffId===ids.otherteacher&&s.currency==="GBP").net),40);
 pass("Late verification continues cumulative rounding instead of overpaying an extra penny");
 await reject("Disbursement requires actual-transfer confirmation","select public.pw_mark_salary_paid($1,'TEST-TRANSFER-REFERENCE',false)",[statement.id],["22023"]);
 await reject("Disbursement requires matching confidential bank instructions","select public.pw_mark_salary_paid($1,'TEST-TRANSFER-REFERENCE',true)",[statement.id],["PW107"]);
 await query("select public.pw_record_salary_bank($1,'Test bank','Test teacher','TESTBANK12345','','NGN')",[ids.teacher]);
 await as("qc");
 assert.equal((await query("select account_number from public.pw_salary_banks where staff_id=$1",[ids.teacher])).length,0);pass("QC cannot retrieve submitted private bank details");
 await as("teacher");
 await reject("Teachers cannot mark their own salary paid","select public.pw_mark_salary_paid($1,'TEST-TRANSFER-REFERENCE',true)",[statement.id],["42501"]);
 await as("finance");await query("select public.pw_mark_salary_paid($1,'TEST-TRANSFER-REFERENCE',true)",[statement.id]);
 assert((await query("select paid_at from public.pw_salary_statements where id=$1",[statement.id]))[0].paid_at);pass("An authorized confirmed manual transfer is recorded without a banking API call");
 await reject("The same transfer cannot be recorded twice","select public.pw_mark_salary_paid($1,'TEST-TRANSFER-REFERENCE',true)",[statement.id],["40001"]);
 const settled=await lesson("prepaid-settled",child1,"2026-09-29T10:00:00Z");await verify(settled);
 const missed=await lesson("prepaid-missed",child1,"2026-09-30T10:00:00Z");
 await db.query("reset role");
 for(const id of [settled,missed])await query("insert into public.pw_salary_claims(source_key,statement_id,staff_id,amount,currency,meta) values($1,$2,$3,5000.01,'NGN',$4)",
  [`advance:${id}`,statement.id,ids.teacher,JSON.stringify({lessonId:id,studentId:child1,startsAt:`2026-09-${id===settled?"29":"30"}T10:00:00Z`})]);
 await as("owner");
 const futureRate=await proposal("teacher",{...initial,currency:"GBP",monthlyStudentRate:80},"2026-10-14");
 await query("select public.pw_decide_salary_rate($1,'approve','Future currency agreement confirmed')",[futureRate]);
 await lesson("future-first",child1,"2026-10-28T14:00:00Z");await lesson("future-second",child1,"2026-10-30T14:00:00Z");
 await as("finance");data=await preview("2026-10-28");
 const own=data.statements.filter(s=>s.staffId===ids.teacher);
 assert.equal(own.find(s=>s.currency==="GBP").net,40);pass("Owner-eligible future advances use their approved effective rate and currency");
 assert.equal(own.find(s=>s.currency==="NGN").net,-5000.01);pass("Missed/unverified prior advances are recouped at the original amount, not the new rate");
 assert(own.flatMap(s=>s.items).some(i=>i.kind==="advance_settled"&&i.amount===0));pass("A verified prepaid lesson is reconciled without being paid twice");
 assert.equal(own.length,2);pass("Different currencies are separate statements, never guessed conversions");
 const futureBatch=(await query("select public.pw_generate_salary('2026-10-28') id"))[0].id;
 await reject("A future payroll cannot be submitted before the 28th","select public.pw_salary_transition($1,'submit')",[futureBatch],["PW105"]);
 await as("owner");
 const s=(await query("select settings,revision from public.pw_settings"))[0];
 await query("select public.pw_save_settings($1,$2)",[s.revision,JSON.stringify({...s.settings,vacationAutoApprove:true})]);
 await as("finance");
 const autoBatch=(await query("select public.pw_generate_salary('2026-08-28') id"))[0].id;
 await query("select public.pw_salary_transition($1,'submit')",[autoBatch]);
 assert.equal((await query("select approval_mode from public.pw_salary_batches where id=$1",[autoBatch]))[0].approval_mode,"owner_vacation_delegation");pass("Vacation auto-approval requires the actual owner's recorded delegation");
 await db.query("rollback");
 console.log(`${passed} salary checks passed; fixtures rolled back. No email, room, or bank transfer was initiated.`);
}catch(e){await db.query("rollback").catch(()=>{});console.error(safeFailure(e));if(e.code==="42703")console.error(e.message);process.exitCode=1;}
finally{await db.end();}
