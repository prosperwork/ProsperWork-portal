"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Lesson } from "@/lib/types";
import { niceDate, timeAt } from "../../_lib/portal-formatters";

export type ManagementStaffOption = {
  id: string;
  name: string;
  role: string;
  status: string;
};

export default function EmergencyCoverModal({
  lesson,
  managementStaff,
  onClose,
  onSuccess,
}: {
  lesson: Lesson;
  managementStaff: ManagementStaffOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [coverTeacherId, setCoverTeacherId] = useState("");
  const [coverAdminId, setCoverAdminId] = useState("");
  const [coverReason, setCoverReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!coverTeacherId || !coverAdminId) return;
    if (coverReason.trim().length < 5) {
      setError("A written reason of at least 5 characters is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/management", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "emergency_cover",
          lessonId: lesson.id,
          teacherId: coverTeacherId,
          adminId: coverAdminId,
          notes: coverReason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error)
        throw new Error(data.error || "Could not reassign emergency cover.");
      onSuccess();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Emergency cover could not be assigned."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overlay">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="emergency-cover-title"
        style={{ maxWidth: 520 }}
      >
        <div className="modal-head">
          <div>
            <h2 id="emergency-cover-title">Same-day Emergency Cover</h2>
            <p>
              Reassign {lesson.studentName}’s lesson (
              {niceDate(lesson.startsAt)} at {timeAt(lesson.startsAt)}) on short
              notice.
            </p>
          </div>
          <button
            className="close-btn"
            aria-label="Cancel"
            onClick={onClose}
            disabled={loading}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 8,
            padding: "8px 12px",
            color: "#9a3412",
            marginBottom: 14,
          }}
        >
          <strong>Continuity Safeguard:</strong> The student’s permanent teacher
          assignment remains unchanged in their dossier. This class is converted
          to a cover-rate lesson, granting the replacement teacher immediate
          classroom and lesson board access.
        </div>

        {error && (
          <div role="alert" className="form-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="cover-teacher">Cover Teacher / QC Tutor *</label>
              <select
                id="cover-teacher"
                required
                value={coverTeacherId}
                onChange={(e) => setCoverTeacherId(e.target.value)}
                disabled={loading}
              >
                <option value="">Select an active cover teacher…</option>
                {managementStaff
                  .filter(
                    (s) =>
                      s.status === "active" &&
                      ["teacher", "qc"].includes(s.role) &&
                      s.name !== lesson.teacherName
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role === "qc" ? "QC Tutor" : "Teacher"})
                    </option>
                  ))}
              </select>
            </div>

            <div className="field full">
              <label htmlFor="cover-admin">Coordinating Usher / Admin *</label>
              <select
                id="cover-admin"
                required
                value={coverAdminId}
                onChange={(e) => setCoverAdminId(e.target.value)}
                disabled={loading}
              >
                <option value="">Select active coordinating admin…</option>
                {managementStaff
                  .filter(
                    (s) =>
                      s.status === "active" &&
                      ["admin", "head_admin", "super_admin"].includes(s.role)
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role.replace("_", " ")})
                    </option>
                  ))}
              </select>
            </div>

            <div className="field full">
              <label htmlFor="cover-reason">Reason for Same-Day Cover *</label>
              <textarea
                id="cover-reason"
                required
                minLength={5}
                maxLength={1000}
                value={coverReason}
                onChange={(e) => setCoverReason(e.target.value)}
                placeholder="e.g. Teacher unwell with 1 hour's notice; reassigned to cover tutor."
                disabled={loading}
              />
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button
              className="btn ghost"
              type="button"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className="btn"
              type="submit"
              disabled={loading || !coverTeacherId || !coverAdminId}
              style={{ background: "#ea580c", borderColor: "#c2410c" }}
            >
              {loading ? "Assigning cover…" : "Assign Emergency Cover"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
