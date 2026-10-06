import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { isMastered } from '../utils/srs';
import { shouldOfferClinicalCase } from '../utils/clinicalDetector';
import { Spacing, Radius } from '../theme';
import { useTheme, Text, TextInput } from '../components';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

// ⚠️ MOCK TEMPORAIRE — force l'affichage de la carte "Cas clinique" pour tester le
// design, même sur un document qui ne le justifierait pas normalement (ex: P1).
// Mettre à false pour revenir à la vraie détection (à faire avant tout usage réel).
const FORCE_SHOW_CASE_CARD = false;

type ToolStrings = {
  headerLabel: string;
  pages: (n: number) => string;
  ficheTitle: string;
  ficheDesc: string;
  ficheReady: string;
  quizTitle: string;
  quizDesc: string;
  flashTitle: string;
  flashDesc: string;
  flashReady: (known: number, total: number) => string;
  caseTitle: string;
  caseDesc: string;
  caseReady: (n: number) => string;
  renameTitle: string;
  renamePlaceholder: string;
  cancel: string;
  save: string;
};

const STRINGS: Record<'fr' | 'ar', ToolStrings> = {
  fr: {
    headerLabel: 'DOCUMENT',
    pages: (n) => `${n} pages`,
    ficheTitle: 'Fiche de révision',
    ficheDesc: "L'essentiel du cours, structuré et dense",
    ficheReady: 'Déjà générée',
    quizTitle: 'QCM',
    quizDesc: "Teste-toi avec des questions à choix multiples",
    flashTitle: 'Flashcards',
    flashDesc: 'Mémorisation active, carte par carte',
    flashReady: (known, total) => `${known}/${total} maîtrisées`,
    caseTitle: 'Cas clinique',
    caseDesc: 'Raisonne comme en consultation, étape par étape',
    caseReady: (n) => n > 1 ? `${n} cas générés` : '1 cas généré',
    renameTitle: 'Renommer le document',
    renamePlaceholder: 'Nom du document',
    cancel: 'Annuler',
    save: 'Enregistrer',
  },
  ar: {
    headerLabel: 'المستند',
    pages: (n) => `${n} صفحة`,
    ficheTitle: 'بطاقة مراجعة',
    ficheDesc: 'خلاصة الدرس، منظمة ومكثفة',
    ficheReady: 'أُنشئت بالفعل',
    quizTitle: 'أسئلة اختيار من متعدد',
    quizDesc: 'اختبر نفسك بأسئلة اختيار من متعدد',
    flashTitle: 'بطاقات تعلّم',
    flashDesc: 'حفظ نشط، بطاقة تلو الأخرى',
    flashReady: (known, total) => `${known}/${total} متقنة`,
    caseTitle: 'حالة سريرية',
    caseDesc: 'استدل كما لو كنت في استشارة، خطوة بخطوة',
    caseReady: (n) => n > 1 ? `${n} حالات جاهزة` : 'حالة واحدة جاهزة',
    renameTitle: 'إعادة تسمية المستند',
    renamePlaceholder: 'اسم المستند',
    cancel: 'إلغاء',
    save: 'حفظ',
  },
};

export default function DocumentScreen({ navigation, route }: any) {
  const { courseId } = route.params as { courseId: string };
  const { courses, activeCourse, setActiveCourse, fiches, flashcards, flashcardSRS, clinicalCases, uiLanguage, studentClassName, renameCourse } = useAppStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const rtl = uiLanguage === 'ar';
  const s = STRINGS[rtl ? 'ar' : 'fr'];
  const niveauEtudiant = studentClassName || 'P3';

  const course = courses.find(c => c.id === courseId) ?? activeCourse;

  const hasFiche = !!fiches[`${courseId}_0`];
  const cards = flashcards[courseId] ?? [];
  const courseSRS = flashcardSRS[courseId] ?? {};
  const knownCount = cards.filter((_, i) => isMastered(courseSRS[i])).length;
  const caseCount = (clinicalCases[courseId] ?? []).length;
  const hasCase = caseCount > 0;
  const showCaseCard = FORCE_SHOW_CASE_CARD || (!!course && shouldOfferClinicalCase(course.content, niveauEtudiant));

  const [renameModal, setRenameModal] = useState(false);
  const [nameInput, setNameInput] = useState(course?.name ?? '');

  const open = (screen: 'Fiche' | 'Quiz' | 'Flashcards' | 'ClinicalCase') => {
    setActiveCourse(courseId);
    if (screen === 'Fiche') navigation.navigate('Fiche');
    else navigation.navigate(screen, { courseId });
  };

  const openRename = () => {
    setNameInput(course?.name ?? '');
    setRenameModal(true);
  };

  const saveRename = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    renameCourse(courseId, trimmed);
    setRenameModal(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: TEAL_BG }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerHalo1} />
        <View style={styles.headerHalo2} />
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
            <Text style={[styles.headerTitle, rtl && styles.textRight]} numberOfLines={1}>{course?.name ?? ''}</Text>
            {course ? (
              <Text style={[styles.headerMeta, rtl && styles.textRight]}>{s.pages(course.pages)}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.editBtn, rtl ? { marginRight: 8 } : { marginLeft: 8 }]}
            onPress={openRename}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="pencil" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={renameModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, rtl && styles.textRight]}>{s.renameTitle}</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: nameInput.trim() ? TEAL : '#E2E8F0' }]}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              selectionColor={TEAL}
              placeholder={s.renamePlaceholder}
              placeholderTextColor="#94A3B8"
            />
            <View style={[styles.modalBtns, rtl && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setRenameModal(false)}>
                <Text style={{ color: '#5B7184', fontWeight: '600' }}>{s.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { opacity: nameInput.trim() ? 1 : 0.4 }]}
                onPress={saveRename}
                disabled={!nameInput.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{s.save}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <ToolCard
          icon="reader-outline"
          title={s.ficheTitle}
          desc={s.ficheDesc}
          status={hasFiche ? s.ficheReady : undefined}
          statusDone={hasFiche}
          onPress={() => open('Fiche')}
          rtl={rtl}
        />
        <ToolCard
          icon="help-circle-outline"
          title={s.quizTitle}
          desc={s.quizDesc}
          onPress={() => open('Quiz')}
          rtl={rtl}
        />
        <ToolCard
          icon="albums-outline"
          title={s.flashTitle}
          desc={s.flashDesc}
          status={cards.length > 0 ? s.flashReady(knownCount, cards.length) : undefined}
          statusDone={cards.length > 0 && knownCount === cards.length}
          onPress={() => open('Flashcards')}
          rtl={rtl}
        />
        {showCaseCard && (
          <ToolCard
            icon="medkit-outline"
            title={s.caseTitle}
            desc={s.caseDesc}
            status={hasCase ? s.caseReady(caseCount) : undefined}
            statusDone={hasCase}
            onPress={() => open('ClinicalCase')}
            rtl={rtl}
          />
        )}
      </ScrollView>
    </View>
  );
}

function ToolCard({
  icon, title, desc, status, statusDone, onPress, rtl,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  desc: string;
  status?: string;
  statusDone?: boolean;
  onPress: () => void;
  rtl: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.card, rtl && { flexDirection: 'row-reverse' }]} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.cardIconWrap}>
        <Ionicons name={icon} size={26} color={TEAL} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, rtl && styles.textRight]}>{title}</Text>
        <Text style={[styles.cardDesc, rtl && styles.textRight]}>{desc}</Text>
        {status ? (
          <View style={[styles.statusPill, statusDone && styles.statusPillDone, rtl && { alignSelf: 'flex-end' }]}>
            {statusDone ? <Ionicons name="checkmark-circle" size={12} color={TEAL} /> : null}
            <Text style={[styles.statusPillText, statusDone && { color: TEAL }]}>{status}</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={20} color="#B8C4CE" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  textRight: { textAlign: 'right', writingDirection: 'rtl' },

  header: {
    backgroundColor: NAVY,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerHalo1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(7,169,151,0.12)', top: -60, right: -40,
  },
  headerHalo2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(7,169,151,0.08)', bottom: -30, left: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  editBtn: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'flex-start', marginTop: 2,
  },
  headerSub: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.4 },
  headerTitle: { fontFamily: SERIF, fontSize: 20, color: '#fff', marginTop: 2, letterSpacing: -0.3 },
  headerMeta: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 3 },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, gap: 12 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  cardIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: { fontFamily: SERIF, fontSize: 16, color: NAVY, marginBottom: 2 },
  cardDesc:  { fontSize: 12.5, color: '#5B7184', lineHeight: 17 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: 8,
    backgroundColor: '#F1F5F9', borderRadius: Radius.full,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  statusPillDone: { backgroundColor: TEAL_BG },
  statusPillText: { fontSize: 10.5, fontWeight: '700', color: '#94A3B8' },

  /* Modal renommage */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(11,30,52,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, gap: Spacing.md,
    backgroundColor: '#fff',
  },
  modalTitle: { fontFamily: SERIF, fontSize: 20, color: NAVY },
  modalInput: {
    borderWidth: 1.5, borderRadius: Radius.md,
    padding: 14, fontSize: 17, fontWeight: '600',
    color: NAVY, backgroundColor: TEAL_BG,
  },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: 4 },
  modalBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: TEAL_BG },
  modalBtnPrimary: { backgroundColor: TEAL },
});
