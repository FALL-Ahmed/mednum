"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { askAI, QuotaError } from "@/lib/ai";
import { KEYS, parseQcm, qcmPrompt, scoreQcm, type DocumentRow, type Key, type Qcm } from "@/lib/course";
import { createDuo } from "@/lib/duo";
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
import { UpgradeNudge } from "./upgrade-nudge";
import { CardDialog } from "./card-dialog";
import { draftFromQcm, type CardDraft } from "@/lib/user-cards";
import { ReportButton } from "./report-button";
import { ErrorsEntry } from "./errors-entry";
import { recordAnswer } from "@/lib/qcm-review";
import { formatDate, useT } from "@/lib/app-i18n";

type Active = {
  id: string | null;
  chapter: string;
  questions: Qcm[];
  answers: Answer[];
  finished: boolean;
};

const dateShort = (iso: string) =>
  formatDate(new Date(iso), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const pointsOf = (a: Active) =>
  a.questions.reduce((sum, q, i) => (a.answers[i]?.done ? sum + scoreQcm(a.answers[i].sel, q.bonnesReponses).points : sum), 0);

const btnDark =
  "rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40";
const btnLine =
  "rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink disabled:opacity-40";

export function QcmTab({ doc }: { doc: DocumentRow }) {
  const t = useT();
  const { user, profile, quota, refreshQuota } = useApp();
  const router = useRouter();
  const isDuo = quota?.plan === "premium";
  const [duoBusy, setDuoBusy] = useState(false);
  const [duoMsg, setDuoMsg] = useState<string | null>(null);
  const [duoUpsell, setDuoUpsell] = useState(false);
  const chapters = (doc.chunks ?? []).filter((c) => c.content && c.content.length > 300);
  const [chapter, setChapter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [idx, setIdx] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);
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
            ? t("Les QCM n'ont pas pu être générés. Réessaie.")
            : e instanceof Error
              ? e.message
              : t("Une erreur est survenue."),
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

  /** Réviser à deux : copie les questions dans une nouvelle session, puis ouvre-la. */
  async function startDuo(title: string, questions: Qcm[]) {
    setDuoMsg(null);
    if (!isDuo) {
      setDuoUpsell(true);
      return;
    }
    setDuoBusy(true);
    const r = await createDuo(title, questions, profile.name);
    if (r.error || !r.data) {
      setDuoMsg(r.error);
      setDuoBusy(false);
      return;
    }
    router.push(`/app/duo/${r.data}`);
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
    // Une question ratée (faux ou partiel) entre dans « Mes erreurs »
    recordAnswer(doc, active.chapter, active.questions[idx], active.answers[idx].sel);
  }

  function finish() {
    if (!active) return;
    // Les questions cochées mais pas validées une à une comptent aussi
    active.questions.forEach((qq, i) => {
      const a = active.answers[i];
      if (!a.done && a.sel.length > 0) recordAnswer(doc, active.chapter, qq, a.sel);
    });
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
        <p className="display text-2xl text-ink">{t("Ce document n'a pas assez de texte pour des QCM.")}</p>
        <p className="mt-2 max-w-lg text-muted">{t("Ajoute un document plus complet, ou des photos plus nettes de tes pages.")}</p>
      </div>
    );
  }

  /* ——— Accueil : nouvelle série + historique ——— */
  if (!active) {
    return (
      <div className="space-y-6">
        <ErrorsEntry docId={doc.id} />
        <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <p className="display text-2xl text-ink">{t("Nouvelle série de QCM")}</p>
          <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="chapter">{t("Chapitre")}</label>
          <select
            id="chapter"
            value={chapter}
            onChange={(e) => setChapter(Number(e.target.value))}
            className="mt-2 w-full rounded-2xl border border-line bg-slide px-4 py-3.5 text-ink focus:border-ink focus:outline-none"
          >
            {chapters.map((c, i) => (
              <option key={i} value={i}>
                {t(c.title)}
              </option>
            ))}
          </select>
          <button onClick={generate} disabled={loading} className={`mt-5 ${btnDark}`}>
            {loading ? t("Dr. Ahmed prépare tes QCM…") : t("Générer 5 QCM")}
          </button>
          {loading && <p className="mt-3 text-sm text-muted">{t("Ça prend en général 20 à 30 secondes. Ne ferme pas la page.")}</p>}
          {limit && (
            <div className="mt-5">
              <LimitNotice kind="qcm" onClose={() => setLimit(false)} />
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
              {t(error)}
            </p>
          )}
        </div>

        <div>
          <h3 className="display text-2xl text-ink">{t("Tes séries précédentes")}</h3>
          {history === null ? (
            <p className="mt-3 text-muted">{t("Chargement…")}</p>
          ) : !historyOk ? (
            <p className="mt-3 max-w-xl rounded-2xl border border-dashed border-line bg-white p-5 text-muted">{t("L'historique des QCM n'est pas encore activé sur ce compte. Tes séries ne sont pas enregistrées pour le moment.")}</p>
          ) : history.length === 0 ? (
            <p className="mt-3 text-muted">{t("Aucune série pour l'instant. Tes QCM seront enregistrés ici pour les réviser plus tard.")}</p>
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
                        <p dir="auto" className="mt-1.5 font-semibold leading-snug text-ink">{h.chapter_title}</p>
                      </div>
                      <button
                        onClick={() => setToDelete(h)}
                        aria-label={t("Supprimer cette série")}
                        title={t("Supprimer")}
                        className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-slide hover:text-[#a3271c]"
                      >{t("Supprimer")}</button>
                    </div>
                    {h.finished ? (
                      <p className="mt-4 flex items-baseline gap-2">
                        <span className="display text-3xl text-ink">{h.points}</span>
                        <span className="text-muted">/ {h.total} · {pct} %</span>
                      </p>
                    ) : (
                      <p className="mt-4 text-muted">{t(answered > 1 ? "En cours · {a} validées sur {b}" : "En cours · {a} validée sur {b}", { a: answered, b: total })}</p>
                    )}
                    <button onClick={() => open(h)} className={`mt-4 w-full ${h.finished ? btnLine : btnDark}`}>
                      {h.finished ? t("Revoir la correction") : t("Reprendre")}
                    </button>
                    <button
                      onClick={() => startDuo(h.chapter_title, h.questions)}
                      disabled={duoBusy}
                      className="mt-2 w-full rounded-full px-6 py-2.5 text-sm font-semibold text-ink/80 transition hover:bg-eosin-soft hover:text-ink disabled:opacity-40"
                    >
                      {duoBusy ? t("Création de la session…") : t("Réviser à deux")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {duoMsg && (
          <p role="alert" className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
            {t(duoMsg)}
          </p>
        )}
        {duoUpsell && (
          <div className="rounded-2xl bg-eosin-soft p-5">
            <p className="font-semibold text-ink">{t("Réviser à deux est réservé au plan Premium.")}</p>
            <p className="mt-1 text-ink/80">{t("Tu invites un ami, qui participe gratuitement, et vous comparez vos réponses.")}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/app/abonnement" className={btnDark}>{t("Voir le plan Premium")}</Link>
              <button onClick={() => setDuoUpsell(false)} className={btnLine}>{t("Plus tard")}</button>
            </div>
          </div>
        )}

        {toDelete && (
          <ConfirmDialog
            title={t("Supprimer cette série ?")}
            text={t("La série « {a} » du {b} sera supprimée définitivement.", { a: toDelete.chapter_title, b: dateShort(toDelete.created_at) })}
            confirmLabel={t("Supprimer la série")}
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
        <p className="label text-muted">{t("Résultat · {a}", { a: active.chapter })}</p>
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
                  className="flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-slide"
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      !r ? "bg-slide text-muted" : r.result === "COMPLET" ? "bg-eosin text-ink" : r.result === "PARTIEL" ? "bg-[#ffd699] text-ink" : "bg-[#f3b4ad] text-ink"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span dir="auto" className="min-w-0 flex-1 truncate text-ink/85">{q.question}</span>
                  <span className="shrink-0 text-sm font-semibold text-ink">
                    {!r ? t("Sans réponse") : `${r.points} pts`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <UpgradeNudge points={pts} total={total} />
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => {
              setIdx(0);
              setShowResult(false);
            }}
            className={btnLine}
          >{t("Revoir la correction")}</button>
          <button onClick={leave} className={btnDark}>{t("Terminer")}</button>
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
        <button onClick={leave} className="text-sm font-semibold text-ink/70 transition hover:text-ink">{t("← Mes séries")}</button>
        <div className="flex items-center gap-3">
          <p dir="auto" className="label text-muted">{active.chapter}</p>
          <button
            onClick={() => startDuo(active.chapter, active.questions)}
            disabled={duoBusy}
            className="rounded-full border border-ink/25 px-4 py-1.5 text-sm font-semibold text-ink transition hover:border-ink disabled:opacity-40"
          >
            {duoBusy ? t("Création…") : t("Réviser à deux")}
          </button>
        </div>
      </div>
      {duoMsg && (
        <p role="alert" className="mt-3 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
          {t(duoMsg)}
        </p>
      )}
      {duoUpsell && (
        <p className="mt-3 rounded-2xl bg-eosin-soft px-4 py-3 text-ink">{t("Réviser à deux est réservé au plan Premium.")}<Link href="/app/abonnement" className="font-semibold underline">{t("Voir le plan Premium")}</Link>
        </p>
      )}

      {/* Navigation libre entre les questions */}
      <nav aria-label={t("Questions")} className="mt-4 flex flex-wrap gap-2">
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
              aria-label={t("Question {a}", { a: i + 1 })}
              aria-current={i === idx ? "step" : undefined}
              className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition ${tone}`}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      <p className="label mt-6 text-muted">{t("Question {a} sur {b}", { a: idx + 1, b: total })}</p>
      <p dir="auto" className="display mt-3 text-2xl leading-snug text-ink">{q.question}</p>
      <p className="mt-2 text-sm text-muted">{t("Une ou plusieurs propositions sont exactes.")}</p>

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
            ? t("Sans réponse · 0 point")
            : `${result === "COMPLET" ? "Complet" : result === "PARTIEL" ? "Partiel" : "Faux"} · ${gained} points`}
        </p>
      )}

      {revealed && q.commentaire && (
        <div className="mt-3 rounded-2xl border border-line bg-slide px-4 py-3.5">
          <p className="label text-muted">{t("Pourquoi ?")}</p>
          <p dir="auto" className="mt-1.5 text-[15px] leading-relaxed text-ink">{q.commentaire}</p>
        </div>
      )}

      {revealed && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button
            onClick={() => setCardDraft(draftFromQcm(q, active.chapter, doc.id))}
            className="text-sm font-semibold text-ink underline underline-offset-2 transition hover:text-eosin"
          >
            ＋ {t("Ajouter à mes cartes")}
          </button>
          {cardDraft && <CardDialog draft={cardDraft} onClose={() => setCardDraft(null)} />}
          <ReportButton docId={doc.id} kind="qcm" itemRef={`${active.chapter} · Q${idx + 1}`} snapshot={q} label={t("Signaler une erreur dans cette question")} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className={btnLine}>{t("← Précédente")}</button>
        {!revealed && (
          <button onClick={validate} disabled={ans.sel.length === 0} className={btnDark}>{t("Valider")}</button>
        )}
        {!last ? (
          <button onClick={() => setIdx((i) => Math.min(total - 1, i + 1))} className={revealed ? btnDark : btnLine}>{t("Suivante →")}</button>
        ) : active.finished ? (
          <button onClick={() => setShowResult(true)} className={btnDark}>{t("Voir mon résultat")}</button>
        ) : (
          <button onClick={finish} className={revealed ? btnDark : btnLine}>{t("Terminer")}</button>
        )}
        {!active.finished && !last && (
          <button onClick={finish} className="ms-auto text-sm font-semibold text-ink/70 transition hover:text-ink">{t("Terminer maintenant")}</button>
        )}
      </div>
      {!active.finished && pending > 0 && last && (
        <p className="mt-3 text-sm text-muted">{t(pending > 1 ? "{a} questions pas encore validées : elles compteront 0 point si tu termines maintenant." : "{a} question pas encore validée : elle comptera 0 point si tu termines maintenant.", { a: pending })}</p>
      )}
      {active.finished && (
        <button onClick={() => setShowResult(true)} className="mt-4 text-sm font-semibold text-ink/70 transition hover:text-ink">{t("Voir le résultat de la série")}</button>
      )}
    </div>
  );
}
