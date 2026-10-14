import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
import { nextPayDate, payrollActionSchema, payrollDateSchema } from "@/lib/academy/payroll";
import {loadAllRecords} from "@/lib/academy/paged-records";

const headers = { "Cache-Control": "private, no-store" };
const reply = (data: unknown, status=200) => NextResponse.json(data,{status,headers});
function failure(error: {code?: string; message?: string}) {
  const safeCodes = ["PW101","PW102","PW103","PW104","PW105","PW106","PW107"];
  if (error.code === "42501") return reply({error:"Your account is not authorized for this salary operation."},403);
  if (error.code === "40001" || error.code === "23505") return reply({error:"This record changed or is already finalized. Reload before retrying."},409);
  if (safeCodes.includes(error.code || "")) return reply({error:error.message || "Salary rules require attention."},422);
  if (error.code==="22023") return reply({error:error.message || "Invalid salary details."},400);
  return reply({error:"The salary operation could not be completed."},503);
}
export async function GET(request: Request) {
  try {
    const {client,profile}=await identity();
    if (!profile || !["active","on_leave"].includes(profile.status) || ["parent","student","general_manager"].includes(profile.role))
      return reply({error:"Staff salary access is required."},403);
    const url=new URL(request.url);
    const bankStaff=url.searchParams.get("bankStaffId");
    if(bankStaff) {
      if(!/^[0-9a-f-]{36}$/i.test(bankStaff)) return reply({error:"Invalid staff identifier."},400);
      const currency=url.searchParams.get("currency");
      if(!currency||!["GBP","USD","EUR","CAD","NGN"].includes(currency)) return reply({error:"Choose the bank instruction currency."},400);
      if(bankStaff!==profile.id && !["super_admin","finance"].includes(profile.role)) return reply({error:"Private bank access is restricted."},403);
      const {data,error}=await client.from("pw_salary_banks").select("staff_id,bank_name,account_name,account_number,routing_code,currency").eq("staff_id",bankStaff).eq("currency",currency).maybeSingle();
      if(error) return failure(error);
      return reply({bank:data});
    }
    const parsed=payrollDateSchema.safeParse(url.searchParams.get("payDate")||nextPayDate());
    if(!parsed.success) return reply({error:"Choose a valid 28th pay date."},400);
    const [preview,batches,rates,directory,banks]=await Promise.all([
      client.rpc("pw_preview_salary",{p_date:parsed.data}),
      client.from("pw_salary_batches").select("id,pay_date,status,revision,created_at,approval_mode,statements:pw_salary_statements(id,staff_id,staff_name,role,currency,net,items,adjustments,paid_at,transfer_reference)").lte("pay_date",parsed.data).order("pay_date",{ascending:false}).limit(24),
      loadAllRecords(client,"pw_salary_rates","id,staff_id,effective_from,terms,status,reason,proposed_by,decided_at,created_at"),
      client.rpc("pw_payroll_directory"),
      client.from("pw_salary_banks").select("staff_id"),
    ]);
    if(batches.error||rates.error||directory.error||banks.error) return reply({error:"Salary records are unavailable."},503);
    if(preview.error&&preview.error.code!=="PW103") return failure(preview.error);
    return reply({profile,rulesConfigured:!preview.error,preview:preview.data,batches:batches.data,
      rates:rates.data?.filter(r=>r.status==="approved"),rateProposals:rates.data?.filter(r=>r.status!=="approved"),
      ...directory.data,bankConfiguredIds:(banks.data||[]).map(b=>b.staff_id)});
  }catch{return reply({error:"The salary workspace could not be loaded."},503);}
}
export async function POST(request:Request) {
  if(!sameOrigin(request)) return reply({error:"Invalid request origin."},403);
  try {
    const {client,profile}=await identity();
    if(!profile||profile.status!=="active"||["parent","student","general_manager"].includes(profile.role)) return reply({error:"Active staff access is required."},403);
    const parsed=payrollActionSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success) return reply({error:"Check the required salary fields and written reasons."},400);
    const p=parsed.data;
    let result: any;
    switch(p.action) {
      case "propose_rate": result=await client.rpc("pw_propose_salary_rate",{p_staff:p.staffId,p_date:p.effectiveFrom,p_reason:p.reason,
        p_terms:{monthlyStudentRate:p.monthlyStudentRate,trialRate:p.trialRate,coverRate:p.coverRate,baseSalary:p.baseSalary,adminExtraParentRate:p.adminExtraParentRate,
        adminQuota:p.adminQuota,advanceEligible:p.advanceEligible,currency:p.currency,managementFirstPeriod:p.managementFirstPeriod}});break;
      case "decide_rate": result=await client.rpc("pw_decide_salary_rate",{p_id:p.id,p_decision:p.decision,p_reason:p.reason});break;
      case "course": result=await client.rpc("pw_confirm_course",{p_student:p.studentId,p_start:p.startDate,p_effective:p.effectiveFrom,p_frequency:p.weeklyFrequency});break;
      case "bank": result=await client.rpc("pw_record_salary_bank",{p_staff:p.staffId,p_bank:p.bankName,p_name:p.accountName,p_number:p.accountNumber,p_routing:p.routingCode,p_currency:p.currency});break;
      case "admin_snapshot": result=await client.rpc("pw_confirm_salary_parent_count",{p_staff:p.staffId,p_date:p.payDate,p_count:p.activeParents,p_reason:p.reason});break;
      case "generate": result=await client.rpc("pw_generate_salary",{p_date:p.payDate});break;
      case "adjust": result=await client.rpc("pw_adjust_salary",{p_statement:p.statementId,p_kind:p.kind,p_amount:p.amount,p_reason:p.reason});break;
      case "remove_adjustment": result=await client.rpc("pw_adjust_salary",{p_statement:p.statementId,p_kind:"deduction",p_amount:0,p_reason:p.reason,p_remove:p.adjustmentId});break;
      case "batch": result=await client.rpc("pw_salary_transition",{p_id:p.id,p_decision:p.decision,p_reason:p.reason});break;
      case "paid": result=await client.rpc("pw_mark_salary_paid",{p_statement:p.statementId,p_reference:p.transferReference,p_confirmed:p.confirmed});break;
    }
    if(result.error)return failure(result.error);
    return reply({ok:true,...(typeof result.data==="string"?{id:result.data}:{})});
  }catch{return reply({error:"The salary operation could not be completed."},503);}
}
