"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { reviewStats, type ReviewStats } from "@/lib/qcm-review";
import { useT } from "@/lib/app-i18n";

/**
 * Point d'entrée vers « Mes erreurs » : visible seulement s'il y a quelque chose à revoir.
 * Sans docId = toutes les erreurs ; avec docId = celles de ce cours.
 */
export function ErrorsEntry({ docId, compact = false }: { docId?: string; compact?: boolean }) {
  const t = useT();
  const [s, setS] = useState<ReviewStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    reviewStats(docId).then((r) => {
      if (!cancelled) setS(r);
    });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  if (!s || !s.available || s.total === 0) return null;
  const href = docId ? `/app/erreurs?doc=${encodeURIComponent(docId)}` : "/app/erreurs";

  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-4 rounded-2xl border border-line bg-white transition hover:border-ink ${compact ? "px-4 py-3" : "p-5 sm:p-6"}`}
    >
      <span className="min-w-0">
        <span className="display block text-xl text-ink">
          {s.due > 0 ? t("{a} erreurs à revoir aujourd'hui", { a: s.due }) : t("Mes erreurs")}
        </span>
        <span className="mt-0.5 block text-sm text-muted">
          {s.due > 0
            ? t("Les questions ratées reviennent au bon moment, jusqu'à ce que tu les maîtrises.")
            : t("{a} à surveiller · rien à revoir pour l'instant", { a: s.total })}
        </span>
      </span>
      <span aria-hidden className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
        {s.due > 0 ? t("Réviser") : t("Voir")}
      </span>
    </Link>
  );
}
