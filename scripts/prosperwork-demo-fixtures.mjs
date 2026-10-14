import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { databaseClient, safeFailure } from "./database-client.mjs";

const mode = process.argv[2];
const args = new Set(process.argv.slice(3));
const outputDir = path.resolve("generated-artifacts/prosperwork-demo-seed");
const manifestPath = path.join(outputDir, "manifest.json");
const credentialsPath = path.join(outputDir, "test-logins.txt");
const roles = [
  ["generalManager", "Demo General Manager", "general_manager", "active"],
  ["headAdmin", "Demo Head Admin", "head_admin", "active"],
  ["admin", "Demo Administrator", "admin", "active"],
  ["teacher", "Demo Teacher", "teacher", "active"],
  ["teacherTwo", "Demo Teacher Two", "teacher", "active"],
  ["parent", "Demo Guardian", "parent", "active"],
  ["parentTwo", "Demo Guardian Two", "parent", "active"],
  ["student", "Demo Learner", "student", "active"],
  ["finance", "Demo Finance", "finance", "active"],
  ["hr", "Demo HR", "hr", "active"],
  ["qc", "Demo Quality Coordinator", "qc", "active"],
  ["sales", "Demo Admissions", "sales_marketing", "active"],
  ["social", "Demo Social Media", "social_media", "active"],
  ["applicant", "Demo Teacher Applicant", "teacher", "applicant"],
];

const emptyRecords = () => ({
  students: [], lessons: [], leads: [], payments: [], resources: [], homework: [],
  expenses: [], lessonBoards: [], classrooms: [], pauses: [], reschedules: [],
  counters: [], practice: [], learningRequests: [], learningReplies: [],
  evaluations: [], courseTerms: [], salaryRates: [], salaryBanks: [],
  billingContracts: [], availability: [], leaves: [], hiringCases: [],
  hiringReviews: [], deskItems: [], deskHistory: [], policyVersions: [],
  marketingContacts: [], campaigns: [], campaignDeliveries: [],
});

function usage() {
  console.log(`ProsperWork demo fixtures (synthetic data only)

This tool never writes by default. Both modes require --development --apply,
and the connected project must match PROSPERWORK_TEST_PROJECT_REF.

Dry run:
  node scripts/prosperwork-demo-fixtures.mjs seed
  node scripts/prosperwork-demo-fixtures.mjs cleanup

After confirming the connected Supabase project is a development/staging project:
  PROSPERWORK_TEST_PROJECT_REF=<confirmed-project-ref> node scripts/prosperwork-demo-fixtures.mjs seed --development --apply
  PROSPERWORK_TEST_PROJECT_REF=<same-project-ref> node scripts/prosperwork-demo-fixtures.mjs cleanup --development --apply

Seeded login details are written to generated-artifacts/prosperwork-demo-seed/test-logins.txt.
The tool does not send email, change global settings/currencies or global policies, or create payment records outside the fixture.`);
}

function requireSafeTarget() {
  if (!args.has("--development") || !args.has("--apply")) {
    throw new Error("Writes are disabled. Pass both --development and --apply only for a confirmed non-production project.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed while NODE_ENV=production.");
  }
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) throw new Error("Supabase URL is not configured.");
  const host = new URL(configuredUrl).hostname;
  const projectRef = host.split(".")[0];
  if (!projectRef || !process.env.PROSPERWORK_TEST_PROJECT_REF) {
    throw new Error("Set PROSPERWORK_TEST_PROJECT_REF to the confirmed development/staging Supabase project ref.");
  }
  if (process.env.PROSPERWORK_TEST_PROJECT_REF !== projectRef) {
    throw new Error("The connected Supabase project does not match the explicitly approved test project ref.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.PROSPERWORK_OWNER_EMAIL) {
    throw new Error("Required Supabase service-role or designated-owner configuration is missing.");
  }
  return projectRef;
}

function newManifest(projectRef, runId) {
  return {
    format: 1,
    projectRef,
    runId,
    createdAt: new Date().toISOString(),
    users: [],
    records: emptyRecords(),
  };
}

async function saveManifest(manifest) {
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await chmod(outputDir, 0o700);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  await chmod(manifestPath, 0o600);
}

function ids(manifest, key) {
  return manifest.records[key] ?? [];
}

async function addId(db, manifest, key, query, values) {
  const result = await db.query(query, values);
  if (!result.rows[0]?.id) throw new Error(`Fixture insert did not return an id (${key}).`);
  manifest.records[key].push(result.rows[0].id);
  return result.rows[0].id;
}

async function cleanupRows(db, manifest) {
  const records = manifest.records;
  const userIds = manifest.users.map((user) => user.id).filter(Boolean);
  const studentIds = records.students;
  const lessonIds = records.lessons;
  const leadIds = records.leads;
  const paymentIds = records.payments;
  const allEntityIds = [
    ...Object.values(records).flat(),
    ...studentIds,
    ...lessonIds,
  ].map(String);

  await db.query("BEGIN");
  try {
    // Immutable history triggers are bypassed only inside this transaction.
    // Every delete below is scoped to IDs recorded by this seed run.
    await db.query("SET LOCAL session_replication_role = replica");
    const del = async (table, column, type, values) => {
      if (values?.length) {
        await db.query(`DELETE FROM public.${table} WHERE ${column} = ANY($1::${type}[])`, [values]);
      }
    };
    await del("pw_emails", "recipient_id", "uuid", userIds);
    if (userIds.length || allEntityIds.length) {
      await db.query(
        "DELETE FROM public.pw_emails WHERE source_id = ANY($1::text[])",
        [allEntityIds],
      );
    }
    await del("pw_campaign_deliveries", "id", "uuid", records.campaignDeliveries);
    await del("pw_email_campaigns", "id", "uuid", records.campaigns);
    await del("pw_marketing_contacts", "id", "uuid", records.marketingContacts);
    await del("pw_policy_acceptances", "parent_id", "uuid", userIds);
    await del("pw_policy_versions", "id", "uuid", records.policyVersions);

    await del("pw_hiring_events", "case_id", "uuid", records.hiringCases);
    await del("pw_hiring_reviews", "id", "uuid", records.hiringReviews);
    await del("pw_hiring_cases", "id", "uuid", records.hiringCases);
    await del("pw_desk_history", "item_id", "uuid", records.deskItems);
    await del("pw_desk_items", "id", "uuid", records.deskItems);
    await del("pw_leaves", "id", "uuid", records.leaves);
    await del("pw_availability", "id", "uuid", records.availability);

    await del("pw_reschedule_counters", "id", "uuid", records.counters);
    await del("pw_reschedules", "id", "uuid", records.reschedules);
    await del("pw_paused_lessons", "pause_id", "uuid", records.pauses);
    await del("pw_student_pauses", "id", "uuid", records.pauses);
    await del("pw_classroom_presence", "room_id", "uuid", records.classrooms);
    await del("pw_classrooms", "id", "uuid", records.classrooms);
    await del("pw_lesson_boards", "lesson_id", "text", lessonIds);
    await del("pw_lesson_events", "lesson_id", "text", lessonIds);
    await del("pw_attendance", "lesson_id", "text", lessonIds);
    await del("pw_emergency_covers", "lesson_id", "text", lessonIds);

    await del("pw_learning_replies", "id", "uuid", records.learningReplies);
    await del("pw_learning_requests", "id", "uuid", records.learningRequests);
    await del("pw_practice", "id", "uuid", records.practice);
    await del("pw_evaluations", "id", "uuid", records.evaluations);
    await del("pw_homework_reviews", "homework_id", "text", records.homework);
    await del("pw_homework", "id", "text", records.homework);
    await del("pw_resources", "id", "text", records.resources);

    await del("pw_contract_invoices", "contract_id", "uuid", records.billingContracts);
    await del("pw_billing_contracts", "id", "uuid", records.billingContracts);
    await del("pw_course_terms", "student_id", "text", studentIds);
    await del("pw_salary_banks", "staff_id", "uuid", userIds);
    await del("pw_salary_rates", "staff_id", "uuid", userIds);
    await del("pw_staff_compensation", "staff_id", "uuid", userIds);
    await del("pw_teacher_roster_history", "student_id", "text", studentIds);
    await del("pw_salary_roster_history", "student_id", "text", studentIds);
    await del("pw_salary_roster_history", "parent_id", "uuid", userIds);
    await del("pw_salary_roster_history", "admin_id", "uuid", userIds);
    await del("pw_song_activity", "student_id", "text", studentIds);

    await del("pw_payments", "id", "text", paymentIds);
    await del("pw_expenses", "id", "text", records.expenses);
    await del("pw_lessons", "id", "text", lessonIds);
    await del("pw_students", "id", "text", studentIds);
    await del("pw_leads", "id", "text", leadIds);
    await del("pw_operations_events", "actor", "uuid", userIds);
    if (userIds.length || allEntityIds.length || studentIds.length) {
      await db.query(
        `DELETE FROM public.pw_audit
         WHERE actor_id = ANY($1::uuid[]) OR subject_id = ANY($1::uuid[])
            OR entity_id = ANY($2::text[]) OR student_id = ANY($3::text[])`,
        [userIds, allEntityIds, studentIds],
      );
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function resolveUsers(db, manifest) {
  const emails = manifest.users.map((user) => user.email);
  const knownIds = manifest.users.map((user) => user.id).filter(Boolean);
  const found = emails.length
    ? await db.query("SELECT id, email FROM public.pw_profiles WHERE lower(email) = ANY($1::text[])", [emails.map((email) => email.toLowerCase())])
    : { rows: [] };
  return [...new Set([...knownIds, ...found.rows.map((row) => row.id)])];
}

async function deleteAuthUsers(admin, userIds) {
  for (const id of userIds) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error && result.error.status !== 404 && !/not found/i.test(result.error.message)) {
      throw new Error("Could not remove a seeded test account; keep the manifest and retry cleanup.");
    }
  }
}

async function seed() {
  if (!args.has("--development") || !args.has("--apply")) {
    console.log("DRY RUN: no Supabase connection or writes. Review the usage with --help; apply requires explicit development and project confirmation.");
    return;
  }
  const projectRef = requireSafeTarget();
  try {
    await readFile(manifestPath);
    throw new Error("A seed manifest already exists. Clean up that fixture before creating another.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const runId = randomUUID().replaceAll("-", "").slice(0, 10);
  const manifest = newManifest(projectRef, runId);
  const password = randomBytes(32).toString("base64url") + "Aa9!";
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = databaseClient();
  let transactionOpen = false;
  try {
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
    await chmod(outputDir, 0o700);
    const ownerEmail = process.env.PROSPERWORK_OWNER_EMAIL.trim().toLowerCase();
    await db.connect();
    const ownerLookup = await db.query(
      "SELECT id FROM public.pw_profiles WHERE lower(email) = $1 AND role = 'super_admin' AND status = 'active' LIMIT 1",
      [ownerEmail],
    );
    if (!ownerLookup.rows[0]) throw new Error("The designated active Super Admin profile was not found.");
    const realOwnerId = ownerLookup.rows[0].id;

    // Record each synthetic address before creating its auth identity, so cleanup
    // can still find it if a process stops between the Auth and DB operations.
    for (const [key, name, role, status] of roles) {
      const email = `pwtest-${runId}-${key}@example.invalid`;
      const userRecord = { key, name, email, role, status, id: null };
      manifest.users.push(userRecord);
      await saveManifest(manifest);
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (created.error || !created.data.user) {
        throw new Error("Could not create a synthetic test account.");
      }
      userRecord.id = created.data.user.id;
      await saveManifest(manifest);
    }
    const user = Object.fromEntries(manifest.users.map((person) => [person.key, person]));
    user.owner = {
      id: realOwnerId,
      name: "ProsperWork Owner",
      email: ownerEmail,
      role: "super_admin",
    };

    for (const person of manifest.users) {
      await db.query(
        `UPDATE public.pw_profiles
         SET name=$2, role=$3, status=$4, timezone='Europe/London',
             department=CASE WHEN $3 IN ('teacher','admin','head_admin','general_manager') THEN 'Academy' ELSE 'Operations' END
         WHERE id=$1`,
        [person.id, person.name, person.role, person.status],
      );
    }
    await db.query("UPDATE public.pw_profiles SET head_admin_id=$2 WHERE id=$1", [user.admin.id, user.headAdmin.id]);
    await db.query("UPDATE public.pw_profiles SET qc_id=$2 WHERE id=ANY($1::uuid[])", [[user.teacher.id, user.teacherTwo.id], user.qc.id]);

    await db.query("BEGIN");
    transactionOpen = true;
    const today = new Date();
    const todayDate = today.toISOString().slice(0, 10);
    const at = (days, hour = 16) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + days);
      date.setUTCHours(hour, 0, 0, 0);
      return date.toISOString();
    };
    const liveStartsAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const liveClosesAt = new Date(new Date(liveStartsAt).getTime() + 7 * 60 * 60 * 1000).toISOString();
    const textId = (label) => `pwtest-${runId}-${label}`;
    const studentData = [
      {
        id: textId("student-1"), parent: user.parent, teacher: user.teacher, studentUser: user.student,
        name: "Amara Demo", dob: "2015-04-18", instrument: "Piano & Keyboard",
        status: "active", rank: "Beginner", lessons: 8, taken: 5,
      },
      {
        id: textId("student-2"), parent: user.parent, teacher: user.teacherTwo,
        name: "Nia Demo", dob: "2018-08-03", instrument: "Piano & Keyboard",
        status: "active", rank: "Novice", lessons: 4, taken: 1,
      },
      {
        id: textId("student-3"), parent: user.parentTwo, teacher: user.teacher,
        name: "Ethan Demo", dob: "2010-02-09", instrument: "Acoustic Guitar",
        status: "paused", rank: "Beginner", lessons: 4, taken: 1,
      },
    ];

    for (const student of studentData) {
      await db.query(
        `INSERT INTO public.pw_students
         (id,parent_id,teacher_id,admin_id,student_user_id,payload)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          student.id, student.parent.id, student.teacher.id, user.admin.id,
          student.studentUser?.id ?? null,
          {
            id: student.id, name: student.name, dob: student.dob,
            parentName: student.parent.name, parentEmail: student.parent.email,
            instrument: student.instrument, teacherName: student.teacher.name,
            adminName: user.admin.name, timezone: "Europe/London", consent: true,
            rank: student.rank, songsDone: ["Twinkle, Twinkle, Little Star"],
            songsToDo: ["Ode to Joy"], status: student.status,
            monthlyLessons: student.lessons, lessonsTaken: student.taken,
          },
        ],
      );
      manifest.records.students.push(student.id);
    }

    const lessons = [
      {
        id: textId("lesson-live"), student: studentData[0], startsAt: liveStartsAt,
        status: "scheduled", kind: "standard", title: "Piano foundations",
        notes: "", next: "Rhythm and steady pulse",
      },
      {
        id: textId("lesson-next"), student: studentData[1], days: 2, hour: 18,
        status: "scheduled", kind: "standard", title: "Keyboard coordination",
        notes: "", next: "Left-hand accompaniment",
      },
      {
        id: textId("lesson-review"), student: studentData[0], days: -1, hour: 15,
        status: "teacher_done", kind: "standard", title: "Reading and note values",
        notes: "Demo fixture: teacher notes ready for administrator review.",
        next: "Continue with rhythm reading",
      },
      {
        id: textId("lesson-trial"), student: studentData[1], days: 4, hour: 16,
        status: "scheduled", kind: "trial", title: "Trial lesson and assessment",
        notes: "", next: "Confirm the learner's goals",
      },
      {
        id: textId("lesson-paused"), student: studentData[2], days: 7, hour: 17,
        status: "cancelled", kind: "standard", title: "Paused guitar lesson",
        notes: "Demo fixture: lesson held during a family pause.",
        next: "",
      },
    ];
    for (const lesson of lessons) {
      await db.query(
        `INSERT INTO public.pw_lessons
         (id,student_id,teacher_id,admin_id,payload,teacher_done_at)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          lesson.id, lesson.student.id, lesson.student.teacher.id, user.admin.id,
          {
            id: lesson.id, studentId: lesson.student.id, studentName: lesson.student.name,
            teacherName: lesson.student.teacher.name, adminName: user.admin.name,
            title: lesson.title, instrument: lesson.student.instrument,
            startsAt: lesson.startsAt ?? at(lesson.days, lesson.hour),
            studentTimezone: "Europe/London", status: lesson.status, kind: lesson.kind,
            notes: lesson.notes, nextTopics: lesson.next,
          },
          lesson.status === "teacher_done" ? at(-1, 16) : null,
        ],
      );
      manifest.records.lessons.push(lesson.id);
    }

    const board = lessons[0];
    await db.query(
      `INSERT INTO public.pw_lesson_boards
       (lesson_id,original_notes,notes,next_topics,completed_topics,updated_by)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [board.id, "", "Demo board: steady pulse and even finger movement.", "Add a short rhythm exercise.", JSON.stringify(["Five-finger pattern"]), user.teacher.id],
    );

    const classroomId = await addId(db, manifest, "classrooms",
      `INSERT INTO public.pw_classrooms(lesson_id,starts_at,closes_at)
       VALUES($1,$2,$3) RETURNING id`,
      [lessons[0].id, liveStartsAt, liveClosesAt]);

    const leadId = textId("lead-one");
    await db.query(
      `INSERT INTO public.pw_leads(id,owner_id,payload) VALUES($1,$2,$3)`,
      [leadId, user.sales.id, {
        id: leadId, parentName: "Demo Enquirer", email: `pwtest-${runId}-enquiry@example.invalid`,
        phone: "", childName: "Demo Prospect", instrument: "Voice Training",
        source: "Website", status: "trial_requested", arrivedAt: at(0, 10),
        owner: user.sales.name, notes: "Synthetic enquiry for portal testing.",
        preferredSlots: ["Tuesday 5:00 PM"],
      }],
    );
    manifest.records.leads.push(leadId);

    const paymentId = textId("payment-due");
    await db.query(
      `INSERT INTO public.pw_payments(id,parent_id,student_id,payload)
       VALUES($1,$2,$3,$4)`,
      [paymentId, user.parent.id, studentData[0].id, {
        id: paymentId, parentName: user.parent.name, studentName: studentData[0].name,
        amount: 25000, currency: "NGN", dueDate: todayDate, terms: "upfront",
        status: "due", referralDiscount: 0, receiptName: "",
      }],
    );
    manifest.records.payments.push(paymentId);

    const resourceIds = [
      ["Piano", "Piano", "Beginner", "A short warm-up for relaxed hands."],
      ["Rhythm", "Piano", "Novice", "Clap and count a steady four-beat pulse."],
    ];
    for (const [title, instrument, level, summary] of resourceIds) {
      const id = textId(`resource-${manifest.records.resources.length + 1}`);
      await db.query(
        "INSERT INTO public.pw_resources(id,payload) VALUES($1,$2)",
        [id, { id, title: `Demo ${title} practice`, type: "exercise", instrument, level, summary }],
      );
      manifest.records.resources.push(id);
    }

    const homeworkId = textId("homework-one");
    await db.query(
      `INSERT INTO public.pw_homework
       (id,student_id,teacher_id,payload,submitted_at)
       VALUES($1,$2,$3,$4,$5)`,
      [homeworkId, studentData[0].id, user.teacher.id, {
        id: homeworkId, studentId: studentData[0].id, studentName: studentData[0].name,
        title: "Demo: five-finger practice", dueDate: at(3, 12).slice(0, 10),
        status: "assigned", teacherName: user.teacher.name,
        note: "Practise slowly and keep each note even.",
      }, null],
    );
    manifest.records.homework.push(homeworkId);

    const expenseId = textId("expense-one");
    await db.query(
      "INSERT INTO public.pw_expenses(id,payload) VALUES($1,$2)",
      [expenseId, {
        id: expenseId, title: "Demo sheet-music supplies", amount: 12000,
        currency: "NGN", date: todayDate, category: "Teaching materials",
        notes: "Synthetic finance fixture; not an actual expense.",
      }],
    );
    manifest.records.expenses.push(expenseId);

    for (const [weekday, from, to, staff] of [
      [1, "14:00", "18:00", user.teacher],
      [3, "15:00", "19:00", user.teacherTwo],
    ]) {
      await addId(db, manifest, "availability",
        `INSERT INTO public.pw_availability(staff_id,weekday,from_time,to_time)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [staff.id, weekday, from, to]);
    }

    for (const child of studentData.slice(0, 2)) {
      await db.query(
        `INSERT INTO public.pw_course_terms
         (student_id,start_date,effective_from,weekly_frequency,confirmed_by)
         VALUES($1,$2,$2,$3,$4)`,
        [child.id, todayDate, child === studentData[0] ? 1 : 2, user.owner.id],
      );
      manifest.records.courseTerms.push(child.id);
    }

    for (const staff of [user.teacher, user.admin]) {
      const terms = staff.key === "teacher"
        ? { currency: "NGN", monthlyStudentRate: 25000, trialRate: 1000, coverRate: 1000, baseSalary: 0, adminExtraParentRate: 0, adminQuota: 0, advanceEligible: false, managementFirstPeriod: "manual_adjustment" }
        : { currency: "NGN", monthlyStudentRate: 0, trialRate: 0, coverRate: 0, baseSalary: 80000, adminExtraParentRate: 0, adminQuota: 0, advanceEligible: false, managementFirstPeriod: "manual_adjustment" };
      await addId(db, manifest, "salaryRates",
        `INSERT INTO public.pw_salary_rates
         (staff_id,effective_from,terms,status,reason,proposed_by,decided_by,decision_reason,decided_at)
         VALUES($1,$2,$3,'approved','Synthetic demo agreement for portal testing',$4,$4,'Synthetic owner approval',now())
         RETURNING id`,
        [staff.id, todayDate, terms, user.owner.id]);
      await db.query(
        `INSERT INTO public.pw_salary_banks
         (staff_id,bank_name,account_name,account_number,routing_code,currency,recorded_by)
         VALUES($1,'Demo Test Bank',$2,$3,'TEST','NGN',$4)`,
        [staff.id, staff.name, `TEST-${runId}-${staff.key}`, user.owner.id],
      );
      manifest.records.salaryBanks.push(staff.id);
    }
    await db.query(
      `INSERT INTO public.pw_staff_compensation
       (staff_id,monthly_student_rate,trial_rate,cover_rate,currency)
       VALUES($1,25000,1000,1000,'NGN')`,
      [user.teacher.id],
    );

    const requestId = await addId(db, manifest, "learningRequests",
      `INSERT INTO public.pw_learning_requests(student_id,lesson_id,kind,body,created_by,status,handled_by)
       VALUES($1,$2,'song','Demo request: add a simple melody to practice.',$3,'in_progress',$4)
       RETURNING id`,
      [studentData[0].id, lessons[0].id, user.parent.id, user.teacher.id]);
    await addId(db, manifest, "learningReplies",
      `INSERT INTO public.pw_learning_replies(request_id,created_by,body)
       VALUES($1,$2,'Demo reply: we will add a suitable melody to the next lesson.') RETURNING id`,
      [requestId, user.teacher.id]);
    await addId(db, manifest, "practice",
      `INSERT INTO public.pw_practice(student_id,created_by,started_at,seconds,status,ended_at,game_score,game_total)
       VALUES($1,$2,now()-interval '12 minutes',720,'complete',now()-interval '1 minute',8,10)
       RETURNING id`,
      [studentData[0].id, user.student.id]);
    await addId(db, manifest, "evaluations",
      `INSERT INTO public.pw_evaluations(student_id,educator_id,title,scores,notes)
       VALUES($1,$2,'Demo progress review',$3,'Synthetic progress note for portal testing.')
       RETURNING id`,
      [studentData[0].id, user.teacher.id, { rhythm: 4, posture: 4, reading: 3 }]);

    const pauseId = await addId(db, manifest, "pauses",
      `INSERT INTO public.pw_student_pauses(student_id,resume_on,reason,active,created_by)
       VALUES($1,$2,'Demo family pause for portal testing.',true,$3) RETURNING id`,
      [studentData[2].id, at(7).slice(0, 10), user.parentTwo.id]);
    await db.query(
      "INSERT INTO public.pw_paused_lessons(pause_id,lesson_id,original_payload) VALUES($1,$2,$3)",
      [pauseId, lessons[4].id, {
        id: lessons[4].id, studentId: studentData[2].id,
        studentName: studentData[2].name, teacherName: user.teacher.name,
        adminName: user.admin.name, title: lessons[4].title,
        instrument: studentData[2].instrument, startsAt: at(lessons[4].days, lessons[4].hour),
        studentTimezone: "Europe/London", status: "scheduled", kind: "standard",
        notes: "", nextTopics: "",
      }],
    );

    const rescheduleId = await addId(db, manifest, "reschedules",
      `INSERT INTO public.pw_reschedules
       (lesson_id,student_id,requested_by,original_start,slots,reason,status)
       VALUES($1,$2,$3,$4,$5,'Demo family requested a different lesson time.','pending')
       RETURNING id`,
      [lessons[1].id, studentData[1].id, user.parent.id, at(lessons[1].days, lessons[1].hour), JSON.stringify([at(2, 19), at(3, 17)])]);
    await addId(db, manifest, "counters",
      `INSERT INTO public.pw_reschedule_counters(request_id,teacher_id,slots,reason)
       VALUES($1,$2,$3,'Demo teacher counterproposal.') RETURNING id`,
      [rescheduleId, user.teacherTwo.id, JSON.stringify([at(3, 18)])]);

    const contractId = await addId(db, manifest, "billingContracts",
      `INSERT INTO public.pw_billing_contracts
       (student_id,amount,currency,terms,anchor,created_by)
       VALUES($1,25000,'NGN','upfront',$2,$3) RETURNING id`,
      [studentData[0].id, todayDate, user.owner.id]);
    await db.query(
      "INSERT INTO public.pw_contract_invoices(contract_id,period,payment_id) VALUES($1,0,$2)",
      [contractId, paymentId],
    );

    const leaveId = await addId(db, manifest, "leaves",
      `INSERT INTO public.pw_leaves
       (staff_id,submitted_by,route,kind,reason,starts_at,ends_at,state)
       VALUES($1,$1,'hr','leave','Demo planned leave for portal testing.',$2,$3,'submitted')
       RETURNING id`,
      [user.teacherTwo.id, at(8), at(10)]);

    const candidateCaseId = await addId(db, manifest, "hiringCases",
      `INSERT INTO public.pw_hiring_cases
       (name,email,desired_role,reviewer_id,staff_id,created_by,stage,interview_at)
       VALUES($1,$2,'teacher',$3,$4,$5,'selected',now()-interval '1 day')
       RETURNING id`,
      [user.applicant.name, user.applicant.email, user.hr.id, user.applicant.id, user.owner.id]);
    await addId(db, manifest, "hiringReviews",
      `INSERT INTO public.pw_hiring_reviews(case_id,kind,reviewer_id,score,passed,notes)
       VALUES($1,'hr_interview',$2,84,true,'Synthetic interview review for portal testing.')
       RETURNING id`,
      [candidateCaseId, user.hr.id]);

    const deskId = await addId(db, manifest, "deskItems",
      `INSERT INTO public.pw_desk_items
       (kind,lead_id,assigned_to,created_by,due_at,slots,notes,status)
       VALUES('lead_follow_up',$1,$2,$3,$4,'[]','Demo admissions follow-up task for portal testing.','open')
       RETURNING id`,
      [leadId, user.sales.id, user.owner.id, at(1)]);
    await addId(db, manifest, "deskHistory",
      `INSERT INTO public.pw_desk_history(item_id,actor_id,status,notes,revision)
       VALUES($1,$2,'open','Synthetic task created for portal testing.',1) RETURNING id`,
      [deskId, user.owner.id]);

    for (const parent of [user.parent, user.parentTwo]) {
      for (const key of ["parent_agreement", "terms_of_service", "reschedule_policy"]) {
        const policyId = await addId(db, manifest, "policyVersions",
          `INSERT INTO public.pw_policy_versions
           (key,title,version,created_by,published_at,audience_parent_id)
           SELECT $1,$2,coalesce(max(version),0)+1,$3,now(),$4
           FROM public.pw_policy_versions WHERE key=$1
           RETURNING id`,
          [key, `DEMO ONLY — ${key.replaceAll("_", " ")}`, user.owner.id, parent.id]);
        await db.query(
          "INSERT INTO public.pw_policy_acceptances(parent_id,policy_id,accepted_at) VALUES($1,$2,now())",
          [parent.id, policyId],
        );
      }
    }

    const contactId = await addId(db, manifest, "marketingContacts",
      `INSERT INTO public.pw_marketing_contacts
       (guardian_id,email,consent,evidence,recorded_by)
       VALUES($1,$2,false,'Synthetic fixture; marketing permission not granted.',$3)
       RETURNING id`,
      [user.parent.id, user.parent.email, user.parent.id]);
    const campaignId = await addId(db, manifest, "campaigns",
      `INSERT INTO public.pw_email_campaigns
       (created_by,request_key,subject,body,audience,reason,status)
       VALUES($1,$2,'Demo campaign — cancelled','Synthetic preview only. No message was sent.','families',
              'Demo fixture for the communications page.','cancelled')
       RETURNING id`,
      [user.owner.id, randomUUID()]);
    await addId(db, manifest, "campaignDeliveries",
      `INSERT INTO public.pw_campaign_deliveries(campaign_id,contact_id,status,last_error)
       VALUES($1,$2,'cancelled','Demo only; delivery disabled.') RETURNING id`,
      [campaignId, contactId]);

    // Test fixtures must never leave queued notices for the background worker.
    await db.query(
      "DELETE FROM public.pw_emails WHERE recipient_id = ANY($1::uuid[]) OR source_id = ANY($2::text[])",
      [manifest.users.map((person) => person.id), [...manifest.records.lessons, ...manifest.records.payments, ...manifest.records.homework, ...manifest.records.learningRequests, ...manifest.records.leaves, ...manifest.records.hiringCases, ...manifest.records.deskItems]],
    );

    await saveManifest(manifest);
    const credentials = [
      "PROSPERWORK TEST ACCOUNTS — SYNTHETIC ONLY",
      "All accounts use the same randomly generated temporary password.",
      "Use only in the confirmed development/staging Supabase project.",
      "Use your existing designated Super Admin account for Super Admin testing; no extra Super Admin was created.",
      "",
      ...manifest.users.map((person) => `${person.role.padEnd(18)} ${person.email}`),
      "",
      `Temporary password: ${password}`,
      "Delete this fixture with: node scripts/prosperwork-demo-fixtures.mjs cleanup --development --apply",
    ].join("\n");
    await writeFile(credentialsPath, credentials, { mode: 0o600 });
    await chmod(credentialsPath, 0o600);
    await db.query("COMMIT");
    transactionOpen = false;
    console.log("Synthetic portal fixture created. No real emails were queued or sent.");
    console.log(`Login details are stored locally at ${path.relative(process.cwd(), credentialsPath)} (not printed here).`);
    console.log(`Created ${manifest.users.length} test accounts, ${studentData.length} students, ${lessons.length} lessons, and representative finance, learning, hiring, leave, operations, and communications records.`);
  } catch (error) {
    if (transactionOpen) await db.query("ROLLBACK").catch(() => {});
    console.error("Seed did not complete. The manifest is retained if any test accounts were created; use cleanup after confirming the same development project.");
    throw error;
  } finally {
    await db.end().catch(() => {});
  }
}

async function cleanup() {
  if (!args.has("--development") || !args.has("--apply")) {
    console.log("DRY RUN: no Supabase connection or deletes. Pass both --development and --apply only for the confirmed project.");
    return;
  }
  const projectRef = requireSafeTarget();
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.format !== 1 || manifest.projectRef !== projectRef) {
    throw new Error("The fixture manifest does not match this explicitly approved project.");
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = databaseClient();
  try {
    await db.connect();
    const userIds = await resolveUsers(db, manifest);
    await cleanupRows(db, manifest);
    await deleteAuthUsers(admin, userIds);
    await rm(outputDir, { recursive: true, force: true });
    console.log("Only the seeded fixture records, test accounts, and local test-login file were removed.");
  } finally {
    await db.end().catch(() => {});
  }
}

if (mode === "--help" || mode === "help" || !mode) {
  usage();
} else if (mode === "seed") {
  seed().catch((error) => {
    console.error(safeFailure(error));
    process.exitCode = 1;
  });
} else if (mode === "cleanup") {
  cleanup().catch((error) => {
    console.error(safeFailure(error));
    process.exitCode = 1;
  });
} else {
  usage();
  process.exitCode = 2;
}
