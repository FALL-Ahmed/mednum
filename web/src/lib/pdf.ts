import type { Chunk } from "./course";

export class UnreadablePdfError extends Error {
  constructor(public chars: number, public pages: number) {
    super("unreadable");
  }
}

/** Titre repéré dans le PDF (texte nettement plus gros que le corps), avec sa position dans le texte extrait. */
export type Heading = { title: string; level: 1 | 2; offset: number };

const FURNITURE = /\.indb|^\d+$|^section\b|^page\b|^\d+\s*[◄►▶◀]?$|^[IVX]+\.\d+$/i;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

type Piece = { str: string; h: number; x: number; y: number; w: number };

/**
 * Assemble des morceaux de texte d'une page. Deux morceaux collés sur la même ligne (ex. la lettre « É » en gros
 * suivie de « tape ») restent soudés ; on n'ajoute une espace que s'il y a un vrai écart.
 */
function isGlued(prev: Piece, it: Piece): boolean {
  const sameLine = Math.abs(prev.y - it.y) < Math.max(2, Math.max(prev.h, it.h) * 0.5);
  const gap = it.x - (prev.x + prev.w);
  return sameLine && gap < Math.max(prev.h, it.h) * 0.12 && !/\s$/.test(prev.str) && !/^\s/.test(it.str);
}

function joinPieces(items: Piece[]): string {
  let out = "";
  items.forEach((it, i) => {
    if (i > 0 && !isGlued(items[i - 1], it)) out += " ";
    out += it.str;
  });
  return norm(out);
}

/**
 * Extrait le texte d'un PDF dans le navigateur, page par page, avec des marqueurs [PAGE:n]
 * (même format que l'application). Repère aussi les vrais titres du document (taille de police).
 * Ne lit pas les PDF scannés (images).
 */
export async function extractPdf(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<{ text: string; pages: number; headings: Heading[] }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  type Item = { str: string; h: number; x: number; y: number; w: number };
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageItems: Item[][] = [];
  const sizeWeight = new Map<number, number>();

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const h = Math.round((it.height || Math.abs(it.transform?.[3] ?? 0)) * 2) / 2;
      items.push({ str: it.str, h, x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0, w: it.width ?? 0 });
      sizeWeight.set(h, (sizeWeight.get(h) ?? 0) + it.str.length);
    }
    pageItems.push(items);
    onProgress?.(i, pdf.numPages);
  }

  // Taille du corps de texte = la taille portant le plus de caractères.
  let body = 0;
  let best = -1;
  for (const [h, w] of sizeWeight) {
    if (w > best) {
      best = w;
      body = h;
    }
  }

  const parts: string[] = [];
  const found: { title: string; level: 1 | 2; offset: number }[] = [];
  let cursor = 0;

  pageItems.forEach((items, idx) => {
    const pageText = joinPieces(items);
    const marker = `[PAGE:${idx + 1}]\n`;
    if (pageText) {
      // Titres de la page : suites d'éléments nettement plus gros que le corps.
      let from = 0;
      let run: Item[] = [];
      const flush = () => {
        // Une pastille de numéro de chapitre (un chiffre seul, en gros) ne fait pas partie du titre.
        while (run.length > 1 && /^\d{1,2}$/.test(run[0].str.trim())) run.shift();
        if (run.length === 0) return;
        const title = joinPieces(run);
        const ratio = Math.max(...run.map((x) => x.h)) / (body || 1);
        run = [];
        if (title.length < 4 || title.length > 110 || FURNITURE.test(title)) return;
        const at = pageText.indexOf(title, from);
        if (at < 0) return;
        from = at + title.length;
        found.push({ title, level: ratio >= 1.7 ? 1 : 2, offset: cursor + marker.length + at });
      };
      for (const it of items) {
        if (body > 0 && it.h >= body * 1.3) {
          // Un changement net de taille = un autre titre (ex. titre de chapitre puis titre de section).
          if (run.length > 0 && Math.abs(it.h - run[run.length - 1].h) > 1.5 && !isGlued(run[run.length - 1], it)) flush();
          run.push(it);
        } else flush();
      }
      flush();

      const block = `${marker}${pageText}`;
      parts.push(block);
      cursor += block.length + 2; // "\n\n" entre les pages
    }
  });

  // Un titre qui revient sur plusieurs pages est un en-tête de page, pas un chapitre.
  const count = new Map<string, number>();
  for (const h of found) count.set(h.title, (count.get(h.title) ?? 0) + 1);
  const headings = found.filter((h) => (count.get(h.title) ?? 0) < 3);

  return { text: parts.join("\n\n"), pages: pdf.numPages, headings };
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Pages couvertes par un morceau de texte, d'après les marqueurs [PAGE:n]. */
function pageSpan(content: string, fallbackStart?: number): { startPage?: number; endPage?: number } {
  const nums = [...content.matchAll(/\[PAGE:(\d+)\]/g)].map((m) => Number(m[1]));
  if (nums.length === 0) return fallbackStart ? { startPage: fallbackStart, endPage: fallbackStart } : {};
  return { startPage: nums[0], endPage: nums[nums.length - 1] };
}

const pagesLabel = (c: { startPage?: number; endPage?: number }) =>
  c.startPage === undefined
    ? undefined
    : c.startPage === c.endPage
      ? `Page ${c.startPage}`
      : `Pages ${c.startPage}–${c.endPage}`;

/** Découpage de repli : tranches de taille égale, nommées par leurs pages. */
function evenChunks(text: string): Chunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [{ title: "Cours", content: text.trim() || "(vide)", index: 0 }];
  const target = Math.max(1, Math.min(10, Math.floor(words.length / 500)));
  const size = Math.ceil(words.length / target);
  const result: Chunk[] = [];
  for (let i = 0; i < words.length; i += size) {
    const content = words.slice(i, i + size).join(" ");
    const span = pageSpan(content);
    result.push({
      title: target === 1 ? "Cours complet" : (pagesLabel(span) ?? `Partie ${result.length + 1}`),
      content,
      index: result.length,
      ...span,
    });
  }
  return result;
}

const MIN_WORDS = 250;

/**
 * Découpe le cours selon ses vrais titres (chapitres) quand le PDF en a ; sinon en tranches égales nommées par pages.
 * Un chapitre trop court est rattaché au précédent pour ne pas produire de miettes.
 */
export function autoChunk(text: string, headings: Heading[] = []): Chunk[] {
  const usable = headings.filter((h) => h.offset >= 0 && h.offset < text.length).sort((a, b) => a.offset - b.offset);
  if (usable.length < 2) return evenChunks(text);

  // Bornes : début du texte, puis chaque titre
  const cuts = [{ offset: 0, title: "" }, ...usable.map((h) => ({ offset: h.offset, title: h.title }))];
  const raw = cuts.map((c, i) => ({
    title: c.title,
    content: text.slice(c.offset, i + 1 < cuts.length ? cuts[i + 1].offset : text.length).trim(),
  }));

  // Sommaire / table des matières : inutile pour les questions et les QCM, on ne le propose pas comme partie.
  const isToc = (t: string, c: string) =>
    /^(sommaire|table des mati[èe]res|liste des)/i.test(t) || (c.match(/\.{5,}/g) ?? []).length >= 8;
  const sections = raw.filter((r) => !isToc(r.title, r.content));
  if (sections.length === 0) return evenChunks(text);

  const merged: { title: string; content: string }[] = [];
  for (const sec of sections) {
    const last = merged[merged.length - 1];
    if (last && (wordCount(last.content) < MIN_WORDS || wordCount(sec.content) < MIN_WORDS / 2)) {
      // Un début trop court (page de garde...) prend le nom de la partie qui le suit.
      if (!last.title || wordCount(last.content) < MIN_WORDS) last.title = sec.title || last.title;
      last.content += `\n\n${sec.content}`;
    } else {
      merged.push({ ...sec });
    }
  }
  const chunks = merged.filter((m) => wordCount(m.content) > 0);
  if (chunks.length < 2) return evenChunks(text);

  return chunks.map((c, i) => {
    const span = pageSpan(c.content);
    const label = pagesLabel(span);
    const base = c.title.replace(/\s+/g, " ").trim();
    return {
      title: base ? (label ? `${base} (${label.toLowerCase()})` : base) : (label ?? `Partie ${i + 1}`),
      content: c.content,
      index: i,
      ...span,
    };
  });
}
