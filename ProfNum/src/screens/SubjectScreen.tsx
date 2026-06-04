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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase, SBCourse } from '../lib/supabase';
import { useAppStore, Course, CourseChunk } from '../store';
import { Colors, Spacing, Radius } from '../theme';
import { useTheme } from '../components';
import { getSubjectStyle, getProfessorName } from '../utils/subjectStyles';
import { SubjectMascot } from '../components/SubjectMascots';
import { ProfessorAvatar } from '../components/ProfessorAvatar';

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
  const navigation = useNavigation<any>();
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
        const { data, error } = await supabase.from('courses').select('chunks').eq('id', course.id).single();
        if (error) throw error;
        let chunks: CourseChunk[] = [];
        if (data?.chunks) { try { chunks = JSON.parse(data.chunks); } catch {} }
        updateCourseChunks(course.id, chunks);
        setActiveCourse(course.id);
        navigation.navigate('SkillTree');
      } else {
        const { data, error } = await supabase.from('courses').select('content, chunks').eq('id', course.id).single();
        if (error) throw error;
        const content = data?.content || '';
        if (content.trim().length < 50)
          throw new Error('Ce cours n\'a pas encore de contenu textuel.\n\nRe-uploade le PDF depuis l\'application admin.');
        let chunks: CourseChunk[] = [];
        if (data?.chunks) { try { chunks = JSON.parse(data.chunks); } catch {} }
        addCourse({
          id: course.id, name: course.name,
          subjectName: course.subjects?.name || '',
          fileName: course.pdf_path.split('/').pop() || course.name,
          fileUri: '', pages: course.pages || 1,
          uploadedAt: new Date(), active: true, content, chunks,
        } as Course);
        navigation.navigate('SkillTree');
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible de charger ce cours.');
    }
    setDownloading(null);
  }, [downloading, storeCourses, addCourse, updateCourseChunks, setActiveCourse, navigation]);

  const activeSubject = activeCourse?.subjectName || '';

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blue} />

      {/* ── HEADER fixe ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: top + Spacing.lg }]}>
        <View style={styles.hBubble1} />
        <View style={styles.hBubble2} />
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.studentName}>{studentName || 'Élève'}</Text>
            {studentClassName ? (
              <View style={styles.classPill}>
                <Text style={styles.classPillTxt}>{studentClassName}</Text>
              </View>
            ) : null}
            <Text style={styles.headerSub}>
              {sbCourses.length > 0 ? `${sbCourses.length} cours disponibles` : 'Prêt à apprendre ?'}
            </Text>
          </View>
          <View style={styles.headerMascot}>
            <SubjectMascot subjectName={activeSubject} size={90} animate opacity={0.9} />
          </View>
        </View>
      </View>

      {/* ── LOADING centré ───────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.blue} size="large" />
          <Text style={[styles.loadingTxt, { color: t.textMuted }]}>Chargement des cours…</Text>
        </View>
      ) : (

      <ScrollView showsVerticalScrollIndicator={false} bounces contentContainerStyle={{ paddingBottom: 110 }}>

        {/* ── CARDS ──────────────────────────────────────────────────────────── */}
        <View style={styles.list}>
          {sbCourses.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={[styles.emptyTitle, { color: t.text }]}>Pas encore de cours</Text>
              <Text style={[styles.emptyBody, { color: t.textMuted }]}>
                Ton administrateur va bientôt ajouter des cours pour ta classe.
              </Text>
            </View>
          ) : (
            sbCourses.map(item => {
              const subjectName  = item.subjects?.name || '';
              const s            = getSubjectStyle(subjectName);
              const profName     = getProfessorName(subjectName);
              const isActive    = activeCourse?.id === item.id;
              const isDown      = downloading === item.id;

              return (
                <View key={item.id} style={styles.cardWrap}>

                  {/* Glow halo pour carte active */}
                  {isActive && (
                    <View style={[styles.cardGlow, { backgroundColor: s.accent + '38' }]} />
                  )}

                  <TouchableOpacity
                    style={[
                      styles.card,
                      { backgroundColor: s.bg },
                      isActive ? styles.cardActive : styles.cardInactive,
                      isActive && Platform.select({
                        ios: {
                          shadowColor: s.accent,
                          shadowOffset: { width: 0, height: 10 },
                          shadowOpacity: 0.58,
                          shadowRadius: 22,
                        },
                        android: { elevation: 14 },
                      }),
                    ]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.88}
                    disabled={!!downloading}
                  >
                    {/* Cercles décoratifs (clippés) */}
                    <View style={[StyleSheet.absoluteFill, { borderRadius: isActive ? 24 : 20, overflow: 'hidden' }]}>
                      <View style={[styles.deco1, isActive && styles.deco1Big]} />
                      <View style={[styles.deco2, isActive && styles.deco2Big]} />
                    </View>

                    {/* Bordure active */}
                    {isActive && (
                      <View style={[StyleSheet.absoluteFill, {
                        borderRadius: 24, borderWidth: 2.5, borderColor: s.accent,
                      }]} pointerEvents="none" />
                    )}

                    {/* Gauche : nom matière */}
                    <View style={isActive ? styles.cardLeftActive : styles.cardLeftInactive}>
                      {isActive && (
                        <View style={styles.activePill}>
                          <View style={[styles.activeDot, { backgroundColor: s.accent }]} />
                          <Text style={[styles.activeLbl, { color: s.accent }]}>EN COURS</Text>
                        </View>
                      )}
                      <Text
                        style={[styles.cardName, isActive ? styles.cardNameActive : styles.cardNameInactive]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {subjectName}
                      </Text>
                    </View>

                    {/* Nom du professeur — badge bas gauche */}
                    <View style={styles.profNameBadge}>
                      <Text style={styles.profName}>{profName}</Text>
                    </View>

                    {/* Professeur IA ancré en bas à droite */}
                    <View
                      style={[
                        styles.profWrap,
                        isActive ? styles.profWrapActive : styles.profWrapInactive,
                        isDown && styles.profWrapLoading,
                      ]}
                      pointerEvents="none"
                    >
                      {isDown
                        ? (
                          <View style={styles.downloadingBox}>
                            <ActivityIndicator color={s.accent} size="large" />
                            <Text style={[styles.downloadingTxt, { color: s.accent }]}>Chargement…</Text>
                          </View>
                        )
                        : <ProfessorAvatar
                            subjectName={subjectName}
                            width={isActive ? 190 : 130}
                            height={isActive ? 240 : 168}
                            fallbackSize={isActive ? 70 : 56}
                            animate={isActive}
                          />
                      }
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const INACTIVE_SHADOW = Platform.select({
  ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10 },
  android: { elevation: 5 },
}) as object;

const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Loading */
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingTxt: { fontSize: 14, fontWeight: '500' },

  /* Header */
  header: {
    backgroundColor: Colors.blue,
    paddingHorizontal: Spacing.lg, paddingBottom: 36,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  hBubble1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -50, right: -40,
  },
  hBubble2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: 8, left: 18,
  },
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:   { flex: 1, paddingRight: 8 },
  greeting:     { fontSize: 14, color: 'rgba(255,255,255,0.62)', fontWeight: '500' },
  studentName:  { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginTop: 2 },
  classPill: {
    alignSelf: 'flex-start', marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
  },
  classPillTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  headerSub:    { fontSize: 13, color: 'rgba(255,255,255,0.56)', marginTop: 10 },
  headerMascot: { width: 98, alignItems: 'center', justifyContent: 'center' },

  /* List */
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },

  /* Card wrap */
  cardWrap: { marginBottom: 18 },
  cardGlow: {
    position: 'absolute', top: -8, left: -8, right: -8, bottom: -8,
    borderRadius: 32,
  },

  /* Cards */
  card:         { borderRadius: 20, padding: 20, ...INACTIVE_SHADOW },
  cardActive:   { borderRadius: 24, padding: 22, minHeight: 200 },
  cardInactive: { minHeight: 144, opacity: 0.88 },

  /* Deco circles */
  deco1:    { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.07)', top: -35, right: -20 },
  deco1Big: { width: 180, height: 180, borderRadius: 90, top: -50, right: -30 },
  deco2:    { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -22, left: 14 },
  deco2Big: { width: 110, height: 110, borderRadius: 55 },

  /* Card content */
  cardLeftActive:   { paddingRight: 148, paddingBottom: 8 },
  cardLeftInactive: { paddingRight: 128 },

  activePill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  activeDot:  { width: 7, height: 7, borderRadius: 3.5 },
  activeLbl:  { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },

  cardName:         { fontWeight: '900', color: '#fff' },
  cardNameActive:   { fontSize: 26, letterSpacing: -0.6, textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  cardNameInactive: { fontSize: 18, letterSpacing: -0.2 },
  profNameBadge:    { position: 'absolute', bottom: 14, left: 20 },
  profName:         { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.3 },

  /* Professor anchored to card bottom-right */
  profWrap:         { position: 'absolute', top: 0, right: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center' },
  profWrapActive:   { width: 164, bottom: -22 },
  profWrapInactive: { width: 124, bottom: -18 },
  profWrapLoading:  { justifyContent: 'center', bottom: 0 },

  /* Downloading overlay */
  downloadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 24,
  },
  downloadingTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  /* Empty */
  empty:      { alignItems: 'center', paddingTop: 60 },
  emptyIcon:  { fontSize: 56, marginBottom: Spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 260 },
});
