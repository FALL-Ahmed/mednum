import { IBM_Plex_Sans_Arabic, Readex_Pro } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { AppLangRoot } from "@/components/app-lang-root";

// Polices arabes (les mêmes que la version arabe de l'accueil). `preload: false` : elles ne sont téléchargées qu'en arabe.
const titres = IBM_Plex_Sans_Arabic({
  variable: "--font-ar-titres",
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  preload: false,
});
const texte = Readex_Pro({ variable: "--font-ar-texte", subsets: ["arabic", "latin"], display: "swap", preload: false });

export default function EspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLangRoot fontClass={`${titres.variable} ${texte.variable}`}>
      <AppShell>{children}</AppShell>
    </AppLangRoot>
  );
}
