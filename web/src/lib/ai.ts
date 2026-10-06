import { getSupabase } from "./supabase";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export type ChatMsg = { role: "user" | "assistant"; content: string | ContentBlock[] };

export class QuotaError extends Error {}

/**
 * Appelle la fonction serveur `ask` (la clé IA reste côté serveur). Le jeton de l'utilisateur identifie
 * le compte pour le quota. `userId` est envoyé aussi pour rester compatible avec la version actuelle
 * de la fonction, qui le lit dans le corps de la requête.
 *
 * Si `signal` est interrompu (bouton « Arrêter »), la fonction renvoie le texte reçu jusque-là.
 */
export async function askAI(opts: {
  system?: string;
  messages: ChatMsg[];
  maxTokens?: number;
  /** 'chat' (défaut) ou 'qcm' : compteurs journaliers séparés côté serveur. */
  kind?: "chat" | "qcm" | "fiche" | "flashcards" | "case";
  /** Suite d'une génération déjà comptée (flashcards par chapitre) : 2, 3, … */
  part?: number;
  signal?: AbortSignal;
  onText?: (soFar: string) => void;
}): Promise<string> {
  const sb = getSupabase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sb || !url || !anon) throw new Error("Le service n'est pas configuré.");

  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!session) throw new Error("Connecte-toi pour continuer.");

  let text = "";
  try {
    const res = await fetch(`${url}/functions/v1/ask`, {
      method: "POST",
      signal: opts.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: anon,
      },
      body: JSON.stringify({
        userId: session.user.id,
        system: opts.system,
        messages: opts.messages,
        maxTokens: opts.maxTokens ?? 1500,
        kind: opts.kind ?? "chat",
        part: opts.part,
      }),
    });

    if (res.status === 429) {
      throw new QuotaError("Tu as atteint ta limite du jour. Reviens demain ou passe à un plan supérieur.");
    }
    if (!res.ok || !res.body) {
      throw new Error("Dr. Ahmed est indisponible pour le moment. Réessaie dans un instant.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.t) {
            text += d.t;
            opts.onText?.(text);
          }
          if (d.done) return text;
        } catch {
          /* ligne SSE incomplète */
        }
      }
    }
    return text;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return text;
    throw e;
  }
}
