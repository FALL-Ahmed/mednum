"use client";

import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type Profile = {
  name: string;
  promotion_name: string | null;
  promotion_id: string | null;
  country: string | null;
  school_name: string | null;
};

export type Limits = {
  questions: number;
  qcm: number;
  contents: number;
  used_qcm: number;
  used_contents: number;
  max_documents: number | null;
  pdf_export: boolean;
  history_days: number | null;
};

export type Quota = {
  daily_used: number;
  daily_limit: number;
  plan: string;
  expires_at?: string | null;
  limits?: Limits;
};

export type DocSummary = {
  id: string;
  name: string;
  subject_name: string | null;
  pages: number;
  updated_at: string;
};

export type AppCtx = {
  user: User;
  profile: Profile;
  /** Identifiant sous lequel vivent le quota et l'abonnement (appareil relié, sinon uid). */
  quotaKey: string;
  quota: Quota | null;
  docs: DocSummary[] | null;
  /** Prix mensuel du plan Standard (MRU), s'il est connu. */
  standardPrice: number | null;
  refreshQuota: () => Promise<void>;
  refreshDocs: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp doit être utilisé dans l'espace connecté.");
  return ctx;
}

export const PLAN_LABEL: Record<string, string> = {
  trial: "Gratuit",
  freemium: "Gratuit",
  standard: "Standard",
  premium: "Duo",
  one_subject: "1 matière",
  three_subjects: "3 matières",
  full: "Accès complet",
};

export const isPaid = (plan: string | undefined) =>
  !!plan && !["trial", "freemium"].includes(plan);
