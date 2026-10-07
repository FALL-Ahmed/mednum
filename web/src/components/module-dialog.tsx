"use client";

import { useEffect, useMemo, useState } from "react";
import type { DocSummary } from "./app-context";
import { getSupabase } from "@/lib/supabase";
import { useT } from "@/lib/app-i18n";

/*
  Modules : l'étudiant range ses cours par matière (Immunologie, Cardiologie…). Un module est simplement le nom
  de matière (subject_name) enregistré sur chaque cours : rien à créer ailleurs, un module sans cours n'existe pas.
*/

export const MODULE_MAX = 60;
export const cleanModule = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MODULE_MAX);

export type ModuleMode =
  | { kind: "assign"; doc: DocSummary } // ranger un cours dans un module
  | { kind: "create" } // créer un module et y mettre plusieurs cours
  | { kind: "rename"; name: string }; // renommer un module

const input =
  "mt-2 w-full rounded-2xl border border-line bg-slide px-4 py-3 text-[16px] text-ink placeholder:text-muted focus:border-ink focus:outline-none";

export function ModuleDialog({
  mode,
  docs,
  onClose,
  onDone,
}: {
  mode: ModuleMode;
  docs: DocSummary[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const existing = useMemo(
    () => [...new Set(docs.map((d) => (d.subject_name ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [docs],
  );
  const [name, setName] = useState(mode.kind === "rename" ? mode.name : mode.kind === "assign" ? (mode.doc.subject_name ?? "") : "");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Un nom déjà utilisé (sans tenir compte des majuscules) reprend l'orthographe existante
  const resolved = useMemo(() => {
    const n = cleanModule(name);
    return existing.find((e) => e.toLowerCase() === n.toLowerCase()) ?? n;
  }, [name, existing]);

  const canSave =
    !busy &&
    (mode.kind === "assign" || resolved.length > 0) &&
    (mode.kind !== "create" || picked.length > 0) &&
    (mode.kind !== "rename" || (resolved.length > 0 && resolved !== mode.name));

  async function save() {
    const sb = getSupabase();
    if (!sb || !canSave) return;
    setBusy(true);
    setError(false);
    let res;
    if (mode.kind === "assign") res = await sb.from("documents").update({ subject_name: resolved }).eq("id", mode.doc.id);
    else if (mode.kind === "create") res = await sb.from("documents").update({ subject_name: resolved }).in("id", picked);
    else res = await sb.from("documents").update({ subject_name: resolved }).eq("subject_name", mode.name);
    setBusy(false);
    if (res.error) {
      setError(true);
      return;
    }
    onDone();
    onClose();
  }

  const title =
    mode.kind === "assign" ? t("Ranger dans un module") : mode.kind === "create" ? t("Nouveau module") : t("Renommer le module");

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <p className="display text-2xl text-ink">{title}</p>
        {mode.kind === "assign" && <p dir="auto" className="mt-1 text-muted">{mode.doc.name}</p>}

        {mode.kind === "assign" && existing.length > 0 && (
          <div className="mt-5">
            <p className="label text-muted">{t("Modules existants")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {existing.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setName(m)}
                  aria-pressed={resolved === m}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    resolved === m ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/80 hover:border-ink"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <label htmlFor="md-name" className="label mt-5 block text-muted">
          {mode.kind === "assign" ? t("Ou un nouveau module") : t("Nom du module")}
        </label>
        <input
          id="md-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MODULE_MAX))}
          dir="auto"
          placeholder={t("ex : Immunologie")}
          className={input}
          autoFocus
        />
        {mode.kind === "assign" && <p className="mt-1 text-xs text-muted">{t("Laisse vide pour retirer ce cours de son module.")}</p>}

        {mode.kind === "create" && (
          <div className="mt-5">
            <p className="label text-muted">{t("Cours à mettre dans ce module")}</p>
            <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
              {docs.map((d) => {
                const on = picked.includes(d.id);
                return (
                  <li key={d.id}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[15px] transition ${on ? "border-ink bg-slide" : "border-line"}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setPicked((p) => (on ? p.filter((x) => x !== d.id) : [...p, d.id]))}
                        className="h-4 w-4 accent-[var(--ink,#0b1e34)]"
                      />
                      <span dir="auto" className="min-w-0 flex-1 truncate font-semibold text-ink">{d.name}</span>
                      {d.subject_name && <span className="shrink-0 text-xs text-muted">{d.subject_name}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
            {t("L'enregistrement n'a pas pu aboutir. Réessaie dans un instant.")}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40"
          >
            {busy ? t("Enregistrement…") : t("Enregistrer")}
          </button>
          <button onClick={onClose} disabled={busy} className="rounded-full px-4 py-3 font-semibold text-ink/70 transition hover:text-ink">
            {t("Annuler")}
          </button>
        </div>
      </div>
    </div>
  );
}
