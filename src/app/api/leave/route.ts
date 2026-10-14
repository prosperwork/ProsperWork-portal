import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
import { leaveAction } from "@/lib/academy/leave";
import {loadAllRecords} from "@/lib/academy/paged-records";
export const dynamic="force-dynamic";
function reply(data:unknown,status=200){return NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});}
const staff=["super_admin","hr","head_admin","admin","teacher","qc","finance","sales_marketing","social_media"];
export async function GET(){
 try{
  const {profile,client}=await identity();
  if(!profile||!["active","on_leave"].includes(profile.status)||!staff.includes(profile.role))return reply({error:"Staff access required."},403);
  const [leaves,covers,directory,timeline,students]=await Promise.all([
   loadAllRecords(client,"pw_leaves"),
   loadAllRecords(client,"pw_leave_covers"),client.rpc("pw_leave_directory"),client.rpc("pw_leave_cover_timeline"),
   ["super_admin","head_admin"].includes(profile.role)?loadAllRecords(client,"pw_students","id,teacher_id,admin_id,parent_id,payload,created_at"):Promise.resolve({data:[],error:null})
  ]);
  if([leaves,covers,directory,timeline,students].some(r=>r.error))throw Error();
  return reply({profile,leaves:leaves.data,covers:covers.data,directory:directory.data,coverTimeline:timeline.data,students:students.data,serverNow:new Date().toISOString()});
 }catch{return reply({error:"Leave records are unavailable."},503);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return reply({error:"Cross-origin changes are not allowed."},403);
 try{
  const {profile,client}=await identity();if(!profile||profile.status!=="active"||!staff.includes(profile.role))return reply({error:"Active staff access required."},403);
  const parsed=leaveAction.safeParse(await request.json().catch(()=>null));if(!parsed.success)return reply({error:"Check the leave dates, staff selection and reason."},400);
  const d=parsed.data;
  const result=await client.rpc("pw_leave_action",{p_action:d.action,p_id:"id" in d?d.id:null,p_staff:d.action==="request"?d.staffId||null:null,
   p_route:d.action==="request"?d.route:null,p_kind:d.action==="request"?d.kind:null,p_start:d.action==="request"?d.startsAt:null,p_end:d.action==="request"?d.endsAt:null,
   p_reason:"reason" in d?d.reason:null,p_student:d.action==="plan"?d.studentId:null,p_cover:d.action==="plan"?d.coverId:null});
  if(result.error)return reply({error:result.error.code==="42501"?"This leave action is not permitted for your role or stage.":result.error.code==="23514"?"Leave dates, complete cover, family allocation or calendar capacity conflict. Review the plan before finalizing.":"The leave state or fields are invalid; reload and check the dates."},result.error.code==="42501"?403:409);
  return reply({ok:true,id:result.data});
 }catch{return reply({error:"The leave action could not be saved."},503);}
}
