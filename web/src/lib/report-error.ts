import { getSupabase } from "./supabase";

/*
  Suivi des erreurs : chaque erreur rencontrée dans le navigateur d'un étudiant est enregistrée dans la table
  client_errors (visible dans l'admin, page « Erreurs »). Pas de donnée personnelle : seulement le message,
  la page, le type d'appareil et, si l'étudiant est connecté, son identifiant de compte.
*/

const seen = new Set<string>();
let sent = 0;
const MAX_PER_SESSION = 8;

export function reportError(kind: string, message: string, extra?: { stack?: string; context?: Record<string, unknown> }) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  const msg = (message || "").slice(0, 500);
  if (!msg) return;
  // Bruits sans intérêt : extensions du navigateur, annulations volontaires, perte de réseau
  if (/ResizeObserver loop|AbortError|Failed to fetch|NetworkError|Load failed|chrome-extension|moz-extension/i.test(msg)) return;
  // « Script error. » sans détail : le navigateur masque l'erreur d'un script d'un autre site (Google, statistiques, extension…).
  // Ce n'est pas du code d'Axone et on ne peut rien y corriger : inutile de l'enregistrer.
  if (/^Script error\.?$/i.test(msg) && !extra?.stack) return;
  const key = `${kind}:${msg}`;
  if (seen.has(key) || sent >= MAX_PER_SESSION) return;
  seen.add(key);
  sent++;

  const sb = getSupabase();
  if (!sb) return;
  void (async () => {
    try {
      const { data } = await sb.auth.getSession();
      await sb.from("client_errors").insert({
        user_id: data.session?.user.id ?? null,
        kind,
        message: msg,
        stack: extra?.stack?.slice(0, 2000) ?? null,
        url: window.location.pathname.slice(0, 200),
        user_agent: navigator.userAgent.slice(0, 200),
        context: extra?.context ?? null,
      });
    } catch {
      /* le suivi ne doit jamais gêner l'application */
    }
  })();
}
