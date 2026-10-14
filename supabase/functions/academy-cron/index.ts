import{createClient}from"npm:@supabase/supabase-js@2.117.3";
import{RoomServiceClient}from"npm:livekit-server-sdk@2.19.1";
import{academyTick}from"../_shared/academy-tick.mjs";
import{deliverEmail,safeEmailError,smtpTransport}from"../../../src/lib/email/transport.mjs";
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const invocationSecret=Deno.env.get("ACADEMY_CRON_SECRET");
function authorized(h:string){
 if(!invocationSecret||invocationSecret.length<32)return false;const expected="Bearer "+invocationSecret;if(h.length!==expected.length)return false;
 let difference=0;for(let i=0;i<h.length;i++)difference|=h.charCodeAt(i)^expected.charCodeAt(i);return difference===0;
}
Deno.serve(async req=>{
 if(req.method!=="POST"||!authorized(req.headers.get("authorization")||""))return new Response("Unauthorized",{status:401});
 const appUrl=Deno.env.get("APP_BASE_URL"),livekit=Deno.env.get("LIVEKIT_URL");
 if(!appUrl||!appUrl.startsWith("https://")||!Deno.env.get("SMTP_PASSWORD")||!livekit||!Deno.env.get("LIVEKIT_API_KEY")||!Deno.env.get("LIVEKIT_API_SECRET"))return new Response("Automation configuration incomplete",{status:503});
 try{
  const url=new URL(livekit);if(url.protocol!=="wss:")return new Response("Invalid classroom configuration",{status:503});url.protocol="https:";
  const client=createClient(Deno.env.get("SUPABASE_URL")!,secret!,{auth:{persistSession:false,autoRefreshToken:false}});
  const roomService=new RoomServiceClient(url.origin,Deno.env.get("LIVEKIT_API_KEY")!,Deno.env.get("LIVEKIT_API_SECRET")!,{requestTimeout:10});
  const body=await req.json().catch(()=>({}));
  if(body.action==="verify_providers"){
   const database=await client.rpc("pw_open_classrooms");if(database.error)return Response.json({error:"Database validation failed"},{status:503});
   try{await smtpTransport().verify();}catch(e){return Response.json({error:"SMTP validation failed",code:safeEmailError(e)},{status:503});}
   try{await roomService.listRooms();}catch{return Response.json({error:"LiveKit validation failed"},{status:503});}
   return Response.json({database:"ok",smtp:"ok",livekit:"ok"});
  }
  return Response.json(await academyTick({client,roomService,appUrl,deliverEmail,safeEmailError}));
 }catch{return new Response("Automation failed; leased work retries on the next invocation",{status:503});}
});
