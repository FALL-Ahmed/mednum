import React, { useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { Spacing, Radius } from '../theme';
import { useTheme } from '../components';
import { getSubjectStyle, getProfessorName } from '../utils/subjectStyles';

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

function insightMessage(count: number): string {
  if (count <= 2) return 'Ce point revient dans tes questions — approfondis-le.';
  if (count <= 4) return `${count}× cette semaine — 5 minutes et tu maîtrises ça.`;
  return `${count}× cette semaine — tu veux vraiment comprendre ça.`;
}

function goalMessage(xpToday: number, goal: number) {
  const left = goal - xpToday;
  if (left <= 0) return 'Objectif atteint ! Continue pour aller plus loin.';
  const q = Math.ceil(left / 10);
  return `Encore ${q} question${q > 1 ? 's' : ''} pour valider ta journée`;
}

// ── Calendrier scolaire mauritanien ──────────────────────────────────────────
// Mois : 0=Jan … 11=Déc
const SCHOOL_CALENDAR = [
  { trimestre: 'T1', label: 'Devoir 1',     month: 10, type: 'devoir'      }, // Novembre
  { trimestre: 'T1', label: 'Devoir 2',     month: 11, type: 'devoir'      }, // Décembre
  { trimestre: 'T1', label: 'Composition',  month: 11, type: 'composition' }, // Fin Décembre
  { trimestre: 'T2', label: 'Devoir 1',     month: 1,  type: 'devoir'      }, // Février
  { trimestre: 'T2', label: 'Devoir 2',     month: 2,  type: 'devoir'      }, // Mars
  { trimestre: 'T2', label: 'Composition',  month: 2,  type: 'composition' }, // Fin Mars
  { trimestre: 'T3', label: 'Devoir 1',     month: 3,  type: 'devoir'      }, // Avril
  { trimestre: 'T3', label: 'Devoir 2',     month: 4,  type: 'devoir'      }, // Mai
  { trimestre: 'T3', label: 'Composition',  month: 5,  type: 'composition' }, // Juin
];

const MONTH_FR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

function getNextExam() {
  const now = new Date();
  let nearest: typeof SCHOOL_CALENDAR[0] | null = null;
  let nearestDate: Date | null = null;

  for (const ev of SCHOOL_CALENDAR) {
    const day = ev.type === 'composition' ? 14 : 10;
    for (const yearOffset of [0, 1]) {
      const evDate = new Date(now.getFullYear() + yearOffset, ev.month, day);
      if (evDate > now) {
        if (!nearestDate || evDate < nearestDate) {
          nearestDate = evDate;
          nearest = ev;
        }
        break;
      }
    }
  }

  if (!nearest || !nearestDate) return null;
  const daysLeft = Math.ceil((nearestDate.getTime() - now.getTime()) / 86400000);
  return { ...nearest, daysLeft, monthLabel: MONTH_FR[nearest.month] };
}


function chapterStatus(score: number): { label: string; color: string; bg: string } {
  if (score >= 70) return { label: 'Maîtrisé',  color: '#10B981', bg: '#10B98118' };
  if (score >= 40) return { label: 'En cours',  color: '#F59E0B', bg: '#F59E0B18' };
  if (score >  0)  return { label: 'DANGER',    color: '#EF4444', bg: '#EF444418' };
  return                   { label: 'Non fait',  color: '#6B7280', bg: 'transparent' };
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
  const { top } = useSafeAreaInsets();
  const t = useTheme();
  const {
    studentName, courses, activeCourse, conceptHistory,
    chapterMastery, streakCurrent, streakLastDate, xpToday, dailyGoal, activeChapterIndex, setActiveChapterIndex,
  } = useAppStore();

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
  const bg           = subjectStyle.bg;
  const accent       = subjectStyle.accent;

  // Maîtrise par chapitre du cours actif (intro exclue)
  const chapterStats = useMemo(() => {
    if (!activeCourse?.chunks?.length) return [];
    const masteryMap = chapterMastery[activeCourse.id] || {};
    return activeCourse.chunks.map((chunk, i) => ({
      index:   i,
      title:   chunk.title || `Chapitre ${i + 1}`,
      mastery: masteryMap[i] ?? 0,
      done:    (masteryMap[i] ?? 0) > 0,
      isIntro: i === 0 && /^(introduction|intro|préambule|présentation|avant[- ]propos|généralités|sommaire|table)/i.test((chunk.title ?? '').trim()),
    }));
  }, [activeCourse, chapterMastery]);

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
    if (!iso) return { label: 'Jamais travaillé', hint: "Lance-toi, le prof t'attend !", color: '#9CA3AF' };
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days === 0) return { label: "Aujourd'hui", hint: null, color: subjectAccent };
    if (days === 1) return { label: 'Hier', hint: null, color: subjectAccent };
    if (days <= 3)  return { label: `Il y a ${days} jours`, hint: null, color: '#9CA3AF' };
    if (days <= 7)  return { label: `Il y a ${days} jours`, hint: 'Ne néglige pas cette matière', color: '#9CA3AF' };
    if (days <= 14) return { label: 'Il y a 1 semaine', hint: "Tu prends du retard — reprends dès aujourd'hui", color: '#9CA3AF' };
    return { label: 'Il y a longtemps', hint: 'Revois cette matière avant la compo', color: '#9CA3AF' };
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
      action: `Améliore ton score — ${weak.title}`,
      reason: `Tu as eu ${weak.mastery}% la dernière fois. Refais le quiz pour progresser.`,
      onPress: () => activeCourse && isChapterUnlocked(weak.index) && navigation.navigate('Cours', {
        screen: 'Quiz',
        params: { courseId: activeCourse.id, chapterIndex: weak.index, chapterTitle: weak.title },
      }),
    };
    // 2. Prochain chapitre non fait
    const next = chapterStats.find(c => !c.done);
    if (next) return {
      icon: 'play-circle' as const,
      action: `Fais le quiz — ${next.title}`,
      reason: `Ce chapitre n'a pas encore été évalué.`,
      onPress: () => activeCourse && isChapterUnlocked(next.index) && navigation.navigate('Cours', {
        screen: 'Quiz',
        params: { courseId: activeCourse.id, chapterIndex: next.index, chapterTitle: next.title },
      }),
    };
    // 3. Concept faible → aller au chat
    if (weakConcept) return {
      icon: 'chatbubble-ellipses' as const,
      action: `Approfondis "${cleanConcept(weakConcept.concept)}"`,
      reason: `Ce point revient souvent dans tes questions.`,
      onPress: () => navigation.navigate('Chat', {
        prefill: `Explique-moi : ${weakConcept.concept}`,
      }),
    };
    // 4. Tout bon → encouragement
    return {
      icon: 'star' as const,
      action: `Pose une question à ${profName}`,
      reason: 'Continue à apprendre — chaque question compte.',
      onPress: () => navigation.navigate('Chat'),
    };
  }, [chapterStats, weakConcept, activeCourse, profName]);

  return (
    <View style={[s.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: top + Spacing.lg, backgroundColor: bg }]}>
        <View style={s.hBubble1} />
        <View style={s.hBubble2} />
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerLabel}>{activeCourse?.subjectName?.toUpperCase() || 'MA PROGRESSION'}</Text>
            <Text style={s.headerTitle}>{studentName || 'Élève'}</Text>
          </View>
          <View style={s.streakBox}>
            <Text style={[s.streakNum, { color: streakColor }]}>{effectiveStreak}</Text>
            <View style={s.streakBottom}>
              <Animated.View style={{ opacity: effectiveStreak >= 7 ? flickerAnim : 1 }}>
                <Ionicons name="flame" size={effectiveStreak >= 14 ? 22 : 18} color={streakColor} />
              </Animated.View>
              <Text style={s.streakLabel}>jours</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingBottom: 110 }]}>

        {/* ── TOUTES MES MATIÈRES ─────────────────────────────────────────── */}
        {allSubjects.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[s.cardTitle, { color: t.text }]}>Toutes mes matières</Text>
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

        {!activeCourse && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, alignItems: 'center', paddingVertical: 28 }]}>
            <Ionicons name="book-outline" size={36} color={t.textMuted} />
            <Text style={[s.cardTitle, { color: t.text, marginTop: 12, marginBottom: 4 }]}>Aucune matière active</Text>
            <Text style={[s.cardSub, { color: t.textMuted, textAlign: 'center' }]}>
              Sélectionne un cours dans l'onglet Cours pour voir ta progression.
            </Text>
          </View>
        )}

        {/* ── PROCHAIN EXAMEN ─────────────────────────────────────────────── */}
        {(() => {
          const next = getNextExam();
          if (!next) return null;
          const color = accent;
          return (
            <View style={[s.card, { backgroundColor: t.surface, borderColor: color + '40' }]}>
              <View style={s.cardHeader}>
                <PulseDot color={color} />
                <Text style={[s.cardChip, { color }]}>PROCHAIN EXAMEN — {next.trimestre}</Text>
              </View>
              <View style={s.examRow}>
                <View style={[s.examIcon, { backgroundColor: color + '18' }]}>
                  <Ionicons
                    name={next.type === 'composition' ? 'document-text' : 'pencil'}
                    size={22} color={color}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.examLabel, { color: t.text }]}>{next.label}</Text>
                  <Text style={[s.examMonth, { color: t.textMuted }]}>Prévu en {next.monthLabel}</Text>
                </View>
                <View style={[s.examCountdown, { backgroundColor: color + '18', borderColor: color + '40' }]}>
                  <Text style={[s.examDays, { color }]}>~{next.daysLeft}j</Text>
                </View>
              </View>
              {next.daysLeft <= 14 && (
                <View style={[s.examAlert, { backgroundColor: color + '12', borderColor: color + '30' }]}>
                  <Ionicons name="warning-outline" size={14} color={color} />
                  <Text style={[s.examAlertText, { color }]}>
                    {next.daysLeft <= 7 ? 'C\'est très bientôt — révise en priorité !' : 'Dans moins de 2 semaines — commence à réviser.'}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* ── MES CHAPITRES ────────────────────────────────────────────────── */}
        {sortedChapters.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[s.cardTitle, { color: t.text }]}>Mes chapitres</Text>
            <Text style={[s.cardSub, { color: t.textMuted }]}>Appuie sur un chapitre pour refaire le quiz</Text>
            {sortedChapters.map((ch, i) => {
              const st = chapterStatus(ch.mastery);
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
                      <Text style={[s.chapterNotDone, { color: t.textMuted }]}>Quiz non fait</Text>
                    )}
                  </View>

                  {/* Badge statut */}
                  {ch.isIntro ? (
                    <View style={[s.chapterBadge, { backgroundColor: t.border, borderColor: t.border }]}>
                      <Text style={[s.chapterBadgeText, { color: t.textMuted }]}>Intro</Text>
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
              <Text style={[s.cardChip, { color: questDone ? '#10B981' : accent }]}>MISSION DU JOUR</Text>
            </View>
            <View style={[s.xpBadge, { backgroundColor: (questDone ? '#10B981' : accent) + '18', borderColor: (questDone ? '#10B981' : accent) + '40' }]}>
              <Text style={[s.xpBadgeNum, { color: questDone ? '#10B981' : accent }]}>{xpToday}</Text>
              <Text style={[s.xpBadgeMax, { color: t.textMuted }]}> XP</Text>
            </View>
          </View>

          {questDone ? (
            <View style={s.missionRow}>
              <View style={[s.missionIcon, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              </View>
              <Text style={[s.missionText, { color: t.text }]}>Mission du jour accomplie !</Text>
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
            <Text style={[s.missionBarLabel, { color: t.textMuted }]}>{xpToday} / {dailyGoal} XP aujourd'hui</Text>
          </View>
        </View>

        {/* ── PROF X A REMARQUÉ ────────────────────────────────────────────── */}
        {weakConcept ? (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: accent + '40' }]}>
            <View style={s.cardHeader}>
              <PulseDot color={accent} />
              <Text style={[s.cardChip, { color: accent }]}>{profName.toUpperCase()} A REMARQUÉ</Text>
            </View>
            <Text style={[s.insightTitle, { color: t.text }]}>
              Ce sujet revient souvent :{'\n'}
              <Text style={{ color: accent, fontWeight: '800' }}>
                {cleanConcept(weakConcept.concept) || weakConcept.concept.slice(0, 45)}
              </Text>
            </Text>
            <Text style={[s.insightSub, { color: t.textMuted }]}>{insightMessage(weakConcept.count)}</Text>
            <TouchableOpacity
              style={[s.insightBtn, { backgroundColor: bg }]}
              onPress={() => navigation.navigate('Chat', {
                prefill: `Explique-moi en détail et donne-moi un exercice sur : ${cleanConcept(weakConcept.concept) || weakConcept.concept}`,
              })}
              activeOpacity={0.8}
            >
              <Text style={s.insightBtnText}>Maîtriser ce point</Text>
              <Ionicons name="arrow-forward" size={15} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: accent + '30' }]}>
            <View style={s.cardHeader}>
              <PulseDot color={accent} />
              <Text style={[s.cardChip, { color: accent }]}>{profName.toUpperCase()} A REMARQUÉ</Text>
            </View>
            <Text style={[s.insightTitle, { color: t.text }]}>
              {effectiveStreak >= 3 ? 'Ta régularité paie.' : 'Tout roule pour l\'instant.'}
            </Text>
            <Text style={[s.insightSub, { color: t.textMuted }]}>
              {streakCurrent >= 3
                ? `${streakCurrent} jours consécutifs — les élèves réguliers progressent 3× plus vite.`
                : `Continue à poser des questions — ${profName} apprendra à te connaître.`}
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

  /* Header */
  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden',
  },
  hBubble1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40 },
  hBubble2: { position: 'absolute', width: 110, height: 110, borderRadius: 55,  backgroundColor: 'rgba(255,255,255,0.05)', bottom: 10, left: 20 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.4, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  streakBox:   { alignItems: 'center' },
  streakNum:   { fontSize: 52, fontWeight: '900', letterSpacing: -2, lineHeight: 56 },
  streakBottom:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

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

  /* Exam */
  examRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  examIcon:      { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  examLabel:     { fontSize: 16, fontWeight: '800', marginBottom: 3 },
  examMonth:     { fontSize: 13, fontWeight: '500' },
  examCountdown: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center' },
  examDays:      { fontSize: 16, fontWeight: '900', letterSpacing: -0.5 },
  examAlert:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, borderRadius: 10, borderWidth: 1, padding: 10 },
  examAlertText: { flex: 1, fontSize: 12, fontWeight: '700' },

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
