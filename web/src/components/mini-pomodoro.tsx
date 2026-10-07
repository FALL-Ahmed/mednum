"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { usePomodoro } from "./pomodoro-provider";
import { useT } from "@/lib/app-i18n";

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Petit lecteur visible sur toutes les pages (sauf la page Pomodoro) tant qu'un chrono tourne, qu'il est en pause
 * en cours de route, ou que de la musique joue : l'étudiant le garde sous les yeux pendant qu'il révise.
 */
export function MiniPomodoro() {
  const t = useT();
  const pathname = usePathname();
  const p = usePomodoro();
  const idle = !p.running && p.leftMs >= p.total;
  const here = pathname.startsWith("/app/pomodoro");

  // Le message de fin de bloc disparaît tout seul
  useEffect(() => {
    if (!p.finished) return;
    const id = window.setTimeout(p.dismissFinished, 12000);
    return () => window.clearTimeout(id);
  }, [p.finished, p.dismissFinished]);

  if (here || (idle && !p.audioOn && !p.finished)) return null;

  return (
    <div
      role="status"
      className={`fixed ${pathname.startsWith("/app/chat") ? "bottom-28" : "bottom-4"} end-4 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full bg-ink py-2 pe-3 ps-4 text-white shadow-[0_14px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/10`}
    >
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.mode === "focus" ? "bg-eosin" : "bg-[#ffb74d]"} ${p.running ? "animate-pulse" : ""}`} />
      <div className="min-w-0 leading-tight">
        {p.finished && (
          <p className="truncate text-xs font-semibold text-eosin">
            {p.finished.mode === "focus" ? t("Bloc terminé ! Pause de {a} min.", { a: p.finished.pauseMin }) : t("Pause finie : retour au focus.")}
          </p>
        )}
        <p className="display text-lg tabular-nums">{idle ? t("Pomodoro") : clock(p.leftMs)}</p>
        <p className="label text-[10px] text-white/60">{idle ? t("Ambiance sonore") : p.mode === "focus" ? t("Focus") : t("Pause")}</p>
      </div>
      {!idle && (
        <button
          onClick={p.running ? p.pause : p.start}
          aria-label={p.running ? t("Pause") : t("Reprendre")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"
        >
          {p.running ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" />
            </svg>
          )}
        </button>
      )}
      {p.audioOn && (
        <button
          onClick={p.stopAudio}
          aria-label={t("Couper le son")}
          title={t("Couper le son")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm transition hover:bg-white/25"
        >
          <span aria-hidden>♪</span>
        </button>
      )}
      <Link href="/app/pomodoro" className="shrink-0 rounded-full px-2.5 py-1.5 text-sm font-semibold text-white/80 transition hover:text-white">
        {t("Ouvrir")}
      </Link>
    </div>
  );
}
