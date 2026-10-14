import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcademyData, StaffMember } from "../types";
import type { AcademyProfile } from "../supabase/identity";
import { recordSchemas, type Module } from "./schemas";
import { loadAllRecords } from "./paged-records";

export const emptyAcademyData: AcademyData = {
  students: [], lessons: [], leads: [], payments: [], staff: [], payroll: [], resources: [], homework: [], expenses: [], audit: [],
};
export async function academySnapshot(client: SupabaseClient, profile: AcademyProfile) {
  const modules = Object.keys(recordSchemas) as Module[];
  const results = await Promise.all(modules.map(async (module) => {
    const { data, error } = await loadAllRecords(client, `pw_${module}`);
    if (error) throw new Error("Academy records could not be loaded.");
    return { module, rows: data || [] };
  }));
  const data = structuredClone(emptyAcademyData);
  const revisions: Record<string, number> = {};
  for (const { module, rows } of results) {
    (data[module] as unknown[]) = rows.filter(row=>module!=="resources"||!row.archived_at).map((row) => row.payload);
    for (const row of rows) revisions[`${module}:${row.id}`] = row.revision;
  }
  const [{ data: profiles, error: profilesError }, { data: rates, error: ratesError }, { data: audit, error: auditError }] = await Promise.all([
    loadAllRecords(client, "pw_profiles", "id,name,email,role,status,timezone,department,quota", { sort: "name", ascending: true }),
    loadAllRecords(client, "pw_staff_compensation", "staff_id,monthly_student_rate,currency", { cursor: "staff_id" }),
    loadAllRecords(client, "pw_audit"),
  ]);
  if (profilesError || ratesError || auditError) throw new Error("Account records could not be loaded.");
  data.staff = (profiles || []).filter((person) => !["parent", "student"].includes(person.role)).map((person) => {
    const compensation = rates?.find((rate) => rate.staff_id === person.id);
    return {
      id: person.id, name: person.name, email: person.email, role: person.role,
      status: person.status === "pending" ? "applicant" : person.status,
      timezone: person.timezone, department: person.department, quota: person.quota,
      baseRate: Number(compensation?.monthly_student_rate || 0), currency: compensation?.currency || "NGN",
      parentCount: new Set(data.students.filter((student) => student.adminName === person.name && student.status === "active").map((student) => student.parentEmail)).size,
    } as StaffMember;
  });
  data.audit = (audit || []).map((entry) => ({
    id: String(entry.id), action: entry.action, record: `${entry.entity_type.replace("pw_", "")} · ${entry.entity_id}`,
    actor: entry.actor_name, at: entry.created_at, detail: `Fields: ${entry.changed_fields.join(", ") || "none"}`,
  }));
  for (const student of data.students) {
    const month = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: student.timezone, year: "numeric", month: "2-digit" }).format(value);
    student.lessonsTaken = data.lessons.filter((lesson) => lesson.studentId === student.id && lesson.status === "completed" && month(new Date(lesson.startsAt)) === month(new Date())).length;
  }
  if (["super_admin", "general_manager", "finance"].includes(profile.role)) {
    const { data: directory, error } = await client.rpc("pw_billing_directory");
    if (error) throw new Error("The billing directory could not be loaded.");
    data.billingStudents = (directory || []).map((person: { id: string; parent_id: string; name: string; parent_name: string }) => ({
      id: person.id, parentId: person.parent_id, name: person.name, parentName: person.parent_name,
    }));
  }
  return { data, revisions, profile };
}

export async function resolveChange(client: SupabaseClient, module: Module, input: Record<string, unknown>, operation: string, profile: AcademyProfile) {
  const parsed = recordSchemas[module].safeParse(input);
  if (!parsed.success) throw new Error("Please check the record's required fields, dates and timezone.");
  const payload = parsed.data as unknown as Record<string, unknown>;
  const record: Record<string, unknown> = { id: payload.id, payload };
  async function person(label: unknown, requiredRole?: string) {
    if (!label) return null;
    const query = client.from("pw_profiles").select("id,name,role,status").eq("status", "active");
    // Both existing label fields and explicit profile identifiers are supported.
    const byId = typeof label === "string" && /^[0-9a-f-]{36}$/i.test(label);
    const { data, error } = await (byId ? query.eq("id", label) : query.eq("name", label)).limit(2);
    if (error || data?.length !== 1 || (requiredRole && data[0].role !== requiredRole)) throw new Error("Select one active, authorized staff account. Invite and activate that person first.");
    return data[0];
  }
  if (module === "students") {
    const { data: parent, error } = await client.from("pw_profiles").select("id,name,email,role").eq("email", String(payload.parentEmail).toLowerCase()).single();
    if (error || !parent || parent.role !== "parent") throw new Error("Invite and activate this parent account before enrolling their child.");
    const teacher = await person(payload.teacherName, "teacher");
    const admin = await person(payload.adminName, "admin");
    record.parent_id = parent.id; record.teacher_id = teacher?.id || null; record.admin_id = admin?.id || null;
    payload.parentName = parent.name; payload.parentEmail = parent.email;
    payload.teacherName = teacher?.name || ""; payload.adminName = admin?.name || "";
    // Counters are read-time derivations, never client-controlled attendance.
    payload.lessonsTaken = 0;
  } else if (module === "lessons" || module === "homework") {
    const { data: student, error } = await client.from("pw_students").select("id,parent_id,teacher_id,admin_id,payload").eq("id", payload.studentId).single();
    if (error || !student) throw new Error("The selected child is not accessible.");
    const teacher = await person(payload.teacherName || student.teacher_id, "teacher");
    if (!teacher) throw new Error("Assign an active teacher first.");
    record.student_id = student.id; record.teacher_id = teacher.id;
    payload.studentName = student.payload.name; payload.teacherName = teacher.name;
    if (module === "lessons") {
      const admin = await person(payload.adminName || student.admin_id, "admin");
      record.admin_id = admin?.id || null; payload.adminName = admin?.name || "";
      payload.studentTimezone = student.payload.timezone;
      delete payload.verification; // Database controls the signature.
      if (operation === "insert" && payload.status !== "scheduled") throw new Error("New lessons must start as scheduled.");
      if (payload.requestedSlots && ["parent", "student"].includes(profile.role)) throw new Error("Use the reschedule request workflow; parents cannot move attendance records.");
    } else if (operation === "insert" && payload.status !== "assigned") throw new Error("Homework must start as assigned.");
  } else if (module === "payments") {
    if (operation === "insert") {
      const { data: directory, error } = await client.rpc("pw_billing_directory");
      const students = (directory || []).filter((student: { id: string; name: string }) => student.id === payload.studentName || student.name === payload.studentName);
      if (error || students.length !== 1) throw new Error("Select a uniquely identifiable enrolled child.");
      record.parent_id = students[0].parent_id; record.student_id = students[0].id;
      payload.parentName = students[0].parent_name; payload.studentName = students[0].name;
      if (payload.status !== "due") throw new Error("New invoices must start as due.");
    }
    if (payload.status === "receipt_uploaded" && !payload.receiptPath) throw new Error("An actual receipt upload is required; a filename alone is not a receipt.");
  } else if (module === "payroll") {
    const staff = await person(payload.staffName);
    if (!staff) throw new Error("Select an active staff member.");
    record.staff_id = staff.id; payload.staffName = staff.name; payload.role = staff.role;
    if (operation === "insert") throw new Error("Use verified-attendance payroll generation rather than manual lesson totals.");
  } else if (module === "leads" && operation === "insert") {
    payload.owner = profile.name; payload.arrivedAt = new Date().toISOString();
    payload.status = "new"; delete payload.firstResponseAt;
  }
  return record;
}
