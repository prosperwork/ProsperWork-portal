"use client";

import type { ReactNode } from "react";
import {
  CalendarDays,
  HeartHandshake,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import ProfileAvatar from "../ProfileAvatar";
import { Pill, roleNames, SectionTitle } from "../../_lib/portal-formatters";
import type { AcademyData, Role, StaffMember } from "@/lib/types";

export default function PeopleView({
  data,
  role,
  query,
  searchBar,
  superAdmin,
  canManage,
  openEmailComposer,
  updateStaffStatus,
}: {
  data: AcademyData;
  role: Role;
  query: string;
  searchBar: (placeholder: string) => ReactNode;
  superAdmin: boolean;
  canManage: boolean;
  openEmailComposer: (
    type: "family" | "staff" | "lead",
    id: string,
    email: string,
    name: string
  ) => void;
  updateStaffStatus: (
    person: StaffMember,
    nextStatus: StaffMember["status"]
  ) => void;
}) {
  const people = data.staff.filter((person) =>
    `${person.name} ${person.department} ${person.role} ${person.status}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const staffMembers = data.staff.filter(
    (person) => person.role !== "super_admin"
  );
  const updateTeacherProgress = () => {
    window.location.href = "/hiring";
  };

  return (
    <>
      <div className="toolbar">
        {searchBar("Find staff, department or status")}
        {(superAdmin ||
          role === "general_manager" ||
          role === "head_admin" ||
          role === "hr") && (
          <button className="btn" onClick={updateTeacherProgress}>
            <Plus size={14} />
            Log recruitment / observation
          </button>
        )}
      </div>
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            Active team{" "}
            <span className="stat-icon">
              <Users size={15} />
            </span>
          </div>
          <div className="stat-value">
            {staffMembers.filter((person) => person.status === "active").length}
          </div>
          <div className="stat-foot">Teaching and operations</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            On leave{" "}
            <span className="stat-icon">
              <CalendarDays size={15} />
            </span>
          </div>
          <div className="stat-value">
            {
              staffMembers.filter((person) => person.status === "on_leave")
                .length
            }
          </div>
          <div className="stat-foot">Plan cover before the class</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Applicants{" "}
            <span className="stat-icon">
              <Sparkles size={15} />
            </span>
          </div>
          <div className="stat-value">
            {
              staffMembers.filter((person) => person.status === "applicant")
                .length
            }
          </div>
          <div className="stat-foot">Interview & reference next steps</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            Families supported{" "}
            <span className="stat-icon">
              <HeartHandshake size={15} />
            </span>
          </div>
          <div className="stat-value">
            {staffMembers.reduce(
              (sum, person) => sum + (person.parentCount || 0),
              0
            )}
          </div>
          <div className="stat-foot">Assigned family portfolio</div>
        </div>
      </div>
      {role === "hr" && (
        <div className="callout" style={{ marginBottom: 15 }}>
          <Users size={17} />
          <div>
            <strong>Recruitment & wellbeing.</strong>Track applications, leave
            and staff retention. Pay rates stay out of the HR perspective.
          </div>
        </div>
      )}
      {role === "qc" && (
        <div className="callout" style={{ marginBottom: 15 }}>
          <ShieldCheck size={17} />
          <div>
            <strong>Quality works alongside the teacher.</strong>Joint
            interview, training, observation, curriculum consistency and red
            flags; billing and pay are not included.
          </div>
        </div>
      )}
      <section className="card section-card">
        <SectionTitle
          title="Staff directory & capacity"
          detail="Teachers see WAT beside each learner timezone on every class handoff."
        />
        <div className="table-wrap">
          <table className="staff-directory-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Department / role</th>
                <th>Status</th>
                <th>Capacity</th>
                <th>Timezone</th>
                <th>Contact / actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const isOwner = person.role === "super_admin";
                return (
                  <tr key={person.id}>
                    <td>
                      <div className="pw-person-inline">
                        <ProfileAvatar
                          profileId={person.id}
                          name={person.name}
                          size={32}
                        />
                        <span>
                          <strong>{person.name}</strong>
                          <small>{person.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {person.department}
                      <div className="table-small">
                        {roleNames[person.role] || person.role}
                      </div>
                    </td>
                    <td>
                      <Pill>{person.status.replace("_", " ")}</Pill>
                    </td>
                    <td>
                      {isOwner ? (
                        <span className="table-small">Not applicable</span>
                      ) : (
                        <>
                          {person.parentCount !== undefined
                            ? `${person.parentCount} families`
                            : person.role === "teacher"
                            ? `${
                                data.lessons.filter(
                                  (lesson) =>
                                    lesson.teacherName === person.name &&
                                    lesson.status === "scheduled"
                                ).length
                              } scheduled classes`
                            : "—"}
                          {person.quota !== undefined && (
                            <div className="table-small">
                              Quota {person.quota}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td>{person.timezone}</td>
                    <td>
                      {isOwner ? (
                        <span className="table-small">—</span>
                      ) : (
                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            aria-label={`Email ${person.name}`}
                            onClick={() =>
                              openEmailComposer(
                                "staff",
                                person.id,
                                person.email,
                                person.name
                              )
                            }
                          >
                            <MessageCircle size={13} />
                          </button>
                          {(role === "hr" || canManage || superAdmin) && (
                            <select
                              aria-label={`Update ${person.name} status`}
                              className="select-mini"
                              value={person.status}
                              onChange={(event) =>
                                updateStaffStatus(
                                  person,
                                  event.target.value as StaffMember["status"]
                                )
                              }
                            >
                              <option value="active">Active</option>
                              <option value="on_leave">On leave</option>
                              <option value="paused">Paused</option>
                              <option value="restricted">Restricted</option>
                              <option value="applicant">Applicant</option>
                            </select>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
