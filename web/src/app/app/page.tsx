"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isPaid, useApp } from "@/components/app-context";
import { IconCheck, IconPlus } from "@/components/icons";
import { addDays, jourCourt, toISO, todayISO } from "@/lib/dates";
import { useFlag } from "@/lib/flags";
import { getSupabase } from "@/lib/supabase";
import { getAppLang, useT } from "@/lib/app-i18n";

type Planned = { id: string; time: string | null; matiere: string | null; sous_matiere: string | null; done: boolean };

const fmtMin = (min: number) => {
  const ar = getAppLang() === "ar";
  const mu = ar ? "د" : "min";
  const hu = ar ? "س" : "h";
  return min < 60 ? `${min} ${mu}` : `${Math.floor(min / 60)} ${hu}${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;
};

/** Carte d'usage : ce qu'il reste aujourd'hui, avec une alerte quand la limite approche. */
function Usage({
  label,
  left,
  total,
  unit,
  fem,
}: {
  label: string;
  left: number | null;
  total: number | null;
  unit?: string;
  fem?: boolean;
}) {
  const t = useT();
  const used = left !== null && total ? total - left : 0;
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const empty = left === 0;
  return (
    <div className={`rounded-2xl border bg-white p-5 ${empty ? "border-[#ffb74d]" : "border-line"}`}>
      <p className="text-sm font-medium text-muted">{t(label)}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="display text-3xl text-ink">{left === null ? "–" : left}</span>
        <span className="text-sm text-muted">
          {total !== null
            ? t(`restant${fem ? "e" : ""}${(left ?? 0) > 1 ? "s" : ""} sur {c}`, { c: unit === "∞" ? "∞" : total })
            : ""}
        </span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slide">
        <div className={`h-full rounded-full ${empty ? "bg-[#ffb74d]" : "bg-eosin"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Accueil() {
  const t = useT();
  const { user, profile, quota, docs, standardPrice } = useApp();
  const [today, setToday] = useState<Planned[] | null>(null);
  const [plannedTotal, setPlannedTotal] = useState<number | null>(null);
  const [study, setStudy] = useState<{ day: string; minutes: number }[] | null>(null);
  const [studyTotal, setStudyTotal] = useState<number | null>(null);
  const asked = useFlag("asked");
  const didQcm = useFlag("qcm");

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    const since = addDays(todayISO(), -6);

    sb.from("planned_sessions")
      .select("id,time,matiere,sous_matiere,done")
      .eq("user_id", user.id)
      .eq("date", todayISO())
      .order("time")
      .then(({ data }) => !cancelled && setToday((data ?? []) as Planned[]));
    sb.from("planned_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => !cancelled && setPlannedTotal(count ?? 0));
    sb.from("study_sessions")
      .select("minutes,created_at")
      .eq("user_id", user.id)
      .gte("created_at", `${since}T00:00:00`)
      .then(({ data }) => {
        if (cancelled) return;
        const byDay: Record<string, number> = {};
        for (const r of (data ?? []) as { minutes: number; created_at: string }[]) {
          const d = toISO(new Date(r.created_at));
          byDay[d] = (byDay[d] ?? 0) + r.minutes;
        }
        setStudy(Array.from({ length: 7 }, (_, i) => ({ day: addDays(since, i), minutes: byDay[addDays(since, i)] ?? 0 })));
      });
    sb.from("study_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => !cancelled && setStudyTotal(count ?? 0));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const lim = quota?.limits;
  const paid = isPaid(quota?.plan);
  const qLeft = quota ? Math.max(quota.daily_limit - quota.daily_used, 0) : null;
  const qcmLeft = lim ? Math.max(lim.qcm - lim.used_qcm, 0) : null;
  const maxDocs = lim?.max_documents ?? null;
  const docsLeft = docs && maxDocs !== null ? Math.max(maxDocs - docs.length, 0) : null;
  const latest = docs && docs.length > 0 ? docs[0] : null;

  const steps = useMemo(
    () => [
      { label: "Ajouter un cours", href: "/app/cours", done: (docs?.length ?? 0) > 0 },
      { label: "Poser une question à Dr. Ahmed", href: "/app/chat", done: asked },
      { label: "Faire un QCM", href: latest ? `/app/cours/${encodeURIComponent(latest.id)}` : "/app/cours", done: didQcm },
      { label: "Planifier une session", href: "/app/planning", done: (plannedTotal ?? 0) > 0 },
      { label: "Lancer un Pomodoro", href: "/app/pomodoro", done: (studyTotal ?? 0) > 0 },
    ],
    [docs, asked, didQcm, plannedTotal, studyTotal, latest],
  );
  const doneCount = steps.filter((s) => s.done).length;
  const showSteps = doneCount < steps.length && docs !== null && plannedTotal !== null && studyTotal !== null;

  const weekTotal = (study ?? []).reduce((n, d) => n + d.minutes, 0);
  const weekMax = Math.max(60, ...(study ?? []).map((d) => d.minutes));
  const limitHit = qLeft === 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          href="/app/chat"
          className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-eosin hover:text-ink"
        >
          <IconPlus className="h-4 w-4" />{t("Nouvelle discussion")}</Link>
      </div>

      {/* Bandeau */}
      <section className="relative overflow-hidden rounded-2xl bg-ink text-white">
        <div className="relative z-10 max-w-lg p-6 sm:p-8">
          <p className="text-sm font-medium text-white/60">
            {[profile.promotion_name, profile.country ? t(profile.country) : null].filter(Boolean).join(" · ")}
          </p>
          <h2 className="display mt-1 text-3xl sm:text-4xl">{t("Bonjour {a}.", { a: profile.name })}</h2>
          <p className="mt-2 text-white/75">
            {latest ? (
              <>{t("Tu en étais à")}{" "}<span className="font-semibold text-white">{latest.name}</span>.
              </>
            ) : (
              t("Ajoute ton premier cours pour commencer à réviser.")
            )}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={latest ? `/app/cours/${encodeURIComponent(latest.id)}` : "/app/cours"}
              className="rounded-full bg-eosin px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-white"
            >
              {latest ? t("Reprendre") : t("Ajouter un cours")}
            </Link>
            <Link
              href="/app/chat"
              className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >{t("Poser une question")}</Link>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 end-0 hidden w-72 sm:block" aria-hidden>
          <Image
            src="/dr-ahmed-v2.webp"
            alt=""
            fill
            sizes="288px"
            className="object-cover"
            style={{ objectPosition: "50% 8%" }}
          />
        </div>
      </section>

      {/* Limite atteinte : invitation claire à passer au payant */}
      {limitHit && !paid && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#ffb74d] bg-[#fff6e6] p-5">
          <div>
            <p className="font-bold text-ink">{t("Tu as utilisé toutes tes questions du jour.")}</p>
            <p className="mt-0.5 text-sm text-ink/75">{t("Elles reviennent demain. Avec Standard, tu en as 30 par jour.")}</p>
          </div>
          <Link
            href="/app/abonnement"
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-eosin hover:text-ink"
          >{t("Passer à Standard")}</Link>
        </section>
      )}

      {/* Usage du jour */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-bold text-ink">{t("Ton usage aujourd'hui")}</h3>
          {!paid && (
            <Link href="/app/abonnement" className="text-sm font-semibold text-ink/70 hover:text-ink">{t("Augmenter mes limites →")}</Link>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Usage label={t("Questions")} left={qLeft} total={quota?.daily_limit ?? null} fem />
          <Usage label={t("Questions de QCM")} left={qcmLeft === null ? null : qcmLeft * 5} total={lim ? lim.qcm * 5 : null} fem />
          <Usage
            label={t("Documents")}
            left={docsLeft}
            total={maxDocs}
            unit={lim && maxDocs === null ? "∞" : undefined}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Semaine */}
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6 lg:col-span-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-bold text-ink">{t("Ta semaine")}</h3>
            <p className="text-sm text-muted">{study ? t("{a} de Pomodoro", { a: fmtMin(weekTotal) }) : ""}</p>
          </div>
          {study === null ? (
            <p className="mt-6 text-muted">{t("Chargement…")}</p>
          ) : weekTotal === 0 ? (
            <div className="mt-5 rounded-xl bg-slide p-5">
              <p className="font-semibold text-ink">{t("Rien encore cette semaine.")}</p>
              <p className="mt-1 text-sm text-muted">{t("Lance un Pomodoro : chaque bloc terminé s'affiche ici.")}</p>
              <Link
                href="/app/pomodoro"
                className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-eosin hover:text-ink"
              >{t("Lancer un Pomodoro")}</Link>
            </div>
          ) : (
            <div className="mt-5 flex h-36 items-end gap-2" role="img" aria-label={t("{a} travaillées ces 7 derniers jours", { a: fmtMin(weekTotal) })}>
              {study.map((d) => {
                const isToday = d.day === todayISO();
                return (
                  <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[11px] font-semibold text-muted">{d.minutes > 0 ? fmtMin(d.minutes) : ""}</span>
                    <div
                      className={`w-full rounded-md ${isToday ? "bg-eosin" : "bg-hema-soft"}`}
                      style={{ height: `${Math.max(d.minutes > 0 ? 6 : 2, (d.minutes / weekMax) * 100)}%` }}
                    />
                    <span className={`label ${isToday ? "text-ink" : "text-muted"}`}>{jourCourt(d.day)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Aujourd'hui */}
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-bold text-ink">{t("Aujourd'hui")}</h3>
            <Link href="/app/planning" className="text-sm font-semibold text-ink/70 hover:text-ink">{t("Planning →")}</Link>
          </div>
          {today === null ? (
            <p className="mt-5 text-muted">{t("Chargement…")}</p>
          ) : today.length === 0 ? (
            <p className="mt-5 text-muted">{t("Aucune session prévue. Planifie-en une pour garder le rythme.")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {today.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <span className="label w-12 shrink-0 text-muted">{s.time ?? "–"}</span>
                  <span className={`flex-1 ${s.done ? "text-muted line-through" : "text-ink"}`}>
                    {[s.matiere, s.sous_matiere].filter(Boolean).join(" · ") || t("Session de révision")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Premiers pas */}
      {showSteps && (
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-bold text-ink">{t("Premiers pas")}</h3>
            <p className="text-sm text-muted">{t("{a} sur {b}", { a: doneCount, b: steps.length })}</p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slide">
            <div className="h-full rounded-full bg-eosin" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.label}>
                <Link
                  href={s.href}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition hover:border-ink ${
                    s.done ? "border-line bg-slide/60" : "border-line bg-white"
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                      s.done ? "border-eosin bg-eosin text-ink" : "border-line text-transparent"
                    }`}
                  >
                    <IconCheck className="h-3.5 w-3.5" />
                  </span>
                  <span className={s.done ? "text-muted line-through" : "font-medium text-ink"}>{t(s.label)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Comparaison Gratuit / Standard */}
      {!paid && (
        <section className="rounded-2xl bg-ink p-6 text-white sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-md">
              <h3 className="display text-2xl sm:text-3xl">{t("Passe à Standard")}</h3>
              <p className="mt-2 text-white/70">
                {standardPrice ? t("{a} MRU par mois. ", { a: standardPrice.toLocaleString("fr-FR") }) : ""}{t("Le même abonnement marche sur le site et dans l'application.")}</p>
              <Link
                href="/app/abonnement"
                className="mt-5 inline-block rounded-full bg-eosin px-6 py-3 text-sm font-extrabold text-ink transition hover:bg-white"
              >{t("Voir les offres")}</Link>
            </div>
            <dl className="grid w-full grid-cols-3 gap-3 text-center sm:w-auto sm:min-w-[22rem]">
              {[
                ["Questions", lim?.questions ?? 5, 30],
                ["QCM", lim?.qcm ?? 5, 10],
                ["Documents", lim?.max_documents ?? 1, 5],
              ].map(([label, from, to]) => (
                <div key={label as string} className="rounded-xl bg-white/8 p-3">
                  <dt className="text-xs text-white/60">{t("{a} par jour", { a: label })}</dt>
                  <dd className="mt-1 text-sm text-white/50 line-through">{from}</dd>
                  <dd className="display text-2xl text-eosin">{to}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}
    </div>
  );
}
