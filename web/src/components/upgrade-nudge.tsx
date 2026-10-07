"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useNextPlan } from "@/lib/next-plan";
import { track } from "@/lib/track";
import { useT } from "@/lib/app-i18n";

const SEEN = "axone:nudge-seen";

/**
 * Proposition d'abonnement juste après un bon résultat de QCM : le moment où l'étudiant vient de voir que ça marche.
 * Seulement pour l'offre Gratuit, pour un score d'au moins 60 %, et une seule fois par session pour ne pas agacer.
 */
export function UpgradeNudge({ points, total }: { points: number; total: number }) {
  const t = useT();
  const { name, lim, free } = useNextPlan();
  const good = total > 0 && points / (total * 10) >= 0.6;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!free || !good) return;
    try {
      if (window.sessionStorage.getItem(SEEN)) return;
      window.sessionStorage.setItem(SEEN, "1");
    } catch {
      /* stockage indisponible : on affiche quand même */
    }
    setShow(true);
    track("upsell_view", { place: "qcm_result" });
  }, [free, good]);

  if (!show || !lim) return null;

  return (
    <div role="status" className="mt-6 rounded-2xl border border-eosin bg-eosin-soft p-5 sm:p-6">
      <p className="display text-2xl leading-tight text-ink">{t("Bravo, {a} sur {b} !", { a: points, b: total * 10 })}</p>
      <p className="mt-2 text-ink/80">{t("Tu progresses vite. Voici ce que t'apporte le plan {a} :", { a: name })}</p>
      <ul className="mt-3 space-y-1.5 text-ink">
        <li className="flex gap-2.5">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />
          {t("{n} questions de QCM par jour", { n: lim.daily_qcm * 5 })}
        </li>
        <li className="flex gap-2.5">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />
          {t("{n} questions par jour à Dr. Ahmed", { n: lim.daily_questions })}
        </li>
        <li className="flex gap-2.5">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />
          {lim.max_documents === null ? t("Documents illimités") : t("{n} documents actifs", { n: lim.max_documents })}
        </li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/app/abonnement"
          onClick={() => track("upsell_click", { place: "qcm_result", plan: name })}
          className="rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-eosin hover:text-ink"
        >
          {t("Voir le plan {a}", { a: name })}
        </Link>
        <button
          onClick={() => setShow(false)}
          className="rounded-full border border-ink/25 px-5 py-2.5 text-[15px] font-semibold text-ink transition hover:border-ink"
        >
          {t("Plus tard")}
        </button>
      </div>
    </div>
  );
}
