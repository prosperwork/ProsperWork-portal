import{NextResponse}from"next/server";
import{identity}from"@/lib/supabase/identity";
import{sameOrigin}from"@/lib/supabase/server";
import{z}from"zod";

const profileChanges=z.object({
 name:z.string().trim().min(2).max(100),
 timezone:z.string().trim().min(2).max(100).refine(value=>{
  try{new Intl.DateTimeFormat("en",{timeZone:value});return true;}catch{return false;}
 }),
}).strict();
export async function GET(request:Request){
 try{
  const{client,profile}=await identity();
  if(!profile||!["active","on_leave"].includes(profile.status))return NextResponse.json({error:"Active account required."},{status:403});
  const target=new URL(request.url).searchParams.get("id")||profile.id;
  if(!/^[a-f0-9-]{36}$/i.test(target))return NextResponse.json({error:"Invalid profile."},{status:400});
  const p=target===profile.id
   ?await client.from("pw_profiles").select("id,name,email,role,status,timezone,username,avatar_file_id").eq("id",target).single()
   :await client.from("pw_profiles").select("id,name,role,avatar_file_id").eq("id",target).single();
  if(p.error||!p.data)return NextResponse.json({error:"Profile unavailable."},{status:403});
  let avatarUrl:string|null=null;
  if(p.data.avatar_file_id){
   const file=await client.from("pw_files").select("path").eq("id",p.data.avatar_file_id).eq("complete",true).single();
   if(file.data){const signed=await client.storage.from("pw-private").createSignedUrl(file.data.path,120);if(signed.error)throw Error();avatarUrl=signed.data.signedUrl;}
  }
  return NextResponse.json({profile:p.data,avatarUrl},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Profile picture unavailable."},{status:503});}
}

export async function PATCH(request:Request){
 const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
 try{
  if(!sameOrigin(request))return reply({error:"Origin rejected."},403);
  const parsed=profileChanges.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return reply({error:"Enter a name between 2 and 100 characters and a valid time zone. Only these details can be changed."},400);
  const{client,profile}=await identity();
  if(!profile||!["active","on_leave"].includes(profile.status))return reply({error:"Active account required."},403);
  // Use the authenticated client and fixed identity: native column grants and RLS remain in force.
  const result=await client.from("pw_profiles").update(parsed.data).eq("id",profile.id)
   .select("id,name,email,role,status,timezone,username").single();
  if(result.error||!result.data)return reply({error:"Profile could not be saved."},result.error?.code==="42501"?403:400);
  return reply({ok:true,profile:result.data});
 }catch{return reply({error:"Profile is temporarily unavailable."},503);}
}
