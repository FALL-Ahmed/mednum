"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { fileUrl, fmtTime, loadSons, type MusicTrack, type SonsManifest } from "@/lib/sons";
import { PRESETS, SOUNDS, Soundscape, type SoundId } from "@/lib/soundscape";
import { useT } from "@/lib/app-i18n";

const KEY = "axone:ambiance:v2";
type Mix = Record<string, number>;
type Saved = { mix: Mix; master: number; muteBreak: boolean };

const GROUPS: { id: "nature" | "lieu" | "bruit"; title: string }[] = [
  { id: "nature", title: "Nature" },
  { id: "lieu", title: "Lieux" },
  { id: "bruit", title: "Bruits de fond" },
];

const GRADIENT: Record<string, string> = {
  lofi: "linear-gradient(135deg,#3a2616,#9a5b2c)",
  rain: "linear-gradient(135deg,#0b1e34,#2a6285)",
  forest: "linear-gradient(135deg,#0b3326,#2f8a62)",
  sea: "linear-gradient(135deg,#0a3556,#2f9bc0)",
  fire: "linear-gradient(135deg,#3d1408,#d0601e)",
  storm: "linear-gradient(135deg,#121829,#4a4f7d)",
  deep: "linear-gradient(135deg,#0b1e34,#07a997)",
};

const ICON: Record<string, ReactNode> = {
  rain: <><path d="M16 13v6M8 13v6M12 15v6" /><path d="M20 15.6A5 5 0 0 0 18 6h-1.3A7 7 0 1 0 4 13.2" /></>,
  storm: <><path d="M19 16.9A5 5 0 0 0 18 7h-1.3a7 7 0 1 0-11.6 9" /><polyline points="13 11 9 17 15 17 11 23" /></>,
  river: <><path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 8 0" /><path d="M2 14c2-2 4-2 6 0s4 2 6 0 4-2 8 0" /><path d="M2 20c2-2 4-2 6 0s4 2 6 0 4-2 8 0" /></>,
  wind: <path d="M9.6 4.6A2 2 0 1 1 11 8H2m10.6 11.4A2 2 0 1 0 14 16H2m15.7-8.3A2.5 2.5 0 1 1 19.5 12H2" />,
  waves: <><path d="M2 12c2.5-4 5-4 7.5 0s5 4 7.5 0 3-2 5-1" /><path d="M2 18c2.5-4 5-4 7.5 0s5 4 7.5 0 3-2 5-1" /><path d="M2 6c2.5-4 5-4 7.5 0s5 4 7.5 0 3-2 5-1" /></>,
  birds: <><path d="M3 11c2.5-4.5 5-4.5 7.5 0 2.5-4.5 5-4.5 7.5 0" /><path d="M9 19c1.7-3 3.4-3 5 0 1.700-3 3.300-3 5 0" /></>,
  fire: <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 2 3-5z" />,
  cafe: <><path d="M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9z" /><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3v3M12 3v3" /></>,
  pink: <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />,
  brown: <path d="M4 12v2M8 9v6M12 5v14M16 8v8M20 11v3" />,
  white: <path d="M4 6v12M8 3v18M12 7v10M16 4v16M20 8v8" />,
};

const Headphones = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
  </svg>
);
const Note = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);
const totalMin = (tracks: MusicTrack[]) => Math.round(tracks.reduce((n, t) => n + t.seconds, 0) / 60);

type TrackKind = "lofi" | "nappes";
const PLAYLISTS: { kind: TrackKind; label: string; hint: string }[] = [
  { kind: "lofi", label: "Lo-fi", hint: "Beats doux" },
  { kind: "nappes", label: "Nappes calmes", hint: "Accords planants, sans rythme" },
];

/** Icône d'un son : les enregistrements prennent l'icône de leur famille. */
const iconId = (id: string): string =>
  id in ICON ? id : id.startsWith("pluie") ? "storm" : id.startsWith("ruisseau") ? "river" : id.startsWith("vent") ? "wind" : "birds";

const Svg = ({ id, size = 26 }: { id: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {ICON[iconId(id)]}
  </svg>
);

const sameMix = (a: Mix, b: Mix) => {
  const ka = Object.keys(a) as SoundId[];
  const kb = Object.keys(b) as SoundId[];
  return ka.length === kb.length && ka.every((k) => k in b);
};

type Repeat = "all" | "one" | "off";

/** Un autre morceau que `except`, tiré au hasard (appelé depuis un clic, jamais pendant le rendu). */
function otherIndex(length: number, except: number): number {
  let i = except;
  while (length > 1 && i === except) i = Math.floor(Math.random() * length);
  return i;
}
type Current = { kind: TrackKind; index: number } | null;

/** Ambiance sonore : playlists de musique + sons de la nature à mélanger. L'élève choisit et lance quand il veut. */
export function Ambiance({
  inBreak,
  onState,
  registerStop,
}: {
  inBreak: boolean;
  /** Prévient le mini-lecteur quand de la musique ou des sons jouent. */
  onState?: (s: { playing: boolean; count: number }) => void;
  /** Donne au mini-lecteur le moyen de tout couper. */
  registerStop?: (fn: (() => void) | null) => void;
}) {
  const t = useT();
  const scape = useRef<Soundscape | null>(null);
  const [mix, setMix] = useState<Mix>({});
  const [playing, setPlaying] = useState(false);
  const [master, setMaster] = useState(0.8);
  const [musicVol, setMusicVol] = useState(0.7);
  const [muteBreak, setMuteBreak] = useState(false);
  const [last, setLast] = useState<Mix>({});
  const [tab, setTab] = useState<TrackKind>("lofi");
  const [current, setCurrent] = useState<Current>(null);
  const [elapsed, setElapsed] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("all");
  const [sons, setSons] = useState<SonsManifest | null>(null);
  const [sonsState, setSonsState] = useState<"loading" | "ok" | "missing">("loading");
  const loaded = useRef(false);
  const opts = useRef({ shuffle, repeat });

  useEffect(() => {
    opts.current = { shuffle, repeat };
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) {
          const s = JSON.parse(raw) as Saved;
          if (typeof s.master === "number") setMaster(s.master);
          setMuteBreak(s.muteBreak === true);
          if (s.mix && Object.keys(s.mix).length > 0) setLast(s.mix);
        }
      } catch {
        /* stockage indisponible : sans importance */
      }
      loaded.current = true;
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      const keep = Object.keys(mix).length > 0 ? mix : last;
      window.localStorage.setItem(KEY, JSON.stringify({ mix: keep, master, muteBreak } satisfies Saved));
    } catch {
      /* stockage indisponible */
    }
  }, [mix, master, muteBreak, last]);

  useEffect(() => {
    const s = new Soundscape();
    scape.current = s;
    return () => {
      s.dispose();
      scape.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSons().then((m) => {
      if (cancelled) return;
      if (!m) return setSonsState("missing");
      scape.current?.registerFiles(m.ambiance.map((f) => ({ id: f.id, url: fileUrl(f.file), seconds: f.seconds })));
      setSons(m);
      setSonsState("ok");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scape.current?.setMaster(master);
  }, [master]);
  useEffect(() => {
    scape.current?.setMusicLevel(musicVol);
  }, [musicVol]);

  // Le son joue si l'élève l'a lancé, et (en option seulement) se tait pendant les pauses du minuteur.
  useEffect(() => {
    scape.current?.setSuspended(!playing || (muteBreak && inBreak));
  }, [playing, muteBreak, inBreak]);

  // Avancement du morceau en cours
  useEffect(() => {
    if (!current || !playing) return;
    const id = window.setInterval(() => setElapsed(scape.current?.musicElapsed() ?? 0), 300);
    return () => window.clearInterval(id);
  }, [current, playing]);

  const tracksOf = (kind: TrackKind): MusicTrack[] => sons?.musique[kind] ?? [];

  const playIndex = (kind: TrackKind, index: number) => {
    const list = tracksOf(kind);
    const track = list[index];
    if (!track || !scape.current) return;
    setCurrent({ kind, index });
    setElapsed(0);
    setPlaying(true);
    scape.current.playFile(fileUrl(track.file), () => {
      // Fin du morceau : on enchaîne selon le mode choisi (ordre, aléatoire, répétition)
      const { shuffle: sh, repeat: rp } = opts.current;
      if (rp === "one") return playIndex(kind, index);
      const nextIndex = sh && list.length > 1 ? otherIndex(list.length, index) : (index + 1) % list.length;
      if (rp === "off" && !sh && index === list.length - 1) {
        setCurrent(null);
        return;
      }
      playIndex(kind, nextIndex);
    });
  };

  const stepTrack = (dir: 1 | -1) => {
    if (!current) return;
    const list = tracksOf(current.kind);
    if (dir === -1 && elapsed > 4) return playIndex(current.kind, current.index);
    const i = shuffle && list.length > 1 ? otherIndex(list.length, current.index) : (current.index + dir + list.length) % list.length;
    playIndex(current.kind, i);
  };

  const stopMusic = () => {
    scape.current?.stopMusic();
    setCurrent(null);
    setElapsed(0);
  };

  const count = Object.keys(mix).length + (current ? 1 : 0);

  const setLevel = (id: SoundId, v: number) => {
    scape.current?.setLayer(id, v);
    setMix((m) => {
      const n = { ...m };
      if (v <= 0) delete n[id];
      else n[id] = v;
      return n;
    });
    if (v > 0) setPlaying(true);
  };

  const applyAmbient = (next: Mix) => {
    for (const id of new Set([...Object.keys(mix), ...Object.keys(next)])) scape.current?.setLayer(id, next[id] ?? 0);
    setMix({ ...next });
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    applyAmbient(p.mix);
    if (p.music) {
      setTab(p.music);
      playIndex(p.music, 0);
    } else stopMusic();
    setPlaying(Object.keys(p.mix).length > 0 || !!p.music);
  };

  const stopAll = () => {
    applyAmbient({});
    stopMusic();
    setPlaying(false);
  };

  const stopAllRef = useRef(stopAll);
  useEffect(() => {
    stopAllRef.current = stopAll;
  });
  useEffect(() => {
    registerStop?.(() => stopAllRef.current());
    return () => registerStop?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    onState?.({ playing, count });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, count]);

  const presetOn = (p: (typeof PRESETS)[number]) =>
    count > 0 && sameMix(mix, p.mix) && (p.music ? current?.kind === p.music : current === null);

  // Sons à mélanger : sons générés + enregistrements trouvés dans sons.json
  const allSounds: { id: string; label: string; hint: string; group: "nature" | "lieu" | "bruit" }[] = [
    ...SOUNDS,
    ...(sons?.ambiance ?? []).map((f) => ({ id: f.id, label: f.label, hint: f.hint, group: f.group })),
  ];

  const status = t(count === 0 ? "Aucun son choisi" : playing ? "En cours de lecture" : "En pause");
  const track = current ? tracksOf(current.kind)[current.index] : null;
  const meta = PLAYLISTS.find((p) => p.kind === tab)!;
  const listTracks = tracksOf(tab);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      {/* Barre de lecture */}
      <div className="flex flex-wrap items-center gap-5 bg-ink px-6 py-6 text-white sm:px-8">
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={count === 0}
          aria-label={playing ? t("Mettre le son en pause") : t("Lancer le son")}
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-eosin text-ink shadow-lg transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
        >
          {playing && count > 0 ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="display text-2xl leading-tight">{t("Ambiance sonore")}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-white/70">
            <span className={`eq text-eosin${playing && count > 0 ? "" : " idle"}`} aria-hidden>
              <i /><i /><i /><i />
            </span>
            {status}
            {track && <span className="text-white/90">· {t(track.title)}</span>}
            {Object.keys(mix).length > 0 && <span className="text-white/50">{t(Object.keys(mix).length > 1 ? "· {a} sons de nature" : "· {a} son de nature", { a: Object.keys(mix).length })}</span>}
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold text-white/80">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          </svg>
          <span className="sr-only">{t("Volume général")}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(master * 100)}
            onChange={(e) => setMaster(Number(e.target.value) / 100)}
            aria-label={t("Volume général")}
            className="w-36 accent-[var(--eosin)]"
          />
        </label>
        {count > 0 && (
          <button onClick={stopAll} className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white hover:text-ink">{t("Tout arrêter")}</button>
        )}
      </div>

      <div className="space-y-8 p-6 sm:p-8">
        {/* Ambiances prêtes */}
        <div>
          <p className="label text-muted">{t("Ambiances prêtes · un clic")}</p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {PRESETS.map((p) => {
              const on = presetOn(p);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => (on ? stopAll() : applyPreset(p))}
                    aria-pressed={on}
                    style={{ background: GRADIENT[p.id] }}
                    className={`relative flex h-28 w-full flex-col justify-end rounded-2xl p-4 text-start text-white transition hover:-translate-y-0.5 hover:shadow-lg ${
                      on ? "ring-4 ring-eosin ring-offset-2" : ""
                    }`}
                  >
                    <span className="display text-lg leading-tight">{t(p.label)}</span>
                    <span className="mt-0.5 text-xs text-white/75">{t(p.hint)}</span>
                    {on && <span className="absolute end-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-ink">{t("En cours")}</span>}
                  </button>
                </li>
              );
            })}
            {count === 0 && Object.keys(last).length > 0 && (
              <li>
                <button
                  onClick={() => {
                    applyAmbient(last);
                    setPlaying(true);
                  }}
                  className="flex h-28 w-full flex-col justify-end rounded-2xl border-2 border-dashed border-ink/25 p-4 text-start text-ink transition hover:border-ink"
                >
                  <span className="display text-lg leading-tight">{t("Mon dernier mélange")}</span>
                  <span className="mt-0.5 text-xs text-muted">
                    {Object.keys(last).map((k) => allSounds.find((s) => s.id === k)?.label ?? k).join(" · ")}
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>

        {/* Playlists de musique */}
        <div>
          <p className="label text-muted">{t("Musique · playlists")}</p>
          <div className="mt-3 rounded-2xl border border-line">
            <div role="tablist" aria-label={t("Playlist")} className="grid grid-cols-2 gap-2 border-b border-line p-2">
              {PLAYLISTS.map((p) => (
                <button
                  key={p.kind}
                  role="tab"
                  aria-selected={tab === p.kind}
                  onClick={() => setTab(p.kind)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-start transition ${tab === p.kind ? "bg-ink text-white" : "text-ink hover:bg-slide"}`}
                >
                  <span className={tab === p.kind ? "text-eosin" : "text-ink/60"}>{p.kind === "lofi" ? <Headphones /> : <Note />}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold leading-tight">{t(p.label)}</span>
                    <span className={`block truncate text-xs ${tab === p.kind ? "text-white/60" : "text-muted"}`}>{t("{a} morceaux · {b} min · {c}", { a: tracksOf(p.kind).length, b: totalMin(tracksOf(p.kind)), c: p.hint })}</span>
                  </span>
                </button>
              ))}
            </div>

            {sonsState !== "ok" ? (
              <p className="px-4 py-6 text-sm text-muted">
                {sonsState === "loading" ? t("Chargement de la musique…") : t("La musique n'est pas disponible pour le moment.")}
              </p>
            ) : (
              <ol>
                {listTracks.map((track, i) => {
                  const isCur = current?.kind === meta.kind && current.index === i;
                  const d = track.seconds;
                  return (
                    <li key={track.id} className={`border-b border-line last:border-b-0 ${isCur ? "bg-eosin-soft" : ""}`}>
                      <button onClick={() => (isCur && playing ? setPlaying(false) : isCur ? setPlaying(true) : playIndex(meta.kind, i))} className="flex w-full items-center gap-4 px-4 py-3 text-start transition hover:bg-slide/70">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-sm font-semibold text-ink ring-1 ring-line">
                          {isCur && playing ? (
                            <span className="eq text-eosin" aria-hidden><i /><i /><i /></span>
                          ) : isCur ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                          ) : (
                            i + 1
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold leading-tight text-ink">{t(track.title)}</span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-ink/70">{isCur ? `${fmtTime(elapsed)} / ${fmtTime(d)}` : fmtTime(d)}</span>
                      </button>
                      {isCur && (
                        <div className="px-4 pb-3">
                          <div className="h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-line" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(d)} aria-valuenow={Math.round(elapsed)} aria-label={t("Avancement du morceau")}>
                            <div className="h-full rounded-full bg-eosin transition-[width] duration-300" style={{ width: `${Math.min(100, (elapsed / d) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-line bg-slide/60 px-4 py-3">
              <button onClick={() => stepTrack(-1)} disabled={!current} aria-label={t("Morceau précédent")} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink transition hover:border-ink disabled:opacity-40">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
              </button>
              <button
                onClick={() => (current ? setPlaying((p) => !p) : playIndex(meta.kind, shuffle ? otherIndex(listTracks.length, -1) : 0))}
                aria-label={current && playing ? t("Pause") : t("Lire la playlist")}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-eosin hover:text-ink"
              >
                {current && playing ? t("Pause") : current ? t("Reprendre") : t("Lire la playlist")}
              </button>
              <button onClick={() => stepTrack(1)} disabled={!current} aria-label={t("Morceau suivant")} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink transition hover:border-ink disabled:opacity-40">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>
              </button>
              <button onClick={() => setShuffle((v) => !v)} aria-pressed={shuffle} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${shuffle ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/80 hover:border-ink"}`}>{t("Aléatoire")}</button>
              <button
                onClick={() => setRepeat((r) => (r === "all" ? "one" : r === "one" ? "off" : "all"))}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${repeat === "off" ? "border-line bg-white text-ink/80 hover:border-ink" : "border-ink bg-ink text-white"}`}
              >
                {repeat === "all" ? t("Répéter la playlist") : repeat === "one" ? t("Répéter ce morceau") : t("Pas de répétition")}
              </button>
              {current && (
                <button onClick={stopMusic} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/80 transition hover:border-ink">{t("Arrêter la musique")}</button>
              )}
              <label className="ms-auto flex items-center gap-2 text-sm font-semibold text-ink/70">{t("Volume musique")}<input type="range" min={0} max={100} value={Math.round(musicVol * 100)} onChange={(e) => setMusicVol(Number(e.target.value) / 100)} aria-label={t("Volume de la musique")} className="w-28 accent-[var(--eosin)]" />
              </label>
            </div>
          </div>
        </div>

        {/* Sons de la nature et bruits de fond */}
        <div>
          <p className="label text-muted">{t("Sons à mélanger · plusieurs à la fois, par-dessus la musique si tu veux")}</p>
          {GROUPS.map((g) => (
            <div key={g.id} className="mt-5">
              <p className="text-sm font-semibold text-ink">{t(g.title)}</p>
              <ul className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {allSounds.filter((s) => s.group === g.id).map((s) => {
                  const v = mix[s.id] ?? 0;
                  const on = v > 0;
                  return (
                    <li key={s.id}>
                      <div className={`rounded-2xl border p-4 transition ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/40"}`}>
                        <button onClick={() => setLevel(s.id, on ? 0 : 0.6)} aria-pressed={on} className="flex w-full items-center gap-3 text-start">
                          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${on ? "bg-white/10 text-eosin" : "bg-slide text-ink/70"}`}>
                            <Svg id={s.id} />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold leading-tight">{t(s.label)}</span>
                            <span className={`block truncate text-xs ${on ? "text-white/60" : "text-muted"}`}>{t(s.hint)}</span>
                          </span>
                        </button>
                        {on && (
                          <input
                            type="range"
                            min={5}
                            max={100}
                            value={Math.round(v * 100)}
                            onChange={(e) => setLevel(s.id, Number(e.target.value) / 100)}
                            aria-label={t("Volume : {a}", { a: s.label })}
                            className="mt-3 w-full accent-[var(--eosin)]"
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <label className="flex items-center gap-3 border-t border-line pt-5 text-sm text-ink/80">
          <input type="checkbox" checked={muteBreak} onChange={(e) => setMuteBreak(e.target.checked)} className="h-4 w-4 accent-[var(--eosin)]" />{t("Mettre le son en pause pendant les pauses du minuteur")}{" "}<span className="text-muted">{t("(sinon il continue jusqu'à ce que tu l'arrêtes)")}</span>
        </label>
      </div>
    </section>
  );
}
