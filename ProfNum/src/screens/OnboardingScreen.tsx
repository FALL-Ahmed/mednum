import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useAppStore } from '../store';
import { Colors, Typography, Spacing, Radius } from '../theme';

const { width } = Dimensions.get('window');

const STEPS = [
  {
    emoji: '📚',
    title: 'Bienvenue sur ProfNum !',
    subtitle: 'Ton assistant pédagogique intelligent. Je réponds à tes questions uniquement depuis ton cours.',
    bg: '#1A6FD4',
  },
  {
    emoji: '🔒',
    title: 'Des réponses fiables',
    subtitle: 'Chaque réponse vient directement de ton PDF de cours. Je ne m\'invente rien — tu vois toujours la page source.',
    bg: '#1D9E75',
  },
  {
    emoji: '💬',
    title: 'Pose ta première question !',
    subtitle: 'Charge ton cours PDF, puis pose toutes tes questions. Simple, rapide, et adapté à toi.',
    bg: '#5B4ED4',
  },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const goNext = () => {
    if (step < STEPS.length - 1) {
      const next = step + 1;
      setStep(next);
      scrollRef.current?.scrollTo({ x: width * next, animated: true });
    } else {
      completeOnboarding();
    }
  };

  const current = STEPS[step];

  return (
    <View style={[styles.root, { backgroundColor: current.bg }]}>
      <SafeAreaView style={styles.safe}>
        {/* Skip */}
        <TouchableOpacity style={styles.skipBtn} onPress={completeOnboarding}>
          <Text style={styles.skipText}>Passer</Text>
        </TouchableOpacity>

        {/* Slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {STEPS.map((s, i) => (
            <View key={i} style={[styles.slide, { width }]}>
              <Text style={styles.emoji}>{s.emoji}</Text>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.subtitle}>{s.subtitle}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, { opacity: i === step ? 1 : 0.35, width: i === step ? 20 : 8 }]}
            />
          ))}
        </View>

        {/* Button */}
        <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>
            {step < STEPS.length - 1 ? 'Suivant →' : 'Commencer !'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.xl },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  skipText: { ...Typography.label, color: 'rgba(255,255,255,0.7)' },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emoji: { fontSize: 72, marginBottom: Spacing.xxl },
  title: {
    ...Typography.h1,
    color: '#fff',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  subtitle: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 26,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: Spacing.xl,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  nextBtn: {
    backgroundColor: '#fff',
    borderRadius: Radius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  nextBtnText: {
    ...Typography.button,
    color: Colors.blue,
  },
});
