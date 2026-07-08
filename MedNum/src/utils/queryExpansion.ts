const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY   = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
const FAST_MODEL = 'llama-3.1-8b-instant';

// Dictionnaire abréviations/SMS fréquents (fallback sans LLM)
const ABBREVS: Record<string, string> = {
  'pq': 'pourquoi', 'pk': 'pourquoi', 'pr': 'pour', 'pcq': 'parce que',
  'dc': 'donc', 'ac': 'avec', 'ss': 'sans', 'tt': 'tout', 'tjs': 'toujours',
  'bcp': 'beaucoup', 'mtn': 'maintenant', 'ms': 'mais', 'svp': 's\'il vous plaît',
  'stp': 's\'il te plaît', 'qd': 'quand', 'ds': 'dans', 'vs': 'vous',
  'c': 'c\'est', 'ck': 'c\'est quoi', 'koi': 'quoi', 'ke': 'que',
  'jss': 'je suis', 'jsuis': 'je suis', 'jsp': 'je ne sais pas',
  'pb': 'problème', 'def': 'définition', 'dif': 'différence',
  'svt': 'sciences de la vie et de la terre', 'bio': 'biologie',
  'exo': 'exercice', 'exos': 'exercices', 'chap': 'chapitre',
  'unit': 'unité', 'partie': 'partie',
};

function applyAbbrevs(query: string): string {
  return query
    .split(/\s+/)
    .map(w => {
      const lower = w.toLowerCase().replace(/[?!.,;:]/g, '');
      return ABBREVS[lower] ?? w;
    })
    .join(' ');
}

// Mots qui indiquent que le LLM a répondu au lieu de corriger
const RESPONSE_STARTERS = /^(voici|bien sûr|certainement|d'accord|ok|oui|non|je |la |le |les |un |une |pour |dans |il |elle )/i;

// Réécriture LLM : corrige fautes + abréviations + SMS en français correct
export async function rewriteQuery(query: string): Promise<string> {
  const fallback = applyAbbrevs(query);

  // Pas de réécriture pour les questions très courtes
  if (query.trim().split(/\s+/).length <= 2) return fallback;

  // Pas d'abréviations détectées → pas besoin du LLM
  const hasAbbrev = query.split(/\s+/).some(w => ABBREVS[w.toLowerCase().replace(/[?!.,;:]/g, '')]);
  const hasTypo = /[a-z]{3,}/.test(query) && query !== query.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!hasAbbrev && !hasTypo) return fallback;

  if (!GROQ_KEY) return fallback;
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: FAST_MODEL,
        max_tokens: 60,
        temperature: 0.0,
        messages: [
          {
            role: 'system',
            content:
              'Corrige uniquement les fautes d\'orthographe et abréviations SMS. ' +
              'INTERDIT d\'ajouter du contenu ou de répondre. ' +
              'Exemple : "pk la svt cest quoi" → "pourquoi la SVT c\'est quoi". ' +
              'Retourne UNIQUEMENT la phrase corrigée, rien d\'autre.',
          },
          { role: 'user', content: query },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const corrected: string = data.choices?.[0]?.message?.content?.trim() || '';
    const cleaned = corrected.split('\n')[0].trim();

    // Gardes anti-hallucination :
    // 1. Trop long = le LLM a inventé du contenu
    // 2. Commence par un mot de réponse = le LLM a répondu au lieu de corriger
    if (!cleaned || cleaned.length > query.length * 2 || RESPONSE_STARTERS.test(cleaned)) {
      return fallback;
    }
    return cleaned;
  } catch {
    return fallback;
  }
}

// Step-back prompting : reformuler la question en version plus abstraite/générale
// Ex: "c'est quoi la photosynthèse" → "mécanismes de nutrition des plantes"
export async function stepBackQuery(query: string): Promise<string> {
  if (!GROQ_KEY) return query;
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: FAST_MODEL,
        max_tokens: 60,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'Reformule cette question scolaire en une formulation plus générale et abstraite (1 ligne, pas de ponctuation finale). ' +
              'Ex: "c\'est quoi la photosynthèse ?" → "mécanismes de production d\'énergie chez les plantes". ' +
              'Retourne UNIQUEMENT la reformulation abstraite.',
          },
          { role: 'user', content: query },
        ],
      }),
    });
    if (!res.ok) return query;
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content?.trim() || query;
    return text.split('\n')[0].trim() || query;
  } catch {
    return query;
  }
}

export async function expandQuery(query: string): Promise<string[]> {
  if (!GROQ_KEY) return [query];

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: FAST_MODEL,
        max_tokens: 200,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'Tu reformules une question scolaire en 2 versions alternatives courtes (une par ligne). ' +
              'Retourne UNIQUEMENT les 2 reformulations, sans numérotation, sans explication.',
          },
          { role: 'user', content: query },
        ],
      }),
    });

    if (!res.ok) return [query];
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content || '';
    const variants = text
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 4)
      .slice(0, 2);

    return [query, ...variants];
  } catch {
    return [query];
  }
}
