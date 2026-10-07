"use client";

import { useState } from "react";
import { useApp } from "@/components/app-context";
import { getSupabase } from "@/lib/supabase";
import { track } from "@/lib/track";
import { useT } from "@/lib/app-i18n";

/** Une lettre privée à l'équipe : l'étudiant écrit, l'équipe la lit dans l'admin avec son nom et son e-mail. */
export default function EcrireEquipe() {
  const t = useT();
  const { user, profile } = useApp();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = message.trim().length >= 5 && !busy;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !canSend) return;
    setBusy(true);
    setError(null);
    setSent(false);
    const { error: err } = await sb.from("suggestions").insert({
      user_id: user.id,
      email: user.email ?? null,
      kind: "other",
      message: message.trim(),
    });
    if (err) {
      setError(
        /row-level security|violates/i.test(err.message)
          ? t("Tu as envoyé beaucoup de messages aujourd'hui. Réessaie demain.")
          : t("L'envoi n'a pas pu aboutir. Réessaie dans un instant."),
      );
    } else {
      track("message_sent");
      setMessage("");
      setSent(true);
    }
    setBusy(false);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="display text-3xl text-ink">{t("Écris-nous")}</h1>
      <p className="mt-3 text-muted">
        {t("Un message privé, lu par l'équipe. Dis-nous ce que tu veux qu'on ajoute, qu'on change ou qu'on corrige.")}
      </p>

      <form onSubmit={send} className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
        <p className="text-sm text-muted">
          {t("De la part de {a}", { a: [profile.name, user.email].filter(Boolean).join(" · ") })}
        </p>
        <label htmlFor="msg" className="sr-only">{t("Ton message")}</label>
        <textarea
          id="msg"
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
          rows={9}
          dir="auto"
          placeholder={t("Écris ici…")}
          className="mt-4 w-full rounded-2xl border border-line bg-slide px-5 py-4 text-[16px] leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none"
        />

        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-[#a3271c]">
            {error}
          </p>
        )}
        {sent && (
          <p role="status" className="mt-4 rounded-2xl bg-eosin-soft px-4 py-3 text-ink">
            {t("Merci ! Ton message est bien arrivé. On te répond par e-mail si besoin.")}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSend}
          className="mt-5 rounded-full bg-ink px-8 py-4 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40"
        >
          {busy ? t("Envoi…") : t("Envoyer")}
        </button>
      </form>
    </div>
  );
}
