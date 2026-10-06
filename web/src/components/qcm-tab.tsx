"use client";

import { useCallback, useEffect, useState } from "react";
import { askAI, QuotaError } from "@/lib/ai";
import { KEYS, parseQcm, qcmPrompt, scoreQcm, type DocumentRow, type Key, type Qcm } from "@/lib/course";
import { setFlag } from "@/lib/flags";
import {
  createQcmSet,
  deleteQcmSet,
  listQcmSets,
  updateQcmSet,
  type Answer,
  type QcmSetRow,
} from "@/lib/qcm-store";
import { useApp } from "./app-context";
import { ConfirmDialog } from "./confirm-dialog";
import { LimitNotice } from "./limit-notice";
import { ReportButton } from "./report-button";

type Active = {
  id: string | null;
  chapter: string;
  questions: Qcm[];
  answers: Answer[];
  finished: boolean;
};

const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const pointsOf = (a: Active) =>
  a.questions.reduce((sum, q, i) => (a.answers[i]?.done ? sum + scoreQcm(a.answers[i].sel, q.bonnesReponses).points : sum), 0);

const btnDark =
  "rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40";
const btnLine =
  "rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink disabled:opacity-40";

export function QcmTab({ doc }: { doc: DocumentRow }) {
  const { user, refreshQuota } = useApp();
  const chapters = (doc.chunks ?? []).filter((c) => c.content && c.content.length > 300);
  const [chapter, setChapter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [idx, setIdx] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [history, setHistory] = useState<QcmSetRow[] | null>(null);
  const [historyOk, setHistoryOk] = useState(true);
  const [toDelete, setToDelete] = useState<QcmSetRow | null>(null);

  const reload = useCallback(async () => {
    const r = await listQcmSets(doc.id);
    setHistory(r.rows);
    setHistoryOk(r.available);
  }, [doc.id]);

  useEffect(() => {
    let cancelled = false;
    listQcmSets(doc.id).then((r) => {
      if (cancelled) return;
      setHistory(r.rows);
      setHistoryOk(r.available);
    });
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  async function generate() {
    const c = chapters[chapter];
    if (!c) return;
    setLoading(true);
    setError(null);
    setLimit(false);
    try {
      const raw = await askAI({
        messages: [{ role: "user", content: qcmPrompt(c.title, c.content) }],
        maxTokens: 4500,
        kind: "qcm",
      });
      const questions = parseQcm(raw.trim());
      setFlag("qcm");
      const id = await createQcmSet(user.id, doc.id, c.title, questions);
      setActive({
        id,
        chapter: c.title,
        questions,
        answers: questions.map(() => ({ sel: [], done: false })),
        finished: false,
      });
      setIdx(0);
      setShowResult(false);
      reload();
    } catch (e) {
      if (e instanceof QuotaError) {
        setLimit(true);
        return;
      }
      setError(
        e instanceof Error && e.message === "format"
            ? "Les QCM n'ont pas pu être générés. Réessaie."
            : e instanceof Error
              ? e.message
              : "Une erreur est survenue.",
      );
    } finally {
      setLoading(false);
      refreshQuota();
    }
  }

  function open(row: QcmSetRow) {
    const answers = row.questions.map((_, i) => row.answers?.[i] ?? { sel: [], done: false });
    setActive({ id: row.id, chapter: row.chapter_title, questions: row.questions, answers, finished: row.finished });
    setIdx(0);
    setShowResult(false);
  }

  function persist(next: Active) {
    if (next.id) updateQcmSet(next.id, { answers: next.answers, points: pointsOf(next), finished: next.finished });
  }

  function toggle(k: Key) {
    setActive((a) => {
      if (!a || a.finished || a.answers[idx].done) return a;
      const cur = a.answers[idx].sel;
      const sel = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
      return { ...a, answers: a.answers.map((x, i) => (i === idx ? { ...x, sel } : x)) };
    });
  }

  function validate() {
    if (!active) return;
    const next = { ...active, answers: active.answers.map((x, i) => (i === idx ? { ...x, done: true } : x)) };
    setActive(next);
    persist(next);
  }

  function finish() {
    if (!active) return;
    const next = {
      ...active,
      finished: true,
      answers: active.answers.map((x) => ({ ...x, done: true })),
    };
    setActive(next);
    setShowResult(true);
    persist(next);
    reload();
  }

  function leave() {
    setActive(null);
    setShowResult(false);
    reload();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await deleteQcmSet(toDelete.id);
    setToDelete(null);
    reload();
  }

  if (chapters.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-white p-8">
        <p className="display text-2xl text-ink">Ce document n&apos;a pas assez de texte pour des QCM.</p>
        <p className="mt-2 max-w-lg text-muted">Vérifie que le PDF contient du texte sélectionnable (pas un scan).</p>
      </div>
    );
  }

  /* ——— Accueil : nouvelle série + historique ——— */
  if (!active) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <p className="display text-2xl text-ink">Nouvelle série de QCM</p>
          <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="chapter">
            Chapitre
          </label>
          <select
            id="chapter"
            value={chapter}
            onChange={(e) => setChapter(Number(e.target.value))}
            className="mt-2 w-full rounded-2xl border border-line bg-slide px-4 py-3.5 text-ink focus:border-ink focus:outline-none"
          >
            {chapters.map((c, i) => (
              <option key={i} value={i}>
                {c.title}
              </option>
            ))}
          </select>
          <button onClick={generate} disabled={loading} className={`mt-5 ${btnDark}`}>
            {loading ? "Dr. Ahmed prépare tes QCM…" : "Générer 5 QCM"}
          </button>
          {loading && <p className="mt-3 text-sm text-muted">Ça prend en général 20 à 30 secondes. Ne ferme pas la page.</p>}
          {limit && (
            <div className="mt-5">
              <LimitNotice kind="qcm" onClose={() => setLimit(false)} />
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
              {error}
            </p>
          )}
        </div>

        <div>
          <h3 className="display text-2xl text-ink">Tes séries précédentes</h3>
          {history === null ? (
            <p className="mt-3 text-muted">Chargement…</p>
          ) : !historyOk ? (
            <p className="mt-3 max-w-xl rounded-2xl border border-dashed border-line bg-white p-5 text-muted">
              L&apos;historique des QCM n&apos;est pas encore activé sur ce compte. Tes séries ne sont pas enregistrées pour le moment.
            </p>
          ) : history.length === 0 ? (
            <p className="mt-3 text-muted">Aucune série pour l&apos;instant. Tes QCM seront enregistrés ici pour les réviser plus tard.</p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {history.map((h) => {
                const answered = (h.answers ?? []).filter((a) => a?.done).length;
                const total = h.questions?.length ?? 0;
                const pct = h.total ? Math.round((h.points / h.total) * 100) : 0;
                return (
                  <li key={h.id} className="flex flex-col rounded-2xl border border-line bg-white p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="label text-muted">{dateShort(h.created_at)}</p>
                        <p className="mt-1.5 font-semibold leading-snug text-ink">{h.chapter_title}</p>
                      </div>
                      <button
                        onClick={() => setToDelete(h)}
                        aria-label="Supprimer cette série"
                        title="Supprimer"
                        className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-slide hover:text-[#a3271c]"
                      >
                        Supprimer
                      </button>
                    </div>
                    {h.finished ? (
                      <p className="mt-4 flex items-baseline gap-2">
                        <span className="display text-3xl text-ink">{h.points}</span>
                        <span className="text-muted">/ {h.total} · {pct} %</span>
                      </p>
                    ) : (
                      <p className="mt-4 text-muted">
                        En cours · {answered} validée{answered > 1 ? "s" : ""} sur {total}
                      </p>
                    )}
                    <button onClick={() => open(h)} className={`mt-4 w-full ${h.finished ? btnLine : btnDark}`}>
                      {h.finished ? "Revoir la correction" : "Reprendre"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {toDelete && (
          <ConfirmDialog
            title="Supprimer cette série ?"
            text={`La série « ${toDelete.chapter_title} » du ${dateShort(toDelete.created_at)} sera supprimée définitivement.`}
            confirmLabel="Supprimer la série"
            danger
            onConfirm={confirmDelete}
            onCancel={() => setToDelete(null)}
          />
        )}
      </div>
    );
  }

  /* ——— Résultat ——— */
  const total = active.questions.length;
  if (showResult || (active.finished && showResult)) {
    const pts = pointsOf(active);
    return (
      <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <p className="label text-muted">Résultat · {active.chapter}</p>
        <p className="display mt-3 text-6xl text-ink">
          {pts}
          <span className="text-2xl text-muted"> / {total * 10}</span>
        </p>
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {active.questions.map((q, i) => {
            const r = active.answers[i].sel.length === 0 ? null : scoreQcm(active.answers[i].sel, q.bonnesReponses);
            return (
              <li key={i}>
                <button
                  onClick={() => {
                    setIdx(i);
                    setShowResult(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slide"
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      !r ? "bg-slide text-muted" : r.result === "COMPLET" ? "bg-eosin text-ink" : r.result === "PARTIEL" ? "bg-[#ffd699] text-ink" : "bg-[#f3b4ad] text-ink"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink/85">{q.question}</span>
                  <span className="shrink-0 text-sm font-semibold text-ink">
                    {!r ? "Sans réponse" : `${r.points} pts`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => {
              setIdx(0);
              setShowResult(false);
            }}
            className={btnLine}
          >
            Revoir la correction
          </button>
          <button onClick={leave} className={btnDark}>
            Terminer
          </button>
        </div>
      </div>
    );
  }

  /* ——— Question ——— */
  const q = active.questions[idx];
  const ans = active.answers[idx];
  const revealed = ans.done || active.finished;
  const { result, points: gained } = scoreQcm(ans.sel, q.bonnesReponses);
  const last = idx === total - 1;
  const pending = active.answers.filter((a) => !a.done).length;

  return (
    <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={leave} className="text-sm font-semibold text-ink/70 transition hover:text-ink">
          ← Mes séries
        </button>
        <p className="label text-muted">{active.chapter}</p>
      </div>

      {/* Navigation libre entre les questions */}
      <nav aria-label="Questions" className="mt-4 flex flex-wrap gap-2">
        {active.questions.map((qq, i) => {
          const a = active.answers[i];
          const r = a.done ? scoreQcm(a.sel, qq.bonnesReponses).result : null;
          const tone =
            i === idx
              ? "bg-ink text-white"
              : r === "COMPLET"
                ? "bg-eosin text-ink"
                : r === "PARTIEL"
                  ? "bg-[#ffd699] text-ink"
                  : r === "FAUX"
                    ? "bg-[#f3b4ad] text-ink"
                    : a.sel.length > 0
                      ? "border-2 border-ink bg-white text-ink"
                      : "border border-line bg-white text-ink/70 hover:border-ink";
          return (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Question ${i + 1}`}
              aria-current={i === idx ? "step" : undefined}
              className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition ${tone}`}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      <p className="label mt-6 text-muted">
        Question {idx + 1} sur {total}
      </p>
      <p className="display mt-3 text-2xl leading-snug text-ink">{q.question}</p>
      <p className="mt-2 text-sm text-muted">Une ou plusieurs propositions sont exactes.</p>

      <div className="mt-5 space-y-2.5">
        {KEYS.map((k) => {
          const isGood = q.bonnesReponses.includes(k);
          const isPicked = ans.sel.includes(k);
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
              onClick={() => toggle(k)}
              aria-pressed={isPicked}
              className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left text-[15px] transition ${style}`}
            >
              <span className="label mt-0.5 w-4 shrink-0">{k}</span>
              <span className="flex-1">
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
            ans.sel.length === 0
              ? "bg-slide text-ink"
              : result === "COMPLET"
                ? "bg-eosin-soft text-ink"
                : result === "PARTIEL"
                  ? "bg-[#fff6e6] text-ink"
                  : "bg-[#fff1f0] text-ink"
          }`}
        >
          {ans.sel.length === 0
            ? "Sans réponse · 0 point"
            : `${result === "COMPLET" ? "Complet" : result === "PARTIEL" ? "Partiel" : "Faux"} · ${gained} points`}
        </p>
      )}

      {revealed && (
        <div className="mt-3">
          <ReportButton docId={doc.id} kind="qcm" itemRef={`${active.chapter} · Q${idx + 1}`} snapshot={q} label="Signaler une erreur dans cette question" />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className={btnLine}>
          ← Précédente
        </button>
        {!revealed && (
          <button onClick={validate} disabled={ans.sel.length === 0} className={btnDark}>
            Valider
          </button>
        )}
        {!last ? (
          <button onClick={() => setIdx((i) => Math.min(total - 1, i + 1))} className={revealed ? btnDark : btnLine}>
            Suivante →
          </button>
        ) : active.finished ? (
          <button onClick={() => setShowResult(true)} className={btnDark}>
            Voir mon résultat
          </button>
        ) : (
          <button onClick={finish} className={revealed ? btnDark : btnLine}>
            Terminer
          </button>
        )}
        {!active.finished && !last && (
          <button onClick={finish} className="ml-auto text-sm font-semibold text-ink/70 transition hover:text-ink">
            Terminer maintenant
          </button>
        )}
      </div>
      {!active.finished && pending > 0 && last && (
        <p className="mt-3 text-sm text-muted">
          {pending} question{pending > 1 ? "s" : ""} pas encore validée{pending > 1 ? "s" : ""} : elle{pending > 1 ? "s" : ""} compteront 0 point si tu termines maintenant.
        </p>
      )}
      {active.finished && (
        <button onClick={() => setShowResult(true)} className="mt-4 text-sm font-semibold text-ink/70 transition hover:text-ink">
          Voir le résultat de la série
        </button>
      )}
    </div>
  );
}
