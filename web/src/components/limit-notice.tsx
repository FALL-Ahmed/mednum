"use client";

import Link from "next/link";
import { PLAN_LABEL, useApp } from "./app-context";

type Kind = "content" | "qcm" | "chat";

// Ce que le plan supérieur offre par jour (aligné sur les limites définies dans la base).
const NEXT_PLAN: Record<string, { name: string; content: number; qcm: number; chat: number } | undefined> = {
  freemium: { name: "Standard", content: 5, qcm: 10, chat: 30 },
  trial: { name: "Standard", content: 5, qcm: 10, chat: 30 },
  standard: { name: "Premium", content: 20, qcm: 30, chat: 100 },
};

const WHAT: Record<Kind, { title: string; unit: (n: number) => string }> = {
  content: {
    title: "Ta génération du jour est utilisée",
    unit: (n) => `${n} fiche${n > 1 ? "s" : ""}, série${n > 1 ? "s" : ""} de flashcards ou cas clinique${n > 1 ? "s" : ""}`,
  },
  qcm: {
    title: "Tes QCM du jour sont faits",
    unit: (n) => `${n} série${n > 1 ? "s" : ""} de QCM`,
  },
  chat: {
    title: "Tu as posé toutes tes questions du jour",
    unit: (n) => `${n} question${n > 1 ? "s" : ""} à Dr. Ahmed`,
  },
};

/** Message affiché quand la limite du jour est atteinte : informatif et calme, pas une erreur. */
export function LimitNotice({ kind, onClose }: { kind: Kind; onClose?: () => void }) {
  const { quota } = useApp();
  const plan = quota?.plan ?? "freemium";
  const lim = quota?.limits;
  const mine = lim ? (kind === "content" ? lim.contents : kind === "qcm" ? lim.qcm : lim.questions) : null;
  const next = NEXT_PLAN[plan];
  const nextN = next ? next[kind] : null;
  const what = WHAT[kind];

  return (
    <div role="status" className="rounded-2xl border border-eosin bg-eosin-soft p-5 sm:p-6">
      <p className="label" style={{ color: "var(--eosin-text)" }}>
        Limite du jour
      </p>
      <p className="display mt-2 text-2xl leading-tight text-ink">{what.title}.</p>
      <p className="mt-2 text-ink/80">
        {mine !== null && (
          <>
            Ton plan {PLAN_LABEL[plan] ?? plan} permet {what.unit(mine)} par jour.{" "}
          </>
        )}
        Le compteur repart demain.
        {next && nextN !== null && (
          <>
            {" "}
            Le plan {next.name} en offre {nextN} par jour.
          </>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {next && (
          <Link
            href="/app/abonnement"
            className="rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-eosin hover:text-ink"
          >
            Voir le plan {next.name}
          </Link>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-full border border-ink/25 px-5 py-2.5 text-[15px] font-semibold text-ink transition hover:border-ink"
          >
            Compris
          </button>
        )}
      </div>
    </div>
  );
}
