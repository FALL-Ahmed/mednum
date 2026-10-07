import type { SRSState } from "./srs";
import { getSupabase } from "./supabase";

/*
  Progression des flashcards d'un cours. Sauvegardée dans Supabase (table flashcard_srs) ;
  une copie locale sert de secours si la table n'est pas encore activée ou hors connexion.
*/

export type SrsMap = Record<number, SRSState>;

const localKey = (userId: string, docId: string) => `axone.srs.${userId}.${docId}`;

function readLocal(userId: string, docId: string): SrsMap {
  try {
    const raw = localStorage.getItem(localKey(userId, docId));
    return raw ? (JSON.parse(raw) as SrsMap) : {};
  } catch {
    return {};
  }
}

function writeLocal(userId: string, docId: string, map: SrsMap) {
  try {
    localStorage.setItem(localKey(userId, docId), JSON.stringify(map));
  } catch {
    /* stockage plein ou bloqué : la progression reste dans Supabase */
  }
}

/** Charge la progression. `cloud` est faux si la table Supabase n'est pas disponible. */
export async function loadSrs(userId: string, docId: string): Promise<{ map: SrsMap; cloud: boolean }> {
  const local = readLocal(userId, docId);
  const sb = getSupabase();
  if (!sb) return { map: local, cloud: false };
  const { data, error } = await sb
    .from("flashcard_srs")
    .select("card_index,stability,difficulty,due,last_review")
    .eq("document_id", docId);
  if (error) return { map: local, cloud: false };
  const map: SrsMap = {};
  for (const r of data ?? []) {
    map[r.card_index as number] = {
      stability: r.stability as number,
      difficulty: r.difficulty as number,
      due: r.due as string,
      lastReview: r.last_review as string,
    };
  }
  writeLocal(userId, docId, map);
  return { map, cloud: true };
}

export async function saveSrs(userId: string, docId: string, index: number, state: SRSState, all: SrsMap) {
  writeLocal(userId, docId, all);
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("flashcard_srs").upsert({
    user_id: userId,
    document_id: docId,
    card_index: index,
    stability: state.stability,
    difficulty: state.difficulty,
    due: state.due,
    last_review: state.lastReview,
  });
}
