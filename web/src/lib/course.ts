export type Chunk = {
  title: string;
  content: string;
  index: number;
  startPage?: number;
  endPage?: number;
};

export type DocumentRow = {
  id: string;
  name: string;
  subject_name: string | null;
  pages: number;
  content: string;
  chunks: Chunk[];
  fiche: string | null;
  updated_at: string;
};

const STOP = new Set([
  "dans", "avec", "pour", "que", "qui", "quoi", "quel", "quelle", "quels", "quelles", "les", "des", "une",
  "est", "sont", "entre", "comme", "plus", "moins", "cette", "cela", "faire", "fait", "peut", "aux", "par",
  "sur", "difference", "differences", "explique", "expliquer", "donne", "moi", "pourquoi", "comment",
]);

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function tokens(s: string): string[] {
  return norm(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/** Sélection simple des passages les plus proches de la question (mots communs, titre pondéré). */
export function pickChunks(chunks: Chunk[], query: string, k = 3): Chunk[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const scored = chunks.map((c) => {
    const title = norm(c.title);
    const body = norm(c.content);
    let score = 0;
    for (const w of q) {
      if (title.includes(w)) score += 3;
      const hits = body.split(w).length - 1;
      score += Math.min(hits, 5);
    }
    return { c, score: score / Math.log(2 + body.length / 1000) };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c);
}

export function chatSystem(
  docName: string | null,
  studentName: string | null,
  hasContext: boolean,
  opts: { suggestions?: boolean; images?: boolean } = {},
): string {
  const { suggestions = true, images = false } = opts;
  const scope = hasContext
    ? "Réponds d'abord avec le cours. Si la question va plus loin que le cours (compréhension, comparaison, cas pratique, avis), réponds quand même complètement avec tes connaissances médicales solides, en séparant clairement les deux : « Dans ton cours : … » puis « Pour aller plus loin : … »."
    : "Aucun extrait pertinent n'a été trouvé : dis-le en une phrase, puis réponds complètement sur ta connaissance médicale générale en le précisant (« Hors de ton cours : … »).";
  return `Tu es Dr. Ahmed, un senior en santé et tuteur de révision pour des étudiants en médecine et en pharmacie (Mauritanie, Sénégal, Maroc).

${docName ? `Cours actif : "${docName}"` : "Aucun cours sélectionné : l'étudiant pose une question libre."}

RÈGLES D'OR :
1. Des extraits du cours sont fournis dans le message. Lis-les tous avant de répondre.
2. Si l'information est dans les extraits, utilise-la. Ne dis jamais qu'elle est absente si elle est présente.
3. ${scope}
4. Utilise les définitions exactes du cours. Ne paraphrase pas les valeurs seuils ni les posologies.
5. Parle naturellement, jamais « l'extrait 1 dit… ».

COMPORTEMENT :
- Direct, précis, bienveillant. L'étudiant s'appelle ${studentName ? `"${studentName}"` : "un étudiant"}.
- Messages courts (bonjour, merci) : réponse brève.
- Tu peux donner ton avis et conseiller l'étudiant (comment réviser, ce qui tombe souvent, quoi retenir en priorité, comment retenir une notion), en disant que c'est un conseil et non un contenu du cours.
- Explique le « pourquoi » : un mécanisme, une comparaison, un exemple concret valent mieux qu'une liste de faits.
- Jamais de « peut-être », « environ », « il semblerait » sur des données médicales précises.
- Si tu n'es pas certain : « Je ne suis pas certain sur ce point, vérifie dans ton cours ou ton manuel de référence. »
- Ne donne jamais de conseil médical pour un vrai patient : tu aides à réviser.

FORMAT :
- Commence directement par la réponse. Sois complet sur les questions de fond (jusqu'à environ 350 mots), très bref sur les messages simples.
- Symboles Unicode pour les formules (² ³ ≤ ≥ α β °), jamais de LaTeX.
- Tu peux utiliser du Markdown simple (listes, gras, tableaux) quand cela clarifie la réponse.
- Réponds dans la langue de l'étudiant (français ou arabe).
- Termine par « À retenir : … » (une phrase) quand la réponse est substantielle.${
    suggestions ? "\n- Dernière ligne : [SUGG: question courte 1 | question courte 2]" : ""
  }${
    images
      ? "\n\nIMAGES : l'étudiant a joint une ou plusieurs images (page de cours, schéma, ECG, radiographie, résultats). Décris ce que tu vois, puis réponds à sa question. Si l'image est illisible ou ambiguë, dis-le. Ne pose jamais de diagnostic pour un vrai patient."
      : ""
  }`;
}

/** Sépare le texte de la ligne de suggestions [SUGG: a | b]. */
export function splitSuggestions(text: string): { body: string; suggestions: string[] } {
  const m = text.match(/\[SUGG:\s*([^\]]*)\]?\s*$/i);
  if (!m || m.index === undefined) return { body: text.trim(), suggestions: [] };
  return {
    body: text.slice(0, m.index).trim(),
    suggestions: m[1]
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}

export const KEYS = ["A", "B", "C", "D", "E"] as const;
export type Key = (typeof KEYS)[number];

export type Qcm = {
  question: string;
  propositions: Record<Key, string>;
  bonnesReponses: Key[];
  explication: Record<Key, string>;
};

export function qcmPrompt(title: string, content: string): string {
  return `Tu es un examinateur en santé (médecine / pharmacie). Génère 5 QCM basés UNIQUEMENT sur le contenu ci-dessous.

RÈGLES :
- Chaque question et chaque proposition s'appuie sur un fait EXPLICITEMENT présent dans le texte fourni.
- 5 propositions A/B/C/D/E plausibles, non caricaturales. 1 à 4 bonnes réponses (jamais 0, jamais 5).
- Une explication courte par proposition : vrai ou faux, et pourquoi, en citant le cours.
- Varier les angles : mécanisme, clinique, examens, traitement (seulement ce que le cours traite).
- Interdit : questions générales sur « l'importance du chapitre » ou « le concept principal ».

FORMAT EXACT, en texte simple (pas de JSON, pas de Markdown), un bloc par QCM :

### QCM 1
Q: texte de la question
A: proposition A
B: proposition B
C: proposition C
D: proposition D
E: proposition E
REPONSES: A, C
EXPL A: explication de A
EXPL B: explication de B
EXPL C: explication de C
EXPL D: explication de D
EXPL E: explication de E

Chapitre : ${title}
Contenu :
${content.slice(0, 14000)}`;
}

function isValidQcm(q: unknown): q is Qcm {
  if (!q || typeof q !== "object") return false;
  const o = q as Record<string, unknown>;
  if (typeof o.question !== "string" || !o.question.trim()) return false;
  const p = o.propositions as Record<string, unknown> | undefined;
  const e = o.explication as Record<string, unknown> | undefined;
  if (!p || !e) return false;
  if (KEYS.some((k) => typeof p[k] !== "string" || !(p[k] as string).trim() || typeof e[k] !== "string")) return false;
  const b = o.bonnesReponses;
  return (
    Array.isArray(b) &&
    b.length >= 1 &&
    b.length <= 4 &&
    b.every((x) => (KEYS as readonly unknown[]).includes(x))
  );
}

/** Lit le format texte des QCM (robuste aux guillemets et aux retours à la ligne, contrairement au JSON). */
export function parseQcm(raw: string): Qcm[] {
  const blocks = raw.split(/^\s*#{2,4}\s*QCM\s*\d+.*$/im).map((x) => x.trim()).filter(Boolean);
  const out: Qcm[] = [];
  for (const block of blocks) {
    const q = {
      question: "",
      propositions: {} as Record<string, string>,
      explication: {} as Record<string, string>,
      bonnesReponses: [] as string[],
    };
    let target: { set: (t: string) => void; get: () => string } | null = null;
    for (const line of block.split("\n")) {
      const t = line.trim();
      let m: RegExpMatchArray | null;
      if ((m = t.match(/^Q\s*[:.)]\s*(.*)$/i))) {
        q.question = m[1];
        target = { get: () => q.question, set: (x) => (q.question = x) };
      } else if ((m = t.match(/^(?:R[ÉE]PONSES?|BONNES?\s+R[ÉE]PONSES?)\s*:\s*(.*)$/i))) {
        q.bonnesReponses = [...new Set((m[1].toUpperCase().match(/[A-E]/g) ?? []) as string[])];
        target = null;
      } else if ((m = t.match(/^EXPL(?:ICATION)?\s*([A-E])\s*[:.)]\s*(.*)$/i))) {
        const k = m[1].toUpperCase();
        q.explication[k] = m[2];
        target = { get: () => q.explication[k], set: (x) => (q.explication[k] = x) };
      } else if ((m = t.match(/^([A-E])\s*[:.)]\s*(.*)$/))) {
        const k = m[1];
        q.propositions[k] = m[2];
        target = { get: () => q.propositions[k], set: (x) => (q.propositions[k] = x) };
      } else if (t && target) {
        target.set(`${target.get()} ${t}`.trim());
      }
    }
    const qcm = {
      question: q.question.trim(),
      propositions: q.propositions,
      explication: q.explication,
      bonnesReponses: q.bonnesReponses,
    };
    if (isValidQcm(qcm)) out.push(qcm);
  }
  if (out.length === 0) throw new Error("format");
  return out;
}

/** Même notation que l'app : complet 10 points, partiel 5, faux 0. */
export function scoreQcm(
  selected: string[],
  good: string[],
): { result: "COMPLET" | "PARTIEL" | "FAUX"; points: number } {
  if (selected.length === 0) return { result: "FAUX", points: 0 };
  const sel = new Set(selected);
  if (sel.size === good.length && good.every((g) => sel.has(g))) {
    return { result: "COMPLET", points: 10 };
  }
  if (good.some((g) => sel.has(g))) return { result: "PARTIEL", points: 5 };
  return { result: "FAUX", points: 0 };
}
