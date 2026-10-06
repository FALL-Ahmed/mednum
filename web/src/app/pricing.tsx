"use client";

import { useState } from "react";
import type { PublicLimits, PublicOffers } from "@/lib/offers";

/*
  Prix par pays. Mauritanie : PRD v2.0 (à valider).
  Sénégal et Maroc : conversion INDICATIVE (1 EUR ≈ 40 MRU, 1 EUR = 655,957 FCFA, 1 EUR ≈ 10,8 MAD),
  arrondie. À remplacer par les vrais tarifs choisis pour chaque marché.
*/
const countries = [
  {
    id: "mr",
    label: "Mauritanie",
    unit: "MRU",
    prices: { standard: 800, premium: 1500 },
    pay: "Paiement par Bankily, Masrivi, Sedad ou Click.",
  },
  {
    id: "sn",
    label: "Sénégal",
    unit: "FCFA",
    prices: { standard: 13000, premium: 25000 },
    pay: "Paiement par mobile money (Wave, Orange Money…) ou carte bancaire, bientôt disponible.",
  },
  {
    id: "ma",
    label: "Maroc",
    unit: "MAD",
    prices: { standard: 220, premium: 400 },
    pay: "Paiement par carte bancaire, bientôt disponible.",
  },
] as const;

const plans = [
  {
    key: "free",
    name: "Gratuit",
    text: "Pour découvrir Axone.",
    items: [
      "1 document actif",
      "5 questions par jour à Dr. Ahmed",
      "1 fiche, flashcards ou cas clinique par jour",
      "5 QCM par jour",
      "Historique de 7 jours",
    ],
  },
  {
    key: "standard",
    name: "Standard",
    text: "Pour réviser toute l'année.",
    main: true,
    items: [
      "5 documents actifs",
      "30 questions par jour",
      "5 fiches, flashcards ou cas cliniques par jour",
      "10 QCM par jour",
      "Export des fiches en PDF",
      "Historique de 30 jours",
    ],
  },
  {
    key: "premium",
    name: "Premium",
    text: "Pour la préparation intensive.",
    items: [
      "Documents illimités",
      "100 questions par jour",
      "20 fiches, flashcards ou cas cliniques par jour",
      "30 QCM par jour",
      "Export des fiches en PDF",
      "Historique illimité",
    ],
    soon: "Révision à deux · bientôt",
  },
] as const;

const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Liste des avantages d'une offre, construite à partir de ses limites réelles. */
function itemsFor(l: PublicLimits): string[] {
  const out: string[] = [];
  out.push(l.max_documents === null ? "Documents illimités" : plural(l.max_documents, "document actif", "documents actifs"));
  out.push(`${plural(l.daily_questions, "question", "questions")} par jour à Dr. Ahmed`);
  out.push(`${l.daily_contents} ${l.daily_contents > 1 ? "fiches, flashcards ou cas cliniques" : "fiche, flashcards ou cas clinique"} par jour`);
  out.push(`${l.daily_qcm} QCM par jour`);
  if (l.pdf_export) out.push("Export des fiches en PDF");
  out.push(l.history_days === null ? "Historique illimité" : `Historique de ${l.history_days} jours`);
  return out;
}

export function Pricing({ offers = null }: { offers?: PublicOffers | null }) {
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
        aria-label="Pays"
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
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {plans.map((p) => {
          const main = "main" in p && p.main;
          const price = p.key === "free" ? 0 : c.prices[p.key];
          return (
            <div
              key={p.key}
              className={`flex flex-col rounded-3xl p-8 ${
                main ? "bg-ink text-white" : "border border-line bg-slide text-ink"
              }`}
            >
              <p className={`label ${main ? "text-white/60" : "text-muted"}`}>{p.name}</p>
              <p className="display mt-5 text-5xl">{fmt(price)}</p>
              <p className={`mt-1 h-5 text-sm ${main ? "text-white/60" : "text-muted"}`}>
                {price > 0 ? `${c.unit} / mois` : ""}
              </p>
              <p className={`mt-6 font-semibold ${main ? "text-white" : "text-ink"}`}>{p.text}</p>
              <ul
                className={`mt-5 flex-1 divide-y border-t ${
                  main ? "divide-white/15 border-white/15" : "divide-line border-line"
                }`}
              >
                {(offers ? itemsFor(offers.limits[keyOf[p.key]]) : p.items).map((i) => (
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
                  href="/connexion"
                  className="mt-6 rounded-full bg-ink px-6 py-3.5 text-center font-semibold text-white transition hover:bg-eosin"
                >
                  Commencer gratuitement
                </a>
              )}
              {"soon" in p && (
                <p
                  className="label mt-5 w-fit rounded-full bg-eosin-soft px-3 py-1.5"
                  style={{ color: "var(--eosin-text)" }}
                >
                  {p.soon}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-muted">
        {c.pay}
        {c.id !== "mr" && " Prix indicatifs, ils peuvent changer à l'ouverture du marché."}
      </p>
    </div>
  );
}
