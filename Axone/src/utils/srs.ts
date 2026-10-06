// Répétition espacée — FSRS (Free Spaced Repetition Scheduler), l'algorithme qui a
// remplacé SM-2 dans Anki (23.10+) et la plupart des apps sérieuses en 2025-2026.
// Modélise chaque carte par Difficulté (D) et Stabilité (S) plutôt qu'un simple
// facteur de facilité — prédictions d'intervalle nettement plus précises que SM-2.
// Poids par défaut officiels FSRS v4.5 (dérivés de dizaines de milliers de révisions
// réelles). Réf : https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm

export type SRSState = {
  stability: number;   // S — jours avant que la probabilité de rappel tombe à 90%
  difficulty: number;  // D — 1 (facile) à 10 (difficile)
  due: string;         // date ISO (YYYY-MM-DD) de la prochaine révision
  lastReview: string;  // date ISO de la dernière révision (pour le temps écoulé)
};

export type Rating = 'again' | 'hard' | 'good' | 'easy';

const GRADE: Record<Rating, number> = { again: 1, hard: 2, good: 3, easy: 4 };

const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const REQUEST_RETENTION = 0.9; // rétention cible : 90% de chances de rappel au moment dû

// Plafond d'intervalle — sans lui, FSRS suppose un apprentissage à vie (comme une langue)
// et peut repousser une carte à 100+ jours. Ici l'usage réel est la révision d'un cours
// précis pour un examen à venir (partiel), pas une mémorisation à vie : on garde le cycle
// de révision resserré plutôt que de suivre l'intervalle par défaut d'Anki (120-180j,
// pensé pour du vocabulaire de langue).
const MAX_INTERVAL_DAYS = 21;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, Math.round(days)));
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const ms = new Date(toISO).getTime() - new Date(fromISO).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

function clampDifficulty(d: number): number {
  return Math.min(10, Math.max(1, d));
}

// Probabilité de rappel après `elapsedDays` jours, pour une stabilité donnée.
function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

// Intervalle (en jours) pour lequel la rétention prévue retombe à REQUEST_RETENTION,
// plafonné à MAX_INTERVAL_DAYS.
function intervalFromStability(stability: number): number {
  const raw = (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return Math.min(raw, MAX_INTERVAL_DAYS);
}

function initialStability(grade: number): number {
  return W[grade - 1];
}

function initialDifficulty(grade: number): number {
  return clampDifficulty(W[4] - Math.exp(W[5] * (grade - 1)) + 1);
}

function nextDifficulty(prevDifficulty: number, grade: number): number {
  const deltaD = -W[6] * (grade - 3);
  const linear = prevDifficulty + (deltaD * (10 - prevDifficulty)) / 9;
  const meanReversion = W[7] * initialDifficulty(4) + (1 - W[7]) * linear;
  return clampDifficulty(meanReversion);
}

function nextStabilitySuccess(stability: number, difficulty: number, r: number, grade: number): number {
  const hardPenalty = grade === 2 ? W[15] : 1;
  const easyBonus = grade === 4 ? W[16] : 1;
  const alpha =
    1 +
    (11 - difficulty) *
      Math.pow(stability, -W[9]) *
      (Math.exp(W[10] * (1 - r)) - 1) *
      hardPenalty *
      easyBonus *
      Math.exp(W[8]);
  return stability * alpha;
}

function nextStabilityFailure(stability: number, difficulty: number, r: number): number {
  const sf =
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r)) *
    W[11];
  return Math.min(sf, stability);
}

export function isDue(state: SRSState | undefined): boolean {
  if (!state) return true;
  return state.due <= todayISO();
}

// Une carte est "maîtrisée" une fois sa stabilité ≥ 4 jours — la mémoire tient
// naturellement plusieurs jours, pas juste vue une fois puis oubliée.
export function isMastered(state: SRSState | undefined): boolean {
  return !!state && state.stability >= 4;
}

// Fait progresser une carte selon la note donnée par l'élève (Anki : Again/Hard/Good/Easy).
export function reviewCard(state: SRSState | undefined, rating: Rating): SRSState {
  const grade = GRADE[rating];
  const today = todayISO();

  if (!state || !state.stability) {
    // Première révision de cette carte — pas d'historique, formules d'initialisation.
    const stability = initialStability(grade);
    const difficulty = initialDifficulty(grade);
    return { stability, difficulty, due: addDays(intervalFromStability(stability)), lastReview: today };
  }

  const elapsed = daysBetween(state.lastReview, today);
  const r = retrievability(elapsed, state.stability);

  const difficulty = nextDifficulty(state.difficulty, grade);
  const stability = grade === 1
    ? nextStabilityFailure(state.stability, state.difficulty, r)
    : nextStabilitySuccess(state.stability, state.difficulty, r, grade);

  return { stability, difficulty, due: addDays(intervalFromStability(stability)), lastReview: today };
}
