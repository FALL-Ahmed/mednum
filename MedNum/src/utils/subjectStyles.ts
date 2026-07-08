export type SubjectStyle = { bg: string; accent: string; light: string; emoji: string };

// Matières médicales FMPOS / UNAM Nouakchott
const SUBJECT_RULES: { keywords: string[]; style: SubjectStyle }[] = [
  {
    keywords: ['anatomie', 'morpho'],
    style: { bg: '#7C2D12', accent: '#FB923C', light: '#FFF7ED', emoji: '🦴' },
  },
  {
    keywords: ['physiologie', 'physio'],
    style: { bg: '#0D6E4F', accent: '#34D399', light: '#ECFDF5', emoji: '❤️' },
  },
  {
    keywords: ['biochimie', 'bioch'],
    style: { bg: '#4C1D95', accent: '#A78BFA', light: '#F5F3FF', emoji: '🧬' },
  },
  {
    keywords: ['histologie', 'histo', 'embryologie'],
    style: { bg: '#DB2777', accent: '#F9A8D4', light: '#FDF2F8', emoji: '🔬' },
  },
  {
    keywords: ['sémiologie', 'semiologie', 'séméio'],
    style: { bg: '#1D4ED8', accent: '#60A5FA', light: '#EFF6FF', emoji: '🩺' },
  },
  {
    keywords: ['pharmacologie', 'pharmaco', 'thérapeutique'],
    style: { bg: '#065F46', accent: '#6EE7B7', light: '#ECFDF5', emoji: '💊' },
  },
  {
    keywords: ['pathologie', 'anatomo', 'anapath'],
    style: { bg: '#831843', accent: '#EC4899', light: '#FDF2F8', emoji: '🧫' },
  },
  {
    keywords: ['bactério', 'virologie', 'parasito', 'microbiologie', 'immuno'],
    style: { bg: '#1E3A5F', accent: '#38BDF8', light: '#F0F9FF', emoji: '🦠' },
  },
  {
    keywords: ['cardiologie', 'cardio'],
    style: { bg: '#991B1B', accent: '#FCA5A5', light: '#FEF2F2', emoji: '🫀' },
  },
  {
    keywords: ['pneumologie', 'pneumo', 'pulmo', 'respiratoire'],
    style: { bg: '#164E63', accent: '#67E8F9', light: '#ECFEFF', emoji: '🫁' },
  },
  {
    keywords: ['neurologie', 'neuro'],
    style: { bg: '#312E81', accent: '#818CF8', light: '#EEF2FF', emoji: '🧠' },
  },
  {
    keywords: ['gastro', 'hépato', 'hepato', 'digestif'],
    style: { bg: '#365314', accent: '#A3E635', light: '#F7FEE7', emoji: '🫃' },
  },
  {
    keywords: ['urologie', 'néphro', 'nephro', 'rénale', 'renale'],
    style: { bg: '#1E3A5F', accent: '#93C5FD', light: '#EFF6FF', emoji: '🫘' },
  },
  {
    keywords: ['endocrino', 'diabéto', 'diabeto', 'métabo'],
    style: { bg: '#713F12', accent: '#FCD34D', light: '#FFFBEB', emoji: '🧪' },
  },
  {
    keywords: ['gynéco', 'gyneco', 'obstétrique', 'obstetrique'],
    style: { bg: '#9D174D', accent: '#F472B6', light: '#FDF2F8', emoji: '👶' },
  },
  {
    keywords: ['pédiatrie', 'pediatrie'],
    style: { bg: '#0369A1', accent: '#38BDF8', light: '#F0F9FF', emoji: '👼' },
  },
  {
    keywords: ['chirurgie', 'chir'],
    style: { bg: '#374151', accent: '#9CA3AF', light: '#F9FAFB', emoji: '🔪' },
  },
  {
    keywords: ['urgence', 'réa', 'rea', 'réanimation', 'soins intensifs'],
    style: { bg: '#7F1D1D', accent: '#F87171', light: '#FEF2F2', emoji: '🚨' },
  },
  {
    keywords: ['dermatologie', 'dermato'],
    style: { bg: '#78350F', accent: '#FBBF24', light: '#FFFBEB', emoji: '🩹' },
  },
  {
    keywords: ['rhumatologie', 'rhumato', 'ostéo'],
    style: { bg: '#1E3A5F', accent: '#60A5FA', light: '#EFF6FF', emoji: '🦵' },
  },
  {
    keywords: ['ophtalmologie', 'ophtalmo', 'œil', 'oeil'],
    style: { bg: '#0C4A6E', accent: '#7DD3FC', light: '#F0F9FF', emoji: '👁️' },
  },
  {
    keywords: ['oto', 'orl', 'otologie', 'rhinologie'],
    style: { bg: '#134E4A', accent: '#2DD4BF', light: '#F0FDFA', emoji: '👂' },
  },
  {
    keywords: ['santé publique', 'epidémio', 'epidemio', 'hygiène', 'hygiene'],
    style: { bg: '#064E3B', accent: '#34D399', light: '#ECFDF5', emoji: '🏥' },
  },
  {
    keywords: ['médecine légale', 'medecine legale', 'légale'],
    style: { bg: '#1F2937', accent: '#9CA3AF', light: '#F9FAFB', emoji: '⚖️' },
  },
  {
    keywords: ['radiologie', 'imagerie'],
    style: { bg: '#1E3A5F', accent: '#93C5FD', light: '#EFF6FF', emoji: '🩻' },
  },
  {
    keywords: ['résidanat', 'residanat', 'concours'],
    style: { bg: '#1A3A6B', accent: '#FBBF24', light: '#FFFBEB', emoji: '🏆' },
  },
];

const DEFAULT: SubjectStyle = { bg: '#1A3A6B', accent: '#60A5FA', light: '#EFF6FF', emoji: '📚' };

// MedNum : un seul assistant. Dr. Ahmed pour tout.
export function getProfessorName(_name = ''): string {
  return 'Dr. Ahmed';
}

export function getSubjectStyle(name = ''): SubjectStyle {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rule = SUBJECT_RULES.find(r =>
    r.keywords.some(k => n.includes(k.normalize('NFD').replace(/[̀-ͯ]/g, '')))
  );
  return rule ? rule.style : DEFAULT;
}

export function getSubjectKey(name = ''): string {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const rule of SUBJECT_RULES) {
    if (rule.keywords.some(k => n.includes(k.normalize('NFD').replace(/[̀-ͯ]/g, '')))) {
      return rule.keywords[0];
    }
  }
  return 'default';
}
