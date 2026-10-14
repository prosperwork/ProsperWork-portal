import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { academyPDF } from "@/lib/academy/pdf";
import { billingAmountLines } from "@/lib/academy/billing-amounts";
import {loadAllRecords} from "@/lib/academy/paged-records";
import { generateBirthdayTribute } from "@/lib/ai/groq";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const reply=(error:string,status:number)=>NextResponse.json({error},{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request){
 try{
  const {client,profile}=await identity();
  if(!profile||!["active","on_leave"].includes(profile.status))return reply("Sign in to download academy documents.",403);
  const params=new URL(request.url).searchParams,kind=params.get("kind"),id=params.get("id")||"";
  if(!["progress","invoice","receipt","birthday"].includes(kind||"")||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return reply("Choose a valid document.",400);
  let title="",sections:{heading:string;lines:string[]}[]=[];
  if(kind==="invoice"||kind==="receipt"){
   const {data,error}=await client.from("pw_payments").select("payload,created_at").eq("id",id).maybeSingle();
   if(error||!data)return reply("This billing document is not available to your account.",404);
   const p=data.payload;
   if(kind==="receipt"&&p.status!=="paid")return reply("A receipt requires a verified payment.",409);
   title=kind==="receipt"?"Verified payment receipt":"Payment invoice";
   sections=[{heading:`Reference: ${p.id}`,lines:[`Student: ${p.studentName}`,`Parent / guardian: ${p.parentName}`,...billingAmountLines(p,kind),`Due: ${p.dueDate}`,`Status: ${p.status}`,`Created: ${new Date(data.created_at).toISOString().slice(0,10)}`]}];
   if(kind==="receipt")sections.push({heading:"Verification",lines:["The academy has verified the recorded payment. This document does not initiate a bank transfer."]});
  }else{
   if(["finance","hr","sales_marketing","social_media","general_manager"].includes(profile.role))return reply("Learning reports are restricted.",403);
   const student=await client.from("pw_students").select("payload").eq("id",id).maybeSingle();
   if(student.error||!student.data)return reply("This learner is not available to your account.",404);
   const s=student.data.payload;
   if(kind==="birthday"){
    const age=typeof s.age==="number"?s.age:s.dob?Math.floor((Date.now()-new Date(s.dob).getTime())/(365.25*24*3600*1000)):null;
    const tribute=await generateBirthdayTribute({name:s.name,age,instrument:s.instrument,rank:s.rank,songsDone:s.songsDone,teacherName:s.teacherName});
    title=`Happy birthday, ${s.name}!`;
    sections=[
     {heading:"Musical Birthday Tribute",lines:tribute.split("\n").map(l=>l.trim()).filter(Boolean)},
     {heading:"Academy Learner Profile",lines:[`Instrument: ${s.instrument||"General Music"}`,`Level / Rank: ${s.rank||"Developing"}`,`Completed repertoire: ${(s.songsDone||[]).join(", ")||"In progress"}`]}
    ];
   }else{
    const month=params.get("month")||new Intl.DateTimeFormat("en-CA",{timeZone:s.timezone||"Africa/Lagos",year:"numeric",month:"2-digit"}).format(new Date());
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return reply("Choose a valid report month.",400);
    const lessons=await loadAllRecords(client,"pw_lessons","id,payload,verified_at,created_at",{ascending:true,filter:q=>q.eq("student_id",id)});
    if(lessons.error)return reply("Lesson history unavailable.",503);
    const rows=lessons.data.filter(l=>new Intl.DateTimeFormat("en-CA",{timeZone:s.timezone||"Africa/Lagos",year:"numeric",month:"2-digit"}).format(new Date(l.payload.startsAt))===month);
    const ids=rows.map(l=>l.id);
    const boards=ids.length?await client.from("pw_lesson_boards").select("*").in("lesson_id",ids):{data:[],error:null};
    const homework=await loadAllRecords(client,"pw_homework","id,payload,created_at",{ascending:true,filter:q=>q.eq("student_id",id)});
    const [practice,evaluations]=await Promise.all([loadAllRecords(client,"pw_practice","id,ended_at,seconds,game_score,game_total",{sort:"ended_at",ascending:true,filter:q=>q.eq("student_id",id).eq("status","complete")}),loadAllRecords(client,"pw_evaluations","id,title,scores,notes,created_at",{ascending:true,filter:q=>q.eq("student_id",id)})]);
    if(boards.error||homework.error||practice.error||evaluations.error)return reply("Progress details unavailable.",503);
    title=`Monthly progress — ${month}`;
    sections=[{heading:s.name,lines:[`Instrument: ${s.instrument} | Rank: ${s.rank}`,`Teacher: ${s.teacherName}`,`Student timezone: ${s.timezone}`,`Verified classes: ${rows.filter(l=>l.verified_at).length}`,`Completed repertoire: ${(s.songsDone||[]).join(", ")||"None recorded"}`]},
     ...rows.map(l=>{const b=boards.data?.find(b=>b.lesson_id===l.id);return {heading:new Intl.DateTimeFormat("en-GB",{timeZone:s.timezone||"Africa/Lagos",dateStyle:"medium",timeStyle:"short"}).format(new Date(l.payload.startsAt)),lines:[`${l.payload.title} | ${l.payload.status}`,`Completed topics: ${(b?.completed_topics||[]).join(", ")||"None recorded"}`,`Notes: ${b?.notes||l.payload.notes||"None recorded"}`,`Next topics: ${b?.next_topics||l.payload.nextTopics||"None recorded"}`]};}),
     {heading:"Homework",lines:homework.data.filter(h=>typeof h.payload.dueDate==="string"&&h.payload.dueDate.startsWith(month)).map(h=>`${h.payload.title}: ${h.payload.status} — ${h.payload.teacherFeedback||h.payload.feedback||"No review yet"}`)},
     {heading:"Practice & exercises",lines:(practice.data||[]).filter(p=>p.ended_at&&new Intl.DateTimeFormat("en-CA",{timeZone:s.timezone||"Africa/Lagos",year:"numeric",month:"2-digit"}).format(new Date(p.ended_at))===month).map(p=>`${new Intl.DateTimeFormat("en-GB",{timeZone:s.timezone||"Africa/Lagos",dateStyle:"medium"}).format(new Date(p.ended_at))}: ${Math.floor(p.seconds/60)} minutes${p.game_total?` | Exercise ${p.game_score}/${p.game_total}`:""}`)},
     {heading:"Educator evaluations",lines:(evaluations.data||[]).filter(e=>new Intl.DateTimeFormat("en-CA",{timeZone:s.timezone||"Africa/Lagos",year:"numeric",month:"2-digit"}).format(new Date(e.created_at))===month).map(e=>`${e.title}: ${Object.entries(e.scores).map(([label,score])=>`${label} ${score}/100`).join("; ")} — ${e.notes}`)}];
   }
  }
  const bytes=await academyPDF(title,sections);
  return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="prosperwork-${kind}-${id}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return reply("The requested document could not be generated.",503);}
}
