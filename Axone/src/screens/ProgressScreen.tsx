import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { Spacing, Radius } from '../theme';
import { useTheme, Text } from '../components';
import { useT, useUiLang } from '../i18n';
import type { TranslationShape } from '../i18n';
import { getSubjectStyle, getProfessorName } from '../utils/subjectStyles';

const NAVY  = '#0B1E34';
const TEAL  = '#07A997';
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}
function isThisWeek(iso: string) { return !!iso && iso >= getWeekStart(); }

function cleanConcept(text: string): string {
  return text
    .replace(/^(c[''`]est quoi|c est quoi|qu[''`]est.ce que?|qu est ce que|explique.?moi|comment fonctionne|comment|pourquoi|kesako|c koi|ckoi|definis|definition de|parle.?moi de|dis.?moi|je comprends? pas)\s+/i, '')
    .replace(/^(le|la|les|un|une|des|du|de la|de l[''`]|l[''`])\s+/i, '')
    .replace(/\s+/g, ' ').trim().slice(0, 48);
}

function insightMessage(count: number, tr: TranslationShape): string {
  if (count <= 2) return tr.progress.insight1;
  if (count <= 4) return `${count}× ${tr.progress.insight2}`;
  return `${count}× ${tr.progress.insight3}`;
}

function chapterStatus(score: number, tr: TranslationShape): { label: string; color: string; bg: string } {
  if (score >= 70) return { label: tr.progress.statusMastered,   color: '#10B981', bg: '#10B98118' };
  if (score >= 40) return { label: tr.progress.statusInProgress, color: '#F59E0B', bg: '#F59E0B18' };
  if (score >  0)  return { label: tr.progress.statusDanger,     color: '#EF4444', bg: '#EF444418' };
  return                   { label: tr.progress.statusNotDone,   color: '#6B7280', bg: 'transparent' };
}


// ── Dot animé ────────────────────────────────────────────────────────────────

function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,   duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, opacity: anim }} />;
}


// ── Screen ───────────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const navigation = useNavigation<any>();
  const { top, bottom } = useSafeAreaInsets();
  const t = useTheme();
  const tr = useT();
  const {
    courses, activeCourse, conceptHistory,
    chapterMastery, streakCurrent, streakLastDate, xpToday, dailyGoal, activeChapterIndex, setActiveChapterIndex,
    quotaUsed, quotaLimit, plan, trialEndsAt,
  } = useAppStore();

  const quotaRemaining = Math.max(0, quotaLimit - quotaUsed);

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  const effectiveStreak = (() => {
    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (streakLastDate === today || streakLastDate === yesterday) return streakCurrent;
    return 0;
  })();

  const streakColor =
    effectiveStreak === 0 ? '#9CA3AF' :
    effectiveStreak < 3  ? '#FCD34D' :
    effectiveStreak < 7  ? '#FF6B35' :
    effectiveStreak < 14 ? '#F97316' :
    '#EF4444';

  const flickerAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (effectiveStreak < 7) { flickerAnim.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(flickerAnim, { toValue: 0.65, duration: 80,  useNativeDriver: true }),
      Animated.timing(flickerAnim, { toValue: 1.0,  duration: 120, useNativeDriver: true }),
      Animated.timing(flickerAnim, { toValue: 0.80, duration: 60,  useNativeDriver: true }),
      Animated.timing(flickerAnim, { toValue: 1.0,  duration: 100, useNativeDriver: true }),
      Animated.timing(flickerAnim, { toValue: 0.55, duration: 90,  useNativeDriver: true }),
      Animated.timing(flickerAnim, { toValue: 1.0,  duration: 150, useNativeDriver: true }),
      Animated.delay(200),
    ]));
    loop.start();
    return () => loop.stop();
  }, [effectiveStreak]);

  const isChapterUnlocked = (idx: number): boolean => {
    if (!activeCourse) return false;
    if (idx === 0) return true;
    const masMap = chapterMastery[activeCourse.id] || {};
    // Déjà fait = toujours accessible pour retravailler
    if ((masMap[idx] ?? 0) > 0) return true;
    return (masMap[idx - 1] ?? 0) >= 70;
  };

  const subjectStyle = getSubjectStyle(activeCourse?.subjectName ?? '');
  const profName     = getProfessorName(activeCourse?.subjectName ?? '');
  const bg           = NAVY;
  const accent       = TEAL;
  // RTL uniquement piloté par la langue de l'interface (pas par la langue du cours).
  const courseIsAr   = useUiLang() === 'ar';

  // Maîtrise par chapitre du cours actif (intro exclue)
  const chapterStats = useMemo(() => {
    if (!activeCourse?.chunks?.length) return [];
    const masteryMap = chapterMastery[activeCourse.id] || {};
    return activeCourse.chunks.map((chunk, i) => ({
      index:   i,
      title:   chunk.title || `${tr.skillTree.chapterLabel} ${i + 1}`,
      mastery: masteryMap[i] ?? 0,
      done:    (masteryMap[i] ?? 0) > 0,
      isIntro: i === 0 && /^(introduction|intro|préambule|présentation|avant[- ]propos|généralités|sommaire|table|تقديم|مقدمة|توطئة|المحتويات)/i.test((chunk.title ?? '').trim()),
    }));
  }, [activeCourse, chapterMastery, tr]);

  const sortedChapters = chapterStats;

  // Vue toutes matières
  const allSubjects = useMemo(() => {
    const bySubject: Record<string, { subjectName: string; lastActivity: string }> = {};
    for (const c of courses) {
      if (!c.subjectName) continue;
      // Dernière activité = date la plus récente dans conceptHistory pour ce cours
      const concepts = conceptHistory[c.id] || {};
      const lastDates = Object.values(concepts).map(v => v.lastAsked).filter(Boolean);
      const lastActivity = lastDates.length > 0 ? lastDates.sort().at(-1)! : '';
      if (!bySubject[c.subjectName] || lastActivity > bySubject[c.subjectName].lastActivity) {
        bySubject[c.subjectName] = { subjectName: c.subjectName, lastActivity };
      }
    }
    return Object.values(bySubject);
  }, [courses, conceptHistory]);

  function getActivityInfo(iso: string, subjectAccent: string): { label: string; hint: string | null; color: string } {
    if (!iso) return { label: tr.progress.neverStudied, hint: tr.progress.neverStudiedHint, color: '#9CA3AF' };
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days === 0) return { label: tr.progress.today, hint: null, color: subjectAccent };
    if (days === 1) return { label: tr.progress.yesterday, hint: null, color: subjectAccent };
    if (days <= 3)  return { label: `${tr.progress.daysAgo} ${days} ${tr.progress.daysAgoSuffix}`, hint: null, color: '#9CA3AF' };
    if (days <= 7)  return { label: `${tr.progress.daysAgo} ${days} ${tr.progress.daysAgoSuffix}`, hint: tr.progress.dontNeglect, color: '#D97706' };
    if (days <= 14) return { label: tr.progress.oneWeekAgo, hint: tr.progress.fallingBehind, color: '#9CA3AF' };
    return { label: tr.progress.longAgo, hint: tr.progress.resumeRevisions, color: '#9CA3AF' };
  }

  // Lacune principale
  const weakConcept = useMemo(() => {
    if (!activeCourse) return null;
    const map = conceptHistory[activeCourse.id] || {};
    const sorted = Object.entries(map)
      .filter(([, v]) => isThisWeek(v.lastAsked))
      .sort((a, b) => b[1].count - a[1].count);
    if (!sorted.length || sorted[0][1].count < 2) return null;
    return { concept: sorted[0][0], count: sorted[0][1].count };
  }, [conceptHistory, activeCourse]);

  const questDone = xpToday >= Math.floor(dailyGoal * 0.6);

  // Mission concrète basée sur les chapitres
  const dailyMission = useMemo(() => {
    // 1. Chapitre fait mais score faible → améliorer
    const weak = chapterStats.find(c => c.done && c.mastery < 60);
    if (weak) return {
      icon: 'alert-circle' as const,
      action: `${tr.progress.improveScore} ${weak.title}`,
      reason: `${tr.progress.hadScoreLastTime} ${weak.mastery}${tr.progress.hadScoreLastTimeSuffix}`,
      onPress: () => activeCourse && isChapterUnlocked(weak.index) && navigation.navigate('Cours', {
        screen: 'Quiz',
        params: { courseId: activeCourse.id, chapterIndex: weak.index, chapterTitle: weak.title },
      }),
    };
    // 2. Prochain chapitre non fait
    const next = chapterStats.find(c => !c.done);
    if (next) return {
      icon: 'play-circle' as const,
      action: `${tr.progress.doQuiz} ${next.title}`,
      reason: tr.progress.notEvaluatedYet,
      onPress: () => activeCourse && isChapterUnlocked(next.index) && navigation.navigate('Cours', {
        screen: 'Quiz',
        params: { courseId: activeCourse.id, chapterIndex: next.index, chapterTitle: next.title },
      }),
    };
    // 3. Concept faible → aller au chat
    if (weakConcept) return {
      icon: 'chatbubble-ellipses' as const,
      action: `${tr.progress.deepenConcept} "${cleanConcept(weakConcept.concept)}"`,
      reason: tr.progress.conceptRecurring,
      onPress: () => navigation.navigate('Chat', {
        prefill: `${tr.chat.explainPrefix} : ${weakConcept.concept}`,
      }),
    };
    // 4. Tout bon → encouragement
    return {
      icon: 'star' as const,
      action: `${tr.progress.askQuestionTo} ${profName}`,
      reason: tr.progress.everyQuestionCounts,
      onPress: () => navigation.navigate('Chat'),
    };
  }, [chapterStats, weakConcept, activeCourse, profName, tr]);

  return (
    <View style={[s.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: top + Spacing.lg, backgroundColor: bg }]}>
        <View style={s.hBubble1} />
        <View style={s.hBubble2} />
        <View style={[s.headerRow, courseIsAr && { flexDirection: 'row-reverse' }]}>
          <Text style={s.headerTitle}>{tr.progress.headerTitle}</Text>
          <View style={s.streakPill}>
            <Animated.View style={{ opacity: effectiveStreak >= 7 ? flickerAnim : 1 }}>
              <Ionicons name="flame" size={16} color={streakColor} />
            </Animated.View>
            <Text style={[s.streakNum, { color: streakColor }]}>{effectiveStreak}</Text>
            <Text style={s.streakLabel}>{tr.progress.daysAgoSuffix}</Text>
          </View>
        </View>
      </View>

<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingBottom: bottom + 100 }]}>

        {/* ── CARTE ABONNEMENT / QUOTA ────────────────────────────────────── */}
        {(plan === 'freemium' || plan === 'trial') && (
          <TouchableOpacity
            style={[s.quotaCard, {
              backgroundColor: quotaRemaining === 0 ? '#7A1F1F' : NAVY,
            }]}
            onPress={() => navigation.navigate('Subscription')}
            activeOpacity={0.9}
          >
            <View style={s.quotaHalo} />
            <View style={s.quotaTopRow}>
              <View style={s.quotaPlanBadge}>
                <Ionicons name={plan === 'trial' ? 'gift-outline' : 'sparkles'} size={12} color={TEAL} />
                <Text style={s.quotaPlanBadgeText}>
                  {plan === 'trial' ? tr.progress.freeTrial : tr.progress.freemium}
                </Text>
              </View>
              {plan === 'trial' && trialDaysLeft !== null && (
                <Text style={[s.quotaTrialDays, { color: trialDaysLeft <= 2 ? '#F87171' : '#FCD34D' }]}>
                  J-{trialDaysLeft}
                </Text>
              )}
            </View>

            <Text style={[s.quotaHeadline, { marginBottom: 18 }]}>
              {quotaRemaining === 0 ? 'Quota épuisé pour aujourd\'hui' : 'Débloque le chat illimité'}
            </Text>

            <View style={s.upgradeBtn}>
              <Text style={s.upgradeBtnText}>{tr.progress.subscribe}</Text>
              <Ionicons name="arrow-forward" size={15} color={NAVY} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── TOUTES MES MATIÈRES ─────────────────────────────────────────── */}
        {allSubjects.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[s.cardTitle, { color: t.text }]}>{tr.progress.allMySubjects}</Text>
            {allSubjects.map((sub, i) => {
              const st = getSubjectStyle(sub.subjectName);
              const isActive = sub.subjectName === activeCourse?.subjectName;
              const { label, hint, color } = getActivityInfo(sub.lastActivity, st.accent);
              return (
                <View key={sub.subjectName} style={[
                  s.subjectRow,
                  { backgroundColor: t.surfaceAlt, borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: color },
                  i < allSubjects.length - 1 && { marginBottom: 10 },
                ]}>
                  <View style={[s.subjectEmoji, { backgroundColor: st.bg + '25' }]}>
                    <Text style={{ fontSize: 16 }}>{st.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[s.subjectName, { color: isActive ? st.accent : t.text }]} numberOfLines={1}>
                      {sub.subjectName}{isActive ? '  ●' : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="time-outline" size={12} color={color} />
                      <Text style={{ fontSize: 12, color, fontWeight: '700' }}>{label}</Text>
                    </View>
                    {hint ? (
                      <Text style={{ fontSize: 11, color, fontWeight: '500', opacity: 0.85 }}>{hint}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}



        {/* ── MES CHAPITRES ────────────────────────────────────────────────── */}
        {sortedChapters.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[s.cardTitle, { color: t.text }]}>{tr.progress.myChapters}</Text>
            <Text style={[s.cardSub, { color: t.textMuted }]}>{tr.progress.tapChapterToRedoQuiz}</Text>
            {sortedChapters.map((ch, i) => {
              const st = chapterStatus(ch.mastery, tr);
              const isDanger = ch.done && ch.mastery < 40;
              const locked = !isChapterUnlocked(ch.index);
              const disabled = ch.isIntro || locked;
              return (
                <TouchableOpacity
                  key={ch.index}
                  style={[
                    s.chapterRow,
                    { backgroundColor: isDanger ? '#EF444410' : t.surfaceAlt, borderColor: isDanger ? '#EF444430' : t.border },
                    (locked || ch.isIntro) && { opacity: 0.45 },
                    i < sortedChapters.length - 1 && { marginBottom: 8 },
                  ]}
                  onPress={() => {
                    if (!activeCourse || disabled) return;
                    navigation.navigate('Cours', {
                      screen: 'Quiz',
                      params: { courseId: activeCourse.id, chapterIndex: ch.index, chapterTitle: ch.title },
                    });
                  }}
                  disabled={disabled}
                  activeOpacity={0.8}
                >
                  {/* Numéro */}
                  <View style={[s.chapterNum, { backgroundColor: isDanger ? '#EF444425' : subjectStyle.bg + '20' }]}>
                    <Text style={[s.chapterNumText, { color: isDanger ? '#EF4444' : accent }]}>{ch.index + 1}</Text>
                  </View>

                  {/* Contenu */}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.chapterTitle, { color: t.text }]} numberOfLines={1}>{ch.title}</Text>
                    {ch.done ? (
                      <View style={s.chapterBarWrap}>
                        <View style={[s.chapterBarBg, { backgroundColor: t.border }]}>
                          <View style={[s.chapterBarFill, { width: `${ch.mastery}%` as any, backgroundColor: st.color }]} />
                        </View>
                        <Text style={[s.chapterPct, { color: st.color }]}>{ch.mastery}%</Text>
                      </View>
                    ) : (
                      <Text style={[s.chapterNotDone, { color: t.textMuted }]}>{tr.progress.quizNotDone}</Text>
                    )}
                  </View>

                  {/* Badge statut */}
                  {ch.isIntro ? (
                    <View style={[s.chapterBadge, { backgroundColor: t.border, borderColor: t.border }]}>
                      <Text style={[s.chapterBadgeText, { color: t.textMuted }]}>{tr.progress.introBadge}</Text>
                    </View>
                  ) : locked ? (
                    <Ionicons name="lock-closed" size={16} color={t.textMuted} />
                  ) : (
                    <View style={[s.chapterBadge, { backgroundColor: st.bg, borderColor: st.color + '40' }]}>
                      <Text style={[s.chapterBadgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── MISSION DU JOUR ──────────────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: t.surface, borderColor: questDone ? '#10B981' + '40' : accent + '30' }]}>
          <View style={[s.cardHeader, { justifyContent: 'space-between' }]}>
            <View style={s.cardHeader}>
              <PulseDot color={questDone ? '#10B981' : accent} />
              <Text style={[s.cardChip, { color: questDone ? '#10B981' : accent }]}>{tr.progress.dailyMission}</Text>
            </View>
            <View style={[s.xpBadge, { backgroundColor: (questDone ? '#10B981' : accent) + '18', borderColor: (questDone ? '#10B981' : accent) + '40' }]}>
              <Text style={[s.xpBadgeNum, { color: questDone ? '#10B981' : accent }]}>{xpToday}</Text>
              <Text style={[s.xpBadgeMax, { color: t.textMuted }]}> {tr.progress.xpSuffix}</Text>
            </View>
          </View>

          {questDone ? (
            <View style={s.missionRow}>
              <View style={[s.missionIcon, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              </View>
              <Text style={[s.missionText, { color: t.text }]}>{tr.progress.missionDone}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.missionCard, { backgroundColor: accent + '12', borderColor: accent + '30' }]}
              onPress={dailyMission.onPress}
              activeOpacity={0.8}
            >
              <View style={[s.missionIcon, { backgroundColor: accent + '20' }]}>
                <Ionicons name={dailyMission.icon} size={22} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.missionAction, { color: t.text }]} numberOfLines={2}>{dailyMission.action}</Text>
                <Text style={[s.missionReason, { color: t.textMuted }]} numberOfLines={2}>{dailyMission.reason}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={accent} />
            </TouchableOpacity>
          )}

          <View style={{ marginTop: 12 }}>
            <View style={[s.missionBarBg, { backgroundColor: t.border }]}>
              <View style={[s.missionBarFill, {
                width: `${Math.min((xpToday / dailyGoal) * 100, 100)}%` as any,
                backgroundColor: questDone ? '#10B981' : accent,
              }]} />
            </View>
            <Text style={[s.missionBarLabel, { color: t.textMuted }]}>{xpToday} / {dailyGoal} {tr.progress.xpToday}</Text>
          </View>
        </View>

        {/* ── PROF X A REMARQUÉ ────────────────────────────────────────────── */}
        {weakConcept ? (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: accent + '40' }]}>
            <View style={s.cardHeader}>
              <PulseDot color={accent} />
              <Text style={[s.cardChip, { color: accent }]}>{profName.toUpperCase()} {tr.progress.hasNoticed}</Text>
            </View>
            <Text style={[s.insightTitle, { color: t.text }]}>
              {tr.progress.subjectRecurring}{'\n'}
              <Text style={{ color: accent, fontWeight: '800' }}>
                {cleanConcept(weakConcept.concept) || weakConcept.concept.slice(0, 45)}
              </Text>
            </Text>
            <Text style={[s.insightSub, { color: t.textMuted }]}>{insightMessage(weakConcept.count, tr)}</Text>
            <TouchableOpacity
              style={[s.insightBtn, { backgroundColor: bg }]}
              onPress={() => navigation.navigate('Chat', {
                prefill: `${tr.progress.explainDetailed} ${cleanConcept(weakConcept.concept) || weakConcept.concept}`,
              })}
              activeOpacity={0.8}
            >
              <Text style={s.insightBtnText}>{tr.progress.masterThisPoint}</Text>
              <Ionicons name="arrow-forward" size={15} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: accent + '30' }]}>
            <View style={s.cardHeader}>
              <PulseDot color={accent} />
              <Text style={[s.cardChip, { color: accent }]}>{profName.toUpperCase()} {tr.progress.hasNoticed}</Text>
            </View>
            <Text style={[s.insightTitle, { color: t.text }]}>
              {effectiveStreak >= 3 ? tr.progress.consistencyPays : tr.progress.allGoodForNow}
            </Text>
            <Text style={[s.insightSub, { color: t.textMuted }]}>
              {streakCurrent >= 3
                ? `${streakCurrent} ${tr.progress.consecutiveDays}`
                : `${tr.progress.keepAsking} ${profName} ${tr.progress.willGetToKnowYou}`}
            </Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  /* Carte quota / abonnement */
  quotaCard: {
    borderRadius: 22, padding: 18, overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  quotaHalo: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(7,169,151,0.14)', top: -60, right: -40,
  },
  quotaTopRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  quotaPlanBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  quotaPlanBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  quotaTrialDays:   { fontSize: 12, fontWeight: '800' },
  quotaHeadline:    { fontFamily: SERIF, fontSize: 19, color: '#fff', letterSpacing: -0.3, marginBottom: 12 },
  upgradeBtn:       {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: Radius.full, paddingVertical: 13,
  },
  upgradeBtnText:   { color: NAVY, fontSize: 14, fontWeight: '800' },

  /* Header */
  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden',
  },
  hBubble1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40 },
  hBubble2: { position: 'absolute', width: 110, height: 110, borderRadius: 55,  backgroundColor: 'rgba(255,255,255,0.05)', bottom: 10, left: 20 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontFamily: SERIF, fontSize: 26, color: '#fff', letterSpacing: -0.5, flex: 1 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  streakNum:   { fontSize: 16, fontWeight: '900' },
  streakLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

  /* Scroll */
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, gap: 14 },

  /* Cards */
  card: {
    borderRadius: 20, borderWidth: 1, padding: Spacing.lg,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardChip:   { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  cardTitle:  { fontSize: 17, fontWeight: '800', color: '#000', letterSpacing: -0.3, marginBottom: 4 },
  cardSub:    { fontSize: 12, fontWeight: '500', marginBottom: 16 },

  /* Toutes matières */
  subjectRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subjectEmoji:  { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  subjectRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  subjectName:   { fontSize: 13, fontWeight: '700' },
  subjectCount:  { fontSize: 12, fontWeight: '800' },
  subjectBarBg:  { height: 5, borderRadius: 3, overflow: 'hidden' },
  subjectBarFill:{ height: 5, borderRadius: 3 },

  /* Chapters */
  chapterRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 0.5, padding: 12 },
  chapterNum:       { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chapterNumText:   { fontSize: 13, fontWeight: '800' },
  chapterTitle:     { fontSize: 13, fontWeight: '700', marginBottom: 5 },
  chapterBarWrap:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chapterBarBg:     { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  chapterBarFill:   { height: 5, borderRadius: 3 },
  chapterPct:       { fontSize: 11, fontWeight: '800', minWidth: 28 },
  chapterNotDone:   { fontSize: 11, fontWeight: '500' },
  chapterBadge:     { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  chapterBadgeText: { fontSize: 10, fontWeight: '800' },

  /* Mission */
  missionRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  missionCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 4 },
  missionIcon:    { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  missionText:    { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  missionAction:  { fontSize: 14, fontWeight: '800', lineHeight: 20, marginBottom: 3 },
  missionReason:  { fontSize: 12, lineHeight: 17 },
  xpBadge:        { flexDirection: 'row', alignItems: 'baseline', borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  xpBadgeNum:     { fontSize: 16, fontWeight: '900', letterSpacing: -0.5 },
  xpBadgeMax:     { fontSize: 11, fontWeight: '600' },
  missionBarBg:   { height: 6, borderRadius: 3, overflow: 'hidden' },
  missionBarFill: { height: 6, borderRadius: 3 },
  missionBarLabel:{ fontSize: 11, fontWeight: '600', marginTop: 6 },

  /* Insight */
  insightTitle:    { fontSize: 16, fontWeight: '700', lineHeight: 24, marginBottom: 6 },
  insightSub:      { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  insightBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.full, paddingVertical: 10, paddingHorizontal: 18, alignSelf: 'flex-start' },
  insightBtnText:  { fontSize: 14, fontWeight: '800', color: '#fff' },
});
