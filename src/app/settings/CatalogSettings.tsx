"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCatalogs } from "@/lib/academy/use-academy-config";
import { CATALOG_META, type CatalogItemRow, type CatalogKey } from "@/lib/academy/catalogs";
import { readJson } from "@/lib/academy/web-client";
import { useConfirmModal } from "@/app/_components/ConfirmModal";

type ItemDraft = {
  code: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  isNew: boolean;
};

function emptyItem(nextOrder: number): ItemDraft {
  return {
    code: "",
    label: "",
    sortOrder: nextOrder,
    enabled: true,
    isNew: true,
  };
}

export default function CatalogSettings({ role }: { role: string }) {
  const { allByCatalog, loading, error: loadError, reload } = useCatalogs();
  const [activeCatalog, setActiveCatalog] = useState<CatalogKey>("instruments");
  const [draft, setDraft] = useState<ItemDraft>(emptyItem(130));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { confirm, ConfirmDialog } = useConfirmModal();

  if (role !== "super_admin") return null;

  const meta = CATALOG_META.find((c) => c.key === activeCatalog) || CATALOG_META[0];
  const currentItems = allByCatalog(activeCatalog);

  const isDirty = useMemo(() => {
    if (draft.isNew) {
      return draft.code.trim() !== "" || draft.label.trim() !== "";
    }
    const orig = currentItems.find((i) => i.code === draft.code);
    if (!orig) return false;
    return (
      draft.label !== orig.label ||
      draft.sortOrder !== orig.sort_order ||
      draft.enabled !== orig.enabled
    );
  }, [draft, currentItems]);

  function selectCatalog(key: CatalogKey) {
    if (activeCatalog === key) return;
    const proceed = () => {
      setActiveCatalog(key);
      const items = allByCatalog(key);
      const maxOrder = items.reduce((max, item) => Math.max(max, item.sort_order), 0);
      setDraft(emptyItem(maxOrder + 10));
      setError("");
      setNotice("");
    };
    if (isDirty) {
      confirm({
        title: "Discard unsaved catalog item?",
        message: "You have unsaved edits on the current item. Do you want to discard them?",
        confirmLabel: "Discard edits",
        tone: "warning",
        onConfirm: proceed,
      });
      return;
    }
    proceed();
  }

  function editItem(item: CatalogItemRow) {
    if (!draft.isNew && draft.code === item.code) return;
    const proceed = () => {
      setDraft({
        code: item.code,
        label: item.label,
        sortOrder: item.sort_order,
        enabled: item.enabled,
        isNew: false,
      });
      setError("");
      setNotice("");
    };
    if (isDirty) {
      confirm({
        title: "Discard unsaved catalog item?",
        message: "You have unsaved edits on the current item. Do you want to discard them?",
        confirmLabel: "Discard edits",
        tone: "warning",
        onConfirm: proceed,
      });
      return;
    }
    proceed();
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const codeVal =
        activeCatalog === "complaint_categories"
          ? draft.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_")
          : draft.code.trim();
      const response = await fetch("/api/catalogs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          catalog: activeCatalog,
          code: codeVal,
          label: draft.label.trim() || codeVal,
          sortOrder: Number.isFinite(draft.sortOrder) ? draft.sortOrder : 100,
          enabled: draft.enabled,
        }),
      });
      const result = await readJson<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Catalog item could not be saved.");
      }
      await reload();
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pw-academy-config-updated"));
      setNotice(`Saved "${draft.label.trim() || codeVal}" in ${meta.label}.`);
      setDraft(emptyItem((draft.sortOrder || 100) + 10));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Catalog item could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function requestDelete(item: CatalogItemRow) {
    confirm({
      title: `Remove "${item.label}" from ${meta.label}?`,
      message:
        "Existing historical records keep their stored value, while new forms will no longer show this option.",
      confirmLabel: "Remove option",
      tone: "danger",
      onConfirm: async () => {
        setBusy(true);
        setError("");
        setNotice("");
        try {
          const response = await fetch("/api/catalogs", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "delete",
              catalog: activeCatalog,
              code: item.code,
            }),
          });
          const result = await readJson<{ ok?: boolean; error?: string }>(response);
          if (!response.ok || !result.ok) {
            throw new Error(result.error || "Catalog item could not be removed.");
          }
          await reload();
          if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pw-academy-config-updated"));
          setNotice(`Removed "${item.label}" from ${meta.label}.`);
          if (!draft.isNew && draft.code === item.code) {
            setDraft(emptyItem(100));
          }
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <section className="ps-finance-settings" aria-labelledby="catalog-settings-heading">
      <header className="ps-finance-heading">
        <h2 id="catalog-settings-heading">Academy catalogs &amp; dropdown lists</h2>
        <p>
          Manage selectable instruments, student ranks, lesson durations, complaint categories,
          expense categories, and lead sources from one central database registry.
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

      <div className="ps-catalog-tabs" role="tablist" aria-label="Academy catalogs">
        {CATALOG_META.map((cat) => (
          <button
            key={cat.key}
            type="button"
            role="tab"
            aria-selected={activeCatalog === cat.key}
            className={`ps-currency-option${activeCatalog === cat.key ? " selected" : ""}`}
            onClick={() => selectCatalog(cat.key)}
          >
            {cat.label}
            <small>{allByCatalog(cat.key).filter((i) => i.enabled).length}</small>
          </button>
        ))}
      </div>

      <section className="ps-finance-subsection" aria-labelledby="active-catalog-heading">
        <div className="ps-finance-subhead">
          <div>
            <h3 id="active-catalog-heading">{meta.label}</h3>
            <p>{meta.description}</p>
          </div>
          <button
            className="ps-outline"
            type="button"
            onClick={() => {
              const maxOrder = currentItems.reduce((m, i) => Math.max(m, i.sort_order), 0);
              setDraft(emptyItem(maxOrder + 10));
            }}
          >
            <Plus size={14} /> Add option
          </button>
        </div>

        {loading && currentItems.length === 0 ? (
          <p className="ps-finance-note">Loading catalog options…</p>
        ) : (
          <div className="ps-currency-list">
            {currentItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ps-currency-option${!draft.isNew && draft.code === item.code ? " selected" : ""}`}
                aria-pressed={!draft.isNew && draft.code === item.code}
                onClick={() => editItem(item)}
              >
                {item.label}
                {item.code !== item.label && <span>{item.code}</span>}
                <small>{item.enabled ? `#${item.sort_order}` : "Disabled"}</small>
              </button>
            ))}
          </div>
        )}

        <form className="ps-finance-form" onSubmit={saveItem}>
          <div className="ps-finance-subhead form-heading">
            <div>
              <h3>{draft.isNew ? `Add to ${meta.label}` : `Edit "${draft.label}"`}</h3>
              <p>{meta.codeHint}</p>
            </div>
            {!draft.isNew && (
              <button
                type="button"
                className="ps-outline ps-danger-outline"
                disabled={busy}
                onClick={() => {
                  const found = currentItems.find((i) => i.code === draft.code);
                  if (found) requestDelete(found);
                }}
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>

          <div className="ps-finance-fields three">
            <label className="ps-finance-field">
              Stored value / code
              <input
                required
                maxLength={80}
                disabled={!draft.isNew}
                placeholder={
                  activeCatalog === "complaint_categories" ? "e.g. teacher_conduct" : "e.g. Classical Guitar"
                }
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </label>
            <label className="ps-finance-field">
              Display label
              <input
                required
                maxLength={120}
                placeholder="Label shown in dropdowns"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            <label className="ps-finance-field">
              Sort order
              <input
                type="number"
                required
                min={0}
                max={10000}
                step={1}
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
              />
            </label>
            <label className="ps-finance-check full">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              />
              Enabled in portal forms
            </label>
          </div>

          <div className="ps-finance-actions">
            <button className="ps-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : draft.isNew ? "Add catalog option" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
      <ConfirmDialog />
    </section>
  );
}
