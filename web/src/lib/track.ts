/*
  Suivi des actions importantes (inscription, premier cours, premier QCM, abonnement…) dans Google Analytics.
  N'envoie rien en développement ni si Google Analytics n'est pas chargé. Aucune donnée personnelle n'est envoyée.
*/

type Params = Record<string, string | number | boolean>;
type Win = { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };

function send(name: string, params: Params) {
  const w = window as unknown as Win;
  if (typeof w.gtag === "function") {
    w.gtag("event", name, params);
    return;
  }
  // Google Analytics n'est pas encore prêt : l'événement est mis en file et partira au chargement.
  w.dataLayer = w.dataLayer || [];
  // gtag attend un objet « arguments », pas un tableau
  (function (..._a: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  })("event", name, params);
}

/** Envoie un événement. */
export function track(name: string, params: Params = {}) {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
  try {
    send(name, params);
  } catch {
    /* le suivi ne doit jamais gêner l'application */
  }
}

/** Envoie un événement une seule fois par navigateur (étapes d'activation : premier cours, premier QCM…). */
export function trackOnce(name: string, params: Params = {}) {
  if (typeof window === "undefined") return;
  try {
    const k = `axone:t:${name}`;
    if (window.localStorage.getItem(k)) return;
    window.localStorage.setItem(k, "1");
  } catch {
    /* stockage indisponible : on envoie quand même */
  }
  track(name, params);
}
