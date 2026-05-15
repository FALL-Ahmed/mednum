const NOMIC_URL   = 'https://api-atlas.nomic.ai/v1/embedding/text';
const NOMIC_MODEL = 'nomic-embed-text-v1.5';
const API_KEY     = import.meta.env.VITE_NOMIC_API_KEY || '';

const MAX_CHARS = 7500; // nomic limit ~8192 tokens ≈ 7500 chars

export async function generateEmbeddings(
  texts: string[],
  taskType: 'search_document' | 'search_query' = 'search_document'
): Promise<number[][]> {
  if (!API_KEY) throw new Error('VITE_NOMIC_API_KEY manquante');
  const truncated = texts.map(t => t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) : t);
  const BATCH = 32;
  const all: number[][] = [];
  for (let i = 0; i < truncated.length; i += BATCH) {
    const batch = truncated.slice(i, i + BATCH);
    const res = await fetch(NOMIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: NOMIC_MODEL, texts: batch, task_type: taskType }),
    });
    if (!res.ok) throw new Error(`Nomic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    all.push(...data.embeddings);
  }
  return all;
}
