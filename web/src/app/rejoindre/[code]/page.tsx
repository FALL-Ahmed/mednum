"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cleanCode, PENDING_KEY } from "@/lib/duo";

/** Lien d'invitation : on retient le code, puis on envoie vers l'espace (la connexion se fait en route). */
export default function Rejoindre({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();

  useEffect(() => {
    try {
      localStorage.setItem(PENDING_KEY, cleanCode(code));
    } catch {
      /* stockage indisponible : l'élève saisira le code à la main */
    }
    router.replace("/app/duo");
  }, [code, router]);

  return (
    <main className="grid min-h-screen place-items-center px-5">
      <p className="text-muted">Ouverture de l&apos;invitation…</p>
    </main>
  );
}
