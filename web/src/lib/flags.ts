"use client";

import { useSyncExternalStore } from "react";

/** Petits repères enregistrés dans le navigateur (par ex. « a déjà posé une question ») pour la liste de premiers pas. */
export function setFlag(key: string) {
  try {
    window.localStorage.setItem(`axone:${key}`, "1");
    window.dispatchEvent(new Event("axone-flags"));
  } catch {
    /* stockage indisponible : sans importance */
  }
}

export function useFlag(key: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("axone-flags", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("axone-flags", cb);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(`axone:${key}`) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
}
