import type { Key, Qcm } from "./course";
import { getSupabase } from "./supabase";

export type DuoMember = { user_id: string; name: string; is_host: boolean; finished: boolean; answered: number };
export type DuoAnswer = { user_id: string; idx: number; sel: Key[]; points: number };
export type DuoMessage = { id: number; user_id: string; body: string; created_at: string };

export type DuoState = {
  code: string;
  title: string;
  questions: Qcm[];
  expires_at: string;
  me: string;
  members: DuoMember[];
  answers: DuoAnswer[];
  messages: DuoMessage[];
};

export type DuoListItem = {
  code: string;
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

export function duoLink(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/rejoindre/${code}`;
}

const MESSAGES: Record<string, string> = {
  duo_plan_required: "La révision à deux est réservée au plan Duo.",
  duo_daily_limit: "Tu as déjà créé 10 sessions aujourd'hui. Reprends une session en cours ou réessaie demain.",
  duo_not_found: "Ce code ne correspond à aucune session. Vérifie-le avec ton partenaire.",
  duo_expired: "Cette session est terminée (elle dure 48 heures).",
  duo_full: "Cette session a déjà deux participants.",
  duo_not_member: "Tu ne fais pas partie de cette session.",
  duo_chat_full: "La discussion de cette session est pleine.",
  not_authenticated: "Connecte-toi pour continuer.",
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
