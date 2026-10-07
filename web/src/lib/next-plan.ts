"use client";

import { useEffect, useState } from "react";
import { isPaid, useApp } from "@/components/app-context";
import { getSupabase } from "./supabase";

export type NextPlanLimits = {
  daily_questions: number;
  daily_qcm: number; // en séries (une série = 5 questions)
  daily_contents: number;
  max_documents: number | null;
};

/**
 * Le plan supérieur proposé à l'étudiant et ce qu'il offre, lu en direct dans plan_limits
 * (donc toujours aligné sur ce qui est réglé dans l'admin). Gratuit → Standard ; Standard → Premium ; Premium → rien.
 */
export function useNextPlan() {
  const { quota } = useApp();
  const plan = quota?.plan ?? "freemium";
  const key: "standard" | "premium" | null = plan === "standard" ? "premium" : isPaid(plan) ? null : "standard";
  const [lim, setLim] = useState<NextPlanLimits | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !key) return;
    let cancelled = false;
    sb.from("plan_limits")
      .select("daily_questions,daily_qcm,daily_contents,max_documents")
      .eq("plan", key)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setLim(data as NextPlanLimits);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { plan, key, name: key === "premium" ? "Premium" : "Standard", lim, free: !isPaid(plan) };
}
