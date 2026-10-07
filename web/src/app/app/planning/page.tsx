"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-context";
import { IconCheck, IconTrash } from "@/components/icons";
import { addDays, fromISO, labelJour, monthName, toISO, todayISO, weekdayShort } from "@/lib/dates";
import { getSupabase } from "@/lib/supabase";
import { useT } from "@/lib/app-i18n";

type Session = {
  id: string;
  date: string;
  time: string | null;
  matiere: string | null;
  sous_matiere: string | null;
  done: boolean;
};

const MAX_CHIPS = 2;

/** 42 cases (6 semaines, lundi en premier) couvrant le mois affiché. */
function buildGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const start = toISO(new Date(year, month, 1 - offset));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const sessionLabel = (s: Session) => [s.matiere, s.sous_matiere].filter(Boolean).join(" · ") || "Session";
const fmtMin = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;

export default function Planning() {
  const t = useT();
  const { user } = useApp();
  const todayStr = todayISO();
  const now = fromISO(todayStr);
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState(todayStr);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [studyMin, setStudyMin] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [matiere, setMatiere] = useState("");
  const [sous, setSous] = useState("");
  const [busy, setBusy] = useState(false);

  const grid = useMemo(() => buildGrid(view.y, view.m), [view]);
  const from = grid[0];
  const to = grid[grid.length - 1];

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const [planned, study] = await Promise.all([
      sb
        .from("planned_sessions")
        .select("id,date,time,matiere,sous_matiere,done")
        .eq("user_id", user.id)
        .gte("date", from)
        .lte("date", to)
        .order("time", { nullsFirst: false }),
      sb
        .from("study_sessions")
        .select("minutes,created_at")
        .eq("user_id", user.id)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${addDays(to, 1)}T00:00:00`),
    ]);
    if (planned.error) {
      setError(t("Impossible de charger ton planning pour le moment."));
      return;
    }
    setSessions((planned.data ?? []) as Session[]);
    const byDay: Record<string, number> = {};
    for (const r of (study.data ?? []) as { minutes: number; created_at: string }[]) {
      const d = toISO(new Date(r.created_at));
      byDay[d] = (byDay[d] ?? 0) + r.minutes;
    }
    setStudyMin(byDay);
  }, [user.id, from, to, t]);

  useEffect(() => {
    const t = window.setTimeout(load, 0); // chargement hors du rendu
    return () => window.clearTimeout(t);
  }, [load]);

  const byDate = useMemo(() => {
    const acc: Record<string, Session[]> = {};
    for (const s of sessions ?? []) (acc[s.date] ??= []).push(s);
    for (const k of Object.keys(acc)) {
      acc[k].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
    }
    return acc;
  }, [sessions]);

  const go = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => {
    const d = fromISO(todayStr);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(todayStr);
  };
  const pick = (iso: string) => {
    setSelected(iso);
    const d = fromISO(iso);
    if (d.getMonth() !== view.m || d.getFullYear() !== view.y) setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !matiere.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sb.from("planned_sessions").insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      date: selected,
      time: time || null,
      matiere: matiere.trim(),
      sous_matiere: sous.trim() || null,
      reminder: false,
      done: false,
    });
    if (err) setError(t("Impossible d'ajouter cette session. Réessaie dans un instant."));
    else {
      setMatiere("");
      setSous("");
      setTime("");
      await load();
    }
    setBusy(false);
  }

  async function toggle(s: Session) {
    const sb = getSupabase();
    if (!sb) return;
    setSessions((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)));
    await sb.from("planned_sessions").update({ done: !s.done }).eq("id", s.id).eq("user_id", user.id);
  }

  async function remove(id: string) {
    const sb = getSupabase();
    if (!sb) return;
    setSessions((list) => (list ?? []).filter((x) => x.id !== id));
    await sb.from("planned_sessions").delete().eq("id", id).eq("user_id", user.id);
  }

  const daySessions = byDate[selected] ?? [];
  const dayStudy = studyMin[selected] ?? 0;
  const monthCount = (sessions ?? []).filter((s) => {
    const d = fromISO(s.date);
    return d.getMonth() === view.m && d.getFullYear() === view.y;
  }).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="max-w-xl text-muted">{t("Planifie tes sessions de révision. Elles apparaissent sur le calendrier, avec le temps travaillé en Pomodoro.")}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Calendrier */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => go(-1)}
                aria-label={t("Mois précédent")}
                className="grid h-10 w-10 place-items-center rounded-full border border-line text-lg text-ink transition hover:border-ink"
              >
                ‹
              </button>
              <button
                onClick={() => go(1)}
                aria-label={t("Mois suivant")}
                className="grid h-10 w-10 place-items-center rounded-full border border-line text-lg text-ink transition hover:border-ink"
              >
                ›
              </button>
            </div>
            <div className="order-first w-full text-start sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">
              <p className="display text-2xl capitalize text-ink sm:text-3xl">
                {monthName(view.m)} {view.y}
              </p>
              <p className="text-sm text-muted">{t(monthCount > 1 ? "{a} sessions ce mois-ci" : "{a} session ce mois-ci", { a: monthCount })}</p>
            </div>
            <button
              onClick={goToday}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink"
            >{t("Aujourd'hui")}</button>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
              <div key={dow} className="label bg-slide py-2 text-center text-muted">
                {weekdayShort(dow)}
              </div>
            ))}
            {grid.map((iso) => {
              const d = fromISO(iso);
              const inMonth = d.getMonth() === view.m;
              const isToday = iso === todayStr;
              const isSel = iso === selected;
              const list = byDate[iso] ?? [];
              const min = studyMin[iso] ?? 0;
              return (
                <button
                  key={iso}
                  onClick={() => pick(iso)}
                  aria-label={`${labelJour(iso)}${list.length ? `, ${t(list.length > 1 ? "{n} sessions" : "{n} session", { n: list.length })}` : ""}`}
                  aria-pressed={isSel}
                  className={`flex min-h-[4.25rem] flex-col items-stretch p-1.5 text-start transition sm:min-h-[6.5rem] sm:p-2 ${
                    isSel ? "bg-hema-soft" : inMonth ? "bg-white hover:bg-slide" : "bg-slide/60 hover:bg-slide"
                  }`}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center self-start rounded-full text-sm font-semibold ${
                      isToday ? "bg-ink text-white" : inMonth ? "text-ink" : "text-muted/60"
                    }`}
                  >
                    {d.getDate()}
                  </span>

                  {/* Ordinateur : pastilles avec l'heure et la matière */}
                  <span className="mt-1 hidden min-w-0 flex-1 flex-col gap-1 sm:flex">
                    {list.slice(0, MAX_CHIPS).map((s) => (
                      <span
                        key={s.id}
                        className={`truncate rounded-md px-1.5 py-0.5 text-xs font-medium ${
                          s.done ? "bg-slide text-muted line-through" : "bg-eosin-soft text-ink"
                        }`}
                      >
                        {s.time ? `${s.time} ` : ""}
                        {sessionLabel(s)}
                      </span>
                    ))}
                    {list.length > MAX_CHIPS && (
                      <span className="px-1 text-xs font-semibold text-muted">{t(list.length - MAX_CHIPS > 1 ? "+{a} autres" : "+{a} autre", { a: list.length - MAX_CHIPS })}</span>
                    )}
                    {min > 0 && <span className="mt-auto px-1 text-[11px] text-muted">⏱ {fmtMin(min)}</span>}
                  </span>

                  {/* Téléphone : simples points */}
                  <span className="mt-1 flex gap-1 sm:hidden" aria-hidden>
                    {list.slice(0, 3).map((s) => (
                      <span
                        key={s.id}
                        className={`h-1.5 w-1.5 rounded-full ${s.done ? "bg-muted/50" : "bg-eosin"}`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Jour sélectionné */}
        <aside className="rounded-2xl border border-line bg-white p-5 sm:p-6 lg:sticky lg:top-24 lg:self-start">
          <p className="label text-muted">{t("Jour sélectionné")}</p>
          <p className="display mt-1 text-2xl capitalize text-ink">{labelJour(selected)}</p>
          {dayStudy > 0 && <p className="mt-1 text-sm text-muted">{t("⏱ {a} travaillées en Pomodoro", { a: fmtMin(dayStudy) })}</p>}

          <div className="mt-4">
            {sessions === null ? (
              <p className="text-muted">{t("Chargement…")}</p>
            ) : daySessions.length === 0 ? (
              <p className="text-muted">{t("Aucune session ce jour-là.")}</p>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {daySessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-3">
                    <button
                      onClick={() => toggle(s)}
                      aria-label={s.done ? t("Marquer comme à faire") : t("Marquer comme faite")}
                      aria-pressed={s.done}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition ${
                        s.done ? "border-eosin bg-eosin text-ink" : "border-line text-transparent hover:border-ink"
                      }`}
                    >
                      <IconCheck className="h-4 w-4" />
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] ${s.done ? "text-muted line-through" : "text-ink"}`}>
                        {sessionLabel(s)}
                      </span>
                      {s.time && <span className="label text-muted">{s.time}</span>}
                    </span>
                    <button
                      onClick={() => remove(s.id)}
                      aria-label={t("Supprimer cette session")}
                      className="rounded-lg p-2 text-muted transition hover:bg-slide hover:text-[#a3271c]"
                    >
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={add} className="mt-5 border-t border-line pt-5">
            <p className="font-semibold text-ink">{t("Ajouter une session")}</p>
            <label htmlFor="p-m" className="label mt-3 block text-muted">{t("Matière")}</label>
            <input
              id="p-m"
              value={matiere}
              onChange={(e) => setMatiere(e.target.value)}
              placeholder={t("ex : Cardiologie")}
              className="mt-1.5 w-full rounded-xl border border-line bg-slide px-3.5 py-2.5 text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
            <div className="mt-3 grid grid-cols-[7.5rem_1fr] gap-3">
              <div>
                <label htmlFor="p-t" className="label block text-muted">{t("Heure")}</label>
                <input
                  id="p-t"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-line bg-slide px-3 py-2.5 text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="p-s" className="label block text-muted">{t("Chapitre")}</label>
                <input
                  id="p-s"
                  value={sous}
                  onChange={(e) => setSous(e.target.value)}
                  placeholder="facultatif"
                  className="mt-1.5 w-full rounded-xl border border-line bg-slide px-3.5 py-2.5 text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy || !matiere.trim()}
              className="mt-4 w-full rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40"
            >
              {busy ? t("Ajout…") : t("Planifier")}
            </button>
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-[#fff1f0] px-3.5 py-2.5 text-sm text-[#a3271c]">
                {t(error)}
              </p>
            )}
          </form>
        </aside>
      </div>
    </div>
  );
}
