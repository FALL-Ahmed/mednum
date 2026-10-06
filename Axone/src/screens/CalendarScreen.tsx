import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ScrollView, Animated, Modal, Switch } from 'react-native';
import { PanGestureHandler, State as GestureState } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius } from '../theme';
import { useTheme, Text, TextInput } from '../components';
import { useAppStore, StudySession, PlannedSession } from '../store';
import { getSubjectStyle } from '../utils/subjectStyles';
import { schedulePlannedReminder, cancelPlannedReminder } from '../utils/notifications';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const DAYS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAYS_AR = ['اث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 3;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;

// ⚠️ MOCK TEMPORAIRE — pour prévisualiser le calendrier rempli sans avoir à faire
// de vraies sessions Pomodoro. Mettre à false pour repasser sur les vraies données.
const USE_MOCK_DATA = true;
function buildMockSessions(): StudySession[] {
  const today = new Date();
  const iso = (daysAgo: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const entries: { daysAgo: number; matiere: string; sousMatiere: string; minutes: number }[] = [
    { daysAgo: 0,  matiere: 'Cardiologie', sousMatiere: 'Insuffisance cardiaque', minutes: 25 },
    { daysAgo: 0,  matiere: 'Anatomie',    sousMatiere: 'Membre supérieur',       minutes: 45 },
    { daysAgo: 1,  matiere: 'Pédiatrie',   sousMatiere: 'Croissance',             minutes: 25 },
    { daysAgo: 2,  matiere: 'Cardiologie', sousMatiere: 'ECG',                    minutes: 50 },
    { daysAgo: 3,  matiere: 'Hématologie', sousMatiere: 'Anémies',                minutes: 25 },
    { daysAgo: 6,  matiere: 'Anatomie',    sousMatiere: 'Membre inférieur',       minutes: 25 },
    { daysAgo: 8,  matiere: 'Pédiatrie',   sousMatiere: 'Vaccination',            minutes: 45 },
    { daysAgo: 9,  matiere: 'Cardiologie', sousMatiere: 'Valvulopathies',         minutes: 25 },
    { daysAgo: 12, matiere: 'Hématologie', sousMatiere: 'Coagulation',            minutes: 25 },
    { daysAgo: 15, matiere: 'Anatomie',    sousMatiere: 'Thorax',                 minutes: 50 },
    { daysAgo: 18, matiere: 'Pédiatrie',   sousMatiere: 'Nutrition',              minutes: 25 },
  ];
  return entries.map((e, i) => ({
    id: `mock-${i}`,
    date: iso(e.daysAgo),
    matiere: e.matiere,
    sousMatiere: e.sousMatiere,
    minutes: e.minutes,
  }));
}

type Strings = {
  headerLabel: string;
  title: string;
  statSessions: string;
  statHours: string;
  statStreak: string;
  dayDetailEmpty: string;
  sessionLine: (matiere: string, minutes: number) => string;
  noMatiere: string;
  today: string;
  planSectionTitle: string;
  planBtn: string;
  modalTitle: string;
  modalTitleEdit: string;
  confirmEdit: string;
  labelMatiere: string;
  placeholderMatiere: string;
  labelSousMatiere: string;
  placeholderSousMatiere: string;
  labelTime: string;
  placeholderTime: string;
  labelReminder: string;
  cancel: string;
  confirm: string;
};

const STRINGS: Record<'fr' | 'ar', Strings> = {
  fr: {
    headerLabel: 'PLANNING',
    title: 'Calendrier',
    statSessions: 'sessions',
    statHours: 'heures',
    statStreak: 'jours de suite',
    dayDetailEmpty: "Pas de session enregistrée ce jour-là.",
    sessionLine: (matiere, minutes) => `${matiere} — ${minutes} min`,
    noMatiere: 'Session libre',
    today: "Aujourd'hui",
    planSectionTitle: 'Prévu',
    planBtn: '+ Planifier une session',
    modalTitle: 'Planifier une session',
    modalTitleEdit: 'Modifier la session',
    confirmEdit: 'Enregistrer',
    labelMatiere: 'MATIÈRE',
    placeholderMatiere: 'ex: Cardiologie...',
    labelSousMatiere: 'SOUS-MATIÈRE',
    placeholderSousMatiere: 'ex: Insuffisance cardiaque...',
    labelTime: 'HEURE',
    placeholderTime: 'ex: 14:30',
    labelReminder: 'Me le rappeler',
    cancel: 'Annuler',
    confirm: 'Planifier',
  },
  ar: {
    headerLabel: 'التخطيط',
    title: 'التقويم',
    statSessions: 'جلسات',
    statHours: 'ساعات',
    statStreak: 'أيام متتالية',
    dayDetailEmpty: 'لا توجد جلسة مسجلة في هذا اليوم.',
    sessionLine: (matiere, minutes) => `${matiere} — ${minutes} د`,
    noMatiere: 'جلسة حرة',
    today: 'اليوم',
    planSectionTitle: 'مخطط',
    planBtn: '+ تخطيط جلسة',
    modalTitle: 'تخطيط جلسة',
    modalTitleEdit: 'تعديل الجلسة',
    confirmEdit: 'حفظ',
    labelMatiere: 'المادة',
    placeholderMatiere: 'مثال: أمراض القلب...',
    labelSousMatiere: 'المادة الفرعية',
    placeholderSousMatiere: 'مثال: قصور القلب...',
    labelTime: 'الوقت',
    placeholderTime: 'مثال: 14:30',
    labelReminder: 'ذكّرني',
    cancel: 'إلغاء',
    confirm: 'تخطيط',
  },
};

function pad(n: number) { return String(n).padStart(2, '0'); }
function isoDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function DayCell({
  day, isToday, isSelected, subjectColors, hasPlanned, textColor, onPress,
}: {
  day: number; isToday: boolean; isSelected: boolean; subjectColors: string[];
  hasPlanned: boolean; textColor: string; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, speed: 60, bounciness: 6 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }).start();

  return (
    <TouchableOpacity
      style={styles.cell}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={0.85}
    >
      <Animated.View style={[
        styles.cellCircle,
        { transform: [{ scale }] },
        isSelected && { backgroundColor: NAVY },
        !isSelected && isToday && { borderWidth: 1.5, borderColor: TEAL },
      ]}>
        <Text style={[styles.cellNum, { color: isSelected ? '#fff' : isToday ? TEAL : textColor }]}>
          {day}
        </Text>
      </Animated.View>
      <View style={styles.cellDots}>
        {subjectColors.map((c, i) => (
          <View key={i} style={[styles.cellDot, { backgroundColor: c }]} />
        ))}
        {hasPlanned && <View style={styles.cellDotPlanned} />}
      </View>
    </TouchableOpacity>
  );
}

function WheelPicker({
  data, value, onChange, format, accent, textColor,
}: {
  data: number[]; value: number; onChange: (v: number) => void;
  format: (n: number) => string; accent: string; textColor: string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const pad = (WHEEL_H - WHEEL_ITEM_H) / 2;

  const handleEnd = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(data.length - 1, Math.round(y / WHEEL_ITEM_H)));
    onChange(data[index]);
  };

  return (
    <View style={{ height: WHEEL_H }}>
      <View pointerEvents="none" style={[styles.wheelHighlight, { top: pad, borderColor: accent }]} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{ paddingVertical: pad }}
        onMomentumScrollEnd={handleEnd}
        contentOffset={{ x: 0, y: Math.min(Math.max(data.indexOf(value), 0), data.length - 1) * WHEEL_ITEM_H }}
      >
        {data.map(n => (
          <View key={n} style={styles.wheelItem}>
            <Text style={[styles.wheelItemText, { color: n === value ? textColor : '#C6CDD6' }, n === value && { fontWeight: '800' }]}>
              {format(n)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function CalendarScreen() {
  const nav = useNavigation<any>();
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const uiLanguage = useAppStore(s => s.uiLanguage);
  const realStudySessions = useAppStore(s => s.studySessions);
  const realStreakCurrent = useAppStore(s => s.streakCurrent);
  const plannedSessions = useAppStore(s => s.plannedSessions);
  const addPlannedSession = useAppStore(s => s.addPlannedSession);
  const updatePlannedSession = useAppStore(s => s.updatePlannedSession);
  const removePlannedSession = useAppStore(s => s.removePlannedSession);
  const togglePlannedDone = useAppStore(s => s.togglePlannedDone);
  const streakCurrent = USE_MOCK_DATA ? 4 : realStreakCurrent;
  const studySessions = useMemo(
    () => (USE_MOCK_DATA ? buildMockSessions() : realStudySessions),
    [realStudySessions],
  );
  const rtl = uiLanguage === 'ar';
  const s = STRINGS[rtl ? 'ar' : 'fr'];
  const days = rtl ? DAYS_AR : DAYS_FR;

  const todayISO = isoDate(new Date());
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDate, setSelectedDate] = useState(todayISO);

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [modalInstanceKey, setModalInstanceKey] = useState(0);
  const [planMatiere, setPlanMatiere] = useState('');
  const [planSousMatiere, setPlanSousMatiere] = useState('');
  const [planHour, setPlanHour] = useState(9);
  const [planMinute, setPlanMinute] = useState(0);
  const [planReminder, setPlanReminder] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const dragY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const playEnter = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
    ]).start();
  };

  const closePlanModal = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(dragY, { toValue: 600, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      dragY.setValue(600);
      backdropOpacity.setValue(0);
      setShowPlanModal(false);
    });
  };

  const onDragEvent = Animated.event([{ nativeEvent: { translationY: dragY } }], { useNativeDriver: true });
  const onDragStateChange = (e: any) => {
    if (e.nativeEvent.oldState === GestureState.ACTIVE) {
      const { translationY, velocityY } = e.nativeEvent;
      if (translationY > 120 || velocityY > 800) {
        closePlanModal();
      } else {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
      }
    }
  };

  const sessionsByDay = useMemo(() => {
    const map: Record<string, StudySession[]> = {};
    for (const sess of studySessions) {
      (map[sess.date] ??= []).push(sess);
    }
    return map;
  }, [studySessions]);

  const plannedByDay = useMemo(() => {
    const map: Record<string, PlannedSession[]> = {};
    for (const p of plannedSessions) {
      (map[p.date] ??= []).push(p);
    }
    return map;
  }, [plannedSessions]);

  const monthLabel = cursor.toLocaleDateString(rtl ? 'ar' : 'fr-FR', { month: 'long', year: 'numeric' });

  const monthStats = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    let sessions = 0, minutes = 0;
    for (const sess of studySessions) {
      const d = new Date(sess.date);
      if (d.getFullYear() === y && d.getMonth() === m) { sessions++; minutes += sess.minutes; }
    }
    return { sessions, hours: Math.round((minutes / 60) * 10) / 10 };
  }, [studySessions, cursor]);

  const grid = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const firstDay = new Date(y, m, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // lundi = 0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: startOffset }, () => null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(y, m, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const changeMonth = (delta: number) => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + delta);
    setCursor(d);
  };

  const selectedSessions = sessionsByDay[selectedDate] ?? [];
  const selectedPlanned = plannedByDay[selectedDate] ?? [];

  const openPlanModal = () => {
    setEditingId(null);
    setPlanMatiere(''); setPlanSousMatiere(''); setPlanHour(9); setPlanMinute(0); setPlanReminder(true);
    setModalInstanceKey(k => k + 1);
    dragY.setValue(600);
    backdropOpacity.setValue(0);
    setShowPlanModal(true);
  };

  const openEditModal = (p: PlannedSession) => {
    setEditingId(p.id);
    setPlanMatiere(p.matiere); setPlanSousMatiere(p.sousMatiere);
    const [hh, mm] = (p.time ?? '09:00').split(':').map(Number);
    setPlanHour(hh); setPlanMinute(mm);
    setPlanReminder(p.reminder);
    setModalInstanceKey(k => k + 1);
    dragY.setValue(600);
    backdropOpacity.setValue(0);
    setShowPlanModal(true);
  };

  const planTimeLabel = `${pad(planHour)}:${pad(planMinute)}`;

  const scheduleOrCancelReminder = (id: string, matiere: string) => {
    if (planReminder) {
      const when = new Date(selectedDate);
      when.setHours(planHour, planMinute, 0, 0);
      schedulePlannedReminder(
        id, when,
        matiere || s.noMatiere,
        rtl ? 'حان وقت هذه الجلسة المخططة' : "C'est l'heure de cette session planifiée",
      ).catch(() => {});
    } else {
      cancelPlannedReminder(id).catch(() => {});
    }
  };

  const confirmPlan = () => {
    const payload = {
      date: selectedDate,
      time: planTimeLabel,
      matiere: planMatiere.trim(),
      sousMatiere: planSousMatiere.trim(),
      reminder: planReminder,
    };
    if (editingId) {
      updatePlannedSession(editingId, payload);
      scheduleOrCancelReminder(editingId, payload.matiere);
    } else {
      const created = addPlannedSession(payload);
      scheduleOrCancelReminder(created.id, payload.matiere);
    }
    setShowPlanModal(false);
  };

  const deletePlanned = (id: string) => {
    removePlannedSession(id);
    cancelPlannedReminder(id).catch(() => {});
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <View style={styles.headerHalo1} />
        <View style={styles.headerHalo2} />

        <View style={[styles.headerRow, rtl && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity
            style={[styles.backBtn, rtl ? { marginLeft: 12, marginRight: 0 } : { marginRight: 12 }]}
            onPress={() => nav.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={rtl ? 'arrow-forward' : 'arrow-back'} size={18} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerSub}>{s.headerLabel}</Text>
            <Text style={styles.headerTitle}>{s.title}</Text>
          </View>
        </View>

        <View style={[styles.statsRow, rtl && { flexDirection: 'row-reverse' }]}>
          <View style={styles.statBox}>
            <Ionicons name="checkmark-circle" size={16} color={TEAL} style={styles.statIcon} />
            <Text style={styles.statNum}>{monthStats.sessions}</Text>
            <Text style={styles.statLbl}>{s.statSessions}</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="time" size={16} color={TEAL} style={styles.statIcon} />
            <Text style={styles.statNum}>{monthStats.hours}</Text>
            <Text style={styles.statLbl}>{s.statHours}</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxStreak]}>
            <Ionicons name="flame" size={16} color="#FBBF24" style={styles.statIcon} />
            <Text style={[styles.statNum, styles.statNumStreak]}>{streakCurrent}</Text>
            <Text style={styles.statLbl}>{s.statStreak}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: bottom + 32 }]} showsVerticalScrollIndicator={false}>

        {/* ── Navigation mois ── */}
        <View style={[styles.monthNav, rtl && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={20} color={NAVY} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: NAVY }]}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={20} color={NAVY} />
          </TouchableOpacity>
        </View>

        {/* ── Grille du calendrier ── */}
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <View style={[styles.weekRow, rtl && { flexDirection: 'row-reverse' }]}>
            {days.map((d, i) => (
              <Text key={i} style={[styles.weekLbl, { color: t.textMuted }]}>{d}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((date, i) => {
              if (!date) return <View key={i} style={styles.cell} />;
              const iso = isoDate(date);
              const daySessions = sessionsByDay[iso] ?? [];
              const subjectColors = Array.from(new Set(daySessions.map(sess => sess.matiere || '')))
                .slice(0, 3)
                .map(m => getSubjectStyle(m).accent);
              const isToday = iso === todayISO;
              const isSelected = iso === selectedDate;
              const hasPlanned = (plannedByDay[iso] ?? []).some(p => !p.done);
              return (
                <DayCell
                  key={i}
                  day={date.getDate()}
                  isToday={isToday}
                  isSelected={isSelected}
                  subjectColors={subjectColors}
                  hasPlanned={hasPlanned}
                  textColor={t.text}
                  onPress={() => setSelectedDate(iso)}
                />
              );
            })}
          </View>
        </View>

        {/* ── Détail du jour sélectionné ── */}
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.dayTitle, { color: NAVY }, rtl && styles.textRight]}>
            {selectedDate === todayISO ? s.today : new Date(selectedDate).toLocaleDateString(rtl ? 'ar' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          {selectedSessions.length === 0 ? (
            <Text style={[styles.emptyText, { color: t.textMuted }, rtl && styles.textRight]}>{s.dayDetailEmpty}</Text>
          ) : (
            selectedSessions.map(sess => {
              const style = getSubjectStyle(sess.matiere);
              return (
                <View key={sess.id} style={[styles.sessionRow, rtl && { flexDirection: 'row-reverse' }]}>
                  <View style={[styles.sessionAccent, { backgroundColor: style.accent }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sessionMatiere, { color: NAVY }, rtl && styles.textRight]}>
                      {sess.matiere || s.noMatiere}
                    </Text>
                    {!!sess.sousMatiere && (
                      <Text style={[styles.sessionSous, { color: t.textMuted }, rtl && styles.textRight]}>
                        {sess.sousMatiere}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.sessionMinutesPill, { backgroundColor: style.light }]}>
                    <Text style={[styles.sessionMinutesText, { color: style.accent }]}>{sess.minutes} min</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── Sessions planifiées ── */}
        {selectedPlanned.length > 0 && (
          <View style={[styles.card, { backgroundColor: t.surface }]}>
            <Text style={[styles.dayTitle, { color: NAVY }, rtl && styles.textRight]}>{s.planSectionTitle}</Text>
            {selectedPlanned.map(p => {
              const style = getSubjectStyle(p.matiere);
              return (
                <View key={p.id} style={[styles.sessionRow, rtl && { flexDirection: 'row-reverse' }]}>
                  <TouchableOpacity onPress={() => togglePlannedDone(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <View style={[styles.checkCircle, p.done && { backgroundColor: TEAL, borderColor: TEAL }]}>
                      {p.done && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => openEditModal(p)} activeOpacity={0.6}>
                    <Text style={[
                      styles.sessionMatiere, { color: NAVY }, rtl && styles.textRight,
                      p.done && { textDecorationLine: 'line-through', color: t.textMuted },
                    ]}>
                      {p.matiere || s.noMatiere}
                    </Text>
                    <Text style={[styles.sessionSous, { color: t.textMuted }, rtl && styles.textRight]}>
                      {[p.sousMatiere, p.time].filter(Boolean).join(' · ')}
                    </Text>
                  </TouchableOpacity>
                  {!p.done && (
                    <View style={[styles.sessionMinutesPill, { backgroundColor: style.light }]}>
                      <Ionicons name="notifications" size={11} color={p.reminder ? style.accent : t.textMuted} />
                    </View>
                  )}
                  <TouchableOpacity onPress={() => deletePlanned(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: rtl ? 0 : 6, marginRight: rtl ? 6 : 0 }}>
                    <Ionicons name="trash-outline" size={16} color={t.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <TouchableOpacity style={styles.planBtn} onPress={openPlanModal} activeOpacity={0.85}>
          <Text style={styles.planBtnText}>{s.planBtn}</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Modal de planification ── */}
      <Modal visible={showPlanModal} animationType="none" transparent onRequestClose={closePlanModal} onShow={playEnter}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closePlanModal} />

          <PanGestureHandler onGestureEvent={onDragEvent} onHandlerStateChange={onDragStateChange}>
            <Animated.View
              style={[
                styles.modalCard,
                { backgroundColor: t.surface, paddingBottom: bottom + 20 },
                { transform: [{ translateY: dragY.interpolate({ inputRange: [-1, 0, 1000], outputRange: [0, 0, 1000] }) }] },
              ]}
            >
              <View style={styles.dragHandle} />
              <Text style={[styles.modalTitle, { color: NAVY }, rtl && styles.textRight]}>{editingId ? s.modalTitleEdit : s.modalTitle}</Text>

              <Text style={[styles.fieldLabel, { color: t.textMuted }, rtl && styles.textRight]}>{s.labelMatiere}</Text>
              <TextInput
                style={[styles.input, { color: t.text, borderColor: t.border }, rtl && styles.textRight]}
                placeholder={s.placeholderMatiere}
                placeholderTextColor={t.textMuted}
                value={planMatiere}
                onChangeText={setPlanMatiere}
                textAlign={rtl ? 'right' : 'left'}
              />

              <Text style={[styles.fieldLabel, { color: t.textMuted, marginTop: 14 }, rtl && styles.textRight]}>{s.labelSousMatiere}</Text>
              <TextInput
                style={[styles.input, { color: t.text, borderColor: t.border }, rtl && styles.textRight]}
                placeholder={s.placeholderSousMatiere}
                placeholderTextColor={t.textMuted}
                value={planSousMatiere}
                onChangeText={setPlanSousMatiere}
                textAlign={rtl ? 'right' : 'left'}
              />

              <Text style={[styles.fieldLabel, { color: t.textMuted, marginTop: 14 }, rtl && styles.textRight]}>{s.labelTime}</Text>
              <View style={[styles.wheelRow, rtl && { flexDirection: 'row-reverse' }]}>
                <WheelPicker key={`h-${modalInstanceKey}`} data={HOURS} value={planHour} onChange={setPlanHour} format={pad} accent={TEAL} textColor={NAVY} />
                <Text style={[styles.wheelColon, { color: NAVY }]}>:</Text>
                <WheelPicker key={`m-${modalInstanceKey}`} data={MINUTES} value={planMinute} onChange={setPlanMinute} format={pad} accent={TEAL} textColor={NAVY} />
              </View>

              <View style={[styles.reminderRow, rtl && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.reminderLabel, { color: t.text }]}>{s.labelReminder}</Text>
                <Switch value={planReminder} onValueChange={setPlanReminder} trackColor={{ true: TEAL }} />
              </View>

              <View style={[styles.modalBtnRow, rtl && { flexDirection: 'row-reverse' }]}>
                <TouchableOpacity style={[styles.modalBtnGhost, { borderColor: t.border }]} onPress={closePlanModal}>
                  <Text style={[styles.modalBtnGhostText, { color: t.textMuted }]}>{s.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={confirmPlan}>
                  <Text style={styles.modalBtnPrimaryText}>{editingId ? s.confirmEdit : s.confirm}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </PanGestureHandler>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  textRight: { textAlign: 'right', writingDirection: 'rtl' },

  header: {
    backgroundColor: NAVY,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerHalo1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(7,169,151,0.16)', top: -80, right: -50,
  },
  headerHalo2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(251,191,36,0.10)', bottom: -50, left: -20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerSub: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.4 },
  headerTitle: { fontFamily: SERIF, fontSize: 18, color: '#fff', marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  statBoxStreak: { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.22)' },
  statIcon: { marginBottom: 4 },
  statNum: { fontFamily: SERIF, fontSize: 22, color: '#fff' },
  statNumStreak: { color: '#FDE68A' },
  statLbl: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.55)', marginTop: 2, textTransform: 'uppercase' },

  body: { padding: Spacing.lg },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 14 },
  monthArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontFamily: SERIF, fontSize: 17, textTransform: 'capitalize', minWidth: 160, textAlign: 'center' },

  card: {
    borderRadius: 20, padding: 18, marginBottom: 16,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },

  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekLbl: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%` as any, alignItems: 'center', paddingVertical: 4 },
  cellCircle: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  cellNum: { fontSize: 13, fontWeight: '600' },
  cellDots: { flexDirection: 'row', gap: 2, marginTop: 4, height: 5 },
  cellDot: { width: 5, height: 5, borderRadius: 2.5 },
  cellDotPlanned: { width: 5, height: 5, borderRadius: 2.5, borderWidth: 1, borderColor: '#F59E0B' },

  dayTitle: { fontFamily: SERIF, fontSize: 16, marginBottom: 12, textTransform: 'capitalize' },
  emptyText: { fontSize: 13, lineHeight: 19 },

  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  sessionAccent: { width: 4, height: 30, borderRadius: 2, flexShrink: 0 },
  sessionMatiere: { fontSize: 14, fontWeight: '700' },
  sessionSous: { fontSize: 12, marginTop: 1 },
  sessionMinutesPill: {
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  sessionMinutesText: { fontSize: 11.5, fontWeight: '700' },

  checkCircle: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#CBD5E0',
    alignItems: 'center', justifyContent: 'center',
  },

  planBtn: {
    borderRadius: Radius.lg, borderWidth: 1.5, borderColor: TEAL, borderStyle: 'dashed',
    paddingVertical: 14, alignItems: 'center', marginBottom: 8,
  },
  planBtnText: { fontSize: 14, fontWeight: '700', color: TEAL },

  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
  },
  backdrop: { backgroundColor: 'rgba(11,30,52,0.5)' },
  modalCard: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingTop: 10,
  },
  dragHandle: {
    width: 40, height: 5, borderRadius: 3, backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontFamily: SERIF, fontSize: 18, marginBottom: 18 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
  },
  wheelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 },
  wheelColon: { fontFamily: SERIF, fontSize: 20, marginHorizontal: 2 },
  wheelHighlight: {
    position: 'absolute', left: 0, right: 0, height: WHEEL_ITEM_H,
    borderTopWidth: 1.5, borderBottomWidth: 1.5,
  },
  wheelItem: { height: WHEEL_ITEM_H, width: 70, alignItems: 'center', justifyContent: 'center' },
  wheelItemText: { fontFamily: SERIF, fontSize: 20 },
  reminderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18,
  },
  reminderLabel: { fontSize: 14, fontWeight: '600' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  modalBtnGhost: {
    flex: 1, borderWidth: 1.5, borderRadius: Radius.lg, paddingVertical: 13, alignItems: 'center',
  },
  modalBtnGhostText: { fontSize: 14, fontWeight: '700' },
  modalBtnPrimary: {
    flex: 1, backgroundColor: TEAL, borderRadius: Radius.lg, paddingVertical: 13, alignItems: 'center',
  },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
