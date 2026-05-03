import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { useAppStore } from '../store';

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
    blue: Colors.blue,
    green: Colors.green,
  };
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
        <Text style={styles.primaryBtnText}>{label}</Text>
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
      <Text style={styles.sourceText}>
        Basé sur le cours · {pages.join(', ')}
      </Text>
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
    <Text style={[styles.sectionHeader, { color: t.textMuted }]}>{title}</Text>
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
      <Text style={styles.courseActiveName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryBtn: {
    backgroundColor: Colors.blue,
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
