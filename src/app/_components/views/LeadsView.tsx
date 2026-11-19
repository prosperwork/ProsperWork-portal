"use client";

import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  MessageCircle,
  Music2,
  Timer,
} from "lucide-react";
import ProfileAvatar from "../ProfileAvatar";
import {
  Empty,
  niceDate,
  Pill,
  SectionTitle,
  timeAt,
} from "../../_lib/portal-formatters";
import type { FormKind } from "../modals/ActionModal";
import type { AcademyData, AppView, Lead, Role } from "@/lib/types";

export default function LeadsView({
  data,
  role,
  query,
  searchBar,
  adminAccess,
  financeAccess = false,
  headerActions,
  openEmailComposer,
  openExternal,
  setLeadStatus,
  changeView,
  notify,
}: {
  data: AcademyData;
  role: Role;
  query: string;
  searchBar: (placeholder: string) => ReactNode;
  adminAccess: boolean;
  financeAccess?: boolean;
  headerActions: (label: string, kind: FormKind) => ReactNode;
  openEmailComposer: (
    type: "family" | "staff" | "lead",
    id: string,
    email: string,
    name: string
  ) => void;
  openExternal: (
    mode: "phone" | "whatsapp",
    phone: string,
    name: string,
    defaultText?: string
  ) => void;
  setLeadStatus: (lead: Lead, status: Lead["status"]) => void;
  changeView: (view: AppView) => void;
  notify: (msg: string) => void;
}) {
  const [stageFilter, setStageFilter] = useState<Lead["status"] | "all">("all");

  const statusButton = (label: string, onClick: () => void, tone = "ghost") => (
    <button type="button" className={`btn small ${tone}`} onClick={onClick}>
      {label}
    </button>
  );

  const stages: Lead["status"][] = [
    "new",
    "contacted",
    "callback",
    "trial_requested",
    "trial_booked",
    "trial_verified",
    "converted",
    "nursery",
    "winback",
  ];

  const searchedLeads = data.leads.filter((lead) =>
    `${lead.parentName} ${lead.childName} ${lead.instrument} ${lead.source} ${lead.status}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const list =
    stageFilter === "all"
      ? searchedLeads
      : searchedLeads.filter((lead) => lead.status === stageFilter);

  const respondedLeads = data.leads.filter((lead) => lead.firstResponseAt);
  const avgResponseMinutes = respondedLeads.length
    ? Math.round(
        respondedLeads.reduce(
          (sum, lead) =>
            sum +
            Math.max(
              0,
              (new Date(lead.firstResponseAt!).getTime() -
                new Date(lead.arrivedAt).getTime()) /
                60000
            ),
          0
        ) / respondedLeads.length
      )
    : null;

  return (
    <>
      <div className="toolbar">
        {searchBar("Search family, child or instrument")}
        {(adminAccess || role === "sales_marketing") &&
          headerActions("Capture enquiry", "lead")}
      </div>
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            New enquiries{" "}
            <span className="stat-icon">
              <Timer size={15} />
            </span>
          </div>
          <div className="stat-value">
            {data.leads.filter((lead) => lead.status === "new").length}
          </div>
          <div className="stat-foot">Response timer starts at arrival</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Trials in motion{" "}
            <span className="stat-icon">
              <Music2 size={15} />
            </span>
          </div>
          <div className="stat-value">
            {
              data.leads.filter((lead) =>
                ["trial_requested", "trial_booked", "trial_verified"].includes(
                  lead.status
                )
              ).length
            }
          </div>
          <div className="stat-foot">Handoff to teacher and usher</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Nursery follow-up{" "}
            <span className="stat-icon">
              <Clock3 size={15} />
            </span>
          </div>
          <div className="stat-value">
            {data.leads.filter((lead) => lead.status === "nursery").length}
          </div>
          <div className="stat-foot">
            Keep the door open, respect their timing
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            First response average{" "}
            <span className="stat-icon">
              <Activity size={15} />
            </span>
          </div>
          <div className="stat-value">
            {avgResponseMinutes === null ? "—" : `${avgResponseMinutes}m`}
          </div>
          <div className="stat-foot">
            {respondedLeads.length
              ? `Across ${respondedLeads.length} recorded first response${
                  respondedLeads.length === 1 ? "" : "s"
                }`
              : "No first responses recorded yet"}
          </div>
        </div>
      </div>
      <section className="card section-card">
        <SectionTitle
          title="Enquiries & trial classes"
          detail="Follow-ups, trial bookings, callbacks and new student enrolments."
        />
        <div
          className="portal-tabs"
          role="tablist"
          aria-label="Filter leads by pipeline stage"
        >
          <button
            type="button"
            role="tab"
            aria-selected={stageFilter === "all"}
            className={`portal-tab${stageFilter === "all" ? " active" : ""}`}
            onClick={() => setStageFilter("all")}
          >
            All
            <span className="portal-tab-badge">{searchedLeads.length}</span>
          </button>
          {stages.map((stage) => {
            const count = searchedLeads.filter(
              (lead) => lead.status === stage
            ).length;
            return (
              <button
                key={stage}
                type="button"
                role="tab"
                aria-selected={stageFilter === stage}
                className={`portal-tab${stageFilter === stage ? " active" : ""}`}
                onClick={() => setStageFilter(stage)}
              >
                {stage.replaceAll("_", " ")}
                <span className="portal-tab-badge">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Arrived / response</th>
                <th>Family & learner</th>
                <th>Enquiry / referral</th>
                <th>Follow-up & trial detail</th>
                <th>Owner</th>
                <th>Pipeline</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {list.map((lead) => {
                const minutes = lead.firstResponseAt
                  ? Math.max(
                      0,
                      Math.round(
                        (new Date(lead.firstResponseAt).getTime() -
                          new Date(lead.arrivedAt).getTime()) /
                          60000
                      )
                    )
                  : null;
                return (
                  <tr key={lead.id}>
                    <td>
                      <strong>{niceDate(lead.arrivedAt)}</strong>
                      <div className="table-small">
                        {timeAt(lead.arrivedAt)} ·{" "}
                        {minutes === null
                          ? "Response due"
                          : `First reply ${minutes}m`}
                      </div>
                    </td>
                    <td>
                      <div className="pw-person-inline">
                        <ProfileAvatar name={lead.parentName} size={32} />
                        <span>
                          <strong>{lead.parentName}</strong>
                          <small>
                            {lead.childName} · {lead.instrument}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {lead.source}
                      <div className="table-small">
                        {lead.referralFrom
                          ? `Referred by ${lead.referralFrom}`
                          : lead.email}
                      </div>
                    </td>
                    <td>
                      {lead.notes}
                      <div className="table-small">
                        {lead.preferredSlots?.join(" · ") ||
                          "No preferred trial times yet"}
                        {lead.callbackAt &&
                          ` · callback ${niceDate(lead.callbackAt)}`}
                      </div>
                    </td>
                    <td>
                      {lead.owner}
                      <div className="row-actions" style={{ marginTop: 5 }}>
                        <button
                          className="icon-btn"
                          aria-label={`Email ${lead.parentName}`}
                          onClick={() =>
                            openEmailComposer(
                              "lead",
                              lead.id,
                              lead.email,
                              lead.parentName
                            )
                          }
                        >
                          <MessageCircle size={13} />
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`WhatsApp ${lead.parentName}`}
                          title={`Send WhatsApp to ${lead.parentName}`}
                          onClick={() =>
                            openExternal(
                              "whatsapp",
                              lead.phone,
                              lead.parentName,
                              `Hello ${lead.parentName}, this is ProsperWork Music Academy regarding ${lead.childName}'s music lessons inquiry. How can we assist you today?`
                            )
                          }
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#059669",
                            }}
                          >
                            WA
                          </span>
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`Call ${lead.parentName}`}
                          onClick={() =>
                            openExternal("phone", lead.phone, lead.parentName)
                          }
                        >
                          <ArrowUpRight size={13} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <Pill>{lead.status.replaceAll("_", " ")}</Pill>
                    </td>
                    <td>
                      <div className="row-actions">
                        {lead.status === "new" &&
                          statusButton("Contacted", () =>
                            setLeadStatus(lead, "contacted")
                          )}
                        {(lead.status === "contacted" ||
                          lead.status === "callback") &&
                          statusButton(
                            "Request trial",
                            () => setLeadStatus(lead, "trial_requested"),
                            "secondary"
                          )}
                        {lead.status === "trial_requested" &&
                          statusButton(
                            "Book trial",
                            () => setLeadStatus(lead, "trial_booked"),
                            "secondary"
                          )}
                        {lead.status === "trial_booked" &&
                          statusButton(
                            "Trial done",
                            () => setLeadStatus(lead, "trial_verified"),
                            "secondary"
                          )}
                        {lead.status === "trial_verified" &&
                          statusButton(
                            "Convert",
                            () => setLeadStatus(lead, "converted"),
                            "secondary"
                          )}
                        {lead.status === "converted" &&
                          (financeAccess ? (
                            statusButton("First payment", () => {
                              changeView("finance");
                              notify(
                                "Add the first payment record in Finance."
                              );
                            })
                          ) : (
                            <span className="table-small">
                              Handoff to Finance for billing
                            </span>
                          ))}
                        {!["converted", "winback"].includes(lead.status) &&
                          statusButton(
                            lead.status === "nursery" ? "Win-back" : "Nursery",
                            () =>
                              setLeadStatus(
                                lead,
                                lead.status === "nursery"
                                  ? "winback"
                                  : "nursery"
                              )
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && (
            <Empty
              title="No enquiry matches"
              detail="Capture a new family enquiry to start a follow-up."
            />
          )}
        </div>
      </section>
    </>
  );
}
