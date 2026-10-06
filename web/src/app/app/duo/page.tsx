"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-context";
import { cleanCode, duoError, joinDuo, listDuo, PENDING_KEY, type DuoListItem } from "@/lib/duo";

const btnDark =
  "rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40";

const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function DuoHome() {
  const { profile, quota } = useApp();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<DuoListItem[] | null>(null);
  const isDuo = quota?.plan === "premium";

  const join = useCallback(
    async (raw: string) => {
      const c = cleanCode(raw);
      if (c.length !== 6) {
        setError("Le code a 6 caractères (lettres et chiffres).");
        return;
      }
      setBusy(true);
      setError(null);
      const r = await joinDuo(c, profile.name);
      if (r.error || !r.data) {
        setError(r.error ?? duoError(null));
        setBusy(false);
        return;
      }
      router.push(`/app/duo/${r.data}`);
    },
    [profile.name, router],
  );

  useEffect(() => {
    // Invitation ouverte avant la connexion : on la rejoint maintenant.
    const t = window.setTimeout(() => {
      let pending: string | null = null;
      try {
        pending = localStorage.getItem(PENDING_KEY);
        if (pending) localStorage.removeItem(PENDING_KEY);
      } catch {
        /* stockage indisponible */
      }
      if (pending) join(pending);
      listDuo().then((r) => setList(r.data ?? []));
    }, 0);
    return () => window.clearTimeout(t);
  }, [join]);

  return (
    <div className="max-w-3xl">
      <p className="display text-3xl text-ink sm:text-4xl">Révision à deux</p>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Une série de QCM, deux personnes. Chacun répond à son rythme, vous voyez où en est l&apos;autre, puis vous
        comparez vos réponses question par question.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-6">
          <p className="label text-muted">Inviter quelqu&apos;un</p>
          <p className="display mt-2 text-2xl text-ink">Lance une session</p>
          <ol className="mt-3 list-inside list-decimal space-y-1.5 text-ink/80">
            <li>Ouvre un cours, onglet QCM.</li>
            <li>Choisis une série, puis « Réviser à deux ».</li>
            <li>Envoie le lien à ton partenaire (WhatsApp, par exemple).</li>
          </ol>
          <p className="mt-3 text-sm text-muted">Ton partenaire n&apos;a pas besoin d&apos;abonnement : l&apos;invitation est gratuite.</p>
          {isDuo ? (
            <Link href="/app/cours" className={`mt-5 inline-block ${btnDark}`}>
              Choisir un cours
            </Link>
          ) : (
            <div className="mt-5 rounded-2xl bg-eosin-soft p-4">
              <p className="font-semibold text-ink">Lancer une session est réservé au plan Duo.</p>
              <Link href="/app/abonnement" className={`mt-3 inline-block ${btnDark}`}>
                Voir le plan Duo
              </Link>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-white p-6">
          <p className="label text-muted">Tu as reçu une invitation</p>
          <p className="display mt-2 text-2xl text-ink">Rejoins une session</p>
          <p className="mt-3 text-ink/80">Colle le code à 6 caractères reçu de ton partenaire. C&apos;est gratuit.</p>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              join(code);
            }}
          >
            <label htmlFor="duo-code" className="text-sm font-semibold text-ink">
              Code de la session
            </label>
            <input
              id="duo-code"
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              inputMode="text"
              autoComplete="off"
              placeholder="K7M4QX"
              className="mt-2 w-full rounded-2xl border border-line bg-slide px-4 py-3.5 text-center font-mono text-xl tracking-[0.3em] text-ink placeholder:text-ink/25 focus:border-ink focus:outline-none"
            />
            <button type="submit" disabled={busy || code.length !== 6} className={`mt-4 w-full ${btnDark}`}>
              {busy ? "Connexion…" : "Rejoindre"}
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
              {error}
            </p>
          )}
        </section>
      </div>

      <h2 className="display mt-10 text-2xl text-ink">Tes sessions</h2>
      {list === null ? (
        <p className="mt-3 text-muted">Chargement…</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-muted">Aucune session pour l&apos;instant. Elles apparaîtront ici pendant 48 heures.</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {list.map((s) => {
            const over = new Date(s.expires_at) < new Date();
            return (
              <li key={s.code} className="flex flex-col rounded-2xl border border-line bg-white p-5">
                <p className="label text-muted">
                  {dateShort(s.created_at)} · {s.is_host ? "Tu as invité" : "Tu as rejoint"}
                </p>
                <p className="mt-1.5 font-semibold leading-snug text-ink">{s.title || "Série de QCM"}</p>
                <p className="mt-2 text-sm text-muted">
                  {s.partner ? `Avec ${s.partner}` : "En attente d'un partenaire"} · {s.answered}/{s.total} répondues ·{" "}
                  {s.points} pts
                </p>
                <Link
                  href={`/app/duo/${s.code}`}
                  className="mt-4 rounded-full border border-ink/25 px-6 py-3 text-center font-semibold text-ink transition hover:border-ink"
                >
                  {over ? "Voir le résultat" : "Ouvrir"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
