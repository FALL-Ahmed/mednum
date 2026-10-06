// Détecte si un cours contient assez de contenu clinique pour justifier un cas clinique
// interactif (diagnostic, traitement, signes...) — heuristique locale, sans appel IA,
// pour ne pas payer un appel juste pour décider d'afficher un bouton.

const CLINICAL_TERMS = [
  'diagnostic', 'diagnostics différentiels', 'traitement', 'prise en charge',
  'signes cliniques', 'signe clinique', 'symptôme', 'symptômes', 'patient',
  'étiologie', 'complication', 'complications', 'pronostic', 'examen clinique',
  'antécédents', 'thérapeutique', 'posologie', 'contre-indication', 'syndrome',
  'pathologie', 'tableau clinique', 'examens complémentaires',
];

// Années où le programme est presque exclusivement science fondamentale
// (anatomie, physiologie, biochimie...) — pas de patients, pas de diagnostic.
const PRECLINICAL_YEARS = ['P1', 'P2'];

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Densité de vocabulaire clinique dans le cours — seuil empirique : en dessous,
// le cours est presque certainement de la science fondamentale pure.
export function isClinicalContent(content: string): boolean {
  if (!content || content.trim().length < 200) return false;
  const sample = normalize(content).slice(0, 20000); // échantillon suffisant, pas tout le cours
  const wordCount = sample.split(/\s+/).length;
  let hits = 0;
  for (const term of CLINICAL_TERMS) {
    const t = normalize(term);
    const matches = sample.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
    if (matches) hits += matches.length;
  }
  const density = hits / (wordCount / 1000); // occurrences pour 1000 mots
  return density >= 2;
}

export function isPreclinicalYear(niveau: string): boolean {
  return PRECLINICAL_YEARS.some(y => niveau.toUpperCase().startsWith(y));
}

// Le cas clinique n'a de sens que si le niveau ET le contenu s'y prêtent.
export function shouldOfferClinicalCase(content: string, niveau: string): boolean {
  if (isPreclinicalYear(niveau)) return false;
  return isClinicalContent(content);
}
