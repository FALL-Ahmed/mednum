"use client";

import Link from "next/link";
import { PLAN_LABEL, useApp } from "./app-context";
import { useT } from "@/lib/app-i18n";

type Kind = "content" | "qcm" | "chat";

// Ce que le plan supérieur offre par jour (aligné sur les limites définies dans la base).
const NEXT_PLAN: Record<string, { name: string; content: number; qcm: number; chat: number } | undefined> = {
  freemium: { name: "Standard", content: 5, qcm: 10, chat: 30 },
  trial: { name: "Standard", content: 5, qcm: 10, chat: 30 },
  standard: { name: "Premium", content: 20, qcm: 30, chat: 100 },
};

const WHAT: Record<Kind, { title: string; one: string; many: string }> = {
  content: {
    title: "Ta génération du jour est utilisée",
    one: "{n} fiche, série de flashcards ou cas clinique",
    many: "{n} fiches, séries de flashcards ou cas cliniques",
  },
  qcm: { title: "Tes QCM du jour sont faits", one: "{n} série de QCM", many: "{n} séries de QCM" },
  chat: { title: "Tu as posé toutes tes questions du jour", one: "{n} question à Dr. Ahmed", many: "{n} questions à Dr. Ahmed" },
};

/** Message affiché quand la limite du jour est atteinte : informatif et calme, pas une erreur. */
export function LimitNotice({ kind, onClose }: { kind: Kind; onClose?: () => void }) {
  const t = useT();
  const { quota } = useApp();
  const plan = quota?.plan ?? "freemium";
  const lim = quota?.limits;
  const mine = lim ? (kind === "content" ? lim.contents : kind === "qcm" ? lim.qcm : lim.questions) : null;
  const next = NEXT_PLAN[plan];
  const nextN = next ? next[kind] : null;
  const what = WHAT[kind];
  // Les QCM se comptent en questions (une série = 5 questions), pas en séries.
  const unitFor = (n: number) => (kind === "qcm" ? t("{n} questions de QCM", { n: n * 5 }) : t(n > 1 ? what.many : what.one, { n }));

  return (
    <div role="status" className="rounded-2xl border border-eosin bg-eosin-soft p-5 sm:p-6">
      <p className="label" style={{ color: "var(--eosin-text)" }}>{t("Limite du jour")}</p>
      <p className="display mt-2 text-2xl leading-tight text-ink">{t(what.title)}.</p>
      <p className="mt-2 text-ink/80">
        {mine !== null && (
          <>{t("Ton plan {a} permet {b} par jour.", { a: t(PLAN_LABEL[plan] ?? plan), b: unitFor(mine) })}</>
        )}{t("Le compteur repart demain.")}{next && nextN !== null && (
          <>{t("Le plan {a} en offre {b} par jour.", { a: next.name, b: unitFor(nextN) })}</>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {next && (
          <Link
            href="/app/abonnement"
            className="rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-eosin hover:text-ink"
          >{t("Voir le plan {a}", { a: next.name })}</Link>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-full border border-ink/25 px-5 py-2.5 text-[15px] font-semibold text-ink transition hover:border-ink"
          >{t("Compris")}</button>
        )}
      </div>
    </div>
  );
}
