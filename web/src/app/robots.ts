import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/rejoindre/"] }],
    sitemap: "https://www.axonerevision.com/sitemap.xml",
  };
}
