import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const uri = new URL(process.env.SUPABASE_DATABASE_URL);
const client = new pg.Client({
  host: uri.hostname,
  port: Number(uri.port || 5432),
  user: decodeURIComponent(uri.username),
  password: decodeURIComponent(uri.password),
  database: uri.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await client.connect();

try {
  // 1. Gather all demo targets
  const userRes = await client.query("SELECT id, email, name FROM public.pw_profiles WHERE email LIKE 'pwtest-%'");
  const demoUserIds = userRes.rows.map(r => r.id);

  const studentRes = await client.query("SELECT id FROM public.pw_students WHERE id LIKE 'pwtest-%'");
  const studentIds = studentRes.rows.map(r => r.id);

  const lessonRes = await client.query("SELECT id FROM public.pw_lessons WHERE id LIKE 'pwtest-%'");
  const lessonIds = lessonRes.rows.map(r => r.id);

  const leadRes = await client.query("SELECT id FROM public.pw_leads WHERE id LIKE 'pwtest-%'");
  const leadIds = leadRes.rows.map(r => r.id);

  const paymentRes = await client.query("SELECT id FROM public.pw_payments WHERE id LIKE 'pwtest-%'");
  const paymentIds = paymentRes.rows.map(r => r.id);

  const expenseRes = await client.query("SELECT id FROM public.pw_expenses WHERE id LIKE 'pwtest-%'");
  const expenseIds = expenseRes.rows.map(r => r.id);

  const resourceRes = await client.query("SELECT id FROM public.pw_resources WHERE id LIKE 'pwtest-%'");
  const resourceIds = resourceRes.rows.map(r => r.id);

  const homeworkRes = await client.query("SELECT id FROM public.pw_homework WHERE id LIKE 'pwtest-%'");
  const homeworkIds = homeworkRes.rows.map(r => r.id);

  const hiringRes = await client.query("SELECT id FROM public.pw_hiring_cases WHERE email LIKE 'pwtest-%' OR staff_id = ANY($1::uuid[])", [demoUserIds]);
  const hiringCaseIds = hiringRes.rows.map(r => r.id);

  const hiringRevRes = await client.query("SELECT id FROM public.pw_hiring_reviews WHERE case_id = ANY($1::uuid[])", [hiringCaseIds]);
  const hiringReviewIds = hiringRevRes.rows.map(r => r.id);

  const deskRes = await client.query("SELECT id FROM public.pw_desk_items WHERE lead_id = ANY($1::text[]) OR assigned_to = ANY($2::uuid[])", [leadIds, demoUserIds]);
  const deskItemIds = deskRes.rows.map(r => r.id);

  const deskHistRes = await client.query("SELECT id FROM public.pw_desk_history WHERE item_id = ANY($1::uuid[])", [deskItemIds]);
  const deskHistoryIds = deskHistRes.rows.map(r => r.id);

  const campaignRes = await client.query("SELECT id FROM public.pw_email_campaigns WHERE subject LIKE 'Demo campaign%'");
  const campaignIds = campaignRes.rows.map(r => r.id);

  const policyRes = await client.query("SELECT id FROM public.pw_policy_versions WHERE title LIKE 'DEMO ONLY%'");
  const policyVersionIds = policyRes.rows.map(r => r.id);

  const pauseRes = await client.query("SELECT id FROM public.pw_student_pauses WHERE student_id = ANY($1::text[]) OR created_by = ANY($2::uuid[])", [studentIds, demoUserIds]);
  const pauseIds = pauseRes.rows.map(r => r.id);

  const reschedRes = await client.query("SELECT id FROM public.pw_reschedules WHERE lesson_id = ANY($1::text[]) OR requested_by = ANY($2::uuid[])", [lessonIds, demoUserIds]);
  const reschedIds = reschedRes.rows.map(r => r.id);

  const counterRes = await client.query("SELECT id FROM public.pw_reschedule_counters WHERE request_id = ANY($1::uuid[]) OR teacher_id = ANY($2::uuid[])", [reschedIds, demoUserIds]);
  const counterIds = counterRes.rows.map(r => r.id);

  const contractRes = await client.query("SELECT id FROM public.pw_billing_contracts WHERE student_id = ANY($1::text[])", [studentIds]);
  const contractIds = contractRes.rows.map(r => r.id);

  const classRes = await client.query("SELECT id FROM public.pw_classrooms WHERE lesson_id = ANY($1::text[])", [lessonIds]);
  const classroomIds = classRes.rows.map(r => r.id);

  const leaveRes = await client.query("SELECT id FROM public.pw_leaves WHERE staff_id = ANY($1::uuid[])", [demoUserIds]);
  const leaveIds = leaveRes.rows.map(r => r.id);

  const availRes = await client.query("SELECT id FROM public.pw_availability WHERE staff_id = ANY($1::uuid[])", [demoUserIds]);
  const availIds = availRes.rows.map(r => r.id);

  const learnReqRes = await client.query("SELECT id FROM public.pw_learning_requests WHERE student_id = ANY($1::text[]) OR created_by = ANY($2::uuid[])", [studentIds, demoUserIds]);
  const learnReqIds = learnReqRes.rows.map(r => r.id);

  const learnRepRes = await client.query("SELECT id FROM public.pw_learning_replies WHERE request_id = ANY($1::uuid[]) OR created_by = ANY($2::uuid[])", [learnReqIds, demoUserIds]);
  const learnRepIds = learnRepRes.rows.map(r => r.id);

  const practiceRes = await client.query("SELECT id FROM public.pw_practice WHERE student_id = ANY($1::text[]) OR created_by = ANY($2::uuid[])", [studentIds, demoUserIds]);
  const practiceIds = practiceRes.rows.map(r => r.id);

  const evalRes = await client.query("SELECT id FROM public.pw_evaluations WHERE student_id = ANY($1::text[]) OR educator_id = ANY($2::uuid[])", [studentIds, demoUserIds]);
  const evalIds = evalRes.rows.map(r => r.id);

  const mktRes = await client.query("SELECT id FROM public.pw_marketing_contacts WHERE guardian_id = ANY($1::uuid[]) OR email LIKE 'pwtest-%'", [demoUserIds]);
  const mktContactIds = mktRes.rows.map(r => r.id);

  const campDelivRes = await client.query("SELECT id FROM public.pw_campaign_deliveries WHERE campaign_id = ANY($1::uuid[]) OR contact_id = ANY($2::uuid[])", [campaignIds, mktContactIds]);
  const campDelivIds = campDelivRes.rows.map(r => r.id);

  const salaryRateRes = await client.query("SELECT id FROM public.pw_salary_rates WHERE staff_id = ANY($1::uuid[])", [demoUserIds]);
  const salaryRateIds = salaryRateRes.rows.map(r => r.id);

  const allEntityIds = [
    ...studentIds, ...lessonIds, ...leadIds, ...paymentIds,
    ...expenseIds, ...resourceIds, ...homeworkIds,
    ...hiringCaseIds, ...deskItemIds, ...campaignIds,
    ...policyVersionIds, ...pauseIds, ...reschedIds, ...contractIds,
    ...classroomIds, ...leaveIds, ...availIds, ...learnReqIds,
    ...practiceIds, ...evalIds, ...salaryRateIds,
  ].map(String);

  console.log(`Starting transactional removal of demo rows...`);
  await client.query("BEGIN");
  await client.query("SET LOCAL session_replication_role = replica");

  const del = async (table, column, type, values) => {
    if (values && values.length > 0) {
      const res = await client.query(`DELETE FROM public.${table} WHERE ${column} = ANY($1::${type}[])`, [values]);
      if (res.rowCount > 0) {
        console.log(`  Removed ${res.rowCount} rows from public.${table}`);
      }
    }
  };

  await del("pw_emails", "recipient_id", "uuid", demoUserIds);
  if (demoUserIds.length || allEntityIds.length) {
    const res = await client.query("DELETE FROM public.pw_emails WHERE source_id = ANY($1::text[])", [allEntityIds]);
    if (res.rowCount > 0) console.log(`  Removed ${res.rowCount} rows from public.pw_emails (by source_id)`);
  }

  await del("pw_campaign_deliveries", "id", "uuid", campDelivIds);
  await del("pw_email_campaigns", "id", "uuid", campaignIds);
  await del("pw_marketing_contacts", "id", "uuid", mktContactIds);
  await del("pw_policy_acceptances", "parent_id", "uuid", demoUserIds);
  await del("pw_policy_acceptances", "policy_id", "uuid", policyVersionIds);
  await del("pw_policy_versions", "id", "uuid", policyVersionIds);

  await del("pw_hiring_events", "case_id", "uuid", hiringCaseIds);
  await del("pw_hiring_reviews", "id", "uuid", hiringReviewIds);
  await del("pw_hiring_cases", "id", "uuid", hiringCaseIds);
  await del("pw_desk_history", "item_id", "uuid", deskItemIds);
  await del("pw_desk_items", "id", "uuid", deskItemIds);
  await del("pw_leaves", "id", "uuid", leaveIds);
  await del("pw_availability", "id", "uuid", availIds);

  await del("pw_reschedule_counters", "id", "uuid", counterIds);
  await del("pw_reschedules", "id", "uuid", reschedIds);
  await del("pw_paused_lessons", "pause_id", "uuid", pauseIds);
  await del("pw_student_pauses", "id", "uuid", pauseIds);
  await del("pw_classroom_presence", "room_id", "uuid", classroomIds);
  await del("pw_classroom_presence", "user_id", "uuid", demoUserIds);
  await del("pw_classrooms", "id", "uuid", classroomIds);
  await del("pw_lesson_boards", "lesson_id", "text", lessonIds);
  await del("pw_lesson_events", "lesson_id", "text", lessonIds);
  await del("pw_attendance", "lesson_id", "text", lessonIds);
  await del("pw_emergency_covers", "lesson_id", "text", lessonIds);

  await del("pw_learning_replies", "id", "uuid", learnRepIds);
  await del("pw_learning_requests", "id", "uuid", learnReqIds);
  await del("pw_practice", "id", "uuid", practiceIds);
  await del("pw_evaluations", "id", "uuid", evalIds);
  await del("pw_homework_reviews", "homework_id", "text", homeworkIds);
  await del("pw_homework", "id", "text", homeworkIds);
  await del("pw_resources", "id", "text", resourceIds);

  await del("pw_contract_invoices", "contract_id", "uuid", contractIds);
  await del("pw_billing_contracts", "id", "uuid", contractIds);
  await del("pw_course_terms", "student_id", "text", studentIds);
  await del("pw_salary_banks", "staff_id", "uuid", demoUserIds);
  await del("pw_salary_rates", "staff_id", "uuid", demoUserIds);
  await del("pw_staff_compensation", "staff_id", "uuid", demoUserIds);
  await del("pw_teacher_roster_history", "student_id", "text", studentIds);
  await del("pw_salary_roster_history", "student_id", "text", studentIds);
  await del("pw_salary_roster_history", "parent_id", "uuid", demoUserIds);
  await del("pw_salary_roster_history", "admin_id", "uuid", demoUserIds);
  await del("pw_song_activity", "student_id", "text", studentIds);

  await del("pw_payments", "id", "text", paymentIds);
  await del("pw_expenses", "id", "text", expenseIds);
  await del("pw_lessons", "id", "text", lessonIds);
  await del("pw_students", "id", "text", studentIds);
  await del("pw_leads", "id", "text", leadIds);
  await del("pw_operations_events", "actor", "uuid", demoUserIds);

  if (demoUserIds.length || allEntityIds.length || studentIds.length) {
    const res = await client.query(
      `DELETE FROM public.pw_audit
       WHERE actor_id = ANY($1::uuid[]) OR subject_id = ANY($1::uuid[])
          OR entity_id = ANY($2::text[]) OR student_id = ANY($3::text[])`,
      [demoUserIds, allEntityIds, studentIds],
    );
    if (res.rowCount > 0) console.log(`  Removed ${res.rowCount} rows from public.pw_audit`);
  }

  // Clear demo usernames & demo profiles
  await del("pw_username_aliases", "profile_id", "uuid", demoUserIds);
  await del("pw_profiles", "id", "uuid", demoUserIds);

  await client.query("COMMIT");
  console.log("Database transaction committed successfully.");

  // Delete from Supabase Auth
  console.log(`Deleting ${demoUserIds.length} demo accounts from Supabase Auth...`);
  for (const id of demoUserIds) {
    const res = await admin.auth.admin.deleteUser(id);
    if (res.error && res.error.status !== 404 && !/not found/i.test(res.error.message)) {
      console.warn(`Could not delete auth user ${id}:`, res.error.message);
    }
  }
  console.log("All demo auth accounts deleted successfully.");

} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Cleanup error:", err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

