"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";

type Promotion = { id: string; name: string; description: string | null; sort_order: number; filiere: string };

const COUNTRIES = ["Mauritanie", "Sénégal", "Maroc"] as const;
const FILIERES = [
  { id: "medecine", label: "Médecine" },
  { id: "pharmacie", label: "Pharmacie" },
] as const;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-5 py-3 text-[15px] font-semibold transition-colors ${
        active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/80 hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

export default function Bienvenue() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [country, setCountry] = useState<string>("Mauritanie");
  const [filiere, setFiliere] = useState<"medecine" | "pharmacie">("medecine");
  const [promotionId, setPromotionId] = useState<string | null>(null);
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prénom proposé depuis le compte Google, modifiable.
  const googleFirst = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "";
  const name = typedName ?? googleFirst;

  // Si le profil existe déjà, on n'affiche pas cette page. Sinon on charge les années.
  useEffect(() => {
    const sb = getSupabase();
    if (!user || !sb) return;
    let cancelled = false;
    (async () => {
      const { data: existing } = await sb.from("students").select("name").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (existing?.name) {
        router.replace("/app");
        return;
      }
      const { data } = await sb
        .from("promotions")
        .select("id,name,description,sort_order,filiere")
        .order("sort_order");
      if (!cancelled && data) setPromotions(data as Promotion[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  const years = promotions.filter((p) => p.filiere === filiere);
  const selected = years.find((p) => p.id === promotionId) ?? null;
  const canSubmit = name.trim().length > 0 && selected !== null && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !user || !selected) return;
    setBusy(true);
    setError(null);
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
      console.error("[bienvenue] enregistrement du profil impossible :", err.message);
      setError("Impossible d'enregistrer ton profil pour le moment. Réessaie dans un instant.");
      setBusy(false);
      return;
    }
    router.replace("/app");
  }

  if (!ready || !user) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <p className="text-muted">Connexion en cours…</p>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="px-5 py-10 sm:px-12 md:px-10 lg:px-16 xl:px-24">
      <div className="w-full max-w-xl">
      <Link href="/" className="display text-2xl text-ink">
        axone<span className="text-eosin">.</span>
      </Link>

      <h1 className="display mt-12 text-4xl leading-[1] text-ink sm:text-5xl">Bienvenue sur Axone.</h1>
      <p className="mt-4 text-lg text-muted">
        Quatre infos pour adapter Dr. Ahmed à ton niveau. Ça prend 30 secondes.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-9">
        <div>
          <label htmlFor="name" className="label text-muted">
            Ton prénom
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="ex : Mariem, Cheikh, Awa…"
            autoComplete="given-name"
            className="mt-3 w-full rounded-2xl border border-line bg-white px-5 py-4 text-lg text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
        </div>

        <div>
          <p className="label text-muted">Ton pays</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {COUNTRIES.map((c) => (
              <Chip key={c} active={country === c} onClick={() => setCountry(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="label text-muted">Ta filière</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {FILIERES.map((f) => (
              <Chip
                key={f.id}
                active={filiere === f.id}
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
          <p className="label text-muted">Ton année</p>
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
          {selected?.description && <p className="mt-3 text-sm text-muted">{selected.description}</p>}
        </div>

        <div>
          <label htmlFor="school" className="label text-muted">
            Ton université <span className="normal-case tracking-normal">(facultatif)</span>
          </label>
          <input
            id="school"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="ex : FMPOS UNAM, UCAD, Université Hassan II…"
            className="mt-3 w-full rounded-2xl border border-line bg-white px-5 py-4 text-lg text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-[#a3271c]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-full bg-ink px-8 py-4 text-base font-semibold text-white transition hover:bg-eosin disabled:opacity-40 sm:w-auto"
        >
          {busy ? "Enregistrement…" : "Commencer à réviser"}
        </button>
      </form>
      </div>
      </section>

      {/* Panneau visuel (ordinateur et tablette) : pourquoi on demande ces infos */}
      <aside className="relative hidden overflow-hidden bg-ink md:block" aria-hidden>
        <Image
          src="/dr-ahmed-v2.webp"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
          style={{ objectPosition: "50% 12%" }}
        />
        <div className="sticky top-0 flex h-screen items-end">
          <div className="w-full px-10 pb-10 xl:px-16 xl:pb-16">
            <p className="label mb-3 w-fit rounded-full bg-white/90 px-3 py-1.5 text-ink">
              Dr. Ahmed · ton prof virtuel
            </p>
            <div className="rounded-2xl bg-white p-5 shadow-lg">
              <p className="text-[15px] leading-relaxed text-ink/90">
                Dis-moi ton année et je m&apos;adapte. En P1 et P2, je reviens sur les bases. En P3 et P4, je relie
                les mécanismes à la clinique. En P5 et en Résidanat, j&apos;insiste sur les urgences, les
                complications et les pièges d&apos;examen.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
