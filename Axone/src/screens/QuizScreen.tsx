import React, { useEffect, useState, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, Alert,
  TouchableOpacity, ActivityIndicator, StatusBar, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { Spacing, Radius } from '../theme';
import { useTheme, Text } from '../components';
import { generateChapterQCM, QCMQuestion } from '../utils/rag';

const NAVY = '#0B1E34';
const TEAL = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

type Phase = 'loading' | 'answering' | 'results';
type LetterKey = 'A' | 'B' | 'C' | 'D' | 'E';
type QCMResult = 'COMPLET' | 'PARTIEL' | 'FAUX';

type AnswerState = {
  selected: LetterKey[];
  result?: QCMResult;
  points?: number;
};

const LETTERS: LetterKey[] = ['A', 'B', 'C', 'D', 'E'];

type QuizStrings = {
  loading: string;
  headerLabel: string;
  abandonTitle: string;
  abandonMsg: string;
  abandonContinue: string;
  abandonConfirm: string;
  contentTooShort: string;
  genError: string;
  retry: string;
  intro: string;
  submit: string;
  scoreExcellent: string;
  scoreGood: string;
  scoreBad: string;
  masteryTitle: string;
  redoQuiz: string;
  continueStudying: string;
  back: string;
  questionPrefix: string;
};

const STRINGS: Record<'fr' | 'ar', QuizStrings> = {
  fr: {
    loading: 'Génération des QCM en cours…',
    headerLabel: 'QCM',
    abandonTitle: 'Abandonner le quiz ?',
    abandonMsg: 'Tes réponses seront perdues.',
    abandonContinue: 'Continuer',
    abandonConfirm: 'Abandonner',
    contentTooShort: 'Contenu du document trop court pour générer un QCM. Re-uploade le PDF.',
    genError: 'Impossible de générer les QCM. Vérifie ta connexion.',
    retry: 'Réessayer',
    intro: 'Sélectionne une ou plusieurs bonnes réponses par question.',
    submit: 'Valider mes réponses',
    scoreExcellent: 'Excellent travail !',
    scoreGood: 'Continue comme ça !',
    scoreBad: 'Reviens sur ce document !',
    masteryTitle: 'Progression sur ce document',
    redoQuiz: 'Refaire le quiz',
    continueStudying: 'Continuer à étudier →',
    back: 'Retour',
    questionPrefix: 'Q',
  },
  ar: {
    loading: 'جارٍ إنشاء الأسئلة…',
    headerLabel: 'أسئلة',
    abandonTitle: 'إنهاء الاختبار؟',
    abandonMsg: 'ستفقد إجاباتك.',
    abandonContinue: 'متابعة',
    abandonConfirm: 'إنهاء',
    contentTooShort: 'محتوى المستند قصير جداً لإنشاء أسئلة. أعد رفع ملف PDF.',
    genError: 'تعذر إنشاء الأسئلة. تحقق من اتصالك.',
    retry: 'إعادة المحاولة',
    intro: 'اختر إجابة صحيحة واحدة أو أكثر لكل سؤال.',
    submit: 'تأكيد إجاباتي',
    scoreExcellent: 'عمل ممتاز!',
    scoreGood: 'واصل هكذا!',
    scoreBad: 'راجع هذا المستند مجدداً!',
    masteryTitle: 'التقدّم في هذا المستند',
    redoQuiz: 'إعادة الاختبار',
    continueStudying: '← تابع الدراسة',
    back: 'رجوع',
    questionPrefix: 'س',
  },
};

function scoreQCM(
  selected: LetterKey[],
  bonnesReponses: LetterKey[]
): { result: QCMResult; points: number } {
  if (selected.length === 0) return { result: 'FAUX', points: 0 };
  const selSet = new Set(selected);
  const isExact =
    selSet.size === bonnesReponses.length &&
    bonnesReponses.every(b => selSet.has(b));
  if (isExact) return { result: 'COMPLET', points: 10 };
  if (bonnesReponses.some(b => selSet.has(b))) return { result: 'PARTIEL', points: 5 };
  return { result: 'FAUX', points: 0 };
}

export default function QuizScreen({ navigation, route }: any) {
  const { courseId } = route.params as { courseId: string };

  const { courses, activeCourse, chapterMastery, updateChapterMastery, addXP, niveau, studentFiliere, uiLanguage } = useAppStore();
  const filiere = (studentFiliere as 'medecine' | 'pharmacie') || 'medecine';
  const rtl = uiLanguage === 'ar';
  const s = STRINGS[rtl ? 'ar' : 'fr'];
  const t = useTheme();
  const { top } = useSafeAreaInsets();

  // QCM généré sur le document entier (plus de découpage par chapitre)
  const course     = courses.find(c => c.id === courseId) ?? activeCourse;
  const curMastery = chapterMastery[courseId]?.[0] ?? 0;

  const [phase, setPhase]             = useState<Phase>('loading');
  const [questions, setQuestions]     = useState<QCMQuestion[]>([]);
  const [answers, setAnswers]         = useState<AnswerState[]>([]);
  const [error, setError]             = useState('');
  const [quizAttempt, setQuizAttempt] = useState(0);
  const [finalScore, setFinalScore]   = useState(0);
  const [preQuizMastery, setPreQuizMastery] = useState(0);

  useEffect(() => {
    setPhase('loading');
    setQuestions([]);
    setAnswers([]);
    setFinalScore(0);
    setError('');

    if (!course || !course.content || course.content.trim().length < 100) {
      setError(s.contentTooShort);
      setPhase('answering');
      return;
    }

    generateChapterQCM(course.content, course.name, niveau, filiere)
      .then(qs => {
        setQuestions(qs);
        setAnswers(qs.map(() => ({ selected: [] })));
        setPhase('answering');
      })
      .catch((err: Error) => {
        setError(err.message ?? s.genError);
        setPhase('answering');
      });
  }, [quizAttempt]);

  const toggleProposition = useCallback((qIdx: number, letter: LetterKey) => {
    setAnswers(prev => prev.map((a, i) => {
      if (i !== qIdx) return a;
      const already = a.selected.includes(letter);
      return {
        ...a,
        selected: already
          ? a.selected.filter(l => l !== letter)
          : [...a.selected, letter],
      };
    }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!course) return;
    const masteryBefore = chapterMastery[courseId]?.[0] ?? 0;
    setPreQuizMastery(masteryBefore);

    const scored = answers.map((a, i) => ({
      ...a,
      ...scoreQCM(a.selected, questions[i].bonnesReponses),
    }));
    setAnswers(scored);

    const totalPoints = scored.reduce((sum, a) => sum + (a.points ?? 0), 0);
    const maxPoints   = questions.length * 10;
    const ratio       = maxPoints > 0 ? totalPoints / maxPoints : 0;
    const masteryGain = Math.round(ratio * 40);

    updateChapterMastery(courseId, 0, masteryGain);
    addXP(masteryGain);

    setFinalScore(Math.round(ratio * 100));
    setPhase('results');
  }, [answers, questions, courseId, course, chapterMastery, updateChapterMastery, addXP]);

  const restartQuiz = useCallback(() => setQuizAttempt(prev => prev + 1), []);

  const canSubmit = answers.length > 0 && answers.every(a => a.selected.length > 0);

  if (phase === 'loading') {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: t.bg, paddingTop: top }]}>
        <ActivityIndicator color={TEAL} size="large" />
        <Text style={[styles.loadingText, { color: TEAL }]}>
          {s.loading}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: top + 12, backgroundColor: NAVY }, rtl && { flexDirection: 'row-reverse' }]}>
        <TouchableOpacity
          style={[styles.backBtn, rtl && { marginRight: 0, marginLeft: 12 }]}
          onPress={() => {
            if (phase === 'answering' && answers.some(a => a.selected.length > 0)) {
              Alert.alert(
                s.abandonTitle,
                s.abandonMsg,
                [
                  { text: s.abandonContinue, style: 'cancel' },
                  { text: s.abandonConfirm, style: 'destructive', onPress: () => navigation.goBack() },
                ]
              );
            } else {
              navigation.goBack();
            }
          }}
        >
          <Ionicons name={rtl ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSub, rtl && styles.textRight]}>{s.headerLabel}</Text>
          <Text style={[styles.headerTitle, rtl && styles.textRight]} numberOfLines={1}>{course?.name ?? ''}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* ── Phase : réponse ────────────────────────────────────────────── */}
        {phase === 'answering' && (
          <>
            {error ? (
              <View style={[styles.errorBox, { backgroundColor: '#FEF2F2' }]}>
                <Text style={[styles.errorText, { color: '#DC2626' }, rtl && styles.textRight]}>{error}</Text>
                <TouchableOpacity style={[styles.retryBtn, rtl && { alignSelf: 'flex-end' }]} onPress={restartQuiz}>
                  <Text style={styles.retryBtnText}>{s.retry}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[styles.intro, { color: t.textMuted }, rtl && styles.textRight]}>
                  {s.intro}
                </Text>

                {questions.map((q, qIdx) => (
                  <View key={qIdx} style={[styles.questionBlock, { backgroundColor: t.surface, borderColor: t.border }]}>
                    <View style={[styles.qHeader, rtl && { flexDirection: 'row-reverse' }]}>
                      <View style={[styles.qNumBadge, { backgroundColor: TEAL }]}>
                        <Text style={styles.qNum}>{qIdx + 1}</Text>
                      </View>
                      <Text style={[styles.qText, { color: t.text }, rtl && styles.textRight]}>{q.question}</Text>
                    </View>

                    {LETTERS.map(letter => {
                      const isSelected = answers[qIdx]?.selected.includes(letter) ?? false;
                      return (
                        <TouchableOpacity
                          key={letter}
                          style={[
                            styles.propositionBtn,
                            { borderColor: t.border, backgroundColor: t.bg },
                            isSelected && {
                              backgroundColor: TEAL_BG,
                              borderColor: TEAL,
                            },
                            rtl && { flexDirection: 'row-reverse' },
                          ]}
                          onPress={() => toggleProposition(qIdx, letter)}
                          activeOpacity={0.7}
                        >
                          <View style={[
                            styles.letterBadge,
                            { backgroundColor: t.surfaceAlt },
                            isSelected && { backgroundColor: TEAL },
                          ]}>
                            <Text style={[styles.letterText, { color: t.textMuted }, isSelected && { color: '#fff' }]}>
                              {letter}
                            </Text>
                          </View>
                          <Text style={[
                            styles.propositionText,
                            { color: t.textMuted },
                            isSelected && { color: t.text },
                            rtl && styles.textRight,
                          ]}>
                            {q.propositions[letter]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: NAVY },
                    !canSubmit && { opacity: 0.4 },
                  ]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                >
                  <Text style={styles.submitBtnText}>{s.submit}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* ── Phase : résultats ──────────────────────────────────────────── */}
        {phase === 'results' && (
          <>
            <ScoreHeader score={finalScore} textColor={t.text} mutedColor={t.textMuted} s={s} />

            {questions.map((q, qIdx) => (
              <ResultCard
                key={qIdx}
                idx={qIdx}
                question={q.question}
                propositions={q.propositions}
                bonnesReponses={q.bonnesReponses}
                selected={answers[qIdx]?.selected ?? []}
                explication={q.explication}
                result={answers[qIdx]?.result ?? 'FAUX'}
                surface={t.surface}
                border={t.border}
                text={t.text}
                rtl={rtl}
                questionPrefix={s.questionPrefix}
              />
            ))}

            <MasteryUpdate
              oldMastery={preQuizMastery}
              newMastery={Math.min(100, preQuizMastery + Math.round(finalScore / 100 * 40))}
              surface={t.surface}
              border={t.border}
              textMuted={t.textMuted}
              title={s.masteryTitle}
              rtl={rtl}
            />

            <View style={styles.resultActions}>
              {curMastery < 70 && (
                <TouchableOpacity
                  style={[styles.resultBtn, { backgroundColor: NAVY }]}
                  onPress={restartQuiz}
                >
                  <Text style={styles.resultBtnText}>{s.redoQuiz}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.resultBtnOutline, { borderColor: TEAL }]}
                onPress={() => navigation.getParent()?.navigate('Chat')}
              >
                <Text style={[styles.resultBtnOutlineText, { color: TEAL }]}>
                  {s.continueStudying}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultBtnOutline, { borderColor: t.border }]}
                onPress={() => navigation.goBack()}
              >
                <Text style={[styles.resultBtnOutlineText, { color: t.textMuted }]}>
                  {s.back}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ── Score header ──────────────────────────────────────────────────────────────

function ScoreHeader({ score, textColor, mutedColor, s }: { score: number; textColor: string; mutedColor: string; s: QuizStrings }) {
  const emoji = score >= 80 ? '🏆' : score >= 50 ? '📖' : '💪';
  const msg   =
    score >= 80 ? s.scoreExcellent :
    score >= 50 ? s.scoreGood :
    s.scoreBad;

  return (
    <View style={styles.scoreHeader}>
      <Text style={styles.scoreEmoji}>{emoji}</Text>
      <Text style={[styles.scoreNum, { color: NAVY }]}>{score}%</Text>
      <Text style={[styles.scoreMsg, { color: mutedColor }]}>{msg}</Text>
    </View>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({
  idx, question, propositions, bonnesReponses, selected, explication, result, surface, border, text, rtl, questionPrefix,
}: {
  idx: number;
  question: string;
  propositions: QCMQuestion['propositions'];
  bonnesReponses: LetterKey[];
  selected: LetterKey[];
  explication: QCMQuestion['explication'];
  result: QCMResult;
  surface: string;
  border: string;
  text: string;
  rtl: boolean;
  questionPrefix: string;
}) {
  const headerColor =
    result === 'COMPLET' ? '#22C55E' :
    result === 'PARTIEL' ? '#F59E0B' :
    '#EF4444';
  const headerIcon =
    result === 'COMPLET' ? '✅' :
    result === 'PARTIEL' ? '🔶' :
    '❌';

  return (
    <View style={[
      styles.resultCard,
      { backgroundColor: surface, borderColor: border },
      rtl ? { borderRightColor: headerColor, borderRightWidth: 4 } : { borderLeftColor: headerColor },
    ]}>
      <View style={[styles.resultCardTop, rtl && { flexDirection: 'row-reverse' }]}>
        <Text style={styles.resultCardIcon}>{headerIcon}</Text>
        <Text style={[styles.resultCardQ, { color: text }, rtl && styles.textRight]}>{questionPrefix}{idx + 1} · {question}</Text>
      </View>

      {LETTERS.map(letter => {
        const isCorrect  = bonnesReponses.includes(letter);
        const isSelected = selected.includes(letter);
        const isNeutral  = !isCorrect && !isSelected;

        const color =
          isCorrect && isSelected  ? '#22C55E' :
          isCorrect && !isSelected ? '#F59E0B' :
          !isCorrect && isSelected ? '#EF4444' :
          '#9CA3AF';
        const icon =
          isCorrect && isSelected  ? '✅' :
          isCorrect && !isSelected ? '🔶' :
          !isCorrect && isSelected ? '❌' :
          '○';

        return (
          <View
            key={letter}
            style={[
              styles.propResult,
              {
                borderColor:     isNeutral ? border : color + '50',
                backgroundColor: isNeutral ? 'transparent' : color + '12',
              },
            ]}
          >
            <View style={[styles.propResultRow, rtl && { flexDirection: 'row-reverse' }]}>
              <Text style={styles.propIcon}>{icon}</Text>
              <View style={[styles.letterBadgeSmall, { backgroundColor: isNeutral ? '#9CA3AF' : color }]}>
                <Text style={styles.letterTextSmall}>{letter}</Text>
              </View>
              <Text style={[styles.propText, { color: isNeutral ? '#9CA3AF' : text }, rtl && styles.textRight]}>
                {propositions[letter]}
              </Text>
            </View>
            <Text style={[
              styles.propExplication,
              { color: isNeutral ? '#9CA3AF' : color },
              rtl ? { marginRight: 28, marginLeft: 0, textAlign: 'right', writingDirection: 'rtl' } : null,
            ]}>
              {explication[letter]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Mastery update ────────────────────────────────────────────────────────────

function MasteryUpdate({ oldMastery, newMastery, surface, border, textMuted, title, rtl }: {
  oldMastery: number; newMastery: number; surface: string; border: string; textMuted: string; title: string; rtl: boolean;
}) {
  const gain = newMastery - oldMastery;
  return (
    <View style={[styles.masteryUpdate, { backgroundColor: surface, borderColor: border }]}>
      <Text style={[styles.masteryUpdateTitle, { color: textMuted }, rtl && styles.textRight]}>{title}</Text>
      <View style={[styles.masteryBarWrap, rtl && { flexDirection: 'row-reverse' }]}>
        <View style={[styles.masteryFillOld, { width: `${oldMastery}%` as any }]} />
        <View style={[styles.masteryFillNew, { width: `${gain}%` as any, backgroundColor: TEAL }]} />
      </View>
      <View style={[styles.masteryNums, rtl && { flexDirection: 'row-reverse' }]}>
        <Text style={[styles.masteryOldNum, { color: textMuted }]}>{oldMastery}%</Text>
        {gain > 0 && <Text style={[styles.masteryGain, { color: TEAL }]}>+{gain}%</Text>}
        <Text style={[styles.masteryNewNum, { color: TEAL }]}>{newMastery}%</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },

  textRight: { textAlign: 'right', writingDirection: 'rtl' },

  loadingText: { marginTop: Spacing.lg, fontSize: 15, fontWeight: '600' },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  headerSub:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { fontFamily: SERIF, fontSize: 17, color: '#fff', marginTop: 2 },

  /* Body */
  body: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },

  /* Error */
  errorBox: {
    borderRadius: Radius.md,
    padding: Spacing.lg, marginBottom: Spacing.xl,
  },
  errorText: { fontSize: 13, lineHeight: 20, marginBottom: Spacing.md },
  retryBtn: {
    backgroundColor: '#DC2626', borderRadius: Radius.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    alignSelf: 'flex-start',
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  /* Intro */
  intro: { fontSize: 13, lineHeight: 20, marginBottom: Spacing.xl },

  /* Question block */
  questionBlock: {
    borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1,
  },
  qHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: Spacing.lg },
  qNumBadge: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0,
  },
  qNum:  { fontSize: 12, fontWeight: '800', color: '#fff' },
  qText: { fontSize: 14, fontWeight: '700', flex: 1, lineHeight: 21 },

  /* Proposition button (phase answering) */
  propositionBtn: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 10, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md, marginBottom: 8,
    borderWidth: 1.5,
  },
  letterBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  letterText:      { fontSize: 12, fontWeight: '800' },
  propositionText: { fontSize: 13, flex: 1, lineHeight: 20 },

  /* Submit */
  submitBtn: {
    borderRadius: Radius.lg, padding: Spacing.lg,
    alignItems: 'center', marginTop: Spacing.md,
  },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  /* Score header */
  scoreHeader:  { alignItems: 'center', paddingVertical: Spacing.xxxl },
  scoreEmoji:   { fontSize: 52, marginBottom: Spacing.md },
  scoreNum:     { fontFamily: SERIF, fontSize: 42, marginBottom: Spacing.sm },
  scoreMsg:     { fontSize: 16, fontWeight: '600' },

  /* Result card */
  resultCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.lg,
    borderWidth: 1, borderLeftWidth: 4,
  },
  resultCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: Spacing.lg },
  resultCardIcon: { fontSize: 16, marginTop: 2 },
  resultCardQ:    { fontSize: 13, fontWeight: '700', flex: 1, lineHeight: 20 },

  /* Proposition row (phase results) */
  propResult: {
    borderRadius: Radius.sm, borderWidth: 1,
    padding: Spacing.sm, marginBottom: 8,
  },
  propResultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  propIcon:      { fontSize: 13, marginTop: 2, flexShrink: 0 },
  letterBadgeSmall: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  letterTextSmall: { fontSize: 10, fontWeight: '800', color: '#fff' },
  propText:        { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 18 },
  propExplication: { fontSize: 11, lineHeight: 17, marginLeft: 28, fontStyle: 'italic' },

  /* Mastery update */
  masteryUpdate: {
    borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1,
  },
  masteryUpdateTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: Spacing.md },
  masteryBarWrap: {
    height: 10, borderRadius: 5, backgroundColor: '#E5E7EB',
    overflow: 'hidden', flexDirection: 'row',
  },
  masteryFillOld: { height: 10, backgroundColor: '#CBD5E1' },
  masteryFillNew: { height: 10 },
  masteryNums:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  masteryOldNum:  { fontSize: 12, fontWeight: '600' },
  masteryGain:    { fontSize: 12, fontWeight: '800' },
  masteryNewNum:  { fontSize: 13, fontWeight: '800' },

  /* Result actions */
  resultActions: { gap: Spacing.md, marginTop: Spacing.xl },
  resultBtn: { borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center' },
  resultBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  resultBtnOutline: {
    borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center',
    borderWidth: 1.5, backgroundColor: 'transparent',
  },
  resultBtnOutlineText: { fontSize: 15, fontWeight: '700' },
});
