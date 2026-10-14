import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { createPolicyPdf } from './pdf-generator.mjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Policy definitions based on the official Academy policies
const policies = [
  {
    key: 'parent_agreement',
    title: 'Parent & Guardian Agreement',
    subtitle: 'Academy Operations, Guardian Responsibilities, Safeguarding, and Home Practice Standards',
    filename: 'prosperwork_parent_and_guardian_agreement_v1.pdf',
    sections: [
      {
        heading: '1. Purpose & Academy Scope',
        body: 'Welcome to ProsperWork Music Concepts ("the Academy"). This Agreement establishes mutual commitments between parents/guardians and the Academy to ensure an engaging, disciplined, safe, and academically sound musical education for enrolled students.'
      },
      {
        heading: '2. Home Environment & Technical Readiness',
        body: 'Virtual one-on-one music instruction requires an environment conducive to active listening and focused practice.',
        bullets: [
          'Lessons must take place in an open, quiet study or living area with appropriate lighting, rather than in closed private bedrooms.',
          'Students must have their instrument tuned, sheet music/homework ready, and video device set up at least 5 minutes before the scheduled class start time.',
          'An adult parent or guardian should be present in the home during virtual sessions and accessible to the instructor and administrative team if required.',
          'Both instructor and student are expected to maintain professional dress and courteous behavior during all video interactions.'
        ]
      },
      {
        heading: '3. Child Safeguarding Standards & Monitoring',
        body: 'ProsperWork Music Concepts enforces zero-tolerance child protection standards across all educational interactions.',
        bullets: [
          'All academy instructors undergo comprehensive identity verification, background screening, and safeguarding training before teaching students.',
          'Academy administrative staff actively supervise and monitor virtual classrooms to guarantee that instructional time remains focused exclusively on music education and constructive encouragement.',
          'Direct unmonitored private social messaging between students and instructors is strictly prohibited. All communication must occur through official academy channels.',
          'Parents may request session logs, observe classes at any time, or contact the Safeguarding Desk immediately with any inquiries or concerns.'
        ]
      },
      {
        heading: '4. Attendance, Punctuality & Rescheduling',
        body: 'Consistency is essential for musical progression and instrumental mastery.',
        bullets: [
          'Classes begin promptly at the appointed time. Instructors wait a maximum of 10 minutes for late arrivals before marking the session as unannounced absent.',
          'Rescheduling requests require at least 24 hours advance written notice to the administrative desk via WhatsApp.',
          'Sessions rescheduled with adequate advance notice are allocated a makeup slot within the billing cycle. Cancellations made with less than 24 hours notice cannot be rescheduled or refunded.',
          'In the event of an instructor absence or verified academy technical fault, a makeup lesson is guaranteed promptly.'
        ]
      },
      {
        heading: '5. Home Practice & Guided Drills',
        body: 'Classroom instruction introduces technique and theory, but weekly progress relies on regular instrument practice at home.',
        bullets: [
          'Parents agree to encourage regular practice (recommended 20–30 minutes daily for beginners; 45+ minutes for intermediate and advanced students).',
          'Students must complete assigned homework packets, video review drills, and listening assignments uploaded to the academy portal.',
          'Parents receive periodic progress reports, assessments, and recommendations regarding international music exams (ABRSM, Trinity, Muson).'
        ]
      },
      {
        heading: '6. Tuition Settlement & Administrative Governance',
        body: 'Enrollment is maintained on a recurring monthly billing schedule. Invoices must be settled prior to the start of each learning cycle. Inquiries, schedule adjustments, and guardian consent updates should be directed to the academy administration desk.',
        bullets: [
          'Email: info@prosperworkmusic.com / support@prosperworkmusic.com',
          'Phone / WhatsApp: +234 703 192 6969',
          'Headquarters: Lagos, Nigeria'
        ]
      }
    ]
  },
  {
    key: 'terms_of_service',
    title: 'Terms of Service',
    subtitle: 'Governance of Enrollment, 1-on-1 Online Music Lessons, Student Conduct, and Admin Oversight',
    filename: 'prosperwork_terms_of_service_v1.pdf',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'Welcome to ProsperWork Music Concepts ("the Academy"). By registering for an assessment, accessing the Academy portal, or enrolling in our private music programs, you agree to be bound by these Terms of Service. These terms apply to parents, guardians, and students.'
      },
      {
        heading: '2. Nature of Services',
        body: 'ProsperWork Music Concepts delivers private, one-on-one virtual music education covering Piano & Keyboard, Saxophone, Drums, Violin, Acoustic Guitar, Bass Guitar, Voice Training, and Music Theory. Lessons run between 45 to 60 minutes per session and are conducted virtually over approved, secure video platforms with active administrative supervision.'
      },
      {
        heading: '3. Enrollment & Trial Assessments',
        body: 'Prospective students may participate in an initial free one-on-one trial assessment. During this assessment, an instructor evaluates baseline musical aptitude and recommends an appropriate curriculum track. Official enrollment is confirmed upon mutually agreed scheduling and tuition settlement.'
      },
      {
        heading: '4. Administrative Supervision & Quality Assurance',
        body: 'To uphold our instructional quality, our dedicated administrative desk monitors classes, tracks attendance, issues lesson reminders, and assists with technical support. By enrolling, students and guardians consent to administrative quality monitoring of educational sessions.'
      },
      {
        heading: '5. Intellectual Property & Study Materials',
        body: 'All proprietary video drills, sheet music PDFs, exercise worksheets, and curriculum frameworks provided by ProsperWork Music Concepts remain the intellectual property of the Academy. These materials are licensed exclusively for personal educational use by the enrolled student and may not be redistributed, copied, or sold.'
      },
      {
        heading: '6. Student & Instructor Conduct',
        body: 'The Academy maintains a respectful, motivating, and safe learning environment. Any form of harassment, inappropriate language, or disruptive behavior by any party will result in immediate termination of the lesson and potential account suspension without refund.'
      },
      {
        heading: '7. Examination Pathways & Progress Disclaimer',
        body: 'While ProsperWork Music Concepts prepares students for international examination boards (such as ABRSM, Trinity College London, and Muson), final performance and exam results depend on the student’s consistent daily practice, homework submission, and personal dedication.'
      },
      {
        heading: '8. Legal Contact & Governance',
        body: 'ProsperWork Music Concepts operates under Nigerian law and international educational best practices.',
        bullets: [
          'Address: Lagos, Nigeria',
          'Phone / WhatsApp: +234 703 192 6969',
          'Email: info@prosperworkmusic.com'
        ]
      }
    ]
  },
  {
    key: 'reschedule_policy',
    title: 'Class Reschedule & Cancellation Policy',
    subtitle: 'Transparent Guidelines for Lesson Rescheduling, Makeups, Tuition Cycles, and Cancellations',
    filename: 'prosperwork_reschedule_and_cancellation_policy_v1.pdf',
    sections: [
      {
        heading: '1. Overview & Institutional Commitment',
        body: 'At ProsperWork Music Concepts, we understand that family schedules can change. Our reschedule and cancellation policy balances family flexibility with respect for our instructors’ dedicated preparation and reserved time.'
      },
      {
        heading: '2. Free Trial Assessments',
        body: 'Initial one-on-one trial assessments are provided completely free of charge with no financial obligation. This enables families to evaluate our pedagogical style and meet their instructor before making any commitment.'
      },
      {
        heading: '3. Rescheduling Policy (Strict 24-Hour Notice)',
        body: 'Private 1-on-1 lessons may be rescheduled under the following conditions:',
        bullets: [
          'Advance Notice: Parents or students must notify the academy admin desk via WhatsApp at least 24 hours prior to the scheduled class time.',
          'Makeup Scheduling: Lessons rescheduled with adequate notice are reassigned to a mutually convenient makeup slot within the active billing cycle.',
          'Late Cancellations: Cancellations made with less than 24 hours notice or unannounced absences cannot be refunded or rescheduled, as the instructor has reserved that time exclusively for your session.',
          'Emergency Exceptions: Verified emergency situations may be reviewed on a case-by-case basis by academy management.'
        ]
      },
      {
        heading: '4. Instructor Absence or Technical Disruption',
        body: 'In the rare event that an instructor is indisposed or an unforeseen academy-side technical outage disrupts a class, the lesson will be promptly rescheduled at no additional charge, or a full billing credit will be applied.'
      },
      {
        heading: '5. Tuition Cycles & Subscription Cancellation',
        body: 'Tuition is billed on a monthly cycle.',
        bullets: [
          'Families may pause or cancel their ongoing monthly enrollment at any time by notifying the admin desk before the subsequent billing cycle begins.',
          'Completed lesson sessions are non-refundable.',
          'Pre-paid future lessons beyond the active cycle may be refunded upon written request to the accounts desk.'
        ]
      },
      {
        heading: '6. Inquiries & Accounts Desk Contact',
        body: 'For customized schedule requests, multiple-sibling arrangements, or billing questions, please reach out to our administrative team:',
        bullets: [
          'Email: fees@prosperworkmusic.com / info@prosperworkmusic.com',
          'Phone / WhatsApp: +234 703 192 6969',
          'Address: Lagos, Nigeria'
        ]
      }
    ]
  }
];

async function run() {
  console.log('Fetching super admin user...');
  const { data: superAdmins, error: adminError } = await supabase
    .from('pw_profiles')
    .select('id, name, email')
    .eq('role', 'super_admin')
    .order('created_at', { ascending: true })
    .limit(1);

  if (adminError || !superAdmins || superAdmins.length === 0) {
    console.error('Super admin not found:', adminError);
    process.exit(1);
  }

  const superAdmin = superAdmins[0];
  console.log(`Using Super Admin: ${superAdmin.name} (${superAdmin.email}) [${superAdmin.id}]`);

  for (const policy of policies) {
    console.log(`\n========================================`);
    console.log(`Generating PDF for: ${policy.title} [${policy.key}]...`);
    const pdfBuffer = await createPolicyPdf(policy.title, policy.subtitle, policy.sections);
    console.log(`PDF generated: ${pdfBuffer.length} bytes. Magic header: ${pdfBuffer.subarray(0, 5).toString('hex')}`);

    const policyId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const storagePath = `${superAdmin.id}/${fileId}.pdf`;

    console.log(`Uploading to Supabase storage pw-private bucket at: ${storagePath}...`);
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('pw-private')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error(`Storage upload failed for ${policy.key}:`, uploadError);
      process.exit(1);
    }
    console.log(`Uploaded successfully.`);

    console.log(`Inserting into pw_files...`);
    const { data: fileRow, error: fileError } = await supabase
      .from('pw_files')
      .insert({
        id: fileId,
        uploader_id: superAdmin.id,
        category: 'policy',
        target_id: policyId,
        path: storagePath,
        original_name: policy.filename,
        mime: 'application/pdf',
        bytes: pdfBuffer.length,
        complete: true
      })
      .select()
      .single();

    if (fileError) {
      console.error(`pw_files insert failed for ${policy.key}:`, fileError);
      process.exit(1);
    }
    console.log(`pw_files recorded: ${fileRow.id}`);

    console.log(`Inserting into pw_policy_versions...`);
    const { data: policyRow, error: policyError } = await supabase
      .from('pw_policy_versions')
      .insert({
        id: policyId,
        key: policy.key,
        title: policy.title,
        version: 1,
        file_id: fileId,
        created_by: superAdmin.id,
        audience_parent_id: null,
        published_at: new Date().toISOString()
      })
      .select()
      .single();

    if (policyError) {
      console.error(`pw_policy_versions insert failed for ${policy.key}:`, policyError);
      process.exit(1);
    }
    console.log(`pw_policy_versions recorded & published: ${policyRow.id} (v${policyRow.version})`);
  }

  console.log('\n========================================');
  console.log('Verifying published policies with pw_current_policies RPC...');
  const { data: currentPolicies, error: rpcError } = await supabase.rpc('pw_current_policies');
  console.log('Current active policies:', currentPolicies?.map(p => ({ key: p.key, title: p.title, published_at: p.published_at })), rpcError);

  console.log('\nAll 3 required academy policies have been generated, uploaded, and published!');
}

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
