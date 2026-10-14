// Uses runtime credentials only. Never writes credentials or prints responses
// containing Auth configuration, tokens, SMTP passwords or secret values.
import{readFile}from"node:fs/promises";
import{randomBytes}from"node:crypto";
import{databaseClient}from"./database-client.mjs";
let invocationSecret;
const keys=["SUPABASE_ACCESS_TOKEN","SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_ANON_KEY","SMTP_PASSWORD","LIVEKIT_URL","LIVEKIT_API_KEY","LIVEKIT_API_SECRET"];
function safe(text){let s=String(text);for(const k of keys)if(process.env[k])s=s.split(process.env[k]).join("[redacted]");if(invocationSecret)s=s.split(invocationSecret).join("[redacted]");return s.slice(0,1800);}
const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const base=process.env.APP_BASE_URL||(process.env.REPLIT_DEV_DOMAIN?`https://${process.env.REPLIT_DEV_DOMAIN}`:null);
if(!base||new URL(base).protocol!=="https:")throw Error("An HTTPS application URL is required");
if(keys.some(k=>!process.env[k]))throw Error("Required deployment credentials are missing");
const origin=new URL(base).origin;
const headers={Authorization:"Bearer "+process.env.SUPABASE_ACCESS_TOKEN};
async function management(path,options={}){
 const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(180000)});
 const text=await r.text();if(!r.ok)throw Error(`Supabase ${path.split("?")[0]} rejected (${r.status}): ${safe(text)}`);
 return text?JSON.parse(text):null;
}
try{
 const previous=await management("config/auth");
 const redirects=new Set((previous.uri_allow_list||"").split(",").map(x=>x.trim()).filter(Boolean));
 for(const path of ["/","/auth/confirm","/auth/confirm?next=/reset-password","/auth/confirm?next=/hiring","/auth/finish","/reset-password"])redirects.add(origin+path);
 // Retain existing approved domains; only correct the fallback and add our
 // exact callbacks. Do not change confirmations, providers or email templates.
 await management("config/auth",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({site_url:origin,uri_allow_list:[...redirects].join(",")})});
 const auth=await management("config/auth");
 if(auth.site_url!==origin||!auth.uri_allow_list.includes(origin+"/auth/confirm?next=/reset-password"))throw Error("Auth redirect read-back failed");
 console.log("Auth Site URL and exact email callbacks configured:",origin);
 if(/localhost/i.test(previous.mailer_templates_recovery_content||""))console.log("WARNING: recovery template itself contains localhost and needs correction.");
 const secrets=["SMTP_PASSWORD","LIVEKIT_URL","LIVEKIT_API_KEY","LIVEKIT_API_SECRET",...(process.env.GROQ_API_KEY?["GROQ_API_KEY"]:[] )].map(name=>({name,value:process.env[name]}));
 secrets.push({name:"APP_BASE_URL",value:origin});
 const db=databaseClient();await db.connect();
 try{
  const vault=await db.query("select decrypted_secret from vault.decrypted_secrets where name='academy_cron_invocation'");
  invocationSecret=vault.rows[0]?.decrypted_secret||randomBytes(32).toString("base64url");
  if(!vault.rows.length)await db.query("select vault.create_secret($1,$2,$3)",[invocationSecret,"academy_cron_invocation","Credential for academy Edge scheduling; never use the management token"]);
 }finally{await db.end();}
 secrets.push({name:"ACADEMY_CRON_SECRET",value:invocationSecret});
 await management("secrets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(secrets)});
 const remoteNames=new Set((await management("secrets")).map(s=>s.name));
 if(secrets.some(s=>!remoteNames.has(s.name)))throw Error("Edge secret name read-back failed");
 console.log("Required Edge secrets uploaded:",secrets.map(s=>s.name).join(", "));
 const form=new FormData();
 const paths=["supabase/functions/academy-cron/index.ts","supabase/functions/academy-cron/deno.json","supabase/functions/_shared/academy-tick.mjs","src/lib/email/transport.mjs"];
 for(const path of paths)form.append("file",new Blob([await readFile(path)],{type:"application/octet-stream"}),path);
 // Opaque cron credential: handler performs an explicit constant-time check.
 // It is not a user JWT; the gateway must not attempt JWT validation.
 form.append("metadata",JSON.stringify({name:"academy-cron",entrypoint_path:paths[0],import_map_path:paths[1],verify_jwt:false}));
 const deployed=await management("functions/deploy?slug=academy-cron",{method:"POST",body:form});
 console.log("Edge deployment:",{slug:deployed.slug,status:deployed.status,version:deployed.version});
 const functionUrl=process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/academy-cron";
 const denied=await fetch(functionUrl,{method:"POST",headers:{Authorization:"Bearer "+process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(30000)});
 if(denied.status!==401&&denied.status!==403)throw Error("Ordinary caller was not rejected");
 console.log("Hosted function rejects anonymous/ordinary project credentials:",denied.status);
 const check=await fetch(functionUrl,{method:"POST",headers:{Authorization:"Bearer "+invocationSecret,"Content-Type":"application/json"},body:JSON.stringify({action:"verify_providers"}),signal:AbortSignal.timeout(90000)});
 const text=await check.text();if(!check.ok)throw Error("Hosted provider verification failed ("+check.status+"): "+safe(text));
 const result=JSON.parse(text);
 if(result.database!=="ok"||result.smtp!=="ok"||result.livekit!=="ok")throw Error("Hosted provider verification response incomplete");
 console.log("Hosted provider verification:",result);
 const tick=await fetch(functionUrl,{method:"POST",headers:{Authorization:"Bearer "+invocationSecret,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(90000)});
 const tickResult=await tick.json();if(!tick.ok||tickResult.completed!==true)throw Error("Hosted automation tick failed: "+safe(JSON.stringify(tickResult)));
 console.log("Hosted automation tick:",tickResult);
}catch(e){console.error(safe(e.message));process.exitCode=1;}
