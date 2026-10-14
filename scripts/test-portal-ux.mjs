import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { databaseClient } from "./database-client.mjs";

if(!process.argv.includes("--development"))throw Error("Development fixtures only. Pass --development.");
const layoutOnly=process.argv.includes("--layout-only");
const base="https://"+process.env.REPLIT_DEV_DOMAIN;
const db=databaseClient(),sdk=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const users=[],policies=[],sessions=new Map(),child="ux-child-"+randomUUID(),invoice="ux-invoice-"+randomUUID();
let socket,sequence=0;
const pending=new Map(),exceptions=[],pendingApi=new Set();
const portalPaths=["/","/schedule","/students","/leads","/finance","/people","/curriculum","/homework","/reports","/operations","/management","/payroll","/accounts","/settings","/family","/learning","/documents","/policies","/leave","/hiring","/communications","/studio","/manual","/workflows","/profile"];
async function profileRequest(role,body,origin=base){
 return fetch(base+"/api/profile",{method:body?"PATCH":"GET",headers:{Cookie:sessions.get(role).cookies.map(raw=>raw.split(";")[0]).join("; "),Origin:origin,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
}
function cdp(method,params={}){
 return new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error("Browser command timeout: "+method));},25000);
  pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
  socket.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const r=await cdp("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error("Browser expression failed");
 return r.result.value;
}
async function waitFor(expression){
 for(let n=0;n<60;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,300));}
 throw Error("Portal did not settle");
}
async function open(path){
 await cdp("Page.navigate",{url:base+path});
 await waitFor("document.readyState==='complete' && !!document.querySelector('aside a[href*=\"manual\"]')");
 await waitFor("!document.querySelector('.portal-route-content .loading-screen')");
 await new Promise(r=>setTimeout(r,1100));
 for(let n=0;pendingApi.size&&n<100;n++)await new Promise(r=>setTimeout(r,200));
 assert.equal(pendingApi.size,0,"Portal data requests settled");
 await new Promise(r=>setTimeout(r,200));
}
async function screenshot(name){
 await mkdir("generated-artifacts/portal-ux",{recursive:true});
 const image=await cdp("Page.captureScreenshot",{format:"jpeg",quality:75,captureBeyondViewport:false});
 await writeFile("generated-artifacts/portal-ux/"+name+".jpg",Buffer.from(image.data,"base64"));
}
async function signIn(role){
 await cdp("Network.clearBrowserCookies");
 const cookies=sessions.get(role).cookies.map(raw=>{
  const first=raw.split(";")[0],i=first.indexOf("=");
  return{name:first.slice(0,i),value:first.slice(i+1),url:base,path:"/",secure:true,httpOnly:true,sameSite:"Lax"};
 });
 await cdp("Network.setCookies",{cookies});
}
function check(label,condition){assert(condition,label);console.log("PASS "+label);}
async function inspectLocalTabs(path,device){
 const selector=path==="/operations"?".ops-tabs button":".pr-tabs button";
 const count=await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
 for(let i=0;i<count;i++){
  await evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[${i}].click()`);
  await new Promise(r=>setTimeout(r,300));
  check(`${device} ${path} tab ${i+1} fits`,await evaluate("document.documentElement.scrollWidth<=window.innerWidth+2"));
  if(device==="Desktop")await screenshot(`owner-${path.slice(1)}-tab-${i}-desktop`);
  const hasCreation=await evaluate("(()=>{const d=[...document.querySelectorAll('.portal-route-content details')].find(x=>x.getBoundingClientRect().width>0);if(!d)return false;d.open=true;return true;})()");
  if(hasCreation){
   await new Promise(r=>setTimeout(r,100));
   check(`${device} ${path} tab ${i+1} expanded form fits`,await evaluate("document.documentElement.scrollWidth<=window.innerWidth+2"));
   await evaluate("document.querySelectorAll('.portal-route-content details').forEach(d=>d.open=false)");
  }
 }
 if(count)await evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[0].click()`);
}
try{
 await db.connect();
 for(const role of ["super_admin","teacher","qc","parent"]){
  const email="ux-"+randomUUID()+"@example.invalid",password=randomBytes(32).toString("base64url");
  const created=await sdk.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:"UX "+role}});
  if(created.error)throw Error("Isolated account setup failed");
  const id=created.data.user.id;users.push(id);
  await db.query("update public.pw_profiles set role=$2,status='active' where id=$1",[id,role]);
  const login=await fetch(base+"/api/auth",{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify({action:"login",email,password})});
  assert.equal(login.status,200,"Fixture login");
  sessions.set(role,{id,cookies:login.headers.getSetCookie()});
 }
 const owner=sessions.get("super_admin").id,parent=sessions.get("parent").id,teacher=sessions.get("teacher").id;
 const legal=await db.query("insert into public.pw_policy_versions(key,title,version,created_by,published_at,audience_parent_id) select k,'Isolated UI fixture policy',coalesce((select max(version) from public.pw_policy_versions where key=k),0)+1,$1,now(),$2 from unnest(array['parent_agreement','terms_of_service','reschedule_policy']) k returning id",[owner,parent]);
 for(const p of legal.rows){policies.push(p.id);await db.query("insert into public.pw_policy_acceptances(parent_id,policy_id) values($1,$2)",[parent,p.id]);}
 await db.query("insert into public.pw_students(id,parent_id,teacher_id,payload) values($1,$2,$3,$4)",[child,parent,teacher,{id:child,name:"UX Learner",dob:"2018-01-01",parentName:"UX Guardian",parentEmail:"ux-guardian@example.invalid",instrument:"Piano",teacherName:"UX teacher",adminName:"",status:"active",timezone:"Europe/London",rank:"Novice",consent:false,songsDone:[],songsToDo:[],monthlyLessons:4,lessonsTaken:0}]);
 await db.query("insert into public.pw_payments(id,student_id,parent_id,payload) values($1,$2,$3,$4)",[invoice,child,parent,{id:invoice,parentName:"UX Guardian",studentName:"UX Learner",amount:25000,currency:"NGN",dueDate:new Date(Date.now()+365*86400000).toISOString().slice(0,10),terms:"upfront",status:"due",referralDiscount:0,receiptName:""}]);
 await db.query("delete from public.pw_emails where recipient_id=any($1::uuid[])",[users]);
 const targets=await(await fetch("http://127.0.0.1:9222/json/list")).json();
 socket=new WebSocket(targets.find(t=>t.type==="page").webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
 socket.addEventListener("message",event=>{
  const m=JSON.parse(event.data);
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
   if(m.method==="Network.requestWillBeSent"&&m.params.request.url.startsWith(base+"/api/"))pendingApi.add(m.params.requestId);
   if(["Network.loadingFinished","Network.loadingFailed"].includes(m.method))pendingApi.delete(m.params.requestId);
  if(m.method==="Runtime.exceptionThrown"){
   const detail=m.params.exceptionDetails;
   exceptions.push((detail.exception?.description||detail.text||"Browser runtime exception").split("\n")[0].replace(/https?:\/\/\S+/g,"[URL]").slice(0,180));
  }
 });
 await cdp("Page.enable");await cdp("Page.navigate",{url:"about:blank"});
 await new Promise(r=>setTimeout(r,350));
 await cdp("Runtime.enable");await cdp("Network.enable");exceptions.length=0;
 await cdp("Emulation.setDeviceMetricsOverride",{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await signIn("super_admin");await open("/");
 check("One primary sidebar",await evaluate("document.querySelectorAll('.portal-sidebar').length===1"));
 check("Module targets are not repeated in the sidebar",await evaluate("(()=>{const h=[...document.querySelectorAll('aside nav a[href]')].map(a=>a.getAttribute('href'));return new Set(h).size===h.length;})()"));
 check("Every sidebar destination uses a page route",await evaluate("![...document.querySelectorAll('aside nav a')].some(a=>a.getAttribute('href').includes('?view='))"));
 check("Sidebar links are not underlined",await evaluate("[...document.querySelectorAll('aside nav a')].every(a=>!getComputedStyle(a).textDecorationLine.includes('underline'))"));
  check("Header has no expanded photo or sign-out controls",await evaluate("![...document.querySelectorAll('.portal-topbar button,.portal-topbar label')].some(x=>/^(Photo|Sign out)$/i.test(x.textContent.trim()))"));
 await screenshot("owner-dashboard-desktop");
  if(layoutOnly){
   for(const device of [{name:"desktop",width:1440,height:960},{name:"mobile",width:390,height:844}]){
    await cdp("Emulation.setDeviceMetricsOverride",{width:device.width,height:device.height,deviceScaleFactor:1,mobile:device.name==="mobile"});
    for(const path of ["/","/schedule","/reports","/management"]){
     await open(path);
     check(`${device.name} ${path} has no page overflow`,await evaluate("document.documentElement.scrollWidth<=innerWidth+2"));
     check(`${device.name} ${path} avoids an enclosing card`,await evaluate("getComputedStyle(document.querySelector('.workspace-page-frame')).borderTopWidth==='0px'"));
     check(`${device.name} ${path} panels retain side padding`,await evaluate("[...document.querySelectorAll('.section-card')].every(el=>parseFloat(getComputedStyle(el).paddingLeft)>=15)"));
     check(`${device.name} ${path} compact empty states`,await evaluate("[...document.querySelectorAll('.empty-state,.mw-empty')].every(el=>el.getBoundingClientRect().height<170)"));
     await screenshot(`layout-${path==="/"?"dashboard":path.slice(1)}-${device.name}`);
    }
   }
  }else{
  await evaluate("document.querySelector('.portal-topbar button[aria-controls=\"portal-account-menu\"]').click()");
  await waitFor("!!document.querySelector('#portal-account-menu')");
  check("Account dropdown offers profile and sign out",await evaluate("document.querySelector('#portal-account-menu').textContent.includes('View profile')&&document.querySelector('#portal-account-menu').textContent.includes('Sign out')"));
  await cdp("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});
  await cdp("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape"});
  await waitFor("!document.querySelector('#portal-account-menu')");
  await open("/profile");
  await waitFor("!!document.querySelector('.profile-form input[autocomplete=name]')");
  const invalid=await profileRequest("super_admin",{name:"UX Changed",timezone:"Invalid/Zone"});
  check("Profile rejects invalid time zones",invalid.status===400);
  const protectedFields=await profileRequest("super_admin",{name:"UX Changed",timezone:"Europe/London",role:"finance",email:"changed@example.invalid",id:sessions.get("teacher").id});
  check("Profile rejects account privilege and target changes",protectedFields.status===400);
  const badOrigin=await profileRequest("super_admin",{name:"UX Changed",timezone:"Europe/London"},"https://example.invalid");
  check("Profile rejects cross-origin writes",badOrigin.status===403);
  await evaluate("(()=>{const input=document.querySelector('.profile-form input[autocomplete=name]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'UX Updated Owner');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await evaluate("document.querySelector('.portal-route-content form').requestSubmit()");
  let changed;
  for(let n=0;n<20;n++){changed=await(await profileRequest("super_admin")).json();if(changed.profile?.name==='UX Updated Owner')break;await new Promise(r=>setTimeout(r,250));}
  check("Profile name edit persists to the owned account",changed.profile?.name==="UX Updated Owner"&&changed.profile?.role==="super_admin");
  const root=await cdp("DOM.getDocument");
  const photoInput=await cdp("DOM.querySelector",{nodeId:root.root.nodeId,selector:".portal-route-content input[type=file]"});
  check("Profile has a dedicated photo uploader",!!photoInput.nodeId);
  await cdp("DOM.setFileInputFiles",{nodeId:photoInput.nodeId,files:[process.cwd()+"/public/favicon-192x192.png"]});
  let withPhoto;
  for(let n=0;n<40;n++){withPhoto=await(await profileRequest("super_admin")).json();if(withPhoto.profile?.avatar_file_id&&withPhoto.avatarUrl)break;await new Promise(r=>setTimeout(r,250));}
  check("Profile photo upload creates a private signed avatar",!!withPhoto.profile?.avatar_file_id&&!!withPhoto.avatarUrl);
  await screenshot("owner-profile-desktop");
 await open("/finance");
 check("Owner has no unbound receipt upload",await evaluate("![...document.querySelectorAll('button,a')].some(x=>/upload receipt/i.test(x.textContent))"));
 await screenshot("owner-finance-desktop");
  for(const path of portalPaths.filter(path=>!["/","/finance","/manual"].includes(path))){
   await open(path);
   check("Desktop content fits "+path,await evaluate("document.documentElement.scrollWidth<=window.innerWidth+2"));
   check("No repeated module navigation in page headers "+path,await evaluate("(()=>{const modules=new Set([...document.querySelectorAll('.portal-nav a')].map(a=>a.getAttribute('href')));return ![...document.querySelectorAll('.portal-route-content header nav a')].some(a=>modules.has(a.getAttribute('href')));})()"));
   await screenshot("owner-"+path.slice(1)+"-desktop");
   if(["/operations","/payroll"].includes(path))await inspectLocalTabs(path,"Desktop");
  }
 await open("/manual");await waitFor("document.body.textContent.includes('Finance and receipts')");
 check("Manual contains indexed finance guidance",await evaluate("document.body.textContent.includes('Finance and receipts') && document.body.textContent.includes('Family receipt upload')"));
 await screenshot("manual-desktop");
 for(const role of ["teacher","qc"]){
  await signIn(role);await open("/");
  check(role+" sidebar excludes finance, settings and owner accounts",await evaluate("![...document.querySelectorAll('aside a')].some(a=>/\\/finance|\\/accounts|\\/settings/.test(a.getAttribute('href')))"));
 }
 await signIn("parent");await open("/finance");
 await waitFor("document.body.textContent.includes('UX Learner')");
 const link=await evaluate("(()=>{const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes('UX Learner'));return row&&[...row.querySelectorAll('a')].find(a=>/upload receipt/i.test(a.textContent))?.getAttribute('href');})()");
 check("Family receipt action identifies its payment",typeof link==="string"&&link.includes(invoice));
 await open(link.startsWith("/")?link:new URL(link,base).pathname+new URL(link,base).search);
 await waitFor("document.body.textContent.includes('UX Learner')");
 check("Receipt workflow opens the selected invoice's upload form",await evaluate("(()=>{const form=[...document.querySelectorAll('form')].find(f=>f.querySelector('input[type=file]'));return !!form&&form.closest('article')?.textContent.includes('UX Learner');})()"));
 await screenshot("parent-receipt-desktop");
  await open("/workflows?paymentId=ux-invoice-not-owned");
  check("Unknown invoice does not open another payment's uploader",await evaluate("!document.querySelector('.portal-route-content input[name=receiptFile]') && /not available|unavailable|not found/i.test(document.querySelector('.portal-route-content').textContent)"));
 await signIn("super_admin");
 await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const path of portalPaths){
  await open(path);
  check("Mobile content fits "+path,await evaluate("document.documentElement.scrollWidth<=window.innerWidth+2"));
  check("Single sidebar on "+path,await evaluate("document.querySelectorAll('.portal-sidebar').length===1"));
   if(["/students","/payroll","/operations","/settings","/family","/management"].includes(path))await screenshot("owner-"+path.slice(1)+"-mobile");
   if(["/operations","/payroll"].includes(path))await inspectLocalTabs(path,"Mobile");
 }
 await open("/");
 check("Mobile navigation opens",await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>/open (navigation|menu)/i.test(x.getAttribute('aria-label')||''));if(!b)return false;b.click();return true;})()"));
 await new Promise(r=>setTimeout(r,350));
 check("Mobile sidebar stays in the viewport",await evaluate("(()=>{const r=document.querySelector('.portal-sidebar').getBoundingClientRect();return r.left>=-2&&r.right<=innerWidth+2;})()"));
 await screenshot("owner-mobile-navigation");
 await cdp("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});
 await cdp("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape"});
 await new Promise(r=>setTimeout(r,350));
 check("Escape closes mobile navigation",await evaluate("document.querySelector('.portal-sidebar').getBoundingClientRect().right<=1 || document.querySelector('.portal-sidebar').getAttribute('aria-hidden')==='true'"));
  }
 if(exceptions.length)console.error("Browser errors:",JSON.stringify([...new Set(exceptions)]));
 check("No browser runtime exceptions",exceptions.length===0);
 console.log("Portal navigation, role scope, bound receipt workflow and responsive routes verified using isolated signed-in accounts.");
}finally{
 if(socket)socket.close();
 // Remove the isolated account's uploaded avatar. No email or payment is sent.
 const uploaded=(await db.query("select id,path from public.pw_files where uploader_id=any($1::uuid[])",[users])).rows;
 if(uploaded.length){
  const removed=await sdk.storage.from("pw-private").remove(uploaded.map(file=>file.path));
  if(removed.error)throw Error("Temporary profile photo cleanup failed.");
  await db.query("update public.pw_profiles set avatar_file_id=null where id=any($1::uuid[])",[users]);
  await db.query("delete from public.pw_files where uploader_id=any($1::uuid[])",[users]);
 }
 await db.query("delete from public.pw_emails where recipient_id=any($1::uuid[])",[users]).catch(()=>{});
 await db.query("delete from public.pw_policy_acceptances where parent_id=any($1::uuid[])",[users]).catch(()=>{});
 await db.query("delete from public.pw_payments where id=$1",[invoice]).catch(()=>{});
 await db.query("delete from public.pw_song_activity where student_id=$1",[child]).catch(()=>{});
 await db.query("delete from public.pw_teacher_roster_history where student_id=$1",[child]).catch(()=>{});
 await db.query("delete from public.pw_roster_states where student_id=$1",[child]).catch(()=>{});
 await db.query("delete from public.pw_students where id=$1",[child]).catch(()=>{});
 if(policies.length)await db.query("delete from public.pw_policy_versions where id=any($1::uuid[])",[policies]).catch(()=>{});
 await db.query("delete from public.pw_audit where actor_id=any($1::uuid[]) or entity_id in($2,$3)",[users,child,invoice]).catch(()=>{});
 for(const id of users){const result=await sdk.auth.admin.deleteUser(id);if(result.error)throw Error("Fixture cleanup needs attention");}
 await db.end();console.log("Temporary UI accounts, family, invoice and scoped policies removed.");
}
