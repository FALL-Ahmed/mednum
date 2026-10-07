import type { MetadataRoute } from "next";

const BASE = "https://www.axonerevision.com";

// Pages publiques seulement : l'espace connecté (/app) n'est pas indexé.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly") => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });
  return [
    { ...page("", 1, "weekly"), alternates: { languages: { fr: `${BASE}/`, ar: `${BASE}/ar` } } },
    { ...page("/ar", 0.9, "weekly"), alternates: { languages: { fr: `${BASE}/`, ar: `${BASE}/ar` } } },
    page("/connexion", 0.5, "yearly"),
    page("/ar/connexion", 0.4, "yearly"),
    page("/confidentialite", 0.3, "yearly"),
    page("/conditions", 0.3, "yearly"),
    page("/ar/confidentialite", 0.2, "yearly"),
    page("/ar/conditions", 0.2, "yearly"),
  ];
}
