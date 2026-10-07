"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDuoV2, type DuoKind } from "@/lib/duo";
import { useApp } from "../app-context";
import { useT } from "@/lib/app-i18n";

/**
 * Lance une session de révision à deux (réservée au plan Premium) à partir du contenu donné,
 * puis ouvre la session. Pour un autre plan, propose de voir l'abonnement.
 */
export function StartDuoButton({
  kind,
  title,
  payload,
  label,
  className = "",
}: {
  kind: Exclude<DuoKind, "qcm">;
  title: string;
  payload: unknown;
  label: string;
  className?: string;
}) {
  const t = useT();
  const { profile, quota } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);
  const isPremium = quota?.plan === "premium";

  async function start() {
    setMsg(null);
    if (!isPremium) {
      setUpsell(true);
      return;
    }
    setBusy(true);
    const r = await createDuoV2(kind, title, payload, profile.name);
    if (r.error || !r.data) {
      setMsg(r.error);
      setBusy(false);
      return;
    }
    router.push(`/app/duo/${r.data}`);
  }

  return (
    <span className="inline-block">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={`rounded-full border border-ink/25 px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink disabled:opacity-40 ${className}`}
      >
        {busy ? t("Création de la session…") : t(label)}
      </button>
      {msg && (
        <span role="alert" className="mt-2 block rounded-2xl bg-[#fff1f0] px-4 py-2 text-sm text-[#a3271c]">
          {t(msg)}
        </span>
      )}
      {upsell && (
        <span className="mt-2 block rounded-2xl bg-eosin-soft px-4 py-3 text-sm text-ink">{t("Réviser à deux est réservé au plan Premium.")}<Link href="/app/abonnement" className="font-semibold underline">{t("Voir le plan Premium")}</Link>
        </span>
      )}
    </span>
  );
}

/** Le cours copié dans une salle : au plus ~300 000 caractères, chapitre par chapitre. */
export function roomPayload(doc: { name: string; content: string; chunks?: { title: string; content: string }[] | null }) {
  const out: { title: string; content: string }[] = [];
  let used = 0;
  for (const c of doc.chunks ?? []) {
    if (!c.content) continue;
    const text = c.content.slice(0, 40000);
    if (used + text.length > 300000) break;
    out.push({ title: c.title, content: text });
    used += text.length;
  }
  if (out.length === 0) out.push({ title: doc.name, content: doc.content.slice(0, 250000) });
  return { name: doc.name, chunks: out };
}
