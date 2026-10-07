import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Conditions d'utilisation — Axone",
  description: "Les conditions d'utilisation, le paiement et le remboursement d'Axone.",
};

export default function Page() {
  return <LegalPage kind="terms" lang="fr" />;
}
