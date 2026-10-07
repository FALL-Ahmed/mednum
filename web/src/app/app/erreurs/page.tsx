"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CardDialog } from "@/components/card-dialog";
import { KEYS, scoreQcm, type Key } from "@/lib/course";
import { loadDue, recordAnswer, reviewStats, type ReviewRow, type ReviewStats } from "@/lib/qcm-review";
import { draftFromQcm, type CardDraft } from "@/lib/user-cards";
import { useT } from "@/lib/app-i18n";

const btnDark =
  "rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40";
const btnLine =
  "rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink disabled:opacity-40";

const SESSION = 10; // une séance courte : on revoit 10 questions au plus

/** « Mes erreurs » : les questions de QCM ratées, tous cours confondus, reposées au bon moment. */
export default function ErreursPage() {
  const t = useT();
  const [docId, setDocId] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [queue, setQueue] = useState<ReviewRow[] | null>(null); // null = pas de séance en cours
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<Key[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);

  const refresh = useCallback(async (doc?: string) => setStats(await reviewStats(doc)), []);

  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("doc") ?? undefined;
    setDocId(d);
    setReady(true);
    refresh(d);
  }, [refresh]);

  async function start() {
    setBusy(true);
    const rows = await loadDue(docId, SESSION);
    setBusy(false);
    if (rows.length === 0) {
      refresh(docId);
      return;
    }
    setQueue(rows);
    setIdx(0);
    setSel([]);
    setRevealed(false);
    setResults([]);
  }

  function leave() {
    setQueue(null);
    refresh(docId);
  }

  async function validate() {
    if (!queue) return;
    const row = queue[idx];
    setRevealed(true);
    const ok = await recordAnswer({ id: row.document_id ?? "", name: row.doc_name }, row.chapter_title, row.question, sel, true);
    setResults((r) => [...r, ok]);
  }

  function next() {
    setIdx((i) => i + 1);
    setSel([]);
    setRevealed(false);
    setCardDraft(null);
  }

  const back = (
    <Link href="/app/cours" className="text-sm font-semibold text-ink/70 transition hover:text-ink">
      {t("← Mes cours")}
    </Link>
  );

  if (!ready || !stats) return <p className="text-muted">{t("Chargement…")}</p>;

  if (!stats.available) {
    return (
      <div>
        {back}
        <p className="mt-6 max-w-xl rounded-2xl border border-dashed border-line bg-white p-5 text-muted">
          {t("« Mes erreurs » n'est pas encore activé sur ce compte.")}
        </p>
      </div>
    );
  }

  /* ——— Séance terminée ——— */
  if (queue && idx >= queue.length) {
    const good = results.filter(Boolean).length;
    return (
      <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <p className="label text-muted">{t("Séance terminée")}</p>
        <p className="display mt-3 text-6xl text-ink">
          {good}
          <span className="text-2xl text-muted"> / {queue.length}</span>
        </p>
        <p className="mt-3 max-w-xl text-ink/80">
          {good === queue.length
            ? t("Tout est juste. Ces questions reviendront dans quelques jours, pour vérifier que tu les retiens.")
            : t("Les questions ratées reviennent demain. Les réussies reviennent plus tard, et disparaissent après trois réussites de suite.")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {stats.due > queue.length && <button onClick={start} className={btnDark}>{t("Continuer")}</button>}
          <button onClick={leave} className={stats.due > queue.length ? btnLine : btnDark}>{t("Terminer")}</button>
        </div>
      </div>
    );
  }

  /* ——— Une question ——— */
  if (queue) {
    const row = queue[idx];
    const q = row.question;
    const { result } = scoreQcm(sel, q.bonnesReponses);
    return (
      <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={leave} className="text-sm font-semibold text-ink/70 transition hover:text-ink">
            {t("← Quitter")}
          </button>
          <p dir="auto" className="label min-w-0 truncate text-muted">
            {row.doc_name || row.chapter_title}
          </p>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slide" aria-hidden>
          <div className="h-full bg-eosin transition-all" style={{ width: `${(idx / queue.length) * 100}%` }} />
        </div>
        <p className="label mt-5 text-muted">{t("Question {a} sur {b}", { a: idx + 1, b: queue.length })}</p>
        <p dir="auto" className="display mt-3 text-2xl leading-snug text-ink">{q.question}</p>
        <p className="mt-2 text-sm text-muted">{t("Une ou plusieurs propositions sont exactes.")}</p>

        <div className="mt-5 space-y-2.5">
          {KEYS.map((k) => {
            const isGood = q.bonnesReponses.includes(k);
            const isPicked = sel.includes(k);
            const style = revealed
              ? isGood
                ? "border-eosin bg-eosin-soft text-ink"
                : isPicked
                  ? "border-[#e0796f] bg-[#fff1f0] text-ink"
                  : "border-line text-ink/60"
              : isPicked
                ? "border-hema bg-hema-soft font-semibold text-hema-deep"
                : "border-line text-ink/80 hover:border-ink";
            return (
              <button
                key={k}
                disabled={revealed}
                onClick={() => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}
                aria-pressed={isPicked}
                className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-start text-[15px] transition ${style}`}
              >
                <span className="label mt-0.5 w-4 shrink-0">{k}</span>
                <span dir="auto" className="flex-1">
                  {q.propositions[k]}
                  {revealed && <span className="mt-1.5 block text-sm text-muted">{q.explication[k]}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {revealed && (
          <p
            className={`mt-5 rounded-2xl px-4 py-3 font-semibold ${
              result === "COMPLET" ? "bg-eosin-soft text-ink" : result === "PARTIEL" ? "bg-[#fff6e6] text-ink" : "bg-[#fff1f0] text-ink"
            }`}
          >
            {result === "COMPLET"
              ? t("Juste ! Tu la reverras plus tard.")
              : t("À retravailler : cette question revient demain.")}
          </p>
        )}

        {revealed && q.commentaire && (
          <div className="mt-3 rounded-2xl border border-line bg-slide px-4 py-3.5">
            <p className="label text-muted">{t("Pourquoi ?")}</p>
            <p dir="auto" className="mt-1.5 text-[15px] leading-relaxed text-ink">{q.commentaire}</p>
          </div>
        )}

        {revealed && row.document_id && (
          <div className="mt-3">
            <button
              onClick={() => setCardDraft(draftFromQcm(q, row.chapter_title, row.document_id!))}
              className="text-sm font-semibold text-ink underline underline-offset-2 transition hover:text-eosin"
            >
              ＋ {t("Ajouter à mes cartes")}
            </button>
            {cardDraft && <CardDialog draft={cardDraft} onClose={() => setCardDraft(null)} />}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {!revealed ? (
            <button onClick={validate} disabled={sel.length === 0} className={btnDark}>{t("Valider")}</button>
          ) : (
            <button onClick={next} className={btnDark}>{idx === queue.length - 1 ? t("Voir le résultat") : t("Suivante →")}</button>
          )}
        </div>
      </div>
    );
  }

  /* ——— Accueil ——— */
  return (
    <div className="space-y-6">
      {back}
      <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <p className="display text-3xl text-ink">{t("Mes erreurs")}</p>
        <p className="mt-2 max-w-xl text-muted">
          {t("Chaque question ratée dans un QCM arrive ici, et revient au bon moment : demain, puis quelques jours plus tard. Après trois réussites de suite, elle est maîtrisée.")}
        </p>

        {stats.total + stats.mastered === 0 ? (
          <p className="mt-6 rounded-2xl bg-slide px-4 py-3.5 text-ink/80">
            {t("Aucune erreur pour l'instant. Fais un QCM dans un de tes cours : les questions ratées apparaîtront ici.")}
          </p>
        ) : (
          <>
            <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                [stats.due, t("à revoir aujourd'hui")],
                [stats.total, t("à surveiller")],
                [stats.mastered, t("maîtrisées")],
              ].map(([n, l]) => (
                <div key={String(l)} className="rounded-2xl bg-slide px-2 py-4">
                  <dt className="display text-4xl text-ink">{n}</dt>
                  <dd className="mt-1 text-xs text-muted">{l}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {stats.due > 0 ? (
                <button onClick={start} disabled={busy} className={btnDark}>
                  {busy ? t("Chargement…") : t("Réviser {a} questions", { a: Math.min(stats.due, SESSION) })}
                </button>
              ) : (
                <p className="text-ink/80">{t("Rien à revoir aujourd'hui. Reviens demain.")}</p>
              )}
              {docId && (
                <Link href="/app/erreurs" className={btnLine}>{t("Toutes mes erreurs")}</Link>
              )}
            </div>
          </>
        )}
      </div>

      {!docId && stats.byDoc.length > 0 && (
        <div>
          <h3 className="display text-2xl text-ink">{t("Par cours")}</h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {stats.byDoc.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/app/erreurs?doc=${encodeURIComponent(d.id)}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 transition hover:border-ink"
                >
                  <span dir="auto" className="min-w-0 flex-1 truncate font-semibold text-ink">{d.name || t("Cours")}</span>
                  <span className="shrink-0 text-sm text-muted">
                    {d.due > 0 ? t("{a} à revoir", { a: d.due }) : t("{a} à surveiller", { a: d.total })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
