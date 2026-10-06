/*
  Contrôle automatique d'une fiche : supprime les lignes dont le vocabulaire ne se retrouve pas dans le cours
  (ce que l'IA a ajouté de sa propre connaissance), les crochets de remplissage et les sections devenues vides.
  Aucun appel à l'IA : le contrôle est gratuit et identique à chaque fois.
*/

const STOP = new Set([
  "dans", "avec", "pour", "entre", "cette", "leurs", "comme", "plus", "moins", "ainsi", "aussi", "dont", "elle",
  "elles", "sont", "etre", "avoir", "fait", "faire", "peut", "peuvent", "vers", "chez", "selon", "lors", "sous",
  "tout", "tous", "toute", "toutes", "autre", "autres", "meme", "memes", "apres", "avant", "depuis", "pendant",
  "premier", "premiere", "seule", "seul", "ainsi", "alors", "puis", "donc", "mais", "sans", "tres", "bien",
]);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9\s-]/g, " ");

/** Mots porteurs de sens d'une ligne : racines de 5 lettres des mots de 6 lettres et plus, sigles et nombres. */
function keywords(line: string): string[] {
  const out = new Set<string>();
  for (const w of norm(line).split(/\s+/)) {
    if (!w || STOP.has(w)) continue;
    if (/^\d+$/.test(w)) {
      if (w.length >= 2) out.add(w);
    } else if (w.length >= 6) out.add(w.slice(0, 5));
  }
  // Sigles (CRP, CH50, IL-6, C3b…) : repérés dans le texte d'origine
  for (const m of line.matchAll(/\b[A-Z][A-Za-z]*\d+[a-z]?\b|\b[A-Z]{2,}[a-z]?\b/g)) out.add(norm(m[0]).trim().replace(/\s+/g, ""));
  return [...out];
}

const PLACEHOLDER = /\[(?:non\s|aucun|confusions\s+non|x\b)[^\]]*\]|\[X\]/i;

/** Vrai si la ligne s'appuie sur le cours. */
function grounded(line: string, courseNorm: string, courseTight: string): boolean {
  const kws = keywords(line);
  if (kws.length < 4) return true; // trop court pour juger : on garde
  let hit = 0;
  for (const k of kws) {
    const tight = k.replace(/-/g, "");
    if (courseNorm.includes(k) || courseTight.includes(tight)) hit++;
  }
  return hit / kws.length >= 0.55;
}

export function verifyFiche(fiche: string, course: string): string {
  const courseNorm = norm(course);
  const courseTight = courseNorm.replace(/[\s-]+/g, "");

  // 1. Lignes de contenu : on retire les crochets de remplissage et les lignes sans appui dans le cours.
  const kept = fiche.split("\n").filter((raw) => {
    const t = raw.trim();
    if (!t || t.startsWith("#") || t.startsWith("|")) return true;
    if (/^Q\d*\s*:/i.test(t.replace(/\*\*/g, ""))) return true; // les questions sont jugées via leur réponse
    if (PLACEHOLDER.test(t)) return false;
    if (/^discipline\s*:/i.test(t)) return true;
    // « Titre : » seul, ou ligne trop courte : conservé
    if (/:\s*$/.test(t) && t.length < 80) return true;
    return grounded(t, courseNorm, courseTight);
  });

  // 2. Sections vides : un titre « ## » suivi d'aucune ligne de contenu disparaît.
  const out: string[] = [];
  const lines = kept;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("## ")) {
      let j = i + 1;
      let has = false;
      while (j < lines.length && !lines[j].trim().startsWith("## ")) {
        if (lines[j].trim()) {
          has = true;
          break;
        }
        j++;
      }
      if (!has) continue;
    }
    out.push(lines[i]);
  }
  // 3. Une question dont la réponse a été supprimée n'a plus de raison d'être.
  const final: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const t = out[i].trim().replace(/\*\*/g, "");
    if (/^Q\d*\s*:/i.test(t)) {
      const next = out.slice(i + 1).find((l) => l.trim() !== "");
      if (!next || !/^R(éponse)?\s*:/i.test(next.trim().replace(/\*\*/g, ""))) continue;
    }
    final.push(out[i]);
  }
  // 4. Numérotation continue (I, II, III…) même si des sections ont disparu.
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  let n = 0;
  const numbered = final.map((l) => {
    const m = l.match(/^##\s+(?:[IVX]+)\.\s+(.*)$/);
    return m ? `## ${ROMAN[Math.min(n++, ROMAN.length - 1)]}. ${m[1]}` : l;
  });
  return numbered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
