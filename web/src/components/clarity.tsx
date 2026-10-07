"use client";

import { useEffect } from "react";

// Identifiant du projet Microsoft Clarity (clarity.microsoft.com > Paramètres). Peut être remplacé par NEXT_PUBLIC_CLARITY_ID.
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID || "ytyrl5kwu2";

type ClarityWindow = Window & { clarity?: ((...args: unknown[]) => void) & { q?: unknown[] } };

/**
 * Microsoft Clarity (cartes de clics et enregistrements anonymes des visites).
 * À placer UNIQUEMENT sur les pages publiques (accueil, connexion) : jamais dans l'espace connecté,
 * où s'affichent les cours et les discussions privées des étudiants. En quittant la page, l'enregistrement s'arrête.
 */
export function Clarity() {
  useEffect(() => {
    if (!CLARITY_ID || process.env.NODE_ENV !== "production") return;
    const w = window as ClarityWindow;
    if (!w.clarity) {
      w.clarity = function (...args: unknown[]) {
        (w.clarity!.q = w.clarity!.q || []).push(args);
      };
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
      document.head.appendChild(s);
    }
    return () => {
      try {
        w.clarity?.("stop");
      } catch {
        /* rien à arrêter */
      }
    };
  }, []);
  return null;
}
