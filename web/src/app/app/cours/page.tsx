"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, type DocSummary } from "@/components/app-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ModuleDialog, type ModuleMode } from "@/components/module-dialog";
import { IconPlus, IconTrash } from "@/components/icons";
import { autoChunk, extractPdf, UnreadablePdfError, type Heading } from "@/lib/pdf";
import { isImageFile, MAX_OCR_PAGES, OcrLimitError, ocrPages, pdfPagesToJpeg, photosToJpeg, TooManyPagesError } from "@/lib/ocr";
import { getSupabase } from "@/lib/supabase";
import { removeFromBank, saveToBank } from "@/lib/bank";
import { ErrorsEntry } from "@/components/errors-entry";
import { trackOnce } from "@/lib/track";
import { useT } from "@/lib/app-i18n";

export default function Cours() {
  const t = useT();
  const router = useRouter();
  const { user, quota, docs, refreshDocs } = useApp();
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Modules : le module dans lequel on ajoute un cours, la fenêtre ouverte, et les modules repliés
  const uploadModule = useRef("");
  const [moduleDlg, setModuleDlg] = useState<ModuleMode | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setCollapsed(JSON.parse(window.localStorage.getItem("axone:modules-collapsed") ?? "{}"));
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const toggle = (name: string) =>
    setCollapsed((c) => {
      const next = { ...c, [name]: !c[name] };
      try {
        window.localStorage.setItem("axone:modules-collapsed", JSON.stringify(next));
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  // Affichage : grandes cartes ou liste compacte (liste par défaut dès qu'il y a beaucoup de cours) ; recherche
  const [viewPref, setViewPref] = useState<"cards" | "list" | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("axone:cours-view");
      if (v === "cards" || v === "list") setViewPref(v);
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const view: "cards" | "list" = viewPref ?? ((docs?.length ?? 0) > 6 ? "list" : "cards");
  const setView = (v: "cards" | "list") => {
    setViewPref(v);
    try {
      window.localStorage.setItem("axone:cours-view", v);
    } catch {
      /* stockage indisponible */
    }
  };
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (docs ?? []).filter((d) => !q || `${d.name} ${d.subject_name ?? ""}`.toLowerCase().includes(q)),
    [docs, q],
  );
  const groups = useMemo(() => {
    const m = new Map<string, DocSummary[]>();
    for (const d of filtered) {
      const k = (d.subject_name ?? "").trim();
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    const named = [...m.entries()].filter(([k]) => k).sort(([a], [b]) => a.localeCompare(b, "fr"));
    return { named, none: m.get("") ?? [] };
  }, [filtered]);

  // Dernier cours ajouté : l'identifiant est l'heure d'ajout (sinon, date de mise à jour).
  const newestId = docs?.length
    ? [...docs].sort((a, b) => (Number(b.id) || Date.parse(b.updated_at) || 0) - (Number(a.id) || Date.parse(a.updated_at) || 0))[0].id
    : null;

  const max = quota?.limits?.max_documents ?? null;
  const full = max !== null && (docs?.length ?? 0) >= max;
  // Message d'invitation : supprimer un ancien cours suffit, ou passer au plan d'au-dessus.
  const upgradeTo = quota?.plan === "standard" ? "Premium" : "Standard";
  const limitMessage = (n: number | null) =>
    t(
      n === null
        ? "Ton plan a une limite de documents. Supprime un ancien cours pour en ajouter un nouveau, ou passe au plan {p} pour en avoir plus."
        : n > 1
          ? "Ton plan permet {n} documents. Supprime un ancien cours pour en ajouter un nouveau, ou passe au plan {p} pour en avoir plus."
          : "Ton plan permet {n} document. Supprime un ancien cours pour en ajouter un nouveau, ou passe au plan {p} pour en avoir plus.",
      { n: n ?? 0, p: upgradeTo },
    );

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
        setError(t("Choisis un seul PDF ou fichier texte à la fois. Pour plusieurs pages, envoie des photos."));
        return;
      }
      const isTxt = !photos && /\.txt$/i.test(file.name);
      setUploading(t("Lecture du fichier…"));
      let text: string;
      let pages: number;
      let headings: Heading[] = [];
      let label = file.name.replace(/\.(pdf|txt|jpe?g|png|webp|heic|heif)$/i, "");

      const progress = (d: number, n: number) => setUploading(t("Lecture de la page {a} sur {b}…", { a: d, b: n }));
      const readByOcr = async (source: AsyncIterable<string>, n: number) => {
        const r = await ocrPages(source, n, progress);
        if (r.failed > n / 2) throw new Error("ocr_failed");
        return r.text;
      };

      if (photos) {
        if (files.length > MAX_OCR_PAGES) throw new TooManyPagesError(files.length);
        pages = files.length;
        text = await readByOcr(photosToJpeg(files), files.length);
        if (files.length > 1) label = `${t("Photos de cours du {a}", { a: new Date().toLocaleDateString("fr-FR") })}`;
      } else if (isTxt) {
        text = await file.text();
        pages = Math.max(1, Math.round(text.split(/\s+/).length / 400));
      } else {
        const r = await extractPdf(file, (p, n) => setUploading(t("Lecture de la page {a} sur {b}…", { a: p, b: n })));
        text = r.text;
        pages = r.pages;
        headings = r.headings;
        if (text.trim().length < 500) {
          // Presque pas de texte : c'est un scan. On lit les pages comme des images.
          if (r.pages > MAX_OCR_PAGES) throw new TooManyPagesError(r.pages);
          setUploading(t("Ce PDF est un scan, lecture des pages…"));
          const all = Array.from({ length: r.pages }, (_, i) => i + 1);
          text = await readByOcr(pdfPagesToJpeg(file, all), r.pages);
          headings = [];
        }
      }
      if (text.trim().length < (photos ? 200 : 500)) throw new UnreadablePdfError(text.trim().length, pages);

      setUploading(t("Découpage en parties…"));
      const id = Date.now().toString();
      const row = {
        id,
        user_id: user.id,
        name: label,
        subject_name: uploadModule.current,
        file_name: photos && files.length > 1 ? `${files.length} photos` : file.name,
        pages,
        content: text,
        chunks: autoChunk(text, headings),
      };
      const ins = await sb.from("documents").insert(row);
      const e = ins.error;
      if (!e) trackOnce("upload_document", { pages });
      if (e) {
        if (/document_limit_reached/.test(e.message)) {
          setError(limitMessage(max));
          setUploading(null);
          return;
        }
        throw e;
      }
      // Copie du fichier dans la banque de cours (en arrière-plan : l'étudiant n'attend pas, et un échec ne change rien pour lui)
      void saveToBank(sb, user.id, id, files);
      uploadModule.current = "";
      await refreshDocs();
      router.push(`/app/cours/${encodeURIComponent(id)}`);
    } catch (err) {
      setError(
        err instanceof UnreadablePdfError
          ? t("Je n'arrive pas à lire assez de texte. Prends la page bien à plat, dans une bonne lumière, sans reflet, puis réessaie.")
          : err instanceof TooManyPagesError
            ? t("Ce document a {a} pages : la lecture d'un scan ou de photos est limitée à {b} pages à la fois. Découpe-le en plusieurs parties.", { a: err.pages, b: MAX_OCR_PAGES })
            : err instanceof OcrLimitError
              ? t(
                  err.cap
                    ? "Tu as atteint la limite de pages lues aujourd'hui ({a}). Réessaie demain, ou passe à un plan supérieur pour en lire davantage."
                    : "Tu as atteint la limite de pages lues aujourd'hui. Réessaie demain, ou passe à un plan supérieur pour en lire davantage.",
                  { a: err.cap },
                )
              : t("Impossible d'ajouter ce fichier. Vérifie qu'il s'agit d'un PDF, d'un fichier .txt ou de photos de ton cours, puis réessaie."),
      );
      setUploading(null);
    }
  }

  async function remove(id: string) {
    const sb = getSupabase();
    if (!sb) return;
    setDeleting(id);
    await removeFromBank(sb, user.id, id);
    await sb.from("documents").delete().eq("id", id);
    await refreshDocs();
    setDeleting(null);
    setToDelete(null);
  }

  const renderCard = (d: DocSummary) => {
    const fresh = d.id === newestId;
    return (
      <li
        key={d.id}
        className={`flex flex-col rounded-2xl border bg-white p-6 ${fresh ? "border-eosin sm:col-span-2" : "border-line"}`}
      >
        {fresh && (
          <p className="mb-4 rounded-xl bg-eosin-soft px-4 py-3 text-ink">
            <span className="font-semibold">{t("Dernier cours ajouté.")}</span>{" "}{t("Ouvre-le pour poser tes questions à Dr. Ahmed, générer une fiche, te tester avec des QCM ou apprendre avec des flashcards.")}</p>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label text-muted">{d.subject_name || t("Cours")}</p>
            <p dir="auto" className="display mt-2 text-2xl leading-tight text-ink">{d.name}</p>
            <p className="mt-1 text-sm text-muted">{t(d.pages > 1 ? "{a} pages" : "{a} page", { a: d.pages })}
            </p>
          </div>
          <button
            onClick={() => setToDelete({ id: d.id, name: d.name })}
            disabled={deleting === d.id}
            aria-label={t("Supprimer {a}", { a: d.name })}
            title={t("Supprimer")}
            className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-slide hover:text-[#a3271c] disabled:opacity-40"
          >
            <IconTrash />
          </button>
        </div>

        {fresh && (
          <ul className="mt-5 flex flex-wrap gap-2" aria-label={t("Ce que tu peux faire avec ce cours")}>
            {["Questions", "Fiche", "QCM", "Flashcards", "Cas cliniques"].map((t) => (
              <li key={t} className="rounded-full bg-slide px-3 py-1 text-sm text-ink/80">
                {t}
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={() => setModuleDlg({ kind: "assign", doc: d })}
          className="mt-4 self-start rounded-full px-3 py-1.5 text-sm font-semibold text-ink/70 transition hover:bg-slide hover:text-ink"
        >
          📁 {d.subject_name ? t("Changer de module") : t("Ranger dans un module")}
        </button>

        <Link
          href={`/app/cours/${encodeURIComponent(d.id)}`}
          className={`mt-3 flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-semibold transition ${
            fresh
              ? "bg-ink text-white hover:bg-eosin hover:text-ink"
              : "border border-ink text-ink hover:bg-ink hover:text-white"
          }`}
        >
          {fresh ? t("Ouvrir et réviser") : t("Ouvrir")} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
        </Link>
      </li>
    );
  };

  const renderRow = (d: DocSummary) => (
    <li key={d.id} className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 sm:gap-3 sm:px-4">
      <Link href={`/app/cours/${encodeURIComponent(d.id)}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span dir="auto" className="min-w-0 flex-1 truncate font-semibold text-ink">{d.name}</span>
        {d.subject_name && groups.named.length === 0 && (
          <span className="hidden shrink-0 rounded-full bg-slide px-2.5 py-0.5 text-xs font-semibold text-muted sm:inline">{d.subject_name}</span>
        )}
        <span className="shrink-0 text-sm text-muted">{t(d.pages > 1 ? "{a} pages" : "{a} page", { a: d.pages })}</span>
      </Link>
      <button
        onClick={() => setModuleDlg({ kind: "assign", doc: d })}
        aria-label={d.subject_name ? t("Changer de module") : t("Ranger dans un module")}
        title={d.subject_name ? t("Changer de module") : t("Ranger dans un module")}
        className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-slide hover:text-ink"
      >
        <span aria-hidden>📁</span>
      </button>
      <button
        onClick={() => setToDelete({ id: d.id, name: d.name })}
        disabled={deleting === d.id}
        aria-label={t("Supprimer {a}", { a: d.name })}
        title={t("Supprimer")}
        className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-slide hover:text-[#a3271c] disabled:opacity-40"
      >
        <IconTrash />
      </button>
      <Link
        href={`/app/cours/${encodeURIComponent(d.id)}`}
        className="shrink-0 rounded-full border border-ink px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-ink hover:text-white"
      >
        {t("Ouvrir")} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
      </Link>
    </li>
  );

  const renderList = (list: DocSummary[], top = "mt-4") =>
    view === "list" ? (
      <ul className={`${top} space-y-2`}>{list.map(renderRow)}</ul>
    ) : (
      <ul className={`${top} grid gap-4 sm:grid-cols-2`}>{list.map(renderCard)}</ul>
    );

  return (
    <div>
      {docs !== null && docs.length > 0 && <div className="mb-6"><ErrorsEntry compact /></div>}
      {toDelete && (
        <ConfirmDialog
          title={t("Supprimer ce cours ?")}
          text={t("« {a} » sera supprimé définitivement, avec sa fiche, ses flashcards, ses cas cliniques et la copie du fichier. Tu pourras ensuite ajouter un autre document.", { a: toDelete.name })}
          confirmLabel={t("Supprimer le cours")}
          danger
          busy={deleting === toDelete.id}
          onConfirm={() => remove(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {docs !== null && docs.length > 0 && (
            <button
              onClick={() => setModuleDlg({ kind: "create" })}
              className="rounded-full border border-ink/25 px-5 py-3 font-semibold text-ink transition hover:border-ink"
            >
              📁 {t("Créer un module")}
            </button>
          )}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain,image/*"
            multiple
            className="sr-only"
            aria-label={t("Ajouter un document")}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (list.length > 0) onFiles(list);
            }}
          />
          <button
            onClick={() => {
              uploadModule.current = "";
              fileRef.current?.click();
            }}
            disabled={uploading !== null}
            className="flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-50"
          >
            <IconPlus />
            {uploading ?? t("Ajouter un document")}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-2xl bg-[#fff1f0] px-4 py-3 text-[#a3271c]">
          {t(error)}{" "}
          {full && (
            <Link href="/app/abonnement" className="font-semibold underline">{t("Voir les plans")}</Link>
          )}
        </p>
      )}

      {docs !== null && docs.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white p-8 sm:p-12">
          <p className="display text-3xl text-ink">{t("Dépose ton premier cours.")}</p>
          <p className="mt-3 max-w-lg text-muted">{t("Ajoute un PDF (même scanné), des photos de tes pages de cours ou un fichier .txt. Une fois lu, tu choisis quoi en faire : poser des questions, une fiche, des QCM, des flashcards ou un cas clinique.")}</p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading !== null}
            className="mt-6 flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-50"
          >
            <IconPlus />
            {uploading ?? t("Choisir un PDF")}
          </button>
        </div>
      )}

      {docs !== null && docs.length > 3 && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Chercher un cours ou un module…")}
            aria-label={t("Chercher un cours ou un module…")}
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-5 py-2.5 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <div role="group" aria-label={t("Affichage")} className="inline-flex rounded-full border border-line bg-white p-1">
            {(["list", "cards"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${view === v ? "bg-ink text-white" : "text-ink/70 hover:text-ink"}`}
              >
                {v === "list" ? t("Liste") : t("Cartes")}
              </button>
            ))}
          </div>
        </div>
      )}

      {docs !== null && docs.length > 0 && filtered.length === 0 && (
        <p className="mt-6 rounded-2xl border border-line bg-white p-6 text-center text-muted">{t("Aucun cours ne correspond.")}</p>
      )}

      {docs !== null && docs.length > 0 && filtered.length > 0 && (
        groups.named.length === 0 ? (
          renderList(filtered, "mt-4")
        ) : (
          <div className="mt-8 space-y-8">
            {groups.named.map(([name, list]) => {
              const open = !collapsed[name];
              return (
                <section key={name}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <button
                      onClick={() => toggle(name)}
                      aria-expanded={open}
                      className="flex min-w-0 items-center gap-3 text-start"
                    >
                      <span aria-hidden className={`inline-block text-ink/60 transition-transform ${open ? "rotate-90" : ""} rtl:-scale-x-100`}>▸</span>
                      <span dir="auto" className="display truncate text-2xl text-ink">{name}</span>
                      <span className="rounded-full bg-slide px-2.5 py-0.5 text-sm font-semibold text-muted">{list.length}</span>
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          uploadModule.current = name;
                          fileRef.current?.click();
                        }}
                        disabled={uploading !== null}
                        className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink/70 transition hover:bg-slide hover:text-ink disabled:opacity-40"
                      >
                        ＋ {t("Ajouter ici")}
                      </button>
                      <button
                        onClick={() => setModuleDlg({ kind: "rename", name })}
                        className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink/70 transition hover:bg-slide hover:text-ink"
                      >
                        {t("Renommer")}
                      </button>
                    </div>
                  </div>
                  {open && renderList(list)}
                </section>
              );
            })}
            {groups.none.length > 0 && (
              <section>
                <div className="border-b border-line pb-3">
                  <button onClick={() => toggle("")} aria-expanded={!collapsed[""]} className="flex items-center gap-3 text-start">
                    <span aria-hidden className={`inline-block text-ink/60 transition-transform ${!collapsed[""] ? "rotate-90" : ""} rtl:-scale-x-100`}>▸</span>
                    <span className="display text-2xl text-ink">{t("Sans module")}</span>
                    <span className="rounded-full bg-slide px-2.5 py-0.5 text-sm font-semibold text-muted">{groups.none.length}</span>
                  </button>
                </div>
                {!collapsed[""] && renderList(groups.none)}
              </section>
            )}
          </div>
        )
      )}

      {moduleDlg && docs && (
        <ModuleDialog mode={moduleDlg} docs={docs} onClose={() => setModuleDlg(null)} onDone={() => refreshDocs()} />
      )}
    </div>
  );
}
