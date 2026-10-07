"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { isPaid, PLAN_LABEL, useApp } from "@/components/app-context";
import { IconCheck } from "@/components/icons";
import {
  countryKey,
  CURRENCY,
  forgetPayment,
  kitpayCreate,
  kitpayEnabled,
  lastPayment,
  paydunyaCreate,
  paydunyaEnabled,
  PaymentError,
  paymentStatus,
  rememberPayment,
  SOON_METHODS,
} from "@/lib/payments";
import { getSupabase } from "@/lib/supabase";
import { formatDate, useT } from "@/lib/app-i18n";
import { track } from "@/lib/track";
import { fetchPromos, promoFor, promoPrice, type Promo, type PromoCountry } from "@/lib/promos";

type PlanRow = { plan: string; label: string; price_monthly: number; price_yearly: number | null };
type Account = { method: string; account_number: string };
type Price = { plan: string; currency: string; monthly: number; yearly: number };
type Step = 1 | 2 | 3;

// Contenu des offres (aligné sur la page d'accueil du site et sur l'application).
const FEATURES: Record<string, string[]> = {
  standard: [
    "40 questions par jour à Dr. Ahmed",
    "50 documents actifs",
    "5 fiches, flashcards ou cas cliniques par jour",
    "50 questions de QCM par jour",
    "Export des fiches en PDF",
    "Historique de 30 jours",
  ],
  premium: [
    "Révision à deux : QCM, flashcards, cas cliniques et salle avec Dr. Ahmed (invité gratuit)",
    "100 questions par jour à Dr. Ahmed",
    "Documents illimités",
    "20 fiches, flashcards ou cas cliniques par jour",
    "150 questions de QCM par jour",
    "Export des fiches en PDF",
    "Historique illimité",
  ],
};

const LOGOS: Record<string, string> = {
  bankily: "/payments/bankily.webp",
  masrivi: "/payments/masrivi.webp",
  sedad: "/payments/sedad.webp",
  click: "/payments/click.webp",
};
const MR_METHODS = ["bankily", "masrivi", "sedad", "click"];

const DEFAULT_WHATSAPP = "22241513211";
const promoEnd = (iso: string) => formatDate(new Date(iso), { day: "numeric", month: "long" });
const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");
const nice = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

function genRef(): string {
  const a = crypto.getRandomValues(new Uint8Array(4));
  return "AX-" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function dateFr(iso: string): string {
  return formatDate(new Date(iso), { day: "numeric", month: "long", year: "numeric" });
}

function Stepper({ step }: { step: Step }) {
  const t = useT();
  const items = ["Offre", "Paiement", "Confirmation"];
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label={t("Étapes de l'abonnement")}>
      {items.map((label, i) => {
        const n = (i + 1) as Step;
        const done = step > n;
        const current = step === n;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                done ? "bg-eosin text-ink" : current ? "bg-ink text-white" : "border border-line text-muted"
              }`}
            >
              {done ? <IconCheck className="h-3.5 w-3.5" /> : n}
            </span>
            <span className={current ? "font-semibold text-ink" : "text-muted"}>{t(label)}</span>
            {n < 3 && <span aria-hidden className="mx-1 h-px w-6 bg-line sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}

/** Retour de la page de paiement KitPay : on attend la confirmation de l'opérateur et on active le plan. */
function ReturnPanel({ outcome, onBack }: { outcome: string; onBack: () => void }) {
  const t = useT();
  const { refreshQuota } = useApp();
  const [status, setStatus] = useState<"checking" | "active" | "closed" | "waiting">("checking");

  useEffect(() => {
    if (outcome !== "succes") return;
    const ref = lastPayment();
    if (!ref) return;
    let cancelled = false;
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries++;
      const s = await paymentStatus(ref);
      if (cancelled) return;
      if (s === "active") {
        window.clearInterval(timer);
        forgetPayment();
        setStatus("active");
        refreshQuota();
      } else if (s === "cancelled" || s === "rejected") {
        window.clearInterval(timer);
        setStatus("closed");
      } else if (tries >= 40) {
        window.clearInterval(timer); // ~2 minutes : on arrête de vérifier, le plan s'activera tout seul ensuite
        setStatus("waiting");
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [outcome, refreshQuota]);

  const cancelled = outcome === "annule";
  const noRef = outcome === "succes" && !lastPayment() && status === "checking";

  return (
    <div className="max-w-2xl rounded-2xl border border-line bg-white p-8 sm:p-10">
      {status === "active" ? (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-eosin text-ink">
            <IconCheck />
          </span>
          <h2 className="display mt-6 text-3xl leading-tight text-ink">{t("Paiement reçu. Ton plan est activé.")}</h2>
          <p className="mt-4 text-lg text-muted">{t("Tu peux en profiter tout de suite, sur le site et dans l'application.")}</p>
        </>
      ) : cancelled || status === "closed" ? (
        <>
          <h2 className="display text-3xl leading-tight text-ink">{t("Paiement annulé.")}</h2>
          <p className="mt-4 text-lg text-muted">{t("Rien n'a été débité. Tu peux réessayer quand tu veux.")}</p>
        </>
      ) : status === "waiting" || noRef ? (
        <>
          <h2 className="display text-3xl leading-tight text-ink">{t("Nous attendons la confirmation.")}</h2>
          <p className="mt-4 text-lg text-muted">{t("Si tu as bien payé, ton plan s'active tout seul dès que l'opérateur confirme, en général en quelques minutes. Tu peux fermer cette page.")}</p>
        </>
      ) : (
        <>
          <h2 className="display text-3xl leading-tight text-ink">{t("Vérification du paiement…")}</h2>
          <p className="mt-4 text-lg text-muted">{t("Ne ferme pas cette page, ça prend quelques secondes.")}</p>
        </>
      )}
      <button
        onClick={onBack}
        className="mt-6 rounded-full border border-ink/20 px-6 py-3 font-semibold text-ink transition hover:border-ink"
      >
        {status === "active" ? t("Terminer") : t("Retour aux offres")}
      </button>
    </div>
  );
}

function Abonnement() {
  const t = useT();
  const { profile, quota, quotaKey, refreshQuota } = useApp();
  const params = useSearchParams();
  const [returned, setReturned] = useState<string | null>(params.get("retour"));
  const [step, setStep] = useState<Step>(1);
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [whatsapp, setWhatsapp] = useState(DEFAULT_WHATSAPP);
  const [duration, setDuration] = useState<"monthly" | "yearly">("monthly");
  const [planId, setPlanId] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [kit, setKit] = useState<"unknown" | "on" | "off">("unknown");
  const [pdun, setPdun] = useState<"unknown" | "on" | "off">("unknown");
  const [prices, setPrices] = useState<Price[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const ck = countryKey(profile.country);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    sb.from("plans")
      .select("plan,label,price_monthly,price_yearly")
      .in("plan", ["standard", "premium"])
      .order("sort_order")
      .then(({ data }) => !cancelled && setPlans((data ?? []) as PlanRow[]));
    sb.from("plan_prices")
      .select("plan,currency,monthly,yearly")
      .then(({ data }) => !cancelled && setPrices((data ?? []) as Price[]));
    fetchPromos().then((list) => !cancelled && setPromos(list));
    sb.from("payment_accounts")
      .select("method,account_number")
      .then(({ data }) => !cancelled && setAccounts((data ?? []) as Account[]));
    sb.from("app_config")
      .select("value")
      .eq("key", "support_whatsapp")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.value) setWhatsapp(data.value as string);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Paiement automatique (KitPay) : disponible ou non ? Seulement utile en Mauritanie, à l'étape du paiement.
  useEffect(() => {
    if (step !== 2 || ck !== "mr") return;
    let cancelled = false;
    kitpayEnabled().then((on) => !cancelled && setKit(on ? "on" : "off"));
    return () => {
      cancelled = true;
    };
  }, [step, ck]);

  // Paiement PayDunya (Sénégal) : disponible ou non ?
  useEffect(() => {
    if (step !== 2 || ck !== "sn") return;
    let cancelled = false;
    paydunyaEnabled().then((on) => !cancelled && setPdun(on ? "on" : "off"));
    return () => {
      cancelled = true;
    };
  }, [step, ck]);

  const plan = plans?.find((p) => p.plan === planId) ?? null;
  // Prix dans la devise du pays (FCFA, MAD) quand il est défini, sinon en ouguiyas.
  const localPrice = (p: PlanRow) => prices.find((x) => x.plan === p.plan && x.currency === CURRENCY[ck].code);
  const unit = ck !== "mr" && ck !== "other" && plans && plans.every((p) => localPrice(p)) ? CURRENCY[ck].label : "MRU";
  const baseOf = (p: PlanRow) => {
    const lp = unit === "MRU" ? undefined : localPrice(p);
    if (lp) return Number(duration === "yearly" ? lp.yearly : lp.monthly);
    return duration === "yearly" ? (p.price_yearly ?? p.price_monthly * 10) : p.price_monthly;
  };
  // Promotion en cours : même calcul que le serveur, qui recalcule de toute façon le montant à payer.
  const promoCountry = (unit === "MRU" ? "mr" : ck) as PromoCountry;
  const promoOf = (p: PlanRow) => promoFor(promos, p.plan, duration, promoCountry);
  const priceOf = (p: PlanRow) => {
    const pr = promoOf(p);
    return pr ? promoPrice(pr, p.plan, promoCountry, duration, baseOf(p)) : baseOf(p);
  };
  // Bandeau de l'étape 1 : la plus forte promotion en cours pour ce pays.
  const stepBanner = promos
    .filter((x) => x.countries.includes(promoCountry) && +new Date(x.ends_at) > Date.now())
    .sort((x, y) => y.discount_percent - x.discount_percent)[0] ?? null;
  const amount = plan ? priceOf(plan) : 0;
  const planPromo = plan ? promoOf(plan) : null;
  const account = accounts?.find((a) => a.method === method) ?? null;
  const wa = (text: string) => `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
  const durationLabel = duration === "yearly" ? "Annuel" : "Mensuel";

  function choose(p: PlanRow) {
    track("begin_checkout", { plan: p.plan, duration, value: priceOf(p), currency: unit });
    setPlanId(p.plan);
    setMethod(null);
    setFile(null);
    setError(null);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToOffers() {
    setReturned(null);
    setStep(1);
    window.history.replaceState(null, "", "/app/abonnement");
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* copie impossible : le numéro reste affiché */
    }
  }

  /** Paiement automatique : on crée le paiement chez KitPay puis on ouvre sa page de paiement. */
  async function payAuto() {
    if (!plan || !method) return;
    setBusy(true);
    setError(null);
    try {
      const out = await kitpayCreate({ plan: plan.plan, duration, method, phone: phone.trim() || undefined });
      rememberPayment(out.ref);
      window.location.assign(out.hosted_url);
    } catch (e) {
      setBusy(false);
      if (e instanceof PaymentError && e.code === "not_configured") setKit("off");
      setError(
        e instanceof PaymentError && e.code === "too_many"
          ? t("Tu as déjà plusieurs paiements en attente. Termine-les ou attends quelques minutes.")
          : t("Impossible d'ouvrir la page de paiement pour le moment. Réessaie dans un instant."),
      );
    }
  }

  /** Sénégal : on crée la facture PayDunya (mobile money ou carte, au choix sur leur page) puis on l'ouvre. */
  async function payPaydunya() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const out = await paydunyaCreate({ plan: plan.plan, duration });
      rememberPayment(out.ref);
      window.location.assign(out.hosted_url);
    } catch (e) {
      setBusy(false);
      if (e instanceof PaymentError && e.code === "not_configured") setPdun("off");
      setError(
        e instanceof PaymentError && e.code === "too_many"
          ? t("Tu as déjà plusieurs paiements en attente. Termine-les ou attends quelques minutes.")
          : t("Impossible d'ouvrir la page de paiement pour le moment. Réessaie dans un instant."),
      );
    }
  }

  /** Paiement manuel (repli) : reçu envoyé, activation après vérification. */
  async function submitReceipt() {
    const sb = getSupabase();
    if (!sb || !plan || !method || !file) return;
    setBusy(true);
    setError(null);
    try {
      const reference = genRef();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `receipts/${reference}.${ext}`;
      const up = await sb.storage
        .from("payment-screenshots")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (up.error) throw up.error;
      const url = sb.storage.from("payment-screenshots").getPublicUrl(path).data.publicUrl;

      const { error: e } = await sb.rpc("submit_payment_request", {
        p_user_id: quotaKey,
        p_student_name: profile.name,
        p_plan: plan.plan,
        p_duration: duration,
        p_amount: amount,
        p_payment_method: method,
        p_reference_code: reference,
        p_screenshot_url: url,
        p_subjects: null,
      });
      if (e) throw e;
      track("payment_submitted", { plan: plan.plan, duration, value: amount, currency: unit, method });
      setRef(reference);
      setStep(3);
      refreshQuota();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /too_many_pending/.test(msg)
          ? t("Tu as déjà 3 demandes en attente de vérification. Attends leur validation ou écris-nous sur WhatsApp.")
          : t("Impossible d'envoyer ta demande pour le moment. Vérifie ta connexion et réessaie."),
      );
    } finally {
      setBusy(false);
    }
  }

  /* ——— Retour de la page de paiement ——— */
  if (returned) {
    return (
      <div className="space-y-6">
        <Stepper step={3} />
        <ReturnPanel outcome={returned} onBack={backToOffers} />
      </div>
    );
  }

  /* ——— Étape 3 : confirmation (reçu envoyé) ——— */
  if (step === 3 && ref) {
    return (
      <div className="space-y-6">
        <Stepper step={3} />
        <div className="max-w-2xl rounded-2xl border border-line bg-white p-8 sm:p-10">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-eosin text-ink">
            <IconCheck />
          </span>
          <h2 className="display mt-6 text-3xl leading-tight text-ink">{t("Demande envoyée.")}</h2>
          <p className="mt-4 text-lg text-muted">{t("Nous vérifions ton reçu. Ton plan {a} est activé sous 24 heures, sur le site et dans l'application.", { a: plan?.label ?? "" })}</p>
          <p className="mt-6 text-sm text-muted">{t("Référence :")}{" "}<span className="font-bold text-ink">{ref}</span>
          </p>
          <a
            href={wa(`Bonjour, j'ai envoyé une demande d'abonnement ${plan?.label}. Référence : ${ref}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-block rounded-full bg-ink px-7 py-3.5 font-semibold text-white transition hover:bg-eosin hover:text-ink"
          >{t("Nous prévenir sur WhatsApp")}</a>
        </div>
      </div>
    );
  }

  /* ——— Étape 2 : paiement, selon le pays ——— */
  if (step === 2 && plan) {
    const contactBtn = (text: string) => (
      <a
        href={wa(text)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-block rounded-full bg-ink px-7 py-3.5 font-semibold text-white transition hover:bg-eosin hover:text-ink"
      >{t("Écrire sur WhatsApp")}</a>
    );

    // Méthodes proposées en Mauritanie : celles configurées en base (repli sur les quatre opérateurs)
    const mrMethods = (accounts && accounts.length > 0 ? accounts.map((a) => a.method) : MR_METHODS).filter((m) =>
      MR_METHODS.includes(m),
    );

    const methodGrid = (
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {mrMethods.map((m) => {
          const on = method === m;
          return (
            <button
              key={m}
              onClick={() => setMethod(m)}
              aria-pressed={on}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 transition ${
                on ? "border-eosin bg-eosin-soft" : "border-line bg-white hover:border-ink"
              }`}
            >
              <Image src={LOGOS[m]} alt="" width={56} height={56} className="h-14 w-14 object-contain" />
              <span className="text-sm font-semibold text-ink">{nice(m)}</span>
            </button>
          );
        })}
      </div>
    );

    let body: React.ReactNode;

    if (ck === "sn" && pdun === "unknown") {
      body = (
        <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <p className="text-muted">{t("Chargement des moyens de paiement…")}</p>
        </section>
      );
    } else if (ck === "sn" && pdun === "on") {
      body = (
        <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <h2 className="display text-2xl text-ink">{t("Paiement au Sénégal")}</h2>
          <p className="mt-3 text-muted">{t("Tu choisis ton moyen de paiement sur la page suivante : mobile money (Wave, Orange Money, Free Money…) ou carte bancaire.")}</p>
          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
              {t(error)}
            </p>
          )}
          <button
            onClick={payPaydunya}
            disabled={busy}
            className="mt-6 w-full rounded-full bg-ink px-8 py-4 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40 sm:w-auto"
          >
            {busy ? t("Ouverture du paiement…") : t("Payer {a} {b}", { a: fmt(amount), b: unit })}
          </button>
          <p className="mt-3 text-sm text-muted">{t("Ton plan est activé automatiquement dès que le paiement est confirmé.")}</p>
        </section>
      );
    } else if (ck === "sn" || ck === "ma") {
      const list = SOON_METHODS[ck];
      body = (
        <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <h2 className="display text-2xl text-ink">{t("Moyens de paiement")}{" "}{ck === "sn" ? t("au Sénégal") : t("au Maroc")}</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {list.map((m) => (
              <div
                key={m.id}
                aria-disabled="true"
                className="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line px-3 py-5 text-center opacity-80"
              >
                <span className="text-sm font-semibold text-ink">{t(m.label)}</span>
                <span className="text-xs text-muted">{t(m.note)}</span>
                <span className="mt-1 rounded-full bg-slide px-2.5 py-0.5 text-xs font-semibold text-muted">{t("Bientôt")}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-muted">{t("Le paiement en ligne arrive bientôt. En attendant, écris-nous sur WhatsApp : nous activons ton plan {a} avec toi.", { a: plan.label })}</p>
          {contactBtn(`Bonjour, je voudrais m'abonner au plan ${plan.label} (${profile.country}).`)}
        </section>
      );
    } else if (ck === "other") {
      body = (
        <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <h2 className="display text-2xl text-ink">{t("Paiement")}</h2>
          <p className="mt-3 text-muted">{t("Écris-nous sur WhatsApp : nous activons ton plan {a} avec toi.", { a: plan.label })}</p>
          {contactBtn(`Bonjour, je voudrais m'abonner au plan ${plan.label}${profile.country ? ` (${profile.country})` : ""}.`)}
        </section>
      );
    } else if (kit === "unknown" || accounts === null) {
      body = (
        <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <p className="text-muted">{t("Chargement des moyens de paiement…")}</p>
        </section>
      );
    } else if (kit === "on") {
      // Mauritanie, paiement automatique : page de paiement hébergée, plan activé tout seul
      body = (
        <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <h2 className="display text-2xl text-ink">{t("Comment veux-tu payer ?")}</h2>
          {methodGrid}
          {method && (
            <div className="mt-6">
              <label htmlFor="pay-phone" className="text-sm font-semibold text-ink">{t("Ton numéro {a}", { a: nice(method) })}<span className="font-normal text-muted">{t("(recommandé)")}</span>
              </label>
              <input
                id="pay-phone"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("ex : 46 12 34 56")}
                className="mt-2 w-full max-w-xs rounded-xl border border-line bg-slide px-4 py-3 text-ink placeholder:text-muted focus:border-ink focus:outline-none"
              />
              <p className="mt-2 text-sm text-muted">{t("Le numéro avec lequel tu paies aide à retrouver ton paiement plus vite.")}</p>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
              {t(error)}
            </p>
          )}
          <button
            onClick={payAuto}
            disabled={busy || !method}
            className="mt-6 w-full rounded-full bg-ink px-8 py-4 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40 sm:w-auto"
          >
            {busy ? t("Ouverture du paiement…") : t("Payer {a} MRU", { a: fmt(amount) })}
          </button>
          <p className="mt-3 text-sm text-muted">{t("Tu paies dans l'application de ton opérateur. Ton plan est activé automatiquement, sans reçu à envoyer.")}</p>
        </section>
      );
    } else if (accounts.length === 0) {
      body = (
        <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <h2 className="display text-2xl text-ink">{t("Paiement")}</h2>
          <p className="mt-3 text-muted">{t("Les moyens de paiement ne sont pas encore disponibles ici. Écris-nous sur WhatsApp pour t'abonner.")}</p>
          {contactBtn(`Bonjour, je voudrais m'abonner au plan ${plan.label}.`)}
        </section>
      );
    } else {
      // Mauritanie, repli manuel : numéro à payer + capture du reçu
      body = (
        <>
          <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
            <h2 className="display text-2xl text-ink">{t("Comment veux-tu payer ?")}</h2>
            {methodGrid}
            {!account && (
              <p className="mt-5 rounded-xl bg-slide px-4 py-3 text-sm text-muted">
                {t("Choisis ton moyen de paiement ci-dessus : le numéro où envoyer l'argent s'affichera ici, puis tu ajouteras la capture de ton reçu.")}
              </p>
            )}
          </section>

          {account && (
            <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
              <h2 className="display text-2xl text-ink">{t("Fais ton paiement")}</h2>
              <ol className="mt-5 space-y-6">
                <li className="flex gap-4">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">1</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{t("Envoie exactement {a} MRU avec {b}", { a: fmt(amount), b: nice(account.method) })}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-slide px-4 py-3">
                      <span className="text-sm text-muted">{t("au numéro")}</span>
                      <span className="display text-2xl tabular-nums text-ink">{account.account_number}</span>
                      <button
                        onClick={() => copy(account.account_number)}
                        className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink transition hover:border-ink"
                      >
                        {copied ? t("Copié") : t("Copier")}
                      </button>
                    </div>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">2</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{t("Prends une capture d'écran du reçu")}</p>
                    <p className="mt-1 text-sm text-muted">{t("Elle doit montrer le montant et le numéro.")}</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">3</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{t("Ajoute-la ici")}</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      aria-label={t("Capture du reçu de paiement")}
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="mt-2 rounded-xl border border-dashed border-ink/30 px-5 py-3.5 text-start text-ink/80 transition hover:border-ink"
                    >
                      {file ? t("Reçu choisi : {a}", { a: file.name }) : t("Choisir une image")}
                    </button>
                  </div>
                </li>
              </ol>

              {error && (
                <p role="alert" className="mt-6 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
                  {t(error)}
                </p>
              )}

              <button
                onClick={submitReceipt}
                disabled={busy || !file}
                className="mt-6 w-full rounded-full bg-ink px-8 py-4 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40 sm:w-auto"
              >
                {busy ? t("Envoi…") : t("Envoyer ma demande")}
              </button>
              <p className="mt-3 text-sm text-muted">{t("Ton plan est activé sous 24 heures après vérification.")}</p>
            </section>
          )}
        </>
      );
    }

    return (
      <div className="space-y-6">
        <Stepper step={2} />

        <button onClick={() => setStep(1)} className="text-sm font-semibold text-ink/70 transition hover:text-ink">{t("← Changer d'offre")}</button>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">{body}</div>

          {/* Récapitulatif */}
          <aside className="h-fit rounded-2xl border border-line bg-white p-6 lg:sticky lg:top-24">
            <p className="text-sm font-medium text-muted">{t("Ton abonnement")}</p>
            <p className="display mt-1 text-3xl text-ink">{t(plan.label)}</p>
            <p className="mt-0.5 text-muted">{durationLabel}</p>
            <p className="mt-4 border-t border-line pt-4">
              <span className="display text-3xl text-ink">{fmt(amount)}</span>{" "}
              {planPromo && <span className="me-2 text-muted line-through">{fmt(baseOf(plan))}</span>}
              <span className="text-muted">{unit} / {duration === "yearly" ? "an" : "mois"}</span>
            </p>
            {planPromo && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                <span className="rounded-full bg-[#ffb74d] px-4 py-1.5 text-xl font-extrabold leading-none">{`−${planPromo.discount_percent} %`}</span>
              </p>
            )}
            <ul className="mt-4 space-y-2 border-t border-line pt-4 text-sm text-ink/80">
              {(FEATURES[plan.plan] ?? []).slice(0, 4).map((f) => (
                <li key={f} className="flex gap-2.5">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />
                  {t(f)}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    );
  }

  /* ——— Étape 1 : choix de l'offre ——— */
  return (
    <div className="space-y-6">
      <Stepper step={1} />

      <div className="max-w-xl rounded-2xl border border-line bg-white p-5">
        <p className="text-sm font-medium text-muted">{t("Ton plan actuel")}</p>
        <p className="display mt-1 text-2xl text-ink">{t(PLAN_LABEL[quota?.plan ?? "freemium"] ?? quota?.plan ?? "")}</p>
        {isPaid(quota?.plan) && quota?.expires_at && (
          <p className="mt-1 text-muted">{t("Actif jusqu'au {a}.", { a: dateFr(quota.expires_at) })}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label={t("Durée")} className="inline-flex rounded-full border border-line bg-white p-1">
          {(["monthly", "yearly"] as const).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={duration === d}
              onClick={() => setDuration(d)}
              className={`rounded-full px-6 py-2.5 text-[15px] font-semibold transition-colors ${
                duration === d ? "bg-ink text-white" : "text-ink/70 hover:text-ink"
              }`}
            >
              {d === "monthly" ? t("Mensuel") : t("Annuel")}
            </button>
          ))}
        </div>
        {duration === "yearly" && <p className="text-sm font-semibold text-ink">{t("25 % d'économie sur l'année")}</p>}
      </div>

      {plans === null ? (
        <p className="text-muted">{t("Chargement des offres…")}</p>
      ) : (
        <>
        {stepBanner && (
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-[#ffb74d] bg-[#ffb74d]/25 px-5 py-3 text-center text-[15px] font-semibold text-ink">
            <span className="rounded-full bg-[#ffb74d] px-3 py-1 text-base font-extrabold leading-none">{`−${stepBanner.discount_percent} %`}</span>
            <span>{t("{a} jusqu'au {b}", { a: stepBanner.label || t("Promotion"), b: promoEnd(stepBanner.ends_at) })}</span>
          </p>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {plans.map((p) => {
            const main = p.plan === "premium";
            return (
              <div
                key={p.plan}
                className={`relative flex flex-col rounded-2xl border-2 bg-white p-7 ${main ? "border-eosin shadow-[0_18px_50px_rgba(0,0,0,0.12)] md:-translate-y-1" : "border-line"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted">{t(p.label)}</span>
                  {main && (
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-eosin px-5 py-1.5 text-sm font-extrabold text-ink shadow-[0_6px_18px_rgba(0,0,0,0.18)]">
                      ★ {t("Le plus choisi")}
                    </span>
                  )}
                </div>
                <p className="display mt-3 flex flex-wrap items-baseline gap-x-3 text-5xl text-ink">
                  {fmt(priceOf(p))}
                  {promoOf(p) && <span className="text-2xl font-normal text-muted line-through">{fmt(baseOf(p))}</span>}
                </p>
                <p className="text-sm text-muted">{unit} / {duration === "yearly" ? "an" : "mois"}</p>
                {promoOf(p) && (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    <span className="rounded-full bg-[#ffb74d] px-4 py-1.5 text-xl font-extrabold leading-none">{`−${promoOf(p)!.discount_percent} %`}</span>
                  </p>
                )}
                <ul className="mt-5 flex-1 divide-y divide-line border-t border-line">
                  {(FEATURES[p.plan] ?? []).map((f) => (
                    <li key={f} className="flex items-center gap-3 py-2.5 text-[15px] text-ink/80">
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />
                      {t(f)}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => choose(p)}
                  className={`mt-6 w-full rounded-full px-6 py-3.5 font-semibold transition ${
                    main
                      ? "bg-ink text-white hover:bg-eosin hover:text-ink"
                      : "border border-ink text-ink hover:bg-ink hover:text-white"
                  }`}
                >{t("Choisir {a}", { a: p.label })}</button>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}

export default function AbonnementPage() {
  const t = useT();
  return (
    <Suspense fallback={<p className="text-muted">{t("Chargement…")}</p>}>
      <Abonnement />
    </Suspense>
  );
}
