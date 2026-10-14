import {NextResponse} from "next/server";
import {identity} from "@/lib/supabase/identity";
import {sameOrigin} from "@/lib/supabase/server";
import {policyAction} from "@/lib/academy/family";
import {loadAllRecords} from "@/lib/academy/paged-records";
export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 try{
  const {client,profile}=await identity({allowPolicy:true});
  if(!profile||profile.status!=="active"||!["parent","student","super_admin"].includes(profile.role))return reply({error:"Active guardian or owner access required."},403);
  const result=await loadAllRecords(client,"pw_policy_versions","*",{sort:"version"});
  if(result.error||!result.data)throw Error();
  const acceptance=await client.from("pw_policy_acceptances").select("policy_id").eq("parent_id",profile.id);
  if(acceptance.error)throw Error();
  const all=result.data;
  const applicable=profile.role==="super_admin"?null:await client.rpc("pw_current_policies");
  if(applicable?.error)throw Error();
  const current=profile.role==="super_admin"?all.filter(p=>p.audience_parent_id===null&&p.published_at&&!all.some(n=>n.audience_parent_id===null&&n.key===p.key&&n.version>p.version&&n.published_at)):(applicable?.data||[]);
  const missingKeys=["parent_agreement","terms_of_service","reschedule_policy"].filter(key=>!current.some((p:{key:string})=>p.key===key));
  return reply({profile,versions:profile.role==="super_admin"?all:current,acceptedIds:acceptance.data.map(a=>a.policy_id),setupRequired:missingKeys.length>0,missingKeys});
 }catch{return reply({error:"Policy documents could not be loaded."},503);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return reply({error:"Invalid request origin."},403);
 const parsed=policyAction.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return reply({error:"Check the policy form."},400);
 try{
  const {client,profile}=await identity({allowPolicy:true});
  if(!profile||profile.status!=="active")return reply({error:"Active account required."},403);
  const d=parsed.data;
  const args=d.action==="draft"?{p_key:d.key,p_title:d.title,p_parent:d.audienceParentId||null}:d.action==="publish"?{p_action:"publish",p_id:d.id}:{p_action:"accept",p_ids:d.ids};
  const result=await client.rpc(d.action==="draft"?"pw_policy_draft":"pw_policy_change",args);
  if(result.error)return reply({error:result.error.code==="40001"?"Policy versions changed. Reload before accepting.":"Owner approval and an uploaded PDF are required to publish; only guardians can accept published policies."},result.error.code==="40001"?409:403);
  return reply({ok:true,id:result.data,redirect:d.action==="accept"?"/family":undefined});
 }catch{return reply({error:"Policy change could not be saved."},503);}
}
