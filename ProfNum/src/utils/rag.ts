import { Message, CourseChunk, useAppStore } from '../store';
import { splitIntoChunks, searchChunks, formatContext, Chunk } from './pdfExtractor';
import { hybridSearch } from './hybridSearch';
import { rewriteQuery } from './queryExpansion';
import { getProfessorName } from './subjectStyles';

// ─── Config LLM ───────────────────────────────────────────────────────────────
// La clé Anthropic n'est plus côté client — elle vit dans la Edge Function Supabase.

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const EDGE_ASK_URL      = `${SUPABASE_URL}/functions/v1/hyper-worker`;

const MISTRAL_KEY     = process.env.EXPO_PUBLIC_MISTRAL_API_KEY || '';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL   = 'open-mistral-nemo';

const GEMINI_KEY      = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY     = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
const GROQ_MODELS  = [
  'llama-3.3-70b-versatile',
  'llama-3.3-70b-specdec',
];

// Détection légère d'hallucination : vérifie que les mots clés de la réponse sont dans les chunks
function detectHallucination(response: string, chunksText: string): boolean {
  if (!chunksText || chunksText.trim().length < 50) return false;
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ');
  const STOP = new Set(['dans','avec','pour','plus','comme','mais','sont','cette','dont','leur','tout','bien','peut','quand','elle','elles','nous','vous','ils','tres','aussi','alors','meme']);
  const keywords = norm(response).split(/\s+/).filter(w => w.length >= 5 && !STOP.has(w));
  if (keywords.length < 8) return false;  // réponse trop courte pour juger
  const haystack = norm(chunksText);
  const found = keywords.filter(w => haystack.includes(w)).length;
  return found / keywords.length < 0.22;  // < 22% des mots clés dans les chunks → hallucination probable
}

// Compression heuristique : garde les phrases qui contiennent des mots de la query + leurs voisines
function compressChunk(text: string, queryWords: string[], maxSentences = 6): string {
  const sentences = text.split(/(?<=[.!?»])\s+/).filter(s => s.trim().length > 15);
  if (sentences.length <= maxSentences) return text;

  const scored = sentences.map((s, i) => {
    const sLow = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const score = queryWords.reduce((n, w) => n + (sLow.includes(w) ? 1 : 0), 0);
    return { i, score };
  });

  const topIdxs = new Set(
    scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.i)
  );
  // Include adjacent sentences for context
  const keep = new Set<number>();
  topIdxs.forEach(i => { keep.add(i); if (i > 0) keep.add(i - 1); if (i < sentences.length - 1) keep.add(i + 1); });

  if (keep.size === 0) return text; // aucun match → retourner le texte original
  return [...keep].sort((a, b) => a - b).map(i => sentences[i]).join(' ');
}

function cleanChunkText(text: string): string {
  return text
    .replace(/^\[PAGE:\d+\]\s*/gm, '')        // supprimer marqueurs [PAGE:N]
    .replace(/(\w)-\n(\w)/g, '$1$2')           // réunir mots coupés en fin de ligne
    .replace(/\n{3,}/g, '\n\n')                // max 2 sauts de ligne
    .replace(/[ \t]{2,}/g, ' ')               // espaces multiples → 1
    .replace(/^\s*\d+\s*$/gm, '')             // lignes qui ne sont qu'un chiffre (n° de page)
    .trim();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type NiveauType = 'facile' | 'moyen' | 'avance';
export type ModeType = 'exercice' | 'correction' | 'explication' | 'qr';

export type RAGResponse = {
  type: 'answer' | 'refusal' | 'error';
  content: string;
  sources: string[];
  images?: string[];
  suggestions?: string[];
  mode?: ModeType;
  hallucination?: boolean;  // true si la réponse semble inventée (pas dans les chunks)
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

// ─── Niveau automatique basé sur XP (pas sur la qualité d'écriture) ─────────

// difficultyScore 0-10 → niveau
// Algorithme 2-Up/1-Down (IRT) : seul le comportement sur exercices compte
export function computeNiveau(difficultyScore: number, frustrated = false): NiveauType {
  if (frustrated) return 'facile';
  if (difficultyScore >= 7) return 'avance';
  if (difficultyScore >= 4) return 'moyen';
  return 'facile';
}

// ─── Normalisation pour détection (gère fautes de frappe) ───────────────────
// Supprime accents, collapse doublons (exercicce→exercice), minuscule

function normalizeQ(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(.)\1+/g, '$1');  // "exercicces" → "exercices"
}

// ─── Détection du mode (porté de prof ia/agent.py) ───────────────────────────

export function detecterMode(question: string): ModeType {
  const q  = question.toLowerCase();
  const qn = normalizeQ(question);
  // exercice, exercices, exo, exos, exrc… + fautes de frappe via radical "exerc" / "exer"
  if (
    /\b(exercices?|exos?|quiz|questionnaire|entraîne|entraine|gene.*exerc|donne.*exo|prepare.*exam)\b/.test(q) ||
    /\bex[eo]?r[cs]/.test(qn)
  ) return 'exercice';
  if (/\b(corrige|correction|corriger|ma repon|est.ce correct|ai.je raison|c est juste|verifi)\b/.test(qn))
    return 'correction';
  if (/\b(explique|explication|comment fonctionne|c est quoi|qu est.ce|definis|definition|comment|pourquoi)\b/.test(qn))
    return 'explication';
  return 'qr';
}

// ─── Détection message purement conversationnel ──────────────────────────────
// Seulement pour les salutations/remerciements courts — PAS pour les questions sur le cours

export function estConversationnel(question: string): boolean {
  const q = question.toLowerCase().trim();
  const mots = q.split(/\s+/);
  if (mots.length > 6) return false;
  // "oui/non/ok" seuls ou suivis d'une ponctuation → conversationnel
  // "oui la photosynthèse" → PAS conversationnel (sujet après)
  if (/^(oui|non|ok|si)\s*[.!?]?\s*$/.test(q)) return true;
  const patterns = [
    /^(bonjour|salut|bonsoir|salam|hello|hi|hey)\b/,
    /^(merci|bravo|super|bien|parfait|compris|d accord|cool|génial)\b/,
    /^(au revoir|à bientôt|bye)\b/,
    /^(j ai compris|j ai pas compris|je comprends pas|je comprends)\b/,
    /\b(encore une fois|répète|redis|explique autrement)\b/,
  ];
  return patterns.some((p) => p.test(q));
}

// ─── Prompt système ───────────────────────────────────────────────────────────

function buildSystemPrompt(courseName: string, niveau: NiveauType, mode: ModeType, hasCourse: boolean, studentName?: string, hintLevel = 0, frustrated = false, activeChapterTitle?: string, subjectName?: string): string {
  const profName = getProfessorName(subjectName || courseName);
  const courseSection = hasCourse
    ? `Cours actif : "${courseName}"${activeChapterTitle ? `\nChapitre étudié en ce moment : "${activeChapterTitle}". Si l'élève pose une question vague ("explique", "résume", "c'est quoi"), réponds en priorité sur ce chapitre.` : ''}

RÈGLES D'OR — Tu es un professeur de ${subjectName || 'cette matière'} expert :
1. Des extraits du cours sont fournis dans le message entre [Extraits du cours "..."] et ---. Lis-les TOUS avant de répondre.
2. Si l'information est présente dans AU MOINS UN extrait, utilise-la pour répondre. Ne dis JAMAIS "ce n'est pas dans les extraits" si ça y est bien.
3. Si le message commence par [HORS_COURS] → dis clairement "Ce sujet n'est pas dans ton manuel." et ARRÊTE-TOI. Sinon, réponds toujours avec ce que les extraits contiennent.
4. Utilise toujours les définitions exactes du manuel (souvent dans "Je retiens").
5. IMPORTANT — Si le message contient un [Document joint par l'élève] (composition, devoir, fiche d'exercices) : c'est le TRAVAIL DE L'ÉLÈVE, pas du cours. Les questions de ce document ne doivent PAS figurer dans le manuel — c'est tout à fait normal. Ton rôle : utiliser les extraits du cours pour construire les RÉPONSES à ces questions. Tu guides l'élève pour qu'il réponde à sa composition grâce au cours. NE DEMANDE JAMAIS à l'élève d'envoyer d'autres extraits ou pages du cours — le manuel complet est déjà chargé dans le système. Commence à aider IMMÉDIATEMENT avec ce que tu as.
6. Ne cite jamais les extraits ("L'extrait 1 dit..."), parle naturellement.
7. Si la question porte sur un exercice, guide l'élève au lieu de donner la réponse brute.`
    : `Aucun cours chargé. Encourage l'élève à charger un cours PDF depuis l'onglet "Cours".`;

  return `Tu es ${profName}, un assistant pédagogique bienveillant pour les élèves de collège (12-13 ans).

${courseSection}

${frustrated ? `⚠️ L'ÉLÈVE EST FRUSTRÉ OU BLOQUÉ :
- Commence OBLIGATOIREMENT par : "Je comprends, c'est parfois difficile !"
- Utilise une ANALOGIE du quotidien (sport, jeux vidéo, cuisine...) pour expliquer autrement
- Sois ultra-chaleureux et encourageant, jamais condescendant
- Simplifie encore plus que le niveau demandé

` : ''}TA PERSONNALITÉ :
- Tu parles comme un vrai professeur : naturel, chaleureux, jamais robotique.
- L'élève s'appelle ${studentName ? `"${studentName}"` : 'un élève (prénom inconnu)'}. Utilise son prénom quand c'est naturel, JAMAIS un autre prénom.
- Pour les SVT, sois précis sur le vocabulaire (biotope, biocénose, etc.).
- Si l'élève dit "j'ai pas compris" → tu ré-expliques autrement, avec un exemple différent.
- Si l'élève demande les chapitres ou le programme → tu réponds à partir du cours.
- Tu ne refuses PAS les discussions normales — tu es là pour aider, pas pour bloquer.

FORMAT GÉNÉRAL :
- Commence DIRECTEMENT par la réponse — PAS de formule comme "Selon les extraits du cours"
- Phrases courtes, claires, adaptées à 12-13 ans
- Tout terme technique → explication entre parenthèses
- Maths : utilise les symboles Unicode (² ³ √ π × ÷ ≤ ≥ ≠ α β °) — JAMAIS de LaTeX ni de $...$
- À la fin de chaque réponse substantielle, ajoute EXACTEMENT cette ligne :
[SUGG: question courte 1 | question courte 2]

${mode === 'exercice' ? `FORMAT EXERCICE (mode actif) :
RÈGLE ABSOLUE : Présente les exercices DIRECTEMENT pour que l'élève puisse les faire MAINTENANT. Ne JAMAIS décrire des exercices ("il y a un exercice qui..."), les présenter.

Si les extraits contiennent des exercices du manuel → recopie-les tels quels, numérotés, prêts à répondre.
Sinon → crée 4 à 5 exercices variés basés sur le contenu des extraits, dans cet ordre :
1. Vrai ou Faux (2-3 affirmations)
2. QCM (1 question, 4 choix A/B/C/D)
3. Complète la phrase (1-2 phrases à trous, mots entre crochets)
4. Question ouverte courte (1 question de réflexion)

Termine toujours par : "Bonne chance ! Relis bien ton cours avant de commencer."
NE PAS donner les corrections — l'élève doit trouver seul.`
: mode === 'correction' ? `MÉTHODE SOCRATIQUE — CORRECTION (niveau indice : ${hintLevel}/3) :
${hintLevel === 0 ? `PREMIER ESSAI — Guide sans donner la réponse :
1. Valorise ce que l'élève a bien : "Bonne idée de penser à..."
2. Identifie le point exact d'erreur SANS le corriger
3. Pose UNE seule question courte qui guide vers la bonne réponse
   Ex : "Et si tu relis la définition de X dans ton cours ?"
INTERDIT : ne jamais donner la réponse directement.`
: hintLevel === 1 ? `DEUXIÈME ESSAI — Donne un indice vague :
1. Valorise l'effort : "Tu es sur la bonne voie..."
2. Donne UN indice vague : un mot-clé, une analogie, une piste SANS la réponse
   Ex : "Pense à ce que fait la chlorophylle dans la cellule..."
3. Pose une question encore plus simple pour guider.`
: hintLevel === 2 ? `TROISIÈME ESSAI — Indice concret :
1. Dis : "Voici un indice plus précis..."
2. Donne un EXEMPLE SIMILAIRE ou la définition partielle du cours
3. Demande : "Qu'est-ce que ça t'évoque ?"`
: `L'ÉLÈVE A VRAIMENT BESOIN DE LA RÉPONSE (4+ tentatives) :
1. Commence par : "Voilà la réponse complète :"
2. Explique clairement avec les termes exacts du cours
3. Termine par : "Pour retenir : ..." (conseil mnémotechnique simple)`}`
: `FORMAT EXPLICATION :
- Explications : termine par "En résumé : ..." (1 phrase)`}

NIVEAU : ${NIVEAUX[niveau]}

MÉTHODE INTERNE (invisible pour l'élève) :
Avant de formuler ta réponse, identifie mentalement :
• Quel(s) extrait(s) répondent directement à la question ?
• Quelle est la définition précise ou le mécanisme demandé ?
• Comment l'expliquer clairement à un élève de 12-13 ans ?
Commence DIRECTEMENT par la réponse — pas de préambule.`;
}

// ─── Détection question sur la structure ─────────────────────────────────────

function estQuestionStructure(q: string): boolean {
  const norm = q.toLowerCase();
  // "dans quel chapitre est X" → RAG, pas le plan
  if (/\b(dans\s+quel|quel\s+chapitre|quelle\s+partie|où\s+(est|se\s+trouve|parle))\b/.test(norm)) return false;
  // Demande explicite du plan/sommaire
  return /\b(chapitres|parties|plan|sommaire|programme|liste\s+(les|des)\s+chapitre|tous\s+les\s+chapitre)\b/.test(norm);
}

// ─── Construction des messages avec RAG ──────────────────────────────────────

function buildMessages(
  question: string,
  courseContent: string,
  courseName: string,
  mode: ModeType,
  niveau: NiveauType,
  previousMessages: Message[],
  courseChunks?: CourseChunk[],
  studentName?: string,
  preSelected?: CourseChunk[],
  hintLevel?: number,
  frustrated?: boolean,
  activeChapterTitle?: string,
  subjectName?: string
): { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; sources: string[]; images: string[] } {

  const hasCourse = courseContent.trim().length > 50;
  const systemPrompt = buildSystemPrompt(courseName, niveau, mode, hasCourse, studentName, hintLevel ?? 0, frustrated ?? false, activeChapterTitle, subjectName);
  const conv = estConversationnel(question);

  let userContent: string;
  let sources: string[] = [];

  const MAX_HISTORY = 4;

  let availableImages: string[] = [];

  if (conv || !hasCourse) {
    userContent = question;
  } else if (preSelected !== undefined && preSelected.length === 0) {
    // Vector search ran but found nothing above threshold → hors cours
    userContent =
      `[HORS_COURS] Le sujet "${question}" ne figure PAS dans les extraits du cours "${courseName}". ` +
      `Dis clairement à l'élève que ce sujet n'est pas dans son manuel. NE PAS inventer de réponse.`;
    sources = [];
  } else if (estQuestionStructure(question) && courseChunks && courseChunks.length > 0) {
    // Question sur la structure → donner le plan structuré
    const plan = courseChunks.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
    userContent =
      `[Plan structuré du cours "${courseName}" — ${courseChunks.length} sections]\n---\n${plan}\n---\n\n` +
      `Donne la liste complète et numérotée des chapitres/unités exactement comme indiqué ci-dessus. ` +
      `Question de l'élève : ${question}`;
  } else if (estQuestionStructure(question) && (!courseChunks || courseChunks.length === 0)) {
    // Pas de chunks → chercher les unités/chapitres dans le texte brut
    const lines = courseContent.split('\n').filter(l => l.trim().length > 3 && l.trim().length < 150);
    const headers = lines.filter(l =>
      /^(unité|chapitre|partie|leçon|thème)\s*[\dIVX]/i.test(l.trim()) ||
      (l.trim() === l.trim().toUpperCase() && l.trim().length > 5 && l.trim().length < 100)
    ).slice(0, 20);
    if (headers.length === 0) {
      // Aucune structure trouvée → refuser plutôt qu'halluciner
      userContent =
        `[HORS_COURS] Le cours "${courseName}" ne contient pas de structure de chapitres lisible. ` +
        `Dis à l'élève que tu ne peux pas encore lister les chapitres mais qu'il peut charger un PDF mieux structuré.`;
    } else {
      const plan = headers.map((h, i) => `${i + 1}. ${h.trim()}`).join('\n');
      userContent =
        `[Titres trouvés dans le cours "${courseName}"]\n---\n${plan}\n---\n\n` +
        `Liste les chapitres/unités trouvés ci-dessus. ` +
        `Question de l'élève : ${question}`;
    }
  } else {
    // Détecter si un document élève est joint (composition, devoir)
    const hasStudentDoc = question.includes('\n\n[Document joint') || question.includes('[Document de l\'élève');

    let toUse: Chunk[];

    if (preSelected && preSelected.length > 0) {
      let orderedChunks: CourseChunk[];
      if (hasStudentDoc) {
        // Pour un doc joint : trier par page croissante (intro/définitions en premier)
        // Le texte garblé empêche le keyword-reranking de fonctionner correctement
        orderedChunks = [...preSelected].sort((a, b) => (a.startPage ?? a.index) - (b.startPage ?? b.index));
      } else {
        // Re-sort: keyword overlap first (avoid "Lost in the Middle"), then by page order
        const qNorm2 = question.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const romanMap: Record<string, string> = {'1':'i','2':'ii','3':'iii','4':'iv','5':'v','6':'vi','7':'vii','8':'viii','9':'ix'}
        const reverseRoman: Record<string, string> = {'i':'1','ii':'2','iii':'3','iv':'4','v':'5','vi':'6','vii':'7','viii':'8','ix':'9'}
        const qBase2 = qNorm2.split(/\s+/).filter(w => w.length > 3 || /^\d+$/.test(w) || reverseRoman[w] !== undefined)
        const qWords2 = [
          ...qBase2,
          ...qBase2.flatMap(w => romanMap[w] ? [romanMap[w]] : []),
          ...qBase2.flatMap(w => reverseRoman[w] ? [reverseRoman[w]] : []),
        ]
        orderedChunks = preSelected
          .map(c => {
            const hay = (c.title + ' ' + c.content).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            const score = qWords2.reduce((n, w) => {
              const count = (hay.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
              return n + Math.min(count, 10)
            }, 0)
            return { c, score }
          })
          .sort((a, b) => b.score !== a.score ? b.score - a.score : (a.c.startPage ?? 0) - (b.c.startPage ?? 0))
          .map(x => x.c)
      }
      const wantsExercise = !hasStudentDoc && detecterMode(question) === 'exercice'
      toUse = orderedChunks.map(c => {
        const cleaned = cleanChunkText(c.content)
        const text = c.title + '\n' + (wantsExercise && cleaned.length > 1500
          ? cleaned.slice(-1500)
          : cleaned)
        return { text, page: c.index + 1, index: c.index }
      });
    } else {
      // Fallback: TF-IDF + title matching on local chunks
      let chunks: Chunk[];
      if (courseChunks && courseChunks.length > 0) {
        chunks = courseChunks
          .filter(c => c.content.trim().length >= 150)
          .map(c => ({
            text: c.title + '\n' + cleanChunkText(c.content),
            page: c.index + 1,
            index: c.index,
          }));
      } else {
        chunks = splitIntoChunks(courseContent);
      }

      const qNorm = question.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ');
      const qWords = qNorm.split(/\s+/).filter(w => w.length > 3);
      const titleScores = chunks
        .map(c => {
          const titleNorm = c.text.split('\n')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ');
          const score = qWords.filter(w => titleNorm.includes(w)).length;
          return { c, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.c);

      const relevant = searchChunks(chunks, question, 3);
      const merged = [...titleScores, ...relevant].filter(
        (c, i, arr) => arr.findIndex(x => x.index === c.index) === i
      );
      toUse = (merged.length > 0 ? merged.slice(0, 4) : chunks.slice(0, 3));
    }

    // Compression heuristique : ne garder que les phrases pertinentes de chaque chunk
    // Désactivé pour : exercices, docs joints (texte garblé → compressChunk inefficace)
    const skipCompress = hasStudentDoc || detecterMode(question) === 'exercice';
    const qWordsForCompress = question.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(w => w.length > 3);
    const compressed = skipCompress
      ? toUse
      : toUse.map(c => ({ ...c, text: compressChunk(c.text, qWordsForCompress) }));

    // Doc joint → 8000 chars (intro + autres chapitres rentrent) ; sinon 4000
    const maxCtx = hasStudentDoc ? 8000 : 4000;
    let context = formatContext(compressed);
    if (context.length > maxCtx) {
      context = context.slice(0, maxCtx) + '\n[...extrait tronqué]';
    }

    // preSelected = sub-chunks from Supabase (have their own startPage/endPage)
    // courseChunks = chapter-level from store (fallback)
    const refPool = preSelected ?? courseChunks ?? [];
    if (refPool.length > 0) {
      sources = [...new Set(toUse.map(c => {
        const orig = refPool.find(r => r.index === c.index);
        if (!orig?.startPage) return `p.${c.page}`;
        return orig.endPage && orig.endPage > orig.startPage
          ? `p.${orig.startPage}-${orig.endPage}`
          : `p.${orig.startPage}`;
      }))];
      for (const chunk of toUse) {
        const orig = refPool.find(r => r.index === chunk.index);
        if (orig?.images?.length) availableImages.push(...orig.images);
      }
    } else {
      sources = [...new Set(toUse.map(c => `p.${c.page}`))];
    }

    // Si un document de l'élève est joint, séparer la demande du document pour un meilleur cadrage
    const DOC_MARKER_BM = '\n\n[Document joint';
    const dmIdx = question.indexOf(DOC_MARKER_BM);
    const userDemande = dmIdx >= 0 ? question.slice(0, dmIdx).trim() : question;
    const userDoc = dmIdx >= 0 ? question.slice(dmIdx).trim() : '';

    if (userDoc) {
      userContent =
        `[Extraits du cours "${courseName}" — utilise ces extraits pour répondre aux questions du document ci-dessous]\n---\n${context}\n---\n\n` +
        `Demande de l'élève : ${userDemande}\n\n` +
        `[Document de l'élève — composition/devoir à traiter avec le cours]\n${userDoc.replace(/^\[Document joint[^\]]*\]/, '').trim()}`;
    } else {
      userContent =
        `[Extraits du cours "${courseName}" — lis-les attentivement]\n---\n${context}\n---\n\n` +
        `Question de l'élève : ${question}`;
    }
  }

  const history = previousMessages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.apiContent ?? m.content }));

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userContent },
    ],
    sources,
    images: availableImages,
  };
}

// ─── Appel Anthropic via Edge Function Supabase ──────────────────────────────
// La clé Anthropic reste côté serveur (variable d'env Supabase).
// Le client envoie userId pour le contrôle de quota.

async function callAnthropicViaEdge(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  maxTokens = 2048
): Promise<string> {
  const deviceId  = useAppStore.getState().deviceId;
  const systemMsg = messages.find(m => m.role === 'system')?.content;
  const chatMsgs  = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const res = await fetch(EDGE_ASK_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey':        SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      userId:    deviceId,
      system:    systemMsg,
      messages:  chatMsgs,
      maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as any;
    if (res.status === 429) throw new Error(err.message || 'Limite journalière atteinte. Réessaie demain !');
    throw new Error(`Edge Function ${res.status}: ${JSON.stringify(err)}`);
  }

  // Lecture du stream SSE — accumule les deltas texte jusqu'au signal done
  const reader  = res.body?.getReader();
  if (!reader) throw new Error('Pas de corps de réponse');
  const decoder = new TextDecoder();
  let text = '';
  let buf  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.t)    text += data.t;  // delta texte
        if (data.done) return text;     // fin du stream
      } catch { /* ligne SSE mal formée */ }
    }
  }
  return text;
}

// ─── Appel Mistral ────────────────────────────────────────────────────────────

async function callMistral(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const res = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_KEY}` },
    body: JSON.stringify({ model: MISTRAL_MODEL, max_tokens: 2048, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mistral ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Appel Gemini Vision (image + texte) ─────────────────────────────────────

async function callGeminiVision(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  mimeType = 'image/jpeg'
): Promise<string> {
  if (!GEMINI_KEY) throw new Error('Clé Gemini manquante — impossible d\'analyser l\'image.');
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: 'user',
      parts: [
        { text: userText },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };
  const res = await fetch(`${GEMINI_CHAT_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Vision ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── Appel Gemini ─────────────────────────────────────────────────────────────

async function callGemini(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs  = messages.filter(m => m.role !== 'system');
  const contents  = chatMsgs.map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const body: any = {
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

  const res = await fetch(`${GEMINI_CHAT_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── Appel Groq (fallback) ────────────────────────────────────────────────────

async function callGroq(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
): Promise<string> {
  let lastError = '';
  for (const model of GROQ_MODELS) {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({ model, max_tokens: 2048, messages }),
    });
    if (response.status === 429) { lastError = `Rate limit (${model})`; continue; }
    if (!response.ok) { const e = await response.text(); throw new Error(`Groq ${response.status}: ${e}`); }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
  throw new Error(`Toutes les IA sont saturées, réessaie dans une minute. (${lastError})`);
}

// ─── callAI : Edge Function → Mistral → Gemini → Groq ───────────────────────
// Anthropic est toujours le primaire via la Edge Function (clé côté serveur).
// Mistral/Gemini/Groq restent en fallback client-side si la Edge Function échoue.

async function callAI(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
): Promise<string> {
  try {
    return await callAnthropicViaEdge(messages);
  } catch (e: any) {
    console.warn('[RAG] Edge Function failed, fallback Mistral/Gemini/Groq:', e?.message);
  }
  if (MISTRAL_KEY) {
    try { return await callMistral(messages); } catch (e: any) {
      console.warn('[RAG] Mistral failed, fallback Gemini/Groq:', e?.message);
    }
  }
  if (GEMINI_KEY) {
    try { return await callGemini(messages); } catch {}
  }
  return await callGroq(messages);
}

// ─── Enrichissement de requête ────────────────────────────────────────────────
// 1. Pronoms vagues ("ça", "ce", "cela") → remplacer par le sujet de la question précédente
// 2. Commandes courtes sans sujet ("donne des exercices") → ajouter le sujet du dernier échange

function enrichQuery(question: string, history: Message[]): { display: string; search: string } {
  const PRONOUNS = /\b(ça|ca\b|ce\b|cela|ceci|lui\b|l'|y\b|en\b|cette|celui|celle)\b/i;
  const COMMANDS = /^(donne|montre|explique|résume|liste|génère|fais|crée|donne-moi|donnez|fais-moi)\b/i;
  // Mots vides devant un verbe : "Ok donne…", "Bon explique…", "Allez liste…"
  const FILLERS = /^(ok|okay|oui|non|bon|bien|allez|alors|hm|euh|ah)\s+/i;
  const stripped = question.trim().replace(FILLERS, '');
  const words = stripped.split(/\s+/);

  // Trouve le dernier message user qui est un vrai sujet (pas une commande courte sans topic)
  const isTopiclessCmd = (msg: string) => msg.trim().split(/\s+/).length <= 5 && COMMANDS.test(msg.trim());
  const lastSubstantive = [...history].reverse().find(
    m => m.role === 'user' && m.content.length > 8 && !isTopiclessCmd(m.content)
  );

  // Cas 1 : pronoms vagues
  if (PRONOUNS.test(question)) {
    if (!lastSubstantive) return { display: question, search: question };
    const topic = lastSubstantive.content.slice(0, 80);
    return { display: `${question} (sujet: ${topic})`, search: topic };
  }

  // Cas 2 : commande courte sans sujet nominal (≤ 5 mots, commence par un verbe d'action)
  if (words.length <= 5 && COMMANDS.test(stripped) && lastSubstantive) {
    const topic = lastSubstantive.content.slice(0, 80);
    const enriched = `${question} sur: ${topic}`;
    return { display: enriched, search: enriched };
  }

  return { display: question, search: question };
}

// ─── askRAG principal ─────────────────────────────────────────────────────────

export async function askRAG(
  question: string,
  courseContent: string,
  courseName: string,
  previousMessages: Message[],
  niveau: NiveauType = 'moyen',
  courseChunks?: CourseChunk[],
  studentName?: string,
  courseId?: string,
  hintLevel?: number,
  frustrated?: boolean,
  activeChapterTitle?: string,
  subjectName?: string
): Promise<RAGResponse> {
  try {
    // Séparer la partie utilisateur du [Document joint] éventuel
    // pour ne pas passer le texte du PDF à rewriteQuery / detecterMode / hybridSearch
    const DOC_MARKER = '\n\n[Document joint';
    const docIdx = question.indexOf(DOC_MARKER);
    const userPart = docIdx >= 0 ? question.slice(0, docIdx) : question;
    const docPart  = docIdx >= 0 ? question.slice(docIdx) : '';

    // Correction fautes/abréviations/SMS sur la partie utilisateur uniquement
    const cleanUserPart = estConversationnel(userPart) ? userPart : await rewriteQuery(userPart);
    if (cleanUserPart !== userPart) console.log('[RAG] ✏️ Query corrigée :', cleanUserPart);

    // Si le document joint contient des exercices/composition → mode correction (guide Socratique)
    const modeFromDoc = docPart ? detecterMode(docPart) : null;
    const mode = (modeFromDoc === 'exercice') ? 'correction' : detecterMode(cleanUserPart);

    // Si un document est joint : "ça/ca/ce" référence le document, pas l'historique
    // → skip enrichQuery pour éviter que "Aide moi a resoudre ca" remplace le sujet par "Salut cava"
    const { display: displayQuery, search: searchQuery } = docPart
      ? { display: cleanUserPart, search: cleanUserPart }
      : enrichQuery(cleanUserPart, previousMessages);
    // Réinjecter le document joint dans la question affichée au LLM
    const displayQueryFull = displayQuery + docPart;

    // Si un document est joint, chercher uniquement sur les mots-clés du document
    // (la question utilisateur "aide moi" est trop vague pour hybridSearch)
    let effectiveSearchQuery = searchQuery;
    if (docPart) {
      const docKeywords = docPart
        .replace(/\[Document joint[^\]]*\]/g, '')
        .replace(/---+/g, '')
        .replace(/EXERCICE|Réponse\s*:|_+|\d+\.\s*/g, ' ')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4 && !/^(dans|avec|pour|plus|comme|mais|sont|cette|dont|leur|tout|bien|peut|quand|elle|nous|vous|tres|aussi|alors|meme|voici|repondre|toutes|questions)$/.test(w))
        .slice(0, 12)
        .join(' ');
      if (docKeywords.trim()) {
        // Question vague (≤5 mots) → utiliser uniquement les mots-clés du doc
        const userIsVague = cleanUserPart.trim().split(/\s+/).length <= 5;
        effectiveSearchQuery = userIsVague ? docKeywords : cleanUserPart + ' ' + docKeywords;
        console.log('[RAG] ▶ Query enrichie PDF :', effectiveSearchQuery.slice(0, 120));
      }
    }

    let preSelected: CourseChunk[] | undefined;
    if (courseId && courseChunks && courseChunks.length > 0 && !estConversationnel(cleanUserPart) && !estQuestionStructure(cleanUserPart)) {
      preSelected = await hybridSearch(effectiveSearchQuery, courseId, courseChunks, 5);
    }

    const { messages, sources, images: availableImages } = buildMessages(
      displayQueryFull,
      courseContent,
      courseName,
      mode,
      niveau,
      previousMessages,
      courseChunks,
      studentName,
      preSelected,
      hintLevel,
      frustrated,
      activeChapterTitle,
      subjectName
    );

    console.log('[RAG] ▶ Question :', userPart);
    if (docPart) console.log('[RAG] ▶ Document joint :', docPart.slice(0, 80) + '…');
    if (searchQuery !== cleanUserPart) console.log('[RAG] ▶ Query enrichie (search) :', searchQuery);
    console.log('[RAG] Chunks sources :', sources);

    const text = await callAI(messages);
    console.log('[RAG] ◀ Réponse IA :', text);

    if (text.trim() === 'HORS_COURS' || text.includes('HORS_COURS')) {
      return { type: 'refusal', content: "Cette question ne semble pas faire partie de ton cours. Pose-moi une question sur le contenu de ton manuel !", sources: [], mode };
    }

    const suggMatch = text.match(/\[SUGG:\s*([^|]+)\|\s*([^\]]+)\]/);
    const suggestions = suggMatch ? [suggMatch[1].trim(), suggMatch[2].trim()] : [];
    const content = text.replace(/\[SUGG:[^\]]+\]/g, '').trim();

    // Détection hallucination : comparer la réponse aux chunks récupérés
    const chunksText = (preSelected ?? []).map(c => c.content).join(' ');
    const hallucination = sources.length > 0 ? detectHallucination(content, chunksText) : false;
    if (hallucination) console.warn('[RAG] ⚠️ Hallucination probable détectée');

    return { type: 'answer', content, sources, images: availableImages.length > 0 ? availableImages : undefined, suggestions, mode, hallucination };
  } catch (err: any) {
    return {
      type: 'error',
      content: `Erreur : ${err?.message ?? 'inconnue'}`,
      sources: [],
    };
  }
}

// ─── askWithImage : analyse photo exercice/cours via Gemini Vision ────────────

export async function askWithImage(
  question: string,
  imageBase64: string,
  niveau: NiveauType = 'moyen',
  studentName?: string
): Promise<RAGResponse> {
  try {
    const systemPrompt = `Tu es Prof Moctar, un assistant pédagogique bienveillant pour les élèves de collège (12-15 ans).
L'élève t'envoie une PHOTO d'un exercice de son professeur ou d'un extrait de cours.

TA MISSION SOCRATIQUE :
- Si c'est un EXERCICE : ne donne JAMAIS la réponse directement.
  1. Décris brièvement ce que tu vois (1-2 phrases)
  2. Identifie le concept ou la compétence testée
  3. Pose UNE question qui guide vers la première étape
  Si l'élève répond ensuite, continue à guider jusqu'à la solution complète.

- Si c'est un COURS ou une LEÇON : aide à comprendre.
  1. Identifie les notions importantes
  2. Explique simplement avec des analogies du quotidien
  3. Propose 1-2 questions pour vérifier la compréhension

TA PERSONNALITÉ :
- Chaleureux, encourageant, jamais condescendant
- L'élève s'appelle ${studentName ? `"${studentName}"` : 'un élève'}. Utilise son prénom naturellement.
- Phrases courtes, adaptées à 12-15 ans

FORMAT :
- Commence directement par ce que tu vois dans la photo
- À la fin, ajoute EXACTEMENT : [SUGG: question de suivi 1 | question de suivi 2]

NIVEAU : ${NIVEAUX[niveau]}`;

    const userText = question.trim()
      ? `L'élève a envoyé cette photo avec le message : "${question}"\n\nAnalyse la photo et aide-le.`
      : `L'élève a envoyé cette photo. Analyse-la et aide-le à comprendre ou résoudre ce qu'il voit.`;

    const text = await callGeminiVision(systemPrompt, userText, imageBase64);

    const suggMatch = text.match(/\[SUGG:\s*([^|]+)\|\s*([^\]]+)\]/);
    const suggestions = suggMatch ? [suggMatch[1].trim(), suggMatch[2].trim()] : [];
    const content = text.replace(/\[SUGG:[^\]]+\]/g, '').trim();

    return { type: 'answer', content, sources: [], suggestions };
  } catch (err: any) {
    return { type: 'error', content: `Erreur : ${err?.message ?? 'inconnue'}`, sources: [] };
  }
}

// ─── Fiche de révision par chapitre ──────────────────────────────────────────

function detectSubjectType(subjectName: string): 'sciences' | 'histoire' | 'lettres' | 'general' {
  const s = subjectName.toLowerCase();
  if (/math|physique|chimie|physic/.test(s))               return 'sciences';
  if (/histoire|géo|geographie|géographie|civique/.test(s)) return 'histoire';
  if (/français|arabe|anglais|lettre|langue/.test(s))       return 'lettres';
  return 'general';
}

export async function generateFiche(
  chunk: CourseChunk,
  subjectName: string,
  courseName: string
): Promise<string> {
  const type = detectSubjectType(subjectName);

  const specificSections =
    type === 'sciences' ? `
## 📐 FORMULES & LOIS
[Liste chaque formule/loi importante avec sa signification. Format : • **Nom** : formule → ce qu'elle dit]
[Si aucune formule, écris "Aucune formule dans ce chapitre"]

## 🔧 MÉTHODE DE RÉSOLUTION
[Étapes numérotées pour résoudre un exercice type de ce chapitre]
[Format : 1. Étape · 2. Étape · ...]`

    : type === 'histoire' ? `
## 📅 DATES & ÉVÉNEMENTS CLÉS
[Format : • **Année/Date** → Événement en 1 ligne]

## 👤 PERSONNAGES IMPORTANTS
[Format : • **Nom** → rôle/action en 1 ligne]`

    : type === 'lettres' ? `
## 📝 RÈGLES & NOTIONS GRAMMATICALES
[Les règles importantes du chapitre avec exemples]

## ✍️ EXEMPLES À RETENIR
[2-3 exemples concrets qui illustrent les notions clés]`

    : '';

  const prompt = `Tu es un excellent élève de terminale qui prépare sa composition. Tu dois créer une fiche de révision COMPLÈTE et DENSE pour le chapitre "${chunk.title}" (cours : ${courseName}, matière : ${subjectName}).

RÈGLES ABSOLUES :
- Utilise UNIQUEMENT le contenu du chapitre fourni
- Sois exhaustif sur les définitions et points clés — ne résume pas, LISTE TOUT
- Langage clair, direct, collégien mauritanien
- Chaque section commence OBLIGATOIREMENT par son titre ## suivi de l'emoji exact

STRUCTURE OBLIGATOIRE :

## 💡 IDÉE PRINCIPALE
[1-2 phrases qui résument l'essentiel du chapitre — ce qu'il faut comprendre avant tout]

## 📖 DÉFINITIONS CLÉS
[TOUS les termes techniques définis. Format : • **Terme** : définition précise en 1-2 lignes]
[Minimum 3 définitions, maximum illimité — sois exhaustif]
${specificSections}
## 🎯 À RETENIR ABSOLUMENT
[Les 4-6 points les plus importants du chapitre — ce qu'un bon élève ne peut pas oublier]
[Format : • point important]

## 🚨 CE QUI TOMBE EN COMPO
[Questions types qui reviennent souvent dans les examens mauritaniens sur ce chapitre]
[Format : • Question → approche de réponse en 1-2 lignes]
[MINIMUM 5 questions — couvre les différents aspects du chapitre]

## ⚠️ PIÈGE CLASSIQUE
[L'erreur que font presque tous les élèves sur ce chapitre + comment l'éviter]

---
Contenu du chapitre :
${chunk.content.slice(0, 6000)}`;

  const messages = [
    { role: 'user' as const, content: prompt },
  ];
  return await callAI(messages);
}

// ─── Génération de résumé ─────────────────────────────────────────────────────

export async function generateSummary(courseContent: string, courseName: string): Promise<string> {
  const context = courseContent.slice(0, 4000);
  const messages = [
    {
      role: 'system' as const,
      content: `Tu es Prof Moctar, un professeur passionné qui sait rendre les cours vivants pour des élèves de collège (12-15 ans).
Tu crées des résumés percutants, pas des listes plates. Chaque section doit vraiment aider l'élève à comprendre ET à retenir.
Ton langage : direct, précis, jamais condescendant. Tu utilises des analogies du quotidien quand c'est utile.`,
    },
    {
      role: 'user' as const,
      content: `Crée un résumé intelligent du chapitre "${courseName}" pour un élève de collège.

RESPECTE CE FORMAT EXACT — chaque titre commence par l'emoji indiqué :

🔑 L'idée essentielle
[1 phrase forte et mémorable — pas "ce chapitre parle de X" mais ce que X signifie vraiment ou pourquoi ça existe]

🗺️ Les concepts clés
[Pour chaque notion importante du chapitre, format : • **Terme** → explication simple en 1 ligne]
[3 à 5 concepts maximum]

⚠️ Le piège classique
[L'erreur que font presque tous les élèves sur ce chapitre + comment l'éviter en 1-2 phrases]

🧠 Pour ne jamais oublier
[1 analogie marquante, astuce mnémotechnique ou image mentale qui aide à retenir l'essentiel]

❓ Teste ta compréhension
[1 question ouverte qui teste la vraie compréhension, pas juste la mémorisation — avec un indice entre parenthèses]

Contenu du chapitre :
${context}`,
    },
  ];
  return await callAI(messages);
}

// ─── Transcription audio via Groq Whisper ────────────────────────────────────

export async function transcribeAudio(audioUri: string): Promise<string> {
  if (!GROQ_KEY) throw new Error('Clé Groq manquante — impossible de transcrire.');
  const formData = new FormData();
  formData.append('file', { uri: audioUri, type: 'audio/m4a', name: 'audio.m4a' } as any);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'fr');
  formData.append('response_format', 'text');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper ${res.status}: ${err.slice(0, 200)}`);
  }
  return (await res.text()).trim();
}

// ─── Extraction PDF via Gemini (OCR + texte natif) ───────────────────────────

export async function extractPDFWithGemini(
  fileUri: string
): Promise<{ text: string; pages: number }> {
  if (!GEMINI_KEY) throw new Error('Clé Gemini manquante');
  const FileSystem = require('expo-file-system/legacy');
  const base64: string = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
        {
          text:
            'Extrais intégralement le texte de ce cours scolaire : ' +
            'chapitres, sous-titres, définitions, exercices, tableaux. ' +
            'Conserve la structure. Retourne UNIQUEMENT le texte, sans commentaire.',
        },
      ],
    }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0 },
  };

  const res = await fetch(`${GEMINI_CHAT_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini PDF ${res.status}: ${err.slice(0, 150)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (text.length < 30) throw new Error('PDF illisible par Gemini');
  return { text, pages: Math.max(1, Math.ceil(text.split(/\s+/).length / 300)) };
}

// ─── Re-export pour rétrocompatibilité ───────────────────────────────────────
export async function extractPDFText(_uri: string): Promise<string> {
  return '';
}

// ─── Quiz : génération de questions ──────────────────────────────────────────

export type QuizQuestion = { question: string; hint: string };

export async function generateChapterQuiz(
  chapterContent: string,
  chapterTitle: string,
  niveau: NiveauType = 'moyen'
): Promise<QuizQuestion[]> {
  const difficulte = niveau === 'facile'
    ? 'questions courtes de définition ou citation ("Qu\'est-ce que...", "Citer deux...")'
    : niveau === 'avance'
      ? 'questions d\'analyse ou de comparaison ("Quelle est la différence entre...", "Pourquoi...")'
      : 'questions de composition de niveau collège ("Qu\'est-ce que...", "Quel est le rôle de...", "Citer...")';

  const prompt = `Tu es un professeur de collège. Génère 3 questions de contrôle écrit basées UNIQUEMENT sur le contenu ci-dessous.

RÈGLES :
- Chaque question porte sur UN FAIT PRÉCIS présent dans le texte (nom, définition, rôle, exemple)
- Style composition réelle : ${difficulte}
- Questions courtes et directes — maximum 15 mots par question
- INTERDIT : paraphraser le titre, demander "le concept principal", "l'importance dans le programme", "un exemple concret du sujet"
- Varie les angles à chaque génération : définitions, exemples cités, rôles, causes, conséquences, comparaisons, dates/chiffres du texte
- L'indice = un mot-clé ou une courte phrase du cours (ex: "Pense à la définition de l'écologie")

Chapitre : ${chapterTitle}
Contenu :
${chapterContent.slice(0, 4000)}

Réponds UNIQUEMENT avec le JSON, sans balise markdown, sans explication :
[
  {"question": "...", "hint": "..."},
  {"question": "...", "hint": "..."},
  {"question": "...", "hint": "..."}
]`;

  try {
    const text = (await callAnthropicViaEdge(
      [{ role: 'user', content: prompt }],
      700
    )).trim();
    console.log('[Quiz] generate raw:', text);

    // Extraction robuste : cherche le tableau [...] dans la réponse
    const arrMatch = text.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(arrMatch ? arrMatch[0] : text);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
  } catch (e) {
    console.warn('[Quiz] generateChapterQuiz error:', e);
  }

  // Fallback uniquement si l'API échoue complètement
  return [
    { question: `Qu'est-ce que ${chapterTitle} ?`, hint: 'Relis la première phrase du chapitre.' },
    { question: 'Cite deux éléments importants vus dans ce chapitre.', hint: 'Cherche les mots en gras ou soulignés.' },
    { question: 'Quel est le rôle principal décrit dans ce chapitre ?', hint: 'Cherche la partie "Je retiens" ou le résumé.' },
  ];
}

// ─── Quiz : correction d'une réponse ─────────────────────────────────────────

export type GradeResult = {
  score: 'CORRECT' | 'PARTIEL' | 'INCORRECT';
  feedback: string;
  points: number; // 10, 5, ou 2
};

export async function gradeQuizAnswer(
  question: string,
  studentAnswer: string,
  chapterContent: string
): Promise<GradeResult> {
  if (!studentAnswer.trim() || studentAnswer.trim().length < 5) {
    return { score: 'INCORRECT', feedback: 'Réponse vide ou trop courte.', points: 0 };
  }

  const prompt = `Tu es Prof Moctar. Corrige la réponse de cet élève de collège.

Question posée : ${question}
Extrait du cours (référence) :
${chapterContent.slice(0, 3000)}
Réponse de l'élève : ${studentAnswer}

Critères :
- CORRECT : réponse juste, même imparfaite ou avec fautes d'orthographe — l'idée est bonne
- PARTIEL : bonne direction mais manque un élément clé ou formulation imprécise
- INCORRECT : réponse fausse, hors sujet, ou incompréhensible

Feedback : 1 phrase courte, bienveillante. Si CORRECT → félicite. Si PARTIEL → dis ce qui manque. Si INCORRECT → donne l'idée juste.

Réponds UNIQUEMENT avec ce JSON, sans balise markdown, sans rien d'autre :
{"score": "CORRECT", "feedback": "..."}`;

  try {
    const text = (await callAnthropicViaEdge(
      [{ role: 'user', content: prompt }],
      220
    )).trim();
    console.log('[Quiz] grade raw:', text);

    // Extraction robuste : cherche le premier {...} dans la réponse
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    const s = (['CORRECT', 'PARTIEL', 'INCORRECT'].includes(parsed.score)
      ? parsed.score
      : 'PARTIEL') as 'CORRECT' | 'PARTIEL' | 'INCORRECT';
    return {
      score: s,
      feedback: parsed.feedback || '',
      points: s === 'CORRECT' ? 10 : s === 'PARTIEL' ? 5 : 2,
    };
  } catch (e) {
    console.warn('[Quiz] gradeQuizAnswer error:', e);
    return { score: 'PARTIEL', feedback: 'Correction indisponible.', points: 5 };
  }
}
