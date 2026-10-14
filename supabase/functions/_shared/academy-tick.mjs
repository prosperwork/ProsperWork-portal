// Bounded, dependency-injected work: shared by Node and Supabase Edge.
export async function academyTick({client,roomService,appUrl,deliverEmail,safeEmailError,warn=console.error}){
 const leave=await client.rpc("pw_reconcile_leaves");
 if(leave.error)warn("Leave reconciliation unavailable; other queues remain active.");
 const operations=await client.rpc("pw_reconcile_operations");
 if(operations.error||operations.data?.blocked)warn("Billing/resumption needs administrator review; other queues remain active.");
 const management=await client.rpc("pw_reconcile_management");
 if(management.error)warn("Management alerts are unavailable; unrelated queues remain active.");
 if(roomService){
  const expired=await client.rpc("pw_expired_classrooms");if(expired.error)throw Error("CLASSROOM_QUEUE_UNAVAILABLE");
  await Promise.all((expired.data||[]).map(async row=>{
   try{await roomService.deleteRoom(row.room_name);}catch(e){if(e?.status!==404&&e?.code!=="not_found"){warn("Classroom closure failed; next tick retries.");return;}}
   if((await client.rpc("pw_close_classroom",{p_id:row.id})).error)throw Error("CLASSROOM_CLOSE_RECORD_FAILED");
  }));
  const open=await client.rpc("pw_open_classrooms");if(open.error)throw Error("CLASSROOM_MEMBERSHIP_QUEUE_UNAVAILABLE");
  await Promise.all((open.data||[]).map(async row=>{
   let participants;try{participants=await roomService.listParticipants(row.room_name);}catch(e){if(e?.status===404||e?.code==="not_found")return;throw Error("CLASSROOM_MEMBERSHIP_CHECK_FAILED");}
   await Promise.all(participants.map(async p=>{
    if(!/^[a-f0-9-]{36}$/i.test(p.identity)){await roomService.removeParticipant(row.room_name,p.identity);return;}
    const allowed=await client.rpc("pw_classroom_participant_allowed",{p_room:row.id,p_actor:p.identity});
    if(allowed.error)throw Error("CLASSROOM_MEMBERSHIP_CHECK_FAILED");
    if(!allowed.data){await roomService.removeParticipant(row.room_name,p.identity);return;}
    const joined=Number(p.joinedAt)||Number(p.joinedAtMs)/1000;
    if(Number.isFinite(joined)&&joined>0){
     const presence=await client.rpc("pw_record_presence",{p_room:row.id,p_user:p.identity,p_joined:new Date(joined*1000).toISOString()});
     if(presence.error)warn("Provider join-time recording failed; no punctuality value was guessed.");
    }
   }));
  }));
 }
 if(appUrl&&deliverEmail){
  const claimed=await client.rpc("pw_claim_emails");if(claimed.error)throw Error("EMAIL_QUEUE_UNAVAILABLE");
  await Promise.all((claimed.data||[]).map(async job=>{
   let failure=null;const current=await client.rpc("pw_email_current",{p_job:job.id});if(current.error||!current.data)failure="SOURCE_NO_LONGER_CURRENT";
   if(!failure)try{await deliverEmail(job,appUrl);}catch(e){failure=safeEmailError(e);}
   const result=await client.rpc("pw_finish_email",{p_id:job.id,p_lease:job.lease_id,p_success:!failure,p_error:failure});
   if(result.error)throw Error("EMAIL_RESULT_UNAVAILABLE");
  }));
 }
 try{
  const cold=await client.rpc("pw_reconcile_cold_leads");
  if(cold.error)warn("Cold-lead reconciliation unavailable; other queues remain independent");
  if(!appUrl||!deliverEmail){warn("Marketing delivery is not configured; messages remain queued");return{completed:true,blocked:operations.data?.blocked||0};}
  const campaigns=await client.rpc("pw_claim_campaign_emails",{p_limit:10});
  if(campaigns.error)throw campaigns.error;
  await Promise.all((campaigns.data||[]).map(async job=>{
   const current=await client.rpc("pw_campaign_email_current",{p_id:job.id,p_lease:job.lease_id});
   if(current.error){warn("Marketing delivery permission check unavailable; its lease will expire");return;}
   let success=false,code=null;
   if(!current.data)code="CONSENT_OR_CAMPAIGN_CHANGED";
   else try{await deliverEmail(job,appUrl);success=true;}catch(e){code=typeof safeEmailError==="function"?safeEmailError(e):"SMTP_DELIVERY_FAILED";}
   const finish=await client.rpc("pw_finish_campaign_email",{p_id:job.id,p_lease:job.lease_id,p_success:success,p_error:code});
   if(finish.error)warn("Marketing email lease could not be finalized");
  }));
 }catch{warn("Marketing email queue unavailable; operational queues remain independent");}
 return{completed:true,blocked:operations.data?.blocked||0};
}
