import type { Promo } from "./promos"

export type PublicLimits = {
  daily_questions: number
  daily_qcm: number
  daily_contents: number
  max_documents: number | null
  pdf_export: boolean
  history_days: number | null
}
export type PublicOffers = {
  limits: Record<"freemium" | "standard" | "premium", PublicLimits>
  prices: Record<"standard" | "premium", { mr: number; sn: number; ma: number }>
  /** Promotions en cours (réductions lancées depuis l'administration) ; vide s'il n'y en a pas. */
  promos: Promo[]
}

/**
 * Prix et limites des offres, lus dans Supabase : ce qui est réglé dans le panneau d'administration
 * (Paramètres → Offres et limites) s'affiche ici sans toucher au code. Renvoie null si la lecture échoue :
 * la page garde alors ses valeurs de secours.
 */
export async function getPublicOffers(): Promise<PublicOffers | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const get = async (path: string) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(path);
    return (await res.json()) as Record<string, unknown>[];
  };
  try {
    const promosPromise: Promise<Promo[]> = fetch(`${url}/rest/v1/rpc/public_promotions`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      next: { revalidate: 60 },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => (Array.isArray(j) ? (j as Promo[]).filter((p) => +new Date(p.ends_at) > Date.now()) : []))
      .catch(() => [])
    const [plans, fx, lim] = await Promise.all([
      get("plans?select=plan,price_monthly&plan=in.(standard,premium)"),
      get("plan_prices?select=plan,currency,monthly"),
      get("plan_limits?select=*&plan=in.(freemium,standard,premium)"),
    ]);
    const prices: PublicOffers["prices"] = { standard: { mr: 0, sn: 0, ma: 0 }, premium: { mr: 0, sn: 0, ma: 0 } };
    for (const r of plans) {
      const p = r.plan as "standard" | "premium";
      if (prices[p]) prices[p].mr = Number(r.price_monthly);
    }
    for (const r of fx) {
      const p = r.plan as "standard" | "premium";
      if (!prices[p]) continue;
      if (r.currency === "XOF") prices[p].sn = Number(r.monthly);
      if (r.currency === "MAD") prices[p].ma = Number(r.monthly);
    }
    const limits = {} as PublicOffers["limits"];
    for (const r of lim) {
      const p = r.plan as "freemium" | "standard" | "premium";
      limits[p] = {
        daily_questions: Number(r.daily_questions),
        daily_qcm: Number(r.daily_qcm),
        daily_contents: Number(r.daily_contents),
        max_documents: r.max_documents === null ? null : Number(r.max_documents),
        pdf_export: r.pdf_export === true,
        history_days: r.history_days === null ? null : Number(r.history_days),
      };
    }
    if (!limits.freemium || !limits.standard || !limits.premium) return null;
    for (const p of ["standard", "premium"] as const) {
      if (!(prices[p].mr > 0 && prices[p].sn > 0 && prices[p].ma > 0)) return null;
    }
    return { limits, prices, promos: await promosPromise };
  } catch {
    return null;
  }
}
