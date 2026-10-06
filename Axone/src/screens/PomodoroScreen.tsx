import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Platform, Alert, ScrollView, Animated, Easing, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Radius } from '../theme';
import { useTheme, Text, TextInput } from '../components';
import { useAppStore } from '../store';
import { schedulePomodoroEnd, cancelPomodoroNotification } from '../utils/notifications';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const FOCUS_OPTIONS = [15, 25, 45, 60];
const PAUSE_OPTIONS = [5, 10, 15];

// ── Musique de révision ──────────────────────────────────────────────────────
// Pistes déclarées mais sans fichier audio pour l'instant : je ne peux pas
// générer de vrai contenu sonore. Pour activer la lecture, dépose des fichiers
// .mp3 dans assets/sounds/ et remplace `source: null` par
// `source: require('../../assets/sounds/lofi.mp3')` (etc.) ci-dessous.
type Track = { id: string; label: { fr: string; ar: string }; icon: string; source: number | null };
const TRACKS: Track[] = [
  { id: 'lofi',  label: { fr: 'Lo-fi',        ar: 'لوفاي' },      icon: 'musical-notes-outline', source: null },
  { id: 'nature',label: { fr: 'Nature',       ar: 'طبيعة' },      icon: 'leaf-outline',           source: null },
  { id: 'white', label: { fr: 'Bruit blanc',  ar: 'ضوضاء بيضاء' },icon: 'radio-outline',          source: null },
];

type Strings = {
  headerLabel: string;
  title: string;
  tabFocus: string;
  tabPause: string;
  start: string;
  pause: string;
  reset: string;
  studyTitle: string;
  labelMatiere: string;
  placeholderMatiere: string;
  labelSousMatiere: string;
  placeholderSousMatiere: string;
  musicTitle: string;
  musicNone: string;
  musicComingSoon: string;
  cycleDone: (n: number) => string;
  durationLabel: string;
  minutesShort: (n: number) => string;
  remaining: string;
  resumeTitle: string;
  resumeMsg: string;
  resumeYes: string;
  resumeNo: string;
  endSession: string;
  notifFocusDoneTitle: string;
  notifFocusDoneBody: string;
  notifPauseDoneTitle: string;
  notifPauseDoneBody: string;
};

const STRINGS: Record<'fr' | 'ar', Strings> = {
  fr: {
    headerLabel: 'CONCENTRATION',
    title: 'Pomodoro',
    tabFocus: 'FOCUS',
    tabPause: 'PAUSE',
    start: 'Démarrer',
    pause: 'Pause',
    reset: 'Réinitialiser',
    studyTitle: 'Étude',
    labelMatiere: 'MATIÈRE',
    placeholderMatiere: 'ex: Cardiologie...',
    labelSousMatiere: 'SOUS-MATIÈRE',
    placeholderSousMatiere: 'ex: Insuffisance cardiaque...',
    musicTitle: 'Musique de révision',
    musicNone: 'Aucune',
    musicComingSoon: "Bientôt disponible — l'audio n'est pas encore intégré.",
    cycleDone: (n) => `${n} cycle${n > 1 ? 's' : ''} terminé${n > 1 ? 's' : ''} aujourd'hui`,
    durationLabel: 'DURÉE',
    minutesShort: (n) => `${n} min`,
    remaining: 'restant',
    resumeTitle: 'Pause terminée',
    resumeMsg: 'Tu veux relancer une session de concentration ?',
    resumeYes: 'Relancer',
    resumeNo: 'Pas maintenant',
    endSession: 'Terminer la session',
    notifFocusDoneTitle: 'Session terminée 🎉',
    notifFocusDoneBody: "Ton temps de concentration est fini — place à la pause.",
    notifPauseDoneTitle: 'Pause terminée',
    notifPauseDoneBody: 'Reviens sur Axone pour relancer une session si tu es prêt.',
  },
  ar: {
    headerLabel: 'التركيز',
    title: 'بومودورو',
    tabFocus: 'تركيز',
    tabPause: 'استراحة',
    start: 'ابدأ',
    pause: 'إيقاف',
    reset: 'إعادة ضبط',
    studyTitle: 'الدراسة',
    labelMatiere: 'المادة',
    placeholderMatiere: 'مثال: أمراض القلب...',
    labelSousMatiere: 'المادة الفرعية',
    placeholderSousMatiere: 'مثال: قصور القلب...',
    musicTitle: 'موسيقى المراجعة',
    musicNone: 'بدون',
    musicComingSoon: 'قريباً — لم يتم تفعيل الصوت بعد.',
    cycleDone: (n) => `${n} دورة مكتملة اليوم`,
    durationLabel: 'المدة',
    minutesShort: (n) => `${n} د`,
    remaining: 'متبقٍ',
    resumeTitle: 'انتهت الاستراحة',
    resumeMsg: 'هل تريد بدء جلسة تركيز جديدة؟',
    resumeYes: 'نعم',
    resumeNo: 'ليس الآن',
    endSession: 'إنهاء الجلسة',
    notifFocusDoneTitle: 'انتهت الجلسة 🎉',
    notifFocusDoneBody: 'انتهى وقت التركيز — حان وقت الاستراحة.',
    notifPauseDoneTitle: 'انتهت الاستراحة',
    notifPauseDoneBody: 'عد إلى Axone لبدء جلسة جديدة إذا كنت مستعداً.',
  },
};

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function PomodoroScreen() {
  const nav = useNavigation<any>();
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const uiLanguage = useAppStore(s => s.uiLanguage);
  const logStudySession = useAppStore(s => s.logStudySession);
  const rtl = uiLanguage === 'ar';
  const s = STRINGS[rtl ? 'ar' : 'fr'];

  // Tout l'état du minuteur vit dans le store global (pas dans ce composant) :
  // ça lui permet de survivre à la navigation (retour sur Réviser, puis
  // réouverture de Pomodoro reprend exactement où c'était).
  const {
    pomodoroMode: mode,
    pomodoroFocusMinutes: focusMinutes,
    pomodoroPauseMinutes: pauseMinutes,
    pomodoroSecondsLeft: frozenSecondsLeft,
    pomodoroEndAt: endAt,
    pomodoroIsRunning: isRunning,
    pomodoroCyclesDone: cyclesDone,
    pomodoroMatiere: matiere,
    pomodoroSousMatiere: sousMatiere,
    setPomodoro,
  } = useAppStore();

  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Valeur affichée : recalculée depuis l'horodatage réel pendant que ça
  // tourne (jamais stockée telle quelle), figée sinon.
  const secondsLeft = isRunning && endAt != null
    ? Math.max(0, Math.round((endAt - Date.now()) / 1000))
    : frozenSecondsLeft;

  const durationFor = useCallback(
    (m: 'focus' | 'pause') => (m === 'focus' ? focusMinutes : pauseMinutes) * 60,
    [focusMinutes, pauseMinutes],
  );

  const stopRunning = () => {
    setPomodoro({ pomodoroIsRunning: false, pomodoroSecondsLeft: secondsLeft, pomodoroEndAt: null });
    cancelPomodoroNotification().catch(() => {});
  };

  const startRunning = (secs: number, m: 'focus' | 'pause') => {
    setPomodoro({ pomodoroIsRunning: true, pomodoroEndAt: Date.now() + secs * 1000, pomodoroSecondsLeft: secs });
    const title = m === 'focus' ? s.notifFocusDoneTitle : s.notifPauseDoneTitle;
    const body  = m === 'focus' ? s.notifFocusDoneBody  : s.notifPauseDoneBody;
    schedulePomodoroEnd(secs, title, body).catch(() => {});
  };

  const setDuration = (m: 'focus' | 'pause', minutes: number) => {
    setPomodoro(m === 'focus' ? { pomodoroFocusMinutes: minutes } : { pomodoroPauseMinutes: minutes });
    if (mode === m) {
      setPomodoro({ pomodoroSecondsLeft: minutes * 60, pomodoroIsRunning: false, pomodoroEndAt: null });
      cancelPomodoroNotification().catch(() => {});
    }
  };

  useEffect(() => {
    if (!isRunning) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.035, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRunning, pulse]);

  // Force un re-render chaque seconde pendant que ça tourne, pour que
  // `secondsLeft` (recalculé à chaque rendu depuis endAt) reste à jour.
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => forceTick(x => x + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // Recalcul immédiat au retour au premier plan (l'app peut avoir été gelée
  // plusieurs minutes/heures pendant que le téléphone était verrouillé).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isRunning) forceTick(x => x + 1);
    });
    return () => sub.remove();
  }, [isRunning]);

  // Transition de cycle — se déclenche une fois quand le décompte atteint 0.
  // Focus → Pause : automatique (la pause démarre toute seule).
  // Pause → Focus : on demande confirmation avant de relancer une session.
  useEffect(() => {
    if (!isRunning || secondsLeft !== 0) return;
    if (mode === 'focus') {
      logStudySession(matiere, sousMatiere, focusMinutes);
      const nextSecs = pauseMinutes * 60;
      setPomodoro({ pomodoroCyclesDone: cyclesDone + 1, pomodoroMode: 'pause', pomodoroSecondsLeft: nextSecs, pomodoroEndAt: Date.now() + nextSecs * 1000 });
      schedulePomodoroEnd(nextSecs, s.notifPauseDoneTitle, s.notifPauseDoneBody).catch(() => {});
    } else {
      const nextSecs = focusMinutes * 60;
      setPomodoro({ pomodoroIsRunning: false, pomodoroMode: 'focus', pomodoroSecondsLeft: nextSecs, pomodoroEndAt: null });
      cancelPomodoroNotification().catch(() => {});
      Alert.alert(s.resumeTitle, s.resumeMsg, [
        { text: s.resumeNo, style: 'cancel' },
        { text: s.resumeYes, onPress: () => startRunning(nextSecs, 'focus') },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, isRunning]);

  useEffect(() => () => {
    if (soundRef.current) soundRef.current.unloadAsync().catch(() => {});
  }, []);

  const switchMode = (m: 'focus' | 'pause') => {
    setPomodoro({ pomodoroMode: m, pomodoroSecondsLeft: durationFor(m), pomodoroIsRunning: false, pomodoroEndAt: null });
    cancelPomodoroNotification().catch(() => {});
  };

  const reset = () => {
    setPomodoro({ pomodoroSecondsLeft: durationFor(mode), pomodoroIsRunning: false, pomodoroEndAt: null });
    cancelPomodoroNotification().catch(() => {});
  };

  const endSession = () => {
    setPomodoro({
      pomodoroMode: 'focus', pomodoroSecondsLeft: focusMinutes * 60,
      pomodoroIsRunning: false, pomodoroEndAt: null, pomodoroCyclesDone: 0,
    });
    cancelPomodoroNotification().catch(() => {});
  };

  const toggleTrack = async (track: Track) => {
    if (!track.source) {
      Alert.alert(s.musicTitle, s.musicComingSoon);
      return;
    }
    if (activeTrack === track.id) {
      await soundRef.current?.stopAsync();
      setActiveTrack(null);
      return;
    }
    if (soundRef.current) await soundRef.current.unloadAsync().catch(() => {});
    const { sound } = await Audio.Sound.createAsync(track.source, { isLooping: true });
    soundRef.current = sound;
    await sound.playAsync();
    setActiveTrack(track.id);
  };

  const total = durationFor(mode);
  const progress = 1 - secondsLeft / total;
  const progressPercent = Math.round(progress * 100);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPercent,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressPercent, progressAnim]);

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={[styles.header, { paddingTop: top + 12 }]}>
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
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: bottom + 32 }]} showsVerticalScrollIndicator={false}>

        {/* ── Tabs Focus / Pause ── */}
        <View style={[styles.modeTabs, { backgroundColor: t.surfaceAlt }]}>
          {(['focus', 'pause'] as const).map(m => {
            const active = mode === m;
            return (
              <TouchableOpacity
                key={m}
                style={[styles.modeTab, active && { backgroundColor: NAVY }]}
                onPress={() => switchMode(m)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeTabText, { color: active ? '#fff' : t.textMuted }]}>
                  {m === 'focus' ? s.tabFocus : s.tabPause}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Sélecteur de durée ── */}
        <View style={[styles.durationRow, rtl && { flexDirection: 'row-reverse' }]}>
          <Text style={[styles.durationLabel, { color: t.textMuted }]}>{s.durationLabel}</Text>
          <View style={[styles.durationChips, rtl && { flexDirection: 'row-reverse' }]}>
            {(mode === 'focus' ? FOCUS_OPTIONS : PAUSE_OPTIONS).map(n => {
              const active = (mode === 'focus' ? focusMinutes : pauseMinutes) === n;
              const accent = mode === 'focus' ? TEAL : '#E24B4A';
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.durationChip, { borderColor: active ? accent : t.border }, active && { backgroundColor: accent }]}
                  onPress={() => setDuration(mode, n)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.durationChipText, { color: active ? '#fff' : t.textMuted }]}>{s.minutesShort(n)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Anneau + temps ── */}
        <View style={styles.ringWrap}>
          <View style={[styles.ringHalo1, { backgroundColor: mode === 'focus' ? 'rgba(7,169,151,0.14)' : 'rgba(226,75,74,0.12)' }]} />
          <View style={[styles.ringHalo2, { backgroundColor: mode === 'focus' ? 'rgba(7,169,151,0.09)' : 'rgba(226,75,74,0.08)' }]} />
          <Animated.View style={[
            styles.ring,
            { borderColor: mode === 'focus' ? TEAL : '#E24B4A', backgroundColor: t.surface, transform: [{ scale: pulse }] },
          ]}>
            <Text style={[styles.time, { color: NAVY }]}>{formatTime(secondsLeft)}</Text>
            <Text style={[styles.timeCaption, { color: t.textMuted }]}>{s.remaining}</Text>
          </Animated.View>
        </View>

        <View style={[styles.progressHeader, rtl && { flexDirection: 'row-reverse' }]}>
          <Text style={[styles.progressPercent, { color: mode === 'focus' ? TEAL : '#E24B4A' }]}>{progressPercent}%</Text>
        </View>
        <View style={styles.barTrack}>
          <Animated.View style={{
            width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            height: '100%',
          }}>
            <LinearGradient
              colors={mode === 'focus' ? ['#07A997', '#0BC8AE'] : ['#E24B4A', '#F17B7A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.barFill}
            />
          </Animated.View>
        </View>

        {/* ── Contrôles ── */}
        <View style={styles.controlsRow}>
          <TouchableOpacity style={[styles.resetBtn, { borderColor: t.border }]} onPress={reset} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={20} color={t.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: mode === 'focus' ? TEAL : '#E24B4A' }]}
            onPress={() => (isRunning ? stopRunning() : startRunning(secondsLeft, mode))}
            activeOpacity={0.85}
          >
            <Ionicons name={isRunning ? 'pause' : 'play'} size={20} color="#fff" />
            <Text style={styles.startBtnText}>{isRunning ? s.pause : s.start}</Text>
          </TouchableOpacity>
        </View>

        {cyclesDone > 0 && (
          <Text style={[styles.cyclesText, { color: t.textMuted }]}>{s.cycleDone(cyclesDone)}</Text>
        )}

        {(isRunning || cyclesDone > 0) && (
          <TouchableOpacity
            onPress={endSession}
            style={[styles.endBtn, { borderColor: '#F3D2D1', backgroundColor: '#FDF4F4' }]}
            activeOpacity={0.8}
          >
            <Ionicons name="stop-circle-outline" size={18} color="#E24B4A" />
            <Text style={styles.endBtnText}>{s.endSession}</Text>
          </TouchableOpacity>
        )}

        {/* ── Étude ── */}
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.cardTitle, { color: NAVY }, rtl && styles.textRight]}>{s.studyTitle}</Text>
          <Text style={[styles.fieldLabel, { color: t.textMuted }, rtl && styles.textRight]}>{s.labelMatiere}</Text>
          <TextInput
            style={[styles.input, { color: t.text, borderColor: t.border }, rtl && styles.textRight]}
            placeholder={s.placeholderMatiere}
            placeholderTextColor={t.textMuted}
            value={matiere}
            onChangeText={(v) => setPomodoro({ pomodoroMatiere: v })}
            textAlign={rtl ? 'right' : 'left'}
          />
          <Text style={[styles.fieldLabel, { color: t.textMuted, marginTop: 14 }, rtl && styles.textRight]}>{s.labelSousMatiere}</Text>
          <TextInput
            style={[styles.input, { color: t.text, borderColor: t.border }, rtl && styles.textRight]}
            placeholder={s.placeholderSousMatiere}
            placeholderTextColor={t.textMuted}
            value={sousMatiere}
            onChangeText={(v) => setPomodoro({ pomodoroSousMatiere: v })}
            textAlign={rtl ? 'right' : 'left'}
          />
        </View>

        {/* ── Musique ── */}
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.cardTitle, { color: NAVY }, rtl && styles.textRight]}>{s.musicTitle}</Text>
          <View style={[styles.trackRow, rtl && { flexDirection: 'row-reverse' }]}>
            {TRACKS.map(track => {
              const active = activeTrack === track.id;
              return (
                <TouchableOpacity
                  key={track.id}
                  style={[
                    styles.trackChip,
                    { borderColor: active ? TEAL : t.border },
                    active && { backgroundColor: TEAL_BG },
                  ]}
                  onPress={() => toggleTrack(track)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={track.icon as any} size={18} color={active ? TEAL : t.textMuted} />
                  <Text style={[styles.trackChipText, { color: active ? NAVY : t.textMuted }]}>
                    {track.label[rtl ? 'ar' : 'fr']}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  textRight: { textAlign: 'right', writingDirection: 'rtl' },

  header: {
    backgroundColor: NAVY,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerSub: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.4 },
  headerTitle: { fontFamily: SERIF, fontSize: 18, color: '#fff', marginTop: 2 },

  body: { padding: Spacing.lg },

  modeTabs: {
    flexDirection: 'row', borderRadius: Radius.lg, padding: 4, marginBottom: 28,
  },
  modeTab: {
    flex: 1, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center',
  },
  modeTabText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

  durationRow: { marginBottom: 18 },
  durationLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  durationChips: { flexDirection: 'row', gap: 8 },
  durationChip: {
    flex: 1, alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.md, paddingVertical: 9,
  },
  durationChipText: { fontSize: 12, fontWeight: '700' },

  ringWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 28, height: 300 },
  ringHalo1: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
  },
  ringHalo2: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
  },
  ring: {
    width: 220, height: 220, borderRadius: 110, borderWidth: 12,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 6 },
    }),
  },
  time: { fontFamily: SERIF, fontSize: 46, letterSpacing: -1 },
  timeCaption: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' },

  progressHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 6 },
  progressPercent: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  barTrack: {
    height: 10, borderRadius: 5, backgroundColor: '#F1F5F9', overflow: 'hidden', marginBottom: 24,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2 },
      android: {},
    }),
  },
  barFill: {
    flex: 1, borderRadius: 5,
    ...Platform.select({
      ios:     { shadowColor: TEAL, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 4 },
      android: {},
    }),
  },

  controlsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 8,
  },
  resetBtn: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.full, paddingHorizontal: 32, paddingVertical: 15,
  },
  startBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  cyclesText: { fontSize: 12, textAlign: 'center', marginBottom: 14 },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    alignSelf: 'center', borderWidth: 1.5, borderRadius: Radius.full,
    paddingVertical: 12, paddingHorizontal: 26, marginBottom: 24,
  },
  endBtnText: { fontSize: 14, fontWeight: '700', color: '#E24B4A' },

  card: {
    borderRadius: 20, padding: 18, marginBottom: 16,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  cardTitle: { fontFamily: SERIF, fontSize: 16, marginBottom: 14 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
  },

  trackRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  trackChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 2, borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10,
  },
  trackChipText: { fontSize: 13, fontWeight: '600' },
});
