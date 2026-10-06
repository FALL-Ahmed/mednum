import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  display: "swap",
});

const body = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const mono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Axone — Dépose ton cours, retiens-le",
  description:
    "Axone transforme tes cours en fiches, QCM, flashcards et cas cliniques. Pour les étudiants en médecine et pharmacie de Mauritanie, du Sénégal et du Maroc.",
  openGraph: {
    title: "Axone — Dépose ton cours, retiens-le",
    description:
      "Fiches, QCM, flashcards et cas cliniques générés depuis tes cours. Mauritanie, Sénégal, Maroc.",
    type: "website",
    locale: "fr_FR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
