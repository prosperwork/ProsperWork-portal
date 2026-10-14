import{NextResponse}from"next/server";
import{createClient}from"@supabase/supabase-js";
import{sameOrigin}from"@/lib/supabase/server";
import{z}from"zod";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  if(!sameOrigin(request))return NextResponse.json({error:"Origin rejected."},{status:403});
  const body=z.object({token:z.string().uuid()}).strict().safeParse(await request.json());
  if(!body.success)return NextResponse.json({error:"Invalid unsubscribe link."},{status:400});
  const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
  const{error}=await c.rpc("pw_marketing_unsubscribe",{p_token:body.data.token});
  return NextResponse.json(error?{error:"Unable to update preference."}:{ok:true},{status:error?503:200,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 }catch{return NextResponse.json({error:"Unable to update preference."},{status:503});}
}
