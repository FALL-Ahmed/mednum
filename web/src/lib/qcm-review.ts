import { scoreQcm, type Qcm } from "./course";
import { getSupabase } from "./supabase";
import type { Answer } from "./qcm-store";

/*
  « Mes erreurs » : une question ratée (faux ou partiel) entre dans la liste et revient demain ; chaque réussite de suite
  repousse l'échéance (+2 jours, +6 jours), et à la 3e la question est maîtrisée. Le calcul est fait en base (qcm_review_record).
*/

export type ReviewRow = {
  id: string;
  document_id: string | null;
  doc_name: string;
  chapter_title: string;
  question: Qcm;
  wrong_count: number;
  streak: number;
  mastered: boolean;
  due_at: string | null;
};

export type ReviewStats = {
  available: boolean;
  due: number;
  total: number;
  mastered: number;
  byDoc: { id: string; name: string; due: number; total: number }[];
};

/** Enregistre une réponse. N'échoue jamais bruyamment : la révision est un plus, le QCM continue quoi qu'il arrive. */
export async function recordAnswer(
  doc: { id: string; name: string },
  chapter: string,
  q: Qcm,
  sel: Answer["sel"],
  review = false,
): Promise<boolean> {
  try {
    const sb = getSupabase();
    if (!sb) return false;
    const correct = scoreQcm(sel, q.bonnesReponses).result === "COMPLET";
    const { error } = await sb.rpc("qcm_review_record", {
      p_doc: doc.id,
      p_doc_name: doc.name,
      p_chapter: chapter,
      p_question: q,
      p_correct: correct,
      p_review: review,
    });
    return !error && correct;
  } catch {
    return false;
  }
}

/** Compteurs (à revoir aujourd'hui, au total, maîtrisées), globaux ou pour un seul cours. */
export async function reviewStats(docId?: string): Promise<ReviewStats> {
  const empty: ReviewStats = { available: false, due: 0, total: 0, mastered: 0, byDoc: [] };
  const sb = getSupabase();
  if (!sb) return empty;
  let query = sb.from("qcm_review").select("document_id,doc_name,mastered,due_at").limit(2000);
  if (docId) query = query.eq("document_id", docId);
  const { data, error } = await query;
  if (error) return empty;
  const now = Date.now();
  const rows = (data ?? []) as Pick<ReviewRow, "document_id" | "doc_name" | "mastered" | "due_at">[];
  const by = new Map<string, { id: string; name: string; due: number; total: number }>();
  let due = 0;
  let mastered = 0;
  for (const r of rows) {
    if (r.mastered) {
      mastered++;
      continue;
    }
    const isDue = !r.due_at || +new Date(r.due_at) <= now;
    if (isDue) due++;
    const id = r.document_id ?? "";
    const cur = by.get(id) ?? { id, name: r.doc_name, due: 0, total: 0 };
    cur.total++;
    if (isDue) cur.due++;
    by.set(id, cur);
  }
  return {
    available: true,
    due,
    total: rows.length - mastered,
    mastered,
    byDoc: [...by.values()].filter((d) => d.id).sort((a, b) => b.due - a.due || b.total - a.total),
  };
}

/** Les questions à revoir maintenant (les plus en retard d'abord). */
export async function loadDue(docId?: string, limit = 10): Promise<ReviewRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let query = sb
    .from("qcm_review")
    .select("id,document_id,doc_name,chapter_title,question,wrong_count,streak,mastered,due_at")
    .eq("mastered", false)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);
  if (docId) query = query.eq("document_id", docId);
  const { data, error } = await query;
  return error ? [] : ((data ?? []) as ReviewRow[]);
}
