import { Message, CourseChunk, useAppStore } from '../store';
import { splitIntoChunks, searchChunks, formatContext, Chunk } from './pdfExtractor';
import { hybridSearch } from './hybridSearch';
import { rewriteQuery } from './queryExpansion';
import { getProfessorName } from './subjectStyles';

// ─── Config LLM ───────────────────────────────────────────────────────────────
// La clé Anthropic n'est plus côté client — elle vit dans la Edge Function Supabase.

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const EDGE_ASK_URL      = `${SUPABASE_URL}/functions/v1/ask`;

const MISTRAL_KEY     = process.env.EXPO_PUBLIC_MISTRAL_API_KEY || '';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL   = 'open-mistral-nemo';

const GEMINI_KEY      = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const ANTHROPIC_KEY     = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

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
  type: 'answer' | 'refusal' | 'error' | 'quota_exceeded';
  content: string;
  sources: string[];
  images?: string[];
  suggestions?: string[];
  mode?: ModeType;
  hallucination?: boolean;  // true si la réponse semble inventée (pas dans les chunks)
};

export type FiliereType = 'medecine' | 'pharmacie';

function filiereProfession(filiere: FiliereType): string {
  return filiere === 'pharmacie' ? 'pharmacie' : 'médecine';
}

// Concours de fin de cycle : nommé "Résidanat" uniquement en médecine (terme confirmé) —
// formulation générique en pharmacie pour ne pas inventer un intitulé local non vérifié.
function concoursLabel(filiere: FiliereType): string {
  return filiere === 'pharmacie' ? 'concours/examen de fin de cycle' : 'Résidanat';
}

// Style d'examen à viser pour les QCM/QR : le Résidanat n'est pertinent qu'en fin de cursus médecine.
function examStyleLabel(filiere: FiliereType, niveau: NiveauType): string {
  if (filiere === 'medecine' && niveau === 'avance') return 'concours de Résidanat mauritanien';
  return `examen de fin de module (niveau ${NIVEAU_LABELS[niveau]})`;
}

export const NIVEAU_LABELS: Record<NiveauType, string> = {
  facile:  'P1 – P2',
  moyen:   'P3 – P4',
  avance:  'P5 – Concours',
};

// ─── Niveaux (porté de prof ia/config.py) ────────────────────────────────────

const NIVEAUX: Record<NiveauType, string> = {
  facile:  "Étudiant P1-P2 (préclinique) : vocabulaire anatomique et physiologique de base. Éviter le jargon clinique sans définition. Analogies simples si nécessaire.",
  moyen:   "Étudiant P3-P4 (sémiologie et pathologies) : vocabulaire clinique standard, physiopathologie expliquée, liens cours → tableau clinique.",
  avance:  "Étudiant P5 ou préparation concours : rigueur de clinicien. Diagnostics différentiels systématiques. Liens épidémio–physiopatho–traitement–complications.",
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

function buildSystemPrompt(courseName: string, niveau: NiveauType, mode: ModeType, hasCourse: boolean, studentName?: string, hintLevel = 0, frustrated = false, activeChapterTitle?: string, _subjectName?: string, filiere: FiliereType = 'medecine'): string {
  const courseSection = hasCourse
    ? `Cours actif : "${courseName}"${activeChapterTitle ? `\nChapitre en cours : "${activeChapterTitle}". Si la question est vague ("explique", "résume"), réponds en priorité sur ce chapitre.` : ''}

RÈGLES D'OR :
1. Des extraits du cours sont fournis dans le message. Lis-les TOUS avant de répondre.
2. Si l'information est dans les extraits, utilise-la. Ne dis JAMAIS "ce n'est pas dans les extraits" si c'est bien présent.
3. Si le message commence par [HORS_COURS] → dis en une phrase que ce n'est pas dans son cours, puis réponds complètement avec tes connaissances médicales solides, sous la mention « Hors de ton cours : … ». Reste prudent : n'avance que des connaissances bien établies, n'invente aucun chiffre, posologie ou seuil, et invite à vérifier avec ses enseignants ou son manuel de référence.
4. Utilise les définitions exactes du cours — ne paraphrase pas les valeurs seuils ou posologies.
5. Si le message contient un [Document joint] (cas clinique, ECG, résultats biologiques) : c'est le travail de l'étudiant. Utilise les extraits du cours pour l'aider à répondre. Ne demande pas d'autres extraits.
6. Parle naturellement — pas de "L'extrait 1 dit..."
7. Pour les exercices et cas cliniques : guide plutôt que donner la réponse brute.`
    : `Aucun cours chargé. L'étudiant peut uploader un cours PDF depuis l'onglet "Cours". En attendant, réponds sur ta connaissance générale en médecine avec le disclaimer approprié.`;

  return `Tu es Dr. Ahmed, un senior en ${filiereProfession(filiere)} mauritanien et tuteur de révision pour étudiants de la FMPOS/UNAM Nouakchott.

${courseSection}

${frustrated ? `⚠️ L'ÉTUDIANT EST BLOQUÉ OU DÉCOURAGÉ :
- Commence par reconnaître : "C'est un point difficile, tu n'es pas seul à bloquer là-dessus."
- Utilise une analogie clinique ou du quotidien pour expliquer autrement.
- Sois encourageant mais rigoureux — pas de condescendance, pas de fausse douceur.

` : ''}CHARTE DE COMPORTEMENT :
- Tu parles comme un senior : direct, précis, bienveillant. Jamais robotique, jamais vague.
- L'étudiant s'appelle ${studentName ? `"${studentName}"` : 'un étudiant'}. Utilise son prénom naturellement, jamais un autre prénom.
- Messages courts (bonjour, merci, ok, 👍) → réponse brève et naturelle. Pas de présentation formelle.
- Termes médicaux complexes → définis entre parenthèses au premier usage si le contexte l'indique.
- "J'ai pas compris" → réexplique avec un autre angle ou une analogie.
- Questions hors ${filiereProfession(filiere)} → réponds poliment que tu es spécialisé en ${filiereProfession(filiere)} et recentre.

CE QUE TU NE FAIS JAMAIS :
- Inventer un chiffre (posologie, valeur seuil) absent du cours fourni.
- Répondre "peut-être", "environ", "il semblerait" sur des données médicales précises.
- Si incertain : "Je ne suis pas certain sur ce point — vérifiez dans votre cours ou manuel de référence."

FORMAT :
- Commence DIRECTEMENT par la réponse — pas de "Selon les extraits..."
- Phrases médicalement précises, niveau adapté à l'étudiant (${NIVEAUX[niveau]})
- Valeurs et formules : symboles Unicode (² ³ ≤ ≥ α β °) — jamais LaTeX
- Fin de chaque réponse substantielle : [SUGG: question courte 1 | question courte 2]

${mode === 'exercice' ? `MODE QCM — FORMAT ${examStyleLabel(filiere, niveau).toUpperCase()} (actif) :
Génère 3 QCM style ${examStyleLabel(filiere, niveau)} basés sur le cours :
- Question clinique ou mécanistique ancrée dans les extraits
- 5 propositions A / B / C / D / E — plausibles, non caricaturales
- UNE ou PLUSIEURS bonnes réponses possibles

Format obligatoire :
**Question X.** [énoncé]
A. [proposition]
B. [proposition]
C. [proposition]
D. [proposition]
E. [proposition]

NE révèle PAS les bonnes réponses. Termine par : "Réponds à chaque QCM, puis demande-moi la correction."`

: mode === 'correction' ? `MÉTHODE SOCRATIQUE — CORRECTION (indice : ${hintLevel}/3) :
${hintLevel === 0
  ? `PREMIER ESSAI — Guide sans donner la réponse :
1. Valorise ce qui est juste : "Bonne piste de penser à..."
2. Identifie le point d'erreur SANS le corriger directement
3. Pose UNE question courte qui guide : "Si tu relis la définition de X dans ton cours ?"`
  : hintLevel === 1
  ? `DEUXIÈME ESSAI — Indice vague :
1. "Tu es sur la bonne voie..."
2. Un mot-clé ou une analogie clinique, pas la réponse
3. Question encore plus guidée`
  : hintLevel === 2
  ? `TROISIÈME ESSAI — Indice concret :
1. "Voici un indice plus précis..."
2. Exemple similaire ou définition partielle du cours
3. "Qu'est-ce que ça t'évoque ?"`
  : `RÉPONSE COMPLÈTE (4+ tentatives) :
1. "Voilà la réponse complète :"
2. Explication avec termes exacts du cours
3. "Pour retenir : ..." (mnémotechnique ou règle clinique)`
}`

: `FORMAT EXPLICATION :
- Termine par "En résumé : ..." (1 phrase)`}

RAISONNEMENT INTERNE (ne pas afficher) :
Avant de répondre : quel extrait répond directement ? Définition exacte demandée ? Raisonnement terrain → mécanisme → signe → traitement → complication ?`;
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
  subjectName?: string,
  filiere: FiliereType = 'medecine'
): { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; sources: string[]; images: string[] } {

  const hasCourse = courseContent.trim().length > 50;
  const systemPrompt = buildSystemPrompt(courseName, niveau, mode, hasCourse, studentName, hintLevel ?? 0, frustrated ?? false, activeChapterTitle, subjectName, filiere);
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
      `Dis en une phrase que ce sujet n'est pas dans son cours, puis réponds quand même avec tes connaissances médicales solides (sous « Hors de ton cours : »). Prudence : connaissances établies uniquement, aucun chiffre inventé, invite à vérifier avec ses enseignants ou son manuel.`;
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

/** Limite journalière atteinte : ne doit PAS déclencher les fournisseurs de secours (ce serait un contournement). */
class QuotaExceededError extends Error {}

/** Type d'appel, pour les compteurs journaliers séparés côté serveur. */
type AIKind = 'chat' | 'qcm' | 'fiche' | 'flashcards' | 'case' | 'summary';

async function callAnthropicViaEdge(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  maxTokens = 2048,
  kind: AIKind = 'chat'
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
      kind,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as any;
    if (res.status === 429) throw new QuotaExceededError(err.message || 'Limite journalière atteinte. Réessaie demain !');
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
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  maxTokens?: number,
  kind: AIKind = 'chat'
): Promise<string> {
  try {
    return await callAnthropicViaEdge(messages, maxTokens, kind);
  } catch (e: any) {
    if (e instanceof QuotaExceededError) throw e;
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
  subjectName?: string,
  filiere: FiliereType = 'medecine'
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
      subjectName,
      filiere
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
    if (err instanceof QuotaExceededError) {
      return { type: 'quota_exceeded', content: err.message, sources: [] };
    }
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
  studentName?: string,
  filiere: FiliereType = 'medecine'
): Promise<RAGResponse> {
  try {
    const systemPrompt = `Tu es Dr. Ahmed, un senior en ${filiereProfession(filiere)} mauritanien et tuteur de la FMPOS/UNAM Nouakchott.
L'étudiant t'envoie une PHOTO — exercice, ECG, radio, résultats biologiques, ou extrait de cours médical.

TA MISSION :
- Si c'est un EXERCICE ou QCM : ne donne pas la réponse directement.
  1. Identifie ce qui est représenté (ECG, courbe, tableau de valeurs…)
  2. Identifie le concept médical testé
  3. Pose UNE question qui guide vers le raisonnement correct
  Continue à guider jusqu'à la conclusion si l'étudiant répond.

- Si c'est un COURS ou SCHÉMA : aide à comprendre.
  1. Identifie les éléments importants visibles
  2. Explique avec la rigueur médicale adaptée au niveau de l'étudiant
  3. Propose 1-2 questions de vérification

COMPORTEMENT :
- Direct, précis, bienveillant. Jamais condescendant.
- L'étudiant s'appelle ${studentName ? `"${studentName}"` : 'un étudiant'}. Utilise son prénom naturellement.
- Si tu vois une image non médicale : signale-le poliment et recentre.

FORMAT :
- Commence directement par l'analyse de l'image
- À la fin : [SUGG: question de suivi 1 | question de suivi 2]

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
  courseName: string,
  niveauEtudiant: string,
  filiere: FiliereType = 'medecine'
): Promise<string> {
  const prompt = `
Tu es Dr. Ahmed, senior en ${filiereProfession(filiere)} et tuteur de révision pour les étudiants de la FMPOS/UNAM Nouakchott, filière ${filiereProfession(filiere)}.

Ta mission n'est PAS de résumer un cours.
Ta mission est de transformer un cours long, parfois désordonné, en une fiche de révision exceptionnelle : dense, fiable, claire, directement utile pour réviser un partiel, un examen de module, un examen clinique ou le ${concoursLabel(filiere)}.

CONTEXTE ÉTUDIANT :
- Filière : ${filiereProfession(filiere)}
- Niveau de l'étudiant : ${niveauEtudiant}
- Cours : ${courseName}
- Chapitre : ${chunk.title}

ADAPTATION AU NIVEAU :
Si le niveau est P1 ou P2 :
- explique les bases anatomiques, physiologiques et les définitions importantes ;
- évite le jargon non expliqué ;
- privilégie la compréhension claire ;
- les QCM doivent tester les bases et les confusions simples.

Si le niveau est P3 ou P4 :
- fais le lien entre mécanisme, signes cliniques, examens et conduite à tenir ;
- introduis les diagnostics différentiels ;
- les QCM doivent tester le raisonnement clinique simple.

Si le niveau est P5 :
- sois plus synthétique et clinique ;
- insiste sur urgences, complications, conduite pratique, diagnostics différentiels ;
- les QCM doivent être plus piégeux et proches d'un examen de fin de cycle.

Si le niveau est Résidanat ou prépa Résidanat :
- aucun rappel inutile ;
- priorité aux valeurs seuils, tableaux, urgences, complications, exceptions, contre-indications, diagnostics différentiels ;
- les QCM doivent être exigeants, discriminants, avec des pièges crédibles.

RÈGLES ABSOLUES :
1. N'invente RIEN absent du cours fourni.
2. Les chiffres, seuils, durées, posologies, classifications et critères diagnostiques doivent être repris EXACTEMENT du cours.
3. Si une information n'est pas dans le cours, écris : [Non détaillé dans ce cours].
4. Si le cours est ambigu, incomplet ou mal extrait, signale-le sobrement au lieu de compléter avec tes connaissances générales.
5. Tu peux reformuler pour rendre clair, mais jamais ajouter une information médicale non présente.
6. La fiche doit être dense, pas bavarde.
7. Chaque ligne doit avoir une utilité de révision.
8. Ne donne jamais de conseil médical pour un vrai patient : c'est uniquement une fiche de révision.
9. Ne cite pas "selon mes connaissances". Tout doit venir du cours.

AUTO-DÉTECTION :
Déduis automatiquement la discipline dominante à partir du contenu :
Anatomie, Physiologie, Sémiologie, Cardiologie, Pneumologie, Infectiologie, Pharmacologie, Pédiatrie, Gynécologie, Chirurgie, Dermatologie, Neurologie, Médecine interne, Santé publique, Biologie, Biochimie, Hématologie, Immunologie, Parasitologie, Microbiologie, Pharmacie galénique, Chimie thérapeutique, Chimie analytique, Pharmacognosie, Toxicologie, Biopharmacie, Législation pharmaceutique, ou autre.

Si plusieurs disciplines sont présentes, choisis celle qui domine le chapitre.

STYLE ATTENDU :
- Style major de promo / senior qui prépare son ami.
- Français médical clair.
- Structure visuelle forte.
- Phrases courtes.
- Pas de blabla.
- Pas de paragraphes longs.
- Une fiche doit pouvoir être relue rapidement avant un examen.
- Utilise des flèches → pour les mécanismes.
- Utilise ⚠️ pour les confusions.
- Utilise ★ pour les points très importants.
- Utilise ✅ pour ce qu'il faut retenir.
- Utilise ❌ pour les erreurs fréquentes.

FORMAT OBLIGATOIRE :

FICHE DE RÉVISION — ${chunk.title}
Discipline : [discipline déduite automatiquement] · Niveau : ${niveauEtudiant} · Cours : ${courseName}

═══════════════════════════════════════
🎯 L'ESSENTIEL EN UNE PHRASE
═══════════════════════════════════════
[Une seule phrase puissante qui résume le cœur du chapitre.]

Pourquoi ce chapitre compte :
[2 phrases maximum : ce que l'étudiant doit comprendre pour réussir son examen.]

Fréquence probable en examen : [Élevée / Moyenne / Faible] — [justification en 5 mots max, basée uniquement sur l'importance apparente dans le cours]

═══════════════════════════════════════
I. DÉFINITION / RAPPEL INDISPENSABLE
═══════════════════════════════════════
- Définition :
- Contexte :
- À ne pas confondre avec :
- Terme(s) à connaître :

═══════════════════════════════════════
II. MÉCANISME / PHYSIOPATHOLOGIE
═══════════════════════════════════════
Présente le raisonnement sous forme de cascade logique :

1. Cause / point de départ →
2. Mécanisme →
3. Conséquence biologique ou anatomique →
4. Expression clinique →
5. Complication possible

Si le cours ne contient pas de mécanisme, écris [Non détaillé dans ce cours].

═══════════════════════════════════════
III. DIAGNOSTIC
═══════════════════════════════════════
Clinique :
- Signes fonctionnels :
- Signes physiques :
- Signes de gravité :

Paraclinique :
- Examens de première intention :
- Examens de confirmation :
- Valeurs / seuils / résultats attendus :

Diagnostics différentiels à éliminer :
-
-
-

═══════════════════════════════════════
IV. TRAITEMENT / CONDUITE À TENIR
═══════════════════════════════════════
Curatif :
-

Préventif :
-

Surveillance :
-

Urgence / conduite immédiate si mentionnée :
-

Contre-indications / précautions si mentionnées :
-

Ne jamais inventer de traitement absent du cours.

═══════════════════════════════════════
V. LES 3 QUESTIONS QUE LE PROF POURRAIT POSER
═══════════════════════════════════════
1. [Question probable d'examen]
   Réponse attendue : [réponse courte basée sur le cours]
   Pourquoi c'est important : [1 ligne]

2. [Question probable d'examen]
   Réponse attendue : [réponse courte basée sur le cours]
   Pourquoi c'est important : [1 ligne]

3. [Question probable d'examen]
   Réponse attendue : [réponse courte basée sur le cours]
   Pourquoi c'est important : [1 ligne]

═══════════════════════════════════════
VI. ⚠️ CONFUSIONS À ÉVITER
═══════════════════════════════════════
Présente uniquement les confusions réellement possibles à partir du cours.

Format attendu :

⚠️ Ne pas confondre :
- ...
- Pourquoi c'est une erreur :

⚠️ Attention :
- ...
- Ce qu'il faut retenir :

❌ Erreur fréquente :
- ...
- Correction :

★ Point très important :
- ...

Si le cours ne permet pas d'identifier de vraies confusions, écris :
[Confusions non détaillées dans ce cours].

═══════════════════════════════════════
VII. MINI-TABLEAU DE SYNTHÈSE
═══════════════════════════════════════
Crée un tableau court si le cours contient des comparaisons utiles.

Format :
| Élément | À retenir | Piège |
|---|---|---|
| ... | ... | ... |

Si aucun tableau pertinent n'est possible, écris [Aucun tableau pertinent à partir du cours fourni].

═══════════════════════════════════════
🧠 MINI-QCM DE RÉVISION
═══════════════════════════════════════
Génère exactement 5 QCM basés uniquement sur le cours fourni.

Règles :
- Format A/B/C/D/E.
- Une ou plusieurs bonnes réponses possibles.
- Les propositions doivent être crédibles.
- Pas de distracteurs ridicules.
- Les QCM doivent être adaptés au niveau ${niveauEtudiant}.
- Les QCM doivent tester la compréhension, les confusions et les points importants du cours.

QCM 1 :
[Question]
A. ...
B. ...
C. ...
D. ...
E. ...

QCM 2 :
...

QCM 3 :
...

QCM 4 :
...

QCM 5 :
...

══════════════════════
CORRECTION
══════════════════════
QCM 1 :
Réponse(s) correcte(s) :
Explication :
- A :
- B :
- C :
- D :
- E :

Répète le même format pour les 5 QCM.

═══════════════════════════════════════
✅ ULTRA-RÉSUMÉ FINAL
═══════════════════════════════════════
-
-
-
-
-

5 lignes maximum. Ce sont les lignes à relire 10 minutes avant l'examen.

CONTRÔLE QUALITÉ AVANT DE RÉPONDRE :
Avant de produire la fiche, vérifie silencieusement :
- Ai-je inventé une information absente du cours ? Si oui, supprime-la.
- Ai-je adapté le niveau à ${niveauEtudiant} ?
- La fiche est-elle dense et utile ?
- Les QCM sont-ils vraiment basés sur le cours ?
- Les confusions sont-elles réelles ou génériques ?
- Les chiffres viennent-ils exactement du cours ?
- La fiche aide-t-elle vraiment à réviser efficacement ?

Réponds uniquement avec la fiche finale.
Ne commente pas le prompt.
Ne dis pas que tu as suivi les consignes.

CONTENU DU COURS :
${chunk.content.slice(0, 150000)}
`;

  const messages = [
    { role: 'user' as const, content: prompt },
  ];
  return await callAI(messages, 8192, 'fiche');
}

// ─── Flashcards par document ──────────────────────────────────────────────────

export type FlashcardData = { front: string; back: string };

export async function generateFlashcards(
  content: string,
  courseName: string,
  niveauEtudiant: string,
  filiere: FiliereType = 'medecine'
): Promise<FlashcardData[]> {
  const prompt = `Tu es Dr. Ahmed, senior en ${filiereProfession(filiere)} et tuteur de révision pour les étudiants de la FMPOS/UNAM Nouakchott, filière ${filiereProfession(filiere)}.

Génère une série de flashcards de révision à partir du cours ci-dessous — recto/verso, format classique de mémorisation active (comme Anki).

CONTEXTE ÉTUDIANT :
- Niveau : ${niveauEtudiant}
- Cours : ${courseName}

RÈGLES ABSOLUES :
1. N'invente RIEN absent du cours fourni. Chiffres, seuils, définitions : exacts, tirés du cours.
2. Chaque carte teste UNE seule notion précise — jamais une question vague ("parle-moi de X").
3. Le recto (front) est court : une question, un terme à définir, ou un "complète la phrase". Jamais plus d'une phrase.
4. Le verso (back) est la réponse exacte, dense, sans blabla — 1 à 3 phrases maximum, ou une liste courte si pertinent.
5. Adapte la difficulté au niveau ${niveauEtudiant} : plus P1/P2 → bases et définitions ; plus P4/P5/Résidanat → pièges, valeurs seuils, diagnostics différentiels, associations à connaître.
6. Priorise ce qui est vraiment testable à l'examen : définitions clés, mécanismes, valeurs seuils, classifications, signes cliniques, traitements de première intention.
7. Génère entre 12 et 20 cartes selon la richesse du cours — ne remplis pas artificiellement avec des cartes redondantes.
8. Varie les formats : définition → terme, terme → définition, mécanisme cause → conséquence, "quelle est la valeur seuil de...", "cite les signes de...".

Réponds UNIQUEMENT avec le JSON valide, sans balise markdown, sans aucun texte avant ou après :
[
  {"front": "...", "back": "..."},
  {"front": "...", "back": "..."}
]

CONTENU DU COURS :
${content.slice(0, 150000)}
`;

  const text = (await callAI([{ role: 'user', content: prompt }], 8192, 'flashcards')).trim();

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (!arrMatch) throw new Error('Format invalide : pas de tableau JSON retourné.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrMatch[0]);
  } catch {
    throw new Error('JSON malformé : impossible de parser les flashcards.');
  }

  if (!Array.isArray(parsed)) throw new Error('Format invalide : pas un tableau.');

  const valid = (parsed as unknown[]).filter(
    (c): c is FlashcardData =>
      !!c && typeof c === 'object' &&
      typeof (c as any).front === 'string' && (c as any).front.trim().length > 0 &&
      typeof (c as any).back === 'string' && (c as any).back.trim().length > 0
  );

  if (valid.length === 0) throw new Error('Aucune flashcard valide générée.');
  return valid;
}

// ─── Cas clinique interactif ──────────────────────────────────────────────────
// Structure "illness script" (épidémiologie → physiopathologie → signes → examens →
// diagnostic) validée pédagogiquement pour l'enseignement du raisonnement clinique.
// Révélation progressive : l'étudiant réfléchit à chaque étape avant de voir la suite,
// jamais de correction punitive — juste la confrontation avec le raisonnement attendu.

export type ClinicalCaseStage = {
  label: string;   // ex: "Motif de consultation", "Interrogatoire", "Examen clinique", "Examens complémentaires"
  reveal: string;  // ce qui est découvert à cette étape
  prompt: string;  // la question qui invite l'étudiant à raisonner avant de continuer
};

export type ClinicalCaseData = {
  title: string;
  context: string;       // âge/sexe/contexte du patient fictif, 1-2 phrases
  stages: ClinicalCaseStage[];
  diagnosis: string;     // diagnostic attendu
  reasoning: string;     // raisonnement complet reliant motif → signes → diagnostic
  management: string;    // conduite à tenir / traitement, ancré dans le cours
};

function isValidClinicalCase(c: unknown): c is ClinicalCaseData {
  if (!c || typeof c !== 'object') return false;
  const cc = c as Partial<ClinicalCaseData>;
  if (
    typeof cc.title !== 'string' || typeof cc.diagnosis !== 'string' ||
    typeof cc.reasoning !== 'string' || !Array.isArray(cc.stages) || cc.stages.length === 0
  ) return false;
  return cc.stages.every(
    (s): s is ClinicalCaseStage =>
      !!s && typeof s.label === 'string' && typeof s.reveal === 'string' && typeof s.prompt === 'string'
  );
}

export async function generateClinicalCases(
  content: string,
  courseName: string,
  niveauEtudiant: string,
  filiere: FiliereType = 'medecine'
): Promise<ClinicalCaseData[]> {
  const prompt = `Tu es Dr. Ahmed, senior en ${filiereProfession(filiere)} et tuteur de révision pour les étudiants de la FMPOS/UNAM Nouakchott, filière ${filiereProfession(filiere)}.

Construis un ou plusieurs cas cliniques interactifs à partir du cours ci-dessous, pour un étudiant de niveau ${niveauEtudiant}.

COMBIEN DE CAS GÉNÉRER — décide toi-même selon la richesse RÉELLE du cours :
- Identifie combien de pathologies/thèmes cliniques VRAIMENT distincts sont traités avec assez de
  profondeur dans le cours pour construire un cas cohérent chacun (mécanisme + signes + examens +
  conduite à tenir identifiables).
- Un cours pauvre ou centré sur UNE seule pathologie → génère 1 seul cas. Ne remplis JAMAIS
  artificiellement avec des cas redondants ou superficiels juste pour en avoir plusieurs.
- Un cours riche couvrant plusieurs pathologies distinctes → génère un cas par pathologie/thème,
  jusqu'à 6 maximum (au-delà, la qualité et la cohérence de chaque cas se dégradent — mieux vaut
  moins de cas mais irréprochables que beaucoup de cas approximatifs).

PRIORITÉ ABSOLUE : LA COHÉRENCE MÉDICALE, POUR CHAQUE CAS.
Ces cas seront lus par des étudiants en médecine qui repéreront immédiatement la moindre incohérence
(un signe qui ne colle pas avec le diagnostic, une valeur de labo irréaliste, un examen qui ne
correspond pas à la pathologie) — et une seule erreur détruit la crédibilité de tout l'exercice.
Contrairement à la fiche de révision, ce n'est PAS un exercice de restitution stricte du cours :
c'est un exercice de raisonnement clinique. Chaque cas doit donc être un tableau clinique RÉEL et
cohérent de bout en bout, quitte à compléter avec tes connaissances médicales générales fiables
là où le cours est silencieux (valeurs de labo précises, détails d'examen standard, etc.) — mais
jamais au prix d'une incohérence.

RÈGLES (pour CHAQUE cas généré) :
1. La pathologie/le mécanisme CENTRAL du cas doit être celui enseigné dans le cours fourni — ne change pas de maladie. Si plusieurs cas, chacun illustre une pathologie DIFFÉRENTE du cours (pas de doublon).
2. Pour les détails nécessaires à la cohérence du tableau (valeurs biologiques exactes, signes d'examen standard, éléments d'interrogatoire habituels) que le cours ne précise pas explicitement, tu PEUX t'appuyer sur tes connaissances médicales générales établies — à condition qu'elles soient rigoureusement exactes et cohérentes avec le mécanisme du cours. Ne contredis jamais ce que le cours affirme explicitement.
3. Chaque étape doit logiquement découler de la précédente et pointer vers le même diagnostic final — aucune contradiction entre le motif, l'interrogatoire, l'examen, les examens complémentaires et le diagnostic. Relis mentalement l'ensemble avant de répondre : est-ce qu'un vrai clinicien y croirait ?
4. La section "Examens complémentaires" doit confirmer sans ambiguïté le diagnostic visé, mais reste QUALITATIVE de préférence (ex: "CPK très élevées", "hyperkaliémie modérée", "absence d'hématies au sédiment") plutôt que d'inventer un chiffre précis (ex: "CPK à 15 230 UI/L") — un chiffre exact que tu inventes a un vrai risque d'être médicalement faux, ce qu'une description qualitative n'a pas. N'utilise un chiffre précis QUE s'il s'agit d'une valeur seuil universellement connue et stable (ex: température ≥ 38°C = fièvre) — jamais un résultat de labo inventé pour l'occasion.
5. Structure en révélation progressive (méthode "illness script") : le motif de consultation d'abord, puis l'interrogatoire, puis l'examen clinique, puis les examens complémentaires — chaque étape révèle un peu plus, jamais tout d'un coup.
6. Chaque étape se termine par une question qui invite l'étudiant à raisonner (hypothèses, signes à chercher, examens à demander) AVANT de voir la suite — jamais une question fermée oui/non.
7. Adapte la difficulté au niveau ${niveauEtudiant} : niveau intermédiaire → présentation typique, signes francs ; niveau avancé/Résidanat → présentation plus subtile, pièges diagnostiques, diagnostics différentiels à écarter.
8. Le raisonnement final doit expliquer clairement le fil qui relie motif → signes → examens → diagnostic.
9. La conduite à tenir doit être médicalement standard pour ce diagnostic, cohérente avec le mécanisme du cours — précise, pas vague, même si le cours ne détaille pas exhaustivement le traitement.
10. Chaque cas a exactement 4 étapes : "Motif de consultation", "Interrogatoire", "Examen clinique", "Examens complémentaires".

Réponds UNIQUEMENT avec un TABLEAU JSON valide (même s'il n'y a qu'un seul cas), sans balise markdown, sans aucun texte avant ou après :
[
  {
    "title": "...",
    "context": "...",
    "stages": [
      {"label": "Motif de consultation", "reveal": "...", "prompt": "..."},
      {"label": "Interrogatoire", "reveal": "...", "prompt": "..."},
      {"label": "Examen clinique", "reveal": "...", "prompt": "..."},
      {"label": "Examens complémentaires", "reveal": "...", "prompt": "..."}
    ],
    "diagnosis": "...",
    "reasoning": "...",
    "management": "..."
  }
]

CONTENU DU COURS :
${content.slice(0, 150000)}
`;

  const text = (await callAI([{ role: 'user', content: prompt }], 8192, 'case')).trim();

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (!arrMatch) throw new Error('Format invalide : pas de tableau JSON retourné.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrMatch[0]);
  } catch {
    throw new Error('JSON malformé : impossible de parser les cas cliniques.');
  }

  if (!Array.isArray(parsed)) throw new Error('Format invalide : pas un tableau.');

  const validCases = (parsed as unknown[])
    .filter(isValidClinicalCase)
    .map((c) => ({
      title: c.title,
      context: c.context ?? '',
      stages: c.stages,
      diagnosis: c.diagnosis,
      reasoning: c.reasoning,
      management: c.management ?? '',
    }));

  if (validCases.length === 0) throw new Error('Aucun cas clinique valide généré.');
  return validCases;
}

// ─── Génération de résumé ─────────────────────────────────────────────────────

export async function generateSummary(courseContent: string, courseName: string, filiere: FiliereType = 'medecine'): Promise<string> {
  const context = courseContent.slice(0, 4000);
  const messages = [
    {
      role: 'system' as const,
      content: `Tu es Dr. Ahmed, un senior en ${filiereProfession(filiere)} mauritanien et tuteur de révision.
Tu crées des résumés percutants pour des étudiants de la FMPOS/UNAM Nouakchott, filière ${filiereProfession(filiere)}.
Ton langage : direct, précis, rigoureux, jamais condescendant. Tu utilises des analogies cliniques quand c'est utile.`,
    },
    {
      role: 'user' as const,
      content: `Crée un résumé percutant du chapitre "${courseName}" pour un étudiant de la FMPOS Nouakchott, filière ${filiereProfession(filiere)}.

FORMAT OBLIGATOIRE :

ESSENTIEL
[1 phrase forte — le mécanisme ou concept central, pas juste "ce chapitre parle de X"]

CONCEPTS CLÉS
[Pour chaque notion importante : • **Terme** → explication en 1 ligne. 4–6 concepts.]

PIÈGE CLASSIQUE
[L'erreur que font presque tous les étudiants sur ce chapitre + comment l'éviter (1–2 phrases)]

À RETENIR (${concoursLabel(filiere).toUpperCase()})
[1 règle mnémotechnique ou valeur seuil clé]

QUESTION DE RÉVISION
[1 question de type examen mauritanien basée sur ce chapitre]

Contenu du chapitre :
${context}`,
    },
  ];
  return await callAI(messages, undefined, 'summary');
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

// ─── Extraction PDF via Claude (document API — robuste polices custom) ───────

export async function extractPDFWithClaude(
  fileUri: string
): Promise<{ text: string; pages: number }> {
  if (!ANTHROPIC_KEY) throw new Error('Clé Anthropic manquante');
  const FileSystem = require('expo-file-system/legacy');
  const base64: string = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          {
            type: 'text',
            text: 'Extrais intégralement le texte de ce document médical. Conserve la structure (titres, numéros de section). Retourne UNIQUEMENT le texte brut, sans commentaire.',
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude PDF ${res.status}: ${err.slice(0, 150)}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() ?? '';
  if (text.length < 100) throw new Error('Claude PDF : texte extrait insuffisant');
  return { text, pages: Math.max(1, Math.ceil(text.split(/\s+/).length / 300)) };
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
  niveau: NiveauType = 'moyen',
  filiere: FiliereType = 'medecine'
): Promise<QuizQuestion[]> {
  const difficulte = niveau === 'facile'
    ? 'questions de définition ou critères diagnostiques ("Définir...", "Citer les signes de...")'
    : niveau === 'avance'
      ? `questions de raisonnement clinique niveau ${examStyleLabel(filiere, niveau)} ("Quelle est la physiopathologie de...", "Comment différencier X de Y ?")`
      : 'questions de niveau examen de fin de module ("Quel est le traitement de première intention...", "Quelle valeur seuil...")';

  const prompt = `Tu es Dr. Ahmed, tuteur ${filiereProfession(filiere)}. Génère 3 questions de révision style ${examStyleLabel(filiere, niveau)} basées UNIQUEMENT sur le contenu ci-dessous.

RÈGLES :
- Chaque question porte sur UN FAIT MÉDICAL PRÉCIS présent dans le texte (valeur seuil, critère diagnostic, traitement, mécanisme)
- Style : ${difficulte}
- Questions courtes et directes — maximum 20 mots
- INTERDIT : questions vagues ("Quel est le concept principal", "l'importance de...")
- Varie les angles : définitions, physiopathologie, diagnostic, traitement, complications, valeurs seuils
- L'indice = un terme médical ou mécanisme du cours (ex: "Pense à la physiopathologie de l'IRA")

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
      700,
      'qcm'
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

// ─── Quiz médical : QCM format UNAM A-E ──────────────────────────────────────

export type QCMQuestion = {
  question: string;
  propositions: { A: string; B: string; C: string; D: string; E: string };
  bonnesReponses: ('A' | 'B' | 'C' | 'D' | 'E')[];
  explication: { A: string; B: string; C: string; D: string; E: string };
};

const QCM_KEYS = ['A', 'B', 'C', 'D', 'E'] as const;

function isValidQCM(item: unknown): item is QCMQuestion {
  if (!item || typeof item !== 'object') return false;
  const q = item as Record<string, unknown>;

  if (typeof q.question !== 'string' || !q.question.trim()) return false;

  const props = q.propositions as Record<string, unknown>;
  if (!props || QCM_KEYS.some(k => typeof props[k] !== 'string' || !(props[k] as string).trim())) return false;

  const br = q.bonnesReponses as unknown[];
  if (!Array.isArray(br) || br.length === 0 || br.length > 4) return false;
  if (br.some(r => !QCM_KEYS.includes(r as typeof QCM_KEYS[number]))) return false;

  const expl = q.explication as Record<string, unknown>;
  if (!expl || QCM_KEYS.some(k => typeof expl[k] !== 'string' || !(expl[k] as string).trim())) return false;

  return true;
}

export async function generateChapterQCM(
  chapterContent: string,
  chapterTitle: string,
  niveau: NiveauType = 'moyen',
  filiere: FiliereType = 'medecine'
): Promise<QCMQuestion[]> {
  const focusNiveau =
    niveau === 'facile'
      ? 'Axe sur la définition, le mécanisme de base et la clinique typique (P1-P2).'
      : niveau === 'avance'
        ? `Axe sur le diagnostic différentiel, les complications, les pièges et les cas atypiques (niveau ${examStyleLabel(filiere, niveau)}).`
        : 'Axe sur la physiopathologie, la présentation clinique et le traitement de première ligne (P3-P4).';

  const prompt = `Tu es un examinateur de l'UNAM Nouakchott, filière ${filiereProfession(filiere)}. Génère 5 QCM basés UNIQUEMENT sur le contenu ci-dessous.

FORMAT STRICT pour chaque QCM :
- 1 question clinique ou mécanistique ancrée sur un fait EXPLICITEMENT présent dans le texte
- 5 propositions A/B/C/D/E : plausibles, non caricaturales
- 1 à 4 bonnes réponses (JAMAIS 0, JAMAIS 5)
- 1 explication courte par proposition : indique si c'est vrai ou faux et pourquoi, en citant le cours

RÈGLES :
- Chaque question et chaque proposition s'appuie sur un fait présent dans le texte fourni
- Varier les angles : physiopathologie, clinique, paraclinique, traitement, épidémio
- INTERDIT : questions générales sur "l'importance du chapitre" ou "le concept principal"
- ${focusNiveau}

Chapitre : ${chapterTitle}
Contenu :
${chapterContent.slice(0, 4000)}

Réponds UNIQUEMENT avec le JSON valide, sans balise markdown, sans aucun texte avant ou après :
[
  {
    "question": "...",
    "propositions": {"A": "...", "B": "...", "C": "...", "D": "...", "E": "..."},
    "bonnesReponses": ["A", "C"],
    "explication": {"A": "...", "B": "...", "C": "...", "D": "...", "E": "..."}
  }
]`;

  const text = (await callAnthropicViaEdge(
    [{ role: 'user', content: prompt }],
    2000,
    'qcm'
  )).trim();
  console.log('[QCM] raw response length:', text.length);

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (!arrMatch) {
    throw new Error('Format invalide : le modèle n\'a pas retourné de tableau JSON.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrMatch[0]);
  } catch {
    throw new Error('JSON malformé : impossible de parser la réponse du modèle.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Format invalide : le modèle n\'a pas retourné un tableau.');
  }

  const valid = (parsed as unknown[]).filter(isValidQCM);
  console.log(`[QCM] QCM valides : ${valid.length}/${parsed.length}`);

  if (valid.length === 0) {
    throw new Error('Aucun QCM valide généré — le modèle n\'a pas respecté le format attendu.');
  }

  return valid;
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

  const prompt = `Tu es Dr. Ahmed. Corrige la réponse de cet étudiant en médecine de la FMPOS.

Question posée : ${question}
Extrait du cours (référence) :
${chapterContent.slice(0, 3000)}
Réponse de l'étudiant : ${studentAnswer}

Critères :
- CORRECT : réponse médicalement juste — l'idée, le mécanisme ou la valeur est correcte
- PARTIEL : bonne direction mais manque un élément clé (valeur seuil, mécanisme, critère) ou formulation imprécise
- INCORRECT : réponse fausse, hors sujet, ou dangereux médicalement

Feedback : 1 phrase courte, précise, bienveillante. Si CORRECT → félicite et renforce. Si PARTIEL → dis exactement ce qui manque. Si INCORRECT → donne la réponse juste.

Réponds UNIQUEMENT avec ce JSON, sans balise markdown :
{"score": "CORRECT", "feedback": "..."}`;

  try {
    const text = (await callAnthropicViaEdge(
      [{ role: 'user', content: prompt }],
      220,
      'qcm'
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
