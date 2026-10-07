"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/app-i18n";

/** Fenêtre de confirmation aux couleurs d'Axone (remplace la fenêtre grise du navigateur). */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/50 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-text"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <h2 id="confirm-title" className="display text-2xl leading-tight text-ink">
          {t(title)}
        </h2>
        <p id="confirm-text" className="mt-3 text-muted">
          {t(text)}
        </p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink disabled:opacity-50"
          >{t("Annuler")}</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={danger ? { backgroundColor: "#d92d20", color: "#ffffff" } : undefined}
            className={`rounded-full px-6 py-3 font-bold transition disabled:opacity-50 ${
              danger
                ? "shadow-[0_6px_16px_-4px_rgba(217,45,32,0.55)] hover:brightness-90"
                : "bg-ink text-white hover:bg-eosin hover:text-ink"
            }`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
