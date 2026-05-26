import React, { useCallback, useRef, useEffect, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, StatusBar, Animated, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store';
import { Colors, Spacing, Radius } from '../theme';
import { getSubjectStyle } from '../utils/subjectStyles';

const { width: SCREEN_W } = Dimensions.get('window');
const NODE_SIZE      = 72;
const GLOW_SIZE      = 108;
const MASTERY_UNLOCK = 70;
const MASTERY_DONE   = 80;

type Status = 'intro' | 'mastered' | 'inProgress' | 'available' | 'locked';

function isIntroChunk(title = '') {
  return /^(introduction|intro|préambule|présentation|avant[- ]propos|généralités|sommaire|table)/i.test(title.trim());
}

function starsFromMastery(m: number): number {
  if (m >= 90) return 3;
  if (m >= 70) return 2;
  if (m >= 40) return 1;
  return 0;
}

function getStatus(mastery: number, unlocked: boolean, intro: boolean): Status {
  if (intro)                    return 'intro';
  if (mastery >= MASTERY_DONE)  return 'mastered';
  if (!unlocked)                return 'locked';
  if (mastery >= 1)             return 'inProgress';
  return 'available';
}

// ── Anneau lumineux animé (nœud ACTIF) ───────────────────────────────────────
const GlowRing = memo(({ color }: { color: string }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] });
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.26] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.glowRing, { backgroundColor: color + '55', transform: [{ scale }], opacity }]}
    />
  );
});

// ── Anneau doux (nœud DISPONIBLE) ────────────────────────────────────────────
const AvailableRing = memo(() => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.18] });
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.13] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.glowRing, { backgroundColor: '#FFFFFF', transform: [{ scale }], opacity }]}
    />
  );
});

// ── Étoiles ───────────────────────────────────────────────────────────────────
function Stars({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3].map(i => (
        <Text key={i} style={[styles.starChar, { opacity: i <= count ? 1 : 0.14 }]}>★</Text>
      ))}
    </View>
  );
}

// ── Écran principal ───────────────────────────────────────────────────────────
export default function SkillTreeScreen({ navigation }: any) {
  const {
    activeCourse, chapterMastery, activeChapterIndex,
    setActiveChapterIndex, setActiveCourse,
  } = useAppStore();

  const { top } = useSafeAreaInsets();
  const entranceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entranceAnim, {
      toValue: 1, duration: 450, delay: 60, useNativeDriver: true,
    }).start();
  }, []);

  const course = activeCourse;
  const chunks = course?.chunks ?? [];
  const masMap = chapterMastery[course?.id ?? ''] ?? {};
  const curIdx = activeChapterIndex[course?.id ?? ''] ?? 0;
  const style  = getSubjectStyle(course?.subjectName ?? '');

  const isUnlocked = useCallback((idx: number): boolean => {
    if (idx === 0) return true;
    if (idx === 1 && isIntroChunk(chunks[0]?.title ?? '')) return true;
    return (masMap[idx - 1] ?? 0) >= MASTERY_UNLOCK;
  }, [masMap, chunks]);

  const handlePress = useCallback((idx: number) => {
    if (!course) return;
    const unlocked = idx === 0
      || (idx === 1 && isIntroChunk(chunks[0]?.title ?? ''))
      || (masMap[idx - 1] ?? 0) >= MASTERY_UNLOCK;
    if (!unlocked) return;
    setActiveCourse(course.id);
    setActiveChapterIndex(course.id, idx);
    navigation.getParent()?.navigate('Chat');
  }, [course, chunks, masMap, setActiveCourse, setActiveChapterIndex, navigation]);

  const handleQuiz = useCallback((idx: number) => {
    if (!course) return;
    navigation.navigate('Quiz', {
      courseId: course.id,
      chapterIndex: idx,
      chapterTitle: chunks[idx]?.title ?? `Chapitre ${idx + 1}`,
    });
  }, [course, chunks, navigation]);

  // ── Pas de cours ─────────────────────────────────────────────────────────
  if (!course || chunks.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0F17" />
        <View style={styles.noCourse}>
          <Text style={styles.noCourseEmoji}>🎯</Text>
          <Text style={styles.noCourseTitle}>Commence ton parcours</Text>
          <Text style={styles.noCourseBody}>
            Choisis ta matière pour voir ton chemin vers la maîtrise.
          </Text>
          <TouchableOpacity
            style={styles.pickBtn}
            onPress={() => navigation.navigate('SubjectList')}
          >
            <Text style={styles.pickBtnText}>Choisir une matière  →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const masteredCount = chunks.filter((_, i) => (masMap[i] ?? 0) >= MASTERY_DONE).length;
  const avgMastery    = Math.round(
    chunks.reduce((s, _, i) => s + (masMap[i] ?? 0), 0) / chunks.length
  );

  let nextUnlockIdx = -1;
  for (let i = 1; i < chunks.length; i++) {
    if (!isUnlocked(i)) { nextUnlockIdx = i; break; }
  }
  const prevMastery = nextUnlockIdx > 0 ? (masMap[nextUnlockIdx - 1] ?? 0) : 100;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={style.bg} />

      {/* ── HEADER UNIFIÉ (titre + stats + barre) ──────────────────────── */}
      <View style={[styles.header, { paddingTop: top + 12, backgroundColor: style.bg }]}>
        <View style={styles.headerBubble1} />
        <View style={styles.headerBubble2} />

        {/* Ligne 1 : matière + Changer */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>{style.emoji}  {course.subjectName}</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{course.name}</Text>
          </View>
          <TouchableOpacity
            style={styles.changeBtn}
            onPress={() => navigation.navigate('SubjectList')}
          >
            <Text style={styles.changeBtnText}>Changer</Text>
          </TouchableOpacity>
        </View>

        {/* Séparateur */}
        <View style={styles.headerDivider} />

        {/* Ligne 3 : stats (0 maîtrisés / 7 chapitres / 0% progression) */}
        <View style={styles.statsRow}>
          {([
            { val: String(masteredCount), label: 'maîtrisés'  },
            { val: String(chunks.length), label: 'chapitres'  },
            { val: `${avgMastery}%`,      label: 'progression'},
          ] as const).map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={styles.statSep} />}
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: style.accent }]}>{s.val}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Barre de progression globale */}
        <View style={styles.globalBarTrack}>
          <View style={[styles.globalBarFill, {
            width: `${avgMastery}%` as any,
            backgroundColor: style.accent,
          }]} />
        </View>
      </View>

      {/* ── CHEMIN ─────────────────────────────────────────────────────── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.path}
        style={{
          opacity: entranceAnim,
          transform: [{
            translateY: entranceAnim.interpolate({
              inputRange: [0, 1], outputRange: [24, 0],
            }),
          }],
        }}
      >
        {chunks.map((chunk, idx) => {
          const mastery  = masMap[idx] ?? 0;
          const intro    = idx === 0 && isIntroChunk(chunk.title ?? '');
          const unlocked = isUnlocked(idx);
          const status   = getStatus(mastery, unlocked, intro);
          const isActive = idx === curIdx && unlocked;
          const stars    = starsFromMastery(mastery);
          const isLeft   = idx % 2 === 0;

          const nodeColor =
            status === 'mastered'   ? style.accent :
            status === 'inProgress' ? '#181B2C'    :
            status === 'intro'      ? style.bg      :
            status === 'available'  ? '#181B2C'    :
            '#0E1019';

          const borderColor =
            status === 'mastered'   ? style.accent       :
            isActive                ? style.accent       :
            status === 'inProgress' ? style.accent + 'BB' :
            status === 'intro'      ? style.accent + '88' :
            status === 'available'  ? '#3A3D58'           :
            '#1C1F30';

          const nodeLabel =
            status === 'mastered' ? '✓'  :
            status === 'locked'   ? '🔒' :
            status === 'intro'    ? '★'  :
            `${idx + 1}`;

          const nodeTextColor =
            status === 'mastered'   ? style.bg      :
            isActive                ? style.accent  :
            status === 'inProgress' ? style.accent  :
            status === 'intro'      ? style.accent  :
            status === 'available'  ? '#6B7280'     :
            '#252840';

          return (
            <View key={idx} style={styles.slot}>

              {/* Connecteur vertical entre les nœuds */}
              {idx > 0 && (
                <View style={[
                  styles.connector,
                  { backgroundColor: unlocked ? style.accent + '60' : '#1C1F30' },
                ]} />
              )}

              {/* Rangée zigzag */}
              <View style={[
                styles.nodeRow,
                isLeft ? styles.nodeRowLeft : styles.nodeRowRight,
              ]}>

                {/* Tige horizontale node ↔ centre */}
                <View style={[
                  styles.stem,
                  isLeft ? styles.stemLeft : styles.stemRight,
                  { backgroundColor: unlocked ? style.accent + '40' : '#1C1F30' },
                ]} />

                {/* Nœud (cercle) */}
                <TouchableOpacity
                  onPress={() => handlePress(idx)}
                  disabled={status === 'locked'}
                  activeOpacity={0.75}
                  style={styles.nodeTouchArea}
                >
                  <View style={styles.glowContainer}>
                    {isActive && <GlowRing color={style.accent} />}
                    {status === 'available' && !isActive && <AvailableRing />}
                  </View>

                  <View style={[
                    styles.node,
                    {
                      backgroundColor: nodeColor,
                      borderColor,
                      borderWidth: isActive ? 3.5 : status === 'inProgress' ? 2.5 : 2,
                      opacity: status === 'locked' ? 0.35 : 1,
                    },
                    status === 'mastered' && styles.nodeMastered,
                    status === 'mastered' && Platform.OS === 'ios' && {
                      shadowColor: style.accent,
                      shadowOpacity: 0.65,
                      shadowRadius: 16,
                    },
                  ]}>
                    <Text style={[
                      styles.nodeLabel,
                      {
                        color: nodeTextColor,
                        fontSize: status === 'locked' ? 22 : status === 'mastered' ? 26 : 20,
                      },
                    ]}>
                      {nodeLabel}
                    </Text>
                  </View>

                  {stars > 0 && <Stars count={stars} />}
                </TouchableOpacity>

                {/* Carte chapitre — tappable en entier */}
                <TouchableOpacity
                  style={[
                    styles.chapterCard,
                    isLeft ? styles.chapterCardRight : styles.chapterCardLeft,
                    status === 'locked' && styles.chapterCardLocked,
                    !( status === 'locked') && { borderLeftColor: style.accent + '55' },
                  ]}
                  onPress={() => handlePress(idx)}
                  disabled={status === 'locked'}
                  activeOpacity={0.82}
                >
                  {/* Badges statut */}
                  {isActive && (
                    <View style={[styles.statusPill, { backgroundColor: style.accent }]}>
                      <Text style={styles.statusPillTxt}>▶ EN COURS</Text>
                    </View>
                  )}
                  {status === 'mastered' && !isActive && (
                    <View style={[styles.statusPill, {
                      backgroundColor: style.accent + '20',
                      borderWidth: 1, borderColor: style.accent + '55',
                    }]}>
                      <Text style={[styles.statusPillTxt, { color: style.accent }]}>✓ MAÎTRISÉ</Text>
                    </View>
                  )}
                  {status === 'intro' && (
                    <View style={[styles.statusPill, {
                      backgroundColor: style.accent + '20',
                      borderWidth: 1, borderColor: style.accent + '55',
                    }]}>
                      <Text style={[styles.statusPillTxt, { color: style.accent }]}>INTRO</Text>
                    </View>
                  )}

                  <Text
                    style={[
                      styles.chapterTitle,
                      status === 'locked' && styles.chapterTitleDim,
                    ]}
                    numberOfLines={3}
                  >
                    {chunk.title || `Chapitre ${idx + 1}`}
                  </Text>

                  {mastery > 0 && !intro && (
                    <View style={styles.masterySection}>
                      <View style={styles.masteryRow}>
                        <Text style={[styles.masteryPct, { color: style.accent }]}>{mastery}%</Text>
                        <Text style={styles.masteryNeeded}>
                          {status === 'mastered'
                            ? '✓ maîtrisé'
                            : mastery >= MASTERY_UNLOCK
                              ? '✓ suivant débloqué'
                              : `${MASTERY_UNLOCK - mastery}% manquants`}
                        </Text>
                      </View>
                      <View style={styles.masteryBarOuter}>
                        <View style={styles.masteryBarWrap}>
                          <View style={[styles.masteryFill, {
                            width: `${mastery}%` as any,
                            backgroundColor: status === 'mastered' ? style.accent : style.accent + 'AA',
                          }]} />
                        </View>
                        {status !== 'mastered' && (
                          <View style={styles.marker70} />
                        )}
                      </View>
                    </View>
                  )}

                  {status === 'locked' ? (
                    <Text style={styles.lockHint}>
                      Atteins {MASTERY_UNLOCK}% au ch. précédent
                    </Text>
                  ) : (
                    <View style={styles.cardActions}>
                      {!intro && (
                        <TouchableOpacity
                          style={[styles.quizBtn, { borderColor: style.accent + '45' }]}
                          onPress={(e) => { e.stopPropagation?.(); handleQuiz(idx); }}
                        >
                          <Text style={[styles.quizBtnTxt, { color: style.accent + 'BB' }]}>
                            ✏️ Quiz
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </TouchableOpacity>

              </View>
            </View>
          );
        })}

        {/* Banner : prochain déblocage */}
        {nextUnlockIdx > 0 && prevMastery < MASTERY_UNLOCK && (
          <View style={[styles.unlockBanner, {
            borderColor: style.accent + '30',
          }]}>
            <Text style={[styles.unlockTitle, { color: style.accent }]}>
              🔓 Prochain déblocage
            </Text>
            <Text style={styles.unlockSub}>
              Chapitre {nextUnlockIdx + 1} — encore {MASTERY_UNLOCK - prevMastery}% à gagner
            </Text>
            <View style={styles.unlockBarTrack}>
              <View style={[styles.unlockBarFill, {
                width: `${(prevMastery / MASTERY_UNLOCK) * 100}%` as any,
                backgroundColor: style.accent,
              }]} />
            </View>
            <Text style={[styles.unlockPct, { color: style.accent }]}>
              {prevMastery} / {MASTERY_UNLOCK}
            </Text>
          </View>
        )}

        <View style={{ height: 110 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const STEM_W = (SCREEN_W / 2) - NODE_SIZE / 2 - 24 - Spacing.lg;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0F17' },

  // ── No-course ──
  noCourse: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  noCourseEmoji: { fontSize: 60, marginBottom: 20 },
  noCourseTitle: { fontSize: 24, fontWeight: '800', color: '#E2E8F0', marginBottom: 10, letterSpacing: -0.5 },
  noCourseBody:  { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 24, marginBottom: 36 },
  pickBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.lg,
    paddingVertical: 16, paddingHorizontal: 32,
    ...Platform.select({
      ios: { shadowColor: Colors.blue, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  pickBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },

  // ── Header (titre + stats + barre — tout en un seul bloc) ──
  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: 16,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 18 },
      android: { elevation: 12 },
    }),
  },
  headerBubble1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40,
  },
  headerBubble2: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.04)', bottom: 10, right: 70,
  },
  headerRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  headerSub:    { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.6, marginBottom: 3 },
  headerTitle:  { fontSize: 19, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  changeBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  changeBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  headerDivider:{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },

  // Stats row (dans le header)
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-around', marginBottom: 10,
  },
  statItem:  { alignItems: 'center' },
  statVal:   { fontSize: 22, fontWeight: '900' },
  statLabel: {
    fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: '700',
    marginTop: 2, letterSpacing: 0.6, textTransform: 'uppercase',
  },
  statSep:   { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.12)' },

  // Barre progression globale (dans le header)
  globalBarTrack: {
    height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden',
  },
  globalBarFill: { height: 5, borderRadius: 3 },

  // ── Path ──
  path: { paddingTop: 24, paddingHorizontal: Spacing.lg, alignItems: 'center' },

  slot:      { width: '100%', alignItems: 'center' },
  connector: { width: 2, height: 30, borderRadius: 2 },

  // Zigzag row
  nodeRow:      { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 4 },
  nodeRowLeft:  { justifyContent: 'flex-start', paddingLeft: 4 },
  nodeRowRight: { justifyContent: 'flex-end', paddingRight: 4, flexDirection: 'row-reverse' },

  // Tiges
  stem:      { height: 2, borderRadius: 2, flex: 0 },
  stemLeft:  { width: STEM_W },
  stemRight: { width: STEM_W },

  // Nœud
  nodeTouchArea: { alignItems: 'center' },
  glowContainer: {
    position: 'absolute',
    width: GLOW_SIZE, height: GLOW_SIZE,
    top: -(GLOW_SIZE - NODE_SIZE) / 2,
    left: -(GLOW_SIZE - NODE_SIZE) / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  glowRing: {
    width: GLOW_SIZE, height: GLOW_SIZE, borderRadius: GLOW_SIZE / 2,
  },
  node: {
    width: NODE_SIZE, height: NODE_SIZE, borderRadius: NODE_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  nodeMastered: {
    ...Platform.select({ android: { elevation: 10 } }),
  },
  nodeLabel: { fontWeight: '900', lineHeight: 28 },

  starsRow: { flexDirection: 'row', marginTop: 5, gap: 1 },
  starChar: { fontSize: 11, color: '#FBBF24' },

  // Carte chapitre
  chapterCard: {
    flex: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#131520',
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#1B1E2E',
    borderLeftWidth: 3,
    marginVertical: 2,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.28, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  chapterCardLeft:   { marginRight: 8 },
  chapterCardRight:  { marginLeft: 8 },
  chapterCardLocked: { opacity: 0.42, borderLeftColor: '#1B1E2E' },

  statusPill: {
    alignSelf: 'flex-start', borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 3, marginBottom: 5,
  },
  statusPillTxt: { fontSize: 8, fontWeight: '900', color: '#fff', letterSpacing: 1.1 },

  chapterTitle:    { fontSize: 12, fontWeight: '700', color: '#C8D0E0', lineHeight: 18, marginBottom: 6 },
  chapterTitleDim: { color: '#2D3148' },

  masterySection: { marginBottom: 8 },
  masteryRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  masteryPct:     { fontSize: 15, fontWeight: '900', letterSpacing: -0.3 },
  masteryNeeded:  { fontSize: 9, color: '#4B5563', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  masteryBarOuter: { position: 'relative', height: 10, justifyContent: 'center' },
  masteryBarWrap:  { height: 5, borderRadius: 3, backgroundColor: '#1B1E2E', overflow: 'hidden' },
  masteryFill:     { height: 5, borderRadius: 3 },
  marker70: {
    position: 'absolute', left: '70%' as any,
    width: 2, height: 10,
    backgroundColor: '#6B7280', borderRadius: 1,
  },

  cardActions: { flexDirection: 'row', marginTop: 2 },
  quizBtn: {
    borderRadius: 8, borderWidth: 1, backgroundColor: 'transparent',
    paddingHorizontal: 9, paddingVertical: 4,
  },
  quizBtnTxt: { fontSize: 10, fontWeight: '800' },

  lockHint: { fontSize: 9, color: '#2D3148', marginTop: 4, lineHeight: 14 },

  // Banner déblocage (fond solide pour couvrir le trait)
  unlockBanner: {
    width: '88%', borderRadius: Radius.lg, borderWidth: 1,
    padding: Spacing.lg, marginTop: Spacing.xl,
    alignItems: 'center', gap: 7,
    backgroundColor: '#0D0F17',
  },
  unlockTitle:    { fontSize: 13, fontWeight: '800' },
  unlockSub:      { fontSize: 11, color: 'rgba(255,255,255,0.38)', textAlign: 'center' },
  unlockBarTrack: {
    width: '100%', height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  unlockBarFill:  { height: 8, borderRadius: 4 },
  unlockPct:      { fontSize: 12, fontWeight: '700' },
});
