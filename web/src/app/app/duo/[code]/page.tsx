"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KEYS, scoreQcm, type Key } from "@/lib/course";
import { answerDuo, duoLink, getDuoState, sendDuo, type DuoAnswer, type DuoState } from "@/lib/duo";
import { useT } from "@/lib/app-i18n";
import { DuoCaseSession } from "@/components/duo/duo-case";
import { DuoFlash } from "@/components/duo/duo-flash";
import { DuoRoom } from "@/components/duo/duo-room";

const btnDark =
  "rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40";
const btnLine =
  "rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink disabled:opacity-40";

const POLL_MS = 3000;
const picks = (sel: Key[], none: string) => (sel.length ? sel.join(", ") : none);

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  const t = useT();
  return (
    <div className="min-w-0 flex-1">
      <p className="flex justify-between gap-2 text-sm">
        <span className="truncate font-semibold text-ink">{t(label)}</span>
        <span className="shrink-0 text-muted">
          {n}/{total}
        </span>
      </p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slide">
        <div className="h-full rounded-full bg-eosin transition-[width] duration-500" style={{ width: `${(n / total) * 100}%` }} />
      </div>
    </div>
  );
}

export default function DuoSession({ params }: { params: Promise<{ code: string }> }) {
  const t = useT();
  const { code } = use(params);
  const [st, setSt] = useState<DuoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, Key[]>>({});
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"play" | "result">("play");
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const started = useRef(false);

  const refresh = useCallback(async () => {
    const r = await getDuoState(code);
    if (r.error || !r.data) {
      setError(r.error);
      return;
    }
    const data = r.data;
    setError(null);
    setSt(data);
    setExpired(new Date(data.expires_at) < new Date());
    if (!started.current) {
      // Première ouverture : première question non validée, ou le résultat si tout est fait.
      started.current = true;
      const done = new Set(data.answers.filter((a) => a.user_id === data.me).map((a) => a.idx));
      const first = data.questions.findIndex((_, i) => !done.has(i));
      if (first === -1) setView("result");
      else setIdx(first);
    }
  }, [code]);

  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(iv);
    };
  }, [refresh]);

  const d = useMemo(() => {
    if (!st) return null;
    const other = st.members.find((m) => m.user_id !== st.me) ?? null;
    const mine = new Map<number, DuoAnswer>();
    const theirs = new Map<number, DuoAnswer>();
    for (const a of st.answers) (a.user_id === st.me ? mine : theirs).set(a.idx, a);
    const sum = (m: Map<number, DuoAnswer>) => [...m.values()].reduce((n, a) => n + a.points, 0);
    return { other, mine, theirs, myPts: sum(mine), theirPts: sum(theirs) };
  }, [st]);

  if (error && !st) {
    return (
      <div className="max-w-xl">
        <p className="display text-3xl text-ink">{t("Session introuvable")}</p>
        <p role="alert" className="mt-3 rounded-2xl bg-[#fff1f0] px-4 py-3 text-[#a3271c]">
          {t(error)}
        </p>
        <Link href="/app/duo" className={`mt-5 inline-block ${btnDark}`}>{t("Retour à la révision à deux")}</Link>
      </div>
    );
  }
  if (!st || !d) return <p className="text-muted">{t("Chargement de la session…")}</p>;

  // Les autres façons de réviser à deux ont leur propre écran ; les QCM restent ici.
  if (st.kind && st.kind !== "qcm") {
    const common = { st, refresh, expired, error, setError };
    if (st.kind === "flashcards") return <DuoFlash {...common} />;
    if (st.kind === "case") return <DuoCaseSession {...common} />;
    return <DuoRoom {...common} />;
  }

  const total = st.questions.length;
  const otherName = d.other?.name.trim() || t("Ton partenaire");
  const myDone = d.mine.size >= total;
  const q = st.questions[idx];
  const validated = d.mine.has(idx);
  const chosen: Key[] = validated ? (d.mine.get(idx)!.sel as Key[]) : (drafts[idx] ?? []);
  const theirAns = validated ? d.theirs.get(idx) : undefined;

  async function validate() {
    if (busy || validated || chosen.length === 0) return;
    setBusy(true);
    const r = await answerDuo(code, idx, chosen);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setError(null);
    await refresh();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const r = await sendDuo(code, body);
    if (r.error) setError(r.error);
    await refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(duoLink(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* copie refusée : le lien reste affiché */
    }
  }

  const wa = `https://wa.me/?text=${encodeURIComponent(`Révise avec moi sur Axone : ${duoLink(code)} (code ${code})`)}`;

  return (
    <div className="max-w-3xl">
      <Link href="/app/duo" className="text-sm font-semibold text-ink/70 transition hover:text-ink">{t("← Révision à deux")}</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <p dir="auto" className="display text-2xl text-ink sm:text-3xl">{st.title || t("Série de QCM")}</p>
        <p className="label rounded-full bg-slide px-3 py-1.5 text-muted">{t("Code")}{" "}<span className="font-mono tracking-widest text-ink">{st.code}</span>
        </p>
      </div>

      {!d.other && (
        <section className="mt-5 rounded-2xl border border-line bg-eosin-soft p-5">
          <p className="font-semibold text-ink">{t("En attente de ton partenaire")}</p>
          <p className="mt-1 text-ink/80">{t("Envoie-lui ce lien. Il pourra rejoindre gratuitement. Tu peux déjà commencer.")}</p>
          <p className="mt-3 break-all rounded-xl bg-white px-3 py-2 font-mono text-sm text-ink">{duoLink(st.code)}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button onClick={copy} className={btnLine}>
              {copied ? t("Lien copié") : t("Copier le lien")}
            </button>
            <a href={wa} target="_blank" rel="noreferrer" className={btnDark}>{t("Envoyer sur WhatsApp")}</a>
          </div>
        </section>
      )}

      <div className="mt-5 flex gap-5 rounded-2xl border border-line bg-white p-4">
        <Bar label={t("Toi")} n={d.mine.size} total={total} />
        {d.other ? <Bar label={otherName} n={d.other.answered} total={total} /> : <p className="flex-1 text-sm text-muted">{t("Pas encore de partenaire.")}</p>}
      </div>

      {expired && (
        <p className="mt-4 rounded-2xl bg-slide px-4 py-3 text-ink">{t("Cette session est terminée : tu peux revoir les réponses, plus en ajouter.")}</p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
          {t(error)}
        </p>
      )}

      {view === "result" ? (
        <section className="mt-5 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <p className="label text-muted">{t("Résultat")}</p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted">{t("Toi")}</p>
              <p className="display text-5xl text-ink">
                {d.myPts}
                <span className="text-xl text-muted"> / {total * 10}</span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">{d.other ? otherName : t("Partenaire")}</p>
              {d.other ? (
                <>
                  <p className="display text-5xl text-ink">
                    {d.theirPts}
                    <span className="text-xl text-muted"> / {total * 10}</span>
                  </p>
                  {!d.other.finished && (
                    <p className="mt-1 text-sm text-muted">{t("Il lui reste des questions : son score peut encore changer.")}</p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-muted">{t("Personne n'a encore rejoint.")}</p>
              )}
            </div>
          </div>
          <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {st.questions.map((qq, i) => {
              const mineA = d.mine.get(i);
              const theirA = d.theirs.get(i);
              return (
                <li key={i}>
                  <button
                    onClick={() => {
                      setIdx(i);
                      setView("play");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-slide"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slide text-sm font-bold text-ink">{i + 1}</span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-ink/85">{qq.question}</span>
                    <span className="shrink-0 text-end text-sm font-semibold text-ink">
                      {mineA ? mineA.points : "—"} · {theirA ? theirA.points : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">{t("Chaque ligne : tes points, puis ceux de {a}.", { a: d.other ? otherName : t("ton partenaire") })}</p>
          <button
            onClick={() => {
              setIdx(0);
              setView("play");
            }}
            className={`mt-5 ${btnLine}`}
          >{t("Revoir la correction")}</button>
        </section>
      ) : (
        <section className="mt-5 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <nav aria-label={t("Questions")} className="flex flex-wrap gap-2">
            {st.questions.map((qq, i) => {
              const a = d.mine.get(i);
              const r = a ? scoreQcm(a.sel as Key[], qq.bonnesReponses).result : null;
              const tone =
                i === idx
                  ? "bg-ink text-white"
                  : r === "COMPLET"
                    ? "bg-eosin text-ink"
                    : r === "PARTIEL"
                      ? "bg-[#ffd699] text-ink"
                      : r === "FAUX"
                        ? "bg-[#f3b4ad] text-ink"
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
              const isPicked = chosen.includes(k);
              const style = validated
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
                  disabled={validated || expired}
                  onClick={() =>
                    setDrafts((s) => {
                      const cur = s[idx] ?? [];
                      return { ...s, [idx]: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] };
                    })
                  }
                  aria-pressed={isPicked}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-start text-[15px] transition ${style}`}
                >
                  <span className="label mt-0.5 w-4 shrink-0">{k}</span>
                  <span dir="auto" className="flex-1">
                    {q.propositions[k]}
                    {validated && <span className="mt-1.5 block text-sm text-muted">{q.explication[k]}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {validated && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <p className="rounded-2xl bg-slide px-4 py-3 text-ink">
                <span className="block text-sm text-muted">{t("Toi")}</span>
                <span className="font-semibold">{t("{a} · {b} pts", { a: picks(d.mine.get(idx)!.sel as Key[], t("Sans réponse")), b: d.mine.get(idx)!.points })}</span>
              </p>
              <p className="rounded-2xl bg-slide px-4 py-3 text-ink">
                <span className="block text-sm text-muted">{otherName}</span>
                <span className="font-semibold">
                  {theirAns ? t("{a} · {b} pts", { a: picks(theirAns.sel as Key[], t("Sans réponse")), b: theirAns.points }) : d.other ? t("Pas encore répondu") : "—"}
                </span>
              </p>
            </div>
          )}
          {validated && q.commentaire && (
            <div className="mt-3 rounded-2xl border border-line bg-slide px-4 py-3.5">
              <p className="label text-muted">{t("Pourquoi ?")}</p>
              <p dir="auto" className="mt-1.5 text-[15px] leading-relaxed text-ink">{q.commentaire}</p>
            </div>
          )}
          {!validated && d.other && d.other.answered > 0 && (
            <p className="mt-4 text-sm text-muted">{t("Les réponses de {a} s'affichent une fois que tu as validé la question.", { a: otherName })}</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className={btnLine}>{t("← Précédente")}</button>
            {!validated && (
              <button onClick={validate} disabled={busy || chosen.length === 0 || expired} className={btnDark}>
                {busy ? t("Validation…") : t("Valider")}
              </button>
            )}
            {idx < total - 1 ? (
              <button onClick={() => setIdx((i) => i + 1)} className={validated ? btnDark : btnLine}>{t("Suivante →")}</button>
            ) : (
              myDone && (
                <button onClick={() => setView("result")} className={btnDark}>{t("Voir le résultat")}</button>
              )
            )}
          </div>
          {!myDone && idx === total - 1 && (
            <p className="mt-3 text-sm text-muted">{t("Valide toutes les questions pour voir le résultat de la session.")}</p>
          )}
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-line bg-white p-5">
        <p className="font-semibold text-ink">{t("Discussion")}</p>
        {st.messages.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("Écris un petit mot à {a} : il apparaîtra ici.", { a: d.other ? otherName : t("ton partenaire") })}</p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {st.messages.map((m) => {
              const mineMsg = m.user_id === st.me;
              return (
                <li key={m.id} className={`flex ${mineMsg ? "justify-end" : "justify-start"}`}>
                  <span dir="auto" className={`max-w-[85%] rounded-2xl px-4 py-2 text-[15px] ${mineMsg ? "bg-ink text-white" : "bg-slide text-ink"}`}>
                    {m.body}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={send} className="mt-3 flex gap-2">
          <label htmlFor="duo-msg" className="sr-only">{t("Ton message")}</label>
          <input
            id="duo-msg"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            disabled={expired}
            placeholder={t("Ton message")}
            className="min-w-0 flex-1 rounded-full border border-line bg-slide px-4 py-2.5 text-ink focus:border-ink focus:outline-none"
          />
          <button type="submit" disabled={!text.trim() || expired} className={btnDark}>{t("Envoyer")}</button>
        </form>
      </section>
    </div>
  );
}
