// Répétition espacée — FSRS, le même algorithme et les mêmes réglages que l'application mobile (Axone/src/utils/srs.ts).
// Chaque carte est décrite par une Difficulté (D) et une Stabilité (S).

export type SRSState = {
  stability: number; // S : jours avant que la probabilité de rappel tombe à 90 %
  difficulty: number; // D : 1 (facile) à 10 (difficile)
  due: string; // date ISO (AAAA-MM-JJ) de la prochaine révision
  lastReview: string; // date ISO de la dernière révision
};

export type Rating = "again" | "hard" | "good" | "easy";

const GRADE: Record<Rating, number> = { again: 1, hard: 2, good: 3, easy: 4 };

const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605,
  2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const REQUEST_RETENTION = 0.9; // 90 % de chances de rappel au moment dû
// Le but est de réviser un cours avant un examen : on garde le cycle resserré (21 jours au plus).
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

const clampDifficulty = (d: number) => Math.min(10, Math.max(1, d));

const retrievability = (elapsedDays: number, stability: number) =>
  Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);

function intervalFromStability(stability: number): number {
  const raw = (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return Math.min(raw, MAX_INTERVAL_DAYS);
}

const initialStability = (grade: number) => W[grade - 1];
const initialDifficulty = (grade: number) => clampDifficulty(W[4] - Math.exp(W[5] * (grade - 1)) + 1);

function nextDifficulty(prev: number, grade: number): number {
  const deltaD = -W[6] * (grade - 3);
  const linear = prev + (deltaD * (10 - prev)) / 9;
  return clampDifficulty(W[7] * initialDifficulty(4) + (1 - W[7]) * linear);
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
    Math.pow(difficulty, -W[12]) * (Math.pow(stability + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)) * W[11];
  return Math.min(sf, stability);
}

export function isDue(state: SRSState | undefined): boolean {
  if (!state) return true;
  return state.due <= todayISO();
}

/** Une carte est « maîtrisée » quand sa stabilité atteint 4 jours. */
export function isMastered(state: SRSState | undefined): boolean {
  return !!state && state.stability >= 4;
}

/** Fait progresser une carte selon la note de l'étudiant. */
export function reviewCard(state: SRSState | undefined, rating: Rating): SRSState {
  const grade = GRADE[rating];
  const today = todayISO();

  if (!state || !state.stability) {
    const stability = initialStability(grade);
    const difficulty = initialDifficulty(grade);
    return { stability, difficulty, due: addDays(intervalFromStability(stability)), lastReview: today };
  }

  const elapsed = daysBetween(state.lastReview, today);
  const r = retrievability(elapsed, state.stability);
  const difficulty = nextDifficulty(state.difficulty, grade);
  const stability =
    grade === 1
      ? nextStabilityFailure(state.stability, state.difficulty, r)
      : nextStabilitySuccess(state.stability, state.difficulty, r, grade);
  return { stability, difficulty, due: addDays(intervalFromStability(stability)), lastReview: today };
}
