import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  Image,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useAppStore } from '../store';
import { Radius } from '../theme';
import { useTheme, Text } from '../components';
import { getSubjectStyle } from '../utils/subjectStyles';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const PAGE_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const DAYS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAYS_AR = ['اث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];

type HomeStrings = {
  greetMorning: string;
  greetAfternoon: string;
  greetEvening: string;
  specialty: string;
  start: string;
  statDaysLbl: string;
  statPointsLbl: string;
  statQuestionsLbl: string;
  goalTitle: string;
  goalLabel: (n: number, goal: number) => string;
  trendTitle: string;
  trendMinutes: (n: number) => string;
  calTitle: string;
  calStreakSuffix: (n: number) => string;
  sectionRecent: string;
  seeAll: string;
  badgeResume: string;
  badgeQuota: string;
  badgeStreak: string;
  badgeFirst: string;
  lastSessionSub: (ago: string, n: number) => string;
  ctaContinue: string;
  agoMin: (n: number) => string;
  agoH: (n: number) => string;
  agoJ: (n: number) => string;
  quotaLeftTitle: (n: number) => string;
  quotaSub: string;
  ctaAsk: string;
  streakTitle: (n: number) => string;
  streakSubClass: (cls: string) => string;
  streakSubGeneric: string;
  ctaStudy: string;
  startTitle: string;
  startSubClass: (cls: string) => string;
  startSubGeneric: string;
  ctaStart: string;
  freeChatTitle: string;
  notifTitle: string;
  notifSub: (n: number) => string;
  notifEmpty: string;
  notifAt: (time: string) => string;
  notifToday: string;
  notifTomorrow: string;
};

const STRINGS: Record<'fr' | 'ar', HomeStrings> = {
  fr: {
    greetMorning:   'Bonjour',
    greetAfternoon: 'Bon après-midi',
    greetEvening:   'Bonsoir',
    specialty:      'Tuteur IA · Médecine',
    start:          'Commencer',
    statDaysLbl:      'jours\nconsécutifs',
    statPointsLbl:    "points\naujourd'hui",
    statQuestionsLbl: 'questions\ndisponibles',
    goalTitle:      'Objectif du jour',
    goalLabel: (n: number, goal: number) => `${n} / ${goal} points`,
    trendTitle: 'Évolution — minutes étudiées',
    trendMinutes: (n) => `${n} min`,
    calTitle:       'Activité cette semaine',
    calStreakSuffix: (n: number) => `${n} jour${n > 1 ? 's' : ''}`,
    sectionRecent:  'Récemment',
    seeAll:         'Voir tout',
    badgeResume:    'REPRENDRE',
    badgeQuota:     'QUOTA',
    badgeStreak:    'SÉRIE EN COURS',
    badgeFirst:     'PREMIÈRE SÉANCE',
    lastSessionSub: (ago: string, n: number) => `Dernière session ${ago} · ${n} échange${n > 1 ? 's' : ''}`,
    ctaContinue:    'Continuer avec Dr. Ahmed',
    agoMin: (n: number) => `il y a ${n} min`,
    agoH:   (n: number) => `il y a ${n}h`,
    agoJ:   (n: number) => `il y a ${n}j`,
    quotaLeftTitle: (n: number) => `${n} question${n > 1 ? 's' : ''} restante${n > 1 ? 's' : ''} aujourd'hui`,
    quotaSub:       "Le quota se renouvelle à minuit. Utilisez-les bien.",
    ctaAsk:         'Poser une question',
    streakTitle: (n: number) => `${n} jours consécutifs`,
    streakSubClass: (cls: string) => `Excellent rythme pour ${cls}. Continue !`,
    streakSubGeneric: "Excellent rythme. Ne brise pas ta série !",
    ctaStudy:       'Étudier maintenant',
    startTitle:     "Commence avec Dr. Ahmed",
    startSubClass: (cls: string) => `Upload un PDF de ${cls} et pose tes premières questions.`,
    startSubGeneric: "Upload un cours PDF et pose tes premières questions.",
    ctaStart:       'Démarrer',
    freeChatTitle:  'Discussion libre',
    notifTitle: 'Rappels à venir',
    notifSub: (n) => `${n} session${n > 1 ? 's' : ''} planifiée${n > 1 ? 's' : ''}`,
    notifEmpty: "Aucun rappel programmé pour l'instant.",
    notifAt: (time) => `à ${time}`,
    notifToday: "Aujourd'hui",
    notifTomorrow: 'Demain',
  },
  ar: {
    greetMorning:   'صباح الخير',
    greetAfternoon: 'مساء الخير',
    greetEvening:   'مساء الخير',
    specialty:      'مساعد ذكي · طب',
    start:          'ابدأ',
    statDaysLbl:      'أيام\nمتتالية',
    statPointsLbl:    'نقاط\nاليوم',
    statQuestionsLbl: 'أسئلة\nمتاحة',
    goalTitle:      'هدف اليوم',
    goalLabel: (n: number, goal: number) => `${n} / ${goal} نقطة`,
    trendTitle: 'التطور — دقائق المراجعة',
    trendMinutes: (n) => `${n} د`,
    calTitle:       'نشاط هذا الأسبوع',
    calStreakSuffix: (n: number) => `${n} أيام`,
    sectionRecent:  'الأخيرة',
    seeAll:         'عرض الكل',
    badgeResume:    'متابعة',
    badgeQuota:     'الحصة',
    badgeStreak:    'سلسلة متواصلة',
    badgeFirst:     'أول جلسة',
    lastSessionSub: (ago: string, n: number) => `آخر جلسة ${ago} · ${n} تبادل`,
    ctaContinue:    'تابع مع د. أحمد',
    agoMin: (n: number) => `منذ ${n} د`,
    agoH:   (n: number) => `منذ ${n} س`,
    agoJ:   (n: number) => `منذ ${n} ي`,
    quotaLeftTitle: (n: number) => `${n} سؤال متبقٍ اليوم`,
    quotaSub:       'تتجدد الحصة عند منتصف الليل. استغلها جيداً.',
    ctaAsk:         'اطرح سؤالاً',
    streakTitle: (n: number) => `${n} أيام متتالية`,
    streakSubClass: (cls: string) => `وتيرة ممتازة لـ ${cls}. واصل!`,
    streakSubGeneric: 'وتيرة ممتازة. لا تكسر سلسلتك!',
    ctaStudy:       'ادرس الآن',
    startTitle:     'ابدأ مع د. أحمد',
    startSubClass: (cls: string) => `ارفع ملف PDF لـ ${cls} واطرح أول أسئلتك.`,
    startSubGeneric: 'ارفع درساً بصيغة PDF واطرح أول أسئلتك.',
    ctaStart:       'ابدأ',
    freeChatTitle:  'محادثة حرة',
    notifTitle: 'التذكيرات القادمة',
    notifSub: (n) => `${n} جلسة مخططة`,
    notifEmpty: 'لا توجد تذكيرات مبرمجة حالياً.',
    notifAt: (time) => `الساعة ${time}`,
    notifToday: 'اليوم',
    notifTomorrow: 'غداً',
  },
};

function todayFull(rtl: boolean) {
  return new Date().toLocaleDateString(rtl ? 'ar' : 'fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function greet(name: string, s: typeof STRINGS['fr']) {
  const h = new Date().getHours();
  const word = h < 12 ? s.greetMorning : h < 18 ? s.greetAfternoon : s.greetEvening;
  return name ? `${word}, ${name.split(' ')[0]}` : word;
}

function weekDots(streak: number, rtl: boolean) {
  const days = rtl ? DAYS_AR : DAYS_FR;
  const today = new Date();
  const dots = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dayIdx  = (d.getDay() + 6) % 7;
    const daysAgo = 6 - i;
    return {
      label:    days[dayIdx],
      date:     d.getDate(),
      isToday:  daysAgo === 0,
      isActive: daysAgo < streak,
    };
  });
  return rtl ? [...dots].reverse() : dots;
}

function weekMinutes(studySessions: { date: string; minutes: number }[], rtl: boolean) {
  const days = rtl ? DAYS_AR : DAYS_FR;
  const today = new Date();
  const byDate: Record<string, number> = {};
  for (const sess of studySessions) byDate[sess.date] = (byDate[sess.date] ?? 0) + sess.minutes;

  const bars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayIdx = (d.getDay() + 6) % 7;
    return { label: days[dayIdx], minutes: byDate[iso] ?? 0, isToday: i === 6 };
  });
  const max = Math.max(...bars.map(b => b.minutes), 1);
  return { bars: rtl ? [...bars].reverse() : bars, max };
}

function relativeDateLabel(iso: string, s: typeof STRINGS['fr']) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);
  if (iso === todayISO) return s.notifToday;
  if (iso === tomorrowISO) return s.notifTomorrow;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Courbe lissée (Catmull-Rom → Bézier) passant par tous les points
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function TrendChart({
  bars, max, width, height, minutesLabel,
}: {
  bars: { label: string; minutes: number; isToday: boolean }[]; max: number; width: number; height: number;
  minutesLabel: (n: number) => string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const padTop = 14;
  const padBottom = 22;
  const chartH = height - padTop - padBottom;
  const stepX = width / (bars.length - 1);

  const points = bars.map((b, i) => ({
    x: i * stepX,
    y: padTop + chartH - (b.minutes / max) * chartH,
  }));

  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;

  return (
    <View>
      {selected !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.trendTooltip,
            {
              left: Math.min(Math.max(points[selected].x - 28, 0), width - 56),
              top: Math.max(points[selected].y - 34, 0),
            },
          ]}
        >
          <Text style={styles.trendTooltipText}>{minutesLabel(bars[selected].minutes)}</Text>
        </View>
      )}
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={TEAL} stopOpacity={0.28} />
            <Stop offset="1" stopColor={TEAL} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#trendFill)" />
        <Path d={linePath} stroke={TEAL} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {points.map((p, i) => (
          <React.Fragment key={i}>
            <Circle
              cx={p.x}
              cy={p.y}
              r={14}
              fill="transparent"
              onPress={() => setSelected(prev => (prev === i ? null : i))}
            />
            <Circle
              cx={p.x}
              cy={p.y}
              r={i === selected ? 6 : bars[i].isToday ? 5 : 3.5}
              fill={i === selected || bars[i].isToday ? TEAL : '#fff'}
              stroke={TEAL}
              strokeWidth={i === selected || bars[i].isToday ? 0 : 2}
            />
          </React.Fragment>
        ))}
      </Svg>
      <View style={[styles.trendLabelsRow, { width }]}>
        {bars.map((b, i) => (
          <Text key={i} style={[styles.trendDayLbl, { color: b.isToday ? TEAL : '#94A3B8' }]}>{b.label}</Text>
        ))}
      </View>
    </View>
  );
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
  s: typeof STRINGS['fr'],
): SmartCardData {
  const last = chatHistory[0];

  if (last) {
    const ago = Math.floor((Date.now() - new Date(last.createdAt).getTime()) / 60000);
    const agoTxt = ago < 60 ? s.agoMin(ago) : ago < 1440 ? s.agoH(Math.floor(ago / 60)) : s.agoJ(Math.floor(ago / 1440));
    return {
      badge: s.badgeResume,
      icon: 'document-text-outline',
      title: last.courseName,
      sub: s.lastSessionSub(agoTxt, last.messages.length),
      cta: s.ctaContinue,
    };
  }

  if (quotaLeft <= 3) {
    return {
      badge: s.badgeQuota,
      icon: 'alert-circle-outline',
      title: s.quotaLeftTitle(quotaLeft),
      sub: s.quotaSub,
      cta: s.ctaAsk,
    };
  }

  if (streakCurrent >= 3) {
    return {
      badge: s.badgeStreak,
      icon: 'flame-outline',
      title: s.streakTitle(streakCurrent),
      sub: studentClassName ? s.streakSubClass(studentClassName) : s.streakSubGeneric,
      cta: s.ctaStudy,
    };
  }

  return {
    badge: s.badgeFirst,
    icon: 'rocket-outline',
    title: s.startTitle,
    sub: studentClassName ? s.startSubClass(studentClassName) : s.startSubGeneric,
    cta: s.ctaStart,
  };
}

function SmartCard({
  chatHistory, streakCurrent, quotaLeft, studentClassName, onPress, surface, s, rtl,
}: {
  chatHistory: any[]; streakCurrent: number; quotaLeft: number;
  studentClassName: string; onPress: () => void; surface: string;
  s: typeof STRINGS['fr']; rtl: boolean;
}) {
  const card = getSmartCard(chatHistory, streakCurrent, quotaLeft, studentClassName, s);
  return (
    <TouchableOpacity style={[sc.card, { backgroundColor: surface }]} onPress={onPress} activeOpacity={0.85}>
      <View style={sc.top}>
        <View style={sc.badge}>
          <Text style={sc.badgeTxt}>{card.badge}</Text>
        </View>
      </View>
      <View style={[sc.body, rtl && styles.rowRev]}>
        <View style={[sc.iconWrap, { backgroundColor: TEAL_BG }]}>
          <Ionicons name={card.icon} size={22} color={TEAL} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sc.title, { color: NAVY }, rtl && styles.textRight]} numberOfLines={2}>{card.title}</Text>
          <Text style={[sc.sub, { color: '#94A3B8' }, rtl && styles.textRight]}>{card.sub}</Text>
        </View>
      </View>
      <View style={[sc.footer, rtl && styles.rowRev]}>
        <Text style={sc.footerTxt}>{card.cta}</Text>
        <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={13} color={TEAL} />
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
    chatHistory, uiLanguage,
    studySessions, plannedSessions,
  } = useAppStore();

  const t       = useTheme();
  const insets  = useSafeAreaInsets();
  const nav     = useNavigation<any>();
  const rtl     = uiLanguage === 'ar';
  const s       = STRINGS[rtl ? 'ar' : 'fr'];
  const recent  = useMemo(() => chatHistory.slice(0, 3), [chatHistory]);
  const week    = useMemo(() => weekDots(streakCurrent, rtl), [streakCurrent, rtl]);
  const trend   = useMemo(() => weekMinutes(studySessions, rtl), [studySessions, rtl]);
  const [trendWidth, setTrendWidth] = useState(0);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const notifAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showNotifModal) {
      notifAnim.setValue(0);
      Animated.spring(notifAnim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
    }
  }, [showNotifModal, notifAnim]);
  const initial = studentName ? studentName[0].toUpperCase() : 'E';
  const quotaLeft = Math.max(0, quotaLimit - quotaUsed);

  const upcomingReminders = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    return plannedSessions
      .filter(p => p.reminder && !p.done && p.date >= todayISO)
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
  }, [plannedSessions]);

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
        <View style={[styles.header, rtl && styles.rowRev]}>
          <View style={[styles.headerLeft, rtl && styles.rowRev]}>
            <View style={[styles.avatar, { backgroundColor: NAVY }]}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
            <View>
              <Text style={[styles.greetLine, { color: NAVY }, rtl && styles.textRight]}>{greet(studentName, s)}</Text>
              <Text style={[styles.subLine, { color: TEAL }, rtl && styles.textRight]}>
                {studentClassName ? `${studentClassName} · ` : ''}{todayFull(rtl)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.notifBtn, { backgroundColor: t.surface }]}
            onPress={() => setShowNotifModal(true)}
          >
            <Ionicons name="notifications-outline" size={20} color={NAVY} />
            {upcomingReminders.length > 0 && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>

        {/* ── DR. AHMED CARD ── */}
        <TouchableOpacity
          style={[styles.drCard, rtl && styles.rowRev]}
          onPress={() => nav.navigate('Chat')}
          activeOpacity={0.9}
        >
          <View style={styles.halo1} />
          <View style={styles.halo2} />

          <View style={styles.drLeft}>
            <View>
              <Text style={[styles.drSpecialty, rtl && styles.textRight]}>{s.specialty}</Text>
              <Text style={[styles.drName, rtl && styles.textRight]}>Dr. Ahmed</Text>
            </View>
            <View style={[styles.drBtn, rtl && styles.rowRev, rtl && { alignSelf: 'flex-end' }]}>
              <Text style={styles.drBtnTxt}>{s.start}</Text>
              <View style={styles.drBtnArrow}>
                <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={14} color={NAVY} />
              </View>
            </View>
          </View>

          {/* Image Dr. Ahmed */}
          <Image
            source={require('../../assets/dr_ahmed.png')}
            style={[styles.drImage, rtl && { marginRight: 0, marginLeft: -10, alignSelf: 'flex-start' }]}
            resizeMode="contain"
          />
        </TouchableOpacity>

        {/* ── STATS — 3 cartes propres, style clinique ── */}
        <View style={[styles.statsRow, rtl && styles.rowRev]}>
          <View style={[styles.statCard, { backgroundColor: t.surface }]}>
            <Text style={[styles.statNum, { color: NAVY }]}>{streakCurrent}</Text>
            <Text style={[styles.statLbl, { color: '#94A3B8' }, rtl && styles.textRight]}>{s.statDaysLbl}</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: t.surface }]}>
            <Text style={[styles.statNum, { color: NAVY }]}>{xpToday}</Text>
            <Text style={[styles.statLbl, { color: '#94A3B8' }, rtl && styles.textRight]}>{s.statPointsLbl}</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: t.surface }]}>
            <Text style={[styles.statNum, { color: NAVY }]}>{quotaLeft}</Text>
            <Text style={[styles.statLbl, { color: '#94A3B8' }, rtl && styles.textRight]}>{s.statQuestionsLbl}</Text>
          </View>
        </View>

        {/* ── OBJECTIF DU JOUR ── */}
        <View style={[styles.goalCard, { backgroundColor: t.surface }]}>
          <View style={[styles.goalHeader, rtl && styles.rowRev]}>
            <Text style={[styles.goalTitle, { color: NAVY }]}>{s.goalTitle}</Text>
            <Text style={[styles.goalPercent, { color: TEAL }]}>
              {Math.min(Math.round((xpToday / dailyGoal) * 100), 100)}%
            </Text>
          </View>
          <View style={styles.goalBarTrack}>
            <View style={[styles.goalBarFill, { width: `${Math.min((xpToday / dailyGoal) * 100, 100)}%` as any }]} />
          </View>
          <Text style={[styles.goalLabel, { color: '#94A3B8' }, rtl && styles.textRight]}>
            {s.goalLabel(xpToday, dailyGoal)}
          </Text>
        </View>

        {/* ── ÉVOLUTION HEBDOMADAIRE ── */}
        <View
          style={[styles.trendCard, { backgroundColor: t.surface }]}
          onLayout={(e) => setTrendWidth(e.nativeEvent.layout.width - 36)}
        >
          <Text style={[styles.trendTitle, { color: NAVY }, rtl && styles.textRight]}>{s.trendTitle}</Text>
          {trendWidth > 0 && (
            <TrendChart bars={trend.bars} max={trend.max} width={trendWidth} height={110} minutesLabel={s.trendMinutes} />
          )}
        </View>

        {/* ── CALENDRIER ACTIVITÉ ── */}
        <View style={[styles.calCard, { backgroundColor: t.surface }]}>
          <View style={[styles.calHeader, rtl && styles.rowRev]}>
            <Text style={[styles.calTitle, { color: NAVY }]}>{s.calTitle}</Text>
            {streakCurrent > 0 && (
              <Text style={[styles.calStreakTxt, { color: TEAL }]}>
                {s.calStreakSuffix(streakCurrent)}
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
          s={s}
          rtl={rtl}
        />

        {/* ── CONVERSATIONS RÉCENTES ── */}
        {recent.length > 0 && (
          <>
            <View style={[styles.sectionRow, rtl && styles.rowRev]}>
              <Text style={[styles.sectionTitle, { color: NAVY }]}>{s.sectionRecent}</Text>
              <TouchableOpacity onPress={() => nav.navigate('Historique')}>
                <Text style={[styles.seeAll, { color: TEAL }]}>{s.seeAll}</Text>
              </TouchableOpacity>
            </View>

            {recent.map((s2) => {
              const last = s2.messages[s2.messages.length - 1];
              const date = new Date(s2.createdAt).toLocaleDateString(rtl ? 'ar' : 'fr-FR', {
                day: 'numeric', month: 'short',
              });
              return (
                <TouchableOpacity
                  key={s2.id}
                  style={[styles.chatRow, { backgroundColor: t.surface }, rtl && styles.rowRev]}
                  onPress={() => nav.navigate('Historique')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.chatIcon, { backgroundColor: TEAL_BG }]}>
                    <Ionicons name="document-text-outline" size={20} color={TEAL} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.chatCourse, { color: NAVY }, rtl && styles.textRight]} numberOfLines={1}>
                      {s2.courseName === 'Discussion libre' ? s.freeChatTitle : s2.courseName}
                    </Text>
                    <Text style={[styles.chatPreview, { color: '#94A3B8' }, rtl && styles.textRight]} numberOfLines={1}>
                      {last?.content?.slice(0, 55) ?? ''}
                    </Text>
                  </View>
                  <View style={[styles.chatRight, rtl && styles.rowRev]}>
                    <Text style={[styles.chatDate, { color: '#CBD5E0' }]}>{date}</Text>
                    <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={14} color="#CBD5E0" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal visible={showNotifModal} animationType="none" transparent onRequestClose={() => setShowNotifModal(false)}>
        <TouchableOpacity
          style={styles.notifOverlay}
          activeOpacity={1}
          onPress={() => setShowNotifModal(false)}
        >
          <Animated.View
            style={[
              styles.notifBox,
              { backgroundColor: t.surface, marginTop: insets.top + 60 },
              {
                opacity: notifAnim,
                transform: [
                  { scale: notifAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                  { translateY: notifAnim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
                ],
              },
            ]}
          >
            <View style={styles.notifHeader}>
              <View style={styles.notifHeaderHalo} />
              <View style={styles.notifHeaderRow}>
                <View style={styles.notifHeaderIconWrap}>
                  <Ionicons name="notifications" size={16} color="#fff" />
                </View>
                <View>
                  <Text style={styles.notifHeaderTitle}>{s.notifTitle}</Text>
                  <Text style={styles.notifHeaderSub}>{s.notifSub(upcomingReminders.length)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.notifBody}>
              {upcomingReminders.length === 0 ? (
                <Text style={[styles.notifEmpty, { color: t.textMuted }, rtl && styles.textRight]}>{s.notifEmpty}</Text>
              ) : (
                upcomingReminders.map(p => {
                  const style = getSubjectStyle(p.matiere);
                  return (
                    <View key={p.id} style={[styles.notifRow, rtl && styles.rowRev]}>
                      <View style={[styles.notifRowBadge, { backgroundColor: style.light }]}>
                        <Text style={styles.notifRowEmoji}>{style.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.notifRowTitle, { color: NAVY }, rtl && styles.textRight]}>
                          {p.matiere || s.freeChatTitle}
                        </Text>
                        <Text style={[styles.notifRowSub, { color: style.accent }, rtl && styles.textRight]}>
                          {relativeDateLabel(p.date, s)}{p.time ? ` · ${s.notifAt(p.time)}` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
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

  rowRev:    { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right', writingDirection: 'rtl' },

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
  notifDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#E24B4A', borderWidth: 1.5, borderColor: '#fff',
  },
  notifOverlay: {
    flex: 1, backgroundColor: 'rgba(11,30,52,0.5)', alignItems: 'flex-end', paddingHorizontal: 20,
  },
  notifBox: {
    width: 300, borderRadius: 20, overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  notifHeader: {
    backgroundColor: NAVY, paddingHorizontal: 18, paddingVertical: 16, overflow: 'hidden',
  },
  notifHeaderHalo: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(7,169,151,0.25)', top: -60, right: -30,
  },
  notifHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifHeaderIconWrap: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(7,169,151,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  notifHeaderTitle: { fontFamily: SERIF, fontSize: 15, color: '#fff' },
  notifHeaderSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  notifBody: { padding: 16 },
  notifEmpty: { fontSize: 13, lineHeight: 19 },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  notifRowBadge: {
    width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifRowEmoji: { fontSize: 16 },
  notifRowTitle: { fontSize: 13.5, fontWeight: '700' },
  notifRowSub: { fontSize: 11.5, marginTop: 2, fontWeight: '600' },

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

  /* ── OBJECTIF DU JOUR ── */
  goalCard: {
    borderRadius: 20, padding: 18, marginBottom: 14, ...shadow,
  },
  goalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  goalTitle:   { fontFamily: SERIF, fontSize: 16 },
  goalPercent: { fontSize: 14, fontWeight: '800' },
  goalBarTrack: {
    height: 8, borderRadius: 4, backgroundColor: '#F1F5F9', overflow: 'hidden', marginBottom: 8,
  },
  goalBarFill: {
    height: '100%', borderRadius: 4, backgroundColor: TEAL,
  },
  goalLabel: { fontSize: 12, fontWeight: '500' },

  /* ── ÉVOLUTION HEBDOMADAIRE ── */
  trendCard: {
    borderRadius: 20, padding: 18, marginBottom: 14, ...shadow,
  },
  trendTitle: { fontFamily: SERIF, fontSize: 16, marginBottom: 6 },
  trendLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  trendDayLbl: { fontSize: 10, fontWeight: '700', width: 20, textAlign: 'center' },
  trendTooltip: {
    position: 'absolute', zIndex: 10, backgroundColor: NAVY, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, minWidth: 56, alignItems: 'center',
  },
  trendTooltipText: { fontSize: 11, fontWeight: '700', color: '#fff' },

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
