"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { IconClose } from "./icons";
import { isPaid, PLAN_LABEL, useApp } from "./app-context";
import { useT } from "@/lib/app-i18n";

const DAY = 86400000;
const BANNER_DAYS = 7;

const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string) => {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* stockage bloqué : le message pourra revenir */
  }
};

type Expired = { plan: string; expires_at: string };

/**
 * Fin d'abonnement :
 *  • quelques jours avant, un bandeau discret pour renouveler ;
 *  • juste après, une fenêtre (une seule fois) qui explique le retour au gratuit et propose de réactiver.
 */
export function ExpiryNotices({ banner = true, modal = true }: { banner?: boolean; modal?: boolean }) {
  const t = useT();
  const { quota } = useApp();
  const [now, setNow] = useState<number | null>(null);
  const [expired, setExpired] = useState<Expired | null>(null);
  const [bannerHidden, setBannerHidden] = useState(false);
  const plan = quota?.plan;
  const paid = isPaid(plan);

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Abonnement terminé depuis peu : on le demande à la base, seulement pour un compte repassé en gratuit.
  useEffect(() => {
    if (!modal || !quota || paid) return;
    let cancelled = false;
    const sb = getSupabase();
    if (!sb) return;
    sb.rpc("my_subscription_status").then(({ data }) => {
      const e = (data as { expired?: Expired | null } | null)?.expired;
      if (!cancelled && e && !stored(`axone.expired.${e.expires_at}`)) setExpired(e);
    });
    return () => {
      cancelled = true;
    };
  }, [quota, paid, modal]);

  const daysLeft = paid && quota?.expires_at && now !== null ? Math.ceil((new Date(quota.expires_at).getTime() - now) / DAY) : null;
  const bannerKey = `axone.expiry-banner.${new Date(now ?? 0).toISOString().slice(0, 10)}`;
  const showBanner = banner && daysLeft !== null && daysLeft <= BANNER_DAYS && !bannerHidden && now !== null && !stored(bannerKey);
  const planName = (p: string) => t(PLAN_LABEL[p] ?? p);

  function closeModal() {
    if (expired) store(`axone.expired.${expired.expires_at}`);
    setExpired(null);
  }

  return (
    <>
      {showBanner && (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#ffb74d] bg-[#fff6e6] px-4 py-3 text-ink">
          <p className="min-w-0 flex-1 font-semibold">
            {daysLeft! <= 0
              ? t("Ton plan {a} se termine aujourd'hui.", { a: planName(plan ?? "") })
              : daysLeft === 1
                ? t("Ton plan {a} se termine demain.", { a: planName(plan ?? "") })
                : t("Ton plan {a} se termine dans {b} jours.", { a: planName(plan ?? ""), b: daysLeft })}
          </p>
          <Link href="/app/abonnement" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-eosin hover:text-ink">{t("Renouveler")}</Link>
          <button
            onClick={() => {
              store(bannerKey);
              setBannerHidden(true);
            }}
            aria-label={t("Fermer le message")}
            className="rounded-lg p-1.5 text-ink/60 transition hover:bg-white hover:text-ink"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}

      {expired && (
        <div className="fixed inset-0 z-50 grid place-items-center px-5" role="dialog" aria-modal="true" aria-labelledby="expired-title">
          <button aria-label={t("Fermer")} className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <p id="expired-title" className="display text-2xl text-ink">
              {t("Ton plan {a} est terminé", { a: planName(expired.plan) })}
            </p>
            <p className="mt-3 text-ink/80">{t("Tu es repassé en gratuit. Tes cours, tes fiches, tes flashcards et ton historique sont gardés. Pour retrouver tes limites, réactive ton plan.")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/app/abonnement"
                onClick={closeModal}
                className="rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink"
              >{t("Réactiver mon plan")}</Link>
              <button onClick={closeModal} className="rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink">{t("Plus tard")}</button>
            </div>
          </div>
        </div>
            )}
    </>
  );
}
