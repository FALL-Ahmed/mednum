export type PreparedImage = {
  name: string;
  mediaType: "image/jpeg";
  base64: string; // sans l'en-tête data:
  blob: Blob; // pour l'enregistrement dans l'historique
  previewUrl: string; // aperçu local
};

const MAX_SIDE = 1280;

/** Réduit une image (1280 px max) et la convertit en JPEG léger avant envoi. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("unreadable");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("unreadable");
  ctx.fillStyle = "#fff"; // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("unreadable"))), "image/jpeg", 0.82),
  );
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("unreadable"));
    r.readAsDataURL(blob);
  });

  return {
    name: file.name || "image.jpg",
    mediaType: "image/jpeg",
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    blob,
    previewUrl: URL.createObjectURL(blob),
  };
}
