import {NextResponse} from "next/server";
import {identity} from "@/lib/supabase/identity";
import {billingAmounts} from "@/lib/academy/billing-amounts";
import {loadAllRecords} from "@/lib/academy/paged-records";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const {client,profile}=await identity();
  if(!profile||!["active","on_leave"].includes(profile.status)||!["parent","finance","super_admin"].includes(profile.role))return NextResponse.json({error:"Billing documents are restricted."},{status:403});
  const result=await loadAllRecords(client,"pw_payments","id,payload,created_at");
  if(result.error)return NextResponse.json({error:"Billing documents unavailable."},{status:503});
  return NextResponse.json({payments:result.data.map(p=>({id:p.payload.id,studentName:p.payload.studentName,amount:p.payload.amount,...billingAmounts(p.payload),currency:p.payload.currency,status:p.payload.status,dueDate:p.payload.dueDate}))},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Billing documents unavailable."},{status:503});}
}
