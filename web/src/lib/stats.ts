export type PublicStats = { students: number; questionsWeek: number };

/**
 * Totaux publics lus depuis Supabase (fonction public_stats, voir supabase/migrations).
 * Renvoie null si Supabase n'est pas configuré ou ne répond pas : le site masque alors les chiffres.
 */
export async function getPublicStats(): Promise<PublicStats | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/public_stats`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (typeof d?.students !== "number" || typeof d?.questions_week !== "number") return null;
    return { students: d.students, questionsWeek: d.questions_week };
  } catch {
    return null;
  }
}
