"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IconPlus, IconTrash } from "@/components/icons";
import { autoChunk, extractPdf, UnreadablePdfError, type Heading } from "@/lib/pdf";
import { isImageFile, MAX_OCR_PAGES, OcrLimitError, ocrPages, pdfPagesToJpeg, photosToJpeg, TooManyPagesError } from "@/lib/ocr";
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
  // Message d'invitation : supprimer un ancien cours suffit, ou passer au plan d'au-dessus.
  const upgradeTo = quota?.plan === "standard" ? "Duo" : "Standard";
  const limitMessage = (n: number | null) =>
    `Ton plan permet ${n ?? "un nombre limité de"} document${(n ?? 0) > 1 ? "s" : ""}. Supprime un ancien cours pour en ajouter un nouveau, ou passe au plan ${upgradeTo} pour en avoir plus.`;

  async function onFiles(files: File[]) {
    const sb = getSupabase();
    if (!sb) return;
    setError(null);
    if (full) {
      setError(
        limitMessage(max),
      );
      return;
    }
    try {
      const file = files[0];
      const photos = files.every(isImageFile);
      if (files.length > 1 && !photos) {
        setError("Choisis un seul PDF ou fichier texte à la fois. Pour plusieurs pages, envoie des photos.");
        return;
      }
      const isTxt = !photos && /\.txt$/i.test(file.name);
      setUploading("Lecture du fichier…");
      let text: string;
      let pages: number;
      let headings: Heading[] = [];
      let label = file.name.replace(/\.(pdf|txt|jpe?g|png|webp|heic|heif)$/i, "");

      const progress = (d: number, n: number) => setUploading(`Lecture de la page ${d} sur ${n}…`);
      const readByOcr = async (source: AsyncIterable<string>, n: number) => {
        const r = await ocrPages(source, n, progress);
        if (r.failed > n / 2) throw new Error("ocr_failed");
        return r.text;
      };

      if (photos) {
        if (files.length > MAX_OCR_PAGES) throw new TooManyPagesError(files.length);
        pages = files.length;
        text = await readByOcr(photosToJpeg(files), files.length);
        if (files.length > 1) label = `Photos de cours du ${new Date().toLocaleDateString("fr-FR")}`;
      } else if (isTxt) {
        text = await file.text();
        pages = Math.max(1, Math.round(text.split(/\s+/).length / 400));
      } else {
        const r = await extractPdf(file, (p, n) => setUploading(`Lecture de la page ${p} sur ${n}…`));
        text = r.text;
        pages = r.pages;
        headings = r.headings;
        if (text.trim().length < 500) {
          // Presque pas de texte : c'est un scan. On lit les pages comme des images.
          if (r.pages > MAX_OCR_PAGES) throw new TooManyPagesError(r.pages);
          setUploading("Ce PDF est un scan, lecture des pages…");
          const all = Array.from({ length: r.pages }, (_, i) => i + 1);
          text = await readByOcr(pdfPagesToJpeg(file, all), r.pages);
          headings = [];
        }
      }
      if (text.trim().length < (photos ? 200 : 500)) throw new UnreadablePdfError(text.trim().length, pages);

      setUploading("Découpage en parties…");
      const id = Date.now().toString();
      const { error: e } = await sb.from("documents").insert({
        id,
        user_id: user.id,
        name: label,
        subject_name: "",
        file_name: photos && files.length > 1 ? `${files.length} photos` : file.name,
        pages,
        content: text,
        chunks: autoChunk(text, headings),
      });
      if (e) {
        if (/document_limit_reached/.test(e.message)) {
          setError(limitMessage(max));
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
          ? "Je n'arrive pas à lire assez de texte. Prends la page bien à plat, dans une bonne lumière, sans reflet, puis réessaie."
          : err instanceof TooManyPagesError
            ? `Ce document a ${err.pages} pages : la lecture d'un scan ou de photos est limitée à ${MAX_OCR_PAGES} pages à la fois. Découpe-le en plusieurs parties.`
            : err instanceof OcrLimitError
              ? `Tu as atteint la limite de pages lues aujourd'hui${err.cap ? ` (${err.cap})` : ""}. Réessaie demain, ou passe à un plan supérieur pour en lire davantage.`
              : "Impossible d'ajouter ce fichier. Vérifie qu'il s'agit d'un PDF, d'un fichier .txt ou de photos de ton cours, puis réessaie.",
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
            accept=".pdf,.txt,application/pdf,text/plain,image/*"
            multiple
            className="sr-only"
            aria-label="Ajouter un document"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (list.length > 0) onFiles(list);
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
            Ajoute un PDF (même scanné), des photos de tes pages de cours ou un fichier .txt. Une fois lu, tu choisis
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
