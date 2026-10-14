import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {databaseClient,safeFailure} from "./database-client.mjs";
const db=databaseClient(),ids=Object.fromEntries(["owner","hr","qc","otherqc","head_admin","finance","sales_marketing","social_media","teacher","admin","parent"].map(k=>[k,randomUUID()]));
let checks=0,label="";
const pass=s=>{checks++;console.log("PASS "+s);};
async function as(k){await db.query("reset role;set local role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[ids[k],JSON.stringify({sub:ids[k],role:"authenticated"})]);}
async function root(){await db.query("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[ids.owner,JSON.stringify({sub:ids.owner,role:"authenticated"})]);}
async function deny(s,action,id,data={},code="42501"){
 label=s;await db.query("savepoint denied");try{await act(action,id,data);assert.fail(s);}catch(e){assert.equal(e.code,code,s);await db.query("rollback to savepoint denied");}await db.query("release savepoint denied");pass(s);
}
const act=(action,id=null,data={})=>db.query("select public.pw_hiring_action($1,$2,$3) id",[action,id,data]);
const note="Isolated evidence recorded for recruitment test";
const review=(id,kind)=>act("review",id,{kind,score:90,passed:true,notes:note});
async function document(id,category){
 const fid=randomUUID();await root();await db.query("insert into public.pw_files(id,uploader_id,category,target_id,path,original_name,mime,bytes,complete) values($1,$2,$3,$4,$5,'Isolated approved PDF','application/pdf',30,true)",[fid,ids.owner,category,id,ids.owner+"/"+fid]);return fid;
}
try{
 await db.connect();await db.query("begin");
 for(const [name,id]of Object.entries(ids)){
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values($1,$2,now(),$3,now(),now())",[id,id+"@hiring-test.invalid",JSON.stringify({name:"Isolated "+name})]);
  await db.query("update public.pw_profiles set role=$2,status=$3 where id=$1",[id,name==="owner"?"super_admin":name==="otherqc"?"qc":name,["teacher","admin"].includes(name)?"applicant":"active"]);
 }
 await as("parent");await deny("Public families cannot create staff applicants","create",null,{name:"Isolated teacher",email:ids.teacher+"@hiring-test.invalid",role:"teacher",reviewerId:ids.qc,notes:note});
 await as("hr");await deny("Teacher applications must route to independent QC","create",null,{name:"Isolated teacher",email:ids.teacher+"@hiring-test.invalid",role:"teacher",reviewerId:ids.head_admin,notes:note},"23514");
 const id=(await act("create",null,{name:"Isolated teacher",email:ids.teacher+"@hiring-test.invalid",role:"teacher",reviewerId:ids.qc,notes:note})).rows[0].id;
 pass("HR routes a real teacher case to QC");
 await act("schedule",id,{at:new Date(Date.now()-3600000).toISOString(),notes:note});
 await deny("Teacher selection requires passing joint interviews and audition","select",id,{notes:note},"23514");
 await review(id,"hr_interview");pass("HR records their immutable scored interview");
 await as("otherqc");assert.equal((await db.query("select count(*) from public.pw_hiring_cases where id=$1",[id])).rows[0].count,"0");pass("Unassigned QC cannot read another supervisor's applicant");
 await deny("Unassigned QC cannot record an audition","review",id,{kind:"audition",score:90,passed:true,notes:note});
 await as("qc");await deny("QC cannot impersonate the HR interviewer","review",id,{kind:"hr_interview",score:90,passed:true,notes:note});
 await review(id,"department_interview");await review(id,"audition");pass("Assigned QC records actual joint interview and teacher audition");
 await as("hr");await act("select",id,{notes:note});pass("Passing joint evidence selects the candidate");
 await deny("HR cannot grant a staff identity","bind",id,{staffId:ids.teacher,notes:note});
 await as("owner");await deny("Owner cannot link the wrong account or role","bind",id,{staffId:ids.admin,notes:note},"23514");
 await act("bind",id,{staffId:ids.teacher,notes:note});pass("Owner links an applicant identity without activating staff access");
 await root();await db.query("savepoint activation_guard");
 try{await db.query("update public.pw_profiles set status='active' where id=$1",[ids.teacher]);assert.fail("Premature activation");}catch(e){assert.equal(e.code,"23514");await db.query("rollback to savepoint activation_guard");}
 await db.query("release savepoint activation_guard");pass("Other account-status paths cannot bypass linked hiring requirements");
 await as("teacher");assert.equal((await db.query("select count(*) from public.pw_hiring_cases where id=$1",[id])).rows[0].count,"1");assert.equal((await db.query("select count(*) from public.pw_hiring_reviews where case_id=$1",[id])).rows[0].count,"0");pass("Applicant sees their own case, not confidential interviews");
 await deny("Applicant cannot activate their own account","activate",id,{notes:note});
 await deny("Applicant cannot accept missing approved documents","accept",id,{signedName:"Isolated teacher",agreed:true});
 await as("qc");await review(id,"training");pass("Assigned QC records completed curriculum and classroom training");
 const terms={monthlyStudentRate:25000,trialRate:1000,coverRate:1000,baseSalary:0,adminExtraParentRate:0,adminQuota:0,advanceEligible:false,currency:"NGN",managementFirstPeriod:"manual_adjustment"};
 const rate=(await db.query("select public.pw_propose_salary_rate($1,'2026-10-27',$2,$3) id",[ids.teacher,terms,note])).rows[0].id;
 await as("owner");await db.query("select public.pw_decide_salary_rate($1,'approve',$2)",[rate,note]);
 const guidelines=await document(id,"hiring_guidelines"),agreement=await document(id,"hiring_agreement");
 await as("qc");await act("document",id,{kind:"guidelines",fileId:guidelines,notes:note});
 await as("hr");await deny("Only the owner approves actual employment agreements","document",id,{kind:"agreement",fileId:agreement,notes:note});
 await as("owner");await act("document",id,{kind:"agreement",fileId:agreement,notes:note});
 await as("teacher");assert.equal((await db.query("select count(*) from public.pw_files where id=any($1::uuid[])",[[guidelines,agreement]])).rows[0].count,"2");pass("Applicant can read their approved private guidelines and agreement PDFs");
 await deny("A wrong typed signature is rejected","accept",id,{signedName:"Another person",agreed:true});
 await act("accept",id,{signedName:"Isolated teacher",agreed:true});pass("Verified applicant accepts their current agreement and guidelines");
 await as("qc");await deny("Finance handoff cannot guess unapproved pay or missing bank details","handoff",id,{startDate:"2026-10-28",notes:note},"23514");
 await db.query("select public.pw_record_salary_bank($1,'Isolated bank','Isolated teacher','TEST0000001','','NGN')",[ids.teacher]);pass("QC negotiates initial agreed pay and captures private bank instructions");
 await as("hr");await deny("HR cannot substitute for QC finalized teacher data","handoff",id,{startDate:"2026-10-28",notes:note});
 await as("qc");await act("handoff",id,{startDate:"2026-10-28",notes:note});pass("QC finalizes teacher onboarding with approved pay, bank, training and acceptance");
 assert.equal((await db.query("select count(*) from public.pw_files where id=$1",[agreement])).rows[0].count,"0");pass("QC cannot retrieve employment pay PDFs after finalized handoff");
 await as("finance");const handoffs=(await db.query("select public.pw_hiring_handoffs() result")).rows[0].result;assert(handoffs.some(x=>x.id===id));assert(!("notes" in handoffs.find(x=>x.id===id)));pass("Finance receives the persisted sanitized onboarding handoff");
 assert.equal((await db.query("select count(*) from public.pw_hiring_reviews where case_id=$1",[id])).rows[0].count,"0");pass("Finance does not receive private recruitment reviews");
 await as("owner");const changedRate=(await db.query("select public.pw_propose_salary_rate($1,'2026-10-28',$2,$3) id",[ids.teacher,{...terms,monthlyStudentRate:30000},note])).rows[0].id;
 await db.query("select public.pw_decide_salary_rate($1,'approve',$2)",[changedRate,note]);
 await deny("A changed salary offer cannot bypass the applicant's accepted agreement","activate",id,{notes:note},"23514");
 await act("return",id,{notes:"Owner returns changed offer for new agreement and acceptance"});pass("Finalized onboarding can return for documented corrections");
 const corrected=await document(id,"hiring_agreement");await as("owner");await act("document",id,{kind:"agreement",fileId:corrected,notes:"Owner publishes corrected offer agreement"});
 await as("teacher");await act("accept",id,{signedName:"Isolated teacher",agreed:true});
 await as("qc");await act("handoff",id,{startDate:"2026-10-28",notes:note});pass("Corrected pay requires fresh applicant acceptance and QC handoff");
 await as("owner");await act("activate",id,{notes:note});pass("Only owner activation turns finalized applicant into active staff");
 await as("teacher");assert.equal((await db.query("select status from public.pw_profiles where id=$1",[ids.teacher])).rows[0].status,"active");
 const revoked=(await db.query("select public.pw_hiring_directory() result")).rows[0].result;assert.equal(revoked.length,0);pass("An active teacher still cannot list other staff hiring identities");
 await as("hr");const adminCase=(await act("create",null,{name:"Isolated admin",email:ids.admin+"@hiring-test.invalid",role:"admin",reviewerId:ids.head_admin,notes:note})).rows[0].id;
 await act("schedule",adminCase,{at:new Date(Date.now()-3600000).toISOString(),notes:note});await review(adminCase,"hr_interview");
 await as("head_admin");await review(adminCase,"department_interview");pass("Regular Admin recruitment uses independent HR and Head Admin interview");
 await as("hr");await act("select",adminCase,{notes:note});pass("Joint Admin interview selects without a teacher audition");
 for(const role of["head_admin","qc","hr","finance","sales_marketing","social_media"]){
  await as("hr");const supervisor=["head_admin","qc","hr"].includes(role)?"owner":role;
  const cid=(await act("create",null,{name:"Isolated "+role+" applicant",email:randomUUID()+"@hiring-test.invalid",role,reviewerId:ids[supervisor],notes:note})).rows[0].id;
  await act("schedule",cid,{at:new Date(Date.now()-3600000).toISOString(),notes:note});await review(cid,"hr_interview");
  await as(supervisor);await review(cid,"department_interview");await as("hr");await act("select",cid,{notes:note});
  pass("Department-appropriate joint recruitment works for "+role);
 }
 await db.query("rollback");console.log(`${checks} hiring workflow checks passed; all fixtures rolled back. No real staff activated or email sent.`);
}catch(e){await db.query("rollback").catch(()=>{});console.error(label||"Hiring fixture failure");console.error(safeFailure(e));process.exitCode=1;}finally{await db.end();}
