export type SubjectStyle = { bg: string; accent: string; light: string; emoji: string };

const SUBJECTS: Record<string, SubjectStyle> = {
  svt:          { bg: '#0D6E4F', accent: '#34D399', light: '#ECFDF5', emoji: '🌿' },
  math:         { bg: '#1D4ED8', accent: '#60A5FA', light: '#EFF6FF', emoji: '📐' },
  français:     { bg: '#9D174D', accent: '#F472B6', light: '#FDF2F8', emoji: '✍️' },
  histoire:     { bg: '#92400E', accent: '#FBBF24', light: '#FFFBEB', emoji: '🌍' },
  géo:          { bg: '#92400E', accent: '#FBBF24', light: '#FFFBEB', emoji: '🌍' },
  physique:     { bg: '#4C1D95', accent: '#A78BFA', light: '#F5F3FF', emoji: '⚛️' },
  chimie:       { bg: '#4C1D95', accent: '#A78BFA', light: '#F5F3FF', emoji: '🧪' },
  arabe:        { bg: '#065F46', accent: '#6EE7B7', light: '#ECFDF5', emoji: '📖' },
  informatique: { bg: '#1E3A5F', accent: '#38BDF8', light: '#F0F9FF', emoji: '💻' },
  anglais:      { bg: '#7C3AED', accent: '#C4B5FD', light: '#F5F3FF', emoji: '🇬🇧' },
};

const DEFAULT: SubjectStyle = { bg: '#1A3A6B', accent: '#60A5FA', light: '#EFF6FF', emoji: '📚' };

export function getSubjectStyle(name = ''): SubjectStyle {
  const key = Object.keys(SUBJECTS).find(k => name.toLowerCase().includes(k));
  return key ? SUBJECTS[key] : DEFAULT;
}
