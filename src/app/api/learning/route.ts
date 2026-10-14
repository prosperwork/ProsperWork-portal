import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
import { learningAction } from "@/lib/academy/learning";
import {loadAllRecords} from "@/lib/academy/paged-records";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET() {
 try {
  const {client,profile}=await identity();
  if(!profile||!["active","on_leave"].includes(profile.status)||!["super_admin","head_admin","admin","qc","teacher","parent","student"].includes(profile.role))return reply({error:"Learning access is restricted."},403);
  const [lessons,boards,resources,recordings]=await Promise.all([
   loadAllRecords(client,"pw_lessons","id,payload,teacher_id,created_at"),
   loadAllRecords(client,"pw_lesson_boards","*",{cursor:"lesson_id",sort:"updated_at"}),
   loadAllRecords(client,"pw_resources","id,payload,revision,created_at",{filter:q=>q.is("archived_at",null)}),
   loadAllRecords(client,"pw_files","id,target_id,original_name,mime,bytes,created_at",{filter:q=>q.eq("category","lesson_recording").eq("complete",true),cursor:"id",sort:"created_at"}),
  ]);
  if(lessons.error||boards.error||resources.error)return reply({error:"Learning records are unavailable."},503);
  return reply({
    profile,
    lessons:lessons.data.map(l=>({...l.payload,teacherId:l.teacher_id})),
    boards:boards.data,
    resources:resources.data,
    recordings:recordings.data || []
  });
 }catch{return reply({error:"Learning records could not be loaded."},503);}
}
export async function POST(request:Request) {
 if(!sameOrigin(request))return reply({error:"Invalid origin."},403);
 try{
  const {client,profile}=await identity();
  if(!profile||profile.status!=="active")return reply({error:"Active account required."},403);
  const parsed=learningAction.safeParse(await request.json());
  if(!parsed.success)return reply({error:"Check required fields and text limits."},400);
  const p=parsed.data;
  const result=p.action==="board"?await client.rpc("pw_save_board",{p_lesson:p.lessonId,p_revision:p.revision,p_notes:p.notes,p_next:p.nextTopics,p_topics:p.completedTopics})
   :await client.rpc("pw_save_resource",{p_id:p.id,p_revision:p.revision,p_archive:p.action==="archive_resource",p_payload:p.action==="resource"?{id:p.id,title:p.title,type:p.type,instrument:p.instrument,level:p.level,summary:p.summary}:{}});
  if(result.error)return reply({error:result.error.code==="40001"?"This record changed. Reload before saving.":"This change could not be saved under your account."},result.error.code==="40001"?409:result.error.code==="42501"?403:400);
  return reply({ok:true,board:p.action==="board"?result.data:undefined,revision:p.action!=="board"?result.data:undefined});
 }catch{return reply({error:"The learning change could not be saved."},400);}
}
