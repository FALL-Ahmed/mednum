"use client";

import { useAppLang } from "@/lib/app-i18n";

/** Enveloppe de l'espace connecté : sens de lecture et polices selon la langue choisie. */
export function AppLangRoot({ fontClass, children }: { fontClass: string; children: React.ReactNode }) {
  const lang = useAppLang();
  const ar = lang === "ar";
  return (
    <div
      lang={lang}
      dir={ar ? "rtl" : "ltr"}
      className={fontClass}
      style={
        ar
          ? ({
              "--font-display": "var(--font-ar-titres)",
              "--font-body": "var(--font-ar-texte)",
              "--font-mono": "var(--font-ar-texte)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}
