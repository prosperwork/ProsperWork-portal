"use client";

import type { ReactNode } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { Empty } from "../../_lib/portal-formatters";
import type { FormKind } from "../modals/ActionModal";
import type { AcademyData, Role } from "@/lib/types";

export default function CurriculumView({
  data,
  role,
  query,
  searchBar,
  curriculumAccess,
  superAdmin,
  headerActions,
  notify,
}: {
  data: AcademyData;
  role: Role;
  query: string;
  searchBar: (placeholder: string) => ReactNode;
  curriculumAccess: boolean;
  superAdmin: boolean;
  headerActions: (label: string, kind: FormKind) => ReactNode;
  notify: (msg: string) => void;
}) {
  const resources = data.resources.filter((item) =>
    `${item.title} ${item.instrument} ${item.type} ${item.level}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const socialOnly = role === "social_media";

  return (
    <>
      <div className="toolbar">
        {searchBar(
          socialOnly
            ? "Find approved learning content"
            : "Find a song, guide or instrument"
        )}
        {!socialOnly &&
          (curriculumAccess || superAdmin) &&
          headerActions("Add resource", "resource")}
      </div>
      {socialOnly && (
        <div className="callout" style={{ marginBottom: 15 }}>
          <ShieldCheck size={17} />
          <div>
            <strong>Approved child content only.</strong>Social Media sees
            shared learning content, never child names, lesson notes, family
            details or consent controls. Publish/export integrations are not
            configured.
          </div>
        </div>
      )}
      <div className="resource-grid">
        {resources.map((resource) => (
          <article className="resource-card" key={resource.id}>
            <div className="resource-type">
              {resource.type} · {resource.instrument}
            </div>
            <h3>{resource.title}</h3>
            <p>{resource.summary}</p>
            <div className="resource-foot">
              <span>{resource.level}</span>
              <button
                className="subtle-link"
                onClick={() =>
                  notify(
                    socialOnly
                      ? "Preview only. Publishing is not configured; no content was posted."
                      : "Resource opened in the local learning library."
                  )
                }
              >
                {socialOnly ? "Preview approved asset" : "Open resource"}
                <ChevronRight size={12} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!resources.length && (
        <Empty
          title="No resources found"
          detail="Try a different search, or add a learning resource."
        />
      )}
    </>
  );
}
