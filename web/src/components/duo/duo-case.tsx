"use client";

import { useMemo, useState } from "react";
import { Markdown } from "@/components/chat/markdown";
import { askDuoAi, submitDuoText, type DuoAnswer, type DuoCase, type DuoState } from "@/lib/duo";
import { dirOf } from "@/lib/dir";
import { DuoChat } from "./duo-chat";
import { btnDark, DuoShell } from "./duo-shell";
import { useT } from "@/lib/app-i18n";

type Props = {
  st: DuoState;
  refresh: () => Promise<void>;
  expired: boolean;
  error: string | null;
  setError: (e: string | null) => void;
};

const textOf = (a: DuoAnswer | undefined) => (typeof a?.sel === "string" ? a.sel : "");

/** Cas clinique à deux : chacun raisonne étape par étape, voit le raisonnement de l'autre après le sien, puis Dr. Ahmed compare. */
export function DuoCaseSession({ st, refresh, expired, error, setError }: Props) {
  const t = useT();
  const c = st.payload as DuoCase;
  const other = st.members.find((m) => m.user_id !== st.me) ?? null;
  const otherName = other?.name.trim() || "Ton partenaire";
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState(false);

  const { mine, theirs } = useMemo(() => {
    const mine = new Map<number, DuoAnswer>();
    const theirs = new Map<number, DuoAnswer>();
    for (const a of st.answers) (a.user_id === st.me ? mine : theirs).set(a.idx, a);
    return { mine, theirs };
  }, [st.answers, st.me]);

  const step = mine.size; // étape à faire : 0 à 3, 4 = diagnostic final, 5 = terminé
  const finished = step >= 5;
  const bothFinished = finished && !!other?.finished;
  const feedback = st.messages.find((m) => m.tag === "feedback");
  const labels = [...c.stages.map((s) => s.label), "Diagnostic final"];

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    const r = await submitDuoText(st.code, step, body);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setError(null);
    setDraft("");
    await refresh();
  }

  async function compare() {
    setComparing(true);
    setError(null);
    const r = await askDuoAi(st.code, "case_feedback");
    setComparing(false);
    if (r.error) setError(r.error);
    await refresh();
  }

  const answers = (i: number) => (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl bg-slide px-4 py-3">
        <p className="text-sm text-muted">{t("Toi")}</p>
        <p dir="auto" className="mt-1 whitespace-pre-wrap text-ink">
          {textOf(mine.get(i))}
        </p>
      </div>
      <div className="rounded-2xl bg-slide px-4 py-3">
        <p className="text-sm text-muted">{otherName}</p>
        <p dir="auto" className="mt-1 whitespace-pre-wrap text-ink">
          {theirs.has(i) ? textOf(theirs.get(i)) : other ? t("Pas encore répondu") : "—"}
        </p>
      </div>
    </div>
  );

  return (
    <DuoShell st={st} total={5} expired={expired} error={error}>
      <section dir={dirOf(c.title + c.context)} className="mt-5 rounded-2xl border border-line bg-white p-6 sm:p-8">
        <p className="label text-muted">{t("Cas clinique · fictif, à visée pédagogique")}</p>
        <p className="display mt-2 text-2xl text-ink">{finished ? c.title : t("Cas clinique")}</p>
        {c.context && <p className="mt-3 text-ink/85">{c.context}</p>}

        {Array.from({ length: Math.min(step + 1, 5) }, (_, i) => i).map((i) => {
          const answered = mine.has(i);
          return (
            <div key={i} className="mt-6 border-t border-line pt-5">
              <p className="label text-muted">{t("Étape {a} · {b}", { a: i + 1, b: t(labels[i]) })}</p>
              {i < 4 && <p className="mt-2 text-ink/90">{c.stages[i].reveal}</p>}
              <p className="display mt-3 text-xl text-ink">{i < 4 ? c.stages[i].prompt : t("Quel est ton diagnostic final, et pourquoi ?")}</p>
              {answered ? (
                answers(i)
              ) : (
                <div className="mt-3">
                  <label htmlFor="duo-case-answer" className="sr-only">{t("Ton raisonnement")}</label>
                  <textarea
                    id="duo-case-answer"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={4}
                    maxLength={1500}
                    disabled={expired}
                    placeholder={t("Écris ton raisonnement…")}
                    className="w-full resize-y rounded-2xl border border-line bg-slide px-4 py-3 text-ink focus:border-ink focus:outline-none"
                  />
                  <button onClick={submit} disabled={!draft.trim() || busy || expired} className={`mt-3 ${btnDark}`}>
                    {busy ? t("Validation…") : t("Valider ma réponse")}
                  </button>
                  <p className="mt-2 text-sm text-muted">{t("Tu vois la réponse de {a} dès que tu as validé la tienne.", { a: otherName })}</p>
                </div>
              )}
            </div>
          );
        })}

        {finished && (
          <div className="mt-6 border-t border-line pt-5">
            <p className="label" style={{ color: "var(--eosin-text)" }}>{t("Diagnostic")}</p>
            <p className="display mt-2 text-2xl text-ink">{c.diagnosis}</p>
            {c.differentials && (
              <>
                <p className="label mt-4 text-muted">{t("Diagnostics différentiels")}</p>
                <p className="mt-1 text-ink/85">{c.differentials}</p>
              </>
            )}
            <p className="label mt-4 text-muted">{t("Raisonnement")}</p>
            <p className="mt-1 text-ink/85">{c.reasoning}</p>
            <p className="label mt-4 text-muted">{t("Conduite à tenir")}</p>
            <p className="mt-1 text-ink/85">{c.management}</p>
          </div>
        )}
      </section>

      {finished && (
        <section className="mt-5 rounded-2xl border border-line bg-eosin-soft p-5">
          <p className="font-semibold text-ink">{t("Comparer vos raisonnements")}</p>
          {feedback ? (
            <div dir="auto" className="mt-3 text-[15px] text-ink">
              <Markdown>{feedback.body}</Markdown>
            </div>
          ) : bothFinished ? (
            <>
              <p className="mt-1 text-ink/80">{t("Vous avez tous les deux terminé. Dr. Ahmed compare vos raisonnements avec celui du cas, et dit ce que chacun peut apprendre de l'autre.")}</p>
              <button onClick={compare} disabled={comparing || expired} className={`mt-3 ${btnDark}`}>
                {comparing ? t("Dr. Ahmed réfléchit…") : t("Demander à Dr. Ahmed")}
              </button>
            </>
          ) : (
            <p className="mt-1 text-ink/80">{t("Dès que {a} a terminé le cas, Dr. Ahmed pourra comparer vos deux raisonnements.", { a: otherName })}</p>
          )}
        </section>
      )}

      <DuoChat st={st} refresh={refresh} setError={setError} expired={expired} />
    </DuoShell>
  );
}
