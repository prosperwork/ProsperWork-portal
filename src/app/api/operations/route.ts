import {NextRequest,NextResponse} from "next/server";
import {operationsAction} from "@/lib/academy/operations";
import {identity} from "@/lib/supabase/identity";
import {sameOrigin} from "@/lib/supabase/server";
import {loadAllRecords} from "@/lib/academy/paged-records";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 try{
  const {client,profile}=await identity();if(!profile||!["active","on_leave"].includes(profile.status))return reply({error:"Sign in with an active account."},401);
  const tables=["pw_billing_contracts","pw_fx_rates","pw_finance_rules","pw_availability","pw_recurring_series","pw_student_pauses","pw_students","pw_profiles","pw_payments","pw_quality_observations","pw_leads","pw_operations_events","pw_referral_requests","pw_referral_credits","pw_media_reviews","pw_files"];
  const rows=await Promise.all(tables.map(t=>loadAllRecords(client,t,"*",{cursor:t==="pw_finance_rules"?"singleton":"id"})));if(rows.some(r=>r.error))return reply({error:"Operations records could not be loaded."},503);
  const financial=await client.rpc("pw_financial_summary"),quality=await client.rpc("pw_quality_snapshot");
  if(financial.error||quality.error)return reply({error:"Reports are temporarily unavailable."},503);
  const [contracts,fx,rules,availability,series,pauses,students,staff,payments,observations,leads,events,referrals,credits,media,files]=rows.map(r=>r.data||[]);
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:profile.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const day=Date.parse(today);
  const data = {
    profile,
    contracts,
    fx,
    settings: rules[0] || null,
    availability,
    series,
    pauses,
    students,
    staff: staff.map(({ id, name, role, status, timezone }) => ({ id, name, role, status, timezone })),
    referrals,
    credits,
    media,
    files: files.filter((f) => f.complete && ["practice", "homework"].includes(f.category)).map(({ id, category, target_id, original_name }) => ({ id, category, target_id, original_name })),
    payments: payments.map((p) => {
      const delta = Math.round((Date.parse(p.payload.dueDate) - day) / 86400000);
      return {
        ...p,
        amountDue: Math.max(0, Number(p.payload.amount) - Number(p.payload.referralDiscount || 0)),
        overdueDays: p.payload.status === "paid" ? 0 : Math.max(0, -delta),
        dueBucket: p.payload.status === "paid" ? "paid" : delta < 0 ? "overdue" : delta === 0 ? "today" : delta === 1 ? "tomorrow" : delta === 2 ? "next_tomorrow" : "future",
      };
    }),
    observations,
    leads: leads.map((l) => ({
      ...l,
      ageMinutes: Math.max(0, Math.floor((Date.now() - Date.parse(l.payload.arrivedAt)) / 60000)),
      followupAt: l.trial_verified_at ? new Date(Date.parse(l.trial_verified_at) + 86400000).toISOString() : null,
    })),
    financial: financial.data,
    quality: quality.data,
    events,
  };
  return reply({ ok: true, data, ...data });
 }catch{return reply({error:"Operations service is unavailable."},503);}
}
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return reply({error:"Invalid request origin."},403);
 try{
  const {client,profile}=await identity();if(!profile||profile.status!=="active")return reply({error:"Active account required."},403);
  const parsed=operationsAction.safeParse(await request.json());if(!parsed.success)return reply({error:parsed.error.issues[0]?.message||"Check the form."},400);
  const action=parsed.data.action;const rpc=action.startsWith("media_")?"pw_media_action":["observe","lead_assign","trial","convert","referral"].includes(action)?"pw_quality_sales_action":"pw_operations_action";
  const result=await client.rpc(rpc,{p_action:action,p_data:parsed.data});
  if(result.error)return reply({error:result.error.code==="42501"?"This action is outside your assigned role or portfolio.":result.error.code==="23505"?"An active contract, dated rate or availability slot already exists.":result.error.code==="PW003"?"The teacher calendar or administrator capacity conflicts.":action==="generate"?"Billing may be held after a student pause. Finance must stop the held contract and agree a new restart anchor; paused periods are not automatically charged.":"The workflow is blocked. Check the selected records, declared availability, active assignments, verified trial/payment and billing contract."},result.error.code==="42501"?403:409);
  return reply({ ok: true, ...(typeof result.data === "object" && result.data !== null ? result.data : { data: result.data }) });
 }catch{return reply({error:"The operation could not be saved."},503);}
}
