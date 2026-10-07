"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";
import { track } from "@/lib/track";

/**
 * Suivi invisible, monté une seule fois dans le layout :
 *  - les clics sur les éléments marqués data-track="nom" (boutons d'appel à l'action) ;
 *  - les erreurs JavaScript non gérées, envoyées dans l'admin.
 */
export function Telemetry() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-track]");
      const name = el?.getAttribute("data-track");
      if (name) track("cta_click", { cta: name, page: window.location.pathname });
    };
    const onError = (e: ErrorEvent) => reportError("window", e.message, { stack: e.error?.stack });
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      reportError("promise", r instanceof Error ? r.message : String(r), { stack: r instanceof Error ? r.stack : undefined });
    };
    document.addEventListener("click", onClick);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
