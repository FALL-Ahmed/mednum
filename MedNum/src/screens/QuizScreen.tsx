import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
  TouchableOpacity, ActivityIndicator, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store';
import { Colors, Spacing, Radius } from '../theme';
import { getSubjectStyle } from '../utils/subjectStyles';
import { generateChapterQCM, QCMQuestion } from '../utils/rag';

type Phase = 'loading' | 'answering' | 'results';
type LetterKey = 'A' | 'B' | 'C' | 'D' | 'E';
type QCMResult = 'COMPLET' | 'PARTIEL' | 'FAUX';

type AnswerState = {
  selected: LetterKey[];
  result?: QCMResult;
  points?: number;
};

const LETTERS: LetterKey[] = ['A', 'B', 'C', 'D', 'E'];

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
  const { courseId, chapterIndex, chapterTitle } = route.params as {
    courseId: string;
    chapterIndex: number;
    chapterTitle: string;
  };

  const { courses, activeCourse, chapterMastery, updateChapterMastery, addXP, niveau } = useAppStore();
  const { top } = useSafeAreaInsets();

  const course     = courses.find(c => c.id === courseId) ?? activeCourse;
  const chunk      = course?.chunks?.[chapterIndex];
  const style      = getSubjectStyle(course?.subjectName ?? '');
  const curMastery = chapterMastery[courseId]?.[chapterIndex] ?? 0;

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

    if (!chunk) {
      setError('Chapitre non trouvé.');
      setPhase('answering');
      return;
    }
    console.log('[Quiz] chunk:', chapterIndex, '| content length:', chunk?.content?.trim().length ?? 0);
    if (!chunk.content || chunk.content.trim().length < 100) {
      setError(`Contenu trop court (${chunk.content?.trim().length ?? 0} chars). Re-uploade le PDF.`);
      setPhase('answering');
      return;
    }

    generateChapterQCM(chunk.content, chapterTitle, niveau)
      .then(qs => {
        setQuestions(qs);
        setAnswers(qs.map(() => ({ selected: [] })));
        setPhase('answering');
      })
      .catch((err: Error) => {
        setError(err.message ?? 'Impossible de générer les QCM. Vérifie ta connexion.');
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
    const masteryBefore = chapterMastery[courseId]?.[chapterIndex] ?? 0;
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

    updateChapterMastery(courseId, chapterIndex, masteryGain);
    addXP(masteryGain);

    setFinalScore(Math.round(ratio * 100));
    setPhase('results');
  }, [answers, questions, courseId, chapterIndex, chapterMastery, updateChapterMastery, addXP]);

  const restartQuiz = useCallback(() => setQuizAttempt(prev => prev + 1), []);

  const canSubmit = answers.length > 0 && answers.every(a => a.selected.length > 0);

  if (phase === 'loading') {
    return (
      <View style={[styles.root, styles.center, { paddingTop: top }]}>
        <ActivityIndicator color={style.accent} size="large" />
        <Text style={[styles.loadingText, { color: style.accent }]}>
          Génération des QCM en cours…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={style.bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: top + 12, backgroundColor: style.bg }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (phase === 'answering' && answers.some(a => a.selected.length > 0)) {
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
          <Text style={styles.headerSub}>QCM · {course?.subjectName}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{chapterTitle}</Text>
        </View>
        <Text style={styles.headerEmoji}>{style.emoji}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* ── Phase : réponse ────────────────────────────────────────────── */}
        {phase === 'answering' && (
          <>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={restartQuiz}>
                  <Text style={styles.retryBtnText}>Réessayer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.intro}>
                  Sélectionne une ou plusieurs bonnes réponses par question.
                </Text>

                {questions.map((q, qIdx) => (
                  <View key={qIdx} style={styles.questionBlock}>
                    <View style={styles.qHeader}>
                      <View style={[styles.qNumBadge, { backgroundColor: style.accent }]}>
                        <Text style={styles.qNum}>{qIdx + 1}</Text>
                      </View>
                      <Text style={styles.qText}>{q.question}</Text>
                    </View>

                    {LETTERS.map(letter => {
                      const isSelected = answers[qIdx]?.selected.includes(letter) ?? false;
                      return (
                        <TouchableOpacity
                          key={letter}
                          style={[
                            styles.propositionBtn,
                            isSelected && {
                              backgroundColor: style.accent + '22',
                              borderColor: style.accent,
                            },
                          ]}
                          onPress={() => toggleProposition(qIdx, letter)}
                          activeOpacity={0.7}
                        >
                          <View style={[
                            styles.letterBadge,
                            isSelected && { backgroundColor: style.accent },
                          ]}>
                            <Text style={[styles.letterText, isSelected && { color: '#fff' }]}>
                              {letter}
                            </Text>
                          </View>
                          <Text style={[
                            styles.propositionText,
                            isSelected && { color: '#E2E8F0' },
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
                    { backgroundColor: style.accent },
                    !canSubmit && { opacity: 0.4 },
                  ]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                >
                  <Text style={styles.submitBtnText}>Valider mes réponses ✅</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* ── Phase : résultats ──────────────────────────────────────────── */}
        {phase === 'results' && (
          <>
            <ScoreHeader score={finalScore} accent={style.accent} />

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
                onPress={() => navigation.getParent()?.navigate('Chat')}
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
  );
}

// ── Score header ──────────────────────────────────────────────────────────────

function ScoreHeader({ score, accent }: { score: number; accent: string }) {
  const emoji = score >= 80 ? '🏆' : score >= 50 ? '📖' : '💪';
  const msg   =
    score >= 80 ? 'Excellent travail !' :
    score >= 50 ? 'Continue comme ça !' :
    'Reviens sur ce chapitre !';

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
  idx, question, propositions, bonnesReponses, selected, explication, result, accent,
}: {
  idx: number;
  question: string;
  propositions: QCMQuestion['propositions'];
  bonnesReponses: LetterKey[];
  selected: LetterKey[];
  explication: QCMQuestion['explication'];
  result: QCMResult;
  accent: string;
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
    <View style={[styles.resultCard, { borderLeftColor: headerColor }]}>
      <View style={styles.resultCardTop}>
        <Text style={styles.resultCardIcon}>{headerIcon}</Text>
        <Text style={styles.resultCardQ}>Q{idx + 1} · {question}</Text>
      </View>

      {LETTERS.map(letter => {
        const isCorrect  = bonnesReponses.includes(letter);
        const isSelected = selected.includes(letter);
        const isNeutral  = !isCorrect && !isSelected;

        // ✅ bonne + cochée → vert
        // 🔶 bonne + non cochée → orange (manquée)
        // ❌ fausse + cochée → rouge (erreur)
        // ○  fausse + non cochée → gris (neutre)
        const color =
          isCorrect && isSelected  ? '#22C55E' :
          isCorrect && !isSelected ? '#F59E0B' :
          !isCorrect && isSelected ? '#EF4444' :
          '#374151';
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
                borderColor:     isNeutral ? '#1E2030' : color + '50',
                backgroundColor: isNeutral ? 'transparent' : color + '12',
              },
            ]}
          >
            <View style={styles.propResultRow}>
              <Text style={styles.propIcon}>{icon}</Text>
              <View style={[styles.letterBadgeSmall, { backgroundColor: isNeutral ? '#374151' : color }]}>
                <Text style={styles.letterTextSmall}>{letter}</Text>
              </View>
              <Text style={[styles.propText, { color: isNeutral ? '#6B7280' : '#E2E8F0' }]}>
                {propositions[letter]}
              </Text>
            </View>
            <Text style={[styles.propExplication, { color: isNeutral ? '#4B5563' : color }]}>
              {explication[letter]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Mastery update ────────────────────────────────────────────────────────────

function MasteryUpdate({ oldMastery, newMastery, accent }: {
  oldMastery: number; newMastery: number; accent: string;
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
        {gain > 0 && <Text style={[styles.masteryGain, { color: accent }]}>+{gain}% 🎉</Text>}
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

  /* Error */
  errorBox: {
    backgroundColor: '#3B0000', borderRadius: Radius.md,
    padding: Spacing.lg, marginBottom: Spacing.xl,
  },
  errorText: { color: '#EF4444', fontSize: 13, lineHeight: 20, marginBottom: Spacing.md },
  retryBtn: {
    backgroundColor: '#EF4444', borderRadius: Radius.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    alignSelf: 'flex-start',
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  /* Intro */
  intro: { fontSize: 13, color: '#9CA3AF', lineHeight: 20, marginBottom: Spacing.xl },

  /* Question block */
  questionBlock: {
    backgroundColor: '#13131F', borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: '#1E2030',
  },
  qHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: Spacing.lg },
  qNumBadge: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0,
  },
  qNum:  { fontSize: 12, fontWeight: '800', color: '#fff' },
  qText: { fontSize: 14, fontWeight: '700', color: '#E2E8F0', flex: 1, lineHeight: 21 },

  /* Proposition button (phase answering) */
  propositionBtn: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 10, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md, marginBottom: 8,
    borderWidth: 1.5, borderColor: '#2A2D3A',
    backgroundColor: '#0D0D18',
  },
  letterBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2A2D3A', flexShrink: 0, marginTop: 1,
  },
  letterText:      { fontSize: 12, fontWeight: '800', color: '#9CA3AF' },
  propositionText: { fontSize: 13, color: '#9CA3AF', flex: 1, lineHeight: 20 },

  /* Submit */
  submitBtn: {
    borderRadius: Radius.lg, padding: Spacing.lg,
    alignItems: 'center', marginTop: Spacing.md,
  },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  /* Score header */
  scoreHeader:  { alignItems: 'center', paddingVertical: Spacing.xxxl },
  scoreEmoji:   { fontSize: 52, marginBottom: Spacing.md },
  scoreNum:     { fontSize: 42, fontWeight: '900', marginBottom: Spacing.sm },
  scoreMsg:     { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },

  /* Result card */
  resultCard: {
    backgroundColor: '#13131F', borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: '#1E2030', borderLeftWidth: 4,
  },
  resultCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: Spacing.lg },
  resultCardIcon: { fontSize: 16, marginTop: 2 },
  resultCardQ:    { fontSize: 13, fontWeight: '700', color: '#E2E8F0', flex: 1, lineHeight: 20 },

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
  masteryNums:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  masteryOldNum:  { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  masteryGain:    { fontSize: 12, fontWeight: '800' },
  masteryNewNum:  { fontSize: 13, fontWeight: '800' },

  /* Unlock banner */
  unlockBanner: {
    backgroundColor: '#13131F', borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: '#2A2D3A', alignItems: 'center',
  },
  unlockBannerTitle: { fontSize: 15, fontWeight: '800', color: '#E2E8F0', textAlign: 'center', marginBottom: 4 },
  unlockBannerSub:   { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 18 },

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
