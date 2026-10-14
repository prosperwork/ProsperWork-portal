import Link from "next/link";
import { PARENT_TERMS_VERSION } from "@/lib/legal/consent-versions";

export const metadata = {
  title: "Terms of Service | ProsperWork Music Concepts",
  description: "Terms and conditions governing enrollment, 1-on-1 online music lessons, student conduct, and admin monitoring at ProsperWork Music Concepts.",
};

const SCHOOL_NAME = "ProsperWork Music Concepts";
const SCHOOL_ADDRESS = "Lagos, Nigeria";
const SCHOOL_PHONE_DISPLAY = "+234 703 192 6969";
const SCHOOL_EMAIL = "info@prosperworkmusic.com";

export default function ParentTermsPage() {
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
          Legal & Governance · Last Updated: September 2026 (Version {PARENT_TERMS_VERSION})
        </div>
        <h1>Terms of Service</h1>
        <p className="public-legal-lede">
          Please review the terms and conditions governing enrollment, private 1-on-1 online music lessons, student conduct, rescheduling, and administrative monitoring at {SCHOOL_NAME}.
        </p>

        <section>
          <p>
            Welcome to <strong>{SCHOOL_NAME}</strong> ("we," "our," or "the Academy"). By accessing our website, portal, registering for a free trial assessment, or enrolling in our private 1-on-1 music lessons, you ("Parent," "Guardian," or "Student") agree to be bound by these Terms of Service.
          </p>
        </section>

        <section>
          <h2>1. Nature of Services</h2>
          <p>
            {SCHOOL_NAME} provides private, one-on-one online music education covering instruments (Piano & Keyboard, Saxophone, Drums, Violin, Acoustic Guitar, Bass Guitar), Voice Training, and Music Theory. Lessons run between 45 minutes to 1 hour per session and are conducted virtually over approved secure video platforms.
          </p>
        </section>

        <section>
          <h2>2. Enrollment & Trial Assessments</h2>
          <p>
            Prospective students may request an initial <strong>FREE one-on-one trial assessment</strong> via WhatsApp or our website. During the trial assessment, an instructor will evaluate the student's baseline skill and recommend an appropriate curriculum pathway. Enrollment is confirmed upon schedule agreement and tuition settlement.
          </p>
        </section>

        <section>
          <h2>3. 24/7 Admin Supervision & Quality Assurance</h2>
          <p>
            To maintain our professional teaching standard, our dedicated administrative team actively monitors classes, tracks attendance, sends lesson reminders, and assists with technical support. By enrolling, parents and students consent to administrative monitoring of educational sessions.
          </p>
        </section>

        <section>
          <h2>4. Attendance, Rescheduling & Cancellations</h2>
          <p style={{ marginBottom: "8px" }}>
            Consistency is essential for musical progression and instrumental mastery:
          </p>
          <ul style={{ paddingLeft: "20px", color: "#586c60", fontSize: "13px", lineHeight: "1.75" }}>
            <li>
              <strong>Punctuality:</strong> Lessons begin promptly at the scheduled time. Students should be set up with their instrument 5 minutes prior to the start time.
            </li>
            <li>
              <strong>Rescheduling:</strong> If a student needs to reschedule a lesson, at least <strong>24 hours advance notice</strong> must be provided to our admin desk via WhatsApp. Classes rescheduled with adequate notice will be reassigned to a convenient makeup slot within the billing cycle.
            </li>
            <li>
              <strong>Missed Lessons:</strong> Lessons missed without 24 hours prior notice or unannounced no-shows cannot be refunded or rescheduled, as our instructor has reserved that time exclusively for your child.
            </li>
          </ul>
        </section>

        <section>
          <h2>5. Intellectual Property & Study Materials</h2>
          <p>
            All proprietary guided video drills, custom PDF sheet music, homework packets, and curriculum frameworks provided by {SCHOOL_NAME} remain the intellectual property of the Academy. These materials are licensed exclusively for personal educational use by the enrolled student and may not be redistributed or resold.
          </p>
        </section>

        <section>
          <h2>6. Student & Instructor Conduct</h2>
          <p>
            We are committed to maintaining a safe, respectful, and encouraging learning environment. Disrespectful, abusive, or inappropriate behavior by any party will result in immediate termination of lessons without refund.
          </p>
        </section>

        <section>
          <h2>7. Examination Pathways & Limitation of Liability</h2>
          <p>
            {SCHOOL_NAME} strives to provide the highest quality music instruction and prepares learners for recognized music examinations (including ABRSM, Trinity College London, and Muson). However, examination results and individual progress ultimately depend on the student's consistent practice, homework completion, and dedication.
          </p>
        </section>

        <section>
          <h2>8. Additional Inquiries & Contact</h2>
          <p>
            For custom schedules, specific instrument requirements, terms clarification, or any details not listed on this page, please contact the academy administration:
          </p>
          <p style={{ marginTop: "12px", color: "var(--pine-950)", fontSize: "13px", lineHeight: "1.6" }}>
            <strong>{SCHOOL_NAME}</strong>
            <br />
            Address: {SCHOOL_ADDRESS}
            <br />
            Phone / WhatsApp: {SCHOOL_PHONE_DISPLAY}
            <br />
            Email: <a href={`mailto:${SCHOOL_EMAIL}`}>{SCHOOL_EMAIL}</a>
          </p>
        </section>

        <p className="public-legal-related">
          Read the <Link href="/privacy-policy">Privacy Policy</Link>.
        </p>
      </article>
    </main>
  );
}
