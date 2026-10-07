import type { Key, Qcm } from "./course";
import { getSupabase } from "./supabase";

export type DuoMember = { user_id: string; name: string; is_host: boolean; finished: boolean; answered: number };
export type DuoKind = "qcm" | "room" | "case" | "flashcards";
/** Réponse : pour un QCM, les lettres choisies ; pour un cas clinique, un texte ; pour les flashcards, ["known"] ou ["unknown"]. */
export type DuoAnswer = { user_id: string; idx: number; sel: Key[] | string; points: number };
export type DuoMessage = { id: number; user_id: string | null; body: string; created_at: string; is_ai?: boolean; tag?: string | null };

export type DuoCard = { front: string; back: string; chapter?: string };
export type DuoCase = {
  title: string;
  context: string;
  stages: { label: string; reveal: string; prompt: string }[];
  diagnosis: string;
  differentials?: string;
  reasoning: string;
  management: string;
};
export type DuoRoomPayload = { name: string; chunks: { title: string; content: string }[] };

export type DuoState = {
  code: string;
  kind: DuoKind;
  title: string;
  questions: Qcm[];
  /** Contenu des sessions autres que les QCM : cartes, cas clinique ou cours de la salle. */
  payload: unknown;
  expires_at: string;
  me: string;
  members: DuoMember[];
  answers: DuoAnswer[];
  messages: DuoMessage[];
};

export type DuoListItem = {
  code: string;
  kind: DuoKind;
  title: string;
  created_at: string;
  expires_at: string;
  total: number;
  is_host: boolean;
  answered: number;
  points: number;
  partner: string | null;
};

/** Mémorise le code d'une invitation le temps de se connecter (la page /rejoindre/CODE peut être ouverte hors connexion). */
export const PENDING_KEY = "axone.duo.pending";

export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/** Adresse publique du site : le lien d'invitation doit marcher chez l'ami, même si tu testes en local. */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.axonerevision.com").replace(/\/+$/, "");

export function duoLink(code: string): string {
  return `${SITE_URL}/rejoindre/${code}`;
}

const MESSAGES: Record<string, string> = {
  duo_plan_required: "La révision à deux est réservée au plan Premium.",
  duo_daily_limit: "Tu as déjà créé 10 sessions aujourd'hui. Reprends une session en cours ou réessaie demain.",
  duo_not_found: "Ce code ne correspond à aucune session. Vérifie-le avec ton partenaire.",
  duo_expired: "Cette session est terminée.",
  duo_full: "Cette session a déjà deux participants.",
  duo_not_member: "Tu ne fais pas partie de cette session.",
  duo_chat_full: "La discussion de cette session est pleine.",
  not_authenticated: "Connecte-toi pour continuer.",
  quota_exceeded: "Le quota du jour de l'abonné Premium est atteint. Réessayez demain.",
  ai_failed: "Dr. Ahmed est indisponible pour le moment. Réessaie dans un instant.",
  not_finished: "Vous devez tous les deux avoir terminé le cas.",
  invalid_payload: "Ce contenu ne peut pas être partagé.",
};

export function duoError(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  const key = Object.keys(MESSAGES).find((k) => m.includes(k));
  return key ? MESSAGES[key] : "Le service est indisponible pour le moment. Réessaie dans un instant.";
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { data: null, error: "Le service n'est pas configuré." };
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { data: null, error: duoError(error) };
  return { data: data as T, error: null };
}

export const createDuo = (title: string, questions: Qcm[], name: string) =>
  call<string>("duo_create", { p_title: title, p_questions: questions, p_name: name });

export const joinDuo = (code: string, name: string) => call<string>("duo_join", { p_code: code, p_name: name });

export const getDuoState = (code: string) => call<DuoState>("duo_state", { p_code: code });

export const answerDuo = (code: string, idx: number, sel: Key[]) =>
  call<number>("duo_answer", { p_code: code, p_idx: idx, p_sel: sel });

export const sendDuo = (code: string, body: string) => call<null>("duo_send", { p_code: code, p_body: body });

export const listDuo = () => call<DuoListItem[]>("duo_list");

export const createDuoV2 = (kind: Exclude<DuoKind, "qcm">, title: string, payload: unknown, name: string) =>
  call<string>("duo_create_v2", { p_kind: kind, p_title: title, p_payload: payload, p_name: name });

/** Cas clinique : réponse écrite à une étape (0 à 3) ou diagnostic final (4). */
export const submitDuoText = (code: string, idx: number, text: string) =>
  call<null>("duo_submit_text", { p_code: code, p_idx: idx, p_text: text });

/** Flashcards : « je savais » ou « je ne savais pas ». */
export const rateDuo = (code: string, idx: number, known: boolean) =>
  call<null>("duo_rate", { p_code: code, p_idx: idx, p_known: known });

/** Dr. Ahmed dans la session : une question dans la salle, ou la comparaison des raisonnements d'un cas. */
export async function askDuoAi(code: string, action: "ask" | "case_feedback", text?: string): Promise<{ error: string | null }> {
  const sb = getSupabase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sb || !url || !anon) return { error: "Le service n'est pas configuré." };
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: MESSAGES.not_authenticated };
  try {
    const res = await fetch(`${url}/functions/v1/duo-ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code, action, text }),
    });
    if (res.ok) return { error: null };
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: duoError(new Error(j.error ?? "ai_failed")) };
  } catch {
    return { error: MESSAGES.ai_failed };
  }
}
