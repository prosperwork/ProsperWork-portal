import{NextResponse}from"next/server";
import{identity}from"@/lib/supabase/identity";
import{sameOrigin}from"@/lib/supabase/server";
import{managementAction}from"@/lib/academy/management";
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 try{
  const{client,profile}=await identity();
  if(!profile||profile.status!=="active")return reply({error:"Active academy access required."},403);
  const{data,error}=await client.rpc("pw_management_snapshot");
  if(error)return reply({error:"Management records are unavailable."},503);
  return reply({profile,...data});
 }catch{return reply({error:"Management records are unavailable."},503);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return reply({error:"Invalid request origin."},403);
 const parsed=managementAction.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return reply({error:"Check the required fields, dates and written reason."},400);
 try{
  const{client,profile}=await identity();
  if(!profile||profile.status!=="active")return reply({error:"Active academy access required."},403);
  const{action,...input}=parsed.data;
  const{data,error}=await client.rpc("pw_management_action",{p_action:action,p_data:input});
  if(error){
   const messages:Record<string,string>={"42501":"This action is outside your assigned responsibilities.","22023":"Check the proposed dates, participants and required reason.","23503":"This record is still linked to academy history.","PW409":"The record changed, is already verified, or has conflicting assignments. Refresh and review.","23514":"The change violates the academy's safety rules."};
   return reply({error:messages[error.code]||"The requested change could not be completed."},error.code==="42501"?403:error.code==="PW409"?409:400);
  }
  return reply({ok:true,result:data});
 }catch{return reply({error:"The requested change could not be completed."},503);}
}
