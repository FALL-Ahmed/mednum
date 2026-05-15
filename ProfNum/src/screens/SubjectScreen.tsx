import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, SBCourse } from '../lib/supabase';
import { useAppStore, Course, CourseChunk } from '../store';
import { Colors, Spacing, Radius } from '../theme';
import { useTheme } from '../components';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - Spacing.lg * 2 - 12) / 2;

const SUBJECTS: Record<string, { bg: string; accent: string; emoji: string }> = {
  svt:          { bg: '#0D6E4F', accent: '#34D399', emoji: '🌿' },
  math:         { bg: '#1D4ED8', accent: '#60A5FA', emoji: '📐' },
  français:     { bg: '#9D174D', accent: '#F472B6', emoji: '✍️' },
  histoire:     { bg: '#92400E', accent: '#FBBF24', emoji: '🌍' },
  géo:          { bg: '#92400E', accent: '#FBBF24', emoji: '🌍' },
  physique:     { bg: '#4C1D95', accent: '#A78BFA', emoji: '⚛️' },
  chimie:       { bg: '#4C1D95', accent: '#A78BFA', emoji: '🧪' },
  arabe:        { bg: '#065F46', accent: '#6EE7B7', emoji: '📖' },
  informatique: { bg: '#1E3A5F', accent: '#38BDF8', emoji: '💻' },
  anglais:      { bg: '#7C3AED', accent: '#C4B5FD', emoji: '🇬🇧' },
};

function getSubjectStyle(name = '') {
  const key = Object.keys(SUBJECTS).find(k => name.toLowerCase().includes(k));
  return key ? SUBJECTS[key] : { bg: '#1A3A6B', accent: '#60A5FA', emoji: '📚' };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export default function SubjectScreen() {
  const {
    studentClassId, studentName, studentClassName,
    activeCourse, courses: storeCourses, addCourse, setActiveCourse, updateCourseChunks,
  } = useAppStore();
  const t = useTheme();
  const { top } = useSafeAreaInsets();
  const [sbCourses, setSbCourses] = useState<SBCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!studentClassId) { setLoading(false); return; }
    supabase
      .from('courses').select('*, classes(name), subjects(name)')
      .eq('class_id', studentClassId).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setSbCourses(data as SBCourse[]); setLoading(false); });
  }, [studentClassId]);

  const handleSelect = useCallback(async (course: SBCourse) => {
    if (downloading) return;
    const existing = storeCourses.find(c => c.id === course.id);
    const hasCachedContent = existing && existing.content?.trim().length > 50;

    setDownloading(course.id);
    try {
      if (hasCachedContent) {
        // Content already in cache — only re-fetch chunks to pick up admin edits
        const { data, error } = await supabase
          .from('courses').select('chunks').eq('id', course.id).single();
        if (error) throw error;
        let chunks: CourseChunk[] = [];
        if (data?.chunks) { try { chunks = JSON.parse(data.chunks); } catch {} }
        updateCourseChunks(course.id, chunks);
        setActiveCourse(course.id);
      } else {
        // First load — fetch full content + chunks
        const { data, error } = await supabase
          .from('courses').select('content, chunks').eq('id', course.id).single();
        if (error) throw error;
        const content = data?.content || '';
        if (content.trim().length < 50) {
          throw new Error('Ce cours n\'a pas encore de contenu textuel.\n\nRe-uploade le PDF depuis l\'application admin.');
        }
        let chunks: CourseChunk[] = [];
        if (data?.chunks) { try { chunks = JSON.parse(data.chunks); } catch {} }
        addCourse({
          id: course.id,
          name: course.name,
          subjectName: course.subjects?.name || '',
          fileName: course.pdf_path.split('/').pop() || course.name,
          fileUri: '',
          pages: course.pages || 1,
          uploadedAt: new Date(),
          active: true,
          content,
          chunks,
        } as Course);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible de charger ce cours.');
    }
    setDownloading(null);
  }, [downloading, storeCourses, addCourse, updateCourseChunks, setActiveCourse]);

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blue} />

      <ScrollView showsVerticalScrollIndicator={false} bounces>

        {/* ── HEADER ── */}
        <View style={[styles.header, { paddingTop: top + Spacing.lg }]}>
          {/* Déco cercles */}
          <View style={styles.decoBubble1} />
          <View style={styles.decoBubble2} />

          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{greeting()},</Text>
              <Text style={styles.studentName}>{studentName || 'Élève'}</Text>
            </View>
            {studentClassName ? (
              <View style={styles.classPill}>
                <Text style={styles.classPillText}>{studentClassName}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.headerSub}>
            {sbCourses.length > 0
              ? `${sbCourses.length} cours disponible${sbCourses.length > 1 ? 's' : ''} pour toi`
              : 'Prêt à apprendre ?'}
          </Text>
        </View>


        {/* ── LISTE MATIÈRES ── */}
        <View style={styles.gridSection}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>TES MATIÈRES</Text>

          {loading ? (
            <ActivityIndicator color={Colors.blue} size="large" style={{ marginTop: 40 }} />
          ) : sbCourses.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={[styles.emptyTitle, { color: t.text }]}>Pas encore de cours</Text>
              <Text style={[styles.emptyText, { color: t.textMuted }]}>
                Ton administrateur va bientôt ajouter des cours.
              </Text>
            </View>
          ) : (
            <>
              {/* Grouper par matière */}
              {Object.entries(
                sbCourses.reduce((acc: Record<string, SBCourse[]>, item) => {
                  const key = item.subjects?.name || 'Autre';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(item);
                  return acc;
                }, {})
              ).map(([subjectName, items]) => {
                const s = getSubjectStyle(subjectName);
                return (
                  <View key={subjectName} style={{ marginBottom: Spacing.xl }}>
                    {/* En-tête matière */}
                    <View style={styles.subjectHeader}>
                      <Text style={styles.subjectHeaderEmoji}>{s.emoji}</Text>
                      <Text style={[styles.subjectHeaderName, { color: t.text }]}>{subjectName}</Text>
                      <Text style={[styles.subjectHeaderCount, { color: t.textMuted }]}>
                        {items.length} cours
                      </Text>
                    </View>
                    <View style={styles.grid}>
                      {items.map(item => {
                const isActive = activeCourse?.id === item.id;
                const isDown = downloading === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.card, { backgroundColor: s.bg, width: CARD_WIDTH }]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.82}
                    disabled={!!downloading}
                  >
                    {/* Badge actif */}
                    {isActive && (
                      <View style={[styles.activeMark, { backgroundColor: s.accent }]}>
                        <Text style={styles.activeMarkText}>✓</Text>
                      </View>
                    )}

                    {/* Emoji */}
                    <View style={[styles.cardEmojiWrap, { backgroundColor: s.accent + '22' }]}>
                      {isDown
                        ? <ActivityIndicator color={s.accent} size="small" />
                        : <Text style={styles.cardEmoji}>{s.emoji}</Text>}
                    </View>

                    {/* Texte */}
                    <Text style={[styles.cardSubject, { color: s.accent }]}>
                      {item.subjects?.name}
                    </Text>
                    <Text style={styles.cardName} numberOfLines={2}>
                      {item.name}
                    </Text>

                    {/* Flèche */}
                    <View style={[styles.cardFooter, { borderTopColor: s.accent + '33' }]}>
                      <Text style={[styles.cardAction, { color: s.accent }]}>
                        {isActive ? 'Cours actif' : isDown ? 'Chargement…' : 'Ouvrir'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
  header: {
    backgroundColor: Colors.blue,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  decoBubble1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -40, right: -30,
  },
  decoBubble2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: 10, right: 60,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: Spacing.sm,
  },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  studentName: {
    fontSize: 28, fontWeight: '800', color: '#fff',
    letterSpacing: -0.6, marginTop: 2,
  },
  classPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    marginTop: 4,
  },
  classPillText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },

  /* Active banner */
  activeSection: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  activeBanner: {
    borderRadius: Radius.lg, padding: Spacing.lg,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: Spacing.sm,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12 },
      android: { elevation: 5 },
    }),
  },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  activeBannerEmoji: { fontSize: 28 },
  activeBannerSubject: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  activeBannerName: { fontSize: 15, fontWeight: '700', color: '#fff', marginTop: 2, maxWidth: 160 },
  activeBannerBtn: {
    borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 7,
  },
  activeBannerBtnText: { fontSize: 13, fontWeight: '700' },

  /* Grid */
  gridSection: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: Spacing.md },
  subjectHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  subjectHeaderEmoji: { fontSize: 18 },
  subjectHeaderName: { fontSize: 15, fontWeight: '800', flex: 1 },
  subjectHeaderCount: { fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  /* Card */
  card: {
    borderRadius: Radius.lg, padding: Spacing.lg, minHeight: 170,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  activeMark: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  activeMarkText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  cardEmojiWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  cardEmoji: { fontSize: 24 },
  cardSubject: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  cardName: { fontSize: 14, fontWeight: '700', color: '#fff', lineHeight: 20, flex: 1 },
  cardFooter: { borderTopWidth: 1, marginTop: Spacing.sm, paddingTop: Spacing.sm },
  cardAction: { fontSize: 12, fontWeight: '700' },

  /* Empty */
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 52, marginBottom: Spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
