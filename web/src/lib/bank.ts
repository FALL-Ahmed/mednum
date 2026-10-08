import type { SupabaseClient } from "@supabase/supabase-js";
import { reportError } from "./report-error";

/*
  Banque de cours : le fichier d'origine de chaque cours déposé est conservé dans un espace privé (course-files),
  un dossier par étudiant, jamais visible par les autres. Le texte du cours est déjà enregistré ailleurs : ceci est
  une copie de plus, pour que l'équipe puisse améliorer le service. Tout est « au mieux » : si l'envoi échoue,
  l'étudiant ne le voit pas et son cours reste ajouté.
*/

const BUCKET = "course-files";
const MAX_FILE = 40 * 1024 * 1024; // même plafond que l'espace de stockage

const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
const safe = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "fichier";

/** Réduit une photo (1800 px au plus, JPEG) pour ne pas stocker des dizaines de Mo : la lisibilité est conservée. */
async function shrink(file: File): Promise<Blob | null> {
  try {
    if (!file.type.startsWith("image/") || /heic|heif/i.test(file.type)) return null; // format non lisible par le navigateur : on garde l'original
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  } catch {
    return null;
  }
}

/** Conserve le(s) fichier(s) du cours et l'inscrit sur le cours. N'échoue jamais bruyamment. */
export async function saveToBank(sb: SupabaseClient, userId: string, docId: string, files: File[]): Promise<void> {
  try {
    const folder = `${userId}/${docId}`;
    let stored = 0;
    let bytes = 0;
    let mime: string | null = null;
    let path: string | null = null;

    if (files.every(isImage)) {
      for (let i = 0; i < files.length; i++) {
        const blob = (await shrink(files[i])) ?? files[i];
        if (blob.size > MAX_FILE) continue;
        const p = `${folder}/${String(i + 1).padStart(3, "0")}${blob.type === "image/jpeg" ? ".jpg" : "-" + safe(files[i].name)}`;
        const { error } = await sb.storage.from(BUCKET).upload(p, blob, { contentType: blob.type || "image/jpeg" });
        if (error) reportError("bank", `Envoi photo : ${error.message}`, { context: { docId } });
        if (!error) {
          stored++;
          bytes += blob.size;
          mime = blob.type || "image/jpeg";
        }
      }
      path = stored > 0 ? folder : null;
    } else {
      const f = files[0];
      if (f.size > MAX_FILE) reportError("bank", "Fichier trop lourd pour la banque (plus de 40 Mo)", { context: { docId, size: f.size } });
      if (f.size <= MAX_FILE) {
        const p = `${folder}/${safe(f.name)}`;
        const { error } = await sb.storage.from(BUCKET).upload(p, f, { contentType: f.type || undefined });
        if (error) reportError("bank", `Envoi fichier : ${error.message}`, { context: { docId, type: f.type, size: f.size } });
        if (!error) {
          stored = 1;
          bytes = f.size;
          mime = f.type || null;
          path = p;
        }
      }
    }

    if (path && stored > 0) {
      const { error } = await sb.from("documents").update({ file_path: path, file_count: stored, file_size: bytes, file_mime: mime }).eq("id", docId);
      if (error) reportError("bank", `Enregistrement du fichier : ${error.message}`, { context: { docId } });
    }
  } catch (e) {
    /* la banque est un plus : le cours reste ajouté quoi qu'il arrive (mais on note pourquoi, pour l'admin) */
    reportError("bank", `Banque : ${e instanceof Error ? e.message : String(e)}`, { context: { docId } });
  }
}

/** Supprime les fichiers conservés d'un cours (appelé quand l'étudiant supprime le cours). */
export async function removeFromBank(sb: SupabaseClient, userId: string, docId: string): Promise<void> {
  try {
    const folder = `${userId}/${docId}`;
    const { data } = await sb.storage.from(BUCKET).list(folder, { limit: 200 });
    const paths = (data ?? []).filter((x) => x.name).map((x) => `${folder}/${x.name}`);
    if (paths.length > 0) await sb.storage.from(BUCKET).remove(paths);
  } catch {
    /* sans importance : la suppression du compte efface de toute façon tout ce qui reste */
  }
}
