"use client";

import { FileText, LoaderCircle, X } from "lucide-react";
import type { LearningLesson } from "../learning-types";

interface LearningReportsSectionProps {
  selectedLesson: LearningLesson | null;
  reportMonth: string;
  setReportMonth: (month: string) => void;
  reportBusy: "progress" | "birthday" | null;
  reportError: string;
  setReportError: (err: string) => void;
  onDownloadReport: (
    kind: "progress" | "birthday",
    studentId: string,
    month?: string
  ) => void;
}

export default function LearningReportsSection({
  selectedLesson,
  reportMonth,
  setReportMonth,
  reportBusy,
  reportError,
  setReportError,
  onDownloadReport,
}: LearningReportsSectionProps) {
  return (
    <section className="learn-flat-section" aria-labelledby="reports-title">
      <div className="learn-card-head">
        <div>
          <h2 id="reports-title">Student reports</h2>
          <p>
            {selectedLesson
              ? `Private reports for ${selectedLesson.studentName}.`
              : "Choose a lesson above to access its student reports."}
          </p>
        </div>
        <FileText size={17} color="#6a9d7b" aria-hidden="true" />
      </div>

      {selectedLesson ? (
        <div className="learn-card-body">
          <div className="learn-report-row">
            <div className="learn-report-copy">
              <strong>Monthly progress PDF</strong>
              <p>
                Recorded attendance, lesson notes, and monthly homework. No
                evaluation scores are generated.
              </p>
            </div>
            <div className="learn-report-actions">
              <label className="learn-report-month">
                Report month
                <input
                  aria-label="Monthly progress report month"
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="learn-button primary"
                disabled={Boolean(reportBusy) || !reportMonth}
                onClick={() =>
                  onDownloadReport(
                    "progress",
                    selectedLesson.studentId,
                    reportMonth
                  )
                }
              >
                {reportBusy === "progress" ? (
                  <>
                    <LoaderCircle size={14} className="learn-spinning" />{" "}
                    Preparing…
                  </>
                ) : (
                  <>
                    <FileText size={14} /> Download progress
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="learn-report-row">
            <div className="learn-report-copy">
              <strong>Private birthday card PDF</strong>
              <p>
                Download the student birthday card through the private report
                endpoint.
              </p>
            </div>
            <div className="learn-report-actions">
              <button
                type="button"
                className="learn-button"
                disabled={Boolean(reportBusy)}
                onClick={() =>
                  onDownloadReport("birthday", selectedLesson.studentId)
                }
              >
                {reportBusy === "birthday" ? (
                  <>
                    <LoaderCircle size={14} className="learn-spinning" />{" "}
                    Preparing…
                  </>
                ) : (
                  <>
                    <FileText size={14} /> Download birthday card
                  </>
                )}
              </button>
            </div>
          </div>

          {reportError && (
            <div className="learn-alert" role="alert">
              <div>
                <strong>Report download failed</strong>
                <p>{reportError}</p>
              </div>
              <button
                type="button"
                className="learn-button subtle"
                onClick={() => setReportError("")}
                aria-label="Dismiss report error"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="learn-empty">
          <span className="learn-empty-mark">
            <FileText size={17} />
          </span>
          <strong>No student selected</strong>
          <p>Choose a lesson above to request a student-scoped report.</p>
        </div>
      )}
    </section>
  );
}
