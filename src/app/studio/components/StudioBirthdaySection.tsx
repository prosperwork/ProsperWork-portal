"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  CalendarDays,
  Check,
  Copy,
  FileText,
  LoaderCircle,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { PortalModal } from "@/app/_components/PortalModal";
import { dateOfBirth, studentName, type StudentRow } from "../studio-types";

export interface StudioBirthdaySectionProps {
  allDueBirthdays: { student: StudentRow; days: number }[];
  setNotice: (notice: string) => void;
  setActionError: (error: string) => void;
}

export default function StudioBirthdaySection({
  allDueBirthdays,
  setNotice,
  setActionError,
}: StudioBirthdaySectionProps) {
  const [activeStudent, setActiveStudent] = useState<StudentRow | null>(null);
  const [tributeTexts, setTributeTexts] = useState<Record<string, string>>({});
  const [aiTributeLoadingId, setAiTributeLoadingId] = useState<string | null>(
    null
  );
  const [modalError, setModalError] = useState("");
  const [copiedTributeId, setCopiedTributeId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const openTributeModal = useCallback(
    async (student: StudentRow, forceRegenerate = false) => {
      setActiveStudent(student);
      setModalError("");
      if (tributeTexts[student.id] && !forceRegenerate) return;
      setAiTributeLoadingId(student.id);
      setActionError("");
      try {
        const response = await fetch("/api/ai/birthday", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: student.id }),
        });
        const res = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(res?.error || "Could not generate birthday tribute.");
        const text = (res as { tribute?: string }).tribute;
        if (text) setTributeTexts((prev) => ({ ...prev, [student.id]: text }));
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to generate AI birthday tribute.";
        setModalError(msg);
        setActionError(msg);
      } finally {
        setAiTributeLoadingId(null);
      }
    },
    [tributeTexts, setActionError]
  );

  const copyTribute = useCallback(async (studentId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTributeId(studentId);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedTributeId(null);
        copyTimerRef.current = null;
      }, 3000);
    } catch {
      // Clipboard fallback ignored
    }
  }, []);

  if (allDueBirthdays.length === 0) return null;

  const activeTribute = activeStudent ? tributeTexts[activeStudent.id] : "";
  const isModalLoading = Boolean(
    activeStudent && aiTributeLoadingId === activeStudent.id
  );
  const isCopied = Boolean(
    activeStudent && copiedTributeId === activeStudent.id
  );

  return (
    <>
      <section
        className="studio-card"
        aria-labelledby="birthday-title"
        style={{ marginBottom: 15 }}
      >
        <div className="studio-card-head">
          <div>
            <h2 id="birthday-title">Upcoming birthdays · next 7 days</h2>
            <p>
              Celebrate students with a personalized birthday tribute or
              printable card.
            </p>
          </div>
          <CalendarDays size={17} color="#6a9d7b" aria-hidden="true" />
        </div>
        <div className="studio-card-body">
          <div className="studio-birthday-list">
            {allDueBirthdays.map(({ student, days }) => (
              <div className="studio-birthday" key={student.id}>
                <div>
                  <strong>{studentName(student)}</strong>
                  <small>
                    {days === 0
                      ? "Birthday today"
                      : `In ${days} day${days === 1 ? "" : "s"}`}{" "}
                    · {dateOfBirth(student) ?? "Date on file"}
                  </small>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className="family-button"
                    onClick={() => void openTributeModal(student)}
                    disabled={aiTributeLoadingId === student.id}
                  >
                    {aiTributeLoadingId === student.id ? (
                      <>
                        <LoaderCircle size={13} /> Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} color="#d97706" /> AI Tribute
                      </>
                    )}
                  </button>
                  <a
                    className="family-button"
                    href={`/api/reports?kind=birthday&id=${encodeURIComponent(
                      student.id
                    )}`}
                  >
                    <FileText size={13} /> Birthday card PDF
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PortalModal
        open={Boolean(activeStudent)}
        onClose={() => {
          if (!isModalLoading) setActiveStudent(null);
        }}
        eyebrow="Birthday Celebration"
        title={
          activeStudent
            ? `AI Birthday Tribute for ${studentName(activeStudent)}`
            : "AI Birthday Tribute"
        }
        subtitle="Review, copy, or share this personalized birthday note."
        size="md"
        busy={isModalLoading}
      >
        {activeStudent && (
          <div style={{ display: "grid", gap: 14 }}>
            {modalError && (
              <div className="family-alert" role="alert" style={{ margin: 0 }}>
                <p>{modalError}</p>
              </div>
            )}
            {isModalLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "18px 14px",
                  borderRadius: 10,
                  background: "#fef9ee",
                  border: "1px solid #fde68a",
                  color: "#92400e",
                  fontSize: 13,
                }}
              >
                <LoaderCircle size={16} /> Composing a personalized musical
                birthday tribute…
              </div>
            ) : activeTribute ? (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: "#fef9ee",
                  border: "1px solid #fde68a",
                  color: "#78350f",
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {activeTribute}
              </div>
            ) : null}

            <div className="modal-actions">
              <button
                type="button"
                className="family-button subtle"
                onClick={() => void openTributeModal(activeStudent, true)}
                disabled={isModalLoading}
              >
                <Sparkles size={13} /> Regenerate
              </button>
              {activeTribute && (
                <>
                  <button
                    type="button"
                    className="family-button"
                    onClick={() =>
                      void copyTribute(activeStudent.id, activeTribute)
                    }
                  >
                    {isCopied ? (
                      <>
                        <Check size={13} color="#059669" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={13} /> Copy text
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="family-button primary"
                    onClick={() => {
                      const targetUrl = `https://wa.me/?text=${encodeURIComponent(
                        activeTribute
                      )}`;
                      window.open(targetUrl, "_blank", "noopener,noreferrer");
                      setNotice(
                        `WhatsApp draft opened for ${studentName(
                          activeStudent
                        )}.`
                      );
                    }}
                  >
                    <MessageCircle size={13} /> Send WhatsApp
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </PortalModal>
    </>
  );
}
