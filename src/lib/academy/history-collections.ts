const payloadSearch = ["name", "title", "studentName", "parentName", "staffName", "notes", "summary", "email", "status"].map(key => `payload->>${key}`);
export const historyCollections: Record<string, { label: string; date: string; search: string[] }> = {
  students: { label: "Students", date: "created_at", search: payloadSearch },
  lessons: { label: "Lessons", date: "created_at", search: payloadSearch },
  leads: { label: "Leads", date: "created_at", search: payloadSearch },
  payments: { label: "Payments", date: "created_at", search: payloadSearch },
  resources: { label: "Curriculum resources", date: "created_at", search: payloadSearch },
  homework: { label: "Homework", date: "created_at", search: payloadSearch },
  expenses: { label: "Expenses", date: "created_at", search: payloadSearch },
  audit: { label: "Audit trail", date: "created_at", search: ["action", "actor_name", "entity_type", "entity_id"] },
  practice: { label: "Practice sessions", date: "started_at", search: ["status"] },
  learning_requests: { label: "Studio requests", date: "created_at", search: ["body", "kind", "status"] },
  learning_replies: { label: "Studio replies", date: "created_at", search: ["body"] },
  evaluations: { label: "Educator evaluations", date: "created_at", search: ["title", "notes"] },
  repertoire_events: { label: "Repertoire history", date: "created_at", search: ["song", "action"] },
  salary_batches: { label: "Salary batches", date: "created_at", search: ["status"] },
  salary_rates: { label: "Salary rate history", date: "created_at", search: ["reason", "status"] },
  salary_statements: { label: "Salary statements", date: "created_at", search: ["staff_name", "role", "currency"] },
};
