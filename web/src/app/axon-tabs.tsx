"use client";

import { useEffect, useState } from "react";
import { CaseDemo, ChatDemo, FicheDemo, FlashcardDemo, QcmDemo } from "./demos";

/*
  Un axone myélinisé sert de navigation : chaque gaine de myéline est une
  fonction de l'app. Les nœuds entre les gaines sont les espaces de conduction.
*/
const stops = [
  {
    id: "questions",
    label: "Questions",
    title: "Une notion bloque ? Demande à Dr. Ahmed.",
    text: "Écris, parle ou envoie une photo. La réponse est courte, elle vient de ton cours, et finit par ce qu'il faut retenir.",
    demo: <ChatDemo />,
  },
  {
    id: "fiches",
    label: "Fiches",
    title: "Ton cours, en une page.",
    text: "Chaque chapitre devient une fiche avec ce qui tombe en compo. Tu l'exportes en PDF ou tu la partages avec ta promo.",
    demo: <FicheDemo />,
  },
  {
    id: "qcm",
    label: "QCM",
    title: "Des QCM comme en faculté.",
    text: "Plusieurs propositions exactes, notation complète, partielle ou fausse. Tu vois ce que tu as oublié, avec la correction.",
    demo: <QcmDemo />,
  },
  {
    id: "flashcards",
    label: "Flashcards",
    title: "Ce qui résiste revient plus vite.",
    text: "Tu te notes carte par carte. La répétition espacée te représente chaque notion au bon moment.",
    demo: <FlashcardDemo />,
  },
  {
    id: "cas",
    label: "Cas cliniques",
    title: "Raisonne comme en stage.",
    text: "Histoire, hypothèses, examen, examens complémentaires, diagnostic. Tu réponds à chaque étape avant de voir la suite.",
    demo: <CaseDemo />,
  },
];

const ADVANCE_MS = 6500;

export function AxonTabs() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  // Avance automatique, coupée dès qu'on clique ou si on préfère moins d'animation.
  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % stops.length),
      ADVANCE_MS,
    );
    return () => window.clearInterval(id);
  }, [auto]);

  const current = stops[active];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Fonctions d'Axone"
        className="relative grid grid-cols-2 gap-3 md:flex md:items-center md:gap-0"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 hidden h-[3px] -translate-y-1/2 bg-hema/25 md:block"
        />
        {stops.map((s, i) => (
          <div key={s.id} className="contents md:flex md:flex-1 md:items-center">
            <button
              role="tab"
              id={`tab-${s.id}`}
              aria-selected={i === active}
              aria-controls="axon-panel"
              onClick={() => {
                setAuto(false);
                setActive(i);
              }}
              className={`relative z-10 flex-1 rounded-full border-2 px-4 py-4 text-center text-base font-semibold transition-colors sm:text-lg ${
                i === active
                  ? "border-hema bg-hema text-white"
                  : "border-hema/25 bg-white text-hema-deep hover:border-hema"
              }`}
            >
              {s.label}
            </button>
            {i < stops.length - 1 && (
              <span aria-hidden className="hidden h-4 shrink-0 md:block md:w-6" />
            )}
          </div>
        ))}
      </div>

      <div
        key={current.id}
        id="axon-panel"
        role="tabpanel"
        aria-labelledby={`tab-${current.id}`}
        className="panel-in mt-12 grid items-center gap-10 md:grid-cols-[0.85fr_1.15fr] md:gap-16"
      >
        <div className="min-w-0">
          <h3 className="display text-4xl leading-[1.05] text-ink sm:text-5xl">
            {current.title}
          </h3>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
            {current.text}
          </p>
        </div>
        <div className="min-w-0">{current.demo}</div>
      </div>
    </div>
  );
}
