"use client";

import { useState, useCallback } from "react";
import {
  CalendarDays,
  Check,
  FileText,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
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
  const [activeTributeStudentId, setActiveTributeStudentId] = useState<
    string | null
  >(null);
  const [tributeTexts, setTributeTexts] = useState<Record<string, string>>({});
  const [aiTributeLoadingId, setAiTributeLoadingId] = useState<string | null>(
    null
  );
  const [copiedTributeId, setCopiedTributeId] = useState<string | null>(null);

  const generateAiTribute = useCallback(
    async (studentId: string) => {
      setActiveTributeStudentId(studentId);
      if (tributeTexts[studentId]) return;
      setAiTributeLoadingId(studentId);
      setActionError("");
      try {
        const response = await fetch("/api/ai/birthday", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId }),
        });
        const res = await response.json();
        if (!response.ok) throw new Error(res?.error || "AI generation failed");
        const text = (res as { tribute?: string }).tribute;
        if (text) setTributeTexts((prev) => ({ ...prev, [studentId]: text }));
      } catch (e: any) {
        setActionError(e?.message || "Failed to generate AI birthday tribute.");
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
      setTimeout(() => setCopiedTributeId(null), 3000);
    } catch {
      // Fallback
    }
  }, []);

  if (allDueBirthdays.length === 0) return null;

  return (
    <section
      className="studio-card"
      aria-labelledby="birthday-title"
      style={{ marginBottom: 15 }}
    >
      <div className="studio-card-head">
        <div>
          <h2 id="birthday-title">Birthday radar · next 7 days</h2>
          <p>
            Private family report links use the student ID and authenticated
            report endpoint.
          </p>
        </div>
        <CalendarDays size={17} color="#6a9d7b" aria-hidden="true" />
      </div>
      <div className="studio-card-body">
        <div className="studio-birthday-list">
          {allDueBirthdays.map(({ student, days }) => {
            const isSelected = activeTributeStudentId === student.id;
            const tribute = tributeTexts[student.id];
            const isCopied = copiedTributeId === student.id;
            return (
              <div
                className="studio-birthday"
                key={student.id}
                style={{ display: "block" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
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
                      onClick={() => void generateAiTribute(student.id)}
                      disabled={aiTributeLoadingId === student.id}
                    >
                      {aiTributeLoadingId === student.id ? (
                        <>
                          <LoaderCircle size={13} className="spin" />{" "}
                          Generating…
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
                      <FileText size={13} /> Private birthday card PDF
                    </a>
                  </div>
                </div>
                {isSelected && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 14px",
                      background: "#fef9ee",
                      border: "1px solid #fde68a",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#78350f",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Sparkles size={13} color="#d97706" /> AI Birthday
                        Tribute for {studentName(student)}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {tribute && (
                          <>
                            <button
                              type="button"
                              className="family-button primary"
                              style={{
                                padding: "2px 8px",
                                fontSize: 11,
                                background: "#135B45",
                                color: "#ffffff",
                              }}
                              onClick={() => {
                                const targetUrl = `https://wa.me/?text=${encodeURIComponent(
                                  tribute
                                )}`;
                                window.open(
                                  targetUrl,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                                setNotice(
                                  `WhatsApp draft opened for ${studentName(
                                    student
                                  )}. Click Send in WhatsApp.`
                                );
                              }}
                            >
                              Send WhatsApp
                            </button>
                            <button
                              type="button"
                              className="family-button"
                              style={{
                                padding: "2px 8px",
                                fontSize: 11,
                              }}
                              onClick={() =>
                                void copyTribute(student.id, tribute)
                              }
                            >
                              {isCopied ? (
                                <>
                                  <Check size={11} color="#059669" /> Copied!
                                </>
                              ) : (
                                "Copy text"
                              )}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="family-button"
                          style={{
                            padding: "2px 8px",
                            fontSize: 11,
                          }}
                          onClick={() => setActiveTributeStudentId(null)}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    {aiTributeLoadingId === student.id ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 0",
                          color: "#b45309",
                        }}
                      >
                        <LoaderCircle size={14} className="spin" /> Composing
                        personalized musical tribute…
                      </div>
                    ) : tribute ? (
                      <p
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.5,
                          fontStyle: "italic",
                        }}
                      >
                        {tribute}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
