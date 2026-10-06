import { supabase } from '../lib/supabase';
import type { CourseChunk } from '../store';
import { expandQuery, stepBackQuery } from './queryExpansion';

const NOMIC_URL   = 'https://api-atlas.nomic.ai/v1/embedding/text';
const NOMIC_MODEL = 'nomic-embed-text-v1.5';
const NOMIC_KEY   = process.env.EXPO_PUBLIC_NOMIC_API_KEY || '';

async function embedQuery(text: string): Promise<number[] | null> {
  if (!NOMIC_KEY) return null;
  try {
    const res = await fetch(NOMIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NOMIC_KEY}` },
      body: JSON.stringify({ model: NOMIC_MODEL, texts: [text], task_type: 'search_query' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embeddings?.[0] ?? null;
  } catch {
    return null;
  }
}

function tfidfRank(chunks: CourseChunk[], queryWords: string[]): CourseChunk[] {
  const dfMap = new Map<string, number>();
  chunks.forEach(c => {
    const words = new Set(c.content.toLowerCase().split(/\s+/));
    words.forEach(w => dfMap.set(w, (dfMap.get(w) || 0) + 1));
  });

  return chunks
    .map(c => {
      const words = c.content.toLowerCase().split(/\s+/);
      const len = words.length;
      let score = 0;
      for (const w of queryWords) {
        const tf = words.filter(x => x === w).length / (len || 1);
        score += tf * Math.log(chunks.length / (dfMap.get(w) || 1) + 1);
      }
      score += queryWords.filter(w => c.title.toLowerCase().includes(w)).length * 0.5;
      return { c, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.c);
}

const ROMAN: Record<string, string> = {'1':'i','2':'ii','3':'iii','4':'iv','5':'v','6':'vi','7':'vii','8':'viii','9':'ix'}
const ROMAN_TO_ARABIC: Record<string, string> = {'i':'1','ii':'2','iii':'3','iv':'4','v':'5','vi':'6','vii':'7','viii':'8','ix':'9'}
const ROMAN_RE = /^(i{1,3}v?|vi{0,3}|ix|x{1,3})$/

function findDirectChapterMatch(query: string, chunks: CourseChunk[]): CourseChunk[] {
  const qNorm = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // Arabic digit: "unité 2", "chapitre 3"
  const mArab = qNorm.match(/(?:unit[e]|chapitre|partie|chpitre)\s*(\d+)/)
  // Roman numeral: "unité ii", "chapitre IV"
  const mRoman = qNorm.match(/(?:unit[e]|chapitre|partie|chpitre)\s+(i{1,3}v?|vi{0,3}|ix|x{1,3})\b/)

  if (!mArab && !mRoman) return []

  let num: string, roman: string
  if (mArab) {
    num = mArab[1]; roman = ROMAN[num] || num
  } else {
    roman = mRoman![1]; num = ROMAN_TO_ARABIC[roman] || roman
  }

  const re = new RegExp(`(?:unit[eé]|chapitre|partie)\\s*(${num}|${roman})\\b`, 'i')
  return chunks.filter(c =>
    re.test(c.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  )
}

export async function hybridSearch(
  query: string,
  courseId: string,
  localChunks: CourseChunk[],
  topK = 5
): Promise<CourseChunk[]> {
  // Lookup direct : "exercices unité 2" → trouve immédiatement Unité II sans vector search
  const direct = findDirectChapterMatch(query, localChunks)

  // 1. Vector search via Supabase (primary — uses sub-chunks with embeddings)
  if (NOMIC_KEY) {
    // expandQuery + stepBackQuery en parallèle → zéro latence supplémentaire
    const [expansions, stepBack] = await Promise.all([expandQuery(query), stepBackQuery(query)]);
    const queries = [...new Set([...expansions, stepBack])];
    const seen = new Set<number>();
    const vectorChunks: CourseChunk[] = [];

    for (const q of queries) {
      const embedding = await embedQuery(q);
      if (!embedding) continue;
      try {
        const { data } = await supabase.rpc('match_chunks', {
          query_embedding: embedding,
          p_course_id:     courseId,
          match_count:     topK + 5,
          match_threshold: 0.35,
        });
        if (data && (data as any[]).length > 0) {
          for (const r of data as any[]) {
            if (!seen.has(r.chunk_index)) {
              seen.add(r.chunk_index);
              vectorChunks.push({
                title:     r.title,
                content:   r.content,
                index:     r.chunk_index,
                startPage: r.start_page  ?? undefined,
                endPage:   r.end_page    ?? undefined,
                images:    r.images      ?? [],
              });
            }
          }
        }
      } catch (e) {
        console.log('[hybridSearch] match_chunks:', e);
      }
    }

    if (vectorChunks.length > 0) {
      // Post-filter: keep only chunks where at least 1 original query word is in title/content
      // Keep Roman numerals (e.g. "ii") even if length ≤ 3
      const qWords = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/)
        .filter(w => w.length > 3 || ROMAN_RE.test(w));
      const relevant = qWords.length > 0
        ? vectorChunks.filter(c => {
            const hay = (c.title + ' ' + c.content).toLowerCase();
            return qWords.some(w => hay.includes(w));
          })
        : vectorChunks;
      const base = (relevant.length > 0 ? relevant : vectorChunks).slice(0, topK);
      // Injecter le chapitre direct en tête si non déjà présent
      if (direct.length > 0) {
        const merged = [...direct, ...base.filter(c => !direct.some(d => d.index === c.index))]
        return merged.slice(0, topK)
      }
      return base;
    }
    // Vector returned 0 → direct match ou TF-IDF fallback
    if (direct.length > 0) return direct.slice(0, topK)
  }

  // TF-IDF fallback (no Nomic key, or vector found nothing)
  if (direct.length > 0) return direct.slice(0, topK)
  const usable = localChunks.filter(c => c.content.trim().length >= 150);
  if (usable.length === 0) return localChunks.slice(0, topK);

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const ranked = tfidfRank(usable, queryWords);
  return (ranked.length > 0 ? ranked : usable).slice(0, topK);
}
