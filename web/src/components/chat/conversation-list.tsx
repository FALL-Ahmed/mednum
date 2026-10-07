"use client";

import { useMemo, useState } from "react";
import type { Conversation } from "@/lib/chat-store";
import { addDays, todayISO, toISO } from "@/lib/dates";
import { IconPlus, IconTrash } from "../icons";
import { useT } from "@/lib/app-i18n";

function groupOf(iso: string): string {
  const d = toISO(new Date(iso));
  const today = todayISO();
  if (d === today) return "Aujourd'hui";
  if (d === addDays(today, -1)) return "Hier";
  if (d >= addDays(today, -7)) return "7 derniers jours";
  if (d >= addDays(today, -30)) return "30 derniers jours";
  return "Plus ancien";
}
const ORDER = ["Aujourd'hui", "Hier", "7 derniers jours", "30 derniers jours", "Plus ancien"];

function IconPencil() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    </svg>
  );
}

/** Liste des discussions : recherche, regroupement par date, renommer, supprimer. */
export function ConversationList({
  conversations,
  activeId,
  historyOk,
  onOpen,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: Conversation[] | null;
  activeId: string | null;
  historyOk: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (conversations ?? []).filter((c) => !q || c.title.toLowerCase().includes(q));
    const map = new Map<string, Conversation[]>();
    for (const c of list) {
      const g = groupOf(c.updated_at);
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return ORDER.filter((g) => map.has(g)).map((g) => ({ title: g, items: map.get(g)! }));
  }, [conversations, query]);

  function commit(id: string) {
    const t = draft.trim();
    if (t) onRename(id, t.slice(0, 80));
    setEditing(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-bold text-ink transition hover:border-ink"
        >
          <IconPlus className="h-4 w-4" />{t("Nouvelle discussion")}</button>
        {historyOk && (conversations?.length ?? 0) > 4 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Rechercher…")}
            aria-label={t("Rechercher dans tes discussions")}
            className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {!historyOk ? (
          <p className="px-3 py-2 text-sm text-muted">{t("L'historique n'est pas encore activé : tes discussions ne sont pas enregistrées.")}</p>
        ) : conversations === null ? (
          <p className="px-3 py-2 text-sm text-muted">{t("Chargement…")}</p>
        ) : groups.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">
            {query ? t("Aucune discussion trouvée.") : t("Tes discussions apparaîtront ici.")}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.title} className="mt-3 first:mt-0">
              <p className="px-3 pb-1 text-xs font-semibold text-muted">{t(g.title)}</p>
              <ul className="space-y-0.5">
                {g.items.map((c) => {
                  const active = c.id === activeId;
                  return (
                    <li key={c.id} className="group relative">
                      {editing === c.id ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => commit(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commit(c.id);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          aria-label={t("Nouveau titre")}
                          className="w-full rounded-lg border border-ink bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                        />
                      ) : (
                        <>
                          <button
                            onClick={() => onOpen(c.id)}
                            aria-current={active ? "true" : undefined}
                            className={`block w-full truncate rounded-lg px-3 py-2 pe-16 text-start text-sm transition ${
                              active ? "bg-white font-semibold text-ink shadow-sm ring-1 ring-line" : "text-ink/80 hover:bg-white"
                            }`}
                          >
                            {t(c.title)}
                          </button>
                          <span className="absolute end-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              onClick={() => {
                                setDraft(c.title);
                                setEditing(c.id);
                              }}
                              aria-label={t("Renommer « {a} »", { a: c.title })}
                              className="rounded-md p-1.5 text-muted hover:bg-slide hover:text-ink"
                            >
                              <IconPencil />
                            </button>
                            <button
                              onClick={() => onDelete(c.id)}
                              aria-label={t("Supprimer « {a} »", { a: c.title })}
                              className="rounded-md p-1.5 text-muted hover:bg-slide hover:text-[#a3271c]"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
