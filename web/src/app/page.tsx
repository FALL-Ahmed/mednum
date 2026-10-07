import type { Metadata } from "next";
import { Landing } from "./landing";

export const metadata: Metadata = {
  alternates: { canonical: "/", languages: { fr: "/", ar: "/ar" } },
};

export default function Home() {
  return <Landing lang="fr" />;
}
