"use client";

import { ShieldCheck } from "lucide-react";
import { niceDate, roles, SectionTitle } from "../../_lib/portal-formatters";
import { legacyWorkspaceAccess } from "../../_lib/portal-navigation";
import type { AcademyData } from "@/lib/types";

export default function SettingsView({
  data,
  rules,
  superAdmin,
  reload,
}: {
  data: AcademyData;
  rules: {
    consent: boolean;
    lessonVerify: boolean;
    notice: boolean;
    makerChecker: boolean;
  };
  superAdmin: boolean;
  reload: () => Promise<void>;
}) {
  const ruleItems: {
    key: keyof typeof rules;
    title: string;
    detail: string;
    locked?: boolean;
  }[] = [
    {
      key: "consent",
      title: "Social content needs family consent",
      detail:
        "A child's content is never eligible without a recorded parent/guardian yes.",
    },
    {
      key: "lessonVerify",
      title: "Two-person lesson verification",
      detail:
        "Teacher marks done; an admin verifies completion and creates a timestamped audit.",
    },
    {
      key: "notice",
      title: "Reschedule notice lock",
      detail:
        "Family requests go to an admin queue. The scheduled time stays until approved.",
    },
    {
      key: "makerChecker",
      title: "Payroll maker-checker",
      detail: "Payroll is prepared by staff and approved only by Super Admin.",
    },
  ];

  return (
    <>
      <div className="callout" style={{ marginBottom: 15 }}>
        <ShieldCheck size={17} />
        <div>
          <strong>Secure academy foundation</strong>Authentication and record
          permissions are enforced by Supabase. Additional blueprint workflows
          are still being connected; unavailable actions report an error rather
          than simulating success.
        </div>
      </div>
      <div className="grid-main">
        <section className="card section-card">
          <SectionTitle
            title="Continuity guardrails"
            detail="Privacy and approval protections cannot be disabled from these controls."
          />
          {ruleItems.map((rule) => (
            <div className="settings-row" key={rule.key}>
              <div>
                <strong>{rule.title}</strong>
                <span>{rule.detail}</span>
              </div>
              <span className="pill green">Required policy</span>
            </div>
          ))}
        </section>
        <div className="stack">
          <section className="card section-card">
            <SectionTitle
              title="Access model"
              detail="Authenticated, account-scoped access"
            />
            {roles.map((item) => (
              <div className="metric-row" key={item.id}>
                <span>{item.label}</span>
                <strong>
                  {
                    Object.values(legacyWorkspaceAccess).filter((viewRoles) =>
                      viewRoles.includes(item.id)
                    ).length
                  }{" "}
                  views
                </strong>
              </div>
            ))}
            <div className="notice" style={{ marginTop: 12 }}>
              Supabase enforces role and record permissions. Only Super Admin
              can change academy settings.
            </div>
            {superAdmin && (
              <a className="btn" style={{ marginTop: 12 }} href="/settings">
                Configure class length, payroll rules & email
              </a>
            )}
          </section>
          <section className="card section-card">
            <SectionTitle
              title="Academy database"
              detail="Records are stored in your connected Supabase project."
            />
            <div className="metric-row">
              <span>Accessible students</span>
              <strong>{data.students.length}</strong>
            </div>
            <div className="metric-row">
              <span>Accessible lessons</span>
              <strong>{data.lessons.length}</strong>
            </div>
            <div className="metric-row">
              <span>Last audit record</span>
              <strong>
                {data.audit[0] ? niceDate(data.audit[0].at) : "—"}
              </strong>
            </div>
            <button
              className="btn secondary"
              style={{ marginTop: 12 }}
              onClick={() => void reload()}
            >
              Refresh records
            </button>
            {superAdmin && (
              <a className="btn" style={{ marginTop: 12 }} href="/accounts">
                Manage academy accounts
              </a>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
