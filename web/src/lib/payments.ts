import { getSupabase } from "./supabase";

/**
 * Moyens de paiement selon le pays de l'étudiant.
 *  - Mauritanie : Bankily, Masrivi, Sedad, Click (validation automatique via KitPay quand il est configuré).
 *  - Sénégal : mobile money (Wave, Orange Money, Free Money) et carte bancaire — à venir.
 *  - Maroc : carte bancaire — à venir.
 */
export type CountryKey = "mr" | "sn" | "ma" | "other";

export function countryKey(country?: string | null): CountryKey {
  if (!country || country === "Mauritanie") return "mr";
  if (country === "Sénégal") return "sn";
  if (country === "Maroc") return "ma";
  return "other";
}

export type SoonMethod = { id: string; label: string; note: string };

/** Moyens annoncés mais pas encore branchés (aucun agrégateur de paiement connecté pour le moment). */
export const SOON_METHODS: Record<"sn" | "ma", SoonMethod[]> = {
  sn: [
    { id: "wave", label: "Wave", note: "Mobile money" },
    { id: "orange", label: "Orange Money", note: "Mobile money" },
    { id: "free", label: "Free Money", note: "Mobile money" },
    { id: "card", label: "Carte bancaire", note: "Visa, Mastercard" },
  ],
  ma: [{ id: "card", label: "Carte bancaire", note: "Visa, Mastercard" }],
};

export class PaymentError extends Error {
  constructor(public code: "not_configured" | "too_many" | "failed") {
    super(code);
  }
}

async function callIntent(payload: Record<string, unknown>, fn = "kitpay-intent"): Promise<Response> {
  const sb = getSupabase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sb || !url || !anon) throw new PaymentError("failed");
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new PaymentError("failed");
  return fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: anon,
    },
    body: JSON.stringify(payload),
  });
}

/** Le paiement automatique KitPay est-il configuré côté serveur ? */
export async function kitpayEnabled(): Promise<boolean> {
  try {
    const res = await callIntent({ action: "probe" });
    if (!res.ok) return false;
    const out = (await res.json()) as { enabled?: boolean };
    return out.enabled === true;
  } catch {
    return false;
  }
}

const KEY = "axone:kitpay_ref";
export const rememberPayment = (ref: string) => {
  try {
    window.localStorage.setItem(KEY, ref);
  } catch {
    /* stockage indisponible */
  }
};
export const lastPayment = (): string | null => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const forgetPayment = () => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* sans importance */
  }
};

/** Crée un paiement KitPay et renvoie l'adresse de la page de paiement. Le montant est calculé côté serveur. */
export async function kitpayCreate(p: {
  plan: string;
  duration: "monthly" | "yearly";
  method: string;
  phone?: string;
}): Promise<{ ref: string; hosted_url: string }> {
  const res = await callIntent(p);
  if (res.status === 503) throw new PaymentError("not_configured");
  if (res.status === 429) throw new PaymentError("too_many");
  if (!res.ok) throw new PaymentError("failed");
  return (await res.json()) as { ref: string; hosted_url: string };
}

/** Le paiement PayDunya (Sénégal) est-il configuré côté serveur ? */
export async function paydunyaEnabled(): Promise<boolean> {
  try {
    const res = await callIntent({ action: "probe" }, "paydunya-intent");
    if (!res.ok) return false;
    const out = (await res.json()) as { enabled?: boolean };
    return out.enabled === true;
  } catch {
    return false;
  }
}

/** Crée une facture PayDunya (mobile money ou carte) et renvoie l'adresse de la page de paiement. */
export async function paydunyaCreate(p: {
  plan: string;
  duration: "monthly" | "yearly";
}): Promise<{ ref: string; hosted_url: string }> {
  const res = await callIntent(p, "paydunya-intent");
  if (res.status === 503) throw new PaymentError("not_configured");
  if (res.status === 429) throw new PaymentError("too_many");
  if (!res.ok) throw new PaymentError("failed");
  return (await res.json()) as { ref: string; hosted_url: string };
}

/** Devise facturée selon le pays. */
export const CURRENCY: Record<CountryKey, { code: "MRU" | "XOF" | "MAD"; label: string }> = {
  mr: { code: "MRU", label: "MRU" },
  sn: { code: "XOF", label: "FCFA" },
  ma: { code: "MAD", label: "MAD" },
  other: { code: "MRU", label: "MRU" },
};

/** Statut d'une demande de paiement de l'étudiant connecté : pending, active, cancelled… */
export async function paymentStatus(ref: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("payment_status", { p_ref: ref });
  return error ? null : ((data as string | null) ?? null);
}
