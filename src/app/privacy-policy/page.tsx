import Link from "next/link";
import { PRIVACY_POLICY_VERSION } from "@/lib/legal/consent-versions";

export const metadata = {
  title: "Privacy Policy | ProsperWork Music Concepts",
  description: "Learn how ProsperWork Music Concepts collects, protects, and handles personal information for students, parents, and prospective learners worldwide.",
};

const SCHOOL_NAME = "ProsperWork Music Concepts";
const SCHOOL_ADDRESS = "Lagos, Nigeria";
const SCHOOL_PHONE_DISPLAY = "+234 703 192 6969";
const SCHOOL_EMAIL = "info@prosperworkmusic.com";

export default function PrivacyPolicyPage() {
  return (
    <main className="public-legal">
      <header className="public-legal-header">
        <Link className="public-legal-brand" href="/login">
          ProsperWork <span>Music Concepts</span>
        </Link>
        <Link href="/login">Back to sign in</Link>
      </header>
      <article className="public-legal-document">
        <div className="public-legal-version">
          Data Protection & Privacy · Last Updated: September 2026 (Version {PRIVACY_POLICY_VERSION})
        </div>
        <h1>Privacy Policy</h1>
        <p className="public-legal-lede">
          This policy explains how {SCHOOL_NAME} collects, protects, and handles personal data when families interact with our website, portal, or virtual 1-on-1 music lessons.
        </p>

        <section>
          <p>
            At <strong>{SCHOOL_NAME}</strong> ("we," "us," or "our"), respecting and safeguarding your privacy is a fundamental principle. This Privacy Policy outlines our transparent data handling practices for enrolled students, parents, and prospective learners.
          </p>
        </section>

        <section>
          <h2>1. Information We Collect</h2>
          <ul style={{ paddingLeft: "20px", color: "#586c60", fontSize: "13px", lineHeight: "1.75" }}>
            <li>
              <strong>Contact Information:</strong> Full names of students and parents/guardians, email addresses, phone numbers, and location/timezone of residence.
            </li>
            <li>
              <strong>Academic & Learning Profiles:</strong> Musical background, selected instrument, current proficiency level, age bracket, and educational goals (e.g., ABRSM/Trinity/Muson exam preparation).
            </li>
            <li>
              <strong>Communication Records:</strong> WhatsApp messages, trial assessment booking requests, feedback, and correspondence with our administrative desk.
            </li>
            <li>
              <strong>Classroom & Billing Data:</strong> Attendance logs, assignment submissions, video session connection metadata, and tuition receipts.
            </li>
          </ul>
        </section>

        <section>
          <h2>2. Child Privacy & Protection of Minors (COPPA & GDPR)</h2>
          <p style={{ marginBottom: "8px" }}>
            Many of our students are children and young learners. We strictly enforce stringent child protection protocols:
          </p>
          <ul style={{ paddingLeft: "20px", color: "#586c60", fontSize: "13px", lineHeight: "1.75" }}>
            <li>
              We require explicit consent from a parent or legal guardian prior to scheduling trial assessments or classes for minors under 18.
            </li>
            <li>
              We do not sell, rent, or publicly disclose personal information or learning records of children to third parties.
            </li>
            <li>
              Parents and guardians retain the right to review, update, or request the deletion of their child's records at any time.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <ul style={{ paddingLeft: "20px", color: "#586c60", fontSize: "13px", lineHeight: "1.75" }}>
            <li>To schedule and deliver private 1-on-1 online music lessons.</li>
            <li>To enable our 24/7 admin team to send lesson reminders, track attendance, and provide technical assistance.</li>
            <li>To prepare customized PDF study materials, exercises, and guided video review drills.</li>
            <li>To coordinate external music examination registrations (ABRSM, Trinity College London, Muson) when requested.</li>
          </ul>
        </section>

        <section>
          <h2>4. WhatsApp & Secure Technology Infrastructure</h2>
          <p>
            We utilize WhatsApp for direct communication, scheduling reminders, and administrative support. Our live interactive virtual classrooms are delivered over secure, encrypted WebRTC video platforms (LiveKit / Supabase) with active staff supervision.
          </p>
        </section>

        <section>
          <h2>5. Data Retention & Security Safeguards</h2>
          <p>
            We implement industry-standard administrative, physical, and technical safeguards to protect student data from unauthorized access, loss, or misuse. Information is retained only as long as necessary to provide educational services or meet accounting and safeguarding requirements.
          </p>
        </section>

        <section>
          <h2>6. Your Privacy Rights</h2>
          <p>
            Depending on your location (including the UK, EU, US, and Nigeria), you have the right to access, correct, port, or request the erasure of your personal data. To exercise any of these rights, please contact our privacy desk:
          </p>
          <p style={{ marginTop: "12px", color: "var(--pine-950)", fontSize: "13px", lineHeight: "1.6" }}>
            <strong>{SCHOOL_NAME} - Privacy & Safeguarding Desk</strong>
            <br />
            Address: {SCHOOL_ADDRESS}
            <br />
            Phone / WhatsApp: {SCHOOL_PHONE_DISPLAY}
            <br />
            Email: <a href={`mailto:${SCHOOL_EMAIL}`}>{SCHOOL_EMAIL}</a>
          </p>
        </section>

        <p className="public-legal-related">
          Read the <Link href="/terms-and-conditions">Terms of Service</Link>.
        </p>
      </article>
    </main>
  );
}
