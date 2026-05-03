import { Message } from '../store';
import { splitIntoChunks, searchChunks, formatContext } from './pdfExtractor';

// ─── Config Groq ──────────────────────────────────────────────────────────────

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',   // primary — best quality
  'llama-3.1-8b-instant',      // fallback — higher rate limits
];

// Seuil de pertinence : si aucun chunk trouvé → hors cours
const SEUIL_PERTINENCE = true; // on utilise la présence/absence de chunks

// ─── Types ───────────────────────────────────────────────────────────────────

export type NiveauType = 'facile' | 'moyen' | 'avance';
export type ModeType = 'exercice' | 'correction' | 'explication' | 'qr';

export type RAGResponse = {
  type: 'answer' | 'refusal' | 'error';
  content: string;
  sources: string[];
  suggestions?: string[];
  mode?: ModeType;
};

export const NIVEAU_LABELS: Record<NiveauType, string> = {
  facile:  'Facile',
  moyen:   'Moyen',
  avance:  'Avancé',
};

// ─── Niveaux (porté de prof ia/config.py) ────────────────────────────────────

const NIVEAUX: Record<NiveauType, string> = {
  facile:  "L'élève est en difficulté : phrases très courtes, mots simples, analogies du quotidien.",
  moyen:   "Niveau normal de collège. Vocabulaire du cours en expliquant chaque terme technique.",
  avance:  "L'élève est fort : vocabulaire complet du cours, rigueur et précision scientifique.",
};

// ─── Détection du mode (porté de prof ia/agent.py) ───────────────────────────

export function detecterMode(question: string): ModeType {
  const q = question.toLowerCase();
  if (/\b(exercice|exo|quiz|questionnaire|entraîne|génère.*exerc|donne.*exo|prépare.*exam|entraine)\b/.test(q))
    return 'exercice';
  if (/\b(corrige|correction|corriger|ma réponse|ma reponse|est.ce correct|ai.je raison|c est juste|vérifi|verifi)\b/.test(q))
    return 'correction';
  if (/\b(explique|explication|comment fonctionne|c est quoi|qu est.ce|c'est quoi|définis|définition|comment|pourquoi)\b/.test(q))
    return 'explication';
  return 'qr';
}

// ─── Détection message purement conversationnel ──────────────────────────────
// Seulement pour les salutations/remerciements courts — PAS pour les questions sur le cours

export function estConversationnel(question: string): boolean {
  const q = question.toLowerCase().trim();
  const mots = q.split(/\s+/);
  // Seulement si très court ET clairement conversationnel
  if (mots.length > 8) return false;
  const patterns = [
    /^(bonjour|salut|bonsoir|salam|hello|hi|hey)\b/,
    /^(merci|bravo|super|bien|parfait|compris|ok|oui|non|d accord|cool|génial)\b/,
    /^(au revoir|à bientôt|bye)\b/,
    /^(j ai compris|j ai pas compris|je comprends pas|je comprends)\b/,
    /\b(encore une fois|répète|redis|explique autrement)\b/,
  ];
  return patterns.some((p) => p.test(q));
}

// ─── Prompt système ───────────────────────────────────────────────────────────

function buildSystemPrompt(courseName: string, niveau: NiveauType, mode: ModeType, hasCourse: boolean): string {
  const courseSection = hasCourse
    ? `Cours actif : "${courseName}"

RÈGLES ABSOLUES — tu es un assistant du cours, PAS un assistant général :
1. Des extraits du cours sont fournis dans le message entre [Extraits du cours "..."] et ---.
2. Tu réponds UNIQUEMENT à partir de ces extraits. Tu n'utilises JAMAIS tes connaissances générales pour compléter une réponse sur le programme.
3. Si le sujet posé n'apparaît PAS dans les extraits fournis → réponds : "Ce sujet ne semble pas être dans les extraits de ton cours. Consulte directement ton manuel ou repose la question différemment."
4. Si la question est clairement hors programme (sport, politique, jeux vidéo, météo…) → dis-le gentiment et recentre sur le cours.
5. Tu ne corriges JAMAIS les extraits du cours, même s'ils te semblent incomplets.`
    : `Aucun cours chargé. Encourage l'élève à charger un cours PDF depuis l'onglet "Cours".`;

  return `Tu es ProfNum, un assistant pédagogique bienveillant pour les élèves de collège (12-13 ans).

${courseSection}

TA PERSONNALITÉ :
- Tu parles comme un vrai professeur : naturel, chaleureux, jamais robotique.
- Tu tutoies l'élève, tu l'encourages, tu t'adaptes à son niveau.
- Tu peux discuter normalement : salutations, questions générales sur le cours, demandes de clarification.
- Si l'élève dit "j'ai pas compris" → tu ré-expliques autrement, avec un exemple différent.
- Si l'élève demande les chapitres ou le programme → tu réponds à partir du cours.
- Tu ne refuses PAS les discussions normales — tu es là pour aider, pas pour bloquer.

FORMAT :
- Commence DIRECTEMENT par la réponse — PAS de formule comme "Selon les extraits du cours" ou "D'après le cours"
- Tu parles naturellement, comme un professeur qui sait son cours par cœur
- Phrases courtes, claires, adaptées à 12-13 ans
- Tout terme technique → explication entre parenthèses
- Explications : termine par "En résumé : ..." (1 phrase)
- Exercices : termine par "Bonne chance ! Relis bien ton cours."
- Corrections : commence par valoriser ce qui est bien
- À la fin de chaque réponse substantielle, ajoute EXACTEMENT cette ligne (rien d'autre après) :
[SUGG: question courte 1 | question courte 2]
  (2 questions de suivi pertinentes, max 8 mots chacune, basées sur la réponse)

MODE : ${mode.toUpperCase()} | NIVEAU : ${NIVEAUX[niveau]}`;
}

// ─── Construction des messages avec RAG ──────────────────────────────────────

function buildMessages(
  question: string,
  courseContent: string,
  courseName: string,
  mode: ModeType,
  niveau: NiveauType,
  previousMessages: Message[]
): { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; sources: string[] } {

  const hasCourse = courseContent.trim().length > 50;
  const systemPrompt = buildSystemPrompt(courseName, niveau, mode, hasCourse);
  const conv = estConversationnel(question);

  let userContent: string;
  let sources: string[] = [];

  // Budget de tokens : ~4000 chars de contexte + historique court pour rester sous les limites free tier
  const MAX_CONTEXT_CHARS = 4000;
  const MAX_HISTORY = 4;

  if (conv || !hasCourse) {
    userContent = question;
  } else {
    const chunks = splitIntoChunks(courseContent);
    const relevant = searchChunks(chunks, question, 4);

    const topChunks = relevant.length > 0 ? relevant : chunks.slice(0, 4);
    const headChunks = chunks.slice(0, 2).filter(c => !topChunks.find(t => t.index === c.index));
    const toUse = [...headChunks, ...topChunks].slice(0, 5);

    // Tronquer le contexte si trop long
    let context = formatContext(toUse);
    if (context.length > MAX_CONTEXT_CHARS) {
      context = context.slice(0, MAX_CONTEXT_CHARS) + '\n[...extrait tronqué]';
    }

    sources = [...new Set(topChunks.map(c => `p.${c.page}`))];

    userContent =
      `[Extraits du cours "${courseName}" — lis-les attentivement]\n---\n${context}\n---\n\n` +
      `Question de l'élève : ${question}`;
  }

  const history = previousMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userContent },
    ],
    sources,
  };
}

// ─── Appel Groq ───────────────────────────────────────────────────────────────

async function callGroq(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
): Promise<string> {
  let lastError = '';
  for (const model of GROQ_MODELS) {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model, max_tokens: 2048, messages }),
    });

    if (response.status === 429) {
      lastError = `Rate limit (${model})`;
      continue; // try next model
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
  throw new Error(`Toutes les IA sont saturées, réessaie dans une minute. (${lastError})`);
}

// ─── askRAG principal ─────────────────────────────────────────────────────────

export async function askRAG(
  question: string,
  courseContent: string,
  courseName: string,
  previousMessages: Message[],
  niveau: NiveauType = 'moyen'
): Promise<RAGResponse> {
  try {
    const mode = detecterMode(question);
    const { messages, sources } = buildMessages(
      question,
      courseContent,
      courseName,
      mode,
      niveau,
      previousMessages
    );

    const text = await callGroq(messages);

    if (text.trim() === 'HORS_COURS' || text.includes('HORS_COURS')) {
      return { type: 'refusal', content: "Cette question ne semble pas faire partie de ton cours. Pose-moi une question sur le contenu de ton manuel !", sources: [], mode };
    }

    const suggMatch = text.match(/\[SUGG:\s*([^|]+)\|\s*([^\]]+)\]/);
    const suggestions = suggMatch ? [suggMatch[1].trim(), suggMatch[2].trim()] : [];
    const content = text.replace(/\[SUGG:[^\]]+\]/g, '').trim();

    return { type: 'answer', content, sources, suggestions, mode };
  } catch (err: any) {
    return {
      type: 'error',
      content: `Erreur : ${err?.message ?? 'inconnue'}`,
      sources: [],
    };
  }
}

// ─── Re-export pour rétrocompatibilité ───────────────────────────────────────
export async function extractPDFText(_uri: string): Promise<string> {
  return '';
}
