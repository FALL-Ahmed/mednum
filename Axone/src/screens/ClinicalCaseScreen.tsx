import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, KeyboardAvoidingView,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { generateClinicalCases, ClinicalCaseData } from '../utils/rag';
import { Spacing, Radius } from '../theme';
import { useTheme, Text, TextInput } from '../components';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

// ⚠️ MOCK TEMPORAIRE — pour prévisualiser le design instantanément sans générer via l'IA.
// Mettre à false pour revenir à la génération réelle (à faire avant tout usage réel).
const USE_MOCK_DATA = false;
const MOCK_CASES: ClinicalCaseData[] = [
  {
    title: 'Rhabdomyolyse',
    context: "Amadou, 22 ans, sportif, se présente aux urgences après une séance d'entraînement intense inhabituelle la veille.",
    stages: [
      {
        label: 'Motif de consultation',
        reveal: "Le patient se plaint de douleurs musculaires diffuses intenses depuis hier soir, associées à une urine anormalement foncée, couleur \"thé\" ce matin.",
        prompt: 'Quelles hypothèses diagnostiques envisages-tu à ce stade ?',
      },
      {
        label: 'Interrogatoire',
        reveal: "Il rapporte un effort musculaire très intense et prolongé la veille (première séance après plusieurs mois d'arrêt), sans hydratation suffisante. Pas d'antécédent notable, aucun traitement en cours.",
        prompt: 'Quel mécanisme physiopathologique suspectes-tu pour expliquer ces symptômes ?',
      },
      {
        label: 'Examen clinique',
        reveal: 'Sensibilité et œdème des masses musculaires des cuisses et des mollets, à la palpation. Pas de déficit neurologique. Constantes stables, pas de fièvre.',
        prompt: 'Quels examens complémentaires demanderais-tu pour confirmer ton hypothèse ?',
      },
      {
        label: 'Examens complémentaires',
        reveal: "CPK (créatine phosphokinase) très élevées. Bandelette urinaire positive pour le sang, mais absence d'hématies au sédiment urinaire (myoglobinurie). Fonction rénale à surveiller.",
        prompt: 'Au vu de ces résultats, quel est ton diagnostic ?',
      },
    ],
    diagnosis: "Rhabdomyolyse d'effort",
    reasoning: "Le tableau associe un effort musculaire intense et inhabituel, des douleurs et un œdème musculaires diffus, une urine foncée sans hématies visibles au sédiment (signe de myoglobinurie) et des CPK très élevées — la triade classique de la rhabdomyolyse. La libération massive de contenu intracellulaire musculaire (dont la myoglobine) après lyse des fibres explique à la fois la douleur, l'œdème et la coloration urinaire.",
    management: "Hydratation intraveineuse abondante pour protéger la fonction rénale (risque d'insuffisance rénale aiguë par précipitation de myoglobine dans les tubules), surveillance des CPK et de la fonction rénale, repos musculaire, surveillance de la kaliémie.",
  },
  {
    title: 'Myasthénie grave',
    context: "Fatimetou, 28 ans, se présente pour une fatigue musculaire progressive depuis 3 semaines.",
    stages: [
      {
        label: 'Motif de consultation',
        reveal: "La patiente rapporte une faiblesse musculaire qui s'aggrave au fil de la journée, avec une chute des paupières (ptosis) plus marquée le soir.",
        prompt: 'Quelles hypothèses diagnostiques envisages-tu à ce stade ?',
      },
      {
        label: 'Interrogatoire',
        reveal: "Elle décrit aussi une difficulté à mâcher en fin de repas et une vision double intermittente. Les symptômes s'améliorent nettement après le repos.",
        prompt: 'Quel mécanisme physiopathologique suspectes-tu pour expliquer cette fatigabilité fluctuante ?',
      },
      {
        label: 'Examen clinique',
        reveal: "Ptosis bilatéral qui s'accentue au maintien du regard vers le haut. Force musculaire normale au repos mais s'épuise rapidement à l'effort répété. Pas de déficit sensitif.",
        prompt: 'Quels examens complémentaires demanderais-tu pour confirmer ton hypothèse ?',
      },
      {
        label: 'Examens complémentaires',
        reveal: "Anticorps anti-récepteurs de l'acétylcholine positifs. Test au glaçon positif (amélioration du ptosis après application de froid).",
        prompt: 'Au vu de ces résultats, quel est ton diagnostic ?',
      },
    ],
    diagnosis: 'Myasthénie grave',
    reasoning: "La fatigabilité musculaire fluctuante, aggravée par l'effort et améliorée par le repos, associée à un ptosis et une diplopie, oriente vers une atteinte de la jonction neuromusculaire. La positivité des anticorps anti-récepteurs de l'acétylcholine confirme le blocage auto-immun de la transmission neuromusculaire, caractéristique de la myasthénie grave.",
    management: "Traitement par anticholinestérasiques (pyridostigmine) en première intention, recherche d'un thymome associé, surveillance des signes de crise myasthénique (atteinte respiratoire) qui est une urgence.",
  },
];

function hashContent(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

type Strings = {
  headerLabel: string;
  pickLabel: string;
  loading: string;
  loadingHint: string;
  errorTitle: string;
  retry: string;
  yourReasoning: string;
  reasoningPlaceholder: string;
  reasoningPrivate: string;
  continueBtn: string;
  seeConclusion: string;
  stageOf: (i: number, total: number) => string;
  diagnosisTitle: string;
  reasoningTitle: string;
  managementTitle: string;
  back: string;
  backToList: string;
  restart: string;
  disclaimer: string;
  casesCount: (n: number) => string;
  caseLabel: (n: number) => string;
};

const STRINGS: Record<'fr' | 'ar', Strings> = {
  fr: {
    headerLabel: 'CAS CLINIQUE',
    pickLabel: 'Choisis un cas',
    loading: 'Construction des cas cliniques…',
    loadingHint: 'Dr. Ahmed prépare tes patients',
    errorTitle: 'Impossible de générer le cas clinique',
    retry: 'Réessayer',
    yourReasoning: 'Ton raisonnement',
    reasoningPlaceholder: 'Qu\'en penses-tu ? Note tes hypothèses avant de continuer…',
    reasoningPrivate: '🔒 Visible par toi seul — pas noté, juste pour réfléchir.',
    continueBtn: 'Continuer',
    seeConclusion: 'Voir le diagnostic',
    stageOf: (i, total) => `Étape ${i} / ${total}`,
    diagnosisTitle: 'DIAGNOSTIC',
    reasoningTitle: 'RAISONNEMENT',
    managementTitle: 'CONDUITE À TENIR',
    back: 'Retour au document',
    backToList: 'Voir les autres cas',
    restart: 'Recommencer le cas',
    disclaimer: "Cas fictif à but pédagogique · valeurs illustratives — recoupe les seuils exacts avec ton cours.",
    casesCount: (n) => n > 1 ? `${n} cas cliniques` : '1 cas clinique',
    caseLabel: (n) => `Cas clinique #${n}`,
  },
  ar: {
    headerLabel: 'حالة سريرية',
    pickLabel: 'اختر حالة',
    loading: 'جارٍ إنشاء الحالات السريرية…',
    loadingHint: 'الدكتور أحمد يجهّز مرضاك',
    errorTitle: 'تعذر إنشاء الحالة السريرية',
    retry: 'إعادة المحاولة',
    yourReasoning: 'استنتاجك',
    reasoningPlaceholder: 'ما رأيك؟ دوّن فرضياتك قبل المتابعة…',
    reasoningPrivate: '🔒 لا يراه سواك — غير مقيّم، فقط للتفكير.',
    continueBtn: 'متابعة',
    seeConclusion: 'عرض التشخيص',
    stageOf: (i, total) => `المرحلة ${i} / ${total}`,
    diagnosisTitle: 'التشخيص',
    reasoningTitle: 'الاستدلال',
    managementTitle: 'التدبير العلاجي',
    back: 'العودة إلى المستند',
    backToList: 'عرض الحالات الأخرى',
    restart: 'إعادة الحالة',
    disclaimer: 'حالة افتراضية لغرض تعليمي · القيم توضيحية — تحقق من العتبات الدقيقة في كتابك.',
    casesCount: (n) => n > 1 ? `${n} حالات سريرية` : 'حالة سريرية واحدة',
    caseLabel: (n) => `حالة سريرية رقم ${n}`,
  },
};

export default function ClinicalCaseScreen({ navigation, route }: any) {
  const { courseId } = route.params as { courseId: string };
  const {
    courses, activeCourse, studentClassName, studentFiliere, uiLanguage,
    clinicalCases, saveClinicalCases, decrementQuota, syncQuota,
  } = useAppStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const rtl = uiLanguage === 'ar';
  const s = STRINGS[rtl ? 'ar' : 'fr'];
  const niveauEtudiant = studentClassName || 'P3';
  const filiere = (studentFiliere as 'medecine' | 'pharmacie') || 'medecine';

  const course = courses.find(c => c.id === courseId) ?? activeCourse;

  const [cases, setCases] = useState<ClinicalCaseData[]>(clinicalCases[courseId] ?? []);
  const [loading, setLoading] = useState(cases.length === 0);
  const [error, setError] = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [stageIdx, setStageIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => { load(); }, []);

  // Un seul cas généré → pas de choix à faire, on l'ouvre directement.
  useEffect(() => {
    if (cases.length === 1 && selectedIdx === null) setSelectedIdx(0);
  }, [cases]);

  const load = async () => {
    setLoading(true); setError('');

    if (USE_MOCK_DATA) {
      setCases(MOCK_CASES);
      setLoading(false);
      return;
    }

    if (!course) { setError(s.errorTitle); setLoading(false); return; }

    const currentHash = hashContent(course.content);

    const cached = clinicalCases[courseId];
    if (cached && cached.length > 0) { setCases(cached); setLoading(false); return; }

    try {
      const { data: row } = await supabase
        .from('documents').select('clinical_case, clinical_case_hash').eq('id', courseId).maybeSingle();
      if (row?.clinical_case) {
        const parsed = JSON.parse(row.clinical_case);
        if (Array.isArray(parsed) && parsed.length > 0) {
          saveClinicalCases(courseId, parsed, row.clinical_case_hash || currentHash);
          setCases(parsed);
          setLoading(false);
          return;
        }
      }
    } catch {}

    const net = await NetInfo.fetch();
    if (!net.isConnected) { setError(s.errorTitle); setLoading(false); return; }

    try {
      const result = await generateClinicalCases(course.content, course.name, niveauEtudiant, filiere);
      decrementQuota();
      saveClinicalCases(courseId, result, currentHash);
      setCases(result);
      supabase.from('documents')
        .update({ clinical_case: JSON.stringify(result), clinical_case_hash: currentHash, updated_at: new Date().toISOString() })
        .eq('id', courseId)
        .then(({ error: e }) => { if (e) console.log('[ClinicalCase] sauvegarde Supabase échouée:', e.message); });
    } catch (e: any) {
      if (e?.isQuotaExceeded) syncQuota();
      setError(e?.message || s.errorTitle);
    }
    setLoading(false);
  };

  const pick = (idx: number) => {
    setSelectedIdx(idx);
    setStageIdx(0);
    setFinished(false);
    setNote('');
  };

  const backToList = () => {
    setSelectedIdx(null);
    setStageIdx(0);
    setFinished(false);
    setNote('');
  };

  const data = selectedIdx !== null ? cases[selectedIdx] : null;

  const goNext = () => {
    setNote('');
    if (!data) return;
    if (stageIdx + 1 >= data.stages.length) { setFinished(true); return; }
    setStageIdx(stageIdx + 1);
  };

  const restart = () => {
    setStageIdx(0);
    setFinished(false);
    setNote('');
  };

  const currentStage = data?.stages[stageIdx];
  const showList = !loading && !error && cases.length > 0 && selectedIdx === null;

  return (
    <View style={[styles.root, { backgroundColor: TEAL_BG }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={[styles.headerRow, rtl && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity
            style={[styles.backBtn, rtl ? { marginLeft: 12, marginRight: 0 } : { marginRight: 12 }]}
            onPress={() => (selectedIdx !== null && cases.length > 1 ? backToList() : navigation.goBack())}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={rtl ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerSub, rtl && styles.textRight]}>{s.headerLabel}</Text>
            <Text style={[styles.headerTitle, rtl && styles.textRight]} numberOfLines={1}>
              {finished && data
                ? data.title
                : selectedIdx !== null
                  ? s.caseLabel(selectedIdx + 1)
                  : (course?.name ?? (USE_MOCK_DATA ? 'Physiologie — Muscle (démo)' : ''))}
            </Text>
          </View>
          {!loading && !error && data && !finished && (
            <View style={styles.progressBadge}>
              <Text style={styles.progressBadgeText}>{s.stageOf(stageIdx + 1, data.stages.length)}</Text>
            </View>
          )}
        </View>
        {!loading && !error && data && !finished && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((stageIdx) / data.stages.length) * 100}%` }]} />
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <View style={styles.loadingIconWrap}>
            <Ionicons name="medkit-outline" size={30} color={TEAL} />
          </View>
          <Text style={[styles.loadingTitle, { color: NAVY }]}>{s.loading}</Text>
          <Text style={styles.loadingHint}>{s.loadingHint}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, rtl && styles.textRight]}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>{s.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : showList ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={[styles.pickLabel, rtl && styles.textRight]}>{s.casesCount(cases.length)}</Text>
          {cases.map((c, i) => (
            <TouchableOpacity key={i} style={[styles.caseRow, rtl && { flexDirection: 'row-reverse' }]} onPress={() => pick(i)} activeOpacity={0.88}>
              <View style={styles.caseIconWrap}>
                <Ionicons name="medkit-outline" size={20} color={TEAL} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.caseRowTitle, rtl && styles.textRight]} numberOfLines={1}>{s.caseLabel(i + 1)}</Text>
                <Text style={[styles.caseRowSub, rtl && styles.textRight]} numberOfLines={2}>{c.context}</Text>
              </View>
              <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={TEAL} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : data && finished ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.concludeCard}>
            <View style={styles.concludeHalo} />
            <Text style={styles.concludeEmoji}>🩺</Text>
            <Text style={[styles.concludeLabel, rtl && styles.textRight]}>{s.diagnosisTitle}</Text>
            <Text style={[styles.concludeDiagnosis, rtl && styles.textRight]}>{data.diagnosis}</Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={[styles.sectionLabel, rtl && styles.textRight]}>{s.reasoningTitle}</Text>
            <Text style={[styles.sectionBody, rtl && styles.textRight]}>{data.reasoning}</Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={[styles.sectionLabel, rtl && styles.textRight]}>{s.managementTitle}</Text>
            <Text style={[styles.sectionBody, rtl && styles.textRight]}>{data.management}</Text>
          </View>

          <Text style={[styles.disclaimer, rtl && styles.textRight]}>{s.disclaimer}</Text>

          <View style={styles.doneActions}>
            <TouchableOpacity style={styles.doneBtnOutline} onPress={restart}>
              <Text style={styles.doneBtnOutlineText}>{s.restart}</Text>
            </TouchableOpacity>
            {cases.length > 1 ? (
              <TouchableOpacity style={styles.doneBtnOutline} onPress={backToList}>
                <Text style={styles.doneBtnOutlineText}>{s.backToList}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.doneBtnGhost} onPress={() => navigation.goBack()}>
              <Text style={styles.doneBtnGhostText}>{s.back}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : data && currentStage ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            {stageIdx === 0 && !!data.context && (
              <View style={styles.patientCard}>
                <Ionicons name="person-circle-outline" size={20} color={TEAL} />
                <Text style={[styles.patientText, rtl && styles.textRight]}>{data.context}</Text>
              </View>
            )}

            <View style={styles.stageCard}>
              <View style={styles.stageHalo} />
              <Text style={[styles.stageLabel, rtl && styles.textRight]}>{currentStage.label}</Text>
              <Text style={[styles.stageReveal, rtl && styles.textRight]}>{currentStage.reveal}</Text>
            </View>

            <View style={styles.promptCard}>
              <Text style={[styles.promptText, rtl && styles.textRight]}>{currentStage.prompt}</Text>
            </View>

            <View style={styles.reasoningCard}>
              <View style={[styles.reasoningHeader, rtl && { flexDirection: 'row-reverse' }]}>
                <View style={styles.reasoningIconWrap}>
                  <Ionicons name="bulb-outline" size={16} color={TEAL} />
                </View>
                <Text style={[styles.reasoningLabel, rtl && styles.textRight]}>{s.yourReasoning}</Text>
              </View>
              <TextInput
                style={[styles.reasoningInput, rtl && { textAlign: 'right', writingDirection: 'rtl' }]}
                value={note}
                onChangeText={setNote}
                placeholder={s.reasoningPlaceholder}
                placeholderTextColor="#A8B7C2"
                multiline
              />
              <Text style={[styles.reasoningHint, rtl && styles.textRight]}>{s.reasoningPrivate}</Text>
            </View>

            <TouchableOpacity style={styles.continueBtn} onPress={goNext} activeOpacity={0.88}>
              <Text style={styles.continueBtnText}>
                {stageIdx + 1 >= data.stages.length ? s.seeConclusion : s.continueBtn}
              </Text>
              <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={16} color="#fff" />
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  textRight: { textAlign: 'right', writingDirection: 'rtl' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },

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
  errorText: { fontSize: 14, color: '#DC2626', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  retryBtn: { backgroundColor: NAVY, borderRadius: Radius.md, paddingHorizontal: 22, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  pickLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#94A3B8', marginBottom: 14 },
  caseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(11,30,52,0.06)',
  },
  caseIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  caseRowTitle: { fontFamily: SERIF, fontSize: 15, color: NAVY, marginBottom: 3 },
  caseRowSub: { fontSize: 12, color: '#5B7184', lineHeight: 16 },

  patientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(11,30,52,0.06)',
  },
  patientText: { flex: 1, fontSize: 13, color: '#5B7184', lineHeight: 18 },
  disclaimer: { fontSize: 11, color: '#94A3B8', lineHeight: 15, marginTop: 2, marginBottom: 16, textAlign: 'center' },

  stageCard: {
    backgroundColor: NAVY, borderRadius: 22, padding: 22, marginBottom: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 18 },
      android: { elevation: 6 },
    }),
  },
  stageHalo: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(7,169,151,0.14)', top: -70, right: -50,
  },
  stageLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: TEAL, marginBottom: 8 },
  stageReveal: { fontFamily: SERIF, fontSize: 17, lineHeight: 25, color: '#fff' },

  promptCard: {
    backgroundColor: TEAL_BG, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(7,169,151,0.18)',
  },
  promptText: { fontSize: 14, fontWeight: '600', color: NAVY, lineHeight: 20 },

  reasoningCard: {
    backgroundColor: TEAL_BG, borderRadius: 20, padding: 16, marginBottom: 20,
    borderWidth: 1.5, borderColor: 'rgba(7,169,151,0.22)',
  },
  reasoningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  reasoningIconWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(7,169,151,0.16)', alignItems: 'center', justifyContent: 'center',
  },
  reasoningLabel: { fontSize: 13, fontWeight: '700', color: NAVY },
  reasoningInput: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, minHeight: 90,
    fontSize: 14, color: NAVY, textAlignVertical: 'top',
    borderWidth: 1, borderColor: 'rgba(11,30,52,0.06)', marginBottom: 10,
  },
  reasoningHint: { fontSize: 11, color: '#5B7184', fontStyle: 'italic' },

  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: NAVY, borderRadius: Radius.lg, paddingVertical: 16,
  },
  continueBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  concludeCard: {
    backgroundColor: NAVY, borderRadius: 24, padding: 26, alignItems: 'center',
    overflow: 'hidden', marginBottom: 14,
  },
  concludeHalo: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(7,169,151,0.16)', top: -80, right: -50,
  },
  concludeEmoji: { fontSize: 34, marginBottom: 8 },
  concludeLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: TEAL, marginBottom: 6 },
  concludeDiagnosis: { fontFamily: SERIF, fontSize: 20, color: '#fff', textAlign: 'center', lineHeight: 27 },

  sectionCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(11,30,52,0.06)',
  },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: TEAL, marginBottom: 8 },
  sectionBody: { fontSize: 14, lineHeight: 21, color: NAVY },

  doneActions: { gap: 10, marginTop: 8 },
  doneBtnOutline: { borderRadius: Radius.lg, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: TEAL },
  doneBtnOutlineText: { color: TEAL, fontWeight: '700', fontSize: 14 },
  doneBtnGhost: { paddingVertical: 10, alignItems: 'center' },
  doneBtnGhostText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
});
