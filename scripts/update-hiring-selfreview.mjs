import pg from 'pg';
const { Client } = pg;

async function updateHiringSql() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const sql = `
    CREATE OR REPLACE FUNCTION public.pw_hiring_action(p_action text, p_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb)
     RETURNS uuid
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO ''
    AS $function$
    declare r text:=public.pw_role();c public.pw_hiring_cases;s public.pw_profiles;reviewer public.pw_profiles;
     result uuid;p_kind text;p_notes text:=trim(coalesce(p_data->>'notes',''));fid uuid;rate public.pw_salary_rates;
     expected_supervisor text;
    begin
     if not public.pw_session_allowed() or auth.uid() is null then raise exception 'Signed-in session required' using errcode='42501';end if;
     if p_action='create' then
      if not public.pw_active() or r not in('super_admin','hr') or r is null then raise exception 'HR creation required' using errcode='42501';end if;
      select * into reviewer from public.pw_profiles where id=(p_data->>'reviewerId')::uuid and status='active';
      
      expected_supervisor := case p_data->>'role'
        when 'teacher' then 'qc'
        when 'admin' then 'head_admin'
        when 'head_admin' then 'super_admin'
        when 'qc' then 'super_admin'
        when 'hr' then 'super_admin'
        else p_data->>'role'
      end;

      -- Allow designated reviewer OR allow Super Admin (including self-review if Super Admin is managing hiring)
      if reviewer.id is null or (reviewer.role <> expected_supervisor and reviewer.role <> 'super_admin') or (reviewer.id = auth.uid() and r <> 'super_admin')
      then raise exception 'Choose an independent, active departmental interviewer or Super Admin' using errcode='23514';end if;

      if length(trim(p_data->>'name')) not between 2 and 120 or p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' or length(p_data->>'email')>254 or length(p_notes) not between 5 and 2000
      then raise exception 'Applicant contact details and reason required' using errcode='22023';end if;
      insert into public.pw_hiring_cases(name,email,desired_role,reviewer_id,created_by) values(trim(p_data->>'name'),lower(trim(p_data->>'email')),p_data->>'role',reviewer.id,auth.uid()) returning id into result;
     else
      select * into c from public.pw_hiring_cases where id=p_id for update;
      if c.id is null or not(public.pw_hiring_manager(c.id) or(p_action='accept' and public.pw_hiring_subject(c.id))) then raise exception 'Hiring case not accessible' using errcode='42501';end if;
      if c.stage in('activated','rejected') then raise exception 'Closed hiring case is permanent' using errcode='40001';end if;
      result:=c.id;
      if p_action<>'accept' and length(p_notes) not between 5 and 2000 then raise exception 'Written evidence or reason required' using errcode='22023';end if;
      if p_action='schedule' then
       if r not in('super_admin','hr') or c.stage not in('applied','interview') then raise exception 'HR schedules the joint interview' using errcode='42501';end if;
       if (p_data->>'at')::timestamptz>clock_timestamp()+interval '1 year' or (p_data->>'at')::timestamptz<clock_timestamp()-interval '2 years' then raise exception 'Invalid interview date' using errcode='22023';end if;
       update public.pw_hiring_cases set stage='interview',interview_at=(p_data->>'at')::timestamptz where id=c.id;
      elsif p_action='review' then
       if not(r='super_admin' or auth.uid()=c.reviewer_id) or c.stage<>'interview' then raise exception 'Assigned reviewer evaluates the candidate' using errcode='42501';end if;
       if (p_data->>'rating')::int not between 1 and 5 then raise exception 'Rating must be 1 to 5' using errcode='22023';end if;
       insert into public.pw_hiring_reviews(case_id,reviewer_id,rating,recommendation,notes) values(c.id,auth.uid(),(p_data->>'rating')::int,p_data->>'recommendation',p_notes);
       update public.pw_hiring_cases set stage='offer' where id=c.id;
      elsif p_action='offer' then
       if r not in('super_admin','hr') or c.stage<>'offer' then raise exception 'HR extends compensation offer' using errcode='42501';end if;
       rate:=public.pw_salary_rate_lookup(c.desired_role);
       if (p_data->>'base')::numeric<rate.min_base or (p_data->>'base')::numeric>rate.max_base then raise exception 'Base compensation outside academy band' using errcode='23514';end if;
       update public.pw_hiring_cases set stage='offered',offered_base=(p_data->>'base')::numeric,offer_notes=p_notes where id=c.id;
      elsif p_action='accept' then
       if c.stage<>'offered' then raise exception 'Offer must be pending acceptance' using errcode='40001';end if;
       update public.pw_hiring_cases set stage='accepted' where id=c.id;
      elsif p_action='reject' then
       if r not in('super_admin','hr') then raise exception 'HR records outcome' using errcode='42501';end if;
       update public.pw_hiring_cases set stage='rejected' where id=c.id;
      else raise exception 'Unknown hiring action' using errcode='22023';end if;
      insert into public.pw_hiring_events(case_id,action,actor_id,notes) values(c.id,p_action,auth.uid(),p_notes);
     end if;
     return result;
    end;
    $function$;
  `;

  await client.query(sql);
  console.log('✅ UPDATED DATABASE pw_hiring_action: Self-review allowed for Super Admin!');
  await client.end();
}

updateHiringSql().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

