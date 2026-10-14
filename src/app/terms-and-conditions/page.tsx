import Link from "next/link";
import { PARENT_TERMS_VERSION } from "@/lib/legal/consent-versions";
import { ACADEMY_EMAILS } from "@/lib/email/config";

export const metadata = { title: "Parent Terms and Conditions | ProsperWork" };

export default function ParentTermsPage() {
  return <main className="public-legal">
    <header className="public-legal-header">
      <Link className="public-legal-brand" href="/login">ProsperWork <span>Music Concepts</span></Link>
      <Link href="/login">Back to sign in</Link>
    </header>
    <article className="public-legal-document">
      <div className="public-legal-version">Parent and guardian agreement · Version {PARENT_TERMS_VERSION}</div>
      <h1>Terms and Conditions</h1>
      <p className="public-legal-lede">These terms explain how parents and guardians use ProsperWork’s family portal and music lessons.</p>

      <section>
        <h2>Parent or guardian responsibility</h2>
        <p>You must be an adult with authority to register the child and share the information you provide. Keep your sign-in details private, keep family details current, and contact the academy if you believe an account has been accessed without permission.</p>
      </section>
      <section>
        <h2>Accounts and access</h2>
        <p>Account creation and email confirmation do not immediately open student records. ProsperWork staff review and activate family accounts. Use the portal only for your own family and for lawful, respectful communication with the academy.</p>
      </section>
      <section>
        <h2>Lessons and live classes</h2>
        <p>Lessons follow the schedule and lesson length agreed with the academy. A normal lesson is approximately 45–60 minutes; longer sessions require agreement in advance. Parents or guardians are responsible for helping children join their assigned live class safely and for using class links only for their intended lesson.</p>
      </section>
      <section>
        <h2>Fees, cancellations and changes</h2>
        <p>Fees, currency, lesson frequency and any discount are based on the arrangement confirmed with the academy. Rescheduling and cancellation are governed by the current academy policy provided to families. Contact the academy before assuming a change has been approved.</p>
      </section>
      <section>
        <h2>Changes and questions</h2>
        <p>The version accepted during registration is recorded with its acceptance time. The academy may issue a newer version. For general questions, contact <a href={`mailto:${ACADEMY_EMAILS.communications.primary}`}>{ACADEMY_EMAILS.communications.primary}</a> or our admissions team at <a href={`mailto:${ACADEMY_EMAILS.communications.admissions}`}>{ACADEMY_EMAILS.communications.admissions}</a>.</p>
      </section>
      <p className="public-legal-related">Read the <Link href="/privacy-policy">Privacy Policy</Link>.</p>
    </article>
  </main>;
}
