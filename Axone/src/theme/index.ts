export const Colors = {
  // Primary
  blue: '#1A6FD4',
  blueLight: '#E8F2FC',
  blueMid: '#B5D4F4',
  blueDark: '#0C447C',

  // Secondary
  green: '#1D9E75',
  greenLight: '#E1F5EE',
  greenDark: '#085041',

  // Refusal / warning
  orange: '#FFF3E0',
  orangeBorder: '#FFB74D',
  orangeText: '#7B4810',

  // Neutrals
  white: '#FFFFFF',
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F6',
  border: '#E0E4EA',
  borderLight: '#EEF1F5',

  // Text
  textPrimary: '#1A1D23',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Status
  error: '#E24B4A',
  errorLight: '#FCEBEB',

  // Dark mode
  darkBg: '#0F1117',
  darkSurface: '#1A1D23',
  darkSurfaceAlt: '#242730',
  darkBorder: '#2E3340',
  darkTextPrimary: '#F0F2F5',
  darkTextSecondary: '#9CA3AF',
};

export const Typography = {
  h1: { fontSize: 22, fontWeight: '600', lineHeight: 28 },
  h2: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  h3: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400', lineHeight: 19 },
  caption: { fontSize: 11, fontWeight: '400', lineHeight: 15 },
  label: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  labelSmall: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
  button: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  chat: { fontSize: 14, fontWeight: '400', lineHeight: 21 },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 4,
  },
};
