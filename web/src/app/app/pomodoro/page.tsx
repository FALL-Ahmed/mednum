"use client";

import { AmbianceSlot, usePomodoro } from "@/components/pomodoro-provider";
import { getAppLang, useT } from "@/lib/app-i18n";

type Mode = "focus" | "pause";
const FOCUS = [15, 25, 45, 60];
const PAUSE = [5, 10, 15];

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const fmtDuration = (min: number) => {
  const ar = getAppLang() === "ar";
  const mu = ar ? "د" : "min";
  const hu = ar ? "س" : "h";
  return min < 60 ? `${min} ${mu}` : `${Math.floor(min / 60)} ${hu}${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;
};

export default function Pomodoro() {
  const t = useT();
  const {
    focusMin, pauseMin, mode, running, leftMs, cycles, matiere, sous, stats, total, progress,
    setMatiere, setSous, start, pause, reset, chooseFocus, choosePause,
  } = usePomodoro();
  const R = 120;
  const C = 2 * Math.PI * R;

  return (
    <div>
      <p className="max-w-xl text-muted">{t("Travaille par blocs de concentration, puis fais une pause. Chaque bloc terminé est enregistré.")}</p>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6 lg:col-span-3">
          <div className="flex justify-center">
            <div
              role="tablist"
              aria-label={t("Phase")}
              className="inline-flex rounded-full border border-line bg-slide p-1"
            >
              {(["focus", "pause"] as Mode[]).map((m) => (
                <span
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  className={`rounded-full px-6 py-2 text-sm font-semibold ${
                    mode === m ? "bg-ink text-white" : "text-ink/60"
                  }`}
                >
                  {m === "focus" ? t("Focus") : t("Pause")}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto mt-5 h-52 w-52 sm:h-56 sm:w-56">
            <svg viewBox="0 0 280 280" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="140" cy="140" r={R} fill="none" stroke="var(--hema-soft)" strokeWidth="12" />
              <circle
                cx="140"
                cy="140"
                r={R}
                fill="none"
                stroke={mode === "focus" ? "var(--eosin)" : "#ffb74d"}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                style={{ transition: "stroke-dashoffset 0.25s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="display text-5xl tabular-nums text-ink" role="timer" aria-live="off">
                {fmtClock(leftMs)}
              </p>
              <p className="label mt-2 text-muted">{t(cycles > 1 ? "{a} blocs terminés" : "{a} bloc terminé", { a: cycles })}
              </p>
            </div>
          </div>

          <div className="mt-5 flex justify-center gap-3">
            {running ? (
              <button
                onClick={pause}
                className="rounded-full bg-ink px-8 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink"
              >{t("Pause")}</button>
            ) : (
              <button
                onClick={start}
                className="rounded-full bg-ink px-8 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink"
              >
                {leftMs < total ? t("Reprendre") : t("Démarrer")}
              </button>
            )}
            <button
              onClick={reset}
              className="rounded-full border border-ink/20 px-6 py-3 font-semibold text-ink transition hover:border-ink"
            >{t("Réinitialiser")}</button>
          </div>
        </section>

        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <p className="display text-xl text-ink">{t("Réglages")}</p>

            <p className="label mt-4 text-muted">{t("Durée de focus")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FOCUS.map((m) => (
                <button
                  key={m}
                  disabled={running}
                  onClick={() => chooseFocus(m)}
                  aria-pressed={focusMin === m}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                    focusMin === m ? "border-ink bg-ink text-white" : "border-line text-ink/80 hover:border-ink"
                  }`}
                >{t("{a} min", { a: m })}</button>
              ))}
            </div>

            <p className="label mt-4 text-muted">{t("Durée de pause")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PAUSE.map((m) => (
                <button
                  key={m}
                  disabled={running}
                  onClick={() => choosePause(m)}
                  aria-pressed={pauseMin === m}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                    pauseMin === m ? "border-ink bg-ink text-white" : "border-line text-ink/80 hover:border-ink"
                  }`}
                >{t("{a} min", { a: m })}</button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="pm" className="label block text-muted">{t("Matière")}{" "}<span className="normal-case tracking-normal">{t("(facultatif)")}</span>
                </label>
                <input
                  id="pm"
                  value={matiere}
                  onChange={(e) => setMatiere(e.target.value)}
                  placeholder={t("ex : Cardiologie")}
                  className="mt-2 w-full rounded-2xl border border-line bg-slide px-4 py-2.5 text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="ps" className="label block text-muted">{t("Chapitre")}{" "}<span className="normal-case tracking-normal">{t("(facultatif)")}</span>
                </label>
                <input
                  id="ps"
                  value={sous}
                  onChange={(e) => setSous(e.target.value)}
                  placeholder={t("ex : Insuffisance cardiaque")}
                  className="mt-2 w-full rounded-2xl border border-line bg-slide px-4 py-2.5 text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="label text-muted">{t("Aujourd'hui")}</p>
              <p className="display mt-1 text-2xl text-ink">{stats ? fmtDuration(stats.today) : "–"}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="label text-muted">{t("7 derniers jours")}</p>
              <p className="display mt-1 text-2xl text-ink">{stats ? fmtDuration(stats.week) : "–"}</p>
            </div>
          </section>
        </div>
      </div>

      <div className="mt-5">
        <AmbianceSlot />
      </div>
    </div>
  );
}
