"use client";

import { useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import type { AcademyData, Role } from "@/lib/types";
import { roles } from "../../_lib/portal-formatters";

export type FormKind =
  | "student"
  | "lead"
  | "lesson"
  | "payment"
  | "expense"
  | "resource"
  | "homework"
  | "homeworkSubmit"
  | "payroll"
  | "reschedule"
  | "pin"
  | "staff";

export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  full?: boolean;
  placeholder?: string;
};

export function getFields(
  kind: FormKind,
  data: AcademyData,
  role: Role,
  familyName?: string,
  currencyOptions: Field["options"] = []
): Field[] {
  const studentChoices = data.students
    .filter((student) => {
      if (role === "student") return student.id === data.students[0]?.id;
      if (role === "parent") return student.parentName === familyName;
      return true;
    })
    .map((s) => ({ value: s.id, label: `${s.name} · ${s.instrument}` }));
  const staffChoices = data.staff
    .filter((s) => s.status === "active")
    .map((s) => ({ value: s.id, label: s.name }));
  const teacherChoices = data.staff
    .filter((s) => ["teacher", "qc"].includes(s.role) && s.status === "active")
    .map((s) => ({ value: s.id, label: s.name }));
  const adminChoices = data.staff
    .filter((s) => s.role === "admin" && s.status === "active")
    .map((s) => ({ value: s.id, label: s.name }));
  const billingChoices = (data.billingStudents || data.students).map((s) => ({
    value: s.id,
    label: `${s.name} · ${s.parentName}`,
  }));
  switch (kind) {
    case "student":
      return [
        { name: "name", label: "Student full name", required: true },
        { name: "dob", label: "Date of birth", type: "date", required: true },
        { name: "parentName", label: "Parent / guardian", required: true },
        {
          name: "parentEmail",
          label: "Parent email",
          type: "email",
          required: true,
        },
        { name: "instrument", label: "Instrument", required: true },
        {
          name: "teacherName",
          label: "Assigned teacher",
          type: "select",
          options: teacherChoices,
          required: true,
        },
        {
          name: "adminName",
          label: "Assigned admin",
          type: "select",
          options: adminChoices,
          required: true,
        },
        {
          name: "timezone",
          label: "Student timezone",
          required: true,
          placeholder: "Europe/London",
        },
        {
          name: "consent",
          label: "Guardian social-content consent decision",
          type: "select",
          required: true,
          full: true,
          options: [
            { value: "true", label: "Approved for social content" },
            {
              value: "false",
              label: "Private — do not use for social content",
            },
          ],
        },
      ];
    case "lead":
      return [
        { name: "parentName", label: "Parent / guardian", required: true },
        { name: "childName", label: "Child's name", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "phone", label: "Phone", type: "tel", required: true },
        { name: "instrument", label: "Instrument of interest", required: true },
        { name: "source", label: "Enquiry source", required: true },
        { name: "referralFrom", label: "Referral from (if applicable)" },
        {
          name: "preferredSlots",
          label: "Preferred trial slots",
          placeholder: "Separate options with commas",
        },
        {
          name: "notes",
          label: "Notes / next action",
          type: "textarea",
          full: true,
        },
      ];
    case "lesson":
      return [
        {
          name: "studentId",
          label: "Student",
          type: "select",
          options: studentChoices,
          required: true,
        },
        {
          name: "teacherName",
          label: "Teacher",
          type: "select",
          options: teacherChoices,
          required: true,
        },
        {
          name: "adminName",
          label: "Admin usher",
          type: "select",
          options: adminChoices,
          required: true,
        },
        { name: "title", label: "Lesson focus", required: true },
        {
          name: "startsAt",
          label: "Starts at (your local time)",
          type: "datetime-local",
          required: true,
        },
        {
          name: "kind",
          label: "Class type",
          type: "select",
          options: ["standard", "trial", "cover"].map((value) => ({
            value,
            label: value,
          })),
        },
        {
          name: "durationMinutes",
          label: "Individual length (minutes, optional)",
          type: "number",
          placeholder:
            "Leave blank for academy default (normally 60); agreed exception 45–180",
        },
        {
          name: "durationReason",
          label: "Family request / agreement for more than 60 minutes",
          type: "textarea",
          full: true,
        },
        {
          name: "notes",
          label: "Continuity notes",
          type: "textarea",
          full: true,
        },
      ];
    case "payment":
      return [
        { name: "parentName", label: "Parent / guardian", required: true },
        {
          name: "studentName",
          label: "Student",
          type: "select",
          options: billingChoices,
          required: true,
        },
        { name: "amount", label: "Amount", type: "number", required: true },
        {
          name: "currency",
          label: "Currency",
          type: "select",
          options: currencyOptions,
          required: true,
        },
        { name: "dueDate", label: "Due date", type: "date", required: true },
        {
          name: "terms",
          label: "Payment terms",
          type: "select",
          options: [
            { value: "upfront", label: "Upfront" },
            { value: "after_service", label: "After service" },
          ],
        },
        {
          name: "referralDiscount",
          label: "Referral discount",
          type: "number",
        },
      ];
    case "expense":
      return [
        { name: "title", label: "Expense", required: true },
        { name: "category", label: "Category", required: true },
        { name: "amount", label: "Amount", type: "number", required: true },
        {
          name: "currency",
          label: "Currency",
          type: "select",
          options: currencyOptions,
          required: true,
        },
        { name: "date", label: "Date", type: "date", required: true },
      ];
    case "resource":
      return [
        { name: "title", label: "Resource title", required: true },
        {
          name: "type",
          label: "Format",
          type: "select",
          options: ["song", "guide", "exercise", "video"].map((value) => ({
            value,
            label: value,
          })),
          required: true,
        },
        { name: "instrument", label: "Instrument", required: true },
        { name: "level", label: "Level", required: true },
        {
          name: "summary",
          label: "Practice note",
          type: "textarea",
          full: true,
        },
      ];
    case "homework":
      return [
        {
          name: "studentId",
          label: "Student",
          type: "select",
          options: studentChoices,
          required: true,
        },
        { name: "title", label: "Practice assignment", required: true },
        { name: "dueDate", label: "Due date", type: "date", required: true },
        {
          name: "note",
          label: "Teacher guidance",
          type: "textarea",
          full: true,
        },
      ];
    case "homeworkSubmit":
      return [
        {
          name: "practiceNote",
          label: "What did you practise? What felt easy or tricky?",
          type: "textarea",
          required: true,
          full: true,
        },
        {
          name: "mediaName",
          label: "Optional recording / photo",
          type: "file",
          full: true,
        },
      ];
    case "payroll":
      return [
        {
          name: "staffName",
          label: "Staff member",
          type: "select",
          options: staffChoices,
          required: true,
        },
        { name: "role", label: "Payroll role", required: true },
        {
          name: "currency",
          label: "Currency",
          type: "select",
          options: currencyOptions,
          required: true,
        },
        { name: "base", label: "Base rate", type: "number", required: true },
        {
          name: "standardLessons",
          label: "Standard lessons",
          type: "number",
          required: true,
        },
        {
          name: "trialLessons",
          label: "Trial lessons",
          type: "number",
          required: true,
        },
        {
          name: "coverLessons",
          label: "Cover lessons",
          type: "number",
          required: true,
        },
        { name: "bonus", label: "Bonus", type: "number" },
        { name: "deduction", label: "Adjustment / deduction", type: "number" },
        {
          name: "deductionReason",
          label: "Reason required for any adjustment",
          type: "textarea",
          full: true,
        },
      ];
    case "reschedule":
      return [
        {
          name: "studentId",
          label: "Child",
          type: "select",
          options: studentChoices,
          required: true,
        },
        {
          name: "preferredSlots",
          label: "Requested alternative times",
          type: "textarea",
          required: true,
          full: true,
          placeholder: "Example: Thursday 4:30pm London time",
        },
      ];
    case "pin":
      return [
        {
          name: "pin",
          label: "Choose a 4–8 digit PIN",
          type: "password",
          required: true,
          placeholder: "At least 4 digits",
        },
        {
          name: "confirmPin",
          label: "Confirm PIN",
          type: "password",
          required: true,
        },
      ];
    case "staff":
      return [
        { name: "name", label: "Applicant / staff name", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        {
          name: "role",
          label: "Position",
          type: "select",
          options: roles
            .filter(
              (item) =>
                !["super_admin", "general_manager", "social_media"].includes(
                  item.id
                )
            )
            .map((item) => ({ value: item.id, label: item.label })),
          required: true,
        },
        { name: "department", label: "Department", required: true },
        {
          name: "timezone",
          label: "Timezone",
          required: true,
          placeholder: "Africa/Lagos",
        },
      ];
  }
}

export default function ActionModal({
  title,
  subtitle,
  fields,
  onClose,
  onSubmit,
  submitLabel = "Save to academy",
}: {
  title: string;
  subtitle: string;
  fields: Field[];
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
  submitLabel?: string;
}) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: Record<string, string> = {};
    fields.forEach((field) => {
      if (field.type === "checkbox")
        values[field.name] = String(form.get(field.name) === "on");
      else if (field.type === "file")
        values[field.name] = (form.get(field.name) as File)?.name || "";
      else values[field.name] = String(form.get(field.name) || "");
    });
    if (values.pin && (values.pin.length < 4 || !/^\d+$/.test(values.pin))) {
      setError("Use 4–8 digits for the Kid Mode PIN.");
      return;
    }
    if (values.pin && values.pin !== values.confirmPin) {
      setError("The PIN entries do not match.");
      return;
    }
    if (
      values.deduction &&
      Number(values.deduction) > 0 &&
      !values.deductionReason.trim()
    ) {
      setError("A reason is required for every payroll adjustment.");
      return;
    }
    setError("");
    onSubmit(values);
  }
  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="modal-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {fields.map((field) => (
              <div
                className={`field ${field.full ? "full" : ""}`}
                key={field.name}
              >
                {field.type === "checkbox" ? (
                  <label className="check-field">
                    <input
                      type="checkbox"
                      name={field.name}
                      required={field.required}
                    />{" "}
                    {field.label}
                  </label>
                ) : (
                  <>
                    <label htmlFor={`f-${field.name}`}>
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    {field.type === "textarea" ? (
                      <textarea
                        id={`f-${field.name}`}
                        name={field.name}
                        required={field.required}
                        placeholder={field.placeholder}
                      />
                    ) : field.type === "select" ? (
                      <select
                        id={`f-${field.name}`}
                        name={field.name}
                        required={field.required}
                      >
                        <option value="">Select…</option>
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`f-${field.name}`}
                        name={field.name}
                        type={field.type || "text"}
                        required={field.required}
                        placeholder={field.placeholder}
                        min={field.type === "number" ? "0" : undefined}
                        step={field.type === "number" ? "any" : undefined}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn">
              <Check size={14} />
              {submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
