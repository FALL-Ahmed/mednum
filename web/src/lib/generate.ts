import { askAI } from "./ai";
import { verifyFiche } from "./fiche-check";
import { getSupabase } from "./supabase";

/** Contexte de l'étudiant transmis aux consignes de génération. */
export type StudentCtx = { niveau: string; profession: "médecine" | "pharmacie" };

export function studentCtx(p: { promotion_name: string | null; school_name: string | null }): StudentCtx {
  const blob = `${p.promotion_name ?? ""} ${p.school_name ?? ""}`;
  return {
    niveau: p.promotion_name?.trim() || "non précisé",
    profession: /pharma/i.test(blob) ? "pharmacie" : "médecine",
  };
}

const MAX_CONTENT = 150000;

const intro = (c: StudentCtx) =>
  `Tu es Dr. Ahmed, senior en ${c.profession} et tuteur de révision pour les étudiants de la FMPOS/UNAM Nouakchott, filière ${c.profession}.`;

/* ——— Fiche de révision ——— */

export async function generateFiche(name: string, content: string, c: StudentCtx): Promise<string> {
  const prompt = `${intro(c)}

Ta mission : transformer ce cours en une fiche de révision que l'étudiant relit en 10 minutes avant un partiel, un examen de module ou un concours. Pas un résumé : une fiche fiable, courte et directement utile.

CONTEXTE : niveau de l'étudiant : ${c.niveau} · cours : ${name}.

RÈGLES ABSOLUES (une seule entorse détruit la confiance de l'étudiant) :
1. Chaque ligne doit pouvoir être retrouvée dans le cours fourni. N'ajoute AUCUNE information, même exacte en général, qui n'y figure pas. Aucun traitement, aucune conduite à tenir, aucun diagnostic, aucun chiffre, aucune « erreur fréquente » issus de tes connaissances.
2. Si le cours ne traite pas un thème, il n'y a PAS de section pour ce thème. Interdit d'écrire « non détaillé », « non précisé » ou toute formule entre crochets : une information absente n'apparaît pas.
3. Reprends les noms, sigles, valeurs, classifications et critères tels qu'ils sont écrits dans le cours. Corrige seulement les fautes de frappe évidentes.
4. Court : la fiche entière fait 900 à 1 300 mots. Maximum 6 lignes par section (sauf « À SAVOIR ABSOLUMENT » : 6 à 10). Une même information n'apparaît qu'UNE fois dans la fiche (pas de répétition entre sections).
5. Niveau ${c.niveau} : P1/P2 → bases et définitions ; P3/P4 → liens mécanisme, signes, examens ; P5 et au-delà → points discriminants, exceptions, pièges du cours.
6. Fiche de révision uniquement : aucun conseil médical pour un vrai patient.

LANGAGE DE MISE EN FORME (obligatoire, la fiche est affichée par un programme qui le lit) :
- "# " : titre de la fiche (une fois, en premier). "## " : titre de section.
- "- Étiquette : contenu" : un point (étiquette de 4 mots maximum, deux-points, contenu).
- "★ " : à savoir absolument. "⚠️ A ≠ B : pourquoi" : confusion réelle visible dans le cours. "✅ " : à retenir.
- Une ligne seule « Titre : » regroupe les lignes "- " qui la suivent.
- La flèche → sert UNIQUEMENT à une vraie suite de cause à effet, sur UNE ligne, précédée d'une étiquette : « - Voie classique : Ag-Ac → C1q → C3 convertase ». Pour une liste d'éléments, pas de flèches.
- Tableau : lignes commençant par "|" (en-têtes, puis |---|---|).
- INTERDIT : astérisques ** ou *, listes numérotées Markdown, autres titres Markdown.

STRUCTURE (garde cet ordre ; supprime toute section sans matière dans le cours) :

# FICHE DE RÉVISION — [titre du cours]
Discipline : [déduite du contenu] · Niveau : ${c.niveau}

## L'ESSENTIEL EN UNE PHRASE
[Une seule phrase.]
- Fréquence probable en examen : [Élevée / Moyenne / Faible] — [5 mots max]

## À SAVOIR ABSOLUMENT
[6 à 10 lignes "★ " : définitions, chiffres, seuils, classifications, critères indispensables.]

## I. NOTIONS CLÉS
[Lignes "- Terme : définition" pour les termes du cours qui ne sont pas déjà dans « À savoir absolument ».]

## II. MÉCANISMES
[Chaînes cause → effet réellement décrites dans le cours, avec étiquette.]

## III. DIAGNOSTIC ET EXPLORATION
[Seulement si le cours en parle : signes, examens, valeurs du cours.]

## IV. TRAITEMENT
[Seulement si le cours en parle.]

## V. CE QUI TOMBE AU CONCOURS
[Seulement si le cours contient des annales ou QCM corrigés (années, « testez vos connaissances », « correction »). 5 à 8 lignes "★ " : les faits que ces QCM font vérifier, avec l'année quand elle est indiquée. Exemple : « ★ 2007 : C5a possède une activité chimiotactique ».]

## VI. CONFUSIONS À ÉVITER
[3 à 5 lignes "⚠️" tirées du cours, sinon supprime la section.]

## VII. TABLEAU DE SYNTHÈSE
[Tableau qui compare des éléments du cours (cytokines, voies, classes…). Sinon supprime la section.]

## VIII. 3 QUESTIONS QUE LE PROF POURRAIT POSER
Q1 : …
R : (1) point court. (2) point court. (3) point court.
Q2 : …
R : (1) … (2) … (3) …
Q3 : …
R : (1) … (2) … (3) …
[Réponses de 2 à 4 points numérotés, tirées du cours.]

## ULTRA-RÉSUMÉ
[3 lignes "✅ " maximum, formulées autrement que « À savoir absolument ».]

Avant de répondre, relis chaque ligne et supprime celle dont tu ne retrouves pas la source dans le cours. Réponds uniquement avec la fiche finale, sans commentaire.

CONTENU DU COURS :
${content.slice(0, MAX_CONTENT)}`;
  const raw = (await askAI({ messages: [{ role: "user", content: prompt }], maxTokens: 8192, kind: "fiche" })).trim();
  const text = verifyFiche(raw, content);
  if (text.length < 200) throw new Error("format");
  return text;
}

/* ——— Utilitaires JSON ——— */

function jsonArray(text: string): unknown[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("format");
  try {
    const parsed = JSON.parse(m[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* tombe sur l'erreur ci-dessous */
  }
  throw new Error("format");
}

/* ——— Flashcards ——— */

type CardOut = { front: string; back: string; chapter?: string };

/** Un jeu de flashcards reste court : l'essentiel à mémoriser, pas tout le cours (c'est le rôle de la fiche). */
export const MAX_CARDS = 30;
const MAX_GROUPS = 10;

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Nombre de cartes visé pour un cours : environ 1 carte pour 330 mots, entre 8 et 30. */
export const cardBudget = (words: number) => Math.min(MAX_CARDS, Math.max(8, Math.round(words / 330)));

async function cardsForChunk(
  name: string,
  chapter: string,
  content: string,
  c: StudentCtx,
  part: number,
  count: number,
): Promise<CardOut[]> {
  const prompt = `${intro(c)}

Génère les flashcards de révision de CE CHAPITRE du cours, recto / verso, pour la mémorisation active. Ce sont les cartes de l'ESSENTIEL : ce qu'il faut absolument retenir, pas le détail.

CONTEXTE : niveau : ${c.niveau} · cours : ${name} · chapitre : ${chapter}.

OBJECTIF : retenir l'essentiel de ce chapitre, dans l'ordre du cours : les définitions, valeurs seuils, classifications, critères et mécanismes les plus importants, ceux qui tombent à l'examen.

RÈGLES ABSOLUES :
1. N'invente RIEN : chaque carte vient du texte ci-dessous. Chiffres, seuils, définitions : exacts.
2. Une carte = UNE notion précise. Jamais une question vague.
3. Recto (front) court : une question, un terme à définir ou un « complète la phrase ». Une phrase maximum.
4. Verso (back) : la réponse exacte et complète, 1 à 3 phrases, ou une liste courte. Garde le niveau de détail du cours.
5. Nombre de cartes : EXACTEMENT ${count} cartes, ni plus ni moins. Choisis les ${count} notions les plus importantes. Aucune carte redondante.
6. Varie les formes : définition → terme, terme → définition, cause → conséquence, valeur seuil, comparaison, « cite les… ».

Réponds UNIQUEMENT avec le JSON valide, sans balise markdown, sans texte avant ou après :
[
  {"front": "...", "back": "..."}
]

CONTENU DU CHAPITRE :
${content.slice(0, MAX_CONTENT)}`;
  const raw = await askAI({
    messages: [{ role: "user", content: prompt }],
    maxTokens: 8192,
    kind: "flashcards",
    part,
  });
  return jsonArray(raw)
    .filter(
      (x): x is { front: string; back: string } =>
        !!x &&
        typeof (x as { front?: unknown }).front === "string" &&
        typeof (x as { back?: unknown }).back === "string" &&
        (x as { front: string }).front.trim() !== "" &&
        (x as { back: string }).back.trim() !== "",
    )
    .map((x) => ({ front: x.front.trim(), back: x.back.trim(), chapter }));
}

/**
 * Flashcards du cours COMPLET : une série par chapitre (3 en parallèle), puis assemblage dans l'ordre du cours.
 * Une seule génération est comptée dans le quota du jour, les chapitres suivants sont des suites.
 */
export async function generateFlashcards(
  name: string,
  content: string,
  chunks: { title: string; content: string }[],
  c: StudentCtx,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const parts = chunks.filter((k) => k.content && k.content.length > 300);
  const base = parts.length > 0 ? parts : [{ title: name, content }];

  // Au plus MAX_GROUPS lots : on regroupe les chapitres voisins pour que chaque lot donne au moins quelques cartes.
  const totalWords = base.reduce((n, k) => n + wordCount(k.content), 0);
  const target = cardBudget(totalWords);
  const jobs: { title: string; content: string }[] = [];
  const perGroup = totalWords / Math.min(MAX_GROUPS, base.length);
  let cur: { title: string; content: string; words: number } | null = null;
  for (const k of base) {
    if (!cur) cur = { title: k.title, content: k.content, words: wordCount(k.content) };
    else {
      cur = { title: `${cur.title} · ${k.title}`, content: `${cur.content}\n\n${k.content}`, words: cur.words + wordCount(k.content) };
    }
    if (cur.words >= perGroup || base.length <= MAX_GROUPS) {
      jobs.push({ title: cur.title, content: cur.content });
      cur = null;
    }
  }
  if (cur) jobs.push({ title: cur.title, content: cur.content });
  const jobWords = jobs.map((j) => wordCount(j.content));
  const counts = jobWords.map((w) => Math.max(2, Math.round((target * w) / Math.max(1, totalWords))));
  const results: (CardOut[] | null)[] = jobs.map(() => null);

  // Le premier chapitre part seul : c'est lui qui compte dans le quota (et qui échoue si le quota est atteint).
  results[0] = await cardsForChunk(name, jobs[0].title, jobs[0].content, c, 1, counts[0]);
  let done = 1;
  onProgress?.(done, jobs.length);

  // Les suivants partent ensuite, trois à la fois ; un chapitre qui échoue n'annule pas les autres.
  let next = 1;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      try {
        results[i] = await cardsForChunk(name, jobs[i].title, jobs[i].content, c, i + 1, counts[i]);
      } catch {
        results[i] = null;
      }
      onProgress?.(++done, jobs.length);
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  // Doublons retirés, puis plafond global : on prend les cartes à tour de rôle dans chaque lot pour garder tout le cours représenté.
  const seen = new Set<string>();
  const lists: CardOut[][] = results.map((list) =>
    (list ?? []).filter((card) => {
      const key = card.front.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
  const picked: { g: number; k: number }[] = [];
  for (let k = 0; picked.length < MAX_CARDS && lists.some((l) => k < l.length); k++) {
    for (let g = 0; g < lists.length && picked.length < MAX_CARDS; g++) if (k < lists[g].length) picked.push({ g, k });
  }
  picked.sort((a, b) => a.g - b.g || a.k - b.k);
  const all = picked.map(({ g, k }) => lists[g][k]);
  if (all.length === 0) throw new Error("format");
  return JSON.stringify(all);
}

/* ——— Cas cliniques ———
   Contenu critique : un seul détail faux détruit la confiance. Chaîne en 4 temps :
   1. génération par le modèle le plus fort, avec extraits du cours recopiés mot pour mot ;
   2. relecture par un « examinateur » indépendant (cohérence, contradictions, valeurs inventées) ;
   3. contrôles automatiques (extraits retrouvés dans le cours, aucune valeur de laboratoire inventée) ;
   4. seuls les cas qui passent les trois étapes sont proposés.
*/

type CaseStage = { label: string; reveal: string; prompt: string };
type CaseOut = {
  title: string;
  context: string;
  stages: CaseStage[];
  diagnosis: string;
  differentials?: string;
  reasoning: string;
  management: string;
  source_quotes: string[];
};

const STAGE_LABELS = ["Motif de consultation", "Interrogatoire", "Examen clinique", "Examens complémentaires"];

const normText = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function asCase(x: unknown): CaseOut | null {
  const k = x as Partial<CaseOut> | null;
  if (!k || typeof k !== "object") return null;
  if (typeof k.title !== "string" || typeof k.diagnosis !== "string" || typeof k.reasoning !== "string") return null;
  if (!Array.isArray(k.stages) || k.stages.length !== 4) return null;
  const stages: CaseStage[] = [];
  for (const st of k.stages) {
    const o = st as Partial<CaseStage> | null;
    if (!o || typeof o.reveal !== "string" || typeof o.prompt !== "string" || !o.reveal.trim() || !o.prompt.trim()) return null;
    stages.push({ label: typeof o.label === "string" ? o.label : "", reveal: o.reveal, prompt: o.prompt });
  }
  stages.forEach((st, i) => (st.label = STAGE_LABELS[i]));
  return {
    title: k.title,
    context: typeof k.context === "string" ? k.context : "",
    stages,
    diagnosis: k.diagnosis,
    differentials: typeof k.differentials === "string" ? k.differentials : undefined,
    reasoning: k.reasoning,
    management: typeof k.management === "string" ? k.management : "",
    source_quotes: Array.isArray(k.source_quotes) ? k.source_quotes.filter((q): q is string => typeof q === "string") : [],
  };
}

const LAB_VALUE =
  /\b(\d+(?:[.,]\d+)?)\s*(?:mg\/dl|mg\/l|g\/l|g\/dl|mmol\/l|µmol\/l|umol\/l|ui\/l|u\/l|ng\/ml|pg\/ml|meq\/l|mui\/l|\/mm3|g\/l|mm\/h)/gi;

/** Contrôles automatiques : extraits retrouvés dans le cours, aucune valeur de laboratoire inventée. */
function checkCase(c: CaseOut, course: string): CaseOut | null {
  const courseN = normText(course);
  const quotes = c.source_quotes.filter((q) => {
    const n = normText(q);
    if (n.split(" ").length < 4) return false;
    if (courseN.includes(n)) return true;
    // tolérance : 85 % des mots de l'extrait présents dans le cours
    const words = n.split(" ").filter((w) => w.length > 2);
    const hit = words.filter((w) => courseN.includes(w)).length;
    return words.length > 0 && hit / words.length >= 0.85;
  });
  if (quotes.length === 0) return null;

  const all = [c.context, ...c.stages.map((st) => st.reveal), c.reasoning, c.management].join(" ");
  const courseTight = course.replace(/,/g, ".");
  for (const m of all.matchAll(LAB_VALUE)) {
    const num = m[1].replace(",", ".");
    if (!courseTight.includes(num)) return null; // valeur chiffrée de laboratoire absente du cours
  }
  // Le diagnostic ne doit pas apparaître dans les 3 premières étapes.
  const dx = normText(c.diagnosis).split(" ").filter((w) => w.length > 5);
  if (dx.length > 0) {
    const early = normText(c.stages.slice(0, 3).map((st) => st.reveal).join(" "));
    const leaked = dx.length >= 2 ? dx.every((w) => early.includes(w)) : early.includes(dx[0]);
    if (leaked) return null;
  }
  return { ...c, source_quotes: quotes };
}

const CASE_FORMAT = `[
  {
    "title": "titre court sans le nom de la maladie",
    "context": "âge, sexe, contexte (1-2 phrases)",
    "stages": [
      {"label": "Motif de consultation", "reveal": "...", "prompt": "..."},
      {"label": "Interrogatoire", "reveal": "...", "prompt": "..."},
      {"label": "Examen clinique", "reveal": "...", "prompt": "..."},
      {"label": "Examens complémentaires", "reveal": "...", "prompt": "..."}
    ],
    "diagnosis": "diagnostic précis",
    "differentials": "2 à 3 diagnostics différentiels et pourquoi on les écarte",
    "reasoning": "fil de raisonnement motif → signes → examens → diagnostic",
    "management": "conduite à tenir standard, sans posologie",
    "source_quotes": ["extrait du cours recopié mot pour mot", "autre extrait"]
  }
]`;

export async function generateCases(
  name: string,
  content: string,
  c: StudentCtx,
  onProgress?: (text: string) => void,
): Promise<string> {
  const course = content.slice(0, MAX_CONTENT);

  /* 1. Génération */
  onProgress?.("Étape 1 sur 2 : écriture des cas…");
  const genPrompt = `${intro(c)}

Construis des cas cliniques interactifs à partir du cours ci-dessous, pour un étudiant de niveau ${c.niveau}. Méthode : raisonnement clinique par « illness script » (terrain → mécanisme → signes → examens → diagnostic → conduite à tenir), révélation progressive en 4 étapes.

CHOIX DES CAS :
- Ne construis un cas que pour une situation clinique ou une pathologie EXPLICITEMENT enseignée dans le cours, avec assez de matière (mécanisme, signes, examens ou prise en charge).
- Privilégie les situations fréquentes ou graves traitées par le cours. Pas de maladie rare qui n'est pas dans le cours.
- 1 à 4 cas, chacun sur une pathologie différente. Si le cours ne contient AUCUNE situation clinique exploitable, réponds exactement [] plutôt que d'inventer.

COHÉRENCE ABSOLUE (une seule incohérence détruit la confiance d'un étudiant en médecine) :
- Âge, sexe, antécédents, signes et examens sont compatibles entre eux et avec le diagnostic ; épidémiologie plausible pour cette maladie.
- Constantes (température, pouls, tension, fréquence respiratoire, saturation) plausibles et cohérentes avec le tableau.
- Aucune contradiction avec le cours.
- Examens complémentaires QUALITATIFS (« CRP très élevée », « C4 effondré », « anticorps présents ») : AUCUNE valeur chiffrée de laboratoire et aucune unité de laboratoire (mg/L, mmol/L, UI/L…), sauf un chiffre qui figure dans le cours.
- Médicaments : seulement ceux que le cours cite pour cette maladie, ou la classe thérapeutique standard. Jamais de posologie.
- Les étapes 1 à 3 ne contiennent NI le nom du diagnostic NI son synonyme. Le diagnostic n'apparaît qu'à la fin.
- Chaque étape se termine par une question OUVERTE qui invite à raisonner (hypothèses, signes à chercher, examens à demander), jamais oui/non.

CITATIONS : pour chaque cas, "source_quotes" contient 2 à 3 extraits COURTS (au moins 5 mots) recopiés MOT POUR MOT du cours, qui établissent la pathologie centrale et son mécanisme. Ne reformule pas.

Réponds UNIQUEMENT avec un TABLEAU JSON valide, sans balise markdown, sans texte avant ou après. N'utilise pas de guillemets droits à l'intérieur des textes (utilise « » à la place) :
${CASE_FORMAT}

CONTENU DU COURS :
${course}`;
  const rawGen = await askAI({ messages: [{ role: "user", content: genPrompt }], maxTokens: 8192, kind: "case", part: 1 });
  const draft = jsonArray(rawGen).map(asCase).filter((x): x is CaseOut => x !== null);
  if (draft.length === 0) throw new Error("nocase");

  /* 2. Relecture par un examinateur indépendant */
  onProgress?.("Étape 2 sur 2 : vérification médicale…");
  const verPrompt = `Tu es un médecin senior, examinateur strict, qui relit des cas cliniques avant de les donner à des étudiants en ${c.profession}. Une erreur médicale, même petite, est inacceptable : en cas de doute, corrige ou rejette.

Pour chaque cas, vérifie point par point :
1. La pathologie centrale est enseignée dans le COURS ci-dessous (et les extraits source_quotes en viennent mot pour mot).
2. Cohérence interne : chaque signe, antécédent, constante et examen est compatible avec le diagnostic et avec les autres ; âge et sexe plausibles ; rien d'impossible physiologiquement.
3. Aucune contradiction avec le cours.
4. Aucune valeur de laboratoire chiffrée inventée, aucune posologie.
5. Les étapes 1 à 3 ne révèlent pas le diagnostic ; chaque question est ouverte.
6. La conduite à tenir est standard, prudente et compatible avec le cours.
7. Les diagnostics différentiels sont pertinents et correctement écartés.

Verdict par cas : "OK" (aucun problème), "CORRIGE" (tu renvoies le cas COMPLET corrigé, même format), "REJETE" (irrécupérable ou pathologie absente du cours).
Réponds UNIQUEMENT avec un tableau JSON valide, sans balise markdown. N'utilise pas de guillemets droits à l'intérieur des textes :
[{"cas": 1, "verdict": "OK", "problemes": ["..."], "cas_corrige": null}]

COURS :
${course}

CAS À RELIRE :
${JSON.stringify(draft)}`;
  let reviewed: CaseOut[] = [];
  try {
    const rawVer = await askAI({ messages: [{ role: "user", content: verPrompt }], maxTokens: 8192, kind: "case", part: 2 });
    const verdicts = jsonArray(rawVer) as { cas?: number; verdict?: string; cas_corrige?: unknown }[];
    verdicts.forEach((v) => {
      const original = typeof v.cas === "number" ? draft[v.cas - 1] : undefined;
      if (!original) return;
      if (v.verdict === "OK") reviewed.push(original);
      else if (v.verdict === "CORRIGE") {
        const fixed = asCase(v.cas_corrige);
        if (fixed) reviewed.push(fixed);
      }
    });
  } catch {
    reviewed = []; // sans relecture, on ne propose rien : mieux vaut aucun cas qu'un cas non vérifié
  }

  /* 3. Contrôles automatiques */
  const final = reviewed.map((k) => checkCase(k, course)).filter((x): x is CaseOut => x !== null);
  if (final.length === 0) throw new Error("nocase");
  return JSON.stringify(final);
}

/** Enregistre le contenu généré sur le document (visible aussi dans l'application mobile). */
export async function saveToDocument(
  docId: string,
  userId: string,
  patch: { fiche?: string; flashcards?: string; clinical_case?: string },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Le service n'est pas configuré.");
  const { error } = await sb.from("documents").update(patch).eq("id", docId).eq("user_id", userId);
  if (error) throw new Error("Impossible d'enregistrer. Réessaie.");
}
