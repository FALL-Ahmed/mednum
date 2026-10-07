import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Confidentialité — Axone",
  description: "Quelles informations Axone garde, pourquoi, et comment tu gardes la main dessus.",
};

export default function Page() {
  return <LegalPage kind="privacy" lang="fr" />;
}
