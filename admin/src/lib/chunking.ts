export type ChunkType = 'intro' | 'definition' | 'activity' | 'summary' | 'exercise' | 'content';

export type RichChunk = {
  title:      string;
  content:    string;
  chunkType:  ChunkType;
  index:      number;
  startPage?: number;
  endPage?:   number;
  wordCount:  number;
  images?:    string[];
};

const MAX_WORDS = 700;
const MIN_WORDS = 60;

const PAGE_RE  = /^\[PAGE:(\d+)\]$/;
const HEADER_RE = /^(unité|chapitre|partie|leçon|thème|séquence|module)\s*[\dIVXivx]/i;
const TOC_RE    = /(\s\d{1,3}\s*$|\.{3,}\s*\d{1,3}\s*$)/;
const BLOCK_RE  = /^(je\s+retiens|je\s+découvre|je\s+m.exerce|activité\s*\d|bilan|résumé)\s*:?\s*$/i;

function detectChunkType(title: string, firstLines: string): ChunkType {
  const t = (title + ' ' + firstLines).toLowerCase();
  if (/^(unité|chapitre|partie|module)\s*[\dIVX]/i.test(title.trim())) return 'intro';
  if (/je\s+retiens|à\s+retenir|bilan|en\s+résumé/i.test(t))           return 'summary';
  if (/je\s+découvre|activité|consigne|expérience/i.test(t))            return 'activity';
  if (/définition|définir|vocabulaire/i.test(t))                        return 'definition';
  if (/je\s+m.exerce|exercice|entraîne/i.test(t))                      return 'exercise';
  return 'content';
}

function subChunk(
  title: string,
  content: string,
  startPage?: number
): { content: string; startPage?: number }[] {
  const words = content.trim().split(/\s+/);
  if (words.length <= MAX_WORDS) return [{ content, startPage }];

  const paragraphs = content.split(/\n{2,}/).filter(p => p.trim().length > 0);
  const subs: { content: string; startPage?: number }[] = [];
  let current: string[] = [];

  for (const para of paragraphs) {
    const currentWords = current.join('\n\n').split(/\s+/).length;
    const paraWords    = para.trim().split(/\s+/).length;
    if (currentWords + paraWords > MAX_WORDS && current.length > 0) {
      const text = current.join('\n\n').trim();
      if (text.split(/\s+/).length >= MIN_WORDS) subs.push({ content: text, startPage });
      current = [para];
    } else {
      current.push(para);
    }
  }
  if (current.length > 0) {
    const text = current.join('\n\n').trim();
    if (text.split(/\s+/).length >= MIN_WORDS) subs.push({ content: text, startPage });
  }

  return subs.length > 0 ? subs : [{ content, startPage }];
}

export function splitIntoRichChunks(text: string): RichChunk[] {
  const lines       = text.split('\n');
  const result:    RichChunk[] = [];
  let currentTitle  = 'Introduction';
  let currentLines: string[] = [];
  let currentPage   = 1;
  let chunkStart    = 1;
  let lastPage      = 1;

  const flush = (endPage = lastPage) => {
    const content = currentLines.filter(l => l.trim()).join('\n').trim();
    if (content.split(/\s+/).length < MIN_WORDS) { currentLines = []; return; }

    const firstLines = currentLines.slice(0, 3).join(' ');
    const type       = detectChunkType(currentTitle, firstLines);
    const subs       = subChunk(currentTitle, content, chunkStart);

    subs.forEach(sub => {
      result.push({
        title:     currentTitle,
        content:   sub.content,
        chunkType: type,
        index:     result.length,
        startPage: sub.startPage,
        endPage,
        wordCount: sub.content.split(/\s+/).length,
      });
    });
    currentLines = [];
  };

  for (const line of lines) {
    const pageM = line.match(PAGE_RE);
    if (pageM) { currentPage = parseInt(pageM[1]); continue; }

    const t = line.trim();
    if (!t || TOC_RE.test(t)) continue;

    if (HEADER_RE.test(t)) {
      flush(currentPage > chunkStart ? currentPage - 1 : currentPage);
      currentTitle = t;
      chunkStart   = currentPage;
      lastPage     = currentPage;
    } else {
      if (BLOCK_RE.test(t)) {
        flush(currentPage);
        chunkStart = currentPage;
      }
      lastPage = currentPage;
      currentLines.push(line);
    }
  }
  flush();

  if (result.length <= 1) {
    const paras = text.split(/\n{2,}/).filter(p => p.trim().split(/\s+/).length >= MIN_WORDS);
    return paras.map((p, i) => ({
      title: `Partie ${i + 1}`, content: p.trim(),
      chunkType: 'content' as ChunkType,
      index: i, wordCount: p.trim().split(/\s+/).length,
    }));
  }

  return result;
}

const TYPE_LABELS: Record<ChunkType, string> = {
  intro:      'Introduction du chapitre',
  definition: 'Définitions et concepts clés',
  activity:   'Activité de découverte',
  summary:    'Points essentiels à retenir',
  exercise:   'Exercices pratiques',
  content:    'Contenu du cours',
};

export function formatForEmbedding(chunk: RichChunk, courseName: string): string {
  return [
    `[COURS: ${courseName}]`,
    `[CHAPITRE: ${chunk.title}]`,
    `[TYPE: ${TYPE_LABELS[chunk.chunkType]}]`,
    chunk.content,
  ].join('\n');
}
