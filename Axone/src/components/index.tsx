import React from 'react';
import {
  View,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextProps,
  TextInputProps,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { useAppStore } from '../store';

const NAVY = '#0B1E34';

// ─── Theme hook ──────────────────────────────────────────────
export function useTheme() {
  const dark = useAppStore((s) => s.darkMode);
  return {
    dark,
    bg: dark ? Colors.darkBg : Colors.background,
    surface: dark ? Colors.darkSurface : Colors.surface,
    surfaceAlt: dark ? Colors.darkSurfaceAlt : Colors.surfaceAlt,
    border: dark ? Colors.darkBorder : Colors.border,
    text: dark ? Colors.darkTextPrimary : Colors.textPrimary,
    textMuted: dark ? Colors.darkTextSecondary : Colors.textSecondary,
    blue: NAVY,
    green: Colors.green,
  };
}

// ─── Police "serif" arabe ──────────────────────────────────────
// Le reste de l'app utilise Georgia/serif (Latin) pour les titres. Georgia n'a
// aucun glyphe arabe — on bascule automatiquement vers El Messiri (chargée via
// expo-font dans App.tsx) dès qu'un style demande la police serif et que l'app
// est en arabe, sans devoir toucher chaque écran individuellement.
const LATIN_SERIF_NAMES = ['Georgia', 'serif'];
const ARABIC_SERIF = 'ElMessiri_400Regular';

function arabicSerifOverride(isRTL: boolean, style: TextProps['style']) {
  if (!isRTL) return null;
  const flat = StyleSheet.flatten(style);
  if (flat?.fontFamily && LATIN_SERIF_NAMES.includes(flat.fontFamily)) {
    // lineHeight explicite = calé sur les proportions de Georgia (Latin) — trop
    // serré pour les hampes et points diacritiques d'El Messiri, ce qui coupe
    // certaines lettres arabes. On laisse la police gérer sa propre hauteur de ligne.
    return { fontFamily: ARABIC_SERIF, lineHeight: undefined };
  }
  return null;
}

// ─── Text / TextInput RTL-aware ──────────────────────────────
export function Text(props: TextProps) {
  const isRTL = useAppStore((s) => s.uiLanguage === 'ar');
  return (
    <RNText
      {...props}
      style={[
        { textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' },
        props.style,
        arabicSerifOverride(isRTL, props.style),
      ]}
    />
  );
}

export function TextInput(props: TextInputProps) {
  const isRTL = useAppStore((s) => s.uiLanguage === 'ar');
  return (
    <RNTextInput
      {...props}
      style={[
        { textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' },
        props.style,
        arabicSerifOverride(isRTL, props.style),
      ]}
    />
  );
}

// ─── PrimaryButton ───────────────────────────────────────────
export function PrimaryButton({
  label,
  onPress,
  loading,
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.primaryBtn, disabled && { opacity: 0.5 }, style]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <RNText style={styles.primaryBtnText}>{label}</RNText>
      )}
    </TouchableOpacity>
  );
}

// ─── SourceBadge ─────────────────────────────────────────────
export function SourceBadge({ pages }: { pages: string[] }) {
  if (!pages.length) return null;
  return (
    <View style={styles.sourceBadge}>
      <View style={styles.sourceGreenDot} />
      <RNText style={styles.sourceText}>
        Basé sur le cours · {pages.join(', ')}
      </RNText>
    </View>
  );
}

// ─── TypingIndicator ─────────────────────────────────────────
export function TypingIndicator() {
  const [dots, setDots] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setDots((d) => (d + 1) % 3), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={styles.typingWrap}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[styles.typingDot, { opacity: i === dots ? 1 : 0.3 }]}
        />
      ))}
    </View>
  );
}

// ─── SectionHeader ───────────────────────────────────────────
export function SectionHeader({ title }: { title: string }) {
  const t = useTheme();
  return (
    <RNText style={[styles.sectionHeader, { color: t.textMuted }]}>{title}</RNText>
  );
}

// ─── Card ────────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.surface, borderColor: t.border },
        Shadows.sm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── CourseActiveBadge ───────────────────────────────────────
export function CourseActiveBadge({ name }: { name: string }) {
  return (
    <View style={styles.courseActiveBadge}>
      <View style={styles.courseActiveDot} />
      <RNText style={styles.courseActiveName} numberOfLines={1}>
        {name}
      </RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryBtn: {
    backgroundColor: NAVY,
    borderRadius: Radius.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  primaryBtnText: {
    ...Typography.button,
    color: '#fff',
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.greenLight,
    borderRadius: Radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  sourceGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.green,
  },
  sourceText: {
    ...Typography.labelSmall,
    color: Colors.greenDark,
  },
  typingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.textSecondary,
  },
  sectionHeader: {
    ...Typography.labelSmall,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: 0.5,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
  },
  courseActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  courseActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#5EE9B8',
  },
  courseActiveName: {
    ...Typography.labelSmall,
    color: '#fff',
    maxWidth: 200,
  },
});
