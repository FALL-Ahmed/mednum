import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';
import { Spacing, Radius } from '../theme';
import { useTheme } from '../components';
import { getSubjectStyle } from '../utils/subjectStyles';

const { width } = Dimensions.get('window');
const CARD_W = (width - Spacing.lg * 2 - 10) / 2;

// ─── Palette ─────────────────────────────────────────────────────────────────
const P = {
  bg:      '#09090F',
  surface: 'rgba(255,255,255,0.06)',
  border:  'rgba(255,255,255,0.1)',
  text:    '#F0F2F5',
  muted:   'rgba(255,255,255,0.4)',
  streak:  '#FF6B35',
  xp:      '#F59E0B',
  goal:    '#818CF8',
  green:   '#10B981',
  purple:  '#A855F7',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getWeekStart() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}
function isThisWeek(iso: string) { return !!iso && iso >= getWeekStart(); }

function streakMessage(n: number) {
  if (n === 0) return 'Lance ta première série aujourd\'hui !';
  if (n < 3)  return 'Belle entrée ! Reviens demain.';
  if (n < 7)  return 'Tu construis une habitude solide 💪';
  if (n < 14) return 'Une semaine d\'affilée — impressionnant !';
  return `${n} jours — Tu es dans l'élite 🏆`;
}

function goalMessage(xpToday: number, goal: number) {
  const left = goal - xpToday;
  if (left <= 0) return 'Objectif atteint ! Continue pour aller plus loin 🚀';
  const q = Math.ceil(left / 10);
  return `Encore ${q} question${q > 1 ? 's' : ''} pour valider ta journée`;
}

// Retire les préfixes de question pour n'afficher que le vrai sujet
function cleanConcept(text: string): string {
  return text
    .replace(/^(c[''`]est quoi|c est quoi|qu[''`]est.ce que?|qu est ce que|explique.?moi|comment fonctionne|comment|pourquoi|kesako|c koi|ckoi|definis|definition de|parle.?moi de|dis.?moi|je comprends? pas)\s+/i, '')
    .replace(/^(le|la|les|un|une|des|du|de la|de l[''`]|l[''`])\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

function insightMessage(count: number): string {
  if (count <= 2) return 'Ce point revient dans tes questions — parfait pour aller plus loin';
  if (count <= 4) return `${count}× cette semaine — 5 minutes maintenant et tu maîtrises ça`;
  return `${count}× cette semaine — tu veux vraiment comprendre ça. On creuse ensemble ?`;
}

// ─── Composant barre de segments (style RPG) ─────────────────────────────────
function SegmentBar({ value, max, color }: { value: number; max: number; color: string }) {
  const SEGS = 10;
  const filled = Math.round((value / max) * SEGS);
  return (
    <View style={seg.row}>
      {Array.from({ length: SEGS }).map((_, i) => (
        <View
          key={i}
          style={[
            seg.cell,
            { backgroundColor: i < filled ? color : 'rgba(255,255,255,0.08)' },
            i === 0 && { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
            i === SEGS - 1 && { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
          ]}
        />
      ))}
    </View>
  );
}
const seg = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, height: 8 },
  cell: { flex: 1, height: 8 },
});

// ─── Nombre affiché ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, color, size = 40 }: { value: number; color: string; size?: number }) {
  return <Text style={[num.val, { color, fontSize: size }]}>{value}</Text>;
}
const num = StyleSheet.create({
  val: { fontWeight: '800', letterSpacing: -1 },
});

// ─── Carte glassmorphique ────────────────────────────────────────────────────
function GlassCard({
  children, glow, delay = 0, style,
}: { children: React.ReactNode; glow: string; delay?: number; style?: any }) {
  return (
    <View style={[glass.card, { borderColor: glow + '30', shadowColor: glow }, style]}>
      {children}
    </View>
  );
}
const glass = StyleSheet.create({
  card: {
    backgroundColor: P.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function ProgressScreen() {
  const navigation = useNavigation<any>();
  const {
    studentName, courses, activeCourse, conceptHistory,
    streakCurrent, streakBest, xpTotal, xpToday, xpThisWeek, xpLastWeek, dailyGoal,
  } = useAppStore();

  const weakConcept = useMemo(() => {
    if (!activeCourse) return null;
    const map = conceptHistory[activeCourse.id] || {};
    const sorted = Object.entries(map)
      .filter(([, v]) => isThisWeek(v.lastAsked))
      .sort((a, b) => b[1].count - a[1].count);
    if (!sorted.length || sorted[0][1].count < 2) return null;
    return { concept: sorted[0][0], count: sorted[0][1].count };
  }, [conceptHistory, activeCourse]);

  const subjectActivity = useMemo(() => {
    const by: Record<string, { subjectName: string; count: number }> = {};
    for (const c of courses) {
      if (!by[c.subjectName]) by[c.subjectName] = { subjectName: c.subjectName, count: 0 };
      const map = conceptHistory[c.id] || {};
      by[c.subjectName].count += Object.values(map)
        .filter(v => isThisWeek(v.lastAsked))
        .reduce((s, v) => s + v.count, 0);
    }
    return Object.values(by).sort((a, b) => b.count - a.count);
  }, [courses, conceptHistory]);

  const weekDiff = xpLastWeek > 0
    ? Math.round(((xpThisWeek - xpLastWeek) / xpLastWeek) * 100)
    : null;

  // Mission du jour : générée depuis les données existantes
  const questInfo = useMemo(() => {
    if (weakConcept) {
      const topic = cleanConcept(weakConcept.concept) || weakConcept.concept.slice(0, 30);
      return { emoji: '🔍', text: `Approfondis "${topic}" — tu es à 2 questions de maîtriser ça` };
    }
    const inactive = subjectActivity.find(s => s.count === 0 && !!s.subjectName);
    if (inactive)
      return { emoji: '📝', text: `Explore ${inactive.subjectName} — tu n'y as pas encore touché cette semaine` };
    if (xpToday === 0 && streakCurrent > 0)
      return { emoji: '🔥', text: `Maintiens ta série de ${streakCurrent} jour${streakCurrent > 1 ? 's' : ''} — pose 1 question` };
    return { emoji: '💬', text: 'Lance-toi ! Pose ta première question du jour' };
  }, [weakConcept, subjectActivity, xpToday, streakCurrent]);
  const questDone = xpToday >= Math.floor(dailyGoal * 0.6);

  // Répétition espacée : concepts vus il y a 2-6 jours avec difficulté (count >= 2)
  const spacedReps = useMemo(() => {
    const now = new Date();
    const results: { concept: string; subjectName: string; daysAgo: number }[] = [];
    for (const c of courses) {
      const map = conceptHistory[c.id] || {};
      for (const [concept, { count, lastAsked }] of Object.entries(map)) {
        if (!lastAsked || count < 2) continue;
        const days = Math.floor((now.getTime() - new Date(lastAsked).getTime()) / 86400000);
        if (days >= 2 && days <= 6) results.push({ concept, subjectName: c.subjectName || '', daysAgo: days });
      }
    }
    return results.sort((a, b) => a.daysAgo - b.daysAgo).slice(0, 2);
  }, [courses, conceptHistory]);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={P.bg} />

      {/* ── Header hero : streak + nom ── */}
      <View style={s.hero}>
        <SafeAreaView>
          <View style={s.heroRow}>
            {/* Gauche : nom + message */}
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>BONJOUR</Text>
              <Text style={s.heroName} numberOfLines={1}>{studentName || 'Élève'}</Text>
              <Text style={[s.streakMsg, { color: P.muted, marginTop: 4 }]}>{streakMessage(streakCurrent)}</Text>
            </View>
            {/* Droite : grand chiffre streak */}
            <View style={s.heroStreak}>
              <Text style={[s.streakNum, { color: P.streak }]}>{streakCurrent}</Text>
              <View style={s.heroStreakBottom}>
                <Text style={s.streakFire}>🔥</Text>
                <Text style={[s.streakSub, { color: P.muted }]}>jours</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >

        {/* ── Mission du jour ── */}
        <GlassCard glow={questDone ? P.green : P.goal} delay={200}>
          <View style={s.rowBetween}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[s.sectionChip, { color: (questDone ? P.green : P.goal) + 'CC' }]}>MISSION DU JOUR</Text>
              <View style={s.questRow}>
                <Text style={s.questEmoji}>{questDone ? '✅' : questInfo.emoji}</Text>
                <Text style={[s.questText, { color: questDone ? P.muted : P.text }]} numberOfLines={2}>
                  {questDone ? 'Mission accomplie !' : questInfo.text}
                </Text>
              </View>
            </View>
            <View style={[s.questBadge, { backgroundColor: (questDone ? P.green : P.goal) + '20', borderColor: (questDone ? P.green : P.goal) + '60' }]}>
              <Text style={[s.questBadgeXP, { color: questDone ? P.green : P.goal }]}>{xpToday}</Text>
              <Text style={[s.questBadgeMax, { color: P.muted }]}>/{dailyGoal} XP</Text>
            </View>
          </View>
          <View style={{ marginVertical: 12 }}>
            <SegmentBar value={xpToday} max={dailyGoal} color={questDone ? P.green : P.goal} />
          </View>
          <Text style={[s.goalHint, { color: P.muted }]}>{goalMessage(xpToday, dailyGoal)}</Text>
          <View style={s.xpLegend}>
            {([['💬','Question','10 XP'], ['📝','Exercice','20 XP'], ['✅','Correction','15 XP']] as [string,string,string][]).map(([i, l, v]) => (
              <View key={l} style={s.xpChip}>
                <Text style={s.xpChipIcon}>{i}</Text>
                <Text style={[s.xpChipText, { color: P.muted }]}>{l}</Text>
                <Text style={[s.xpChipVal, { color: questDone ? P.green : P.goal }]}>{v}</Text>
              </View>
            ))}
          </View>
        </GlassCard>

        {/* ── ProfNum a remarqué (Lacune) ── */}
        {weakConcept ? (
          <GlassCard glow={P.purple} delay={300} style={s.lacuneCard}>
            <View style={s.lacuneTop}>
              <View style={[s.liveIndicator, { backgroundColor: P.purple }]} />
              <Text style={[s.sectionChip, { color: P.purple + 'CC' }]}>PROFNUM A REMARQUÉ</Text>
            </View>
            <Text style={s.lacuneText}>
              Ce sujet revient dans tes questions :{'\n'}
              <Text style={[s.lacuneTopic, { color: P.purple }]}>
                {cleanConcept(weakConcept.concept) || weakConcept.concept.slice(0, 45)}
              </Text>
            </Text>
            <Text style={[s.lacuneCount, { color: P.muted }]}>
              {insightMessage(weakConcept.count)}
            </Text>
            <TouchableOpacity
              style={[s.lacuneBtn, { backgroundColor: P.purple }]}
              onPress={() => navigation.navigate('Chat', {
                prefill: `Explique-moi en détail et donne-moi un exercice sur : ${cleanConcept(weakConcept.concept) || weakConcept.concept}`,
              })}
              activeOpacity={0.8}
            >
              <Text style={s.lacuneBtnText}>Maîtriser ce point →</Text>
            </TouchableOpacity>
          </GlassCard>
        ) : (
          <GlassCard glow={P.green} delay={300}>
            <View style={s.lacuneTop}>
              <View style={[s.liveIndicator, { backgroundColor: P.green }]} />
              <Text style={[s.sectionChip, { color: P.green + 'CC' }]}>PROFNUM A REMARQUÉ</Text>
            </View>
            {xpThisWeek > xpLastWeek && xpLastWeek > 0 ? (
              <>
                <Text style={[s.lacuneText, { marginTop: 4 }]}>Ta progression accélère 📈</Text>
                <Text style={[s.lacuneCount, { color: P.muted, marginTop: 4 }]}>
                  +{Math.round(((xpThisWeek - xpLastWeek) / xpLastWeek) * 100)}% vs. la semaine dernière — continue comme ça !
                </Text>
              </>
            ) : streakCurrent >= 3 ? (
              <>
                <Text style={[s.lacuneText, { marginTop: 4 }]}>Ta régularité paie ✨</Text>
                <Text style={[s.lacuneCount, { color: P.muted, marginTop: 4 }]}>
                  {streakCurrent} jours consécutifs — les élèves réguliers progressent 3× plus vite.
                </Text>
              </>
            ) : (
              <>
                <Text style={[s.lacuneText, { marginTop: 4 }]}>Tout roule pour l'instant ✅</Text>
                <Text style={[s.lacuneCount, { color: P.muted, marginTop: 4 }]}>
                  Continue à poser des questions — ProfNum apprendra à te connaître.
                </Text>
              </>
            )}
          </GlassCard>
        )}

        {/* ── Répétition espacée ── */}
        {spacedReps.length > 0 && (
          <GlassCard glow={P.green} delay={350}>
            <View style={s.lacuneTop}>
              <View style={[s.liveIndicator, { backgroundColor: P.green }]} />
              <Text style={[s.sectionChip, { color: P.green + 'CC' }]}>À RÉVISER MAINTENANT</Text>
            </View>
            <Text style={[s.lacuneText, { marginTop: 4, marginBottom: 10 }]}>
              Ton cerveau commence à oublier — parfait moment pour revoir
            </Text>
            {spacedReps.map(sr => (
              <TouchableOpacity
                key={`${sr.concept}-${sr.subjectName}`}
                style={[s.spacedItem, { borderColor: P.green + '30' }]}
                onPress={() => navigation.navigate('Chat', {
                  prefill: `Réexplique-moi : ${sr.concept}`,
                })}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.spacedConcept, { color: P.text }]} numberOfLines={2}>
                    {cleanConcept(sr.concept) || sr.concept.slice(0, 48)}
                  </Text>
                  <Text style={[s.spacedMeta, { color: P.muted }]}>
                    {sr.subjectName} · vu il y a {sr.daysAgo} jour{sr.daysAgo > 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={[s.spacedArrow, { color: P.green }]}>Réviser →</Text>
              </TouchableOpacity>
            ))}
          </GlassCard>
        )}

        {/* ── Matières ── */}
        {subjectActivity.length > 0 && (
          <GlassCard glow="rgba(255,255,255,0.1)" delay={400}>
            <Text style={[s.sectionTitle, { marginBottom: 14 }]}>Cette semaine</Text>
            <View style={s.subGrid}>
              {subjectActivity.map((sub, idx) => {
                const st = getSubjectStyle(sub.subjectName);
                return (
                  <View key={sub.subjectName || idx} style={[s.subCard, { borderColor: st.accent + '40', backgroundColor: st.accent + '12' }]}>
                    <Text style={s.subEmoji}>{st.emoji}</Text>
                    <Text style={[s.subName, { color: st.accent }]} numberOfLines={1}>{sub.subjectName}</Text>
                    <SegmentBar value={sub.count} max={10} color={st.accent} />
                    <Text style={[s.subCount, { color: P.muted }]}>
                      {sub.count > 0 ? `${sub.count}/10 questions` : 'Pas encore'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </GlassCard>
        )}

        {/* ── Semaine stats ── */}
        <GlassCard glow={P.xp} delay={500}>
          <Text style={[s.sectionTitle, { marginBottom: 14 }]}>Cette semaine vs. la dernière</Text>
          <View style={s.statsRow}>
            <View style={s.statCell}>
              <AnimatedNumber value={xpThisWeek} color={P.xp} size={34} />
              <Text style={[s.statLabel, { color: P.muted }]}>XP cette sem.</Text>
              {weekDiff !== null && (
                <View style={[s.diffBadge, { backgroundColor: weekDiff >= 0 ? P.green + '25' : '#EF4444' + '25' }]}>
                  <Text style={[s.diffText, { color: weekDiff >= 0 ? P.green : '#EF4444' }]}>
                    {weekDiff >= 0 ? '↑' : '↓'} {Math.abs(weekDiff)}%
                  </Text>
                </View>
              )}
            </View>
            <View style={s.statDivider} />
            <View style={s.statCell}>
              <AnimatedNumber value={xpLastWeek || 0} color={P.muted} size={34} />
              <Text style={[s.statLabel, { color: P.muted }]}>Semaine passée</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCell}>
              <AnimatedNumber value={streakBest} color={P.streak} size={34} />
              <Text style={[s.statLabel, { color: P.muted }]}>Meilleur streak</Text>
            </View>
          </View>
        </GlassCard>

        {/* ── Message bas ── */}
        <View style={s.footer}>
          <Text style={[s.footerText, { color: P.muted }]}>
            {streakCurrent >= 7
              ? `🏆 ${streakCurrent} jours d'affilée — Tu es parmi les meilleurs élèves !`
              : '💡 Les élèves réguliers progressent 3× plus vite. Reviens demain !'}
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 50, gap: 12 },

  /* Hero */
  hero: {
    backgroundColor: P.bg, paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl, borderBottomWidth: 1, borderBottomColor: P.border,
  },
  heroRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  heroLabel: { fontSize: 10, fontWeight: '800', color: P.muted, letterSpacing: 2, textTransform: 'uppercase' },
  heroName:  { fontSize: 26, fontWeight: '800', color: P.text, letterSpacing: -0.5, marginTop: 2 },
  heroStreak:{ alignItems: 'center', paddingLeft: 16 },
  heroStreakBottom: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  /* Streak */
  sectionChip: { fontSize: 10, fontWeight: '800', color: P.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  streakNum:  { fontSize: 64, fontWeight: '900', letterSpacing: -3, lineHeight: 68 },
  streakFire: { fontSize: 28 },
  streakSub:  { fontSize: 13, color: P.muted, fontWeight: '600' },
  streakMsg:  { fontSize: 13, marginTop: 6, lineHeight: 19 },

  /* Mission du jour */
  questRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  questEmoji:      { fontSize: 22 },
  questText:       { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  questBadge:      { alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, minWidth: 60 },
  questBadgeXP:    { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  questBadgeMax:   { fontSize: 10, fontWeight: '600' },

  /* Répétition espacée */
  spacedItem:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, marginTop: 8 },
  spacedConcept:   { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  spacedMeta:      { fontSize: 11, fontWeight: '600', marginTop: 2 },
  spacedArrow:     { fontSize: 12, fontWeight: '800' },

  /* Goal */
  sectionTitle: { fontSize: 15, fontWeight: '800', color: P.text, letterSpacing: -0.2 },
  rowBetween:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  xpCount:      { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  xpMax:        { fontSize: 13, fontWeight: '600', opacity: 0.5 },
  goalHint:     { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  xpLegend:     { flexDirection: 'row', gap: 6 },
  xpChip:       { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: Radius.sm, padding: 8, alignItems: 'center', gap: 2 },
  xpChipIcon:   { fontSize: 14 },
  xpChipText:   { fontSize: 10, fontWeight: '600' },
  xpChipVal:    { fontSize: 11, fontWeight: '800' },

  /* Lacune */
  lacuneCard: {},
  lacuneTop:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  liveIndicator: { width: 6, height: 6, borderRadius: 3 },
  lacuneText: { fontSize: 17, fontWeight: '700', color: P.text, lineHeight: 25 },
  lacuneTopic:{ fontWeight: '800' },
  lacuneCount:{ fontSize: 12, marginTop: 6, marginBottom: 14, lineHeight: 18 },
  lacuneBtn:  { borderRadius: Radius.full, paddingVertical: 12, paddingHorizontal: 20, alignSelf: 'flex-start' },
  lacuneBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  /* Subjects */
  subGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  subCard:    { width: CARD_W, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 6 },
  subEmoji:   { fontSize: 24 },
  subName:    { fontSize: 13, fontWeight: '800' },
  subCount:   { fontSize: 11, fontWeight: '600', marginTop: 2 },

  /* Stats */
  statsRow:   { flexDirection: 'row', alignItems: 'center' },
  statCell:   { flex: 1, alignItems: 'center', gap: 4 },
  statLabel:  { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  statDivider:{ width: 1, height: 50, backgroundColor: P.border },
  diffBadge:  { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  diffText:   { fontSize: 11, fontWeight: '800' },

  /* Footer */
  footer:     { paddingVertical: Spacing.lg, alignItems: 'center' },
  footerText: { fontSize: 13, textAlign: 'center', lineHeight: 20, fontWeight: '500' },
});
