import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Alert,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store';
import { Colors, Spacing, Radius } from '../theme';
import { getSubjectStyle } from '../utils/subjectStyles';
import { generateChapterQuiz, gradeQuizAnswer, QuizQuestion, GradeResult } from '../utils/rag';

type Phase = 'loading' | 'answering' | 'results';

type AnswerState = {
  text: string;
  result?: GradeResult;
  grading?: boolean;
};

export default function QuizScreen({ navigation, route }: any) {
  const { courseId, chapterIndex, chapterTitle } = route.params as {
    courseId: string;
    chapterIndex: number;
    chapterTitle: string;
  };

  const { courses, activeCourse, chapterMastery, updateChapterMastery, addXP, niveau } = useAppStore();
  const { top } = useSafeAreaInsets();

  const course = courses.find(c => c.id === courseId) ?? activeCourse;
  const chunk  = course?.chunks?.[chapterIndex];
  const style  = getSubjectStyle(course?.subjectName ?? '');
  const curMastery = chapterMastery[courseId]?.[chapterIndex] ?? 0;

  const [phase, setPhase]       = useState<Phase>('loading');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers]    = useState<AnswerState[]>([]);
  const [error, setError]        = useState('');
  const [currentQ, setCurrentQ]  = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [finalScore, setFinalScore]       = useState(0);
  const [quizAttempt, setQuizAttempt]     = useState(0);
  const [preQuizMastery, setPreQuizMastery] = useState(0);

  // Génération des questions — se re-déclenche à chaque tentative
  useEffect(() => {
    setPhase('loading');
    setQuestions([]);
    setAnswers([]);
    setFinalScore(0);
    setCurrentQ(0);
    setError('');

    if (!chunk) { setError('Chapitre non trouvé.'); setPhase('answering'); return; }
    if (!chunk.content || chunk.content.trim().length < 100) {
      setError('Ce chapitre n\'a pas encore de contenu textuel. Re-uploade le PDF depuis l\'admin.');
      setPhase('answering');
      return;
    }
    generateChapterQuiz(chunk.content, chapterTitle, niveau)
      .then(qs => {
        setQuestions(qs);
        setAnswers(qs.map(() => ({ text: '' })));
        setPhase('answering');
      })
      .catch(() => {
        setError('Impossible de générer les questions. Vérifie ta connexion.');
        setPhase('answering');
      });
  }, [quizAttempt]);

  const updateAnswer = useCallback((idx: number, text: string) => {
    setAnswers(prev => prev.map((a, i) => i === idx ? { ...a, text } : a));
  }, []);

  const restartQuiz = useCallback(() => {
    setQuizAttempt(prev => prev + 1);
  }, []);

  const handleSubmitAll = useCallback(async () => {
    if (!chunk) return;
    setSubmitLoading(true);
    const masteryBefore = chapterMastery[courseId]?.[chapterIndex] ?? 0;
    setPreQuizMastery(masteryBefore);

    console.log('=== QUIZ SUBMIT ===');
    console.log('Chapitre:', chapterTitle);
    questions.forEach((q, i) => {
      console.log(`Q${i + 1}: ${q.question}`);
      console.log(`Réponse: ${answers[i]?.text || '(vide)'}`);
    });

    const graded = [...answers];
    for (let i = 0; i < questions.length; i++) {
      graded[i] = { ...graded[i], grading: true };
      setAnswers([...graded]);
      console.log(`--- Correction Q${i + 1} ---`);
      const result = await gradeQuizAnswer(questions[i].question, graded[i].text, chunk.content);
      console.log(`Résultat Q${i + 1}:`, result.score, '|', result.feedback);
      graded[i] = { ...graded[i], result, grading: false };
      setAnswers([...graded]);
    }

    // Calcul score et mise à jour de la maîtrise
    const totalPoints = graded.reduce((s, a) => s + (a.result?.points ?? 0), 0);
    const maxPoints   = questions.length * 10;
    const ratio       = totalPoints / maxPoints; // 0–1
    const masteryGain = Math.round(ratio * 40);  // max +40 par quiz

    updateChapterMastery(courseId, chapterIndex, masteryGain);
    addXP(masteryGain);

    setFinalScore(Math.round(ratio * 100));
    setSubmitLoading(false);
    setPhase('results');
  }, [answers, questions, chunk, courseId, chapterIndex, chapterMastery, updateChapterMastery, addXP]);

  const canSubmit = answers.length > 0 && answers.every(a => a.text.trim().length >= 3);

  if (phase === 'loading') {
    return (
      <View style={[styles.root, styles.center, { paddingTop: top }]}>
        <ActivityIndicator color={style.accent} size="large" />
        <Text style={[styles.loadingText, { color: style.accent }]}>
          Prof Moctar prépare ton quiz…
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={style.bg} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: top + 12, backgroundColor: style.bg }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (phase === 'answering') {
                Alert.alert(
                  'Abandonner le quiz ?',
                  'Tes réponses seront perdues.',
                  [
                    { text: 'Continuer', style: 'cancel' },
                    { text: 'Abandonner', style: 'destructive', onPress: () => navigation.goBack() },
                  ]
                );
              } else {
                navigation.goBack();
              }
            }}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>Quiz · {course?.subjectName}</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{chapterTitle}</Text>
          </View>
          <Text style={styles.headerEmoji}>{style.emoji}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {phase === 'answering' && (
            <>
              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.intro}>
                Réponds aux questions ci-dessous en quelques phrases. Prof Moctar corrigera chacune.
              </Text>

              {questions.map((q, i) => (
                <View key={i} style={styles.questionBlock}>
                  <View style={styles.qHeader}>
                    <View style={[styles.qNumBadge, { backgroundColor: style.accent }]}>
                      <Text style={styles.qNum}>{i + 1}</Text>
                    </View>
                    <Text style={styles.qText}>{q.question}</Text>
                  </View>
                  <Text style={styles.hint}>💡 {q.hint}</Text>
                  <TextInput
                    style={styles.input}
                    value={answers[i]?.text ?? ''}
                    onChangeText={t => updateAnswer(i, t)}
                    placeholder="Ta réponse ici…"
                    placeholderTextColor="#4B5563"
                    multiline
                    textAlignVertical="top"
                    editable={phase === 'answering'}
                  />
                </View>
              ))}

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: style.accent },
                  (!canSubmit || submitLoading) && { opacity: 0.4 },
                ]}
                onPress={handleSubmitAll}
                disabled={!canSubmit || submitLoading}
              >
                {submitLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Soumettre mes réponses ✅</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {phase === 'results' && (
            <>
              <ScoreHeader score={finalScore} accent={style.accent} />

              {questions.map((q, i) => (
                <ResultCard
                  key={i}
                  idx={i}
                  question={q.question}
                  answer={answers[i].text}
                  result={answers[i].result}
                  accent={style.accent}
                />
              ))}

              <MasteryUpdate
                oldMastery={preQuizMastery}
                newMastery={Math.min(100, preQuizMastery + Math.round(finalScore / 100 * 40))}
                accent={style.accent}
              />

              <UnlockBanner mastery={curMastery} accent={style.accent} />

              <View style={styles.resultActions}>
                {curMastery < 70 && (
                  <TouchableOpacity
                    style={[styles.resultBtn, { backgroundColor: style.accent }]}
                    onPress={restartQuiz}
                  >
                    <Text style={styles.resultBtnText}>Refaire le quiz</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.resultBtnOutline, { borderColor: style.accent }]}
                  onPress={() => {
                    navigation.getParent()?.navigate('Chat');
                  }}
                >
                  <Text style={[styles.resultBtnOutlineText, { color: style.accent }]}>
                    Continuer à étudier →
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resultBtnOutline, { borderColor: '#374151' }]}
                  onPress={() => navigation.goBack()}
                >
                  <Text style={[styles.resultBtnOutlineText, { color: '#9CA3AF' }]}>
                    Retour au parcours
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Score header ──────────────────────────────────────────────────────────────

function ScoreHeader({ score, accent }: { score: number; accent: string }) {
  const emoji = score >= 80 ? '🏆' : score >= 50 ? '📖' : '💪';
  const msg   = score >= 80
    ? 'Excellent travail !'
    : score >= 50
      ? 'Continue comme ça !'
      : 'Reviens sur ce chapitre !';

  return (
    <View style={styles.scoreHeader}>
      <Text style={styles.scoreEmoji}>{emoji}</Text>
      <Text style={[styles.scoreNum, { color: accent }]}>{score}%</Text>
      <Text style={styles.scoreMsg}>{msg}</Text>
    </View>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({
  idx, question, answer, result, accent,
}: {
  idx: number;
  question: string;
  answer: string;
  result?: GradeResult;
  accent: string;
}) {
  const color =
    result?.score === 'CORRECT'   ? '#22C55E' :
    result?.score === 'PARTIEL'   ? '#F59E0B' :
    '#EF4444';

  const icon =
    result?.score === 'CORRECT'   ? '✅' :
    result?.score === 'PARTIEL'   ? '🔶' :
    '❌';

  return (
    <View style={[styles.resultCard, { borderLeftColor: color }]}>
      <View style={styles.resultCardTop}>
        <Text style={[styles.resultIcon]}>{icon}</Text>
        <Text style={styles.resultQ}>Q{idx + 1}: {question}</Text>
      </View>
      <View style={[styles.answerBox]}>
        <Text style={styles.answerLabel}>Ta réponse :</Text>
        <Text style={styles.answerText}>{answer || '(vide)'}</Text>
      </View>
      {result?.feedback ? (
        <View style={[styles.feedbackBox, { backgroundColor: color + '15', borderColor: color + '40' }]}>
          <Text style={[styles.feedbackText, { color }]}>📝 {result.feedback}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Mastery update visual ─────────────────────────────────────────────────────

function MasteryUpdate({
  oldMastery, newMastery, accent,
}: {
  oldMastery: number;
  newMastery: number;
  accent: string;
}) {
  const gain = newMastery - oldMastery;
  return (
    <View style={styles.masteryUpdate}>
      <Text style={styles.masteryUpdateTitle}>Progression du chapitre</Text>
      <View style={styles.masteryBarWrap}>
        <View style={[styles.masteryFillOld, { width: `${oldMastery}%` as any }]} />
        <View style={[styles.masteryFillNew, { width: `${gain}%` as any, backgroundColor: accent }]} />
      </View>
      <View style={styles.masteryNums}>
        <Text style={styles.masteryOldNum}>{oldMastery}%</Text>
        {gain > 0 && (
          <Text style={[styles.masteryGain, { color: accent }]}>+{gain}% 🎉</Text>
        )}
        <Text style={[styles.masteryNewNum, { color: accent }]}>{newMastery}%</Text>
      </View>
    </View>
  );
}

// ── Unlock banner ─────────────────────────────────────────────────────────────

const MASTERY_UNLOCK = 70;

function UnlockBanner({ mastery, accent }: { mastery: number; accent: string }) {
  if (mastery >= MASTERY_UNLOCK) {
    return (
      <View style={[styles.unlockBanner, { backgroundColor: accent + '20', borderColor: accent + '60' }]}>
        <Text style={[styles.unlockBannerTitle, { color: accent }]}>🔓 Chapitre suivant débloqué !</Text>
        <Text style={styles.unlockBannerSub}>Tu peux continuer ton parcours.</Text>
      </View>
    );
  }
  const remaining = MASTERY_UNLOCK - mastery;
  return (
    <View style={styles.unlockBanner}>
      <Text style={styles.unlockBannerTitle}>
        Tu es à {mastery}% — encore {remaining}% pour débloquer
      </Text>
      <Text style={styles.unlockBannerSub}>
        Chaque quiz te rapporte jusqu'à +40%. Refais-en un pour progresser.
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#09090F' },
  center: { alignItems: 'center', justifyContent: 'center' },

  loadingText: { marginTop: Spacing.lg, fontSize: 15, fontWeight: '600' },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  backArrow:   { fontSize: 18, color: '#fff', fontWeight: '700' },
  headerSub:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 2 },
  headerEmoji: { fontSize: 26 },

  /* Body */
  body: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },

  errorBox: {
    backgroundColor: '#3B0000', borderRadius: Radius.md, padding: Spacing.lg, marginBottom: Spacing.xl,
  },
  errorText: { color: '#EF4444', fontSize: 13 },

  intro: {
    fontSize: 13, color: '#9CA3AF', lineHeight: 20,
    marginBottom: Spacing.xl,
  },

  /* Question */
  questionBlock: {
    backgroundColor: '#13131F', borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: '#1E2030',
  },
  qHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: Spacing.sm },
  qNumBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  qNum:  { fontSize: 12, fontWeight: '800', color: '#fff' },
  qText: { fontSize: 14, fontWeight: '700', color: '#E2E8F0', flex: 1, lineHeight: 21 },
  hint:  { fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginBottom: Spacing.md },

  input: {
    backgroundColor: '#0D0D18', borderWidth: 1, borderColor: '#2A2D3A',
    borderRadius: Radius.md, padding: Spacing.md,
    color: '#E2E8F0', fontSize: 14, minHeight: 90, lineHeight: 21,
  },

  /* Submit */
  submitBtn: {
    borderRadius: Radius.lg, padding: Spacing.lg,
    alignItems: 'center', marginTop: Spacing.md,
  },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  /* Score header */
  scoreHeader: {
    alignItems: 'center', paddingVertical: Spacing.xxxl,
  },
  scoreEmoji: { fontSize: 52, marginBottom: Spacing.md },
  scoreNum:   { fontSize: 42, fontWeight: '900', marginBottom: Spacing.sm },
  scoreMsg:   { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },

  /* Result card */
  resultCard: {
    backgroundColor: '#13131F', borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: '#1E2030',
    borderLeftWidth: 4,
  },
  resultCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: Spacing.md },
  resultIcon: { fontSize: 16, marginTop: 1 },
  resultQ: { fontSize: 13, fontWeight: '700', color: '#E2E8F0', flex: 1, lineHeight: 20 },
  answerBox: { backgroundColor: '#0D0D18', borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.sm },
  answerLabel: { fontSize: 10, fontWeight: '700', color: '#4B5563', letterSpacing: 0.5, marginBottom: 4 },
  answerText: { fontSize: 13, color: '#9CA3AF', lineHeight: 20 },
  feedbackBox: { borderRadius: Radius.sm, padding: Spacing.md, borderWidth: 1 },
  feedbackText: { fontSize: 13, lineHeight: 20, fontWeight: '500' },

  /* Mastery update */
  masteryUpdate: {
    backgroundColor: '#13131F', borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: '#1E2030',
  },
  masteryUpdateTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: Spacing.md },
  masteryBarWrap: {
    height: 10, borderRadius: 5, backgroundColor: '#1E2030',
    overflow: 'hidden', flexDirection: 'row',
  },
  masteryFillOld: { height: 10, backgroundColor: '#374151' },
  masteryFillNew: { height: 10 },
  masteryNums: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  masteryOldNum:  { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  masteryGain:    { fontSize: 12, fontWeight: '800' },
  masteryNewNum:  { fontSize: 13, fontWeight: '800' },

  /* Unlock banner */
  unlockBanner: {
    backgroundColor: '#13131F', borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: '#2A2D3A',
    alignItems: 'center',
  },
  unlockBannerTitle: { fontSize: 15, fontWeight: '800', color: '#E2E8F0', textAlign: 'center', marginBottom: 4 },
  unlockBannerSub:   { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 18 },

  /* Result actions */
  resultActions: { gap: Spacing.md, marginTop: Spacing.xl },
  resultBtn: {
    borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center',
  },
  resultBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  resultBtnOutline: {
    borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center',
    borderWidth: 1.5, backgroundColor: 'transparent',
  },
  resultBtnOutlineText: { fontSize: 15, fontWeight: '700' },
});
