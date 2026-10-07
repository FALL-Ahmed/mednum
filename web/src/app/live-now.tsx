"use client";

import { useEffect, useState } from "react";
import { SITE, type Lang } from "@/lib/site-i18n";

// Compteur « en ligne » : valeur d'ambiance qui suit le rythme de la journée (ce n'est pas une mesure réelle).
// Fourchette [min, max] par heure UTC (= heure de Nouakchott / Dakar) : creux la nuit, matin 10-30, après-midi 30-60, pic le soir jusqu'à 80.
// À remplacer par une vraie présence (Supabase Realtime) quand il y aura assez d'étudiants connectés.
const BY_HOUR: [number, number][] = [
  [12, 24], [6, 14], [3, 9], [2, 7], [2, 7], [4, 10], [8, 16], [10, 20],
  [10, 24], [10, 28], [10, 30], [10, 30], [22, 42], [30, 50], [30, 56], [30, 60],
  [32, 60], [40, 64], [48, 68], [56, 74], [62, 78], [64, 80], [54, 72], [30, 48],
];

// Fourchette de l'instant présent, interpolée entre l'heure courante et la suivante (pas de saut à l'heure pile).
function rangeNow(): [number, number] {
  const d = new Date();
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  const i = Math.floor(h);
  const f = h - i;
  const [a0, a1] = BY_HOUR[i];
  const [b0, b1] = BY_HOUR[(i + 1) % 24];
  return [Math.round(a0 + (b0 - a0) * f), Math.round(a1 + (b1 - a1) * f)];
}

const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

export function LiveNow({ lang }: { lang: Lang }) {
  // null au rendu serveur : le chiffre n'apparaît qu'après l'hydratation (évite un décalage serveur/client).
  const [target, setTarget] = useState<number | null>(null);
  const [shown, setShown] = useState<number | null>(null);

  // La cible change doucement : petit pas, rappel vers le milieu de la fourchette de l'heure.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const [lo, hi] = rangeNow();
      const mid = (lo + hi) / 2;
      const quarter = (hi - lo) / 4;
      setTarget((cur) => {
        if (cur === null) return rand(Math.round(mid - quarter), Math.round(mid + quarter));
        const pull = cur > mid + quarter ? -1 : cur < mid - quarter ? 1 : 0;
        const d = rand(-2, 2) + pull;
        return Math.min(hi, Math.max(lo, cur + (d === 0 ? 1 : d)));
      });
      timer = setTimeout(step, 60000);
    };
    step();
    return () => clearTimeout(timer);
  }, []);

  // Le chiffre affiché rejoint la cible de 1 en 1, lentement, au lieu de sauter.
  useEffect(() => {
    if (target === null) return;
    if (shown === null) {
      setShown(target);
      return;
    }
    if (shown === target) return;
    const id = setTimeout(() => setShown(shown + Math.sign(target - shown)), 700);
    return () => clearTimeout(id);
  }, [target, shown]);

  return (
    <p
      className="fixed bottom-4 left-4 z-40 flex items-center leading-none gap-3 rounded-full bg-ink w-max whitespace-nowrap py-3 px-6 text-base text-white shadow-[0_14px_40px_rgba(0,0,0,0.35)] ring-2 ring-emerald-400/60 sm:bottom-6 sm:left-6 sm:gap-3.5 sm:py-3.5 sm:px-7 sm:text-lg"
      aria-live="off"
    >
      <span className="relative flex h-3 w-3" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
      </span>
      <span className="inline-flex min-w-[2ch] items-center justify-center text-2xl font-extrabold tabular-nums leading-none text-emerald-300 sm:text-3xl">
        {shown ?? " "}
      </span>
      <span className="font-semibold leading-none">{SITE[lang].online}</span>
    </p>
  );
}
