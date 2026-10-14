"use client";

import {
  AlertTriangle,
  BookOpen,
  CircleHelp,
  FileText,
  LoaderCircle,
  Plus,
  Save,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import type { ResourceDraft, ResourceRow } from "../learning-types";

interface LearningResourcesSectionProps {
  canReadResources: boolean;
  canEditResources: boolean;
  resourceFilter: string;
  setResourceFilter: (filter: string) => void;
  visibleResources: ResourceRow[];
  onOpenCreate: () => void;
  onOpenEdit: (row: ResourceRow) => void;
  onSetArchiveTarget: (row: ResourceRow | null) => void;
  modalOpen: boolean;
  editingResource: ResourceRow | null;
  resourceDraft: ResourceDraft;
  setResourceDraft: (draft: ResourceDraft) => void;
  pendingFile: File | null;
  setPendingFile: (file: File | null) => void;
  resourceBusy: boolean;
  resourceError: string;
  onCloseResourceModal: () => void;
  onSubmitResource: (e: FormEvent<HTMLFormElement>) => void;
  archiveTarget: ResourceRow | null;
  archiving: boolean;
  onArchiveResource: () => void;
}

export default function LearningResourcesSection({
  canReadResources,
  canEditResources,
  resourceFilter,
  setResourceFilter,
  visibleResources,
  onOpenCreate,
  onOpenEdit,
  onSetArchiveTarget,
  modalOpen,
  editingResource,
  resourceDraft,
  setResourceDraft,
  pendingFile,
  setPendingFile,
  resourceBusy,
  resourceError,
  onCloseResourceModal,
  onSubmitResource,
  archiveTarget,
  archiving,
  onArchiveResource,
}: LearningResourcesSectionProps) {
  if (!canReadResources) {
    return (
      <section className="learn-flat-section">
        <div className="learn-empty">
          <span className="learn-empty-mark">
            <BookOpen size={17} />
          </span>
          <strong>Curriculum access is not available</strong>
          <p>Curriculum visibility follows your academy role.</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section
        className="learn-flat-section"
        aria-labelledby="curriculum-title"
      >
        <div className="learn-card-head">
          <div>
            <h2 id="curriculum-title">Curriculum library</h2>
            <p>Learning material shared with the right academy audience.</p>
          </div>
          <BookOpen size={17} color="#6a9d7b" aria-hidden="true" />
        </div>

        <div className="learn-resource-toolbar">
          <label className="learn-visually-hidden" htmlFor="resource-filter">
            Filter curriculum
          </label>
          <input
            id="resource-filter"
            className="learn-field-input"
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            placeholder="Find a resource…"
            style={{
              width: "min(300px,100%)",
              minHeight: 35,
              border: "1px solid #dce7df",
              borderRadius: 8,
              padding: "0 10px",
              fontSize: 10,
            }}
          />
          {canEditResources && (
            <button
              type="button"
              className="learn-button primary"
              onClick={onOpenCreate}
            >
              <Plus size={14} /> Add resource
            </button>
          )}
        </div>

        <div className="learn-resource-list">
          {visibleResources.length ? (
            visibleResources.map((row) => (
              <article className="learn-resource" key={row.payload.id}>
                <div>
                  <div className="learn-resource-title">
                    <FileText size={15} color="#6a9d7b" aria-hidden="true" />
                    <h3>{row.payload.title}</h3>
                  </div>
                  <p>{row.payload.summary || "No description added."}</p>
                  <div className="learn-resource-meta">
                    <span className="learn-chip">{row.payload.type}</span>
                    <span className="learn-chip">{row.payload.instrument}</span>
                    <span className="learn-chip">{row.payload.level}</span>
                    {row.payload.fileName && (
                      <span className="learn-chip">{row.payload.fileName}</span>
                    )}
                  </div>
                  {row.payload.fileId && (
                    <a
                      className="learn-button"
                      href={`/api/files?id=${encodeURIComponent(
                        row.payload.fileId
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ marginTop: 9, textDecoration: "none" }}
                    >
                      <FileText size={13} /> Open attachment
                    </a>
                  )}
                </div>
                {canEditResources && (
                  <div className="learn-resource-actions">
                    <button
                      type="button"
                      className="learn-button subtle"
                      onClick={() => onOpenEdit(row)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="learn-button danger"
                      onClick={() => onSetArchiveTarget(row)}
                    >
                      Archive
                    </button>
                  </div>
                )}
              </article>
            ))
          ) : (
            <div className="learn-empty">
              <span className="learn-empty-mark">
                <CircleHelp size={17} />
              </span>
              <strong>
                {resourceFilter
                  ? "No matching resources"
                  : "Curriculum is ready to grow"}
              </strong>
              <p>
                {resourceFilter
                  ? "Try a different title, instrument, type, or level."
                  : canEditResources
                  ? "Create the first resource for students and teachers to use."
                  : "There are no curriculum resources available in this view yet."}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Resource Edit / Create Modal */}
      {modalOpen && (
        <div
          className="learn-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onCloseResourceModal();
          }}
        >
          <section
            className="learn-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-dialog-title"
          >
            <div className="learn-modal-head">
              <div>
                <h2 id="resource-dialog-title">
                  {editingResource
                    ? "Edit curriculum resource"
                    : "Add curriculum resource"}
                </h2>
                <p>Changes are saved to the academy curriculum.</p>
              </div>
              <button
                type="button"
                className="learn-button subtle"
                onClick={onCloseResourceModal}
                aria-label="Close dialog"
                disabled={resourceBusy}
              >
                <X size={15} />
              </button>
            </div>
            <form className="learn-modal-body" onSubmit={onSubmitResource}>
              {resourceError && (
                <div className="learn-alert" role="alert">
                  <AlertTriangle size={16} />
                  <p>{resourceError}</p>
                </div>
              )}
              <div className="learn-modal-grid">
                <div className="learn-field">
                  <label htmlFor="resource-title">Title</label>
                  <input
                    id="resource-title"
                    required
                    maxLength={120}
                    value={resourceDraft.title}
                    onChange={(e) =>
                      setResourceDraft({
                        ...resourceDraft,
                        title: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="learn-field">
                  <label htmlFor="resource-type">Type</label>
                  <select
                    id="resource-type"
                    value={resourceDraft.type}
                    onChange={(e) =>
                      setResourceDraft({
                        ...resourceDraft,
                        type: e.target.value as ResourceDraft["type"],
                      })
                    }
                  >
                    <option value="song">Song</option>
                    <option value="guide">Guide</option>
                    <option value="exercise">Exercise</option>
                    <option value="video">Video</option>
                  </select>
                </div>
                <div className="learn-field">
                  <label htmlFor="resource-instrument">Instrument</label>
                  <input
                    id="resource-instrument"
                    required
                    maxLength={120}
                    value={resourceDraft.instrument}
                    onChange={(e) =>
                      setResourceDraft({
                        ...resourceDraft,
                        instrument: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="learn-field">
                  <label htmlFor="resource-level">Level</label>
                  <input
                    id="resource-level"
                    required
                    maxLength={120}
                    value={resourceDraft.level}
                    onChange={(e) =>
                      setResourceDraft({
                        ...resourceDraft,
                        level: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="learn-field">
                <label htmlFor="resource-summary">Description</label>
                <textarea
                  id="resource-summary"
                  maxLength={4000}
                  value={resourceDraft.summary}
                  onChange={(e) =>
                    setResourceDraft({
                      ...resourceDraft,
                      summary: e.target.value,
                    })
                  }
                  placeholder="What should a learner know before using this?"
                />
              </div>
              <div className="learn-field">
                <label htmlFor="resource-file">
                  Attach a file{" "}
                  {editingResource?.payload.fileName
                    ? `· current: ${editingResource.payload.fileName}`
                    : ""}
                </label>
                <input
                  id="resource-file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.mp4,.webm,.mp3,.wav,.ogg,application/pdf,image/png,image/jpeg,video/mp4,video/webm,audio/mpeg,audio/wav,audio/x-wav,audio/ogg"
                  onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                />
                <small>
                  A new attachment is uploaded after the resource saves. Leaving
                  this blank keeps any existing attachment.
                </small>
              </div>
              <p className="learn-file-help">
                PDF, PNG, JPEG, MP4, WebM, MP3, WAV, or OGG · maximum 50 MiB.
                Files are attached to the saved resource.
              </p>
              <div className="learn-modal-actions">
                <button
                  type="button"
                  className="learn-button subtle"
                  onClick={onCloseResourceModal}
                  disabled={resourceBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="learn-button primary"
                  disabled={resourceBusy}
                >
                  {resourceBusy ? (
                    <>
                      <LoaderCircle size={14} className="learn-spinning" />{" "}
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save size={14} />{" "}
                      {pendingFile ? "Save & upload" : "Save resource"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Resource Archive Modal */}
      {archiveTarget && (
        <div
          className="learn-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !archiving)
              onSetArchiveTarget(null);
          }}
        >
          <section
            className="learn-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="archive-title"
            aria-describedby="archive-description"
          >
            <div className="learn-modal-head">
              <div>
                <h2 id="archive-title">Archive this resource?</h2>
                <p id="archive-description">
                  {archiveTarget.payload.title} will be removed from the active
                  curriculum. This action requires a current resource revision.
                </p>
              </div>
              <AlertTriangle size={20} color="#a84d47" aria-hidden="true" />
            </div>
            <div className="learn-modal-body">
              <div className="learn-modal-actions">
                <button
                  type="button"
                  className="learn-button subtle"
                  onClick={() => onSetArchiveTarget(null)}
                  disabled={archiving}
                >
                  Keep resource
                </button>
                <button
                  type="button"
                  className="learn-button danger"
                  onClick={onArchiveResource}
                  disabled={archiving}
                >
                  {archiving ? "Archiving…" : "Confirm archive"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
