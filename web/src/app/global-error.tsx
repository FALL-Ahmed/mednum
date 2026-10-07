"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Dernier filet de sécurité : une erreur qui casse toute la page est enregistrée, et l'étudiant peut réessayer.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError("render", error.message, { stack: error.stack, context: { digest: error.digest ?? null } });
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "64px 24px", textAlign: "center", color: "#0b1e34" }}>
        <h1 style={{ fontSize: 28 }}>Oups, quelque chose s&apos;est mal passé.</h1>
        <p style={{ marginTop: 12, color: "#5b6b7c" }}>L&apos;erreur a été signalée. Tu peux réessayer.</p>
        <button
          onClick={reset}
          style={{ marginTop: 24, padding: "12px 28px", borderRadius: 999, border: 0, background: "#0b1e34", color: "#fff", fontWeight: 600, fontSize: 16 }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
