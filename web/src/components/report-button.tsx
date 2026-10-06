"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useApp } from "./app-context";

export type ReportKind = "case" | "fiche" | "flashcard" | "qcm";

/** « Signaler une erreur » : l'étudiant décrit ce qui est faux, une copie du contenu est envoyée pour relecture. */
export function ReportButton({
  docId,
  kind,
  itemRef = "",
  snapshot,
  label = "Signaler une erreur",
}: {
  docId: string;
  kind: ReportKind;
  itemRef?: string;
  snapshot: unknown;
  label?: string;
}) {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    areaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setState("idle");
    setMessage("");
  }

  async function send() {
    const sb = getSupabase();
    if (!sb || message.trim().length < 3) return;
    setState("sending");
    const { error } = await sb.from("content_reports").insert({
      user_id: user.id,
      document_id: docId,
      kind,
      item_ref: itemRef,
      snapshot: JSON.parse(JSON.stringify(snapshot ?? {}).slice(0, 60000) || "{}"),
      message: message.trim().slice(0, 2000),
    });
    setState(error ? "failed" : "sent");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-ink/60 underline decoration-ink/25 underline-offset-4 transition hover:text-ink"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            {state === "sent" ? (
              <>
                <h2 id="report-title" className="display text-2xl leading-tight text-ink">
                  Merci, c&apos;est envoyé.
                </h2>
                <p className="mt-3 text-muted">
                  Ton signalement sera relu et le contenu corrigé si besoin. En attendant, fie-toi à ton cours et à ton enseignant.
                </p>
                <button
                  onClick={close}
                  className="mt-6 rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink"
                >
                  Fermer
                </button>
              </>
            ) : (
              <>
                <h2 id="report-title" className="display text-2xl leading-tight text-ink">
                  Qu&apos;est-ce qui est faux ?
                </h2>
                <p className="mt-2 text-muted">Décris l&apos;erreur en une ou deux phrases. Une copie de ce contenu nous est envoyée.</p>
                <label htmlFor="report-msg" className="sr-only">
                  Description de l&apos;erreur
                </label>
                <textarea
                  id="report-msg"
                  ref={areaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="ex : le C3 n'est pas normal dans cette maladie, d'après mon cours."
                  className="mt-4 w-full resize-none rounded-2xl border border-line bg-slide px-4 py-3 text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                />
                {state === "failed" && (
                  <p role="alert" className="mt-3 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
                    Impossible d&apos;envoyer pour le moment. Écris-nous sur WhatsApp si c&apos;est urgent.
                  </p>
                )}
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    onClick={close}
                    className="rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={send}
                    disabled={state === "sending" || message.trim().length < 3}
                    className="rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40"
                  >
                    {state === "sending" ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
