"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/chat/markdown";
import { askDuoAi, sendDuo, type DuoState } from "@/lib/duo";
import { btnDark, btnLine } from "./duo-shell";
import { useT } from "@/lib/app-i18n";

/** Discussion entre les deux étudiants ; avec `ai`, on peut aussi poser une question à Dr. Ahmed devant l'autre. */
export function DuoChat({
  st,
  refresh,
  setError,
  expired,
  ai = false,
}: {
  st: DuoState;
  refresh: () => Promise<void>;
  setError: (e: string | null) => void;
  expired: boolean;
  ai?: boolean;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const other = st.members.find((m) => m.user_id !== st.me) ?? null;
  const otherName = other?.name.trim() || "Ton partenaire";
  const nameOf = (id: string | null) => st.members.find((m) => m.user_id === id)?.name.trim() || "Étudiant";
  const messages = st.messages.filter((m) => m.tag !== "feedback");

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, asking]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || asking) return;
    setText("");
    const r = await sendDuo(st.code, body);
    if (r.error) setError(r.error);
    await refresh();
  }

  async function ask() {
    const body = text.trim();
    if (!body || asking) return;
    setText("");
    setError(null);
    setAsking(true);
    const r = await askDuoAi(st.code, "ask", body);
    setAsking(false);
    if (r.error) setError(r.error);
    await refresh();
  }

  return (
    <section className="mt-5 rounded-2xl border border-line bg-white p-5">
      <p className="font-semibold text-ink">{ai ? t("Discussion avec Dr. Ahmed") : t("Discussion")}</p>
      {messages.length === 0 && !asking ? (
        <p className="mt-2 text-sm text-muted">
          {ai
            ? t("Posez vos questions à Dr. Ahmed : vous voyez tous les deux ses réponses. Vous pouvez aussi vous écrire entre vous.")
            : t("Écris un petit mot à ton partenaire : il apparaîtra ici.")}
        </p>
      ) : (
        <ul ref={listRef} className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto">
          {messages.map((m) => {
            if (m.is_ai) {
              return (
                <li key={m.id} className="flex justify-start">
                  <div dir="auto" className="max-w-[92%] rounded-2xl rounded-ss-md bg-eosin-soft px-4 py-3 text-ink">
                    <p className="label text-muted">{t("Dr. Ahmed")}</p>
                    <div className="mt-1 text-[15px]">
                      <Markdown>{m.body}</Markdown>
                    </div>
                  </div>
                </li>
              );
            }
            const mine = m.user_id === st.me;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div dir="auto" className={`max-w-[85%] rounded-2xl px-4 py-2 text-[15px] ${mine ? "bg-ink text-white" : "bg-slide text-ink"}`}>
                  {!mine && <p className="label text-muted">{nameOf(m.user_id)}</p>}
                  {m.body}
                </div>
              </li>
            );
          })}
          {asking && (
            <li className="flex justify-start">
              <div className="rounded-2xl bg-eosin-soft px-4 py-3 text-sm text-muted">{t("Dr. Ahmed réfléchit…")}</div>
            </li>
          )}
        </ul>
      )}
      <form onSubmit={send} className="mt-3">
        <label htmlFor="duo-msg" className="sr-only">{t("Ton message")}</label>
        <textarea
          id="duo-msg"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={ai ? 800 : 300}
          rows={2}
          disabled={expired}
          placeholder={ai ? t("Ta question ou ton message") : t("Ton message")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (ai) ask();
              else send();
            }
          }}
          className="w-full resize-none rounded-2xl border border-line bg-slide px-4 py-2.5 text-ink focus:border-ink focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {ai && (
            <button type="button" onClick={ask} disabled={!text.trim() || expired || asking} className={btnDark}>
              {asking ? t("Dr. Ahmed réfléchit…") : t("Demander à Dr. Ahmed")}
            </button>
          )}
          <button type="submit" disabled={!text.trim() || expired || asking} className={ai ? btnLine : btnDark}>
            {ai ? t("Envoyer à {a}", { a: otherName }) : t("Envoyer")}
          </button>
        </div>
      </form>
    </section>
  );
}
