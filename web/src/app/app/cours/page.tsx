"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IconPlus, IconTrash } from "@/components/icons";
import { autoChunk, extractPdf, UnreadablePdfError, type Heading } from "@/lib/pdf";
import { getSupabase } from "@/lib/supabase";

export default function Cours() {
  const router = useRouter();
  const { user, quota, docs, refreshDocs } = useApp();
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Dernier cours ajouté : l'identifiant est l'heure d'ajout (sinon, date de mise à jour).
  const newestId = docs?.length
    ? [...docs].sort((a, b) => (Number(b.id) || Date.parse(b.updated_at) || 0) - (Number(a.id) || Date.parse(a.updated_at) || 0))[0].id
    : null;

  const max = quota?.limits?.max_documents ?? null;
  const full = max !== null && (docs?.length ?? 0) >= max;

  async function onFile(file: File) {
    const sb = getSupabase();
    if (!sb) return;
    setError(null);
    if (full) {
      setError(
        `Ton plan permet ${max} document${(max ?? 0) > 1 ? "s" : ""} actif${(max ?? 0) > 1 ? "s" : ""}. Supprime-en un ou passe à un plan supérieur.`,
      );
      return;
    }
    try {
      const isTxt = /\.txt$/i.test(file.name);
      setUploading("Lecture du fichier…");
      let text: string;
      let pages: number;
      let headings: Heading[] = [];
      if (isTxt) {
        text = await file.text();
        pages = Math.max(1, Math.round(text.split(/\s+/).length / 400));
      } else {
        const r = await extractPdf(file, (p, n) => setUploading(`Lecture de la page ${p} sur ${n}…`));
        text = r.text;
        pages = r.pages;
        headings = r.headings;
      }
      if (text.trim().length < 500) throw new UnreadablePdfError(text.trim().length, pages);

      setUploading("Découpage en parties…");
      const id = Date.now().toString();
      const { error: e } = await sb.from("documents").insert({
        id,
        user_id: user.id,
        name: file.name.replace(/\.(pdf|txt)$/i, ""),
        subject_name: "",
        file_name: file.name,
        pages,
        content: text,
        chunks: autoChunk(text, headings),
      });
      if (e) {
        if (/document_limit_reached/.test(e.message)) {
          setError("Tu as atteint la limite de documents de ton plan. Passe à un plan supérieur pour en ajouter.");
          setUploading(null);
          return;
        }
        throw e;
      }
      await refreshDocs();
      router.push(`/app/cours/${encodeURIComponent(id)}`);
    } catch (err) {
      setError(
        err instanceof UnreadablePdfError
          ? "Ce PDF ne contient pas assez de texte. C'est probablement un scan (une image) : il faut un PDF dont le texte est sélectionnable."
          : "Impossible d'ajouter ce fichier. Vérifie qu'il s'agit d'un PDF ou d'un fichier .txt, puis réessaie.",
      );
      setUploading(null);
    }
  }

  async function remove(id: string) {
    const sb = getSupabase();
    if (!sb) return;
    setDeleting(id);
    await sb.from("documents").delete().eq("id", id);
    await refreshDocs();
    setDeleting(null);
    setToDelete(null);
  }

  return (
    <div>
      {toDelete && (
        <ConfirmDialog
          title="Supprimer ce cours ?"
          text={`« ${toDelete.name} » sera supprimé définitivement, avec sa fiche, ses flashcards et ses cas cliniques. Tu pourras ensuite ajouter un autre document.`}
          confirmLabel="Supprimer le cours"
          danger
          busy={deleting === toDelete.id}
          onConfirm={() => remove(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div />
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            className="sr-only"
            aria-label="Ajouter un document"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onFile(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading !== null}
            className="flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-50"
          >
            <IconPlus />
            {uploading ?? "Ajouter un document"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-2xl bg-[#fff1f0] px-4 py-3 text-[#a3271c]">
          {error}{" "}
          {full && (
            <Link href="/app/abonnement" className="font-semibold underline">
              Voir les plans
            </Link>
          )}
        </p>
      )}

      {docs !== null && docs.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white p-8 sm:p-12">
          <p className="display text-3xl text-ink">Dépose ton premier cours.</p>
          <p className="mt-3 max-w-lg text-muted">
            Ajoute un PDF dont le texte est sélectionnable (pas un scan) ou un fichier .txt. Une fois lu, tu choisis
            quoi en faire : poser des questions, une fiche, des QCM, des flashcards ou un cas clinique.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading !== null}
            className="mt-6 flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-50"
          >
            <IconPlus />
            {uploading ?? "Choisir un PDF"}
          </button>
        </div>
      )}

      {docs !== null && docs.length > 0 && (
        <>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {docs.map((d) => {
              const fresh = d.id === newestId;
              return (
              <li
                key={d.id}
                className={`flex flex-col rounded-2xl border bg-white p-6 ${fresh ? "border-eosin sm:col-span-2" : "border-line"}`}
              >
                {fresh && (
                  <p className="mb-4 rounded-xl bg-eosin-soft px-4 py-3 text-ink">
                    <span className="font-semibold">Dernier cours ajouté.</span> Ouvre-le pour poser tes questions à
                    Dr. Ahmed, générer une fiche, te tester avec des QCM ou apprendre avec des flashcards.
                  </p>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="label text-muted">{d.subject_name || "Cours"}</p>
                    <p className="display mt-2 text-2xl leading-tight text-ink">{d.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      {d.pages} page{d.pages > 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setToDelete({ id: d.id, name: d.name })}
                    disabled={deleting === d.id}
                    aria-label={`Supprimer ${d.name}`}
                    title="Supprimer"
                    className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-slide hover:text-[#a3271c] disabled:opacity-40"
                  >
                    <IconTrash />
                  </button>
                </div>

                {fresh && (
                  <ul className="mt-5 flex flex-wrap gap-2" aria-label="Ce que tu peux faire avec ce cours">
                    {["Questions", "Fiche", "QCM", "Flashcards", "Cas cliniques"].map((t) => (
                      <li key={t} className="rounded-full bg-slide px-3 py-1 text-sm text-ink/80">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}

                <Link
                  href={`/app/cours/${encodeURIComponent(d.id)}`}
                  className={`mt-6 flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-semibold transition ${
                    fresh
                      ? "bg-ink text-white hover:bg-eosin hover:text-ink"
                      : "border border-ink text-ink hover:bg-ink hover:text-white"
                  }`}
                >
                  {fresh ? "Ouvrir et réviser" : "Ouvrir"} <span aria-hidden>→</span>
                </Link>
              </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
