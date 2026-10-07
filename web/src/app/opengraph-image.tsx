import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Image de partage (WhatsApp, Facebook, X, LinkedIn…) : affichée quand on envoie le lien du site.
export const alt = "Axone — Dépose ton cours, retiens-le";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const photo = await readFile(join(process.cwd(), "src/app/dr-ahmed-share.jpg"));
  const photoSrc = `data:image/jpeg;base64,${photo.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b1e34", color: "#ffffff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 720, padding: "64px 0 64px 72px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="68" height="68" viewBox="0 0 30 30" fill="none">
              <circle cx="9" cy="15" r="6" fill="#07a997" />
              <path d="M15 15h12" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
              <path d="M22 9v12" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: -2 }}>axone</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.04, letterSpacing: -3 }}>Dépose ton cours,</div>
            <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.04, letterSpacing: -3, color: "#07a997" }}>retiens-le.</div>
            <div style={{ fontSize: 30, marginTop: 26, color: "#b8c7d6", lineHeight: 1.3 }}>
              Fiches, QCM, flashcards et cas cliniques depuis tes cours.
            </div>
          </div>

          <div style={{ fontSize: 24, color: "#8fa3b8" }}>Médecine et pharmacie · Mauritanie · Sénégal · Maroc</div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoSrc} width={480} height={630} alt="" style={{ marginLeft: "auto", objectFit: "cover" }} />
      </div>
    ),
    { ...size },
  );
}
