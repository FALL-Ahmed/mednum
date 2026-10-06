import type { Metadata } from "next";
import { ConnexionView } from "@/components/connexion-view";
import { SITE } from "@/lib/site-i18n";

export const metadata: Metadata = { title: SITE.ar.htmlTitle };

export default function ConnexionAr() {
  return <ConnexionView lang="ar" />;
}
