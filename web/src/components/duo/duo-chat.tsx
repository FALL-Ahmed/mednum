"use client";

import { useEffect, useRef, useState } from "react";
import { DrAvatar } from "@/components/chat/chat-app";
import { Composer } from "@/components/chat/composer";
import { Markdown } from "@/components/chat/markdown";
import { askDuoAi, getDuoImages, sendDuo, type DuoMessage, type DuoState } from "@/lib/duo";
import type { PreparedImage } from "@/lib/images";
import { useT } from "@/lib/app-i18n";

/**
 * Discussion de la session à deux, dans le même style que la page Discussion.
 * Avec `ai` (salle) : on peut interroger Dr. Ahmed devant l'autre, ou simplement écrire à son partenaire.
 */
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
  // Dr. Ahmed répond à chaque message tant que l'option est active ; sinon les deux étudiants parlent entre eux.
  const [aiOn, setAiOn] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingImgs, setPendingImgs] = useState<string[]>([]);
  const [imgCache, setImgCache] = useState<Record<number, string[]>>({});
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const other = st.members.find((m) => m.user_id !== st.me) ?? null;
  const otherName = other?.name.trim() || t("Ton partenaire");
  const nameOf = (id: string | null) => st.members.find((m) => m.user_id === id)?.name.trim() || t("Étudiant");
  const messages = st.messages.filter((m) => m.tag !== "feedback");
  const writeToAi = ai && aiOn;
  // Le message que je viens d'envoyer s'affiche tout de suite ; il disparaît quand le serveur le renvoie.
  const showPending = pending !== null && !messages.some((m) => m.user_id === st.me && m.body === pending && (m.image_count ?? 0) === pendingImgs.length);

  // Les images des messages se chargent à part, une seule fois chacune.
  useEffect(() => {
    const need = messages.filter((m) => (m.image_count ?? 0) > 0 && !imgCache[m.id]).map((m) => m.id);
    if (need.length === 0) return;
    let cancelled = false;
    getDuoImages(st.code, need.slice(0, 20)).then((got) => {
      if (!cancelled && Object.keys(got).length > 0) setImgCache((c) => ({ ...c, ...got }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.code, messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, showPending, asking]);

  async function onSend(text: string, imgs: PreparedImage[]) {
    if ((!text && imgs.length === 0) || asking) return;
    setError(null);
    setPending(text);
    setPendingImgs(imgs.map((i) => i.previewUrl));
    stick.current = true;
    const images = imgs.map((i) => ({ mime: i.mediaType, data: i.base64 }));
    if (writeToAi) {
      setAsking(true);
      const r = await askDuoAi(st.code, "ask", text, images);
      setAsking(false);
      if (r.error) setError(r.error);
    } else if (images.length > 0) {
      const r = await askDuoAi(st.code, "say", text, images);
      if (r.error) setError(r.error);
    } else {
      const r = await sendDuo(st.code, text);
      if (r.error) setError(r.error);
    }
    await refresh();
    setPending(null);
    setPendingImgs([]);
  }

  async function copy(m: DuoMessage) {
    try {
      await navigator.clipboard.writeText(m.body);
      setCopied(m.id);
      window.setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1800);
    } catch {
      /* copie refusée */
    }
  }

  const empty = messages.length === 0 && !showPending;

  const picture = (urls: string[] | undefined, count: number, end: boolean) =>
    count > 0 ? (
      <div className={`flex flex-wrap gap-2 ${end ? "justify-end" : ""}`}>
        {Array.from({ length: count }, (_, i) => urls?.[i]).map((src, i) =>
          src ? (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-28 w-28 rounded-xl object-cover" />
            </a>
          ) : (
            <span key={i} className="h-28 w-28 animate-pulse rounded-xl bg-slide" />
          ),
        )}
      </div>
    ) : null;

  return (
    <section className={`mt-5 flex flex-col overflow-hidden rounded-2xl border border-line bg-white ${ai ? "h-[max(26rem,calc(100dvh-23rem))]" : "h-[30rem]"}`}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate font-semibold text-ink">{ai ? t("Discussion avec Dr. Ahmed") : t("Discussion")}</p>
        <p className="shrink-0 text-sm text-muted">
          {other ? `${nameOf(st.me)} · ${otherName}` : t("En attente de ton partenaire")}
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex-1 overflow-y-auto"
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            {ai ? <DrAvatar size={64} /> : null}
            <h2 className="display mt-4 text-2xl text-ink">{ai ? t("Posez vos questions à Dr. Ahmed") : t("Écris un petit mot")}</h2>
            <p className="mt-2 max-w-md text-muted">
              {ai
                ? t("Vous voyez tous les deux ses réponses. Pour parler seulement entre vous, mets Dr. Ahmed en pause.")
                : t("Ton partenaire le verra ici dès qu'il ouvre la session.")}
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-5 sm:px-6">
            {messages.map((m) => {
              if (m.is_ai) {
                return (
                  <div key={m.id} className="flex items-start gap-3">
                    <DrAvatar />
                    <div dir="auto" className="min-w-0 flex-1 pt-0.5 text-ink/90">
                      <Markdown>{m.body}</Markdown>
                      <div className="mt-2 flex items-center gap-1 text-muted">
                        <button
                          onClick={() => copy(m)}
                          aria-label={t("Copier la réponse")}
                          className="rounded-md px-2 py-1.5 text-xs font-semibold transition hover:bg-slide hover:text-ink"
                        >
                          {copied === m.id ? t("Copié") : t("Copier")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              const mine = m.user_id === st.me;
              return mine ? (
                <div key={m.id} className="flex flex-col items-end gap-2">
                  {picture(imgCache[m.id], m.image_count ?? 0, true)}
                  {m.body && (
                    <div dir="auto" className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-ee-md bg-hema px-4 py-3 text-white">
                      {m.body}
                    </div>
                  )}
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-eosin-soft text-sm font-bold text-ink">
                    {nameOf(m.user_id).charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 max-w-[88%]">
                    <p className="label text-muted">{nameOf(m.user_id)}</p>
                    <div className="mt-1 space-y-2">
                      {picture(imgCache[m.id], m.image_count ?? 0, false)}
                      {m.body && (
                        <div dir="auto" className="whitespace-pre-wrap rounded-2xl rounded-es-md bg-slide px-4 py-3 text-ink">
                          {m.body}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {showPending && (
              <div className="flex flex-col items-end gap-2 opacity-80">
                {pendingImgs.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {pendingImgs.map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt="" className="h-28 w-28 rounded-xl object-cover" />
                    ))}
                  </div>
                )}
                {pending && (
                  <div dir="auto" className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-ee-md bg-hema px-4 py-3 text-white">
                    {pending}
                  </div>
                )}
              </div>
            )}
            {asking && (
              <div className="flex items-start gap-3">
                <DrAvatar />
                <span className="flex h-8 items-center gap-1.5" aria-label={t("Dr. Ahmed écrit")}>
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-ink/35" style={{ animationDelay: `${d * 140}ms` }} />
                  ))}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 pb-3 pt-2 sm:px-4">
        {ai && (
          <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={aiOn}
              onClick={() => setAiOn((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                aiOn ? "border-eosin bg-eosin-soft text-ink" : "border-line bg-white text-muted hover:border-ink"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${aiOn ? "bg-eosin" : "bg-ink/25"}`} aria-hidden />
              {aiOn ? t("Dr. Ahmed répond") : t("Dr. Ahmed en pause")}
            </button>
            <p className="hidden text-xs text-muted sm:block">
              {aiOn ? t("Il répond à chaque message, devant vous deux.") : t("Vos messages ne s'envoient qu'à votre partenaire.")}
            </p>
          </div>
        )}
        <div className="mx-auto max-w-3xl">
          <Composer
            busy={asking}
            onSend={(text, imgs) => onSend(text, imgs)}
            onStop={() => {}}
            allowImages={ai}
            placeholder={writeToAi ? t("Pose ta question à Dr. Ahmed…") : other ? t("Écris à {a}…", { a: otherName }) : t("Écris un message…")}
            hint={writeToAi ? undefined : null}
          />
        </div>
        {expired && <p className="mt-1 text-center text-xs text-muted">{t("Cette session est terminée : tu peux relire la discussion, plus écrire.")}</p>}
      </div>
    </section>
  );
}
