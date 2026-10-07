"use client";

import { useMemo, useState } from "react";
import { QuotaError } from "@/lib/ai";
import type { DocumentRow } from "@/lib/course";
import { generateCases, generateFiche, generateFlashcards, saveToDocument, studentCtx } from "@/lib/generate";
import { useApp } from "./app-context";
import { FicheView } from "./fiche-view";
import { FlashcardPlayer, type Card } from "./flashcard-player";
import { LimitNotice } from "./limit-notice";
import { ReportButton } from "./report-button";
import { useT } from "@/lib/app-i18n";
import { dirOf } from "@/lib/dir";

export type GenDoc = DocumentRow & { flashcards?: string | null; clinical_case?: string | null };
export type Patch = { fiche?: string; flashcards?: string; clinical_case?: string };

/** Bloc « générer » : un bouton clair, l'attente expliquée, l'erreur comprise. */
function GenerateCard({
  title,
  text,
  button,
  busy: busyLabel,
  run,
}: {
  title: string;
  text: string;
  button: string;
  busy: string;
  run: (progress: (text: string) => void) => Promise<void>;
}) {
  const t = useT();
  const { refreshQuota } = useApp();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(false);

  async function go() {
    setBusy(true);
    setError(null);
    setLimit(false);
    try {
      await run(setProgress);
    } catch (e) {
      if (e instanceof QuotaError) {
        setLimit(true);
        setBusy(false);
        return;
      }
      setError(
        e instanceof Error && e.message === "format"
            ? t("La génération n'a pas abouti. Réessaie.")
            : e instanceof Error && e.message === "nocase"
              ? t("Aucun cas clinique fiable n'a pu être construit à partir de ce cours. Il faut une pathologie ou une situation clinique traitée dans le cours.")
            : e instanceof Error
              ? e.message
              : t("Une erreur est survenue."),
      );
      setBusy(false);
    } finally {
      refreshQuota();
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
      <p className="display text-2xl text-ink">{title}</p>
      <p className="mt-2 max-w-lg text-muted">{text}</p>
      <button
        onClick={go}
        disabled={busy}
        className="mt-5 rounded-full bg-ink px-7 py-3.5 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-50"
      >
        {busy ? (progress ? t(progress) : busyLabel) : button}
      </button>
      {busy && <p className="mt-3 text-sm text-muted">{t("Ça prend en général 20 à 60 secondes. Ne ferme pas la page.")}</p>}
      {limit && (
        <div className="mt-5">
          <LimitNotice kind="content" onClose={() => setLimit(false)} />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
          {t(error)}
        </p>
      )}
    </div>
  );
}

/* ——— Fiche ——— */

export function Fiche({ doc, onSaved }: { doc: GenDoc; onSaved: (p: Patch) => void }) {
  const t = useT();
  const { user, profile } = useApp();

  if (!doc.fiche) {
    return (
      <GenerateCard
        title={t("Génère la fiche de ce cours.")}
        text={t("Dr. Ahmed lit ton cours et en tire une fiche de révision : l'essentiel, le mécanisme, le diagnostic, le traitement, les questions d'examen probables et les pièges.")}
        button={t("Générer la fiche")}
        busy={t("Dr. Ahmed écrit ta fiche…")}
        run={async () => {
          const fiche = await generateFiche(doc.name, doc.content, studentCtx(profile));
          await saveToDocument(doc.id, user.id, { fiche });
          onSaved({ fiche });
        }}
      />
    );
  }

  return (
    <div>
      <FicheView text={doc.fiche} />
      <div className="mt-4 text-end">
        <ReportButton docId={doc.id} kind="fiche" snapshot={{ fiche: doc.fiche }} label={t("Signaler une erreur dans cette fiche")} />
      </div>
    </div>
  );
}

/* ——— Flashcards (générées dans l'application, affichées ici) ——— */

export function Flashcards({ doc, onSaved }: { doc: GenDoc; onSaved: (p: Patch) => void }) {
  const t = useT();
  const { user, profile } = useApp();
  const raw = doc.flashcards ?? null;

  // Analysé une seule fois par jeu de cartes : le lecteur garde sa session tant que les cartes ne changent pas.
  const cards = useMemo<Card[]>(() => {
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((c) => c && typeof c.front === "string" && typeof c.back === "string")
        : [];
    } catch {
      return [];
    }
  }, [raw]);

  if (cards.length === 0) {
    return (
      <GenerateCard
        title={t("Génère les flashcards de ce cours.")}
        text={t("Jusqu'à 30 cartes question / réponse sur l'essentiel de ton cours, dans l'ordre des chapitres. Elles sont enregistrées : tu les génères une seule fois.")}
        button={t("Générer les flashcards")}
        busy={t("Dr. Ahmed prépare tes cartes…")}
        run={async (progress) => {
          const flashcards = await generateFlashcards(
            doc.name,
            doc.content,
            doc.chunks ?? [],
            studentCtx(profile),
            (d, total) => progress(t("Chapitre {a} sur {b}…", { a: Math.min(d + 1, total), b: total })),
          );
          await saveToDocument(doc.id, user.id, { flashcards });
          onSaved({ flashcards });
        }}
      />
    );
  }

  return <FlashcardPlayer docId={doc.id} userId={user.id} cards={cards} />;
}

/* ——— Cas cliniques (générés dans l'application, affichés ici) ——— */

type Stage = { label: string; reveal: string; prompt: string };
type ClinicalCase = {
  title: string;
  context: string;
  stages: Stage[];
  diagnosis: string;
  differentials?: string;
  reasoning: string;
  management: string;
  source_quotes?: string[];
};

export function Cas({ doc, onSaved }: { doc: GenDoc; onSaved: (p: Patch) => void }) {
  const t = useT();
  const { user, profile } = useApp();
  const raw = doc.clinical_case ?? null;
  const [c, setC] = useState(0);
  const [step, setStep] = useState(0);

  let cases: ClinicalCase[] = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      cases = parsed.filter((x) => x && typeof x.title === "string" && Array.isArray(x.stages));
    }
  } catch {
    cases = [];
  }

  if (cases.length === 0) {
    return (
      <GenerateCard
        title={t("Génère des cas cliniques pour ce cours.")}
        text={t("Un ou plusieurs cas en 4 étapes (motif, interrogatoire, examen, examens complémentaires). Tu réfléchis avant de voir la suite, puis le diagnostic.")}
        button={t("Générer les cas cliniques")}
        busy={t("Dr. Ahmed construit tes cas…")}
        run={async (progress) => {
          const clinical_case = await generateCases(doc.name, doc.content, studentCtx(profile), progress);
          await saveToDocument(doc.id, user.id, { clinical_case });
          onSaved({ clinical_case });
        }}
      />
    );
  }

  const cas = cases[Math.min(c, cases.length - 1)];
  const finished = step >= cas.stages.length;

  return (
    <div>
      {cases.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {cases.map((x, idx) => (
            <button
              key={idx}
              onClick={() => {
                setC(idx);
                setStep(0);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                idx === c ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/80 hover:border-ink"
              }`}
            >{t("Cas {a}", { a: idx + 1 })}</button>
          ))}
        </div>
      )}

      <div dir={dirOf(cas.title + (cas.context ?? ""))} className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label text-muted">{t("Cas clinique · fictif, à visée pédagogique")}</p>
          <ReportButton docId={doc.id} kind="case" itemRef={String(c + 1)} snapshot={cas} label={t("Signaler une erreur dans ce cas")} />
        </div>
        <p className="display mt-2 text-3xl leading-tight text-ink">{cas.title}</p>
        <p className="mt-3 text-ink/80">{cas.context}</p>

        <ol className="mt-6 space-y-5">
          {cas.stages.slice(0, step + 1).map((s, idx) => (
            <li key={idx} className="rounded-2xl bg-slide p-5">
              <p className="label text-muted">{t("Étape {a} · {b}", { a: idx + 1, b: t(s.label) })}</p>
              <p className="mt-2 text-ink/90">{s.reveal}</p>
              {idx === step && !finished && <p className="display mt-4 text-xl text-ink">{s.prompt}</p>}
            </li>
          ))}
        </ol>

        {!finished ? (
          <button
            onClick={() => setStep((n) => n + 1)}
            className="mt-6 rounded-full bg-ink px-7 py-3.5 font-semibold text-white transition hover:bg-eosin hover:text-ink"
          >
            {step + 1 >= cas.stages.length ? t("Voir le diagnostic") : t("J'ai réfléchi, étape suivante")}
          </button>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-eosin-soft p-5">
              <p className="label" style={{ color: "var(--eosin-text)" }}>{t("Diagnostic")}</p>
              <p className="display mt-2 text-2xl text-ink">{cas.diagnosis}</p>
            </div>
            <div>
              <p className="label text-muted">{t("Raisonnement")}</p>
              <p className="mt-2 text-ink/85">{cas.reasoning}</p>
            </div>
            {cas.differentials && (
              <div>
                <p className="label text-muted">{t("Diagnostics différentiels")}</p>
                <p className="mt-2 text-ink/85">{cas.differentials}</p>
              </div>
            )}
            <div>
              <p className="label text-muted">{t("Conduite à tenir")}</p>
              <p className="mt-2 text-ink/85">{cas.management}</p>
            </div>
            {cas.source_quotes && cas.source_quotes.length > 0 && (
              <div className="rounded-2xl bg-slide p-5">
                <p className="label text-muted">{t("Dans ton cours")}</p>
                <ul className="mt-2 space-y-2">
                  {cas.source_quotes.map((q, i) => (
                    <li key={i} className="border-s-4 border-eosin ps-3 text-ink/85">
                      « {q} »
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={() => setStep(0)}
              className="rounded-full border border-ink/20 px-6 py-3 font-semibold text-ink transition hover:border-ink"
            >{t("Recommencer ce cas")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
