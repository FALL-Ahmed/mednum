"use client";

import { useState } from "react";
import type { PublicLimits, PublicOffers } from "@/lib/offers";
import { SITE, type Lang } from "@/lib/site-i18n";

/*
  Prix par pays. Mauritanie : PRD v2.0 (à valider).
  Sénégal et Maroc : conversion INDICATIVE (1 EUR ≈ 40 MRU, 1 EUR = 655,957 FCFA, 1 EUR ≈ 10,8 MAD),
  arrondie. À remplacer par les vrais tarifs choisis pour chaque marché.
*/
const countries = [
  { id: "mr", unit: "MRU", prices: { standard: 800, premium: 1500 } },
  { id: "sn", unit: "FCFA", prices: { standard: 13000, premium: 25000 } },
  { id: "ma", unit: "MAD", prices: { standard: 220, premium: 400 } },
] as const;

const plans = [
  { key: "free" },
  { key: "standard", main: true },
  { key: "premium" },
] as const;

/** Liste de secours (si les offres du panneau d'administration ne sont pas lisibles). */
const FALLBACK: Record<"freemium" | "standard" | "premium", PublicLimits> = {
  freemium: { max_documents: 1, daily_questions: 5, daily_contents: 1, daily_qcm: 1, pdf_export: false, history_days: 7 },
  standard: { max_documents: 50, daily_questions: 40, daily_contents: 5, daily_qcm: 10, pdf_export: true, history_days: 30 },
  premium: { max_documents: null, daily_questions: 100, daily_contents: 20, daily_qcm: 30, pdf_export: true, history_days: null },
};

const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");


/** Liste des avantages d'une offre, construite à partir de ses limites réelles. */
function itemsFor(l: PublicLimits, lang: Lang, duo = false): string[] {
  const t = SITE[lang].pricing.items;
  const out: string[] = duo ? [t.duo] : [];
  out.push(t.docs(l.max_documents));
  out.push(t.questions(l.daily_questions));
  out.push(t.contents(l.daily_contents));
  out.push(t.qcm(l.daily_qcm));
  if (l.pdf_export) out.push(t.pdf);
  out.push(t.history(l.history_days));
  return out;
}

export function Pricing({ offers = null, lang = "fr" }: { offers?: PublicOffers | null; lang?: Lang }) {
  const T = SITE[lang].pricing;
  const prefix = lang === "ar" ? "/ar" : "";
  const [id, setId] = useState<(typeof countries)[number]["id"]>("mr");
  const base = countries.find((x) => x.id === id)!;
  // Prix du panneau d'administration quand ils sont disponibles, sinon valeurs de secours du site
  const c = offers
    ? {
        ...base,
        prices: {
          standard: offers.prices.standard[id],
          premium: offers.prices.premium[id],
        },
      }
    : base;
  const keyOf = { free: "freemium", standard: "standard", premium: "premium" } as const;

  return (
    <div>
      <div
        role="tablist"
        aria-label={T.aria}
        className="mt-10 inline-flex rounded-full border border-line bg-slide p-1"
      >
        {countries.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={x.id === id}
            onClick={() => setId(x.id)}
            className={`rounded-full px-5 py-2.5 text-[15px] font-semibold transition-colors sm:px-7 ${
              x.id === id ? "bg-ink text-white" : "text-ink/70 hover:text-ink"
            }`}
          >
            {T.countries.find((k) => k.id === x.id)?.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {plans.map((p) => {
          const main = "main" in p && p.main;
          const price = p.key === "free" ? 0 : c.prices[p.key];
          const name = p.key === "free" ? T.free.name : p.key === "standard" ? "Standard" : "Duo";
          const text = p.key === "free" ? T.free.text : p.key === "standard" ? T.standardText : T.duoText;
          const limits = offers ? offers.limits[keyOf[p.key]] : FALLBACK[keyOf[p.key]];
          return (
            <div
              key={p.key}
              className={`flex flex-col rounded-3xl p-8 ${
                main ? "bg-ink text-white" : "border border-line bg-slide text-ink"
              }`}
            >
              <p className={`label ${main ? "text-white/60" : "text-muted"}`}>{name}</p>
              <p className="display mt-5 text-5xl">{fmt(price)}</p>
              <p className={`mt-1 h-5 text-sm ${main ? "text-white/60" : "text-muted"}`}>
                {price > 0 ? `${c.unit} ${T.perMonth}` : ""}
              </p>
              <p className={`mt-6 font-semibold ${main ? "text-white" : "text-ink"}`}>{text}</p>
              <ul
                className={`mt-5 flex-1 divide-y border-t ${
                  main ? "divide-white/15 border-white/15" : "divide-line border-line"
                }`}
              >
                {itemsFor(limits, lang, p.key === "premium").map((i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-3 py-3 text-[15px] ${
                      main ? "text-white/85" : "text-ink/80"
                    }`}
                  >
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />
                    {i}
                  </li>
                ))}
              </ul>
              {p.key === "free" && (
                <a
                  href={`${prefix}/connexion`}
                  className="mt-6 rounded-full bg-ink px-6 py-3.5 text-center font-semibold text-white transition hover:bg-eosin"
                >
                  {T.free.cta}
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-muted">
        {T.countries.find((k) => k.id === c.id)?.pay}
        {c.id !== "mr" && T.indicative}
      </p>
    </div>
  );
}
