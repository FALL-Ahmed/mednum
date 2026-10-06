"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/* Scène jouée en boucle : une question se tape, Dr. Ahmed répond d'après le cours. Exemples de démonstration. */
const SCRIPT = [
  {
    q: "Pourquoi l'insuffisance cardiaque gauche donne un œdème pulmonaire ?",
    a: "Le sang s'accumule en amont du ventricule gauche : la pression monte dans les veines pulmonaires et le plasma passe dans les alvéoles.",
    keep: "gauche = poumons, droite = corps.",
    src: "Cardiologie · p. 42",
  },
  {
    q: "Quel est le mécanisme des IEC ?",
    a: "Ils bloquent l'enzyme de conversion : moins d'angiotensine II, donc vasodilatation et baisse de l'aldostérone.",
    keep: "effet indésirable typique : la toux sèche.",
    src: "Pharmacologie · p. 118",
  },
  {
    q: "Bactériostatique ou bactéricide, quelle différence ?",
    a: "Un bactériostatique bloque la multiplication des bactéries : c'est ensuite le système immunitaire qui les élimine. Un bactéricide les détruit directement.",
    keep: "stase = elle s'arrête, cide = elle meurt.",
    src: "Infectiologie · p. 27",
  },
];

type Phase = "typing" | "thinking" | "answer";

const MOTION = "(prefers-reduced-motion: reduce)";
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(MOTION);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(MOTION).matches,
    () => false,
  );
}

export function HeroDemo() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState(0);
  // Mouvement réduit : on montre une réponse complète, sans animation.
  const still = useReducedMotion();

  const s = SCRIPT[i];
  const shownPhase: Phase = still ? "answer" : phase;
  const shownTyped = still ? s.q.length : typed;

  useEffect(() => {
    if (still) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (typed < s.q.length) t = setTimeout(() => setTyped((n) => n + 1), 32);
      else t = setTimeout(() => setPhase("thinking"), 450);
    } else if (phase === "thinking") {
      t = setTimeout(() => setPhase("answer"), 1000);
    } else {
      t = setTimeout(() => {
        setI((n) => (n + 1) % SCRIPT.length);
        setTyped(0);
        setPhase("typing");
      }, 5200);
    }
    return () => clearTimeout(t);
  }, [phase, typed, s.q.length, still]);

  return (
    <div
      className="rounded-2xl bg-white p-4 shadow-lg"
      aria-live="polite"
      aria-label="Exemple de question posée à Dr. Ahmed"
    >
      <div className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-md bg-hema px-3.5 py-2.5 text-[14px] leading-snug text-white">
        {s.q.slice(0, shownTyped)}
        {shownPhase === "typing" && (
          <span aria-hidden className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-white/80" />
        )}
      </div>

      <div className="mt-2.5 min-h-[7.5rem]">
        {shownPhase === "thinking" && (
          <div className="flex w-fit gap-1.5 rounded-2xl rounded-bl-md bg-slide px-4 py-3" aria-label="Dr. Ahmed écrit">
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="h-2 w-2 animate-bounce rounded-full bg-ink/40"
                style={{ animationDelay: `${d * 140}ms` }}
              />
            ))}
          </div>
        )}
        {shownPhase === "answer" && (
          <div className="panel-in">
            <div className="rounded-2xl rounded-bl-md bg-slide px-3.5 py-2.5 text-[14px] leading-snug text-ink/90">
              {s.a}
              <p className="mt-2 border-t border-line pt-2 text-[13px]">
                <span className="font-bold text-hema">À retenir · </span>
                {s.keep}
              </p>
            </div>
            <p className="label mt-1.5 text-muted">Source : {s.src}</p>
          </div>
        )}
      </div>
    </div>
  );
}
