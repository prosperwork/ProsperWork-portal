"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { manualSections } from "@/lib/portal/manual-sections";
import type { Role } from "@/lib/types";

export default function ManualPage() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/session", { credentials: "include", cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (active && result?.profile?.role) setRole(result.profile.role); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return manualSections.filter(section => {
      const visibleToRole = !role || !section.roles?.length || section.roles.includes(role as Role);
      const searchable = [section.title, section.summary, ...section.steps.flatMap(step => [step.title, step.text])].join(" ").toLowerCase();
      return visibleToRole && (!needle || searchable.includes(needle));
    });
  }, [query, role]);

  return <div className="portal-manual">
    <header className="portal-manual-head">
      <div><h1>Manual usage</h1></div>
      <label className="manual-search"><Search size={16} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tasks and workflows" aria-label="Search manual" /></label>
    </header>
    <div className="manual-layout">
      <nav className="manual-index" aria-label="Manual sections">
        <div className="manual-results-count">{filtered.length} {filtered.length === 1 ? "section" : "sections"}</div>
        {filtered.map(section => <a key={section.id} href={`#${encodeURIComponent(section.id)}`}>{section.title}</a>)}
      </nav>
      <div className="manual-content">
        {filtered.length ? filtered.map(section => <section className="manual-section" id={section.id} key={section.id}>
          <h2>{section.title}</h2><p className="manual-section-summary">{section.summary}</p>
          <ol className="manual-steps">{section.steps.map((step, index) => <li key={`${section.id}-${index}`}><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol>
          {section.href && <Link className="manual-related" href={section.href}>Open related workspace <ArrowUpRight size={13} /></Link>}
        </section>) : <div className="manual-empty">No matching guidance for this search. Try a shorter task name.</div>}
      </div>
    </div>
  </div>;
}
