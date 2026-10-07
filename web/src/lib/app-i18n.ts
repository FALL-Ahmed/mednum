"use client";

import { useCallback, useSyncExternalStore } from "react";
import { AR } from "./app-ar";

/*
  Langue de l'espace connecté : français (par défaut) ou arabe. Le choix est gardé dans le navigateur.
  Les textes sont écrits en français dans le code : `t("Texte français")` renvoie la version arabe quand l'arabe est choisi,
  et le texte français sinon (ou si la traduction manque). `{nom}` dans un texte est remplacé par la valeur donnée.
*/

export type AppLang = "fr" | "ar";

const KEY = "axone.lang";
const listeners = new Set<() => void>();

function read(): AppLang {
  try {
    return localStorage.getItem(KEY) === "ar" ? "ar" : "fr";
  } catch {
    return "fr";
  }
}

export function setAppLang(l: AppLang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* stockage bloqué : le choix vaut pour cette page seulement */
  }
  listeners.forEach((f) => f());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useAppLang(): AppLang {
  return useSyncExternalStore(subscribe, read, () => "fr" as AppLang);
}

export type Vars = Record<string, string | number>;
export type TFn = (fr: string, vars?: Vars) => string;

/** Cherche une traduction : texte exact, puis « Nom 3 » (clé « Nom {n} »), puis « a · b » traduit morceau par morceau. */
function lookupAr(fr: string): string {
  if (AR[fr] !== undefined) return AR[fr];
  const num = /^(.*\S)\s+(\d+)$/.exec(fr);
  if (num && AR[`${num[1]} {n}`] !== undefined) return AR[`${num[1]} {n}`].split("{n}").join(num[2]);
  if (fr.includes(" · ")) return fr.split(" · ").map(lookupAr).join(" · ");
  return fr;
}

export function translate(lang: AppLang, fr: string, vars?: Vars): string {
  let s = lang === "ar" ? lookupAr(fr) : fr;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

export function useT(): TFn {
  const lang = useAppLang();
  return useCallback((fr, vars) => translate(lang, fr, vars), [lang]);
}

/** Langue courante, pour les fonctions hors composants (dates, libellés). Les composants se redessinent à chaque changement de langue. */
export const getAppLang = read;

/** Date écrite dans la langue choisie (chiffres latins). */
export function formatDate(d: Date, opts?: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString(read() === "ar" ? "ar-u-nu-latn" : "fr-FR", opts);
}

/** Langue des dates et des nombres : chiffres latins aussi en arabe (usage au Maghreb). */
export function useLocale(): string {
  return useAppLang() === "ar" ? "ar-u-nu-latn" : "fr-FR";
}
