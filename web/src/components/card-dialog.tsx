"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./app-context";
import { BACK_MAX, FRONT_MAX, createCard, updateCard, type CardDraft, type UserCard } from "@/lib/user-cards";
import { useT } from "@/lib/app-i18n";

/*
  Fenêtre de création / modification d'une carte. Utilisée partout : la page « Mes cartes », la discussion avec
  Dr. Ahmed, les QCM, les fiches (sélection de texte) et l'onglet Flashcards d'un cours.
*/

const input =
  "mt-2 w-full rounded-2xl border border-line bg-slide px-4 py-3 text-[16px] text-ink placeholder:text-muted focus:border-ink focus:outline-none";

export function CardDialog({
  draft,
  editing,
  onClose,
  onSaved,
}: {
  /** Valeurs de départ (nouvelle carte). */
  draft?: CardDraft | null;
  /** Carte existante à modifier. */
  editing?: UserCard | null;
  onClose: () => void;
  onSaved?: (card: UserCard) => void;
}) {
  const t = useT();
  const { user, docs, quota } = useApp();
  const [front, setFront] = useState(editing?.front ?? draft?.front ?? "");
  const [back, setBack] = useState(editing?.back ?? draft?.back ?? "");
  const [docId, setDocId] = useState<string>(editing?.document_id ?? draft?.document_id ?? "");
  const [chapter, setChapter] = useState(editing?.chapter ?? draft?.chapter ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"limit" | "invalid" | "other" | null>(null);
  const [saved, setSaved] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);

  // Le champ à remplir en premier : la question si elle est vide, sinon la réponse
  useEffect(() => {
    (front ? backRef : frontRef).current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const canSave = front.trim().length > 0 && back.trim().length > 0 && docId !== "" && !busy;

  async function save(another: boolean) {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const values = { front, back, document_id: docId || null, chapter };
    const res = editing ? await updateCard(editing.id, values) : await createCard(user.id, { ...values, source: draft?.source ?? "manual" });
    setBusy(false);
    if (res.error || !res.card) {
      setError(res.error ?? "other");
      return;
    }
    onSaved?.(res.card);
    if (another && !editing) {
      setFront("");
      setBack("");
      setSaved((n) => n + 1);
      frontRef.current?.focus();
    } else if (!editing) {
      // Confirmation : où retrouver la carte
      setDone(docs?.find((d) => d.id === docId)?.name ?? "");
      window.setTimeout(onClose, 2600);
    } else {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? t("Modifier la carte") : t("Nouvelle carte")}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
      >
        {done !== null ? (
          <div className="py-6 text-center">
            <p className="text-5xl" aria-hidden>✅</p>
            <p className="display mt-3 text-2xl text-ink">{t("Carte ajoutée")}</p>
            <p className="mt-2 text-muted">
              {t("Retrouve-la dans l'onglet Flashcards du cours « {a} », sous « Mes cartes ».", { a: done })}
            </p>
            <button onClick={onClose} className="mt-5 rounded-full border border-ink/25 px-6 py-2.5 font-semibold text-ink transition hover:border-ink">{t("Fermer")}</button>
          </div>
        ) : (
        <>
        <p className="display text-2xl text-ink">{editing ? t("Modifier la carte") : t("Nouvelle carte")}</p>
        {saved > 0 && !editing && (
          <p role="status" className="mt-3 rounded-xl bg-eosin-soft px-4 py-2.5 text-sm font-semibold text-ink">
            {t(saved > 1 ? "{n} cartes ajoutées. Continue !" : "{n} carte ajoutée. Continue !", { n: saved })}
          </p>
        )}

        <label htmlFor="cd-front" className="label mt-5 block text-muted">{t("Question (recto)")}</label>
        <textarea
          id="cd-front"
          ref={frontRef}
          value={front}
          onChange={(e) => setFront(e.target.value.slice(0, FRONT_MAX))}
          rows={3}
          dir="auto"
          placeholder={t("ex : Antidote du paracétamol ?")}
          className={input}
        />

        <label htmlFor="cd-back" className="label mt-4 block text-muted">{t("Réponse (verso)")}</label>
        <textarea
          id="cd-back"
          ref={backRef}
          value={back}
          onChange={(e) => setBack(e.target.value.slice(0, BACK_MAX))}
          rows={5}
          dir="auto"
          placeholder={t("ex : N-acétylcystéine")}
          className={input}
        />
        <p className="mt-1 text-xs text-muted">{t("Une seule notion par carte : elle se retient mieux.")}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cd-doc" className="label block text-muted">{t("Cours")}</label>
            <select id="cd-doc" value={docId} onChange={(e) => setDocId(e.target.value)} className={input}>
              <option value="">{t("Choisis un cours")}</option>
              {/* Les cours sont groupés par module quand l'étudiant en a créé */}
              {[...new Set((docs ?? []).map((d) => (d.subject_name ?? "").trim()))]
                .sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "fr")))
                .map((mod) => {
                  const list = (docs ?? []).filter((d) => (d.subject_name ?? "").trim() === mod);
                  const opts = list.map((d) => <option key={d.id} value={d.id}>{d.name}</option>);
                  return mod ? <optgroup key={mod} label={mod}>{opts}</optgroup> : opts;
                })}
            </select>
          </div>
          <div>
            <label htmlFor="cd-ch" className="label block text-muted">{t("Chapitre")} <span className="normal-case tracking-normal">{t("(facultatif)")}</span></label>
            <input id="cd-ch" value={chapter} onChange={(e) => setChapter(e.target.value.slice(0, 120))} dir="auto" className={input} />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
            {error === "limit" ? (
              <>
                {quota?.plan === "standard"
                  ? t("Tu as créé tes 50 cartes de ce mois. Le compteur repart le mois prochain, ou passe à Premium pour des cartes illimitées.")
                  : t("Tu as atteint la limite de 5 cartes de l'offre Gratuit.")}{" "}
                <Link href="/app/abonnement" className="font-semibold underline">{t("Voir les plans")}</Link>
              </>
            ) : error === "invalid" ? (
              t("La question et la réponse doivent être remplies.")
            ) : (
              t("L'enregistrement n'a pas pu aboutir. Réessaie dans un instant.")
            )}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => save(false)}
            disabled={!canSave}
            className="rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40"
          >
            {busy ? t("Enregistrement…") : t("Enregistrer")}
          </button>
          {!editing && (
            <button
              onClick={() => save(true)}
              disabled={!canSave}
              className="rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink disabled:opacity-40"
            >
              {t("Enregistrer et ajouter une autre")}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-4 py-3 font-semibold text-ink/70 transition hover:text-ink"
          >
            {t("Annuler")}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
