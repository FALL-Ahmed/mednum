import type { CourseChunk } from '../store';

// Vise ~10 chapitres, minimum 500 mots chacun.
// Pas de détection de titres — trop fragile pour les PDFs médicaux structurés.
export function autoChunk(text: string): CourseChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [{ title: 'Cours', content: text.trim() || '(vide)', index: 0 }];

  const TARGET = Math.max(1, Math.min(10, Math.floor(words.length / 500)));
  const SIZE   = Math.ceil(words.length / TARGET);

  const result: CourseChunk[] = [];
  for (let i = 0; i < words.length; i += SIZE) {
    const content = words.slice(i, i + SIZE).join(' ');
    result.push({ title: `Partie ${result.length + 1}`, content, index: result.length });
  }

  console.log('[autoChunk] words:', words.length, '| chunks:', result.length, '| min content:', Math.min(...result.map(c => c.content.length)));
  return result;
}
