"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isPaid, PLAN_LABEL, useApp } from "@/components/app-context";
import { getSupabase } from "@/lib/supabase";

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
      setError("Impossible d'enregistrer tes modifications pour le moment. Réessaie dans un instant.");
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

  const email = user.email ?? "";

  return (
    <div className="max-w-2xl">

      <section className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
        <p className="label text-muted">Connexion</p>
        <p className="display mt-2 text-2xl text-ink">{email || "Compte Google"}</p>
        <p className="mt-2 text-muted">
          Connecte-toi avec ce même compte Google dans l&apos;application (Réglages, puis Compte) pour retrouver tes
          cours, ton plan et tes documents partout.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-white p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-3">
          <p className="label text-muted">Ton plan</p>
          <Link href="/app/abonnement" className="text-sm font-semibold text-ink/70 hover:text-ink">
            {isPaid(quota?.plan) ? "Gérer →" : "Voir les plans →"}
          </Link>
        </div>
        <p className="display mt-2 text-3xl text-ink">{PLAN_LABEL[quota?.plan ?? "freemium"] ?? quota?.plan}</p>
      </section>

      <form onSubmit={save} className="mt-6 space-y-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
        <p className="display text-2xl text-ink">Ton profil</p>

        <div>
          <label htmlFor="c-name" className="label text-muted">
            Prénom
          </label>
          <input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            className="mt-3 w-full rounded-2xl border border-line bg-slide px-5 py-3.5 text-lg text-ink focus:border-ink focus:outline-none"
          />
        </div>

        <div>
          <p className="label text-muted">Pays</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {COUNTRIES.map((c) => (
              <Chip key={c} active={country === c} onClick={() => setCountry(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="label text-muted">Filière</p>
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
                {f.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="label text-muted">Année</p>
          {years.length === 0 ? (
            <p className="mt-3 text-muted">Chargement des années…</p>
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
          <label htmlFor="c-school" className="label text-muted">
            Université <span className="normal-case tracking-normal">(facultatif)</span>
          </label>
          <input
            id="c-school"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="ex : FMPOS UNAM, UCAD, Université Hassan II…"
            className="mt-3 w-full rounded-2xl border border-line bg-slide px-5 py-3.5 text-lg text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-[#a3271c]">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="rounded-2xl bg-eosin-soft px-4 py-3 text-ink">
            Modifications enregistrées.
          </p>
        )}

        <button
          type="submit"
          disabled={!canSave}
          className="rounded-full bg-ink px-8 py-4 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40"
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      <button
        onClick={signOut}
        className="mt-8 rounded-full border border-ink/20 px-7 py-3.5 font-semibold text-ink transition hover:border-ink"
      >
        Se déconnecter
      </button>
    </div>
  );
}
