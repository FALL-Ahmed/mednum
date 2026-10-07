"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadSrs, saveSrs, type SrsMap } from "@/lib/flashcard-store";
import { isDue, isMastered, reviewCard, type Rating, type SRSState } from "@/lib/srs";
import { ReportButton } from "./report-button";
import { useT } from "@/lib/app-i18n";

/* Flashcards avec répétition espacée : même déroulement que l'application mobile. */

export type Card = { front: string; back: string; chapter?: string };

const RATINGS: { id: Rating; label: string; color: string }[] = [
  { id: "again", label: "À revoir", color: "#CBD5E0" },
  { id: "hard", label: "Difficile", color: "#9FD9CE" },
  { id: "good", label: "Bien", color: "#07A997" },
  { id: "easy", label: "Facile", color: "#0B1E34" },
];

type Stats = Record<Rating, number>;
const EMPTY: Stats = { again: 0, hard: 0, good: 0, easy: 0 };

const btnDark =
  "rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40";
const btnLine =
  "rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink disabled:opacity-40";

/** Stockage de la progression : par défaut celui des cartes de l'IA ; « Mes cartes » fournit le sien. */
export type CardStore = {
  load: () => Promise<{ map: SrsMap; cloud: boolean }>;
  save: (index: number, state: SRSState, all: SrsMap) => void;
};

export function FlashcardPlayer({
  docId,
  userId,
  cards,
  store,
  reportable = true,
}: {
  docId: string;
  userId: string;
  cards: Card[];
  /** Pour « Mes cartes » (progression indexée par position dans `cards`). À mémoriser côté appelant. */
  store?: CardStore;
  /** Le bouton « Signaler une erreur » n'a de sens que pour les cartes de l'IA. */
  reportable?: boolean;
}) {
  const t = useT();
  const [srs, setSrs] = useState<SrsMap | null>(null);
  const [cloud, setCloud] = useState(true);
  const [deck, setDeck] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  const [again, setAgain] = useState<number[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY);

  const startDeck = useCallback(
    (indices: number[]) => {
      setDeck(indices);
      setPos(0);
      setFlipped(false);
      setFinished(false);
      setAgain([]);
      setStats(EMPTY);
    },
    [],
  );

  // Chargement de la progression, puis première pioche : les cartes à revoir aujourd'hui.
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const r = store ? await store.load() : await loadSrs(userId, docId);
      if (cancelled) return;
      setSrs(r.map);
      setCloud(r.cloud);
      startDeck(cards.map((_, i) => i).filter((i) => isDue(r.map[i])));
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [userId, docId, cards, startDeck, store]);

  const rate = useCallback(
    (rating: Rating) => {
      if (!srs || deck.length === 0) return;
      const idx = deck[pos];
      const next = reviewCard(srs[idx], rating);
      const map = { ...srs, [idx]: next };
      setSrs(map);
      if (store) store.save(idx, next, map);
      else saveSrs(userId, docId, idx, next, map);
      setStats((s) => ({ ...s, [rating]: s[rating] + 1 }));
      if (rating === "again") setAgain((a) => (a.includes(idx) ? a : [...a, idx]));
      if (pos + 1 >= deck.length) {
        setFinished(true);
      } else {
        setPos(pos + 1);
        setFlipped(false);
      }
    },
    [srs, deck, pos, userId, docId, store],
  );

  const browse = useCallback(
    (n: number) => {
      setPos((p) => Math.min(Math.max(p + n, 0), deck.length - 1));
      setFlipped(false);
    },
    [deck.length],
  );

  // Clavier : espace pour retourner, 1 à 4 pour noter, flèches pour parcourir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished || deck.length === 0) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === " " || e.key === "Enter") {
        if (el?.tagName === "BUTTON") return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        rate(RATINGS[Number(e.key) - 1].id);
      } else if (e.key === "ArrowRight") browse(1);
      else if (e.key === "ArrowLeft") browse(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, deck.length, flipped, rate, browse]);

  const mastered = useMemo(() => (srs ? cards.filter((_, i) => isMastered(srs[i])).length : 0), [srs, cards]);

  if (srs === null) return <p className="text-muted">{t("Chargement de tes cartes…")}</p>;

  /* ——— Tout est à jour ——— */
  if (deck.length === 0 && !finished) {
    return (
      <div className="rounded-2xl border border-line bg-white p-8 text-center sm:p-12">
        <p className="text-5xl" aria-hidden>
          ✅
        </p>
        <p className="display mt-4 text-3xl text-ink">{t("Tout est à jour")}</p>
        <p className="mx-auto mt-3 max-w-md text-muted">{t("Tu as déjà revu ces cartes aujourd'hui. La répétition espacée te les représentera au bon moment.")}</p>
        <p className="mt-4 text-sm font-semibold text-ink">{t(mastered > 1 ? "{a} cartes maîtrisées sur {b}" : "{a} carte maîtrisée sur {b}", { a: mastered, b: cards.length })}</p>
        <button onClick={() => startDeck(cards.map((_, i) => i))} className={`mt-6 ${btnLine}`}>{t("Réviser quand même")}</button>
      </div>
    );
  }

  /* ——— Session terminée ——— */
  if (finished) {
    const total = deck.length;
    const sum = stats.again + stats.hard + stats.good + stats.easy || 1;
    return (
      <div className="rounded-2xl border border-line bg-white p-6 sm:p-10">
        <div className="text-center">
          <p className="text-5xl" aria-hidden>
            {again.length === 0 ? "🏆" : "📚"}
          </p>
          <p className="display mt-3 text-3xl text-ink">{t("Session terminée !")}</p>
          <p className="mt-2 text-muted">
            {again.length > 0
              ? t(again.length > 1 ? "{a} cartes à revoir sur {b}" : "{a} carte à revoir sur {b}", { a: again.length, b: total })
              : t("{a} cartes revues, tout est acquis", { a: total })}
          </p>
        </div>
        <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-slide" aria-hidden>
          {RATINGS.map((r) =>
            stats[r.id] > 0 ? <div key={r.id} style={{ flex: stats[r.id] / sum, background: r.color }} /> : null,
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RATINGS.map((r) => (
            <div key={r.id} className="rounded-2xl border border-line px-4 py-3">
              <p className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: r.color }} aria-hidden />
                <span className="display text-2xl text-ink">{stats[r.id]}</span>
              </p>
              <p className="mt-1 text-sm text-muted">{t(r.label)}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {again.length > 0 && (
            <button onClick={() => startDeck(again)} className={btnDark}>{t("Revoir les cartes difficiles")}</button>
          )}
          <button
            onClick={() => {
              setDeck([]);
              setFinished(false);
            }}
            className={btnLine}
          >{t("Terminer")}</button>
        </div>
      </div>
    );
  }

  /* ——— Une carte ——— */
  const idx = deck[pos];
  const card = cards[idx];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label rounded-full bg-slide px-3 py-1.5 text-muted">{t("Carte {a} sur {b}", { a: pos + 1, b: deck.length })}{card.chapter ? ` · ${card.chapter}` : ""}
        </p>
        <p className="text-sm text-muted">{t(mastered > 1 ? "{a} maîtrisées sur {b}" : "{a} maîtrisée sur {b}", { a: mastered, b: cards.length })}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slide" aria-hidden>
        <div className="h-full rounded-full bg-eosin transition-[width] duration-300" style={{ width: `${(pos / deck.length) * 100}%` }} />
      </div>

      <button
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? t("Voir la question") : t("Voir la réponse")}
        className={`mt-4 flex min-h-[16rem] w-full flex-col items-center justify-center rounded-3xl p-8 text-center transition-colors sm:min-h-[20rem] ${
          flipped ? "text-white ring-1 ring-eosin/40" : "bg-white text-ink ring-1 ring-line"
        }`}
        style={flipped ? { backgroundImage: "linear-gradient(135deg, rgba(7,169,151,0.85), #0B1E34 85%)", backgroundColor: "#0B1E34" } : undefined}
      >
        <span className={`label ${flipped ? "text-white/70" : "text-muted"}`}>{flipped ? t("Réponse") : t("Question")}</span>
        <span dir="auto" className="display mt-4 text-2xl leading-snug sm:text-3xl">{flipped ? card.back : card.front}</span>
        <span className={`mt-6 text-sm ${flipped ? "text-white/70" : "text-muted"}`}>
          {flipped ? t("Note-toi honnêtement : la carte reviendra au bon moment") : t("Touche la carte pour voir la réponse")}
        </span>
      </button>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button onClick={() => browse(-1)} disabled={pos === 0} className={btnLine}>{t("← Précédente")}</button>
        {reportable ? (
          <ReportButton docId={docId} kind="flashcard" itemRef={String(idx + 1)} snapshot={card} label={t("Signaler une erreur")} />
        ) : (
          <span />
        )}
        <button onClick={() => browse(1)} disabled={pos + 1 >= deck.length} className={btnLine}>{t("Suivante →")}</button>
      </div>

      {flipped && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RATINGS.map((r, k) => (
            <button
              key={r.id}
              onClick={() => rate(r.id)}
              className={`rounded-2xl border px-4 py-3.5 font-semibold transition ${
                r.id === "good"
                  ? "border-eosin bg-eosin text-ink hover:bg-ink hover:text-white"
                  : "border-line bg-white text-ink hover:border-ink"
              }`}
            >
              {t(r.label)}
              <span className={`ms-2 hidden text-xs font-normal sm:inline ${r.id === "good" ? "text-ink/60" : "text-muted"}`} aria-hidden>
                {k + 1}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-4 hidden text-xs text-muted sm:block">{t("Clavier : espace pour retourner, 1 à 4 pour noter, flèches pour parcourir.")}</p>
      {!cloud && (
        <p className="mt-2 text-xs text-muted">{t("Ta progression est gardée sur cet appareil pour le moment.")}</p>
      )}
    </div>
  );
}
