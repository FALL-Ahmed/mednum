"use client";

import { setAppLang, useAppLang } from "@/lib/app-i18n";

/** Bouton de langue : propose l'autre langue (le nom de la langue reste écrit dans sa propre langue). */
export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useAppLang();
  const next = lang === "ar" ? "fr" : "ar";
  return (
    <button type="button" onClick={() => setAppLang(next)} lang={next} className={className}>
      {next === "ar" ? "العربية" : "Français"}
    </button>
  );
}
