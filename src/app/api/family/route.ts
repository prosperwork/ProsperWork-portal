import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {randomBytes,randomUUID} from "node:crypto";
import {identity} from "@/lib/supabase/identity";
import {provisioningClient,sameOrigin} from "@/lib/supabase/server";
import {familyAction} from "@/lib/academy/family";
import {open,seal,pinDigest,pinMatches,sessionId} from "@/lib/academy/kid-session";
import {loadAllRecords} from "@/lib/academy/paged-records";
export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 try{
  const {client,profile}=await identity();
  const saved=open((await cookies()).get("pw-kid-parent")?.value||"");
  if(profile?.status==="policy_required"&&profile.role==="student"&&saved?.child===profile.id)
   return reply({profile,avatarFileId:null,pinConfigured:false,kidMode:true,policyRequired:true,children:[]});
  if(!profile||profile.status!=="active")return reply({error:profile?.status==="policy_required"?"Accept the current policy documents first.":"Active academy access required.",redirect:profile?.status==="policy_required"?"/onboarding":"/login"},403);
  const students=await loadAllRecords(client,"pw_students","id,parent_id,student_user_id,payload",{sort:"id",ascending:true});
  const photo=await client.from("pw_profiles").select("avatar_file_id").eq("id",profile.id).single();
  if(students.error||photo.error)throw Error();
  const ids=students.data.flatMap(s=>s.student_user_id?[s.student_user_id]:[]);
  const usernames=ids.length?await client.from("pw_profiles").select("id,username,avatar_file_id").in("id",ids):{data:[],error:null};
  if(usernames.error)throw Error();
  const pin=profile.role==="parent"?await provisioningClient().from("pw_family_pins").select("parent_id").eq("parent_id",profile.id).maybeSingle():{data:null,error:null};
  if(pin.error)throw Error();
  return reply({profile,avatarFileId:photo.data.avatar_file_id,pinConfigured:!!pin.data,kidMode:!!saved&&saved.child===profile.id,children:students.data.map(s=>{
   const u=usernames.data?.find(p=>p.id===s.student_user_id),d=s.payload;
   return {id:s.id,name:d.name,dob:d.dob,timezone:d.timezone,studentUserId:s.student_user_id,username:u?.username||null,avatarFileId:u?.avatar_file_id||null,consent:d.consent===true,rank:d.rank};
  })});
 }catch{return reply({error:"Family security could not be loaded."},503);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return reply({error:"Invalid request origin."},403);
 const parsed=familyAction.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return reply({error:"Check the form. Passwords need at least 8 characters and the family PIN must be exactly four digits."},400);
 try{
  const d=parsed.data,{client,user,profile}=await identity({allowPolicy:parsed.data.action==="exit_kid"});
  if(!profile||profile.status!=="active"||!user)return reply({error:"Active family account required."},403);
  const admin=provisioningClient(),store=await cookies();
  if(d.action==="exit_kid"){
   const saved=open(store.get("pw-kid-parent")?.value||"");
   if(!saved||saved.child!==user.id||profile.role!=="student")return reply({error:"No guardian-return session is available. Ask your guardian to sign in."},403);
   const attempt=await admin.rpc("pw_pin_attempt",{p_parent:saved.id,p_session:saved.session});
   if(attempt.error||!attempt.data)return reply({error:"PIN attempts are locked. Wait 15 minutes or sign in as the guardian."},429);
   const row=attempt.data as {salt:string;digest:string};
   if(!pinMatches(d.pin,row.salt,row.digest))return reply({error:"Incorrect family PIN."},403);
   const restore=await client.auth.setSession({access_token:saved.access,refresh_token:saved.refresh});
   if(restore.error)return reply({error:"Guardian session expired. Sign in again."},401);
   const cleared=await admin.rpc("pw_kid_unblock",{p_parent:saved.id,p_session:saved.session});
   if(cleared.error){await client.auth.signOut({scope:"local"});return reply({error:"Guardian access could not be restored."},503);}
   store.delete("pw-kid-parent");
   return reply({ok:true,redirect:"/family"});
  }
  if(!["parent","super_admin"].includes(profile.role))return reply({error:"Guardian or owner access required."},403);
  if(d.action==="pin"){
   if(profile.role!=="parent")return reply({error:"Only a guardian sets their family PIN."},403);
   const check=provisioningClient();
   const proof=await check.auth.signInWithPassword({email:user.email!,password:d.password});
   if(proof.error||proof.data.user?.id!==user.id)return reply({error:"Confirm your current guardian password."},403);
   await check.auth.signOut({scope:"local"});
   const salt=randomBytes(24).toString("hex");
   const saved=await admin.from("pw_family_pins").upsert({parent_id:user.id,salt,digest:pinDigest(d.pin,salt),failures:0,locked_until:null,updated_at:new Date().toISOString()});
   if(saved.error)throw Error();
   return reply({ok:true});
  }
  const child=await client.from("pw_students").select("id,parent_id,student_user_id,payload").eq("id",d.childId).single();
  if(child.error||!child.data||(profile.role==="parent"&&child.data.parent_id!==user.id))return reply({error:"This learner is not linked to your account."},403);
  if(d.action==="media_consent"){
   const consent=await client.rpc("pw_family_consent",{p_child:d.childId,p_consent:d.consent});
   if(consent.error)return reply({error:"Only this learner's guardian or owner can change consent."},403);
   return reply({ok:true});
  }
  if(d.action==="student_account"){
   if(child.data.student_user_id)return reply({error:"This learner already has an account. Use password reset."},409);
   const created=await admin.auth.admin.createUser({email:`student-${randomUUID()}@students.prosperworkmusic.com`,password:d.password,email_confirm:true,user_metadata:{name:child.data.payload.name}});
   if(created.error||!created.data.user)return reply({error:"Student account could not be created."},503);
    const linked=await admin.rpc("pw_link_student_account",{p_actor:user.id,p_child:d.childId,p_user:created.data.user.id,p_username:null});
    if(linked.error){const cleaned=await admin.auth.admin.deleteUser(created.data.user.id);if(cleaned.error)throw Error();return reply({error:"Student login could not be linked. Try again or contact the academy."},409);}
    const assigned=await admin.from("pw_profiles").select("username").eq("id",created.data.user.id).single();
    if(assigned.error||!assigned.data)return reply({error:"Student login was created, but its username could not be loaded. Refresh this family record."},503);
    return reply({ok:true,username:assigned.data.username});
  }
  const target=child.data.student_user_id;
  if(!target)return reply({error:"Create a student account first."},409);
  const targetProfile=await admin.from("pw_profiles").select("role,status,email").eq("id",target).single();
  if(targetProfile.error||targetProfile.data?.role!=="student"||targetProfile.data.status!=="active")return reply({error:"The student account is not active."},403);
  if(d.action==="student_password"){
   const changed=await admin.auth.admin.updateUserById(target,{password:d.password});
   if(changed.error)throw Error();
   return reply({ok:true});
  }
  if(d.action==="enter_kid"){
   if(profile.role!=="parent")return reply({error:"Kid Mode requires this learner's guardian account."},403);
   const pin=await admin.from("pw_family_pins").select("parent_id").eq("parent_id",user.id).maybeSingle();
   if(pin.error||!pin.data)return reply({error:"Set a four-digit family PIN before entering Kid Mode."},409);
   const current=await client.auth.getSession();if(!current.data.session)throw Error();
   const p=current.data.session,sid=sessionId(p.access_token);
   const encrypted=seal({id:user.id,child:target,session:sid,access:p.access_token,refresh:p.refresh_token,until:Date.now()+12*3600000});
   if(encrypted.length>3500)return reply({error:"This session cannot safely fit the guardian-return cookie. Sign in again."},409);
   const link=await admin.auth.admin.generateLink({type:"magiclink",email:targetProfile.data.email});
   if(link.error||!link.data.properties.hashed_token)throw Error();
   const block=await admin.from("pw_kid_blocks").insert({parent_session:sid,parent_id:user.id,child_user:target});
   if(block.error)return reply({error:"This guardian session is already locked or could not be secured."},409);
   const switched=await client.auth.verifyOtp({type:"magiclink",token_hash:link.data.properties.hashed_token});
   if(switched.error){await admin.rpc("pw_kid_unblock",{p_parent:user.id,p_session:sid});throw Error();}
   store.set("pw-kid-parent",encrypted,{httpOnly:true,secure:new URL(request.url).protocol==="https:"||request.headers.get("x-forwarded-proto")==="https",sameSite:"lax",path:"/",maxAge:12*3600});
   return reply({ok:true,redirect:"/kid"});
  }
  return reply({error:"Invalid family operation."},400);
 }catch{return reply({error:"Family operation failed. Nothing was marked successful."},503);}
}
