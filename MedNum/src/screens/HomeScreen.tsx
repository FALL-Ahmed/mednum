import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { Radius } from '../theme';
import { useTheme, Text } from '../components';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const PAGE_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const DAYS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function todayFull() {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function greet(name: string) {
  const h = new Date().getHours();
  const word = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  return name ? `${word}, ${name.split(' ')[0]}` : word;
}

function weekDots(streak: number) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dayIdx  = (d.getDay() + 6) % 7;
    const daysAgo = 6 - i;
    return {
      label:    DAYS_FR[dayIdx],
      date:     d.getDate(),
      isToday:  daysAgo === 0,
      isActive: daysAgo < streak,
    };
  });
}

type SmartCardData = {
  badge: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  sub: string;
  cta: string;
};

function getSmartCard(
  chatHistory: any[],
  streakCurrent: number,
  quotaLeft: number,
  studentClassName: string,
): SmartCardData {
  const last = chatHistory[0];

  if (last) {
    const ago = Math.floor((Date.now() - new Date(last.createdAt).getTime()) / 60000);
    const agoTxt = ago < 60
      ? `il y a ${ago} min`
      : ago < 1440
      ? `il y a ${Math.floor(ago / 60)}h`
      : `il y a ${Math.floor(ago / 1440)}j`;
    return {
      badge: 'REPRENDRE',
      icon: 'document-text-outline',
      title: last.courseName,
      sub: `Dernière session ${agoTxt} · ${last.messages.length} échanges`,
      cta: 'Continuer avec Dr. Ahmed',
    };
  }

  if (quotaLeft <= 3) {
    return {
      badge: 'QUOTA',
      icon: 'alert-circle-outline',
      title: `${quotaLeft} question${quotaLeft > 1 ? 's' : ''} restante${quotaLeft > 1 ? 's' : ''} aujourd'hui`,
      sub: "Le quota se renouvelle à minuit. Utilisez-les bien.",
      cta: 'Poser une question',
    };
  }

  if (streakCurrent >= 3) {
    return {
      badge: 'SÉRIE EN COURS',
      icon: 'flame-outline',
      title: `${streakCurrent} jours consécutifs`,
      sub: studentClassName
        ? `Excellent rythme pour ${studentClassName}. Continue !`
        : "Excellent rythme. Ne brise pas ta série !",
      cta: 'Étudier maintenant',
    };
  }

  return {
    badge: 'PREMIÈRE SÉANCE',
    icon: 'rocket-outline',
    title: "Commence avec Dr. Ahmed",
    sub: studentClassName
      ? `Upload un PDF de ${studentClassName} et pose tes premières questions.`
      : "Upload un cours PDF et pose tes premières questions.",
    cta: 'Démarrer',
  };
}

function SmartCard({
  chatHistory, streakCurrent, quotaLeft, studentClassName, onPress, surface, fillFlex,
}: {
  chatHistory: any[]; streakCurrent: number; quotaLeft: number;
  studentClassName: string; onPress: () => void; surface: string; fillFlex?: boolean;
}) {
  const card = getSmartCard(chatHistory, streakCurrent, quotaLeft, studentClassName);
  return (
    <TouchableOpacity style={[sc.card, { backgroundColor: surface }, fillFlex && { flex: 1 }]} onPress={onPress} activeOpacity={0.85}>
      <View style={sc.top}>
        <View style={sc.badge}>
          <Text style={sc.badgeTxt}>{card.badge}</Text>
        </View>
      </View>
      <View style={sc.body}>
        <View style={[sc.iconWrap, { backgroundColor: TEAL_BG }]}>
          <Ionicons name={card.icon} size={22} color={TEAL} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sc.title, { color: NAVY }]} numberOfLines={2}>{card.title}</Text>
          <Text style={[sc.sub, { color: '#94A3B8' }]}>{card.sub}</Text>
        </View>
      </View>
      <View style={sc.footer}>
        <Text style={sc.footerTxt}>{card.cta}</Text>
        <Ionicons name="arrow-forward" size={13} color={TEAL} />
      </View>
    </TouchableOpacity>
  );
}

const sc = StyleSheet.create({
  card: {
    borderRadius: 20, padding: 18, marginBottom: 20,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  top:      { marginBottom: 12 },
  badge:    { alignSelf: 'flex-start', backgroundColor: TEAL_BG, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt: { fontSize: 9, fontWeight: '800', color: TEAL, letterSpacing: 1 },
  body:     { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  iconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:    { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 15, lineHeight: 21, marginBottom: 3 },
  sub:      { fontSize: 11, fontWeight: '500', lineHeight: 16 },
  footer:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 },
  footerTxt:{ fontSize: 12, fontWeight: '700', color: TEAL },
});

export default function HomeScreen() {
  const {
    studentName, studentClassName,
    streakCurrent, streakBest,
    xpTotal, xpToday, dailyGoal,
    quotaUsed, quotaLimit,
    chatHistory,
  } = useAppStore();

  const t       = useTheme();
  const insets  = useSafeAreaInsets();
  const nav     = useNavigation<any>();
  const recent  = useMemo(() => chatHistory.slice(0, 3), [chatHistory]);
  const week    = useMemo(() => weekDots(streakCurrent), [streakCurrent]);
  const initial = studentName ? studentName[0].toUpperCase() : 'E';
  const quotaLeft = Math.max(0, quotaLimit - quotaUsed);

  return (
    <View style={[styles.root, { backgroundColor: PAGE_BG }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View style={[styles.statusBarFill, { height: insets.top, backgroundColor: NAVY }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 },
        ]}
      >
        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.avatar, { backgroundColor: NAVY }]}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
            <View>
              <Text style={[styles.greetLine, { color: NAVY }]}>{greet(studentName)}</Text>
              <Text style={[styles.subLine, { color: TEAL }]}>
                {studentClassName ? `${studentClassName} · ` : ''}{todayFull()}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.notifBtn, { backgroundColor: t.surface }]}>
            <Ionicons name="notifications-outline" size={20} color={NAVY} />
          </TouchableOpacity>
        </View>

        {/* ── DR. AHMED CARD ── */}
        <TouchableOpacity
          style={styles.drCard}
          onPress={() => nav.navigate('Chat')}
          activeOpacity={0.9}
        >
          <View style={styles.halo1} />
          <View style={styles.halo2} />

          <View style={styles.drLeft}>
            <View>
              <Text style={styles.drSpecialty}>Tuteur IA · Médecine</Text>
              <Text style={styles.drName}>Dr. Ahmed</Text>
            </View>
            <View style={styles.drBtn}>
              <Text style={styles.drBtnTxt}>Commencer</Text>
              <View style={styles.drBtnArrow}>
                <Ionicons name="arrow-forward" size={14} color={NAVY} />
              </View>
            </View>
          </View>

          {/* Image Dr. Ahmed */}
          <Image
            source={require('../../assets/dr_ahmed.png')}
            style={styles.drImage}
            resizeMode="contain"
          />
        </TouchableOpacity>

        {/* ── STATS — 3 cartes propres, style clinique ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: t.surface }]}>
            <Text style={[styles.statNum, { color: NAVY }]}>{streakCurrent}</Text>
            <Text style={[styles.statLbl, { color: '#94A3B8' }]}>jours{'\n'}consécutifs</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: t.surface }]}>
            <Text style={[styles.statNum, { color: NAVY }]}>{xpToday}</Text>
            <Text style={[styles.statLbl, { color: '#94A3B8' }]}>points{'\n'}aujourd'hui</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: t.surface }]}>
            <Text style={[styles.statNum, { color: NAVY }]}>{quotaLeft}</Text>
            <Text style={[styles.statLbl, { color: '#94A3B8' }]}>questions{'\n'}disponibles</Text>
          </View>
        </View>

        {/* ── CALENDRIER ACTIVITÉ ── */}
        <View style={[styles.calCard, { backgroundColor: t.surface }]}>
          <View style={styles.calHeader}>
            <Text style={[styles.calTitle, { color: NAVY }]}>Activité cette semaine</Text>
            {streakCurrent > 0 && (
              <Text style={[styles.calStreakTxt, { color: TEAL }]}>
                {streakCurrent} jours
              </Text>
            )}
          </View>

          <View style={styles.calDays}>
            {week.map((d, i) => (
              <View key={i} style={styles.calDayCol}>
                <Text style={[
                  styles.calDayLbl,
                  { color: TEAL },
                ]}>
                  {d.label}
                </Text>
                <View style={[
                  styles.calDayCircle,
                  d.isActive && !d.isToday && styles.calDayActive,
                  d.isToday  && styles.calDayToday,
                ]}>
                  <Text style={[
                    styles.calDayNum,
                    { color: d.isToday ? '#fff' : d.isActive ? TEAL : '#B0BEC5' },
                  ]}>
                    {d.date}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── CARTE INTELLIGENTE ── */}
        <SmartCard
          chatHistory={chatHistory}
          streakCurrent={streakCurrent}
          quotaLeft={quotaLeft}
          studentClassName={studentClassName}
          onPress={() => nav.navigate('Chat')}
          surface={t.surface}
        />

        {/* ── CONVERSATIONS RÉCENTES ── */}
        {recent.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: NAVY }]}>Récemment</Text>
              <TouchableOpacity onPress={() => nav.navigate('Historique')}>
                <Text style={[styles.seeAll, { color: TEAL }]}>Voir tout</Text>
              </TouchableOpacity>
            </View>

            {recent.map((s) => {
              const last = s.messages[s.messages.length - 1];
              const date = new Date(s.createdAt).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'short',
              });
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chatRow, { backgroundColor: t.surface }]}
                  onPress={() => nav.navigate('Historique')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.chatIcon, { backgroundColor: TEAL_BG }]}>
                    <Ionicons name="document-text-outline" size={20} color={TEAL} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.chatCourse, { color: NAVY }]} numberOfLines={1}>
                      {s.courseName}
                    </Text>
                    <Text style={[styles.chatPreview, { color: '#94A3B8' }]} numberOfLines={1}>
                      {last?.content?.slice(0, 55) ?? ''}
                    </Text>
                  </View>
                  <View style={styles.chatRight}>
                    <Text style={[styles.chatDate, { color: '#CBD5E0' }]}>{date}</Text>
                    <Ionicons name="chevron-forward" size={14} color="#CBD5E0" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const shadow = Platform.select({
  ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 },
  android: { elevation: 3 },
}) ?? {};

const styles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  statusBarFill: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },

  /* ── HEADER ── */
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 22,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: SERIF, fontSize: 20, color: '#fff' },
  greetLine: { fontFamily: SERIF, fontSize: 20, letterSpacing: -0.3 },
  subLine:   { fontSize: 11, fontWeight: '500', marginTop: 2 },
  notifBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', ...shadow,
  },

  /* ── DR. AHMED CARD ── */
  drCard: {
    backgroundColor: NAVY,
    borderRadius: 26,
    padding: 24,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 260,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
  halo1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(7,169,151,0.1)', top: -80, right: -50,
  },
  halo2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(7,169,151,0.06)', bottom: -30, right: 40,
  },
  drLeft: { flex: 1, zIndex: 2, justifyContent: 'space-between', alignSelf: 'stretch' },
  drSpecialty: {
    fontSize: 11, fontWeight: '700', color: TEAL,
    letterSpacing: 0.8, marginBottom: 6,
  },
  drName: {
    fontFamily: SERIF, fontSize: 36, color: '#fff',
    letterSpacing: -0.5, lineHeight: 40, marginBottom: 20,
  },
  drBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 9, alignSelf: 'flex-start',
  },
  drBtnTxt:   { fontFamily: SERIF, fontSize: 14, color: NAVY },
  drBtnArrow: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center',
  },

  drImage: {
    width: 140,
    height: 220,
    marginBottom: -24,
    marginRight: -10,
    marginTop: 0,
    alignSelf: 'flex-end',
    flexShrink: 0,
  },

  /* ── STATS ── */
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1, borderRadius: 18, padding: 16, ...shadow,
  },
  statNum: {
    fontFamily: SERIF, fontSize: 28, letterSpacing: -0.5, marginBottom: 4,
  },
  statLbl: { fontSize: 11, fontWeight: '500', lineHeight: 15 },

  /* ── CALENDRIER ── */
  calCard: {
    borderRadius: 20, padding: 18, marginBottom: 20, ...shadow,
  },
  calHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  calTitle:     { fontFamily: SERIF, fontSize: 16 },
  calStreakTxt: { fontSize: 12, fontWeight: '700' },
  calDays:      { flexDirection: 'row', justifyContent: 'space-between' },
  calDayCol:    { alignItems: 'center', gap: 8 },
  calDayLbl:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  calDayCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  calDayActive: { backgroundColor: TEAL_BG },
  calDayToday:  { backgroundColor: TEAL },
  calDayNum:    { fontSize: 13, fontWeight: '700' },

  /* ── SECTION HEADER ── */
  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  sectionTitle: { fontFamily: SERIF, fontSize: 18 },
  seeAll:       { fontSize: 12, fontWeight: '700' },

  /* ── CONVERSATIONS ── */
  chatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 14, marginBottom: 8, ...shadow,
  },
  chatIcon: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  chatCourse:  { fontFamily: SERIF, fontSize: 14, marginBottom: 3 },
  chatPreview: { fontSize: 11, fontWeight: '400' },
  chatRight:   { flexDirection: 'row', alignItems: 'center', gap: 2 },
  chatDate:    { fontSize: 10, fontWeight: '600' },
});
