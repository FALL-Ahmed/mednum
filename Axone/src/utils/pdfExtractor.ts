/**
 * Extracteur PDF — React Native / Hermes.
 * Résout /Length indirect + validation endstream réel.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { unzlibSync, inflateSync } from 'fflate';

export type Chunk = { text: string; page: number; index: number };

// ─── Binaire ─────────────────────────────────────────────────────────────────

function uint8ToString(arr: Uint8Array): string {
  let s = '';
  const B = 4096;
  for (let i = 0; i < arr.length; i += B)
    s += String.fromCharCode(...arr.subarray(i, Math.min(i + B, arr.length)));
  return s;
}
function strToU8(s: string, len?: number): Uint8Array {
  const n = len ?? s.length;
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = s.charCodeAt(i) & 0xff;
  return a;
}

// ─── PNG Predictor ────────────────────────────────────────────────────────────

function unpredict(data: Uint8Array, predictor: number, columns: number): Uint8Array {
  if (predictor < 10) return data;
  const rl = columns + 1, nr = Math.floor(data.length / rl);
  const out = new Uint8Array(nr * columns);
  const prev = new Uint8Array(columns);
  let oi = 0;
  for (let r = 0; r < nr; r++) {
    const o = r * rl, f = data[o];
    for (let c = 0; c < columns && o + 1 + c < data.length; c++) {
      const raw = data[o + 1 + c], left = c > 0 ? out[oi - 1] : 0;
      let v = raw;
      if (f === 1) v = (raw + left) & 0xff;
      else if (f === 2) v = (raw + prev[c]) & 0xff;
      else if (f === 3) v = (raw + Math.floor((left + prev[c]) / 2)) & 0xff;
      out[oi++] = v; prev[c] = v;
    }
  }
  return out.slice(0, oi);
}

// ─── Décompression ───────────────────────────────────────────────────────────

function tryDecompress(bytes: Uint8Array): Uint8Array | null {
  try { return unzlibSync(bytes); } catch {}
  try { return inflateSync(bytes); } catch {}
  return null;
}

// ─── Trouver le VRAI endstream (suivi de endobj ou %%EOF) ────────────────────

function findRealEndstream(binary: string, from: number): number {
  let pos = from;
  while (pos < binary.length) {
    const idx = binary.indexOf('endstream', pos);
    if (idx === -1) return -1;
    // Vérifier que ce endstream est suivi de whitespace + endobj (ou fin de fichier)
    const after = binary.slice(idx + 9, idx + 40);
    if (/^[\r\n \t]*(endobj\b|%%EOF|\d+\s+\d+\s+obj\b)/.test(after) || idx + 9 >= binary.length - 10) {
      return idx;
    }
    pos = idx + 9;
  }
  return -1;
}

// ─── Résoudre /Length indirect (N G R) ───────────────────────────────────────

function resolveIndirectLength(binary: string, objNum: string, genNum: string): number {
  // Chercher "N G obj <nombre>" dans le binaire
  const rx = new RegExp(`\\b${objNum}\\s+${genNum}\\s+obj\\s+(\\d+)`, 'g');
  const m = rx.exec(binary);
  return m ? +m[1] : -1;
}

// ─── Itérateur de streams (robuste) ──────────────────────────────────────────

type StreamInfo = { header: string; data: string };

function* iterStreams(binary: string): Generator<StreamInfo> {
  let pos = 0;
  while (pos < binary.length) {
    const idx = binary.indexOf('stream', pos);
    if (idx === -1) break;

    // Vérifier que 'stream' est précédé de whitespace ou >
    const cb = idx > 0 ? binary[idx - 1] : '\n';
    if (!/[\s>]/.test(cb)) { pos = idx + 6; continue; }

    // Début du contenu (après stream\r\n ou stream\n)
    let cs = idx + 6;
    if (binary[cs] === '\r') cs++;
    if (binary[cs] === '\n') cs++;
    else { pos = idx + 6; continue; }

    const header = binary.slice(Math.max(0, idx - 1000), idx);

    // Ignorer images et metadata
    if (/\/Subtype\s*\/Image\b/i.test(header)) { pos = cs + 1; continue; }
    if (/\/Type\s*\/XRef\b/i.test(header)) { pos = cs + 1; continue; }
    if (/\/Type\s*\/Metadata\b/i.test(header)) { pos = cs + 1; continue; }

    // 1. Essayer /Length direct (pas une ref indirecte)
    let length = -1;
    const directM = header.match(/\/Length\s+(\d+)(?!\s+\d+\s*R)/);
    if (directM) {
      const l = +directM[1];
      if (l > 0 && cs + l <= binary.length) length = l;
    }

    // 2. Essayer /Length indirect (N G R) → résoudre dans le binaire
    if (length < 0) {
      const indirectM = header.match(/\/Length\s+(\d+)\s+(\d+)\s+R\b/);
      if (indirectM) {
        const l = resolveIndirectLength(binary, indirectM[1], indirectM[2]);
        if (l > 0 && cs + l <= binary.length) length = l;
      }
    }

    // 3. Fallback : chercher le VRAI endstream (suivi de endobj)
    if (length < 0) {
      const endIdx = findRealEndstream(binary, cs);
      if (endIdx === -1) { pos = cs + 1; continue; }
      let end = endIdx;
      if (end > 0 && binary[end - 1] === '\n') end--;
      if (end > 0 && binary[end - 1] === '\r') end--;
      length = end - cs;
    }

    if (length <= 0 || length > 30 * 1024 * 1024) { pos = cs + 1; continue; }

    yield { header, data: binary.slice(cs, cs + length) };
    pos = cs + length;
  }
}

// ─── Parse CMap (ToUnicode) ───────────────────────────────────────────────────

function parseCMapContent(content: string, map: Map<string, string>) {
  const bfcRx = /beginbfchar([\s\S]*?)endbfchar/g;
  let m: RegExpExecArray | null;
  while ((m = bfcRx.exec(content)) !== null) {
    const entRx = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let e: RegExpExecArray | null;
    while ((e = entRx.exec(m[1])) !== null) {
      const glyph = e[1].toLowerCase();
      const glyphTrim = glyph.replace(/^0+/, '') || '0';
      const uniHex = e[2];
      let decoded = '';
      for (let i = 0; i + 3 < uniHex.length; i += 4) {
        const cp = parseInt(uniHex.slice(i, i + 4), 16);
        if (cp > 0x1f) decoded += String.fromCharCode(cp);
      }
      if (!decoded) {
        const cp = parseInt(uniHex, 16);
        if (cp > 0x1f) decoded = String.fromCharCode(cp);
      }
      if (decoded) { map.set(glyph, decoded); map.set(glyphTrim, decoded); }
    }
  }
  const bfrRx = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfrRx.exec(content)) !== null) {
    const entRx = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let e: RegExpExecArray | null;
    while ((e = entRx.exec(m[1])) !== null) {
      const s = parseInt(e[1], 16), end = parseInt(e[2], 16), us = parseInt(e[3], 16);
      const pad = e[1].length;
      for (let i = s; i <= end; i++) {
        const glyph = i.toString(16).padStart(pad, '0');
        const uni = us + (i - s);
        if (uni > 0x1f) {
          map.set(glyph, String.fromCharCode(uni));
          map.set(glyph.replace(/^0+/, '') || '0', String.fromCharCode(uni));
        }
      }
    }
  }
}

// ─── Décompresser un stream ───────────────────────────────────────────────────

function decompressStream(data: string, header: string): string | null {
  const hasFlate = /\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode)/i.test(header);
  const hasOther = !hasFlate && /\/Filter\b/i.test(header);
  if (hasOther) return null;
  if (!hasFlate) return data;
  try {
    let pred = 1, cols = 1;
    const dp = header.match(/\/DecodeParms\s*<<([^>]*)>>/);
    if (dp) {
      const pm = dp[1].match(/\/Predictor\s+(\d+)/);
      const cm = dp[1].match(/\/Columns\s+(\d+)/);
      if (pm) pred = +pm[1];
      if (cm) cols = +cm[1];
    }
    const bytes = strToU8(data);
    const result = tryDecompress(bytes);
    if (!result) return null;
    let arr = result;
    if (pred >= 10) arr = unpredict(arr, pred, cols);
    return uint8ToString(arr);
  } catch { return null; }
}

// ─── Construire CMap ─────────────────────────────────────────────────────────

function buildCMap(binary: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const { header, data } of iterStreams(binary)) {
    const content = decompressStream(data, header);
    if (content && (content.includes('beginbfchar') || content.includes('beginbfrange'))) {
      parseCMapContent(content, map);
    }
  }
  return map;
}

// ─── Décodage hex avec CMap ───────────────────────────────────────────────────

function hexWithCMap(hex: string, cmap: Map<string, string>): string {
  const h = hex.replace(/\s/g, '').toLowerCase();
  if (!h) return '';
  if (h.length % 4 === 0) {
    let res = '';
    for (let i = 0; i < h.length; i += 4) {
      const g4 = h.slice(i, i + 4);
      const g2 = g4.replace(/^0+/, '') || '0';
      if (cmap.has(g4)) res += cmap.get(g4)!;
      else if (cmap.has(g2)) res += cmap.get(g2)!;
      else { const code = parseInt(g4, 16); if (code > 0x1f && code < 0xffff) res += String.fromCharCode(code); }
    }
    if (res.trim()) return res;
  }
  let res = '';
  for (let i = 0; i + 1 <= h.length; i += 2) {
    const g2 = h.slice(i, i + 2);
    const g1 = g2.replace(/^0+/, '') || '0';
    if (cmap.has(g2)) res += cmap.get(g2)!;
    else if (cmap.has(g1)) res += cmap.get(g1)!;
    else { const code = parseInt(g2, 16); if (code > 0x1f) res += String.fromCharCode(code); }
  }
  return res;
}

// ─── Décodage literal PDF ─────────────────────────────────────────────────────

function decodeLit(raw: string): string {
  return raw
    .replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/[^\x09\x20-\x7E\u00A0-\uFFFF]/g, '');
}

// ─── Extraction BT…ET ────────────────────────────────────────────────────────

function extractBTET(block: string, cmap: Map<string, string>): string {
  const parts: string[] = [];
  let m: RegExpExecArray | null;

  const tjRx = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*[Tj'"]\b/g;
  while ((m = tjRx.exec(block)) !== null) {
    const t = decodeLit(m[1]).trim();
    if (t) parts.push(t);
  }

  const hexTjRx = /<([0-9A-Fa-f\s]+)>\s*[Tj'"]\b/g;
  while ((m = hexTjRx.exec(block)) !== null) {
    const t = hexWithCMap(m[1], cmap).trim();
    if (t) parts.push(t);
  }

  const tjArrRx = /\[([^\]]*)\]\s*TJ\b/g;
  while ((m = tjArrRx.exec(block)) !== null) {
    const inner = m[1];
    let ms: RegExpExecArray | null;
    const litRx2 = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
    while ((ms = litRx2.exec(inner)) !== null) { const t = decodeLit(ms[1]).trim(); if (t) parts.push(t); }
    const hexRx2 = /<([0-9A-Fa-f\s]+)>/g;
    while ((ms = hexRx2.exec(inner)) !== null) { const t = hexWithCMap(ms[1], cmap).trim(); if (t) parts.push(t); }
  }

  return parts.join(' ');
}

function extractFromContent(content: string, cmap: Map<string, string>): string {
  if (!content.includes('BT')) return '';
  const texts: string[] = [];
  const btRx = /BT\b([\s\S]*?)\bET\b/g;
  let m: RegExpExecArray | null;
  while ((m = btRx.exec(content)) !== null) {
    const t = extractBTET(m[1], cmap).trim();
    if (t.length > 1) texts.push(t);
  }
  return texts.join('\n');
}

// ─── Extraction principale ────────────────────────────────────────────────────

function extractAllText(binary: string, cmap: Map<string, string>): string {
  const texts: string[] = [];
  for (const { header, data } of iterStreams(binary)) {
    const content = decompressStream(data, header);
    if (!content) continue;
    if (!content.includes('BT')) continue;
    const t = extractFromContent(content, cmap);
    if (t.trim().length > 1) texts.push(t.trim());
  }
  return texts.join('\n\n');
}

// ─── Réparer l'espacement lettre-par-lettre ───────────────────────────────────

function fixLetterSpacing(text: string): string {
  return text.split('\n').map(line => {
    const raw = line.trim();
    if (!raw) return line;
    // Séparer la ponctuation finale pour ne pas bloquer la détection
    const trailMatch = raw.match(/^(.*?)([.!?:;,]*)$/);
    const body   = trailMatch ? trailMatch[1] : raw;
    const trail  = trailMatch ? trailMatch[2] : '';

    const tokens = body.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) return line;

    // Tokens purement alphanumériques (sans ponctuation) pour le test
    const wordTokens = tokens.filter(t => /^[A-Za-zÀ-ÿ0-9]+$/.test(t));
    const avgLen = wordTokens.reduce((s, t) => s + t.length, 0) / (wordTokens.length || 1);
    const mostlyWords = wordTokens.length / tokens.length >= 0.85;

    if (avgLen < 2.2 && mostlyWords) {
      // Rendu lettre-par-lettre → fusionner les fragments courts en mots
      // Flush le buffer quand il dépasse 9 chars (mot complet) ET qu'un nouveau
      // token court arrive — sinon "caractères" + "d" + "u" → "caractèresdu"
      const merged: string[] = [];
      let buf = '';
      for (const tok of tokens) {
        // Court = ≤3 chars sans apostrophe, ou ≤4 avec apostrophe (ex: "u'es", "d'un")
        const isShort = /^[A-Za-zÀ-ÿ0-9']+$/.test(tok) &&
          (tok.length <= 3 || (tok.includes("'") && tok.length <= 4));
        if (isShort) {
          if (buf.length > 9) { merged.push(buf); buf = ''; }
          buf += tok;
        } else {
          if (buf) { merged.push(buf); buf = ''; }
          merged.push(tok);
        }
      }
      if (buf) merged.push(buf);
      return merged.join(' ') + trail;
    }

    // Sinon, fusionner seulement les séquences pures lettre-espace-lettre
    return line.replace(
      /(?<![A-Za-zÀ-ÿ\d])([A-Za-zÀ-ÿ] ){3,}[A-Za-zÀ-ÿ](?![A-Za-zÀ-ÿ\d])/g,
      m => m.replace(/ /g, '')
    );
  }).join('\n');
}

// ─── Fallback : extraction brute de littéraux lisibles ───────────────────────

function extractRawLiterals(binary: string): string {
  const parts: string[] = [];
  const litRx = /\(([a-zA-ZÀ-ÿ0-9 ,;:.!?'"()\-]{4,})\)/g;
  let m: RegExpExecArray | null;
  while ((m = litRx.exec(binary)) !== null) {
    const t = m[1].trim();
    if (/[a-zA-ZÀ-ÿ]{3,}/.test(t)) parts.push(t);
  }
  return parts.join(' ');
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

export async function estimatePDFPageCount(fileUri: string): Promise<number> {
  const base64 = await (FileSystem as any).readAsStringAsync(fileUri, { encoding: 'base64' });
  const binary = atob(base64);
  return (binary.match(/\/Type\s*\/Page[^s]/g) || []).length || 1;
}

export async function extractPDFText(fileUri: string): Promise<{ text: string; pages: number }> {
  const base64 = await (FileSystem as any).readAsStringAsync(fileUri, { encoding: 'base64' });
  const binary = atob(base64);

  const pages = (binary.match(/\/Type\s*\/Page[^s]/g) || []).length || 1;

  const cmap = buildCMap(binary);

  let text = extractAllText(binary, cmap);
  text = fixLetterSpacing(text);

  if (text.trim().length < 50) {
    const raw = extractRawLiterals(binary);
    if (raw.trim().length > text.trim().length) text = raw;
  }

  if (text.trim().length < 30) {
    throw new Error(
      `PDF non lisible (${pages}p, CMap:${cmap.size}).\n\n` +
      'Utilise "Coller le texte manuellement" ci-dessous.'
    );
  }
  return { text: text.trim(), pages };
}

// ─── Chunking ────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 350, CHUNK_OVERLAP = 50;

export function splitIntoChunks(fullText: string): Chunk[] {
  const words = fullText.trim().split(/\s+/).filter(Boolean);
  const chunks: Chunk[] = [];
  let start = 0, idx = 0;
  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    chunks.push({ text: words.slice(start, end).join(' '), page: Math.max(1, Math.floor((start / words.length) * 100) + 1), index: idx++ });
    if (end >= words.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// ─── TF-IDF search ───────────────────────────────────────────────────────────

const SW = new Set(['le','la','les','de','du','des','un','une','et','en','au','aux','est','sont','se','sa','son','ses','il','elle','ils','elles','je','tu','nous','vous','que','qui','quoi','dont','ou','mais','ce','cet','cette','ces','par','sur','sous','dans','avec','pour','sans','très','plus','bien','comme','aussi','même','tout','tous','être','avoir','faire','peut','doit','si','non','oui']);

function tok(text: string): string[] {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 2 && !SW.has(w));
}

export function searchChunks(chunks: Chunk[], question: string, topK = 4): Chunk[] {
  if (!chunks.length) return [];
  const qt = tok(question);
  if (!qt.length) return chunks.slice(0, topK);
  const N = chunks.length;
  const df = new Map<string, number>();
  for (const c of chunks) for (const t of new Set(tok(c.text))) df.set(t, (df.get(t) ?? 0) + 1);
  const scored = chunks.map(chunk => {
    const tokens = tok(chunk.text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const q of qt) { const f = tf.get(q) ?? 0; if (f > 0) score += (f / tokens.length) * Math.log((N + 1) / ((df.get(q) ?? 0) + 1)); }
    return { chunk, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const rel = scored.filter(s => s.score > 0).slice(0, topK);
  return rel.length ? rel.map(s => s.chunk).sort((a, b) => a.page - b.page) : [];
}

export function formatContext(chunks: Chunk[]): string {
  return chunks.map((c, i) => `[Extrait ${i + 1} — page ${c.page}]\n${c.text}`).join('\n\n');
}
