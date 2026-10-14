import {NextResponse} from "next/server";
import{publicAppUrl}from"@/lib/supabase/app-url.mjs";
import {identity} from "@/lib/supabase/identity";
import {provisioningClient,sameOrigin} from "@/lib/supabase/server";
import {hiringAction,hiringRoles} from "@/lib/academy/hiring";
import {loadAllRecords} from "@/lib/academy/paged-records";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 try{
  const {profile,client}=await identity();
  if(!profile||!["active","on_leave","applicant"].includes(profile.status)||!["super_admin",...hiringRoles].includes(profile.role))return reply({error:"Hiring access required."},403);
  const [cases,reviews,events,directory,files,handoffs]=await Promise.all([
   loadAllRecords(client,"pw_hiring_cases"),
   loadAllRecords(client,"pw_hiring_reviews","*",{ascending:true}),
   loadAllRecords(client,"pw_hiring_events"),
   client.rpc("pw_hiring_directory"),loadAllRecords(client,"pw_files","id,target_id,category,original_name,mime,complete,created_at",{filter:q=>q.in("category",["hiring_evidence","hiring_guidelines","hiring_agreement"]).eq("complete",true)}),
   client.rpc("pw_hiring_handoffs")
  ]);
  if([cases,reviews,events,directory,files,handoffs].some(v=>v.error))throw Error();
  return reply({profile,cases:cases.data,reviews:reviews.data,events:events.data,directory:directory.data,files:files.data,handoffs:handoffs.data,serverNow:new Date().toISOString()});
 }catch{return reply({error:"Hiring records could not be loaded."},503);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return reply({error:"Cross-origin changes are not allowed."},403);
 try{
  const {profile,client}=await identity();
  if(!profile||!["active","applicant"].includes(profile.status)||!["super_admin",...hiringRoles].includes(profile.role))return reply({error:"Hiring access required."},403);
  const p=hiringAction.safeParse(await request.json().catch(()=>null));if(!p.success)return reply({error:"Check applicant details, evidence and dates."},400);
  const d=p.data;
  if(d.action==="invite"){
   if(profile.role!=="super_admin"||profile.status!=="active")return reply({error:"Only the owner can provision staff accounts."},403);
   try{new Intl.DateTimeFormat("en",{timeZone:d.timezone}).format();}catch{return reply({error:"Choose a valid timezone."},400);}
   const row=await client.from("pw_hiring_cases").select("id,name,email,desired_role,staff_id,stage").eq("id",d.id).single();
   if(row.error||!row.data||row.data.stage!=="selected"||row.data.staff_id)return reply({error:"Select an unlinked applicant after the joint interview."},409);
   const admin=provisioningClient();
   const invited=await admin.auth.admin.inviteUserByEmail(row.data.email,{data:{name:row.data.name},redirectTo:publicAppUrl("/auth/confirm?next=/hiring").href});
   if(invited.error||!invited.data.user)return reply({error:"Invitation could not be sent. If this person already has an account, use the owner account page to set the matching staff role and applicant status, then link it."},409);
   const prepared=await admin.rpc("pw_set_account",{actor:profile.id,target:invited.data.user.id,new_status:"applicant",new_role:row.data.desired_role,new_timezone:d.timezone});
   if(prepared.error)return reply({error:"Invitation was sent, but staff provisioning failed. The account remains unprivileged; review it in Accounts."},503);
   const linked=await client.rpc("pw_hiring_action",{p_action:"bind",p_id:d.id,p_data:{staffId:invited.data.user.id,notes:"Owner invited and linked the applicant account"}});
   if(linked.error)return reply({error:"Applicant invitation was sent, but linking failed. Link the applicant account after reloading. It has not been activated."},409);
   return reply({ok:true});
  }
  const {action,...data}=d;
  const result=await client.rpc("pw_hiring_action",{p_action:action,p_id:"id" in data?data.id:null,p_data:data});
  if(result.error)return reply({error:result.error.code==="42501"?"This action requires the assigned HR, departmental reviewer, owner or applicant.":result.error.code==="23505"?"This applicant or immutable review already exists.":"The workflow is not ready. Check joint passing reviews, training, current PDF acceptance, approved pay and matching bank currency."},result.error.code==="42501"?403:409);
  return reply({ok:true,id:result.data});
 }catch{return reply({error:"The hiring change could not be saved."},503);}
}
