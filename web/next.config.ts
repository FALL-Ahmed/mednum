import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Le dossier parent contient aussi un package-lock.json : on fixe la racine du site pour éviter l'ambiguïté.
  turbopack: { root: path.resolve(__dirname) },
  // Permet de lancer un second serveur de contrôle sans partager le cache du premier.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
