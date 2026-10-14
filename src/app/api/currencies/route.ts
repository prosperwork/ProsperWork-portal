import{NextRequest,NextResponse}from"next/server";
import{identity}from"@/lib/supabase/identity";
import{sameOrigin}from"@/lib/supabase/server";
import{currencySetting}from"@/lib/academy/currency";
import {loadAllRecords} from "@/lib/academy/paged-records";
const reply=(d:unknown,s=200)=>NextResponse.json(d,{status:s,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 try{const{client,profile}=await identity();if(!profile)return reply({error:"Sign in required"},401);
 const r=await client.from("pw_currencies").select("code,name,symbol,enabled").order("code");if(r.error)return reply({error:"Currency catalog unavailable"},503);
 const financial=["super_admin","finance"].includes(profile.role);
 const fx=financial?await loadAllRecords(client,"pw_fx_rates","id,currency,date,rate",{sort:"date"}):{data:[],error:null};
 const rules=profile.role==="super_admin"?await client.from("pw_finance_rules").select("tax_percent,finance_profit,referral_percent").single():{data:null,error:null};
 if(fx.error||rules.error)return reply({error:"Financial settings unavailable"},503);
 return reply({currencies:r.data,reportingCurrency:"NGN",rates:fx.data,financeRules:rules.data});}catch{return reply({error:"Currency catalog unavailable"},503);}
}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return reply({error:"Invalid origin"},403);
 try{const{client,profile}=await identity();if(profile?.role!=="super_admin"||profile.status!=="active")return reply({error:"Owner only"},403);
 const p=currencySetting.safeParse(await req.json());if(!p.success)return reply({error:p.error.issues[0].message},400);
 const r=await client.rpc("pw_currency_action",{p_data:p.data});if(r.error)return reply({error:"Currency update blocked. Check the required fields and do not disable the reporting base."},409);return reply(r.data);
 }catch{return reply({error:"Currency service unavailable"},503);}
}
