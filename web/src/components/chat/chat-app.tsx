"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { askAI, QuotaError, type ChatMsg, type ContentBlock } from "@/lib/ai";
import {
  addMessage,
  createConversation,
  deleteConversation,
  deleteMessage,
  listConversations,
  loadMessages,
  renameConversation,
  setConversationCourse,
  signedUrls,
  touchConversation,
  uploadAttachment,
  type Attachment,
  type Conversation,
} from "@/lib/chat-store";
import { chatSystem, pickChunks, splitSuggestions, type DocumentRow } from "@/lib/course";
import type { PreparedImage } from "@/lib/images";
import { getSupabase } from "@/lib/supabase";
import { setFlag } from "@/lib/flags";
import { useApp } from "../app-context";
import { ConfirmDialog } from "../confirm-dialog";
import { LimitNotice } from "../limit-notice";
import { IconClose, IconMenu } from "../icons";
import { Composer } from "./composer";
import { ConversationList } from "./conversation-list";
import { listDuo, type DuoListItem } from "@/lib/duo";
import { Markdown } from "./markdown";
import { useT } from "@/lib/app-i18n";

type UiMsg = {
  id: string;
  dbId?: string;
  role: "user" | "assistant";
  text: string;
  images: string[];
  source?: string | null;
  pending?: boolean;
};

const ERR_GENERIC = "Dr. Ahmed est indisponible pour le moment. Réessaie dans un instant.";

function makeTitle(text: string, nImages: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t) return t.length > 48 ? `${t.slice(0, 47)}…` : t;
  return nImages > 1 ? "Images" : "Image";
}

export function DrAvatar({ size = 32 }: { size?: number }) {
  const t = useT();
  return (
    <span className="relative shrink-0 overflow-hidden rounded-full bg-hema-soft" style={{ width: size, height: size }}>
      <Image
        src="/dr-ahmed-face.webp"
        alt={t("Dr. Ahmed")}
        fill
        sizes={`${size * 3}px`}
        className="object-cover"
      />
    </span>
  );
}

function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
    </svg>
  );
}

/** Discussion avec Dr. Ahmed : historique enregistré, images, dictée vocale, réponses en continu. */
export function ChatApp() {
  const t = useT();
  const { user, profile, docs, refreshQuota } = useApp();
  const params = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [rooms, setRooms] = useState<DuoListItem[]>([]);
  const [historyOk, setHistoryOk] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(false);
  const [docId, setDocId] = useState("");
  const [docCtx, setDocCtx] = useState<DocumentRow | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastCall = useRef<{ text: string; imgs: PreparedImage[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const initialId = useRef(params.get("c"));

  // Liste des discussions
  useEffect(() => {
    let cancelled = false;
    listConversations().then((list) => {
      if (cancelled) return;
      setHistoryOk(list !== null);
      setConversations(list ?? []);
    });
    // Les salles à deux avec Dr. Ahmed font partie de l'historique des discussions.
    listDuo().then((r) => {
      if (!cancelled) setRooms((r.data ?? []).filter((x) => x.kind === "room"));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ouverture directe d'une discussion depuis l'adresse (?c=…)
  useEffect(() => {
    const c = initialId.current;
    if (!c) return;
    Promise.resolve().then(() => openConversation(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Défilement automatique vers le bas, sauf si l'étudiant est remonté dans la discussion
  useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  const setUrl = (id: string | null) => {
    window.history.replaceState(null, "", id ? `/app/chat?c=${id}` : "/app/chat");
  };

  async function loadDoc(id: string) {
    const sb = getSupabase();
    if (!sb || !id) {
      setDocCtx(null);
      return;
    }
    const { data } = await sb
      .from("documents")
      .select("id,name,subject_name,pages,content,chunks,fiche,updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    setDocCtx((data as DocumentRow | null) ?? null);
  }

  async function openConversation(id: string) {
    if (busy) abortRef.current?.abort();
    setListOpen(false);
    setActiveId(id);
    setError(null);
    setMsgs([]);
    setLoadingConv(true);
    stick.current = true;
    setUrl(id);

    const stored = await loadMessages(id);
    const paths = stored.flatMap((m) => m.attachments.map((a) => a.path));
    const urls = await signedUrls(paths);
    setMsgs(
      stored.map((m) => ({
        id: m.id,
        dbId: m.id,
        role: m.role,
        text: m.content,
        source: m.source,
        images: m.attachments.map((a) => urls[a.path]).filter(Boolean),
      })),
    );
    setLoadingConv(false);

    const conv = (conversations ?? []).find((c) => c.id === id);
    const cid = conv?.course_id ?? "";
    setDocId(cid);
    await loadDoc(cid);
  }

  function newChat() {
    if (busy) abortRef.current?.abort();
    setListOpen(false);
    setActiveId(null);
    setMsgs([]);
    setError(null);
    stick.current = true;
    setUrl(null);
  }

  async function changeCourse(id: string) {
    setDocId(id);
    if (activeId) await setConversationCourse(activeId, id || null);
    await loadDoc(id);
  }

  async function answer(convId: string | null, history: UiMsg[], text: string, imgs: PreparedImage[]) {
    const ctl = new AbortController();
    abortRef.current = ctl;
    const asstId = crypto.randomUUID();
    setMsgs([...history, { id: asstId, role: "assistant", text: "", images: [], pending: true }]);
    stick.current = true;

    const question = text || "Que vois-tu sur cette image ? Explique-la.";
    const picked = docCtx ? pickChunks(docCtx.chunks ?? [], question, 3) : [];
    const ctxText = picked.length
      ? "EXTRAITS DU COURS :\n" +
        picked.map((c) => `[${c.title}]\n${c.content.slice(0, 1500)}`).join("\n\n") +
        `\n\nQUESTION : ${question}`
      : docCtx
        ? `Aucun extrait pertinent trouvé.\n\nQUESTION : ${question}`
        : question;
    const source = picked.length
      ? "Source : " +
        picked
          .slice(0, 2)
          .map((c) => (c.startPage ? `${c.title}, p. ${c.startPage}` : c.title))
          .join(" · ")
      : null;

    const prior: ChatMsg[] = history
      .slice(0, -1)
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.text + (m.images.length ? `${m.text ? " " : ""}[image jointe]` : ""),
      }));
    const current: ChatMsg = {
      role: "user",
      content: imgs.length
        ? ([
            ...imgs.map(
              (i): ContentBlock => ({
                type: "image",
                source: { type: "base64", media_type: i.mediaType, data: i.base64 },
              }),
            ),
            { type: "text", text: ctxText },
          ] as ContentBlock[])
        : ctxText,
    };

    try {
      const full = await askAI({
        system: chatSystem(docCtx?.name ?? null, profile.name, picked.length > 0, {
          suggestions: false,
          images: imgs.length > 0,
        }),
        messages: [...prior, current],
        maxTokens: 1500,
        signal: ctl.signal,
        onText: (soFar) =>
          setMsgs((cur) =>
            cur.map((m) => (m.id === asstId ? { ...m, text: splitSuggestions(soFar).body } : m)),
          ),
      });
      const final = splitSuggestions(full).body.trim();
      if (!final) {
        setMsgs((cur) => cur.filter((m) => m.id !== asstId));
      } else {
        let dbId: string | undefined;
        if (convId) {
          dbId = (await addMessage(user.id, convId, { role: "assistant", content: final, source })) ?? undefined;
          await touchConversation(convId);
          setConversations((cur) =>
            cur
              ? [
                  ...cur.filter((c) => c.id === convId).map((c) => ({ ...c, updated_at: new Date().toISOString() })),
                  ...cur.filter((c) => c.id !== convId),
                ]
              : cur,
          );
        }
        setMsgs((cur) => cur.map((m) => (m.id === asstId ? { ...m, text: final, source, pending: false, dbId } : m)));
        setFlag("asked");
      }
    } catch (e) {
      setMsgs((cur) => cur.filter((m) => m.id !== asstId));
      if (e instanceof QuotaError) setLimit(true);
      else setError(e instanceof Error ? e.message : t(ERR_GENERIC));
    } finally {
      abortRef.current = null;
      setBusy(false);
      refreshQuota();
    }
  }

  async function send(text: string, imgs: PreparedImage[]) {
    if (busy) return;
    setError(null);
    setBusy(true);
    const base = msgs;

    let convId = activeId;
    if (!convId && historyOk) {
      const conv = await createConversation(user.id, makeTitle(text, imgs.length), docId || null);
      if (conv) {
        convId = conv.id;
        setActiveId(conv.id);
        setConversations((cur) => [conv, ...(cur ?? [])]);
        setUrl(conv.id);
      } else {
        setHistoryOk(false);
      }
    }

    let attachments: Attachment[] = [];
    if (convId && imgs.length) {
      const id = convId;
      const up = await Promise.all(imgs.map((i) => uploadAttachment(user.id, id, i.blob, i.name)));
      attachments = up.filter((a): a is Attachment => a !== null);
    }
    let dbId: string | undefined;
    if (convId) dbId = (await addMessage(user.id, convId, { role: "user", content: text, attachments })) ?? undefined;

    const userMsg: UiMsg = {
      id: crypto.randomUUID(),
      dbId,
      role: "user",
      text,
      images: imgs.map((i) => i.previewUrl),
    };
    lastCall.current = { text, imgs };
    await answer(convId, [...base, userMsg], text, imgs);
  }

  async function regenerate() {
    if (busy || msgs.length < 2) return;
    const last = msgs[msgs.length - 1];
    const prev = msgs[msgs.length - 2];
    if (last.role !== "assistant" || prev.role !== "user") return;
    const call = lastCall.current && lastCall.current.text === prev.text ? lastCall.current : null;
    if (prev.images.length > 0 && !call) return; // image d'une ancienne session : on ne peut pas la renvoyer
    setError(null);
    setBusy(true);
    if (last.dbId) await deleteMessage(last.dbId);
    await answer(activeId, msgs.slice(0, -1), prev.text, call?.imgs ?? []);
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function copy(m: UiMsg) {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopied(m.id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* copie impossible */
    }
  }

  async function rename(id: string, title: string) {
    setConversations((cur) => cur?.map((c) => (c.id === id ? { ...c, title } : c)) ?? cur);
    await renameConversation(id, title);
  }

  async function remove(id: string) {
    setToDelete(null);
    setConversations((cur) => cur?.filter((x) => x.id !== id) ?? cur);
    if (id === activeId) newChat();
    await deleteConversation(id);
  }

  const title = conversations?.find((c) => c.id === activeId)?.title ?? "Nouvelle discussion";
  const lastMsg = msgs[msgs.length - 1];
  const canRegenerate =
    !busy &&
    lastMsg?.role === "assistant" &&
    !lastMsg.pending &&
    (msgs[msgs.length - 2]?.images.length ?? 0) === 0;

  const list = (
    <ConversationList
      conversations={conversations}
      rooms={rooms}
      activeId={activeId}
      historyOk={historyOk}
      onOpen={openConversation}
      onNew={newChat}
      onRename={rename}
      onDelete={(id) => setToDelete(id)}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] bg-white">
      {toDelete && (
        <ConfirmDialog
          title={t("Supprimer cette discussion ?")}
          text={t("« {a} » sera supprimée définitivement, avec tous ses messages.", { a: conversations?.find((x) => x.id === toDelete)?.title ?? t("Cette discussion") })}
          confirmLabel={t("Supprimer la discussion")}
          danger
          onConfirm={() => remove(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
      <aside className="hidden w-64 shrink-0 border-e border-line bg-slide lg:block" aria-label={t("Tes discussions")}>
        {list}
      </aside>

      {listOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label={t("Fermer la liste")} className="absolute inset-0 bg-black/40" onClick={() => setListOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-slide shadow-2xl" aria-label={t("Tes discussions")}>
            <button
              aria-label={t("Fermer la liste")}
              onClick={() => setListOpen(false)}
              className="absolute end-2 top-3 rounded-lg p-2 text-ink/70 hover:bg-white"
            >
              <IconClose />
            </button>
            {list}
          </aside>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        {/* En-tête de la discussion */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 sm:px-6">
          <button
            onClick={() => setListOpen(true)}
            aria-label={t("Ouvrir la liste des discussions")}
            className="-ms-1 rounded-lg p-2 text-ink hover:bg-slide lg:hidden"
          >
            <IconMenu />
          </button>
          <p className="min-w-0 flex-1 truncate font-semibold text-ink">{title}</p>
          <label className="sr-only" htmlFor="chat-course">{t("Cours utilisé pour répondre")}</label>
          <select
            id="chat-course"
            value={docId}
            onChange={(e) => changeCourse(e.target.value)}
            className="max-w-[12rem] rounded-full border border-line bg-white px-3.5 py-1.5 text-sm text-ink focus:border-ink focus:outline-none sm:max-w-[16rem]"
          >
            <option value="">{t("Sans cours")}</option>
            {(docs ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <p className="border-b border-line bg-slide/60 px-4 py-1.5 text-xs text-muted sm:px-6">
          {docId
            ? t("Cours choisi : Dr. Ahmed répond d'après ce cours, puis va plus loin si besoin.")
            : t("Sans cours : Dr. Ahmed répond avec ses connaissances médicales générales. Choisis un cours pour qu'il parte de ton document.")}
        </p>

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          className="flex-1 overflow-y-auto"
        >
          {loadingConv ? (
            <p className="px-6 py-10 text-center text-muted">{t("Chargement de la discussion…")}</p>
          ) : msgs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <DrAvatar size={72} />
              <h2 className="display mt-5 text-3xl text-ink">{t("Bonjour {a}, que veux-tu réviser ?", { a: profile.name })}</h2>
              <p className="mt-2 max-w-md text-muted">{t("Écris ta question, dépose une image (page de cours, schéma, ECG) ou dicte-la avec le micro.")}{docCtx ? " " + t("Dr. Ahmed part de « {a} » puis va plus loin si besoin.", { a: docCtx.name }) : ""}
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-6 sm:px-6">
              {msgs.map((m, idx) => (
                <div key={m.id}>
                  {m.role === "user" ? (
                    <div className="flex flex-col items-end gap-2">
                      {m.images.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {m.images.map((src, i) => (
                            <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt={t("Image jointe {a}", { a: i + 1 })} className="h-28 w-28 rounded-xl object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                      {m.text && (
                        <div dir="auto" className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-ee-md bg-hema px-4 py-3 text-white">
                          {m.text}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <DrAvatar />
                      <div dir="auto" className="min-w-0 flex-1 pt-0.5 text-ink/90">
                        {m.text ? (
                          <Markdown>{m.text}</Markdown>
                        ) : (
                          <span className="flex h-6 items-center gap-1.5" aria-label={t("Dr. Ahmed écrit")}>
                            {[0, 1, 2].map((d) => (
                              <span
                                key={d}
                                className="h-2 w-2 animate-bounce rounded-full bg-ink/35"
                                style={{ animationDelay: `${d * 140}ms` }}
                              />
                            ))}
                          </span>
                        )}
                        {m.source && <p className="label mt-3 text-muted">{m.source}</p>}
                        {!m.pending && m.text && (
                          <div className="mt-2 flex items-center gap-1 text-muted">
                            <button
                              onClick={() => copy(m)}
                              aria-label={t("Copier la réponse")}
                              title={t("Copier")}
                              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition hover:bg-slide hover:text-ink"
                            >
                              <IconCopy />
                              {copied === m.id ? t("Copié") : t("Copier")}
                            </button>
                            {idx === msgs.length - 1 && canRegenerate && (
                              <button
                                onClick={regenerate}
                                aria-label={t("Regénérer la réponse")}
                                title={t("Regénérer")}
                                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition hover:bg-slide hover:text-ink"
                              >
                                <IconRefresh />{t("Regénérer")}</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Saisie */}
        <div className="px-4 pb-4 pt-2 sm:px-6">
          {limit && (
            <div className="mx-auto mb-3 max-w-3xl">
              <LimitNotice kind="chat" onClose={() => setLimit(false)} />
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-3 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]"
            >
              <span>{t(error)}</span>
              <button onClick={() => setError(null)} aria-label={t("Fermer le message")} className="shrink-0 font-bold">
                <IconClose className="h-4 w-4" />
              </button>
            </div>
          )}
          <Composer busy={busy} onSend={send} onStop={stop} />
        </div>
      </section>
    </div>
  );
}
