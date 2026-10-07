"use client";

import { useMemo, useState } from "react";
import { rateDuo, type DuoAnswer, type DuoCard, type DuoState } from "@/lib/duo";
import { DuoChat } from "./duo-chat";
import { btnDark, btnLine, DuoShell } from "./duo-shell";
import { useT } from "@/lib/app-i18n";

type Props = {
  st: DuoState;
  refresh: () => Promise<void>;
  expired: boolean;
  error: string | null;
  setError: (e: string | null) => void;
};

const known = (a: DuoAnswer | undefined) => !!a && Array.isArray(a.sel) && (a.sel as string[])[0] === "known";

/** Flashcards à deux : chacun parcourt le même jeu, se note, puis on compare ce que l'un sait et l'autre non. */
export function DuoFlash({ st, refresh, expired, error, setError }: Props) {
  const t = useT();
  const cards = st.payload as DuoCard[];
  const total = cards.length;
  const other = st.members.find((m) => m.user_id !== st.me) ?? null;
  const otherName = other?.name.trim() || "Ton partenaire";
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);

  const { mine, theirs } = useMemo(() => {
    const mine = new Map<number, DuoAnswer>();
    const theirs = new Map<number, DuoAnswer>();
    for (const a of st.answers) (a.user_id === st.me ? mine : theirs).set(a.idx, a);
    return { mine, theirs };
  }, [st.answers, st.me]);

  const next = cards.findIndex((_, i) => !mine.has(i));
  const myKnown = [...mine.values()].filter((a) => known(a)).length;
  const theirKnown = [...theirs.values()].filter((a) => known(a)).length;

  async function rate(k: boolean) {
    if (busy || next < 0) return;
    setBusy(true);
    const r = await rateDuo(st.code, next, k);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setError(null);
    setFlipped(false);
    await refresh();
  }

  const lastIdx = [...mine.keys()].sort((a, b) => b - a)[0];
  const lastTheirs = lastIdx !== undefined ? theirs.get(lastIdx) : undefined;

  if (next < 0) {
    const bothUnknown: number[] = [];
    const theyTeach: number[] = [];
    const youTeach: number[] = [];
    cards.forEach((_, i) => {
      const a = known(mine.get(i));
      const b = known(theirs.get(i));
      if (!theirs.has(i)) return;
      if (!a && !b) bothUnknown.push(i);
      else if (!a && b) theyTeach.push(i);
      else if (a && !b) youTeach.push(i);
    });
    const group = (title: string, list: number[]) =>
      list.length > 0 && (
        <div className="mt-6">
          <p className="font-semibold text-ink">{title}</p>
          <ul className="mt-2 space-y-2">
            {list.map((i) => (
              <li key={i} dir="auto" className="rounded-2xl border border-line px-4 py-3">
                <p className="font-semibold text-ink">{cards[i].front}</p>
                <p className="mt-1 text-ink/80">{cards[i].back}</p>
              </li>
            ))}
          </ul>
        </div>
      );
    return (
      <DuoShell st={st} total={total} expired={expired} error={error}>
        <section className="mt-5 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <p className="label text-muted">{t("Résultat")}</p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted">{t("Toi")}</p>
              <p className="display text-5xl text-ink">
                {myKnown}
                <span className="text-xl text-muted"> / {total}</span>
              </p>
              <p className="text-sm text-muted">{t("cartes sues")}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{other ? otherName : t("Partenaire")}</p>
              {other ? (
                <>
                  <p className="display text-5xl text-ink">
                    {theirKnown}
                    <span className="text-xl text-muted"> / {total}</span>
                  </p>
                  {!other.finished && <p className="text-sm text-muted">{t("Il lui reste des cartes : son score peut encore changer.")}</p>}
                </>
              ) : (
                <p className="mt-2 text-muted">{t("Personne n'a encore rejoint.")}</p>
              )}
            </div>
          </div>
          {group(t("À revoir ensemble : aucun de vous deux ne les savait"), bothUnknown)}
          {group(t("{a} peut t'expliquer", { a: otherName }), theyTeach)}
          {group(t("Tu peux expliquer à {a}", { a: otherName }), youTeach)}
        </section>
        <DuoChat st={st} refresh={refresh} setError={setError} expired={expired} />
      </DuoShell>
    );
  }

  const card = cards[next];
  return (
    <DuoShell st={st} total={total} expired={expired} error={error}>
      <section className="mt-5">
        <p className="label text-muted">{t("Carte {a} sur {b}", { a: mine.size + 1, b: total })}{card.chapter ? ` · ${card.chapter}` : ""}
        </p>
        <button
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? t("Voir la question") : t("Voir la réponse")}
          className={`mt-3 flex min-h-[15rem] w-full flex-col items-center justify-center rounded-3xl p-8 text-center transition-colors sm:min-h-[18rem] ${
            flipped ? "text-white ring-1 ring-eosin/40" : "bg-white text-ink ring-1 ring-line"
          }`}
          style={flipped ? { backgroundImage: "linear-gradient(135deg, rgba(7,169,151,0.85), #0B1E34 85%)", backgroundColor: "#0B1E34" } : undefined}
        >
          <span className={`label ${flipped ? "text-white/70" : "text-muted"}`}>{flipped ? t("Réponse") : t("Question")}</span>
          <span dir="auto" className="display mt-4 text-2xl leading-snug sm:text-3xl">
            {flipped ? card.back : card.front}
          </span>
          <span className={`mt-6 text-sm ${flipped ? "text-white/70" : "text-muted"}`}>
            {flipped ? t("Réponds honnêtement : tu vois ensuite ce qu'en dit ton partenaire") : t("Essaie de répondre de tête, puis touche la carte")}
          </span>
        </button>
        {flipped && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => rate(false)} disabled={busy || expired} className={btnLine}>{t("Je ne savais pas")}</button>
            <button onClick={() => rate(true)} disabled={busy || expired} className={btnDark}>{t("Je savais")}</button>
          </div>
        )}
        {lastTheirs && (
          <p className="mt-4 rounded-2xl bg-slide px-4 py-3 text-sm text-ink">
            {known(lastTheirs) ? t("{a} savait la carte précédente.", { a: otherName }) : t("{a} ne savait pas la carte précédente.", { a: otherName })}
          </p>
        )}
      </section>
      <DuoChat st={st} refresh={refresh} setError={setError} expired={expired} />
    </DuoShell>
  );
}
