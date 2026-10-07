import { getSupabase } from "./supabase";

/* Lecture des scans et des photos de cours : chaque page est réduite en image JPEG puis lue par le serveur (fonction `ocr`). */

/** Nombre de pages maximum pour un seul document lu par photo ou scan. */
export const MAX_OCR_PAGES = 60;
const BATCH = 4; // pages envoyées par appel
const MAX_SIDE = 1600; // côté le plus long, en pixels
const QUALITY = 0.82;

export class OcrLimitError extends Error {
  constructor(public cap: number) {
    super("ocr_limit");
  }
}

export class TooManyPagesError extends Error {
  constructor(public pages: number) {
    super("too_many_pages");
  }
}

export const isImageFile = (f: File) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);

function toBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", QUALITY).split(",")[1] ?? "";
}

/** Réduit une photo (en respectant son orientation) et la transforme en JPEG. Le fond blanc évite les pages noires pour les PNG transparents. */
export async function imageToJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return toBase64(canvas);
}

/** Transforme chaque page d'un PDF en image JPEG, une page à la fois (la mémoire reste raisonnable). */
export async function* pdfPagesToJpeg(file: File, pages: number[]): AsyncGenerator<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  for (const n of pages) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, MAX_SIDE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    yield toBase64(canvas);
    page.cleanup();
  }
}

async function callOcr(images: string[]): Promise<string[]> {
  const sb = getSupabase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sb || !url || !anon) throw new Error("not_configured");
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not_authenticated");
  const res = await fetch(`${url}/functions/v1/ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ images: images.map((d) => ({ mime: "image/jpeg", data: d })) }),
  });
  if (res.status === 429) {
    const j = (await res.json().catch(() => ({}))) as { cap?: number };
    throw new OcrLimitError(j.cap ?? 0);
  }
  if (!res.ok) throw new Error("ocr_failed");
  const j = (await res.json()) as { texts: string[] };
  return j.texts;
}

/**
 * Lit une suite de pages (images JPEG en base64, fournies une à une) et assemble le texte avec des marqueurs [PAGE:n],
 * comme l'extraction d'un PDF normal. Un lot qui échoue deux fois est ignoré : les autres pages restent lues.
 */
export async function ocrPages(
  source: AsyncIterable<string>,
  total: number,
  onProgress: (done: number, total: number) => void,
): Promise<{ text: string; failed: number }> {
  const out: string[] = [];
  let failed = 0;
  let page = 0;
  let batch: string[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const first = page - batch.length + 1;
    let texts: string[] | null = null;
    for (let attempt = 0; attempt < 2 && !texts; attempt++) {
      try {
        texts = await callOcr(batch);
      } catch (e) {
        if (e instanceof OcrLimitError) throw e;
      }
    }
    if (!texts) failed += batch.length;
    else texts.forEach((t, i) => t.trim() && out.push(`[PAGE:${first + i}]\n${t.trim()}`));
    onProgress(page, total);
    batch = [];
  };

  for await (const img of source) {
    page++;
    batch.push(img);
    if (batch.length === BATCH) await flush();
  }
  await flush();
  return { text: out.join("\n\n"), failed };
}

/** Plusieurs photos : lues dans l'ordre choisi. */
export async function* photosToJpeg(files: File[]): AsyncGenerator<string> {
  for (const f of files) yield await imageToJpeg(f);
}
