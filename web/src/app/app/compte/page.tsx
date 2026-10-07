"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isPaid, PLAN_LABEL, useApp } from "@/components/app-context";
import { getSupabase } from "@/lib/supabase";
import { useT } from "@/lib/app-i18n";

type Promotion = { id: string; name: string; description: string | null; sort_order: number; filiere: string };
const COUNTRIES = ["Mauritanie", "Sénégal", "Maroc"] as const;
const FILIERES = [
  { id: "medecine", label: "Médecine" },
  { id: "pharmacie", label: "Pharmacie" },
] as const;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-5 py-2.5 text-[15px] font-semibold transition-colors ${
        active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/80 hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

export default function Compte() {
  const t = useT();
  const router = useRouter();
  const { user, profile, quota, refreshProfile } = useApp();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [name, setName] = useState(profile.name);
  const [country, setCountry] = useState(profile.country ?? "Mauritanie");
  const [filiere, setFiliere] = useState<"medecine" | "pharmacie" | null>(null);
  const [promotionId, setPromotionId] = useState<string | null>(profile.promotion_id);
  const [school, setSchool] = useState(profile.school_name ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    sb.from("promotions")
      .select("id,name,description,sort_order,filiere")
      .order("sort_order")
      .then(({ data }) => {
        if (!cancelled && data) setPromotions(data as Promotion[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Filière : celle choisie, sinon celle de l'année enregistrée.
  const currentFiliere =
    filiere ?? ((promotions.find((p) => p.id === promotionId)?.filiere as "medecine" | "pharmacie" | undefined) ?? "medecine");
  const years = promotions.filter((p) => p.filiere === currentFiliere);
  const selected = years.find((p) => p.id === promotionId) ?? null;
  const canSave = name.trim().length > 0 && selected !== null && !busy;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !selected) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error: err } = await sb.from("students").upsert(
      {
        user_id: user.id,
        name: name.trim(),
        promotion_id: selected.id,
        promotion_name: selected.name,
        school_name: school.trim() || null,
        country,
      },
      { onConflict: "user_id" },
    );
    if (err) {
      console.error("[compte] enregistrement impossible :", err.message);
      setError(t("Impossible d'enregistrer tes modifications pour le moment. Réessaie dans un instant."));
    } else {
      await refreshProfile();
      setSaved(true);
    }
    setBusy(false);
  }

  async function signOut() {
    await getSupabase()?.auth.signOut();
    router.replace("/");
  }

  // Suppression du compte : confirmation écrite, puis la fonction serveur efface le compte et ses données
  const [delOpen, setDelOpen] = useState(false);
  const [delWord, setDelWord] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  async function deleteAccount() {
    const sb = getSupabase();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!sb || !url || !anon) return;
    setDelBusy(true);
    setDelError(null);
    try {
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("session");
      const res = await fetch(`${url}/functions/v1/delete-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, apikey: anon },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      try {
        Object.keys(window.localStorage).filter((k) => k.startsWith("axone")).forEach((k) => window.localStorage.removeItem(k));
      } catch {
        /* stockage indisponible */
      }
      await sb.auth.signOut();
      router.replace("/");
    } catch {
      setDelError(t("La suppression n'a pas pu aboutir. Réessaie dans un instant, ou écris-nous sur WhatsApp."));
      setDelBusy(false);
    }
  }

  const email = user.email ?? "";

  return (
    <div className="max-w-2xl">

      <section className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
        <p className="label text-muted">{t("Connexion")}</p>
        <p className="display mt-2 text-2xl text-ink">{email || t("Compte Google")}</p>
        <p className="mt-2 text-muted">{t("Connecte-toi avec ce même compte Google dans l'application (Réglages, puis Compte) pour retrouver tes cours, ton plan et tes documents partout.")}</p>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-white p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-3">
          <p className="label text-muted">{t("Ton plan")}</p>
          <Link href="/app/abonnement" className="text-sm font-semibold text-ink/70 hover:text-ink">
            {isPaid(quota?.plan) ? t("Gérer →") : t("Voir les plans →")}
          </Link>
        </div>
        <p className="display mt-2 text-3xl text-ink">{t(PLAN_LABEL[quota?.plan ?? "freemium"] ?? quota?.plan ?? "")}</p>
      </section>

      <form onSubmit={save} className="mt-6 space-y-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
        <p className="display text-2xl text-ink">{t("Ton profil")}</p>

        <div>
          <label htmlFor="c-name" className="label text-muted">{t("Prénom")}</label>
          <input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            className="mt-3 w-full rounded-2xl border border-line bg-slide px-5 py-3.5 text-lg text-ink focus:border-ink focus:outline-none"
          />
        </div>

        <div>
          <p className="label text-muted">{t("Pays")}</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {COUNTRIES.map((c) => (
              <Chip key={c} active={country === c} onClick={() => setCountry(c)}>
                {t(c)}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="label text-muted">{t("Filière")}</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {FILIERES.map((f) => (
              <Chip
                key={f.id}
                active={currentFiliere === f.id}
                onClick={() => {
                  setFiliere(f.id);
                  setPromotionId(null);
                }}
              >
                {t(f.label)}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="label text-muted">{t("Année")}</p>
          {years.length === 0 ? (
            <p className="mt-3 text-muted">{t("Chargement des années…")}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2.5">
              {years.map((p) => (
                <Chip key={p.id} active={promotionId === p.id} onClick={() => setPromotionId(p.id)}>
                  {p.name}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="c-school" className="label text-muted">{t("Université")}{" "}<span className="normal-case tracking-normal">{t("(facultatif)")}</span>
          </label>
          <input
            id="c-school"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder={t("ex : FMPOS UNAM, UCAD, Université Hassan II…")}
            className="mt-3 w-full rounded-2xl border border-line bg-slide px-5 py-3.5 text-lg text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-[#a3271c]">
            {t(error)}
          </p>
        )}
        {saved && (
          <p role="status" className="rounded-2xl bg-eosin-soft px-4 py-3 text-ink">{t("Modifications enregistrées.")}</p>
        )}

        <button
          type="submit"
          disabled={!canSave}
          className="rounded-full bg-ink px-8 py-4 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40"
        >
          {busy ? t("Enregistrement…") : t("Enregistrer")}
        </button>
      </form>

      <button
        onClick={signOut}
        className="mt-8 rounded-full border border-ink/20 px-7 py-3.5 font-semibold text-ink transition hover:border-ink"
      >{t("Se déconnecter")}</button>

      <section className="mt-16 rounded-2xl border border-[#e0796f]/40 bg-white p-6 sm:p-8">
        <p className="label text-muted">{t("Zone sensible")}</p>
        <p className="display mt-2 text-2xl text-ink">{t("Supprimer mon compte")}</p>
        {!delOpen ? (
          <>
            <p className="mt-2 text-muted">
              {t("Efface ton profil, tes cours, tes discussions, tes QCM et tes flashcards. Cette action est définitive.")}
            </p>
            <button
              onClick={() => setDelOpen(true)}
              className="mt-5 rounded-full border border-[#e0796f] px-7 py-3.5 font-semibold text-[#a3271c] transition hover:bg-[#fff1f0]"
            >
              {t("Supprimer mon compte")}
            </button>
          </>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="text-ink/80">
              {t("Tout sera effacé définitivement : profil, cours, discussions, QCM, flashcards. Si tu as un abonnement en cours, il sera perdu sans remboursement automatique.")}
            </p>
            <label htmlFor="del-word" className="block text-sm font-semibold text-ink">
              {t("Pour confirmer, écris SUPPRIMER ci-dessous")}
            </label>
            <input
              id="del-word"
              value={delWord}
              onChange={(e) => setDelWord(e.target.value)}
              autoComplete="off"
              className="w-full max-w-xs rounded-2xl border border-line bg-slide px-5 py-3.5 text-lg text-ink focus:border-ink focus:outline-none"
            />
            {delError && (
              <p role="alert" className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
                {delError}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={deleteAccount}
                disabled={delWord.trim().toUpperCase() !== "SUPPRIMER" || delBusy}
                className="rounded-full bg-[#c53b2f] px-7 py-3.5 font-semibold text-white transition hover:bg-[#a3271c] disabled:opacity-40"
              >
                {delBusy ? t("Suppression…") : t("Supprimer définitivement")}
              </button>
              <button
                onClick={() => {
                  setDelOpen(false);
                  setDelWord("");
                  setDelError(null);
                }}
                disabled={delBusy}
                className="rounded-full border border-ink/20 px-7 py-3.5 font-semibold text-ink transition hover:border-ink"
              >
                {t("Annuler")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
