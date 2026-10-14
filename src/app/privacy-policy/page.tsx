import Link from "next/link";
import { PRIVACY_POLICY_VERSION } from "@/lib/legal/consent-versions";
import { ACADEMY_EMAILS } from "@/lib/email/config";

export const metadata = { title: "Privacy Policy | ProsperWork" };

export default function PrivacyPolicyPage() {
  return <main className="public-legal">
    <header className="public-legal-header">
      <Link className="public-legal-brand" href="/login">ProsperWork <span>Music Concepts</span></Link>
      <Link href="/login">Back to sign in</Link>
    </header>
    <article className="public-legal-document">
      <div className="public-legal-version">Family privacy notice · Version {PRIVACY_POLICY_VERSION}</div>
      <h1>Privacy Policy</h1>
      <p className="public-legal-lede">This notice describes the family and student information ProsperWork uses to provide academy services.</p>

      <section>
        <h2>Information we use</h2>
        <p>This can include parent or guardian contact details; a student’s name and learning information; lesson schedules, attendance and progress; billing records and receipts; and messages or files submitted through the portal. Live classes also use the connection information needed to join a session.</p>
      </section>
      <section>
        <h2>Why we use it</h2>
        <p>We use this information to create and protect accounts, arrange and deliver lessons, communicate with families, support students, manage billing, and keep accurate academy and safeguarding records.</p>
      </section>
      <section>
        <h2>Service providers and access</h2>
        <p>Information is available to authorized academy staff who need it for their work and to service providers that help operate the portal, email and live-class features. The portal uses Supabase for account and record services and LiveKit for live classes. We do not sell family or student information.</p>
      </section>
      <section>
        <h2>Children’s information</h2>
        <p>A parent or guardian must register a child and provide information the guardian is authorized to share. Please contact the academy to correct student information or raise a concern about a child’s account or class access.</p>
      </section>
      <section>
        <h2>Security and retention</h2>
        <p>We use account access controls to limit who can view family records. We keep records while needed to provide academy services, maintain operational and financial history, or meet applicable obligations, then delete or de-identify them where appropriate.</p>
      </section>
      <section>
        <h2>Your questions and requests</h2>
        <p>To ask about, correct or request deletion of family information, contact our privacy desk at <a href={`mailto:${ACADEMY_EMAILS.adminTech.security}`}>{ACADEMY_EMAILS.adminTech.security}</a> or general school communications at <a href={`mailto:${ACADEMY_EMAILS.communications.primary}`}>{ACADEMY_EMAILS.communications.primary}</a>. Some records may need to be retained for academy operations or legal and financial obligations.</p>
      </section>
      <p className="public-legal-related">Read the <Link href="/terms-and-conditions">Parent Terms and Conditions</Link>.</p>
    </article>
  </main>;
}
