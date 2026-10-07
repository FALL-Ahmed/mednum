"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { askAI, QuotaError, type ChatMsg } from "@/lib/ai";
import { chatSystem, pickChunks, splitSuggestions, type DocumentRow } from "@/lib/course";
import { setFlag } from "@/lib/flags";
import { useApp } from "./app-context";
import { LimitNotice } from "./limit-notice";

type Bubble = { role: "user" | "assistant"; text: string; source?: string; suggestions?: string[] };

function Avatar({ size = 40 }: { size?: number }) {
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-full bg-hema-soft"
      style={{ width: size, height: size }}
    >
      <Image
        src="/dr-ahmed-face.webp"
        alt="Dr. Ahmed"
        fill
        sizes={`${size * 3}px`}
        className="object-cover"
      />
    </span>
  );
}

/**
 * Discussion avec Dr. Ahmed. Avec un document, les réponses s'appuient sur ses passages les plus proches ;
 * sans document, c'est une question libre.
 */
export function ChatPanel({ doc, starters }: { doc: DocumentRow | null; starters?: string[] }) {
  const { profile, refreshQuota } = useApp();
  const [msgs, setMsgs] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    setBusy(true);

    const picked = doc ? pickChunks(doc.chunks ?? [], q, 3) : [];
    const context = picked.length
      ? "EXTRAITS DU COURS :\n" +
        picked.map((c) => `[${c.title}]\n${c.content.slice(0, 1500)}`).join("\n\n") +
        `\n\nQUESTION : ${q}`
      : doc
        ? `Aucun extrait pertinent trouvé.\n\nQUESTION : ${q}`
        : q;

    const history: ChatMsg[] = msgs.slice(-6).map((m) => ({ role: m.role, content: m.text }));
    const source = picked.length
      ? "Source : " +
        picked
          .slice(0, 2)
          .map((c) => (c.startPage ? `${c.title}, p. ${c.startPage}` : c.title))
          .join(" · ")
      : undefined;

    setMsgs((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);

    try {
      const full = await askAI({
        system: chatSystem(doc?.name ?? null, profile.name, picked.length > 0),
        messages: [...history, { role: "user", content: context }],
        maxTokens: 1200,
        onText: (soFar) =>
          setMsgs((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", text: splitSuggestions(soFar).body };
            return copy;
          }),
      });
      const { body, suggestions } = splitSuggestions(full);
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", text: body, source, suggestions };
        return copy;
      });
      setFlag("asked");
      refreshQuota();
    } catch (e) {
      setMsgs((m) => m.slice(0, -2));
      if (e instanceof QuotaError) setLimit(true);
      else setError(e instanceof Error ? e.message : "Une erreur est survenue.");
      setInput(q);
      refreshQuota();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[26rem] flex-col rounded-2xl border border-line bg-white">
      <div className="flex-1 space-y-4 p-5 sm:p-8">
        {msgs.length === 0 && (
          <div>
            <div className="flex items-start gap-4">
              <Avatar size={56} />
              <div>
                <p className="display text-2xl text-ink">
                  {doc ? "Pose ta question sur ce cours." : `Bonjour ${profile.name}, qu'est-ce qu'on révise ?`}
                </p>
                <p className="mt-1 text-muted">
                  {doc
                    ? "Dr. Ahmed part de ton document, puis va plus loin si besoin."
                    : "Pose une question libre, ou choisis un de tes cours pour une réponse tirée de ton document."}
                </p>
              </div>
            </div>
            {starters && starters.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink/80 transition hover:border-ink disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i}>
            {m.role === "user" ? (
              <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-hema px-4 py-3 text-white">
                {m.text}
              </div>
            ) : (
              <div className="flex max-w-[94%] items-start gap-3">
                <Avatar size={36} />
                <div className="min-w-0">
                  <div className="whitespace-pre-line rounded-2xl rounded-tl-md bg-slide px-4 py-3 text-ink/90">
                    {m.text || <span className="text-muted">Dr. Ahmed réfléchit…</span>}
                  </div>
                  {m.source && <p className="label mt-2 text-muted">{m.source}</p>}
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          disabled={busy}
                          className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink/80 transition hover:border-ink disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-4 sm:p-5">
        {limit && (
          <div className="mb-3">
            <LimitNotice kind="chat" onClose={() => setLimit(false)} />
          </div>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
            {error}
          </p>
        )}
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pose ta question…"
            aria-label="Ta question"
            className="min-w-0 flex-1 rounded-full border border-line bg-slide px-5 py-3.5 text-base text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-full bg-ink px-6 py-3.5 font-semibold text-white transition hover:bg-eosin disabled:opacity-40"
          >
            Envoyer
          </button>
        </form>
      </div>
    </div>
  );
}
