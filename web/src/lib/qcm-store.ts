import type { Key, Qcm } from "./course";
import { getSupabase } from "./supabase";

export type Answer = { sel: Key[]; done: boolean };

export type QcmSetRow = {
  id: string;
  document_id: string;
  chapter_title: string;
  questions: Qcm[];
  answers: Answer[];
  points: number;
  total: number;
  finished: boolean;
  created_at: string;
};

/** Liste des séries de QCM d'un cours (la plus récente d'abord). `available` est faux si la table n'existe pas encore. */
export async function listQcmSets(docId: string): Promise<{ rows: QcmSetRow[]; available: boolean }> {
  const sb = getSupabase();
  if (!sb) return { rows: [], available: false };
  const { data, error } = await sb
    .from("qcm_sets")
    .select("id,document_id,chapter_title,questions,answers,points,total,finished,created_at")
    .eq("document_id", docId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { rows: [], available: false };
  return { rows: (data ?? []) as QcmSetRow[], available: true };
}

export async function createQcmSet(
  userId: string,
  docId: string,
  chapter: string,
  questions: Qcm[],
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const answers: Answer[] = questions.map(() => ({ sel: [], done: false }));
  const { data, error } = await sb
    .from("qcm_sets")
    .insert({
      user_id: userId,
      document_id: docId,
      chapter_title: chapter,
      questions,
      answers,
      total: questions.length * 10,
    })
    .select("id")
    .single();
  return error ? null : ((data as { id: string }).id ?? null);
}

export async function updateQcmSet(
  id: string,
  patch: { answers: Answer[]; points: number; finished: boolean },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb
    .from("qcm_sets")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function deleteQcmSet(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("qcm_sets").delete().eq("id", id);
}
