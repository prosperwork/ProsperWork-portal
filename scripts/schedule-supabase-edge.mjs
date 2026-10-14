import{databaseClient,safeFailure}from"./database-client.mjs";
const db=databaseClient();await db.connect();
try{
 const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
 const entry=await db.query("select id from vault.secrets where name='academy_project_url'");
 if(entry.rows.length)await db.query("select vault.update_secret($1,$2)",[entry.rows[0].id,url]);
 else await db.query("select vault.create_secret($1,$2,$3)",[url,"academy_project_url","Project API origin for academy scheduling"]);
 if(!(await db.query("select 1 from vault.secrets where name='academy_cron_invocation'")).rowCount)throw Error("CRON_CREDENTIAL_MISSING");
 const command=`select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='academy_project_url') || '/functions/v1/academy-cron',
  headers := jsonb_build_object('Content-Type','application/json','Authorization',
   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='academy_cron_invocation')),
  body := '{}'::jsonb, timeout_milliseconds := 90000
 );`;
 const since=new Date();
 await db.query("select cron.schedule($1,$2,$3)",["prosperwork-academy-tick","* * * * *",command]);
 const job=await db.query("select schedule,active from cron.job where jobname=$1",["prosperwork-academy-tick"]);
 if(job.rows.length!==1||!job.rows[0].active)throw Error("CRON_SCHEDULE_NOT_ACTIVE");
 console.log("Supabase academy schedule active: every minute. Waiting for actual Edge HTTP completion.");
 let completed=false;
 for(let i=0;i<18;i++){
  const r=await db.query("select count(*) n from net._http_response where created >= $1 and status_code=200 and not timed_out and content like '%\"completed\":true%'",[since]);
  if(Number(r.rows[0].n)>0){completed=true;break;}
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 if(!completed)throw Error("SCHEDULED_HTTP_SUCCESS_NOT_CONFIRMED");
 console.log("PASS Actual scheduled pg_net response: HTTP 200, automation completed.");
}catch(e){console.error(safeFailure(e));process.exitCode=1;}finally{await db.end();}
