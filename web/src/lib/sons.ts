export type MusicTrack = { id: string; title: string; file: string; seconds: number };
export type AmbientFile = { id: string; label: string; hint: string; file: string; seconds: number; group: "nature" };
export type SonsManifest = { musique: { lofi: MusicTrack[]; nappes: MusicTrack[] }; ambiance: AmbientFile[] };

/** Dossier des fichiers audio. Pour passer sur un CDN plus tard, il suffit de définir NEXT_PUBLIC_SONS_URL. */
export const SONS_URL = (process.env.NEXT_PUBLIC_SONS_URL ?? "/sons").replace(/\/+$/, "");

export const fileUrl = (name: string) => `${SONS_URL}/${name}`;

/** Liste des morceaux et des enregistrements (public/sons/sons.json). Renvoie null si elle est introuvable. */
export async function loadSons(): Promise<SonsManifest | null> {
  try {
    const res = await fetch(`${SONS_URL}/sons.json`, { cache: "force-cache" });
    if (!res.ok) return null;
    return (await res.json()) as SonsManifest;
  } catch {
    return null;
  }
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
