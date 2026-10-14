import{NextResponse}from"next/server";
import{identity}from"@/lib/supabase/identity";
import{sameOrigin}from"@/lib/supabase/server";
import{communicationsAction}from"@/lib/academy/communications";
export const runtime="nodejs";
const reply=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 try{const{client,profile}=await identity();if(!profile||profile.status!=="active")return reply({error:"Active account required."},403);
 const{data,error}=await client.rpc("pw_communications_snapshot");return error?reply({error:"Communications unavailable."},503):reply({profile,...data});}catch{return reply({error:"Communications unavailable."},503);}
}
export async function POST(request:Request){
 try{if(!sameOrigin(request))return reply({error:"Origin rejected."},403);
 const parsed=communicationsAction.safeParse(await request.json());if(!parsed.success)return reply({error:"Complete the audience, message and consent evidence."},400);
 const{client,profile}=await identity();if(!profile||profile.status!=="active")return reply({error:"Active account required."},403);
 const{action,...input}=parsed.data;const{data,error}=await client.rpc("pw_communications_action",{p_action:action,p_data:input});
 return error?reply({error:error.code==="42501"?"Outside your permissions.":"No consented recipients, invalid message, or campaign already closed."},error.code==="42501"?403:400):reply({ok:true,result:data});
 }catch{return reply({error:"Communications unavailable."},503);}
}
