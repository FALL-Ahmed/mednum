export type SubjectStyle = { bg: string; accent: string; light: string; emoji: string };

// Chaque entrée = liste de mots-clés qui déclenchent ce style
const SUBJECT_RULES: { keywords: string[]; style: SubjectStyle }[] = [
  {
    keywords: ['svt', 'sciences nat', 'sciences de la vie', 'biologie', 'naturelle', 'vivant'],
    style: { bg: '#0D6E4F', accent: '#34D399', light: '#ECFDF5', emoji: '🌿' },
  },
  {
    keywords: ['math'],
    style: { bg: '#1D4ED8', accent: '#60A5FA', light: '#EFF6FF', emoji: '📐' },
  },
  {
    keywords: ['français', 'francais', 'littéra', 'lettre'],
    style: { bg: '#9D174D', accent: '#F472B6', light: '#FDF2F8', emoji: '✍️' },
  },
  {
    keywords: ['histoire', 'géo', 'geo', 'géographie'],
    style: { bg: '#92400E', accent: '#FBBF24', light: '#FFFBEB', emoji: '🌍' },
  },
  {
    keywords: ['physique'],
    style: { bg: '#4C1D95', accent: '#A78BFA', light: '#F5F3FF', emoji: '⚛️' },
  },
  {
    keywords: ['chimie'],
    style: { bg: '#4C1D95', accent: '#A78BFA', light: '#F5F3FF', emoji: '🧪' },
  },
  {
    keywords: ['arabe', 'عربية'],
    style: { bg: '#065F46', accent: '#6EE7B7', light: '#ECFDF5', emoji: '📖' },
  },
  {
    keywords: ['informatique', 'techno', 'numérique'],
    style: { bg: '#1E3A5F', accent: '#38BDF8', light: '#F0F9FF', emoji: '💻' },
  },
  {
    keywords: ['anglais', 'english'],
    style: { bg: '#7C3AED', accent: '#C4B5FD', light: '#F5F3FF', emoji: '🇬🇧' },
  },
  {
    keywords: ['islamique', 'islam', 'éducation islamique', 'education islamique'],
    style: { bg: '#134E4A', accent: '#2DD4BF', light: '#F0FDFA', emoji: '☪️' },
  },
  {
    keywords: ['civique', 'instruction civique', 'civic'],
    style: { bg: '#1E3A5F', accent: '#93C5FD', light: '#EFF6FF', emoji: '🏛️' },
  },
];


const DEFAULT: SubjectStyle = { bg: '#1A3A6B', accent: '#60A5FA', light: '#EFF6FF', emoji: '📚' };

const PROFESSOR_NAMES: Record<string, string> = {
  svt:          'Prof. Ibrahima',
  math:         'Prof. Sidi Mohamed',
  français:     'Prof. Mokhtar',
  histoire:     'Prof. Abdallah',
  physique:     'Prof. Oumar',
  chimie:       'Prof. Ismaïl',
  arabe:        'Prof. Abderrahmane',
  informatique: 'Prof. Yahya',
  anglais:      'Prof. Aminetou',
  islamique:    'Prof. Cheikh Moussa',
  civique:      'Prof. El Hacen',
  default:      'Prof. Moctar',
};

export function getSubjectStyle(name = ''): SubjectStyle {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rule = SUBJECT_RULES.find(r =>
    r.keywords.some(k => n.includes(k.normalize('NFD').replace(/[̀-ͯ]/g, '')))
  );
  return rule ? rule.style : DEFAULT;
}

export function getProfessorName(name = ''): string {
  return PROFESSOR_NAMES[getSubjectKey(name)] ?? PROFESSOR_NAMES.default;
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
