import { getSupabase } from "./supabase";

/*
  Promotions de prix lancées depuis le panneau d'administration (onglet Promotions).
  Une promotion s'arrête toute seule à sa date de fin ; le serveur recalcule toujours le prix à payer
  (fonction plan_price), ces fonctions servent seulement à AFFICHER le même prix.
*/

export type PromoCountry = "mr" | "sn" | "ma";
export type Promo = {
  id: string;
  label: string;
  discount_percent: number;
  plans: string[];
  durations: string[];
  countries: string[];
  ends_at: string;
};

/** La meilleure promotion en cours pour une offre, une durée et un pays (elles ne se cumulent pas). */
export function promoFor(promos: Promo[], plan: string, duration: "monthly" | "yearly", country: PromoCountry, now = Date.now()): Promo | null {
  let best: Promo | null = null;
  for (const p of promos) {
    if (!p.plans.includes(plan) || !p.durations.includes(duration) || !p.countries.includes(country)) continue;
    if (+new Date(p.ends_at) <= now) continue;
    if (!best || p.discount_percent > best.discount_percent) best = p;
  }
  return best;
}

/** Même arrondi que le serveur : à l'unité. */
export const discounted = (base: number, percent: number) => Math.round((base * (100 - percent)) / 100);

/** Promotions en cours (lues par le navigateur). Liste vide si la fonction n'existe pas encore. */
export async function fetchPromos(): Promise<Promo[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("public_promotions");
  if (error || !Array.isArray(data)) return [];
  return data as Promo[];
}
