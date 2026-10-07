"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/app-i18n";

/**
 * Entoure un texte (la fiche d'un cours) : quand l'étudiant en sélectionne un morceau, un petit bouton
 * « Créer une carte » apparaît au-dessus. Le texte sélectionné devient le verso d'une nouvelle carte.
 */
export function SelectionToCard({ children, onPick }: { children: ReactNode; onPick: (text: string) => void }) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";
        const el = host.current;
        if (!sel || sel.isCollapsed || text.length < 3 || !el || !sel.anchorNode || !el.contains(sel.anchorNode)) {
          setPos(null);
          return;
        }
        const r = sel.getRangeAt(0).getBoundingClientRect();
        const h = el.getBoundingClientRect();
        // Au doigt, le menu du téléphone (Copier…) s'affiche au-dessus de la sélection : le bouton passe en dessous, sous les poignées
        const touch = window.matchMedia("(pointer: coarse)").matches;
        setPos({
          x: Math.min(Math.max(r.left + r.width / 2 - h.left, 90), Math.max(90, h.width - 90)),
          y: touch ? r.bottom - h.top + 40 : Math.max(r.top - h.top - 52, 0),
          text,
        });
      }, 220);
    };
    document.addEventListener("selectionchange", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", check);
    };
  }, []);

  return (
    <div ref={host} className="relative">
      {children}
      {pos && (
        <button
          // mouseDown / touchStart : on garde la sélection active jusqu'au clic
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onPick(pos.text);
            window.getSelection()?.removeAllRanges();
            setPos(null);
          }}
          style={{ left: pos.x, top: pos.y, transform: "translateX(-50%)" }}
          className="absolute z-20 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-eosin hover:text-ink"
        >
          <span aria-hidden>＋</span>
          {t("Créer une carte")}
        </button>
      )}
    </div>
  );
}
