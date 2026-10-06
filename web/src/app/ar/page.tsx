import type { Metadata } from "next";
import { Landing } from "../landing";
import { SITE } from "@/lib/site-i18n";

export const metadata: Metadata = {
  title: SITE.ar.htmlTitle,
  description: SITE.ar.htmlDescription,
  alternates: { languages: { fr: "/", ar: "/ar" } },
  openGraph: { title: SITE.ar.htmlTitle, description: SITE.ar.htmlDescription, type: "website", locale: "ar_AR" },
};

export default function HomeAr() {
  return <Landing lang="ar" />;
}
