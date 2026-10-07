"use client";

import Link from "next/link";
import { useState } from "react";
import { duoLink, type DuoState } from "@/lib/duo";
import { useT } from "@/lib/app-i18n";

export const btnDark =
  "rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40";
export const btnLine =
  "rounded-full border border-ink/25 px-6 py-3 font-semibold text-ink transition hover:border-ink disabled:opacity-40";

export const duoKindLabel = (k: string) =>
  k === "flashcards" ? "Flashcards à deux" : k === "case" ? "Cas clinique à deux" : k === "room" ? "Salle avec Dr. Ahmed" : "QCM à deux";

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex justify-between gap-2 text-sm">
        <span className="truncate font-semibold text-ink">{label}</span>
        <span className="shrink-0 text-muted">
          {n}/{total}
        </span>
      </p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slide">
        <div className="h-full rounded-full bg-eosin transition-[width] duration-500" style={{ width: `${(n / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** Cadre commun à toutes les sessions à deux : titre, code, invitation, progression, messages d'état. */
export function DuoShell({
  st,
  total,
  expired,
  error,
  wide = false,
  children,
}: {
  st: DuoState;
  /** Nombre d'éléments à faire (0 : pas de barre de progression, comme dans la salle). */
  total: number;
  expired: boolean;
  error: string | null;
  /** Pleine largeur (la salle avec Dr. Ahmed) ; sinon une colonne de lecture. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const other = st.members.find((m) => m.user_id !== st.me) ?? null;
  const me = st.members.find((m) => m.user_id === st.me);
  const otherName = other?.name.trim() || t("Ton partenaire");

  async function copy() {
    try {
      await navigator.clipboard.writeText(st.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* copie refusée : le lien reste affiché */
    }
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(`Révise avec moi sur Axone : ${duoLink(st.code)} (code ${st.code})`)}`;

  return (
    <div className={wide ? "" : "max-w-3xl"}>
      <Link href="/app/duo" className="text-sm font-semibold text-ink/70 transition hover:text-ink">{t("← Révision à deux")}</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label text-muted">{t(duoKindLabel(st.kind))}</p>
          <p dir="auto" className="display mt-1 text-2xl text-ink sm:text-3xl">{st.title || t("Session à deux")}</p>
        </div>
        <p className="label rounded-full bg-slide px-3 py-1.5 text-muted">{t("Code")}{" "}<span className="font-mono tracking-widest text-ink">{st.code}</span></p>
      </div>

      {!other && (
        <section className="mt-5 rounded-2xl border border-line bg-eosin-soft p-5">
          <p className="font-semibold text-ink">{t("En attente de ton partenaire")}</p>
          <p className="mt-1 text-ink/80">{t("Envoie-lui ce code. Il pourra rejoindre gratuitement. Tu peux déjà commencer.")}</p>
          <p className="mt-3 w-fit rounded-xl bg-white px-5 py-3 font-mono text-3xl font-semibold tracking-[0.3em] text-ink" dir="ltr">{st.code}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button onClick={copy} className={btnLine}>{copied ? t("Code copié") : t("Copier le code")}</button>
            <a href={wa} target="_blank" rel="noreferrer" className={btnDark}>{t("Envoyer sur WhatsApp")}</a>
          </div>
        </section>
      )}

      {total > 0 && (
        <div className="mt-5 flex gap-5 rounded-2xl border border-line bg-white p-4">
          <Bar label={t("Toi")} n={me?.answered ?? 0} total={total} />
          {other ? <Bar label={otherName} n={other.answered} total={total} /> : <p className="flex-1 text-sm text-muted">{t("Pas encore de partenaire.")}</p>}
        </div>
      )}

      {expired && (
        <p className="mt-4 rounded-2xl bg-slide px-4 py-3 text-ink">{t("Cette session est terminée : tu peux revoir les réponses, plus en ajouter.")}</p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">{t(error)}</p>
      )}

      {children}
    </div>
  );
}
