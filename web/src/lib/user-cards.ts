import type { SrsMap } from "./flashcard-store";
import type { SRSState } from "./srs";
import { isDue, isMastered } from "./srs";
import { getSupabase } from "./supabase";
import { track } from "./track";

/*
  « Mes cartes » : les flashcards que l'étudiant crée lui-même. Les cartes générées par l'IA (dans chaque cours)
  ne sont pas touchées : celles-ci sont en lecture seule, celles-là sont modifiables et supprimables.
*/

export type CardSource = "manual" | "selection" | "chat" | "qcm";

export type UserCard = {
  id: string;
  document_id: string | null;
  chapter: string | null;
  front: string;
  back: string;
  source: CardSource;
  created_at: string;
  updated_at: string;
};

export type CardDraft = {
  front: string;
  back: string;
  document_id?: string | null;
  chapter?: string | null;
  source: CardSource;
};

/** Limites de cartes créées par l'étudiant : Gratuit = 5 au total ; Standard = 50 par mois ; Premium = illimité. */
export const FREE_CARDS_TOTAL = 5;
export const STANDARD_CARDS_PER_MONTH = 50;

export type CardUsage = { total: number; month: number };

/** Ce que l'offre permet, et où l'étudiant en est. `max` est null quand il n'y a pas de limite. */
export function cardAllowance(plan: string | undefined, usage: CardUsage): { max: number | null; used: number; per: "total" | "month" } {
  if (!plan || plan === "freemium" || plan === "trial") return { max: FREE_CARDS_TOTAL, used: usage.total, per: "total" };
  if (plan === "standard" || plan === "one_subject" || plan === "three_subjects") return { max: STANDARD_CARDS_PER_MONTH, used: usage.month, per: "month" };
  return { max: null, used: usage.total, per: "total" };
}

export function usageOf(cards: UserCard[]): CardUsage {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return { total: cards.length, month: cards.filter((c) => +new Date(c.created_at) >= +start).length };
}
export const FRONT_MAX = 600;
export const BACK_MAX = 1500;

export type CardResult = { card?: UserCard; error?: "limit" | "invalid" | "other" };

const COLS = "id,document_id,chapter,front,back,source,created_at,updated_at";

export async function listCards(): Promise<UserCard[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("user_cards").select(COLS).order("created_at", { ascending: false }).limit(2000);
  return (data ?? []) as UserCard[];
}

export async function createCard(userId: string, d: CardDraft): Promise<CardResult> {
  const sb = getSupabase();
  if (!sb) return { error: "other" };
  const front = d.front.trim();
  const back = d.back.trim();
  if (!front || !back || front.length > FRONT_MAX || back.length > BACK_MAX) return { error: "invalid" };
  const { data, error } = await sb
    .from("user_cards")
    .insert({ user_id: userId, front, back, document_id: d.document_id ?? null, chapter: d.chapter?.trim() || null, source: d.source })
    .select(COLS)
    .single();
  if (error) return { error: /card_limit_reached/.test(error.message) ? "limit" : "other" };
  track("card_created", { source: d.source });
  return { card: data as UserCard };
}

export async function updateCard(id: string, d: Pick<CardDraft, "front" | "back" | "document_id" | "chapter">): Promise<CardResult> {
  const sb = getSupabase();
  if (!sb) return { error: "other" };
  const front = d.front.trim();
  const back = d.back.trim();
  if (!front || !back || front.length > FRONT_MAX || back.length > BACK_MAX) return { error: "invalid" };
  const { data, error } = await sb
    .from("user_cards")
    .update({ front, back, document_id: d.document_id ?? null, chapter: d.chapter?.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLS)
    .single();
  return error ? { error: "other" } : { card: data as UserCard };
}

export async function deleteCard(id: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from("user_cards").delete().eq("id", id);
  return !error;
}

/** Progression de toutes les cartes de l'étudiant, par identifiant de carte. */
export async function loadAllCardSrs(): Promise<Record<string, SRSState>> {
  const sb = getSupabase();
  if (!sb) return {};
  const { data } = await sb.from("user_card_srs").select("card_id,stability,difficulty,due,last_review");
  const out: Record<string, SRSState> = {};
  for (const r of data ?? []) {
    out[r.card_id as string] = {
      stability: r.stability as number,
      difficulty: r.difficulty as number,
      due: r.due as string,
      lastReview: r.last_review as string,
    };
  }
  return out;
}

/** Même contrat que flashcard-store pour le lecteur de cartes : la progression est indexée par position dans `cards`. */
export function makeCardStore(userId: string, cards: UserCard[]) {
  return {
    async load(): Promise<{ map: SrsMap; cloud: boolean }> {
      const all = await loadAllCardSrs();
      const map: SrsMap = {};
      cards.forEach((c, i) => {
        if (all[c.id]) map[i] = all[c.id];
      });
      return { map, cloud: true };
    },
    save(index: number, state: SRSState) {
      const sb = getSupabase();
      const card = cards[index];
      if (!sb || !card) return;
      void sb.from("user_card_srs").upsert({
        user_id: userId,
        card_id: card.id,
        stability: state.stability,
        difficulty: state.difficulty,
        due: state.due,
        last_review: state.lastReview,
      });
    },
  };
}

export const dueCards = (cards: UserCard[], srs: Record<string, SRSState>) => cards.filter((c) => isDue(srs[c.id]));
export const masteredCount = (cards: UserCard[], srs: Record<string, SRSState>) => cards.filter((c) => isMastered(srs[c.id])).length;

/** Pré-remplit une carte à partir d'un QCM : la question, les bonnes réponses et le pourquoi. */
export function draftFromQcm(
  q: { question: string; propositions: Record<string, string>; bonnesReponses: string[]; explication: Record<string, string>; commentaire?: string },
  chapter: string,
  documentId: string,
): CardDraft {
  const good = q.bonnesReponses.map((k) => `✓ ${q.propositions[k] ?? ""}`).join("\n");
  const why = (q.commentaire ?? q.explication[q.bonnesReponses[0]] ?? "").trim();
  let back = why ? `${good}\n\n${why}` : good;
  if (back.length > BACK_MAX) back = back.slice(0, BACK_MAX - 1) + "…";
  return { front: q.question.slice(0, FRONT_MAX), back, document_id: documentId, chapter, source: "qcm" };
}

/** Pré-remplit une carte à partir d'une réponse de Dr. Ahmed : sa question, et la réponse nettoyée de la mise en forme. */
export function draftFromChat(question: string, answer: string, documentId: string | null): CardDraft {
  const clean = answer
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
  return {
    front: question.trim().slice(0, FRONT_MAX),
    back: clean.length > BACK_MAX ? clean.slice(0, BACK_MAX - 1) + "…" : clean,
    document_id: documentId,
    source: "chat",
  };
}
