"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useApp } from "./app-context";
import { Ambiance } from "./ambiance";
import { addDays, todayISO, toISO } from "@/lib/dates";
import { getSupabase } from "@/lib/supabase";

/*
  Le minuteur Pomodoro et l'ambiance sonore vivent ici, dans la structure générale de l'espace connecté, et non
  dans la page Pomodoro : l'étudiant peut donc aller réviser un cours, faire un QCM ou discuter avec Dr. Ahmed
  pendant que le chrono et la musique continuent. Un petit lecteur (MiniPomodoro) reste visible sur toutes les pages.
  L'état est gardé dans le navigateur : un rechargement de la page retrouve le chrono en cours.
*/

export type Mode = "focus" | "pause";

type Saved = {
  focusMin: number;
  pauseMin: number;
  mode: Mode;
  running: boolean;
  endAt: number | null;
  leftMs: number;
  cycles: number;
  matiere: string;
  sous: string;
};
const KEY = "axone:pomodoro:v1";

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* son indisponible : sans importance */
  }
}

type Ctx = {
  focusMin: number;
  pauseMin: number;
  mode: Mode;
  running: boolean;
  leftMs: number;
  cycles: number;
  matiere: string;
  sous: string;
  stats: { today: number; week: number } | null;
  total: number;
  progress: number;
  audioOn: boolean;
  /** Dernière fin de bloc (pour le message du mini-lecteur). */
  finished: { mode: Mode; at: number; pauseMin: number } | null;
  setMatiere: (v: string) => void;
  setSous: (v: string) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  chooseFocus: (m: number) => void;
  choosePause: (m: number) => void;
  stopAudio: () => void;
  dismissFinished: () => void;
  /** Pour la page Pomodoro : l'ambiance sonore y est affichée via AmbianceSlot. */
  host: HTMLDivElement | null;
  holder: RefObject<HTMLDivElement | null>;
};

const PomodoroContext = createContext<Ctx | null>(null);

export function usePomodoro(): Ctx {
  const c = useContext(PomodoroContext);
  if (!c) throw new Error("usePomodoro doit être utilisé dans l'espace connecté.");
  return c;
}

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const [focusMin, setFocusMin] = useState(25);
  const [pauseMin, setPauseMin] = useState(5);
  const [mode, setMode] = useState<Mode>("focus");
  const [running, setRunning] = useState(false);
  const [leftMs, setLeftMs] = useState(25 * 60000);
  const [cycles, setCycles] = useState(0);
  const [matiere, setMatiere] = useState("");
  const [sous, setSous] = useState("");
  const [stats, setStats] = useState<{ today: number; week: number } | null>(null);
  const [finished, setFinished] = useState<Ctx["finished"]>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const endAtRef = useRef<number | null>(null);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const hydrated = useRef(false);
  const latest = useRef({ mode, focusMin, pauseMin, matiere, sous });

  useEffect(() => {
    latest.current = { mode, focusMin, pauseMin, matiere, sous };
  });

  // Où vit l'ambiance sonore quand la page Pomodoro n'est pas ouverte : un conteneur caché
  useEffect(() => {
    const el = document.createElement("div");
    holder.current?.appendChild(el);
    setHost(el);
    return () => el.remove();
  }, []);

  // Reprise du chrono après un rechargement de la page
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) {
          const s = JSON.parse(raw) as Saved;
          if (typeof s.focusMin === "number") setFocusMin(s.focusMin);
          if (typeof s.pauseMin === "number") setPauseMin(s.pauseMin);
          setCycles(s.cycles ?? 0);
          setMatiere(s.matiere ?? "");
          setSous(s.sous ?? "");
          if (s.running && s.endAt && s.endAt > Date.now()) {
            endAtRef.current = s.endAt;
            setMode(s.mode);
            setLeftMs(s.endAt - Date.now());
            setRunning(true);
          } else if (!s.running && s.leftMs > 0) {
            setMode(s.mode);
            setLeftMs(s.leftMs);
          } else {
            setMode("focus");
            setLeftMs((s.focusMin || 25) * 60000);
          }
        }
      } catch {
        /* stockage indisponible : on repart de zéro */
      }
      hydrated.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Sauvegarde (sans écrire à chaque tick : en marche, seule l'heure de fin compte)
  const idleLeft = running ? 0 : leftMs;
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const s: Saved = { focusMin, pauseMin, mode, running, endAt: running ? endAtRef.current : null, leftMs: idleLeft, cycles, matiere, sous };
      window.localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* stockage indisponible */
    }
  }, [focusMin, pauseMin, mode, running, idleLeft, cycles, matiere, sous]);

  const loadStats = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const since = addDays(todayISO(), -6);
    const { data } = await sb
      .from("study_sessions")
      .select("minutes,created_at")
      .eq("user_id", user.id)
      .gte("created_at", `${since}T00:00:00`);
    const rows = (data ?? []) as { minutes: number; created_at: string }[];
    const today = todayISO();
    setStats({
      week: rows.reduce((n, r) => n + r.minutes, 0),
      today: rows.filter((r) => toISO(new Date(r.created_at)) === today).reduce((n, r) => n + r.minutes, 0),
    });
  }, [user.id]);

  useEffect(() => {
    const t = window.setTimeout(loadStats, 0); // chargement initial, hors du rendu
    return () => window.clearTimeout(t);
  }, [loadStats]);

  const finish = useCallback(async () => {
    const s = latest.current;
    beep();
    setFinished({ mode: s.mode, at: Date.now(), pauseMin: s.pauseMin });
    if (s.mode === "focus") {
      setCycles((c) => c + 1);
      setMode("pause");
      endAtRef.current = Date.now() + s.pauseMin * 60000;
      setLeftMs(s.pauseMin * 60000);
      const sb = getSupabase();
      if (sb) {
        await sb.from("study_sessions").insert({
          user_id: user.id,
          matiere: s.matiere.trim() || null,
          sous_matiere: s.sous.trim() || null,
          minutes: s.focusMin,
        });
        loadStats();
      }
    } else {
      setMode("focus");
      endAtRef.current = Date.now() + s.focusMin * 60000;
      setLeftMs(s.focusMin * 60000);
    }
  }, [user.id, loadStats]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const end = endAtRef.current;
      if (end == null) return;
      const left = end - Date.now();
      if (left <= 0) finish();
      else setLeftMs(left);
    }, 250);
    return () => window.clearInterval(id);
  }, [running, finish]);

  // Le temps restant dans le titre de l'onglet, sur toutes les pages, pour le suivre pendant qu'on travaille.
  useEffect(() => {
    if (!running) return;
    const original = document.title;
    const s = Math.max(0, Math.ceil(leftMs / 1000));
    document.title = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")} · ${mode === "focus" ? "Focus" : "Pause"} · Axone`;
    return () => {
      document.title = original;
    };
  }, [running, leftMs, mode]);

  const start = useCallback(() => {
    endAtRef.current = Date.now() + leftMs;
    setFinished(null);
    setRunning(true);
  }, [leftMs]);
  const pause = useCallback(() => {
    if (endAtRef.current != null) setLeftMs(Math.max(0, endAtRef.current - Date.now()));
    endAtRef.current = null;
    setRunning(false);
  }, []);
  const reset = useCallback(() => {
    endAtRef.current = null;
    setRunning(false);
    setMode("focus");
    setLeftMs(focusMin * 60000);
    setFinished(null);
  }, [focusMin]);

  const chooseFocus = useCallback(
    (m: number) => {
      setFocusMin(m);
      if (!running && mode === "focus") setLeftMs(m * 60000);
    },
    [running, mode],
  );
  const choosePause = useCallback(
    (m: number) => {
      setPauseMin(m);
      if (!running && mode === "pause") setLeftMs(m * 60000);
    },
    [running, mode],
  );

  const total = (mode === "focus" ? focusMin : pauseMin) * 60000;
  const progress = Math.min(1, Math.max(0, 1 - leftMs / total));

  const value = useMemo<Ctx>(
    () => ({
      focusMin, pauseMin, mode, running, leftMs, cycles, matiere, sous, stats, total, progress, audioOn, finished,
      setMatiere, setSous, start, pause, reset, chooseFocus, choosePause,
      stopAudio: () => stopAudioRef.current?.(),
      dismissFinished: () => setFinished(null),
      host, holder,
    }),
    [focusMin, pauseMin, mode, running, leftMs, cycles, matiere, sous, stats, total, progress, audioOn, finished, start, pause, reset, chooseFocus, choosePause, host],
  );

  return (
    <PomodoroContext.Provider value={value}>
      {children}
      <div ref={holder} hidden aria-hidden />
      {/* L'ambiance sonore reste montée tant que l'espace connecté est ouvert : la musique ne s'arrête pas quand on change de page */}
      {host &&
        createPortal(
          <Ambiance
            inBreak={mode === "pause"}
            onState={(s) => setAudioOn(s.playing && s.count > 0)}
            registerStop={(fn) => {
              stopAudioRef.current = fn;
            }}
          />,
          host,
        )}
    </PomodoroContext.Provider>
  );
}

/** Emplacement de l'ambiance sonore dans la page Pomodoro : on y déplace l'élément qui la contient (sans la recréer). */
export function AmbianceSlot() {
  const { host, holder } = usePomodoro();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const slot = ref.current;
    if (!slot || !host) return;
    slot.appendChild(host);
    const home = holder.current;
    return () => {
      home?.appendChild(host);
    };
  }, [host, holder]);
  return <div ref={ref} />;
}
