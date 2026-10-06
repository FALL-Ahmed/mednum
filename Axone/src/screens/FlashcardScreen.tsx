import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, StatusBar, Platform, Animated, Easing,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { PanGestureHandler, State as GestureState } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { generateFlashcards } from '../utils/rag';
import { isDue, isMastered, todayISO, type Rating } from '../utils/srs';
import { Spacing, Radius } from '../theme';
import { useTheme, Text } from '../components';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const SWIPE_THRESHOLD = 110;

// ⚠️ MOCK TEMPORAIRE — pour prévisualiser le design instantanément sans générer via l'IA.
// Mettre à false pour revenir à la génération réelle (à faire avant tout usage réel).
const USE_MOCK_DATA = false;
const MOCK_CARDS = [
  { front: "Quel est le rôle du réticulum sarcoplasmique dans la contraction musculaire ?", back: "Il stocke le calcium (Ca²⁺) et le libère dans le cytoplasme pour déclencher la contraction, puis le repompe activement pour la relaxation." },
  { front: "Complète : la troponine C fixe le ___ qui démasque le site de liaison sur l'actine.", back: "Le calcium (Ca²⁺) — sa fixation déplace la tropomyosine et expose le site actif." },
  { front: "Cite les deux grands types de fibres musculaires squelettiques.", back: "Type I (lentes, oxydatives, résistantes à la fatigue) et Type II (rapides, glycolytiques, puissance explosive)." },
  { front: "Quelle molécule fournit l'énergie directe pour le détachement de la tête de myosine de l'actine ?", back: "L'ATP — sa fixation sur la myosine provoque le détachement, puis son hydrolyse ré-arme la tête." },
  { front: "Quel est le nom de l'unité fonctionnelle contractile du muscle strié ?", back: "Le sarcomère — délimité par deux stries Z successives." },
  { front: "Quelle est la conséquence d'une absence d'ATP sur le complexe actine-myosine ?", back: "Le pont actine-myosine reste figé (rigidité) — c'est le mécanisme de la rigidité cadavérique." },
];

function hashContent(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

type Strings = {
  headerLabel: string;
  loading: string;
  loadingHint: string;
  errorTitle: string;
  retry: string;
  tapToFlip: string;
  swipeHint: string;
  ratingAgain: string;
  ratingHard: string;
  ratingGood: string;
  ratingEasy: string;
  progressLabel: (i: number, total: number) => string;
  doneTitle: string;
  doneSub: (again: number, total: number) => string;
  reviewAgain: string;
  back: string;
  cardOf: (i: number, total: number) => string;
  allCaughtUpTitle: string;
  allCaughtUpSub: string;
  studyAnyway: string;
  previous: string;
  next: string;
};

const STRINGS: Record<'fr' | 'ar', Strings> = {
  fr: {
    headerLabel: 'FLASHCARDS',
    loading: 'Génération des flashcards…',
    loadingHint: 'Dr. Ahmed prépare tes cartes',
    errorTitle: 'Impossible de générer les flashcards',
    retry: 'Réessayer',
    tapToFlip: 'Touche la carte pour voir la réponse',
    swipeHint: '← glisse pour revoir · glisse pour valider →',
    ratingAgain: 'À revoir',
    ratingHard: 'Difficile',
    ratingGood: 'Bien',
    ratingEasy: 'Facile',
    progressLabel: (i, total) => `${i} / ${total}`,
    doneTitle: 'Session terminée !',
    doneSub: (again, total) => again > 0 ? `${again} carte${again > 1 ? 's' : ''} à revoir sur ${total}` : `${total} cartes revues — tout est acquis`,
    reviewAgain: 'Revoir les cartes difficiles',
    back: 'Retour au document',
    cardOf: (i, total) => `Carte ${i} sur ${total}`,
    allCaughtUpTitle: 'Tout est à jour',
    allCaughtUpSub: "Tu as déjà revu ces cartes aujourd'hui. La répétition espacée te les representera au bon moment.",
    studyAnyway: 'Réviser quand même',
    previous: 'Précédente',
    next: 'Suivante',
  },
  ar: {
    headerLabel: 'بطاقات تعلّم',
    loading: 'جارٍ إنشاء البطاقات…',
    loadingHint: 'الدكتور أحمد يجهّز بطاقاتك',
    errorTitle: 'تعذر إنشاء البطاقات',
    retry: 'إعادة المحاولة',
    tapToFlip: 'اضغط على البطاقة لرؤية الإجابة',
    swipeHint: '← اسحب للمراجعة · اسحب للتأكيد →',
    ratingAgain: 'أراجعها',
    ratingHard: 'صعبة',
    ratingGood: 'جيدة',
    ratingEasy: 'سهلة',
    progressLabel: (i, total) => `${i} / ${total}`,
    doneTitle: 'انتهت الجلسة!',
    doneSub: (again, total) => again > 0 ? `${again} بطاقة للمراجعة من أصل ${total}` : `${total} بطاقة تمت مراجعتها — كل شيء متقن`,
    reviewAgain: 'مراجعة البطاقات الصعبة',
    back: 'العودة إلى المستند',
    cardOf: (i, total) => `البطاقة ${i} من ${total}`,
    allCaughtUpTitle: 'كل شيء محدّث',
    allCaughtUpSub: 'راجعت هذه البطاقات اليوم بالفعل. التكرار المتباعد سيعيدها إليك في الوقت المناسب.',
    studyAnyway: 'المراجعة رغم ذلك',
    previous: 'السابقة',
    next: 'التالية',
  },
};

// Rampe monochrome (gris → teal → navy) pour le bilan de session — pas de rouge/orange générique.
const RATING_COLOR: Record<Rating, string> = {
  again: '#CBD5E0',
  hard:  '#9FD9CE',
  good:  TEAL,
  easy:  NAVY,
};
const RATING_LABEL: Record<Rating, (s: Strings) => string> = {
  again: (s) => s.ratingAgain,
  hard:  (s) => s.ratingHard,
  good:  (s) => s.ratingGood,
  easy:  (s) => s.ratingEasy,
};

export default function FlashcardScreen({ navigation, route }: any) {
  const { courseId } = route.params as { courseId: string };
  const {
    courses, activeCourse, studentClassName, studentFiliere, uiLanguage,
    flashcards, saveFlashcards, flashcardSRS, reviewFlashcard, resetFlashcardProgress,
    decrementQuota, syncQuota,
  } = useAppStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const rtl = uiLanguage === 'ar';
  const s = STRINGS[rtl ? 'ar' : 'fr'];
  const niveauEtudiant = studentClassName || 'P3';
  const filiere = (studentFiliere as 'medecine' | 'pharmacie') || 'medecine';

  const course = courses.find(c => c.id === courseId) ?? activeCourse;
  const courseSRS = flashcardSRS[courseId] ?? {};

  const [cards, setCards] = useState(flashcards[courseId] ?? []);
  const [loading, setLoading] = useState(cards.length === 0);
  const [error, setError] = useState('');
  const [deck, setDeck] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [againIdx, setAgainIdx] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState(false);
  const [forceStudy, setForceStudy] = useState(false);
  const [sessionStats, setSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  const flip = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);
  const swipeX = useRef(new Animated.Value(0)).current;

  useEffect(() => { load(); }, []);

  const buildDeck = (allCards: typeof cards, srs: typeof courseSRS, force: boolean) => {
    const indices = allCards.map((_, i) => i);
    const due = force ? indices : indices.filter(i => isDue(srs[i]));
    setDeck(due);
    setPos(0);
    setAgainIdx(new Set());
    setFinished(false);
    setSessionStats({ again: 0, hard: 0, good: 0, easy: 0 });
  };

  const load = async () => {
    setLoading(true); setError('');

    if (USE_MOCK_DATA) {
      setCards(MOCK_CARDS);
      buildDeck(MOCK_CARDS, flashcardSRS[courseId] ?? {}, false);
      setLoading(false);
      return;
    }

    if (!course) { setError(s.errorTitle); setLoading(false); return; }

    const currentHash = hashContent(course.content);

    const cached = flashcards[courseId];
    if (cached && cached.length > 0) {
      setCards(cached);
      buildDeck(cached, flashcardSRS[courseId] ?? {}, false);
      setLoading(false);
      return;
    }

    try {
      const { data } = await supabase
        .from('documents').select('flashcards, flashcards_hash').eq('id', courseId).maybeSingle();
      if (data?.flashcards) {
        const parsed = JSON.parse(data.flashcards);
        if (Array.isArray(parsed) && parsed.length > 0) {
          saveFlashcards(courseId, parsed, data.flashcards_hash || currentHash);
          setCards(parsed);
          buildDeck(parsed, flashcardSRS[courseId] ?? {}, false);
          setLoading(false);
          return;
        }
      }
    } catch {}

    const net = await NetInfo.fetch();
    if (!net.isConnected) { setError(s.errorTitle); setLoading(false); return; }

    try {
      const result = await generateFlashcards(course.content, course.name, niveauEtudiant, filiere);
      decrementQuota();
      saveFlashcards(courseId, result, currentHash);
      setCards(result);
      buildDeck(result, {}, false);
      supabase.from('documents')
        .update({ flashcards: JSON.stringify(result), flashcards_hash: currentHash, updated_at: new Date().toISOString() })
        .eq('id', courseId)
        .then(({ error: e }) => { if (e) console.log('[Flashcards] sauvegarde Supabase échouée:', e.message); });
    } catch (e: any) {
      if (e?.isQuotaExceeded) syncQuota();
      setError(e?.message || s.errorTitle);
    }
    setLoading(false);
  };

  const doFlip = () => {
    Animated.spring(flip, {
      toValue: flipped ? 0 : 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
    }).start();
    setFlipped(!flipped);
  };

  const advance = () => {
    if (pos + 1 >= deck.length) { setFinished(true); return; }
    flip.setValue(0);
    swipeX.setValue(0);
    setFlipped(false);
    setPos(pos + 1);
  };

  const rate = (rating: Rating) => {
    const cardIdx = deck[pos];
    reviewFlashcard(courseId, cardIdx, rating);
    if (rating === 'again') setAgainIdx(prev => new Set(prev).add(cardIdx));
    setSessionStats(prev => ({ ...prev, [rating]: prev[rating] + 1 }));
    advance();
  };

  // Parcourir librement les cartes sans les noter — répond à "je veux juste voir les autres questions"
  const goNext = () => {
    if (pos + 1 >= deck.length) return;
    flip.setValue(0);
    swipeX.setValue(0);
    setFlipped(false);
    setPos(pos + 1);
  };
  const goPrev = () => {
    if (pos === 0) return;
    flip.setValue(0);
    swipeX.setValue(0);
    setFlipped(false);
    setPos(pos - 1);
  };

  // Petite invite visuelle : la carte se balance légèrement à son arrivée pour
  // signaler qu'elle est interactive (tap pour retourner).
  const nudge = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (loading || finished || !deck.length) return;
    nudge.setValue(0);
    Animated.sequence([
      Animated.timing(nudge, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(nudge, { toValue: -1, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(nudge, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [pos, loading, finished, deck.length]);
  const nudgeRotate = nudge.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-2.5deg', '0deg', '2.5deg'] });

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: swipeX } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (e: any) => {
    if (e.nativeEvent.oldState !== GestureState.ACTIVE) return;
    const dx = e.nativeEvent.translationX;
    if (!flipped) { Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start(); return; }

    if (dx > SWIPE_THRESHOLD) {
      Animated.timing(swipeX, { toValue: 500, duration: 220, useNativeDriver: true }).start(() => rate('good'));
    } else if (dx < -SWIPE_THRESHOLD) {
      Animated.timing(swipeX, { toValue: -500, duration: 220, useNativeDriver: true }).start(() => rate('again'));
    } else {
      Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, bounciness: 10 }).start();
    }
  };

  const reviewAgainCards = () => {
    if (againIdx.size === 0) return;
    setDeck([...againIdx]);
    setPos(0);
    setAgainIdx(new Set());
    setFinished(false);
    flip.setValue(0);
    swipeX.setValue(0);
    setFlipped(false);
  };

  const studyAnyway = () => {
    setForceStudy(true);
    buildDeck(cards, courseSRS, true);
  };

  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate  = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const rotateZ = swipeX.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-8deg', '0deg', '8deg'] });

  const currentCard = deck.length > 0 ? cards[deck[pos]] : undefined;
  const masteredCount = cards.filter((_, i) => isMastered(courseSRS[i])).length;

  return (
    <View style={[styles.root, { backgroundColor: TEAL_BG }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={[styles.headerRow, rtl && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity
            style={[styles.backBtn, rtl ? { marginLeft: 12, marginRight: 0 } : { marginRight: 12 }]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={rtl ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerSub, rtl && styles.textRight]}>{s.headerLabel}</Text>
            <Text style={[styles.headerTitle, rtl && styles.textRight]} numberOfLines={1}>{course?.name ?? (USE_MOCK_DATA ? 'Physiologie — Muscle (démo)' : '')}</Text>
          </View>
          {!loading && !error && !finished && deck.length > 0 && (
            <View style={styles.progressBadge}>
              <Text style={styles.progressBadgeText}>{s.progressLabel(pos + 1, deck.length)}</Text>
            </View>
          )}
        </View>
        {!loading && !error && !finished && deck.length > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(pos / deck.length) * 100}%` }]} />
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <View style={styles.loadingIconWrap}>
            <Ionicons name="albums-outline" size={30} color={TEAL} />
          </View>
          <Text style={[styles.loadingTitle, { color: NAVY }]}>{s.loading}</Text>
          <Text style={styles.loadingHint}>{s.loadingHint}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: '#DC2626' }, rtl && styles.textRight]}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>{s.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : cards.length > 0 && deck.length === 0 && !finished ? (
        <View style={[styles.center, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={[styles.doneTitle, { color: NAVY }]}>{s.allCaughtUpTitle}</Text>
          <Text style={styles.doneSub}>{s.allCaughtUpSub}</Text>
          <View style={[styles.doneActions, { marginTop: 24, paddingTop: 0 }]}>
            <TouchableOpacity style={styles.doneBtnOutline} onPress={studyAnyway}>
              <Text style={styles.doneBtnOutlineText}>{s.studyAnyway}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtnGhost} onPress={() => navigation.goBack()}>
              <Text style={styles.doneBtnGhostText}>{s.back}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : finished ? (
        <View style={styles.doneScreen}>
          <View style={styles.doneHero}>
            <View style={styles.doneHeroHalo1} />
            <View style={styles.doneHeroHalo2} />
            <View style={[styles.doneBadge, { backgroundColor: againIdx.size === 0 ? '#FFF7E0' : TEAL_BG }]}>
              <Text style={styles.doneEmoji}>{againIdx.size === 0 ? '🏆' : '📚'}</Text>
            </View>
            <Text style={[styles.doneTitle, { color: NAVY }]}>{s.doneTitle}</Text>
            <Text style={styles.doneSub}>{s.doneSub(againIdx.size, deck.length)}</Text>
          </View>

          <View style={styles.statsCard}>
            <View style={styles.statsBar}>
              {(['again', 'hard', 'good', 'easy'] as const).map(k => (
                sessionStats[k] > 0 && (
                  <View key={k} style={[styles.statsBarSeg, { flex: sessionStats[k], backgroundColor: RATING_COLOR[k] }]} />
                )
              ))}
            </View>
            <View style={styles.statsGrid}>
              {(['again', 'hard', 'good', 'easy'] as const).map(k => (
                <View key={k} style={styles.statsTile}>
                  <View style={styles.statsTileTop}>
                    <View style={[styles.statsDot, { backgroundColor: RATING_COLOR[k] }]} />
                    <Text style={styles.statsTileNum}>{sessionStats[k]}</Text>
                  </View>
                  <Text style={styles.statsTileLabel}>{RATING_LABEL[k](s)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.doneActions}>
            {againIdx.size > 0 && (
              <TouchableOpacity style={styles.doneBtnPrimary} onPress={reviewAgainCards}>
                <Text style={styles.doneBtnPrimaryText}>{s.reviewAgain}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.doneBtnGhost} onPress={() => navigation.goBack()}>
              <Text style={styles.doneBtnGhostText}>{s.back}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : currentCard ? (
        <View style={styles.deckArea}>
          <View style={styles.cardOfPill}>
            <Text style={styles.cardOfLabel}>{s.cardOf(pos + 1, deck.length)}</Text>
          </View>

          <View style={styles.cardWrap}>
            <View pointerEvents="none" style={styles.bgBlob1} />

            <PanGestureHandler
              onGestureEvent={onGestureEvent}
              onHandlerStateChange={onHandlerStateChange}
              enabled={flipped}
              activeOffsetX={[-12, 12]}
            >
              <Animated.View
                style={[
                  styles.cardStage,
                  { transform: [{ translateX: swipeX }, { rotateZ }, { rotate: nudgeRotate }] },
                ]}
              >
                <TouchableOpacity activeOpacity={0.92} onPress={doFlip} style={{ flex: 1 }}>
                  <Animated.View
                    style={[
                      styles.card, styles.cardFront,
                      { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] },
                    ]}
                  >
                    <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
                    <LinearGradient
                      colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.08)']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text style={[styles.cardFrontText, rtl && styles.textRight]}>{currentCard.front}</Text>
                    <Text style={styles.tapHint}>{s.tapToFlip}</Text>
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.card, styles.cardBack,
                      { transform: [{ perspective: 1200 }, { rotateY: backRotate }] },
                    ]}
                  >
                    <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                    <LinearGradient
                      colors={['rgba(7,169,151,0.4)', 'rgba(11,30,52,0.7)']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.cardHaloBack} />
                    <Ionicons name="checkmark-circle-outline" size={22} color="#fff" style={styles.cardIcon} />
                    <Text style={[styles.cardBackText, rtl && styles.textRight]}>{currentCard.back}</Text>
                    <Text style={styles.swipeHint}>{s.swipeHint}</Text>
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
            </PanGestureHandler>
          </View>

          <View style={[styles.browseRow, rtl && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              onPress={goPrev}
              disabled={pos === 0}
              activeOpacity={0.8}
              style={[styles.browseBtn, pos === 0 && styles.browseBtnDisabled]}
            >
              <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={16} color={pos === 0 ? '#B8C4CE' : TEAL} />
              <Text style={[styles.browseBtnText, pos === 0 && styles.browseBtnTextDisabled]}>{s.previous}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goNext}
              disabled={pos + 1 >= deck.length}
              activeOpacity={0.8}
              style={[styles.browseBtn, pos + 1 >= deck.length && styles.browseBtnDisabled]}
            >
              <Text style={[styles.browseBtnText, pos + 1 >= deck.length && styles.browseBtnTextDisabled]}>{s.next}</Text>
              <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color={pos + 1 >= deck.length ? '#B8C4CE' : TEAL} />
            </TouchableOpacity>
          </View>

          {flipped && (
            <View style={styles.ratingRow}>
              <TouchableOpacity style={styles.ratingBtnNeutral} onPress={() => rate('again')} activeOpacity={0.8}>
                <Text style={styles.ratingBtnNeutralText}>{s.ratingAgain}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ratingBtnNeutral} onPress={() => rate('hard')} activeOpacity={0.8}>
                <Text style={styles.ratingBtnNeutralText}>{s.ratingHard}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ratingBtnPrimary} onPress={() => rate('good')} activeOpacity={0.88}>
                <Text style={styles.ratingBtnPrimaryText}>{s.ratingGood}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ratingBtnNeutral} onPress={() => rate('easy')} activeOpacity={0.8}>
                <Text style={styles.ratingBtnNeutralText}>{s.ratingEasy}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  textRight: { textAlign: 'right', writingDirection: 'rtl' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  header: {
    backgroundColor: NAVY,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 16,
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
  progressBadge: {
    backgroundColor: 'rgba(7,169,151,0.22)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  progressBadgeText: { fontSize: 12, fontWeight: '700', color: TEAL },
  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden', marginTop: 14,
  },
  progressFill: { height: 4, backgroundColor: TEAL, borderRadius: 2 },

  loadingIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  loadingTitle: { fontFamily: SERIF, fontSize: 17, textAlign: 'center', marginBottom: 6 },
  loadingHint: { fontSize: 13, color: '#5B7184', textAlign: 'center' },

  errorText: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  retryBtn: { backgroundColor: NAVY, borderRadius: Radius.md, paddingHorizontal: 22, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  deckArea: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, alignItems: 'center' },
  cardOfPill: {
    backgroundColor: NAVY, borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 7,
    marginBottom: 16,
    zIndex: 10,
  },
  cardOfLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: '#fff' },
  cardWrap: { width: '100%', position: 'relative' },
  cardStage: { width: '100%', height: 340 },
  bgBlob1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#07A997', opacity: 0.55, top: -14, left: -30,
  },
  browseRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    width: '100%', marginTop: 16,
  },
  browseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: TEAL_BG, borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 9,
    ...Platform.select({
      ios:     { shadowColor: TEAL, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  browseBtnDisabled: { backgroundColor: '#F1F5F9', shadowOpacity: 0, elevation: 0 },
  browseBtnText: { fontSize: 12.5, fontWeight: '700', color: TEAL },
  browseBtnTextDisabled: { color: '#B8C4CE' },
  card: {
    position: 'absolute',
    width: '100%', height: '100%',
    borderRadius: 28,
    padding: 26,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.24, shadowRadius: 28 },
      android: { elevation: 10 },
    }),
  },
  cardFront: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(11,30,52,0.55)',
  },
  cardBack: {
    backgroundColor: 'rgba(11,30,52,0.4)',
    justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(7,169,151,0.35)',
  },
  cardHaloBack: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(7,169,151,0.12)', bottom: -70, left: -60,
  },
  cardIcon: { marginBottom: 14 },
  cardFrontText: { fontFamily: SERIF, fontSize: 22, lineHeight: 30, color: NAVY },
  cardBackText: { fontSize: 16, lineHeight: 24, color: '#fff' },
  tapHint: { position: 'absolute', bottom: 20, left: 26, right: 26, fontSize: 12, fontWeight: '600', color: '#5B7184', textAlign: 'center' },
  swipeHint: { position: 'absolute', bottom: 20, left: 26, right: 26, fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },

  ratingRow: { flexDirection: 'row', gap: 8, marginTop: 24, width: '100%' },
  ratingBtnNeutral: {
    flex: 1, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(11,30,52,0.12)',
  },
  ratingBtnNeutralText: { fontWeight: '600', fontSize: 12.5, color: '#5B7184' },
  ratingBtnPrimary: {
    flex: 1.15, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center',
    backgroundColor: TEAL,
    ...Platform.select({
      ios:     { shadowColor: TEAL, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  ratingBtnPrimaryText: { fontWeight: '700', fontSize: 12.5, color: '#fff' },

  doneScreen: {
    flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28,
  },
  doneHero: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 26,
    paddingVertical: 36, paddingHorizontal: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(11,30,52,0.05)',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 18 },
      android: { elevation: 1 },
    }),
  },
  doneHeroHalo1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(7,169,151,0.08)', top: -90, right: -70,
  },
  doneHeroHalo2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(11,30,52,0.04)', bottom: -50, left: -40,
  },
  doneBadge: {
    width: 92, height: 92, borderRadius: 46,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  doneEmoji: { fontSize: 44 },
  doneTitle: { fontFamily: SERIF, fontSize: 25, marginBottom: 6, textAlign: 'center' },
  doneSub: { fontSize: 14, color: '#5B7184', textAlign: 'center' },

  statsCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20,
    borderWidth: 1, borderColor: 'rgba(11,30,52,0.06)',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16 },
      android: { elevation: 2 },
    }),
  },
  statsBar: {
    flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: '#F1F5F9', marginBottom: 20,
  },
  statsBarSeg: { height: '100%' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statsTile: { alignItems: 'center', flex: 1 },
  statsTileTop: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  statsDot: { width: 8, height: 8, borderRadius: 4 },
  statsTileNum: { fontFamily: SERIF, fontSize: 20, color: NAVY },
  statsTileLabel: { fontSize: 10.5, color: '#94A3B8', fontWeight: '600', textAlign: 'center' },

  doneActions: { width: '100%', gap: 10, marginTop: 'auto' as any, paddingTop: 24 },
  doneBtnPrimary: { backgroundColor: NAVY, borderRadius: Radius.lg, paddingVertical: 15, alignItems: 'center' },
  doneBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  doneBtnOutline: { borderRadius: Radius.lg, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: TEAL },
  doneBtnOutlineText: { color: TEAL, fontWeight: '700', fontSize: 14 },
  doneBtnGhost: { paddingVertical: 10, alignItems: 'center' },
  doneBtnGhostText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
});
