import { IBM_Plex_Sans_Arabic, Readex_Pro } from "next/font/google";

// Mêmes polices que loop-ia.com : IBM Plex Sans Arabic pour les titres, Readex Pro pour le texte.
const titres = IBM_Plex_Sans_Arabic({
  variable: "--font-ar-titres",
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const texte = Readex_Pro({
  variable: "--font-ar-texte",
  subsets: ["arabic", "latin"],
  display: "swap",
});

/** Section en arabe : lecture de droite à gauche et polices arabes. Le reste du site reste en français. */
export default function ArabicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      lang="ar"
      dir="rtl"
      className={`${titres.variable} ${texte.variable}`}
      style={{ "--font-display": "var(--font-ar-titres)", "--font-body": "var(--font-ar-texte)", "--font-mono": "var(--font-ar-texte)", fontFamily: "var(--font-body), system-ui, sans-serif" } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
