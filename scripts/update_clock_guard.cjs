const path = require("path");
const fs = require("fs");

const envPath = path.resolve(process.cwd(), "portal/.env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const { Pool } = require(path.resolve(process.cwd(), "portal/node_modules/pg"));
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });

async function update() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION public.pw_lead_clock_guard()
       RETURNS trigger
       LANGUAGE plpgsql
       SECURITY DEFINER
       SET search_path TO ''
      AS $function$
      begin
       if TG_OP='UPDATE' and (new.trial_student_id,new.trial_lesson_id,new.trial_verified_at,new.converted_at,new.referral_parent_id) is distinct from(old.trial_student_id,old.trial_lesson_id,old.trial_verified_at,old.converted_at,old.referral_parent_id) and coalesce(current_setting('pw.sales_workflow',true),'')<>'on' then raise exception 'Pipeline records are server controlled' using errcode='42501';end if;
       if TG_OP='INSERT' and(new.trial_student_id is not null or new.trial_lesson_id is not null or new.trial_verified_at is not null or new.converted_at is not null or new.referral_parent_id is not null) and coalesce(current_setting('pw.sales_workflow',true),'')<>'on' then raise exception 'Pipeline records are server controlled' using errcode='42501';end if;
       if TG_OP='INSERT' then
         if new.payload ? 'arrivedAt' and new.payload->>'arrivedAt' is not null and trim(new.payload->>'arrivedAt') <> '' then
           null;
         else
           new.payload:=new.payload||jsonb_build_object('arrivedAt',now());
         end if;
         new.payload:=new.payload-'firstResponseAt';
       else
        new.payload:=new.payload||jsonb_build_object('arrivedAt',coalesce(new.payload->>'arrivedAt', old.payload->>'arrivedAt'));
        new.payload:=new.payload-'firstResponseAt';
        if old.payload ? 'firstResponseAt' then new.payload:=new.payload||jsonb_build_object('firstResponseAt',old.payload->>'firstResponseAt');
        elsif (public.pw_role() in ('super_admin', 'owner') or public.pw_has_permission('workspace.leads') or public.pw_has_permission('workspace.communications')) and new.payload->>'status' in('contacted','callback','called_no_answer') and old.payload->>'status' in ('new', 'new_lead') then new.payload:=new.payload||jsonb_build_object('firstResponseAt',clock_timestamp());end if;
       end if;
       if new.payload->>'status'='converted' and new.converted_at is null and(TG_OP='INSERT' or old.payload->>'status'<>'converted') then raise exception 'Use verified permanent conversion, not a status shortcut' using errcode='23514';end if;
       return new;
      end $function$;
    `);
    console.log("pw_lead_clock_guard updated with called_no_answer support!");
  } finally {
    client.release();
    await pool.end();
  }
}

update().catch(console.error);
