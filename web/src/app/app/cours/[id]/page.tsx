"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/components/app-context";
import { ChatPanel } from "@/components/chat-panel";
import { roomPayload, StartDuoButton } from "@/components/duo/start-duo-button";
import { Cas, Fiche, Flashcards, type Patch } from "@/components/doc-tabs";
import { QcmTab } from "@/components/qcm-tab";
import type { DocumentRow } from "@/lib/course";
import { getSupabase } from "@/lib/supabase";
import { useT } from "@/lib/app-i18n";

type Tab = "questions" | "fiche" | "qcm" | "flashcards" | "cas";
const TABS: { id: Tab; label: string }[] = [
  { id: "questions", label: "Questions" },
  { id: "fiche", label: "Fiche" },
  { id: "qcm", label: "QCM" },
  { id: "flashcards", label: "Flashcards" },
  { id: "cas", label: "Cas cliniques" },
];

// Ce que l'étudiant peut faire avec son cours, dans l'ordre où on le conseille.
const ACTIONS: { id: Tab; title: string; text: string; cta: string }[] = [
  { id: "questions", title: "Poser une question", text: "Dr. Ahmed répond à partir de ton cours, avec les pages à relire.", cta: "Discuter" },
  { id: "fiche", title: "Fiche de révision", text: "Les points essentiels du cours, prêts à réviser, à télécharger en PDF.", cta: "Voir la fiche" },
  { id: "qcm", title: "QCM", text: "5 questions pour vérifier ce que tu as retenu, avec la correction.", cta: "Me tester" },
  { id: "flashcards", title: "Flashcards", text: "Des cartes question / réponse pour mémoriser par cœur.", cta: "Mémoriser" },
  { id: "cas", title: "Cas cliniques", text: "Un cas concret pour t'entraîner comme à l'examen.", cta: "M'entraîner" },
];

type FullDoc = DocumentRow & { flashcards: string | null; clinical_case: string | null };

export default function CoursPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const { user } = useApp();
  const [doc, setDoc] = useState<FullDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    sb.from("documents")
      .select("id,name,subject_name,pages,content,chunks,fiche,flashcards,clinical_case,updated_at")
      .eq("id", decodeURIComponent(params.id))
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setMissing(true);
        else setDoc(data as FullDoc);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, params.id]);

  const onSaved = (patch: Patch) => setDoc((d) => (d ? { ...d, ...patch } : d));

  return (
    <div>
      <Link
        href="/app/cours"
        className="inline-flex items-center gap-2 rounded-full border border-ink/25 bg-white px-5 py-2.5 text-[15px] font-semibold text-ink transition hover:border-ink hover:bg-ink hover:text-white"
      >
        <span aria-hidden className="inline-block rtl:-scale-x-100">←</span>{" "}{t("Mes cours")}</Link>

      {missing && <p className="mt-10 text-lg text-muted">{t("Ce document est introuvable sur ton compte.")}</p>}
      {!missing && !doc && <p className="mt-10 text-muted">{t("Chargement du document…")}</p>}

      {doc && (
        <>
          <p className="label mt-8 text-muted">{doc.subject_name || t("Cours")}</p>
          <h2 dir="auto" className="display mt-2 text-3xl leading-tight text-ink sm:text-4xl">{doc.name}</h2>
          <p className="mt-3 text-muted">{t(doc.pages > 1 ? "{a} pages" : "{a} page", { a: doc.pages })}
          </p>

          {tab === null ? (
            <section className="mt-8" aria-label={t("Que veux-tu faire avec ce cours ?")}>
              <div className="rounded-2xl bg-eosin-soft px-5 py-4">
                <p className="font-semibold text-ink">{t("Ton cours est prêt.")}</p>
                <p className="mt-1 text-ink/80">{t("Choisis ce que tu veux faire. Pour commencer, on te conseille la fiche, puis un QCM pour te tester.")}</p>
              </div>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {ACTIONS.map((a) => {
                  const ready =
                    (a.id === "fiche" && !!doc.fiche) ||
                    (a.id === "flashcards" && !!doc.flashcards) ||
                    (a.id === "cas" && !!doc.clinical_case);
                  return (
                    <li key={a.id}>
                      <button
                        onClick={() => setTab(a.id)}
                        className="group flex h-full w-full flex-col rounded-2xl border border-line bg-white p-6 text-start transition hover:border-ink"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="display text-2xl leading-tight text-ink">{t(a.title)}</span>
                          {ready && (
                            <span className="shrink-0 rounded-full bg-eosin-soft px-2.5 py-1 text-xs font-bold" style={{ color: "var(--eosin-text)" }}>{t("Déjà prêt")}</span>
                          )}
                        </span>
                        <span className="mt-2 flex-1 text-muted">{t(a.text)}</span>
                        <span className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-white transition group-hover:bg-eosin group-hover:text-ink">
                          {t(a.cta)} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <button
              onClick={() => setTab(null)}
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-ink/25 bg-white px-5 py-2.5 text-[15px] font-semibold text-ink transition hover:border-ink hover:bg-ink hover:text-white"
            >
              <span aria-hidden className="inline-block rtl:-scale-x-100">←</span>{" "}{t("Tous les outils")}</button>
          )}

          {tab !== null && (
          <div
            role="tablist"
            aria-label={t("Outils")}
            className="mt-4 flex w-full max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-white p-1 sm:inline-flex sm:w-auto"
          >
            {TABS.map((tb) => (
              <button
                key={tb.id}
                role="tab"
                aria-selected={tab === tb.id}
                onClick={() => setTab(tb.id)}
                className={`shrink-0 rounded-full px-5 py-2.5 text-[15px] font-semibold transition-colors ${
                  tab === tb.id ? "bg-ink text-white" : "text-ink/70 hover:text-ink"
                }`}
              >
                {t(tb.label)}
              </button>
            ))}
          </div>
          )}

          <div className="mt-8">
            {tab === "questions" && (
              <>
                <div className="mb-4 flex justify-end">
                  <StartDuoButton kind="room" title={doc.name} payload={roomPayload(doc)} label="Ouvrir une salle à deux avec Dr. Ahmed" />
                </div>
                <ChatPanel doc={doc} />
              </>
            )}
            {tab === "fiche" && <Fiche doc={doc} onSaved={onSaved} />}
            {tab === "qcm" && <QcmTab doc={doc} />}
            {tab === "flashcards" && <Flashcards doc={doc} onSaved={onSaved} />}
            {tab === "cas" && <Cas doc={doc} onSaved={onSaved} />}
          </div>
        </>
      )}
    </div>
  );
}
