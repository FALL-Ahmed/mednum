"use client";

import { useRef, useState } from "react";
import { prepareImage, type PreparedImage } from "@/lib/images";
import { transcribe, useRecorder, VoiceError, type VoiceLang } from "@/lib/voice";
import { IconClose } from "../icons";
import { useT } from "@/lib/app-i18n";

const MAX_IMAGES = 3;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const VOICE_ERRORS: Record<VoiceError["code"], string> = {
  denied: "Le micro est bloqué. Autorise-le dans ton navigateur pour dicter ta question.",
  unsupported: "Ton navigateur ne permet pas l'enregistrement vocal.",
  not_configured: "La dictée vocale n'est pas encore activée.",
  quota: "Tu as atteint la limite de dictées du jour.",
  failed: "La transcription a échoué. Réessaie ou écris ta question.",
};

function IconPaperclip() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
    </svg>
  );
}
function IconMic() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
    </svg>
  );
}

/** Zone de saisie : texte multi-lignes, images (bouton, collage, glisser-déposer), dictée vocale, envoi / arrêt. */
export function Composer({
  busy,
  onSend,
  onStop,
}: {
  busy: boolean;
  onSend: (text: string, images: PreparedImage[]) => void;
  onStop: () => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [lang, setLang] = useState<VoiceLang>("auto");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rec = useRecorder();

  const canSend = !busy && !rec.recording && !transcribing && (text.trim().length > 0 || images.length > 0);

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function addFiles(files: FileList | File[]) {
    setNote(null);
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      setNote(t("Seules les images sont acceptées pour l'instant."));
      return;
    }
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setNote(t("Tu peux joindre {a} images au maximum.", { a: MAX_IMAGES }));
      return;
    }
    try {
      const prepared = await Promise.all(list.slice(0, room).map(prepareImage));
      setImages((cur) => [...cur, ...prepared]);
      if (list.length > room) setNote(t("Tu peux joindre {a} images au maximum.", { a: MAX_IMAGES }));
    } catch {
      setNote(t("Cette image n'a pas pu être lue. Essaie un fichier JPG ou PNG."));
    }
  }

  function removeImage(i: number) {
    setImages((cur) => {
      URL.revokeObjectURL(cur[i].previewUrl);
      return cur.filter((_, k) => k !== i);
    });
  }

  function submit() {
    if (!canSend) return;
    const t = text.trim();
    const imgs = images;
    setText("");
    setImages([]);
    setNote(null);
    if (taRef.current) taRef.current.style.height = "auto";
    onSend(t, imgs);
  }

  async function toggleMic() {
    setNote(null);
    if (rec.recording) {
      const r = await rec.stop();
      if (!r || r.seconds < 0.6) {
        setNote(t("L'enregistrement est trop court. Appuie sur le micro, parle, puis rappuie pour terminer."));
        return;
      }
      if (r.peak < 0.012) {
        setNote(t("Je n'entends presque rien : le micro est peut-être coupé, mal choisi ou trop loin de toi."));
        return;
      }
      setTranscribing(true);
      try {
        const out = await transcribe(r.blob, lang);
        if (out) {
          setText((cur) => (cur ? `${cur} ${out}` : out));
          window.setTimeout(() => taRef.current && autosize(taRef.current), 0);
          taRef.current?.focus();
          if (r.snrDb < 8) setNote(t("Il y avait beaucoup de bruit autour de toi : relis le texte et corrige-le avant d'envoyer."));
        } else {
          setNote(t("Je n'ai pas compris ce qui a été dit. Rapproche-toi du micro, dans un endroit calme, et réessaie."));
        }
      } catch (e) {
        setNote(t(VOICE_ERRORS[e instanceof VoiceError ? e.code : "failed"]));
      } finally {
        setTranscribing(false);
      }
      return;
    }
    try {
      await rec.start();
    } catch (e) {
      setNote(VOICE_ERRORS[e instanceof VoiceError ? e.code : "failed"]);
    }
  }

  return (
    <div
      className="mx-auto w-full max-w-3xl"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {note && (
        <p role="status" className="mb-2 rounded-xl bg-[#fff6e6] px-4 py-2 text-sm text-ink">
          {note}
        </p>
      )}

      <div className="rounded-3xl border border-line bg-white p-2 shadow-[0_2px_12px_-6px_rgba(11,30,52,0.25)] focus-within:border-ink">
        {images.length > 0 && (
          <ul className="flex flex-wrap gap-2 p-2">
            {images.map((im, i) => (
              <li key={im.previewUrl} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.previewUrl} alt={t("Image jointe {a}", { a: i + 1 })} className="h-16 w-16 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label={t("Retirer l'image {a}", { a: i + 1 })}
                  className="absolute -end-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white"
                >
                  <IconClose className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {rec.recording ? (
          <div className="flex items-center gap-3 px-4 py-3.5" role="status">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e0796f] opacity-70" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[#e0796f]" />
            </span>
            <span className="font-semibold text-ink">{t("Je t'écoute… {a}", { a: clock(rec.seconds) })}</span>
            <span
              className="relative ms-1 h-2 w-24 overflow-hidden rounded-full bg-slide sm:w-36"
              role="meter"
              aria-label={t("Niveau du micro")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(rec.level * 100)}
            >
              <span
                className={`absolute inset-y-0 start-0 rounded-full transition-[width] duration-100 ${
                  rec.level < 0.08 ? "bg-[#ffb74d]" : "bg-eosin"
                }`}
                style={{ width: `${Math.max(3, rec.level * 100)}%` }}
              />
            </span>
            <span className="hidden text-sm text-muted sm:inline">
              {rec.level < 0.08 ? t("Parle plus fort ou rapproche-toi") : t("Appuie sur le micro pour terminer")}
            </span>
          </div>
        ) : transcribing ? (
          <p className="px-4 py-3.5 text-muted" role="status">{t("Transcription en cours…")}</p>
        ) : (
          <textarea
            ref={taRef}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              autosize(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (files.length) {
                e.preventDefault();
                addFiles(files);
              }
            }}
            placeholder={t("Écris ta question, dépose une image ou parle…")}
            aria-label={t("Ta question")}
            className="block max-h-[200px] w-full resize-none bg-transparent px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none"
          />
        )}

        <div className="flex items-center gap-1 px-1 pb-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            aria-label={t("Joindre une image")}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={rec.recording || transcribing}
            aria-label={t("Joindre une image")}
            title={t("Joindre une image")}
            className="grid h-10 w-10 place-items-center rounded-full text-ink/70 transition hover:bg-slide hover:text-ink disabled:opacity-40"
          >
            <IconPaperclip />
          </button>

          <button
            type="button"
            onClick={toggleMic}
            disabled={transcribing}
            aria-label={rec.recording ? t("Terminer l'enregistrement") : t("Dicter avec le micro")}
            title={rec.recording ? t("Terminer l'enregistrement") : t("Dicter avec le micro")}
            className={`grid h-10 w-10 place-items-center rounded-full transition disabled:opacity-40 ${
              rec.recording ? "bg-[#e0796f] text-white" : "text-ink/70 hover:bg-slide hover:text-ink"
            }`}
          >
            <IconMic />
          </button>
          {!rec.recording && (
            <button
              type="button"
              onClick={() => setLang((l) => (l === "auto" ? "fr" : l === "fr" ? "ar" : "auto"))}
              aria-label={t("Langue de la dictée : {a}. Changer.", { a: t(lang === "auto" ? "automatique, français ou arabe" : lang === "fr" ? "français" : "arabe") })}
              title={t("Langue de la dictée (automatique, français ou arabe)")}
              className="rounded-md px-1.5 py-1 text-xs font-bold uppercase text-muted transition hover:bg-slide hover:text-ink"
            >
              {lang}
            </button>
          )}

          <div className="ms-auto pe-1">
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                aria-label={t("Arrêter la réponse")}
                title={t("Arrêter la réponse")}
                className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white transition hover:bg-eosin hover:text-ink"
              >
                <span className="block h-3.5 w-3.5 rounded-sm bg-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                aria-label={t("Envoyer")}
                title={t("Envoyer")}
                className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white transition hover:bg-eosin hover:text-ink disabled:bg-line disabled:text-muted"
              >
                <IconSend />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted">{t("Dr. Ahmed t'aide à réviser et peut se tromper : vérifie les points importants avec ton cours.")}</p>
    </div>
  );
}
