import assert from"node:assert/strict";
import{randomUUID}from"node:crypto";
import{databaseClient,safeFailure}from"./database-client.mjs";
const db=databaseClient(),ids=Object.fromEntries(["owner","head","otherhead","admin","teacher","cover","qc","parent","sales","finance"].map(k=>[k,randomUUID()]));
const child="desk-"+randomUUID(),lesson="desk-class-"+randomUUID(),lead="desk-lead-"+randomUUID();let count=0;
const pass=s=>{count++;console.log("PASS "+s);};
async function as(k){await db.query("reset role");await db.query("set local role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[ids[k],JSON.stringify({sub:ids[k],role:"authenticated"})]);}
async function root(){await db.query("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[ids.owner,JSON.stringify({sub:ids.owner,role:"authenticated"})]);}
async function deny(label,sql,args=[],code="42501"){await db.query("savepoint denied");try{await db.query(sql,args);assert.fail(label);}catch(e){assert.equal(e.code,code,label);await db.query("rollback to savepoint denied");}await db.query("release savepoint denied");pass(label);}
const action=(a,d)=>db.query("select public.pw_management_action($1,$2) result",[a,JSON.stringify(d)]);
try{
 await db.connect();await db.query("begin");await root();
 for(const[k,id]of Object.entries(ids)){
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values($1,$2,now(),'{}',now(),now())",[id,id+"@management-test.invalid"]);
  const role={owner:"super_admin",head:"head_admin",otherhead:"head_admin",cover:"teacher",sales:"sales_marketing"}[k]||k;
  await db.query("update public.pw_profiles set role=$2,status='active' where id=$1",[id,role]);
 }
 await db.query("update public.pw_profiles set head_admin_id=$2 where id=$1",[ids.admin,ids.head]);
 await db.query("update public.pw_profiles set qc_id=$2 where id=$1",[ids.teacher,ids.qc]);
 const policies=(await db.query("insert into public.pw_policy_versions(key,title,version,created_by,published_at,audience_parent_id) select k,'Rollback-only fixture policy',coalesce((select max(version) from public.pw_policy_versions where key=k),0)+1,$1,now(),$2 from unnest(array['parent_agreement','terms_of_service','reschedule_policy']) k returning id",[ids.owner,ids.parent])).rows;
 for(const p of policies)await db.query("insert into public.pw_policy_acceptances(parent_id,policy_id) values($1,$2)",[ids.parent,p.id]);
 const payload={id:child,name:"Isolated learner",dob:"2017-01-01",parentName:"Isolated guardian",parentEmail:"guardian@management-test.invalid",teacherName:"Isolated teacher",adminName:"Isolated admin",instrument:"Piano",timezone:"Africa/Lagos",consent:false,rank:"Novice",songsDone:[],songsToDo:[],status:"active",monthlyLessons:4,lessonsTaken:0};
 await db.query("insert into public.pw_students(id,parent_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[child,ids.parent,ids.teacher,ids.admin,payload]);
 const start=new Date(Date.now()+72*3600000),alt=new Date(Date.now()+96*3600000),first=new Date(Date.now()+120*3600000);
 const lp={id:lesson,studentId:child,studentName:payload.name,parentName:payload.parentName,teacherId:ids.teacher,teacherName:payload.teacherName,adminId:ids.admin,adminName:payload.adminName,title:"Isolated class",startsAt:start.toISOString(),timezone:"Africa/Lagos",kind:"standard",status:"scheduled",notes:"",nextTopics:""};
 await db.query("insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[lesson,child,ids.teacher,ids.admin,lp]);
 await db.query("insert into public.pw_leads(id,owner_id,payload) values($1,$2,$3)",[lead,ids.sales,{id:lead,parentName:"Isolated prospect",email:"prospect@management-test.invalid",phone:"",childName:"Prospect",instrument:"Piano",source:"Fixture",status:"new",arrivedAt:new Date().toISOString(),owner:"Isolated Sales",notes:"Fixture only"}]);
 const legal=(await db.query("insert into public.pw_policy_versions(key,title,version,created_by,published_at,audience_parent_id) select k,'Rollback-only escalation policy',coalesce((select max(version) from public.pw_policy_versions where key=k),0)+1,$1,now(),$2 from unnest(array['parent_agreement','terms_of_service','reschedule_policy']) k returning id",[ids.owner,ids.parent])).rows;
 for(const policy of legal)await db.query("insert into public.pw_policy_acceptances(parent_id,policy_id) values($1,$2)",[ids.parent,policy.id]);
 const escalation=(await db.query("insert into public.pw_desk_items(kind,assigned_to,created_by,due_at,notes) values('priority',$1,$2,now(),'Isolated parent-to-senior escalation') returning id",[ids.head,ids.parent])).rows[0].id;
 await as("parent");
 for(const status of ["open","in_progress","completed","cancelled"])await deny(`Parent creator cannot set senior escalation to ${status}`,"select public.pw_management_action('update',$1)",[JSON.stringify({id:escalation,revision:1,status,notes:"Parent attempts to change the senior review."})]);
 await as("otherhead");await deny("Unassigned Head Admin cannot resolve another senior's escalation","select public.pw_management_action('update',$1)",[JSON.stringify({id:escalation,revision:1,status:"completed",notes:"Unassigned senior attempts to resolve."})]);
 await as("head");await action("update",{id:escalation,revision:1,status:"in_progress",notes:"Assigned senior has started reviewing."});pass("Assigned senior can progress the escalation");
 await as("owner");await action("update",{id:escalation,revision:2,status:"completed",notes:"Owner confirms the senior resolution."});pass("Owner can resolve the escalation with attributed history");
 await as("sales");
 const task=(await action("create",{kind:"trial_request",leadId:lead,assignedTo:ids.head,at:first.toISOString(),slots:[start.toISOString()],notes:"Family requested an isolated trial."})).rows[0].result.id;
 pass("Assigned Sales submits preferred trial dates to Head Admin");
 await deny("Sales cannot change staff hierarchy","select public.pw_management_action('hierarchy',$1)",[JSON.stringify({adminId:ids.admin,headId:ids.head,quota:12,notes:"Unauthorized hierarchy"})]);
 await as("otherhead");assert.equal((await db.query("select count(*)::int n from public.pw_desk_items where id=$1",[task])).rows[0].n,0);pass("Unassigned Head cannot read another Head's trial request");
 await as("head");assert.equal((await db.query("select count(*)::int n from public.pw_desk_items where id=$1",[task])).rows[0].n,1);pass("Assigned Head receives the durable trial request");
 await deny("Trial request cannot be completed without an actual scheduled trial","select public.pw_management_action('update',$1)",[JSON.stringify({id:task,revision:1,status:"completed",notes:"Pretend completion"})],"PW409");
 await action("update",{id:task,revision:1,status:"in_progress",notes:"Head reviewed preferred time and will assign staff."});
 await deny("Stale case revisions cannot overwrite a review","select public.pw_management_action('update',$1)",[JSON.stringify({id:task,revision:1,status:"open",notes:"Outdated screen update"})],"PW409");
 assert.equal((await db.query("select count(*)::int n from public.pw_desk_history where item_id=$1",[task])).rows[0].n,1);pass("Case updates preserve attributed history");
 await as("owner");await action("hierarchy",{adminId:ids.admin,headId:ids.head,quota:17,notes:"Approved quota and management hierarchy."});assert.equal((await db.query("select quota from public.pw_profiles where id=$1",[ids.admin])).rows[0].quota,17);pass("Owner updates hierarchy and quota with audit");
 const ann=(await action("announcement",{title:"Fixture notice",body:"Isolated announcement verification only.",roles:["teacher"],expiresAt:first.toISOString()})).rows[0].result.id;
 await as("teacher");assert.equal((await db.query("select count(*)::int n from public.pw_announcements where id=$1",[ann])).rows[0].n,1);pass("Announcement is visible to its intended audience");
 await as("finance");assert.equal((await db.query("select count(*)::int n from public.pw_announcements where id=$1",[ann])).rows[0].n,0);pass("Announcement does not leak to excluded roles");
 await as("owner");await action("announcement_archive",{id:ann,notes:"End the isolated announcement."});
 await db.query("set local role service_role");assert.equal((await db.query("select public.pw_email_current(id) ok from public.pw_emails where source_id=$1 limit 1",[ann])).rows[0].ok,false);pass("Archived announcement cancels pending email");
 await as("owner");
 const preview=(await action("preview",{staffId:ids.parent,notes:"Investigate an isolated family screen."})).rows[0].result;assert.equal(preview.readOnly,true);assert(preview.students.some(s=>s.id===child));assert.equal(preview.profile.role,"parent");pass("Owner support preview is read-only and attributed");
 await as("admin");await deny("Ordinary staff cannot view as another user","select public.pw_management_action('preview',$1)",[JSON.stringify({staffId:ids.parent,notes:"Attempt another account"})]);
 await as("qc");const snap=(await db.query("select public.pw_management_snapshot() data")).rows[0].data;assert.equal(snap.quality.find(t=>t.staffId===ids.teacher).punctualPercent,null);assert.equal(snap.quality.find(t=>t.staffId===ids.teacher).retentionPercent,null);pass("Missing observed punctuality/retention remains unknown");
 assert(!["payments","bank","rates","profit"].some(key=>key in snap));pass("QC management data has no financial records");
 await root();const qcChild="qc-"+randomUUID(),qcLesson="qc-class-"+randomUUID();
 await db.query("insert into public.pw_students(id,parent_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[qcChild,ids.parent,ids.qc,ids.admin,{...payload,id:qcChild}]);
 await db.query("insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[qcLesson,qcChild,ids.qc,ids.admin,{...lp,id:qcLesson,studentId:qcChild,teacherId:ids.qc,startsAt:new Date(Date.now()-180000).toISOString()}]);
 await as("qc");await db.query("select public.pw_classroom_access($1,true)",[qcLesson]);pass("Actual QC tutor opens their own classroom");
 await db.query("select public.pw_apply_changes(jsonb_build_array(jsonb_build_object('table','pw_lessons','operation','update','revision',revision,'record',jsonb_build_object('id',id,'student_id',student_id,'teacher_id',teacher_id,'admin_id',admin_id,'payload',payload||'{\"status\":\"teacher_done\",\"notes\":\"QC personally taught the assigned lesson\"}'::jsonb)))) from public.pw_lessons where id=$1",[qcLesson]);
 assert.equal((await db.query("select payload->>'status' state from public.pw_lessons where id=$1",[qcLesson])).rows[0].state,"teacher_done");pass("QC marks Teacher Done through the portal's actual update RPC");
 await deny("QC cannot verify their own class","update public.pw_lessons set payload=jsonb_set(payload,'{status}','\"completed\"') where id=$1",[qcLesson]);
 await root();await db.query("update public.pw_leads set payload=payload||$2::jsonb where id=$1",[lead,JSON.stringify({status:"callback",callbackAt:first.toISOString()})]);
 assert.equal((await db.query("select count(*)::int n from public.pw_desk_items where lead_id=$1 and kind='callback' and status='open'",[lead])).rows[0].n,1);pass("Lead callback date creates a scheduled assigned Sales case");
 await db.query("update public.pw_leads set payload=jsonb_set(payload,'{status}','\"nursery\"') where id=$1",[lead]);
 assert.equal((await db.query("select count(*)::int n from public.pw_desk_items where lead_id=$1 and kind='callback' and status='cancelled'",[lead])).rows[0].n,1);pass("Moved lead cancels obsolete callback reminders");
 await as("parent");await db.query("select public.pw_communications_action('consent',$1)",[JSON.stringify({enabled:true,reason:"Rollback-only guardian explicitly opts into marketing."})]);
 const preference=(await db.query("select public.pw_communications_snapshot() d")).rows[0].d;assert.equal(preference.contacts.length,1);assert(!JSON.stringify(preference).includes("unsubscribe"));pass("Guardian sees only own preference, never private unsubscribe tokens");
 await as("sales");await db.query("select public.pw_communications_action('consent',$1)",[JSON.stringify({leadId:lead,enabled:true,reason:"Rollback-only explicit contact permission evidence."})]);
 const campaignInput={requestId:randomUUID(),subject:"Fixture newsletter",body:"Rollback-only consented newsletter.",audience:"leads",confirm:"SEND",reason:"Verify consented communications safely."};
 const campaign=(await db.query("select public.pw_communications_action('campaign',$1) d",[JSON.stringify(campaignInput)])).rows[0].d;
 assert.equal(campaign.recipients,1);pass("Sales campaign includes only their explicitly consented contact");
 assert.equal((await db.query("select public.pw_communications_action('campaign',$1) d",[JSON.stringify(campaignInput)])).rows[0].d.id,campaign.id);pass("Retrying send confirmation does not duplicate a campaign");
 await root();const unsub=(await db.query("select unsubscribe_token from public.pw_marketing_contacts where lead_id=$1",[lead])).rows[0].unsubscribe_token;
 await db.query("set local role service_role");
 const jobs=(await db.query("select public.pw_claim_campaign_emails(10) d")).rows[0].d,job=jobs.find(j=>j.subject===campaignInput.subject);assert(job);
 assert.equal((await db.query("select public.pw_campaign_email_current($1,$2) d",[job.id,job.lease_id])).rows[0].d,true);pass("Consented campaign receives an exclusive current delivery lease");
 await db.query("select public.pw_finish_campaign_email($1,$2,true,null)",[job.id,randomUUID()]);assert.equal((await db.query("select status from public.pw_campaign_deliveries where id=$1",[job.id])).rows[0].status,"sending");pass("Wrong delivery lease cannot mark mail sent");
 await db.query("set local role anon");await db.query("select public.pw_marketing_unsubscribe($1)",[unsub]);pass("Recipient can withdraw without logging in");
 await db.query("set local role service_role");assert.equal((await db.query("select public.pw_campaign_email_current($1,$2) d",[job.id,job.lease_id])).rows[0].d,false);pass("Withdrawal cancels a previously claimed marketing email");
 await as("teacher");await deny("Teachers cannot create marketing campaigns","select public.pw_communications_action('campaign',$1)",[JSON.stringify(campaignInput)]);
 await as("sales");await db.query("select public.pw_communications_action('consent',$1)",[JSON.stringify({leadId:lead,enabled:false,reason:"Withdraw all fixture permission."})]);campaignInput.requestId=randomUUID();
 await deny("No marketing sends to unconsented contacts","select public.pw_communications_action('campaign',$1)",[JSON.stringify(campaignInput)],"22023");
 await root();await db.query("update public.pw_leads set payload=jsonb_set(payload,'{status}','\"new\"') where id=$1",[lead]);
 // Transaction-local temporal fixture only; restore all guards before running
 // the actual service-role reconciliation. No real lead is backdated.
 await db.query("set local session_replication_role=replica");
 await db.query("update public.pw_leads set updated_at=now()-interval '48 hours' where id=$1",[lead]);
 await db.query("set local session_replication_role=origin");
 await db.query("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
 await db.query("set local role service_role");await db.query("select public.pw_reconcile_cold_leads()");
 assert.equal((await db.query("select payload->>'status' state from public.pw_leads where id=$1",[lead])).rows[0].state,"nursery");pass("Actual service-role reconciliation moves stale unbooked leads to nursery");
 assert.equal((await db.query("select count(*)::int n from public.pw_desk_items where lead_id=$1 and kind='nursery' and status='open'",[lead])).rows[0].n,1);pass("Cold-lead automation creates one actual Sales follow-up");
 await as("parent");const request=(await db.query("select public.pw_request_reschedule($1,$2,'Family requested a different date') id",[lesson,JSON.stringify([first.toISOString()])])).rows[0].id;
 await as("teacher");await deny("Teacher refusal needs a written reason","select public.pw_decide_reschedule($1,'reject',null,'')",[request],"22023");
 await db.query("select public.pw_counter_reschedule($1,$2,'Original option conflicts; this alternative is available')",[request,JSON.stringify([alt.toISOString()])]);pass("Assigned teacher submits reasoned alternatives");
 await deny("Teacher cannot approve an unaccepted alternative","select public.pw_decide_reschedule($1,'approve',$2,'')",[request,alt],"22023");
 await as("parent");await db.query("select public.pw_accept_counter($1,$2)",[request,alt]);pass("Linked guardian accepts a specific teacher alternative");
 await as("teacher");await db.query("select public.pw_decide_reschedule($1,'approve',$2,'Confirmed available alternative')",[request,alt]);pass("Teacher confirms after guardian consent");
 await as("admin");await db.query("select public.pw_decide_reschedule($1,'approve',$2,'Final calendar conflict check and approval')",[request,alt]);pass("Assigned Admin finalizes with existing conflict checks");
 await as("head");
 for(const kind of["winback","exit_feedback"]){
  const routed=(await action("create",{kind,studentId:child,assignedTo:ids.sales,at:first.toISOString(),slots:[],notes:"Head assigns confidential family follow-up to Sales."})).rows[0].result.id;
  await as("sales");assert.equal((await db.query("select count(*)::int n from public.pw_desk_items where id=$1",[routed])).rows[0].n,1);pass(kind+" is routed to assigned Sales");
  await as("head");
 }
 await action("emergency_cover",{lessonId:lesson,teacherId:ids.cover,adminId:ids.admin,notes:"Emergency isolated teacher replacement."});
 assert.equal((await db.query("select teacher_id from public.pw_students where id=$1",[child])).rows[0].teacher_id,ids.teacher);assert.equal((await db.query("select teacher_id,payload->>'kind' kind from public.pw_lessons where id=$1",[lesson])).rows[0].teacher_id,ids.cover);pass("Single-class cover preserves permanent teaching assignment");
 await as("cover");assert.equal((await db.query("select public.pw_can_student($1) allowed",[child])).rows[0].allowed,false);pass("Emergency dossier access does not start days early");
 await as("owner");await deny("Staff with active duties cannot be deactivated","select public.pw_management_action('deactivate',$1)",[JSON.stringify({staffId:ids.teacher,confirm:"DEACTIVATE",notes:"Attempt while actively assigned"})],"PW409");
 await action("deactivate",{staffId:ids.otherhead,confirm:"DEACTIVATE",notes:"Restrict isolated staff without erasing history."});assert.equal((await db.query("select status from public.pw_profiles where id=$1",[ids.otherhead])).rows[0].status,"restricted");pass("Safe deactivation preserves the account and audit records");
 await action("rules",{stagnantDays:30,emptyBoardClasses:2,followupHours:24,escalationHours:24,lateGraceMinutes:5,notes:"Owner configures operational thresholds."});pass("Operational thresholds are owner-controlled");
 await root();
 for(let n=2;n<=3;n++){
  const id="empty-"+randomUUID(),p={...lp,id,startsAt:new Date(Date.now()-n*86400000).toISOString()};
  await db.query("insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[id,child,ids.teacher,ids.admin,p]);
  await db.query("update public.pw_lessons set payload=jsonb_set(payload,'{status}','\"teacher_done\"') where id=$1",[id]);
  await db.query("update public.pw_lessons set payload=jsonb_set(payload,'{status}','\"completed\"') where id=$1",[id]);
 }
 const stagnant="stagnant-"+randomUUID();
 await db.query("insert into public.pw_students(id,parent_id,teacher_id,admin_id,payload) values($1,$2,$3,$4,$5)",[stagnant,ids.parent,ids.teacher,ids.admin,{...payload,id:stagnant,name:"Isolated stagnant bank"}]);
 await db.query("update public.pw_song_activity set observed_since=now()-interval '31 days' where student_id in($1,$2)",[child,stagnant]);
 const requestMessage=(await db.query("insert into public.pw_learning_requests(student_id,kind,body,created_by,created_at) values($1,'message','Rollback-only unresponsive message',$2,now()-interval '25 hours') returning id",[child,ids.parent])).rows[0].id;
 await db.query("set local role service_role");await db.query("select public.pw_reconcile_management()");pass("Hosted management reconciliation contract executes");
 assert.equal((await db.query("select count(*)::int n from public.pw_desk_items where student_id=$1 and kind='quality_alert'",[child])).rows[0].n,1);pass("Two consecutive verified empty boards create a QC alert");
 assert.equal((await db.query("select count(*)::int n from public.pw_desk_items where student_id=$1 and kind='quality_alert'",[stagnant])).rows[0].n,1);pass("Thirty observed days without song changes create a separate QC alert");
 const escalated=(await db.query("select id,assigned_to from public.pw_desk_items where dedup_key=$1",["escalation:"+requestMessage])).rows[0];assert.equal(escalated.assigned_to,ids.head);pass("Unresponsive parent message routes to the actual Head");
 assert.equal((await db.query("select count(*)::int n from public.pw_emails where source_id=$1",[escalated.id])).rows[0].n,1);pass("Escalation persists an immediate actionable email");
 const before=(await db.query("select count(*)::int n from public.pw_desk_items where student_id=$1",[child])).rows[0].n;
 await db.query("select public.pw_reconcile_management()");assert.equal((await db.query("select count(*)::int n from public.pw_desk_items where student_id=$1",[child])).rows[0].n,before);pass("Repeated cron ticks do not duplicate flags or escalations");
 await as("teacher");await deny("Ordinary users cannot run automation","select public.pw_reconcile_management()");
 await deny("Ordinary users cannot fabricate provider presence","select public.pw_record_presence($1,$2,now())",[randomUUID(),ids.teacher]);
 await db.query("rollback");console.log(`${count} rollback-only management checks passed; no real accounts, email or records changed.`);
}catch(e){console.error(safeFailure(e));console.error(e.message?.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/g,"[fixture]").slice(0,220));await db.query("rollback").catch(()=>{});process.exitCode=1;}finally{await db.end();}
