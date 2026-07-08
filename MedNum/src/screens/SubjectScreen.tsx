import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
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
import { Ionicons } from '@expo/vector-icons';
import { supabase, SBCourse } from '../lib/supabase';
import { useAppStore, Course, CourseChunk } from '../store';
import { Spacing, Radius } from '../theme';
import { useTheme, Text } from '../components';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const PAGE_BG = '#F4F7FA';

function subjectIcon(name: string): React.ComponentProps<typeof Ionicons>['name'] {
  const n = name.toLowerCase();
  if (n.includes('cardio'))             return 'heart-outline';
  if (n.includes('neuro'))              return 'flash-outline';
  if (n.includes('anat'))               return 'body-outline';
  if (n.includes('pharma'))             return 'medkit-outline';
  if (n.includes('chir'))               return 'cut-outline';
  if (n.includes('pneumo'))             return 'cloud-outline';
  if (n.includes('gastro'))             return 'nutrition-outline';
  if (n.includes('ophtalmologie'))      return 'eye-outline';
  if (n.includes('infect'))             return 'bug-outline';
  if (n.includes('physio'))             return 'pulse-outline';
  if (n.includes('bioch') || n.includes('biologie')) return 'flask-outline';
  return 'document-text-outline';
}

function todayLabel() {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function SubjectScreen() {
  const {
    studentClassId, studentClassName,
    activeCourse, courses: storeCourses,
    addCourse, setActiveCourse, updateCourseChunks,
  } = useAppStore();
  const t = useTheme();
  const { top } = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [sbCourses, setSbCourses]     = useState<SBCourse[]>([]);
  const [loading, setLoading]         = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!studentClassId) { setLoading(false); return; }
    supabase
      .from('courses')
      .select('*, classes(name), subjects(name)')
      .eq('class_id', studentClassId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setSbCourses(data as SBCourse[]);
        setLoading(false);
      });
  }, [studentClassId]);

  const handleSelect = useCallback(async (course: SBCourse) => {
    if (downloading) return;
    const existing       = storeCourses.find(c => c.id === course.id);
    const hasCached      = existing && existing.content?.trim().length > 50;
    setDownloading(course.id);
    try {
      if (hasCached) {
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
          throw new Error("Ce cours n'a pas encore de contenu textuel.\n\nRe-uploade le PDF depuis l'application admin.");
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

  const activeItem = sbCourses.find(c => c.id === activeCourse?.id);

  return (
    <View style={[styles.root, { backgroundColor: PAGE_BG }]}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE_BG} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: top + 20, paddingBottom: 110 }]}
      >
        {/* ── TOPBAR ── */}
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.today, { color: TEAL }]}>{todayLabel()}</Text>
            <Text style={[styles.pageTitle, { color: NAVY }]}>Matières</Text>
          </View>
          {studentClassName && (
            <View style={styles.promoPill}>
              <Text style={styles.promoPillTxt}>{studentClassName}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={TEAL} size="large" />
            <Text style={[styles.loadingTxt, { color: '#94A3B8' }]}>Chargement…</Text>
          </View>
        ) : sbCourses.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="folder-open-outline" size={34} color={TEAL} />
            </View>
            <Text style={[styles.emptyTitle, { color: NAVY }]}>Aucun cours disponible</Text>
            <Text style={styles.emptyBody}>
              Les cours de votre promotion apparaîtront ici une fois uploadés.
            </Text>
            <TouchableOpacity style={styles.uploadBtn} onPress={() => navigation.navigate('AdminUpload')}>
              <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
              <Text style={styles.uploadBtnTxt}>Uploader un cours</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── CARTE HERO si cours actif ── */}
            {activeItem && (
              <TouchableOpacity
                style={styles.heroCard}
                onPress={() => handleSelect(activeItem)}
                activeOpacity={0.85}
                disabled={!!downloading}
              >
                {/* fond décoratif */}
                <View style={styles.heroCircle1} />
                <View style={styles.heroCircle2} />

                <View style={styles.heroBadge}>
                  <View style={styles.heroDot} />
                  <Text style={styles.heroBadgeTxt}>EN COURS</Text>
                </View>

                <Text style={styles.heroSubject}>
                  {activeItem.subjects?.name || activeItem.name}
                </Text>
                <Text style={styles.heroCourseName} numberOfLines={1}>
                  {activeItem.name}
                </Text>

                <View style={styles.heroFooter}>
                  <View style={styles.heroTag}>
                    <Ionicons name="person-circle-outline" size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.heroTagTxt}>Dr. Ahmed</Text>
                  </View>
                  <View style={styles.heroTag}>
                    <Ionicons name="document-text-outline" size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.heroTagTxt}>{activeItem.pages || 0} pages</Text>
                  </View>
                  <View style={styles.heroContinueBtn}>
                    <Text style={styles.heroContinueTxt}>Continuer</Text>
                    <Ionicons name="arrow-forward" size={14} color={TEAL} />
                  </View>
                </View>

                {downloading === activeItem.id && (
                  <View style={styles.heroLoading}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* ── SECTIONS groupées par matière ── */}
            {(() => {
              const others = sbCourses.filter(c => c.id !== activeItem?.id);
              const bySubject: Record<string, SBCourse[]> = {};
              others.forEach(c => {
                const key = c.subjects?.name || 'Autres';
                if (!bySubject[key]) bySubject[key] = [];
                bySubject[key].push(c);
              });
              return Object.entries(bySubject).map(([subject, items]) => (
                <View key={subject} style={styles.subjectSection}>
                  <View style={styles.subjectHeader}>
                    <View style={styles.subjectIconWrap}>
                      <Ionicons name={subjectIcon(subject)} size={16} color={TEAL} />
                    </View>
                    <Text style={[styles.subjectTitle, { color: NAVY }]}>{subject}</Text>
                    <Text style={[styles.subjectCount, { color: TEAL }]}>{items.length}</Text>
                  </View>

                  <View style={styles.cardList}>
                    {items.map(item => {
                      const isDown = downloading === item.id;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.card, { backgroundColor: t.surface }]}
                          onPress={() => handleSelect(item)}
                          activeOpacity={0.7}
                          disabled={!!downloading}
                        >
                          <View style={styles.cardBody}>
                            <Text style={[styles.cardName, { color: NAVY }]} numberOfLines={2}>
                              {item.name}
                            </Text>
                            <Text style={[styles.cardMeta, { color: '#94A3B8' }]}>
                              Dr. Ahmed · {item.pages || 0} pages
                            </Text>
                          </View>

                          <View style={styles.cardArrow}>
                            {isDown
                              ? <ActivityIndicator color={TEAL} size="small" />
                              : <Ionicons name="arrow-forward-circle-outline" size={24} color={TEAL} />
                            }
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ));
            })()}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  /* ── Topbar ── */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  today:     { fontSize: 12, fontWeight: '600', letterSpacing: 0.3, marginBottom: 2 },
  pageTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  promoPill: {
    backgroundColor: TEAL_BG,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: TEAL + '40',
  },
  promoPillTxt: { fontSize: 13, fontWeight: '700', color: TEAL },

  /* ── Loading ── */
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 14 },
  loadingTxt:  { fontSize: 14, fontWeight: '500' },

  /* ── Hero card ── */
  heroCard: {
    backgroundColor: NAVY,
    borderRadius: 22,
    padding: 22,
    marginBottom: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  heroCircle1: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(7,169,151,0.12)', top: -50, right: -40,
  },
  heroCircle2: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.04)', bottom: 0, left: -20,
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14,
  },
  heroDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: TEAL,
  },
  heroBadgeTxt: {
    fontSize: 10, fontWeight: '800', color: TEAL, letterSpacing: 1.2,
  },
  heroSubject: {
    fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.6, marginBottom: 4,
  },
  heroCourseName: {
    fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20,
  },
  heroFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  heroTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5,
  },
  heroTagTxt: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  heroContinueBtn: {
    marginLeft: 'auto' as any,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fff',
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 7,
  },
  heroContinueTxt: { fontSize: 12, fontWeight: '700', color: TEAL },
  heroLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,30,52,0.6)',
    borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },

  /* ── Subject sections ── */
  subjectSection: { marginBottom: 24 },
  subjectHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  subjectIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center',
  },
  subjectTitle: { flex: 1, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  subjectCount: { fontSize: 13, fontWeight: '800' },

  /* ── Card list ── */
  cardList: { gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  cardBody:    { flex: 1 },
  cardName:    { fontSize: 14, fontWeight: '600', letterSpacing: -0.2, marginBottom: 4 },
  cardMeta:    { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },
  cardArrow:   { paddingLeft: 4 },

  /* ── Empty ── */
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyBody:  { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: NAVY, borderRadius: Radius.md,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  uploadBtnTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
