"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/** Session courante. Redirige vers /connexion s'il n'y a pas de session. */
export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      router.replace("/connexion");
      return;
    }
    // detectSessionInUrl finalise la connexion Google au retour de la redirection.
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setReady(true);
      if (!session) router.replace("/connexion");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  return { user, ready };
}
