"use client";

import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  X,
} from "lucide-react";

export type ConfirmTone = "danger" | "warning" | "primary" | "info";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  busy?: boolean;
  error?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "warning",
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, busy, onCancel]);

  if (!isOpen) return null;

  const toneConfig = {
    danger: {
      icon: <AlertCircle size={22} color="#dc2626" />,
      btnClass: "btn danger",
      headColor: "#9e4844",
      confirmBtnStyle: { background: "#dc2626", color: "#ffffff" },
    },
    warning: {
      icon: <AlertTriangle size={22} color="#d97706" />,
      btnClass: "btn",
      headColor: "#b26a15",
      confirmBtnStyle: { background: "#d97706", color: "#ffffff" },
    },
    primary: {
      icon: <CheckCircle size={22} color="var(--green-700)" />,
      btnClass: "btn",
      headColor: "var(--pine-950)",
      confirmBtnStyle: {},
    },
    info: {
      icon: <HelpCircle size={22} color="#2563eb" />,
      btnClass: "btn",
      headColor: "var(--pine-950)",
      confirmBtnStyle: { background: "#2563eb", color: "#ffffff" },
    },
  }[tone];

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal confirm-modal" style={{ maxWidth: 460 }}>
        <div className="modal-head" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {toneConfig.icon}
            <h2
              id="confirm-modal-title"
              style={{ color: toneConfig.headColor, fontSize: 16 }}
            >
              {title}
            </h2>
          </div>
          <button
            className="close-btn"
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={15} />
          </button>
        </div>

        <div
          className="confirm-modal-body"
          style={{
            color: "var(--ink)",
            fontSize: 12,
            lineHeight: 1.55,
            margin: "12px 0 22px",
          }}
        >
          {typeof message === "string"
            ? message.split("\n\n").map((para, i) => (
                <p key={i} style={{ margin: i > 0 ? "8px 0 0" : 0 }}>
                  {para}
                </p>
              ))
            : message}
          {error && (
            <p
              role="alert"
              className="form-error"
              style={{ marginTop: 12, marginBottom: 0 }}
            >
              {error}
            </p>
          )}
        </div>

        <div
          className="modal-actions"
          style={{
            marginTop: 22,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            className="btn secondary"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={toneConfig.btnClass}
            type="button"
            style={toneConfig.confirmBtnStyle}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmStoreSnapshot {
  options: ConfirmOptions | null;
  busy: boolean;
  error: string;
}

export function useConfirmModal() {
  const storeRef = useRef<{
    snapshot: ConfirmStoreSnapshot;
    listeners: Set<() => void>;
    set: (updater: (prev: ConfirmStoreSnapshot) => ConfirmStoreSnapshot) => void;
  } | null>(null);

  if (!storeRef.current) {
    const store = {
      snapshot: { options: null, busy: false, error: "" } as ConfirmStoreSnapshot,
      listeners: new Set<() => void>(),
      set(updater: (prev: ConfirmStoreSnapshot) => ConfirmStoreSnapshot) {
        store.snapshot = updater(store.snapshot);
        store.listeners.forEach((listener) => listener());
      },
    };
    storeRef.current = store;
  }

  const subscribe = useCallback((listener: () => void) => {
    const store = storeRef.current!;
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => storeRef.current!.snapshot, []);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const confirm = useCallback((options: ConfirmOptions) => {
    storeRef.current!.set(() => ({ options, busy: false, error: "" }));
  }, []);

  const close = useCallback(() => {
    storeRef.current!.set((prev) =>
      prev.busy ? prev : { options: null, busy: false, error: "" }
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    const current = storeRef.current!.snapshot;
    if (!current.options || current.busy) return;
    storeRef.current!.set((prev) => ({ ...prev, busy: true, error: "" }));
    try {
      await current.options.onConfirm();
      storeRef.current!.set(() => ({ options: null, busy: false, error: "" }));
    } catch (cause) {
      storeRef.current!.set((prev) => ({
        ...prev,
        busy: false,
        error:
          cause instanceof Error
            ? cause.message
            : "This action could not be completed. Please try again.",
      }));
    }
  }, []);

  const ConfirmDialog = useMemo(() => {
    return function StableConfirmDialog() {
      const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
      if (!current.options) return null;
      return (
        <ConfirmModal
          isOpen={true}
          title={current.options.title}
          message={current.options.message}
          confirmLabel={current.options.confirmLabel}
          cancelLabel={current.options.cancelLabel}
          tone={current.options.tone}
          busy={current.busy}
          error={current.error}
          onConfirm={handleConfirm}
          onCancel={close}
        />
      );
    };
  }, [subscribe, getSnapshot, handleConfirm, close]);

  return { confirm, ConfirmDialog, isOpen: Boolean(snap.options), busy: snap.busy };
}
export default ConfirmModal;
