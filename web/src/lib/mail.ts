import { getSupabase } from "./supabase";

/** Demande l'e-mail de bienvenue (envoyé une seule fois par compte côté serveur). Silencieux en cas d'échec. */
export async function requestWelcomeEmail(): Promise<void> {
  try {
    const sb = getSupabase();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!sb || !url || !anon) return;
    const { data } = await sb.auth.getSession();
    if (!data.session) return;
    await fetch(`${url}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, apikey: anon },
      body: JSON.stringify({ type: "welcome" }),
      keepalive: true,
    });
  } catch {
    /* l'e-mail de bienvenue ne doit jamais gêner l'inscription */
  }
}
