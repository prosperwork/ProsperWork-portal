import{createClient}from"@supabase/supabase-js";
import{randomBytes}from"node:crypto";
import assert from"node:assert/strict";
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base=process.env.APP_BASE_URL||`https://${process.env.REPLIT_DEV_DOMAIN}`;
const redirectTo=new URL("/auth/confirm?next=/reset-password",base).href;
let fixture;
try{
 const created=await client.auth.admin.createUser({email:`redirect-${randomBytes(12).toString("hex")}@example.invalid`,password:randomBytes(32).toString("base64url"),email_confirm:true});
 if(created.error)throw Error("FIXTURE_CREATION_FAILED");fixture=created.data.user;
 const link=await client.auth.admin.generateLink({type:"recovery",email:fixture.email,options:{redirectTo}});
 if(link.error)throw Error("RECOVERY_LINK_GENERATION_FAILED");
 const verify=await fetch(link.data.properties.action_link,{redirect:"manual",signal:AbortSignal.timeout(30000)});
 assert([302,303].includes(verify.status));const destination=new URL(verify.headers.get("location"));
 assert.equal(destination.origin,new URL(base).origin);assert.equal(destination.pathname,"/auth/confirm");assert.equal(destination.searchParams.get("next"),"/reset-password");
 const hash=new URLSearchParams(destination.hash.slice(1));assert(hash.has("access_token")&&hash.has("refresh_token"));
 // Continue past Supabase: the reverse-proxied Next server must preserve the
 // public origin when moving to the browser fragment-completion page.
 const callback=await fetch(destination.origin+destination.pathname+destination.search,{redirect:"manual",signal:AbortSignal.timeout(30000)});
 assert.equal(callback.status,303);const finish=new URL(callback.headers.get("location"));
 assert.equal(finish.origin,new URL(base).origin);assert.equal(finish.pathname,"/auth/finish");assert.equal(finish.searchParams.get("next"),"/reset-password");
 const landing=await fetch(finish,{redirect:"manual",signal:AbortSignal.timeout(30000)});assert.equal(landing.status,200);
 assert((await landing.text()).includes("ProsperWork secure sign-in"));
 console.log("PASS Real recovery chain: Supabase → public callback → public browser completion, HTTP 200; no internal host. Only a disposable fixture link was consumed.");
 const owner=process.env.PROSPERWORK_OWNER_EMAIL;if(!owner)throw Error("OWNER_EMAIL_NOT_CONFIGURED");
 const sent=await client.auth.resetPasswordForEmail(owner,{redirectTo});
 if(sent.error)throw Error("OWNER_RESET_EMAIL_NOT_ACCEPTED");
 console.log("Fresh owner password-reset email accepted by Supabase. Open the newest email, not the old localhost link.");
}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:"RECOVERY_REDIRECT_CHECK_FAILED");process.exitCode=1;}
finally{if(fixture){const deleted=await client.auth.admin.deleteUser(fixture.id);if(deleted.error){console.error("FIXTURE_CLEANUP_FAILED");process.exitCode=1;}}}
