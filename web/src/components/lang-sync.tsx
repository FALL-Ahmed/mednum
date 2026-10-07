"use client";

import { useEffect } from "react";
import { setAppLang, type AppLang } from "@/lib/app-i18n";

/**
 * Retient la langue choisie en entrant sur le site : /ar passe l'espace connecté en arabe.
 * Avec `onlyIf`, ne change la langue que si l'adresse contient ce texte (retour volontaire au français : /?l=fr).
 */
export function LangSync({ lang, onlyIf }: { lang: AppLang; onlyIf?: string }) {
  useEffect(() => {
    if (onlyIf && !window.location.search.includes(onlyIf)) return;
    setAppLang(lang);
  }, [lang, onlyIf]);
  return null;
}
