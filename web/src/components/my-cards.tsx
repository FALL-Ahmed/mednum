"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardDialog } from "./card-dialog";
import { FlashcardPlayer } from "./flashcard-player";
import { isPaid, useApp } from "./app-context";
import { isDue, type SRSState } from "@/lib/srs";
import { cardAllowance, deleteCard, dueCards, loadAllCardSrs, makeCardStore, masteredCount, type CardUsage, type UserCard } from "@/lib/user-cards";
import { useT } from "@/lib/app-i18n";

const btnDark = "rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40";
const btnLine = "rounded-full border border-ink/25 px-5 py-2.5 text-[15px] font-semibold text-ink transition hover:border-ink disabled:opacity-40";

/**
 * « Mes cartes » d'un cours : les flashcards que l'étudiant a créées lui-même pour ce cours.
 * Elles se créent à la main, depuis une fiche, une discussion ou un QCM, et se révisent avec la répétition espacée.
 */
export function MyCards({ doc, cards, usage, reload }: { doc: { id: string; name: string }; cards: UserCard[]; usage: CardUsage; reload: () => void }) {
  const t = useT();
  const { user, quota } = useApp();
  const [srs, setSrs] = useState<Record<string, SRSState>>({});
  const [reviewing, setReviewing] = useState<"due" | "all" | null>(null);
  const [dialog, setDialog] = useState<{ editing?: UserCard } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadAllCardSrs().then((s) => alive && setSrs(s));
    return () => {
      alive = false;
    };
  }, [reviewing]); // recharge la progression quand on revient de la révision

  const due = useMemo(() => dueCards(cards, srs), [cards, srs]);
  const mastered = useMemo(() => masteredCount(cards, srs), [cards, srs]);
  const allow = cardAllowance(quota?.plan, usage);

  const deck = useMemo(() => {
    const list = reviewing === "all" ? cards : due;
    return [...list].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  }, [cards, due, reviewing]);
  const store = useMemo(() => makeCardStore(user.id, deck), [user.id, deck]);
  const playerCards = useMemo(() => deck.map((c) => ({ front: c.front, back: c.back, chapter: c.chapter ?? undefined })), [deck]);

  async function remove(id: string) {
    if (armed !== id) {
      setArmed(id);
      window.setTimeout(() => setArmed((a) => (a === id ? null : a)), 3000);
      return;
    }
    setArmed(null);
    if (await deleteCard(id)) reload();
  }

  /* ——— Révision ——— */
  if (reviewing) {
    return (
      <div>
        <button
          onClick={() => {
            setReviewing(null);
            reload();
          }}
          className="text-sm font-semibold text-ink/70 transition hover:text-ink"
        >
          {t("← Mes cartes")}
        </button>
        <div className="mt-4">
          <FlashcardPlayer docId={`mes-cartes-${doc.id}`} userId={user.id} cards={playerCards} store={store} reportable={false} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-muted">
          {t("Tes propres flashcards pour ce cours : tu les crées, tu les modifies, et la répétition espacée te les représente au bon moment.")}
        </p>
        <button onClick={() => setDialog({})} className={btnDark}>
          ＋ {t("Nouvelle carte")}
        </button>
      </div>

      {allow.max !== null && (
        <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${allow.used >= allow.max ? "bg-[#fff6e6] text-ink" : "bg-slide text-ink/80"}`}>
          {allow.per === "total"
            ? t("{a} sur {b} cartes (offre Gratuit).", { a: allow.used, b: allow.max })
            : t("{a} sur {b} cartes créées ce mois-ci (Standard).", { a: allow.used, b: allow.max })}{" "}
          {allow.used >= allow.max - (allow.per === "total" ? 1 : 5) && (
            <Link href="/app/abonnement" className="font-semibold underline">{t("Voir les plans")}</Link>
          )}
        </p>
      )}

      {cards.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <p className="display text-2xl text-ink">{t("Crée ta première carte")}</p>
          <ul className="mt-4 space-y-3 text-ink/85">
            <li className="flex gap-3"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />{t("À la main : une question, sa réponse.")}</li>
            <li className="flex gap-3"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />{t("Depuis une fiche : sélectionne un passage, puis « Créer une carte ».")}</li>
            <li className="flex gap-3"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />{t("Depuis une discussion : sous une réponse de Dr. Ahmed, « Carte ».")}</li>
            <li className="flex gap-3"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />{t("Depuis un QCM raté : « Ajouter à mes cartes ».")}</li>
          </ul>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="label text-muted">{t("Cartes")}</p>
              <p className="display mt-1 text-3xl text-ink">{cards.length}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${due.length > 0 ? "border-eosin bg-eosin-soft" : "border-line bg-white"}`}>
              <p className="label text-muted">{t("À revoir")}</p>
              <p className="display mt-1 text-3xl text-ink">{due.length}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="label text-muted">{t("Maîtrisées")}</p>
              <p className="display mt-1 text-3xl text-ink">{mastered}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => setReviewing("due")} disabled={due.length === 0} className={btnDark}>
              {due.length > 0 ? t("Réviser ({a})", { a: due.length }) : t("Tout est à jour")}
            </button>
            <button onClick={() => setReviewing("all")} className={btnLine}>{t("Tout réviser")}</button>
          </div>


          <ul className="mt-5 space-y-3">
            {cards.map((c) => {
              const isD = isDue(srs[c.id]);
              return (
                <li key={c.id} className="rounded-2xl border border-line bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p dir="auto" className="min-w-0 flex-1 font-semibold text-ink">{c.front}</p>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${isD ? "bg-eosin-soft text-ink" : "bg-slide text-muted"}`}>
                      {isD ? t("À revoir") : t("Revue")}
                    </span>
                  </div>
                  <p dir="auto" className="mt-2 line-clamp-3 whitespace-pre-line text-ink/75">{c.back}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">{c.chapter ?? ""}</p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setDialog({ editing: c })} className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink/70 transition hover:bg-slide hover:text-ink">
                        {t("Modifier")}
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${armed === c.id ? "bg-[#fff1f0] text-[#a3271c]" : "text-ink/70 hover:bg-slide hover:text-ink"}`}
                      >
                        {armed === c.id ? t("Confirmer") : t("Supprimer")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dialog && (
        <CardDialog
          editing={dialog.editing ?? null}
          draft={dialog.editing ? null : { front: "", back: "", document_id: doc.id, chapter: doc.name, source: "manual" }}
          onClose={() => setDialog(null)}
          onSaved={() => reload()}
        />
      )}
    </div>
  );
}
