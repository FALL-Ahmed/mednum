"use client";

import { useEffect, useState } from "react";
import { SITE, type Lang } from "@/lib/site-i18n";
import { CaseDemo, ChatDemo, FicheDemo, FlashcardDemo, QcmDemo } from "./demos";

/*
  Un axone myélinisé sert de navigation : chaque gaine de myéline est une
  fonction de l'app. Les nœuds entre les gaines sont les espaces de conduction.
*/
const ADVANCE_MS = 6500;

export function AxonTabs({ lang = "fr" }: { lang?: Lang }) {
  const t = SITE[lang];
  const demos = [
    <ChatDemo key="q" lang={lang} />,
    <FicheDemo key="f" lang={lang} />,
    <QcmDemo key="c" lang={lang} />,
    <FlashcardDemo key="fl" lang={lang} />,
    <CaseDemo key="cs" lang={lang} />,
  ];
  const stops = t.tabs.map((x, i) => ({ ...x, demo: demos[i] }));
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  // Avance automatique, coupée dès qu'on clique ou si on préfère moins d'animation.
  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % t.tabs.length),
      ADVANCE_MS,
    );
    return () => window.clearInterval(id);
  }, [auto, t.tabs.length]);

  const current = stops[active];

  return (
    <div>
      <div
        role="tablist"
        aria-label={t.features.ariaTabs}
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
