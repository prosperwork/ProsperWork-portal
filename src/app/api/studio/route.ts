import {NextResponse} from "next/server";
import {z} from "zod";
import {identity} from "@/lib/supabase/identity";
import {sameOrigin} from "@/lib/supabase/server";
import {loadAllRecords} from "@/lib/academy/paged-records";
const child=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const action=z.discriminatedUnion("action",[
 z.object({action:z.literal("practice"),operation:z.enum(["start","pause","resume","finish","quiz"]),childId:child.optional(),id:z.string().uuid().optional(),answers:z.array(z.number().int().min(0).max(100)).length(6).optional()}).strict(),
 z.object({action:z.literal("request"),childId:child,kind:z.enum(["song","tutor","message","class_not_started"]),body:z.string().trim().min(2).max(4000),lessonId:child.optional()}).strict(),
 z.object({action:z.literal("reply"),id:z.string().uuid(),body:z.string().trim().min(2).max(4000)}).strict(),
 z.object({action:z.literal("decide"),id:z.string().uuid(),status:z.enum(["in_progress","resolved","rejected"]),body:z.string().trim().min(2).max(4000)}).strict(),
 z.object({action:z.literal("evaluate"),childId:child,title:z.string().trim().min(3).max(150),notes:z.string().max(4000),scores:z.record(z.string().min(2).max(60),z.number().min(0).max(100)).refine(s=>Object.keys(s).length>0&&Object.keys(s).length<=8)}).strict()
 ,z.object({action:z.literal("repertoire"),childId:child,song:z.string().trim().min(2).max(150),operation:z.enum(["plan","complete"])}).strict()
]);
export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 try{
 const {client,profile}=await identity();
 if(!profile||profile.status!=="active"||!["super_admin","head_admin","admin","teacher","qc","parent","student"].includes(profile.role))return reply({error:"Active learning access required."},403);
 const [students,practice,requests,replies,evaluations,lessons,files,repertoire]=await Promise.all([
  loadAllRecords(client,"pw_students","id,payload,created_at"),loadAllRecords(client,"pw_practice","*",{sort:"started_at"}),
  loadAllRecords(client,"pw_learning_requests"),
  loadAllRecords(client,"pw_learning_replies","*",{ascending:true}),loadAllRecords(client,"pw_evaluations"),
  loadAllRecords(client,"pw_lessons","id,student_id,payload,created_at"),
  loadAllRecords(client,"pw_files","id,target_id,original_name,mime,created_at",{filter:q=>q.eq("category","practice").eq("complete",true)}),
  loadAllRecords(client,"pw_repertoire_events")
 ]);
 if([students,practice,requests,replies,evaluations,lessons,files,repertoire].some(r=>r.error))throw Error();
 return reply({profile,students:students.data,practice:practice.data,requests:requests.data,replies:replies.data,evaluations:evaluations.data,lessons:lessons.data,files:files.data,repertoire:repertoire.data,serverNow:new Date().toISOString()});
 }catch{return reply({error:"The learning studio could not be loaded."},503);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return reply({error:"Invalid request origin."},403);
 const parsed=action.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return reply({error:"Check the studio form."},400);
 try{
 const {client,profile}=await identity();if(!profile||profile.status!=="active")return reply({error:"Active learning account required."},403);
 const d=parsed.data;
 const result=d.action==="repertoire"?await client.rpc("pw_repertoire",{p_student:d.childId,p_song:d.song,p_operation:d.operation})
  :d.action==="practice"?await client.rpc("pw_practice_action",{p_action:d.operation,p_student:d.childId||null,p_id:d.id||null,p_answers:d.answers||null})
  :d.action==="evaluate"?await client.rpc("pw_evaluate",{p_student:d.childId,p_title:d.title,p_scores:d.scores,p_notes:d.notes})
  :await client.rpc("pw_learning_request",d.action==="request"?{p_action:"create",p_student:d.childId,p_kind:d.kind,p_body:d.body,p_lesson:d.lessonId||null}:{p_action:d.action,p_id:d.id,p_body:d.body,p_status:d.action==="decide"?d.status:null});
 if(result.error)return reply({error:result.error.code==="23505"?"An active practice session already exists. Resume it.":"This action is not permitted for this learner or current state."},result.error.code==="23505"?409:403);
 return reply({ok:true,id:result.data});
 }catch{return reply({error:"The studio action could not be saved."},503);}
}
