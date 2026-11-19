"use client";

import { useState, useMemo, type FormEvent } from "react";
import { ShieldCheck, Trash2, Plus, CheckSquare, Square } from "lucide-react";
import { useRoles } from "@/lib/academy/use-academy-config";
import {
  CAPABILITY_PERMISSIONS,
  WORKSPACE_PERMISSIONS,
  type RoleRow,
} from "@/lib/academy/roles";
import { readJson } from "@/lib/academy/web-client";
import { useConfirmModal } from "@/app/_components/ConfirmModal";

type RoleDraft = {
  code: string;
  label: string;
  department: string;
  is_system: boolean;
  is_staff: boolean;
  invitable: boolean;
  enabled: boolean;
  permissions: string[];
  isNew: boolean;
};

function emptyDraft(): RoleDraft {
  return {
    code: "",
    label: "",
    department: "General",
    is_system: false,
    is_staff: true,
    invitable: true,
    enabled: true,
    permissions: ["workspace.overview", "workspace.manual"],
    isNew: true,
  };
}

function toDraft(row: RoleRow): RoleDraft {
  return {
    code: row.code,
    label: row.label,
    department: row.department,
    is_system: row.is_system,
    is_staff: row.is_staff,
    invitable: row.invitable,
    enabled: row.enabled,
    permissions: [...row.permissions],
    isNew: false,
  };
}

export default function RolePermissionsSettings({ role }: { role: string }) {
  const { roles, loading, error: loadError, reload } = useRoles();
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { confirm, ConfirmDialog } = useConfirmModal();

  const activeDraft = draft ?? (roles[0] ? toDraft(roles[0]) : null);
  const isOwnerRole = activeDraft?.code === "super_admin";

  const originalRole = useMemo(() => {
    if (!activeDraft || activeDraft.isNew) return null;
    return roles.find((r) => r.code === activeDraft.code) || null;
  }, [activeDraft, roles]);

  const isDirty = useMemo(() => {
    if (!activeDraft) return false;
    if (activeDraft.isNew) {
      return (
        activeDraft.code.trim() !== "" ||
        activeDraft.label.trim() !== "" ||
        activeDraft.department !== "General" ||
        JSON.stringify(activeDraft.permissions.slice().sort()) !== JSON.stringify(["workspace.manual", "workspace.overview"].sort())
      );
    }
    if (!originalRole) return false;
    if (activeDraft.label !== originalRole.label) return true;
    if (activeDraft.department !== originalRole.department) return true;
    if (activeDraft.is_staff !== originalRole.is_staff) return true;
    if (activeDraft.invitable !== originalRole.invitable) return true;
    if (activeDraft.enabled !== originalRole.enabled) return true;
    if (activeDraft.permissions.length !== originalRole.permissions.length) return true;
    const origSet = new Set(originalRole.permissions);
    return activeDraft.permissions.some((p) => !origSet.has(p));
  }, [activeDraft, originalRole]);

  if (role !== "super_admin" && role !== "owner") return null;

  function selectRole(r: RoleRow) {
    if (activeDraft?.code === r.code) return;
    const proceed = () => {
      setError("");
      setNotice("");
      setDraft(toDraft(r));
    };
    if (isDirty) {
      confirm({
        title: "Discard unsaved role changes?",
        message: `You have unsaved edits on "${activeDraft?.label}". Do you want to discard them?`,
        confirmLabel: "Discard edits",
        tone: "warning",
        onConfirm: proceed,
      });
      return;
    }
    proceed();
  }

  function handleNewRole() {
    if (activeDraft?.isNew) return;
    const proceed = () => {
      setError("");
      setNotice("");
      setDraft(emptyDraft());
    };
    if (isDirty) {
      confirm({
        title: "Discard unsaved role changes?",
        message: `You have unsaved edits on "${activeDraft?.label}". Do you want to discard them?`,
        confirmLabel: "Discard edits",
        tone: "warning",
        onConfirm: proceed,
      });
      return;
    }
    proceed();
  }

  function togglePermission(key: string) {
    if (!activeDraft) return;
    const set = new Set(activeDraft.permissions);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    setDraft({ ...activeDraft, permissions: Array.from(set) });
  }

  function setGroupPermissions(keys: string[], checked: boolean) {
    if (!activeDraft) return;
    const set = new Set(activeDraft.permissions);
    for (const key of keys) {
      if (checked) set.add(key);
      else set.delete(key);
    }
    setDraft({ ...activeDraft, permissions: Array.from(set) });
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeDraft) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/roles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          code: activeDraft.code.trim().toLowerCase(),
          label: activeDraft.label.trim(),
          department: activeDraft.department.trim(),
          isStaff: activeDraft.is_staff,
          invitable: activeDraft.invitable,
          enabled: activeDraft.enabled,
          permissions: activeDraft.permissions,
        }),
      });
      const result = await readJson<{ ok?: boolean; error?: string; roles?: RoleRow[] }>(response);
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Role could not be saved.");
      }
      await reload();
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pw-academy-config-updated"));
      const updated = result.roles?.find((r) => r.code === activeDraft.code.trim().toLowerCase());
      if (updated) setDraft(toDraft(updated));
      setNotice(`Saved role "${activeDraft.label.trim()}" and reloaded permissions from the database.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Role could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function requestDelete(target: RoleDraft) {
    confirm({
      title: `Delete custom role "${target.label}"?`,
      message: `This permanently removes role code "${target.code}". Deletion is blocked if any portal account is still assigned to this role.`,
      confirmLabel: "Delete role",
      tone: "danger",
      onConfirm: async () => {
        setBusy(true);
        setError("");
        setNotice("");
        try {
          const response = await fetch("/api/roles", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", code: target.code }),
          });
          const result = await readJson<{ ok?: boolean; error?: string }>(response);
          if (!response.ok || !result.ok) {
            throw new Error(result.error || "Role could not be deleted.");
          }
          await reload();
          if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pw-academy-config-updated"));
          setDraft(null);
          setNotice(`Deleted custom role "${target.code}".`);
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <section className="ps-finance-settings" aria-labelledby="roles-settings-heading">
      <header className="ps-finance-heading">
        <h2 id="roles-settings-heading">Roles &amp; permissions registry</h2>
        <p>
          All workspace navigation, API capability checks, and account invitation roles are loaded from
          the database. Customize built-in role permissions or create new academy roles without touching code.
        </p>
      </header>

      {(error || loadError) && (
        <p className="ps-finance-message error" role="alert">
          {error || loadError}
        </p>
      )}
      {notice && (
        <p className="ps-finance-message success" role="status">
          {notice}
        </p>
      )}

      <section className="ps-finance-subsection" aria-labelledby="roles-catalog-heading">
        <div className="ps-finance-subhead">
          <div>
            <h3 id="roles-catalog-heading">Configured roles ({roles.length})</h3>
            <p>Select a role to edit its display title, invitation status, and permissions.</p>
          </div>
          <button
            className="ps-outline"
            type="button"
            onClick={() => void handleNewRole()}
          >
            <Plus size={14} /> New custom role
          </button>
        </div>

        {loading && roles.length === 0 ? (
          <p className="ps-finance-note">Loading roles from database…</p>
        ) : (
          <div className="ps-currency-list">
            {roles.map((r) => (
              <button
                key={r.code}
                type="button"
                className={`ps-currency-option${activeDraft && !activeDraft.isNew && activeDraft.code === r.code ? " selected" : ""}`}
                aria-pressed={Boolean(activeDraft && !activeDraft.isNew && activeDraft.code === r.code)}
                onClick={() => void selectRole(r)}
              >
                {r.label}
                <span>{r.code}</span>
                <small>{r.enabled ? `${r.permissions.length} perms` : "Disabled"}</small>
              </button>
            ))}
          </div>
        )}

        {activeDraft && (
          <form className="ps-finance-form" onSubmit={saveRole}>
            <div className="ps-finance-subhead form-heading">
              <div>
                <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {activeDraft.isNew
                    ? "Create custom role"
                    : `Edit role: ${activeDraft.label} (${activeDraft.code})`}
                  {isDirty && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: "#fef3c7",
                        color: "#92400e",
                        border: "1px solid #fde68a",
                      }}
                    >
                      Unsaved changes
                    </span>
                  )}
                </h3>
                <p>
                  {isOwnerRole
                    ? "Super Admin always retains Settings & Accounts access to prevent owner lockout."
                    : activeDraft.is_system
                      ? "Built-in system role — label, department, and permissions are fully editable."
                      : "Custom role — can be invited, assigned, disabled, or deleted when unassigned."}
                </p>
              </div>
              {!activeDraft.isNew && !activeDraft.is_system && (
                <button
                  className="ps-outline ps-danger-outline"
                  type="button"
                  disabled={busy}
                  onClick={() => requestDelete(activeDraft)}
                >
                  <Trash2 size={14} /> Delete role
                </button>
              )}
            </div>

            <div className="ps-finance-fields three">
              <label className="ps-finance-field">
                Role code (slug)
                <input
                  required
                  pattern="[a-z][a-z0-9_]{1,40}"
                  maxLength={41}
                  disabled={!activeDraft.isNew}
                  placeholder="e.g. exam_coordinator"
                  value={activeDraft.code}
                  onChange={(e) =>
                    setDraft({
                      ...activeDraft,
                      code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    })
                  }
                />
              </label>
              <label className="ps-finance-field">
                Display label
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="e.g. Exam Coordinator"
                  value={activeDraft.label}
                  onChange={(e) => setDraft({ ...activeDraft, label: e.target.value })}
                />
              </label>
              <label className="ps-finance-field">
                Department
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="e.g. Academic Operations"
                  value={activeDraft.department}
                  onChange={(e) => setDraft({ ...activeDraft, department: e.target.value })}
                />
              </label>
            </div>

            <div className="ps-role-flags">
              <label className="ps-finance-check">
                <input
                  type="checkbox"
                  checked={activeDraft.is_staff}
                  disabled={isOwnerRole}
                  onChange={(e) => setDraft({ ...activeDraft, is_staff: e.target.checked })}
                />
                Internal staff role (grants staff classroom &amp; portal context)
              </label>
              <label className="ps-finance-check">
                <input
                  type="checkbox"
                  checked={activeDraft.invitable}
                  disabled={isOwnerRole}
                  onChange={(e) => setDraft({ ...activeDraft, invitable: e.target.checked })}
                />
                Available in Accounts &amp; Hiring invitation dropdowns
              </label>
              <label className="ps-finance-check">
                <input
                  type="checkbox"
                  checked={activeDraft.enabled}
                  disabled={isOwnerRole}
                  onChange={(e) => setDraft({ ...activeDraft, enabled: e.target.checked })}
                />
                Role enabled
              </label>
            </div>

            <div className="ps-perm-section">
              <div className="ps-perm-section-head">
                <strong>
                  <ShieldCheck size={14} /> Workspace navigation access
                </strong>
                <div className="ps-perm-bulk">
                  <button
                    type="button"
                    className="ps-text-button"
                    onClick={() =>
                      setGroupPermissions(
                        WORKSPACE_PERMISSIONS.map((p) => p.key),
                        true,
                      )
                    }
                  >
                    <CheckSquare size={12} /> Select all
                  </button>
                  <button
                    type="button"
                    className="ps-text-button"
                    disabled={isOwnerRole}
                    onClick={() =>
                      setGroupPermissions(
                        WORKSPACE_PERMISSIONS.map((p) => p.key),
                        false,
                      )
                    }
                  >
                    <Square size={12} /> Clear
                  </button>
                </div>
              </div>
              <div className="ps-perm-grid">
                {WORKSPACE_PERMISSIONS.map((perm) => (
                  <label key={perm.key} className="ps-perm-item" title={perm.description}>
                    <input
                      type="checkbox"
                      checked={activeDraft.permissions.includes(perm.key)}
                      disabled={
                        isOwnerRole &&
                        (perm.key === "workspace.settings" || perm.key === "workspace.accounts")
                      }
                      onChange={() => togglePermission(perm.key)}
                    />
                    <span>
                      <b>{perm.label}</b>
                      <small>{perm.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="ps-perm-section">
              <div className="ps-perm-section-head">
                <strong>
                  <ShieldCheck size={14} /> API &amp; operational capabilities
                </strong>
                <div className="ps-perm-bulk">
                  <button
                    type="button"
                    className="ps-text-button"
                    onClick={() =>
                      setGroupPermissions(
                        CAPABILITY_PERMISSIONS.map((p) => p.key),
                        true,
                      )
                    }
                  >
                    <CheckSquare size={12} /> Select all
                  </button>
                  <button
                    type="button"
                    className="ps-text-button"
                    disabled={isOwnerRole}
                    onClick={() =>
                      setGroupPermissions(
                        CAPABILITY_PERMISSIONS.map((p) => p.key),
                        false,
                      )
                    }
                  >
                    <Square size={12} /> Clear
                  </button>
                </div>
              </div>
              <div className="ps-perm-grid">
                {CAPABILITY_PERMISSIONS.map((perm) => (
                  <label key={perm.key} className="ps-perm-item" title={perm.description}>
                    <input
                      type="checkbox"
                      checked={activeDraft.permissions.includes(perm.key)}
                      disabled={
                        isOwnerRole &&
                        (perm.key === "accounts.view" || perm.key === "accounts.manage")
                      }
                      onChange={() => togglePermission(perm.key)}
                    />
                    <span>
                      <b>{perm.label}</b>
                      <small>{perm.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="ps-finance-actions">
              <button className="ps-primary" type="submit" disabled={busy || !isDirty}>
                {busy ? "Saving…" : activeDraft.isNew ? "Create role" : "Save role permissions"}
              </button>
            </div>
          </form>
        )}
      </section>
      <ConfirmDialog />
    </section>
  );
}
