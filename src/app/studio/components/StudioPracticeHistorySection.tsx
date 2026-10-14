"use client";

import { Timer } from "lucide-react";
import {
  formatDate,
  formatDuration,
  titleCase,
  type FileRow,
  type PracticeRow,
} from "../studio-types";

export interface StudioPracticeHistorySectionProps {
  practiceList: PracticeRow[];
  files: FileRow[];
  studentTimezone: string;
}

export default function StudioPracticeHistorySection({
  practiceList,
  files,
  studentTimezone,
}: StudioPracticeHistorySectionProps) {
  return (
    <section
      className="studio-flat-section"
      aria-labelledby="practice-history-title"
    >
      <div className="studio-card-head">
        <div>
          <h2 id="practice-history-title">Practice history</h2>
          <p>
            Native session time, quiz score, and private media attached to the
            original practice record.
          </p>
        </div>
        <Timer size={17} color="#6a9d7b" aria-hidden="true" />
      </div>
      {practiceList.length ? (
        <div className="studio-card-body">
          {practiceList.map((row) => {
            const media = files.filter((file) => file.target_id === row.id);
            return (
              <article className="studio-practice-row" key={row.id}>
                <div>
                  <strong>
                    {formatDate(row.started_at, studentTimezone)} ·{" "}
                    {formatDuration(row.seconds)}
                  </strong>
                  <small>
                    {row.ended_at
                      ? `Ended ${formatDate(row.ended_at, studentTimezone)}`
                      : `Session ${row.id}`}
                    {row.game_score !== null && row.game_total !== null
                      ? ` · Saved quiz ${row.game_score}/${row.game_total}`
                      : ""}
                  </small>
                  {media.length > 0 && (
                    <div className="studio-file-links">
                      {media.map((file) => (
                        <div className="studio-file" key={file.id}>
                          <span>
                            {file.original_name} · {file.mime}
                          </span>
                          <a
                            href={`/api/files?id=${encodeURIComponent(
                              file.id
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open private file
                          </a>
                          {file.mime.toLowerCase().startsWith("audio/") && (
                            <audio
                              className="studio-media-preview"
                              src={`/api/files?id=${encodeURIComponent(
                                file.id
                              )}`}
                              controls
                              preload="none"
                            />
                          )}
                          {file.mime.toLowerCase().startsWith("video/") && (
                            <video
                              className="studio-media-preview"
                              src={`/api/files?id=${encodeURIComponent(
                                file.id
                              )}`}
                              controls
                              playsInline
                              preload="none"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`studio-status ${row.status}`}>
                  {titleCase(row.status)}
                </span>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="studio-empty">
          <strong>No saved practice yet</strong>Completed and in-progress
          practice records will appear here after the service returns them.
        </div>
      )}
    </section>
  );
}
