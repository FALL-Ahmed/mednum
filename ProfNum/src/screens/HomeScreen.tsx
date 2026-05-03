import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useAppStore } from '../store';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { CourseActiveBadge, SectionHeader, Card, useTheme } from '../components';

const QUICK_QUESTIONS = [
  "C'est quoi la définition ?",
  "Quelle est la formule ?",
  "Explique-moi en simple",
  "Donne un exemple",
  "Quelle est la différence ?",
];

export default function HomeScreen({ navigation }: any) {
  const { activeCourse, courses, chatHistory, darkMode, toggleDarkMode } = useAppStore();
  const t = useTheme();

  const recentSessions = chatHistory.slice(0, 3);

  const goToChat = (prefill?: string) => {
    navigation.navigate('Chat', prefill ? { prefill } : undefined);
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blue} />

      {/* Hero Header */}
      <View style={styles.hero}>
        <SafeAreaView>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.greeting}>Bonjour 👋</Text>
              <Text style={styles.heroTitle}>Que veux-tu apprendre ?</Text>
              {activeCourse ? (
                <CourseActiveBadge name={activeCourse.name} />
              ) : (
                <View style={styles.noCourseWarning}>
                  <Text style={styles.noCourseText}>⚠️ Aucun cours chargé</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={toggleDarkMode} style={styles.themeBtn}>
              <Text style={{ fontSize: 20 }}>{darkMode ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {/* Ask Button */}
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}>
          <TouchableOpacity
            style={[styles.askBtn, !activeCourse && { opacity: 0.5 }]}
            onPress={() => goToChat()}
            disabled={!activeCourse}
            activeOpacity={0.85}
          >
            <Text style={styles.askBtnIcon}>💬</Text>
            <Text style={styles.askBtnText}>Poser une question</Text>
            <Text style={styles.askBtnArrow}>→</Text>
          </TouchableOpacity>
          {!activeCourse && (
            <TouchableOpacity
              style={styles.uploadPromptBtn}
              onPress={() => navigation.navigate('Cours')}
              activeOpacity={0.8}
            >
              <Text style={styles.uploadPromptText}>📄 Charger mon cours PDF</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick questions */}
        {activeCourse && (
          <>
            <SectionHeader title="Questions rapides" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {QUICK_QUESTIONS.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[styles.chip, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}
                  onPress={() => goToChat(q)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, { color: t.text }]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Courses */}
        <SectionHeader title={`Mes cours (${courses.length})`} />
        {courses.length === 0 ? (
          <Card>
            <Text style={[styles.emptyText, { color: t.textMuted }]}>
              Aucun cours chargé.{'\n'}Va dans l'onglet "Cours" pour ajouter un PDF.
            </Text>
          </Card>
        ) : (
          courses.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => {
                useAppStore.getState().setActiveCourse(c.id);
              }}
              activeOpacity={0.8}
            >
              <Card
                style={{
                  borderColor: c.active ? Colors.blue : t.border,
                  borderWidth: c.active ? 1.5 : 0.5,
                }}
              >
                <View style={styles.courseRow}>
                  <View style={[styles.pdfIcon, { backgroundColor: c.active ? Colors.blueLight : t.surfaceAlt }]}>
                    <Text style={{ fontSize: 16 }}>📄</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.courseName, { color: t.text }]}>{c.name}</Text>
                    <Text style={[styles.courseMeta, { color: t.textMuted }]}>
                      {c.pages} pages · {new Date(c.uploadedAt).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                  {c.active && (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>Actif</Text>
                    </View>
                  )}
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}

        {/* Recent history */}
        {recentSessions.length > 0 && (
          <>
            <SectionHeader title="Récemment" />
            {recentSessions.map((s) => {
              const lastMsg = s.messages[s.messages.length - 1];
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => navigation.navigate('Historique')}
                  activeOpacity={0.7}
                >
                  <Card>
                    <Text style={[styles.histQ, { color: t.text }]} numberOfLines={1}>
                      {s.messages.find((m) => m.role === 'user')?.content || 'Session'}
                    </Text>
                    <Text style={[styles.histMeta, { color: t.textMuted }]}>
                      {s.courseName} · {new Date(s.createdAt).toLocaleDateString('fr-FR')}
                    </Text>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    backgroundColor: Colors.blue,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: Spacing.sm },
  greeting: { ...Typography.bodySmall, color: 'rgba(255,255,255,0.75)', marginBottom: 2 },
  heroTitle: { ...Typography.h2, color: '#fff', marginBottom: Spacing.sm },
  noCourseWarning: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  noCourseText: { ...Typography.labelSmall, color: '#fff' },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  askBtn: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  askBtnIcon: { fontSize: 18 },
  askBtnText: { ...Typography.button, color: '#fff', flex: 1 },
  askBtnArrow: { ...Typography.h3, color: 'rgba(255,255,255,0.75)' },
  uploadPromptBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.blueLight,
    borderRadius: Radius.sm,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.blueMid,
  },
  uploadPromptText: { ...Typography.label, color: Colors.blue },
  chipsRow: { paddingHorizontal: Spacing.lg, gap: 8, paddingBottom: 4 },
  chip: {
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 0.5,
  },
  chipText: { ...Typography.label, fontSize: 13 },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pdfIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseName: { ...Typography.label },
  courseMeta: { ...Typography.caption, marginTop: 2 },
  activePill: {
    backgroundColor: Colors.blueLight,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activePillText: { ...Typography.labelSmall, color: Colors.blue },
  emptyText: { ...Typography.body, textAlign: 'center', lineHeight: 24 },
  histQ: { ...Typography.label, marginBottom: 3 },
  histMeta: { ...Typography.caption },
});
