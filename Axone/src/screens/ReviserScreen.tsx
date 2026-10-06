import React, { useRef, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, Platform, Animated,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, Course } from '../store';
import { Spacing, Radius } from '../theme';
import { useTheme, Text } from '../components';
import { extractPDFText, estimatePDFPageCount } from '../utils/pdfExtractor';
import { extractPDFWithClaude, extractPDFWithGemini } from '../utils/rag';
import { autoChunk } from '../utils/courseChunker';
import { supabase } from '../lib/supabase';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const EXTRACT_PDF_URL   = `${SUPABASE_URL}/functions/v1/extract-pdf`;

type ReviserStrings = {
  docLimitTitle: string;
  docLimitMsg: (max: number) => string;
  seePlans: string;
  headerTitle: string;
  headerSub: string;
  uploadTitle: string;
  uploadSubIdle: string;
  toolsTitle: string;
  toolPomodoro: string;
  toolPomodoroSub: string;
  toolCalendar: string;
  toolCalendarSub: string;
  emptyTitle: string;
  emptySub: string;
  pagesLabel: (n: number) => string;
  readyLabel: string;
  deleteConfirmTitle: string;
  deleteConfirmMsg: (name: string) => string;
  cancel: string;
  deleteConfirm: string;
  readingFile: string;
  analyzing: string;
  analyzingPages: (a: number, b: number, total: number) => string;
  sendingFile: string;
  finalizing: string;
  chunking: string;
  done: string;
  pdfUnreadableTitle: string;
  pdfUnreadableMsg: string;
  insufficientTextTitle: string;
  insufficientTextMsg: (chars: number, pages: number) => string;
  genericErrorTitle: string;
  genericErrorMsg: string;
};

const STRINGS: Record<'fr' | 'ar', ReviserStrings> = {
  fr: {
    docLimitTitle: 'Limite de documents atteinte',
    docLimitMsg: (max) => `Ton plan permet ${max} document${max > 1 ? 's' : ''} actif${max > 1 ? 's' : ''}. Supprime-en un ou passe à un plan supérieur.`,
    seePlans: 'Voir les plans',
    headerTitle: 'Réviser',
    headerSub: 'Fiches, QCM et flashcards à partir de tes cours',
    uploadTitle: 'Ajouter un document',
    uploadSubIdle: 'PDF sélectionnable ou fichier .txt',
    toolsTitle: 'Outils',
    toolPomodoro: 'Pomodoro',
    toolPomodoroSub: 'Séances de concentration',
    toolCalendar: 'Calendrier',
    toolCalendarSub: 'Planifie et suis tes révisions',
    emptyTitle: "Aucun document pour l'instant",
    emptySub: 'Ajoute un PDF de cours pour générer des fiches, des QCM et des flashcards.',
    pagesLabel: (n) => `${n} pages`,
    readyLabel: 'prêt',
    deleteConfirmTitle: 'Supprimer ce document ?',
    deleteConfirmMsg: (name) => `"${name}" sera retiré de l'application.`,
    cancel: 'Annuler',
    deleteConfirm: 'Supprimer',
    readingFile: 'Lecture du fichier…',
    analyzing: 'Analyse du document…',
    analyzingPages: (a, b, total) => `Analyse des pages ${a}-${b} sur ${total}…`,
    sendingFile: 'Envoi du fichier…',
    finalizing: 'Finalisation…',
    chunking: 'Découpage en chapitres…',
    done: 'Terminé !',
    pdfUnreadableTitle: 'PDF illisible',
    pdfUnreadableMsg: 'Ce PDF est peut-être un scan ou protégé. Essaie un autre fichier.',
    insufficientTextTitle: 'Texte insuffisant',
    insufficientTextMsg: (chars, pages) => `Seulement ${chars} caractères extraits sur ${pages} pages. Ce PDF est probablement un scan (image) — le texte doit être sélectionnable.`,
    genericErrorTitle: 'Erreur',
    genericErrorMsg: 'Impossible de charger ce fichier.',
  },
  ar: {
    docLimitTitle: 'تم بلوغ حد المستندات',
    docLimitMsg: (max) => `تسمح خطتك بـ ${max} مستند نشط. احذف مستندًا أو انتقل إلى خطة أعلى.`,
    seePlans: 'عرض الخطط',
    headerTitle: 'مراجعة',
    headerSub: 'ملخصات، أسئلة اختيار من متعدد وبطاقات تعلّم انطلاقاً من دروسك',
    uploadTitle: 'إضافة مستند',
    uploadSubIdle: 'ملف PDF قابل لتحديد النص أو ملف txt.',
    toolsTitle: 'أدوات',
    toolPomodoro: 'بومودورو',
    toolPomodoroSub: 'جلسات تركيز',
    toolCalendar: 'التقويم',
    toolCalendarSub: 'خطط وتابع مراجعتك',
    emptyTitle: 'لا يوجد مستند بعد',
    emptySub: 'أضف درساً بصيغة PDF لإنشاء ملخصات وأسئلة اختيار من متعدد وبطاقات تعلّم.',
    pagesLabel: (n) => `${n} صفحة`,
    readyLabel: 'جاهز',
    deleteConfirmTitle: 'حذف هذا المستند؟',
    deleteConfirmMsg: (name) => `سيتم إزالة "${name}" من التطبيق.`,
    cancel: 'إلغاء',
    deleteConfirm: 'حذف',
    readingFile: 'قراءة الملف…',
    analyzing: 'تحليل المستند…',
    analyzingPages: (a, b, total) => `تحليل الصفحات ${a}-${b} من ${total}…`,
    sendingFile: 'إرسال الملف…',
    finalizing: 'الإنهاء…',
    chunking: 'تقسيم إلى فصول…',
    done: 'تم!',
    pdfUnreadableTitle: 'ملف PDF غير قابل للقراءة',
    pdfUnreadableMsg: 'قد يكون هذا الملف نسخة ممسوحة ضوئياً أو محمياً. جرب ملفاً آخر.',
    insufficientTextTitle: 'نص غير كافٍ',
    insufficientTextMsg: (chars, pages) => `تم استخراج ${chars} حرفاً فقط من ${pages} صفحة. من المرجح أن هذا الملف نسخة ممسوحة ضوئياً (صورة) — يجب أن يكون النص قابلاً للتحديد.`,
    genericErrorTitle: 'خطأ',
    genericErrorMsg: 'تعذر تحميل هذا الملف.',
  },
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function callExtractBatch(userId: string, storagePath: string, startPage: number) {
  const res = await fetch(EXTRACT_PDF_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey':        SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ userId, storagePath, startPage }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as any;
    throw new Error(err.error || `extract-pdf ${res.status}`);
  }
  return await res.json() as {
    text: string; startPage: number; endPage: number; totalPages: number;
    isLastBatch: boolean; batchFailed: boolean;
  };
}

// Découpage serveur par lots de pages (Edge Function) — pour les PDF que
// Claude refuse (>100p) ou que Gemini tronque en un seul appel. Boucle lot par
// lot pour permettre un vrai affichage de progression pendant le traitement.
async function extractPDFViaEdgeFunction(
  fileUri: string,
  fileName: string,
  userId: string,
  s: ReviserStrings,
  onProgress: (step: string, percent: number) => void
): Promise<{ text: string; pages: number }> {
  onProgress(s.sendingFile, 5);
  const FileSystem = require('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
  const bytes = base64ToUint8Array(base64);

  const storagePath = `${userId}/${Date.now()}_${fileName}`;
  const { error: upErr } = await supabase.storage
    .from('course-pdfs')
    .upload(storagePath, bytes, { contentType: 'application/pdf' });
  if (upErr) throw new Error(`Upload Storage échoué : ${upErr.message}`);

  const texts: string[] = [];
  let startPage = 0;
  let totalPages = 0;
  let failedBatches = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await callExtractBatch(userId, storagePath, startPage);
    totalPages = batch.totalPages;
    if (batch.text) texts.push(batch.text);
    if (batch.batchFailed) failedBatches++;

    const percent = 10 + Math.round((batch.endPage / totalPages) * 85);
    onProgress(s.analyzingPages(batch.startPage + 1, batch.endPage, totalPages), percent);

    if (batch.isLastBatch) break;
    startPage = batch.endPage;
  }

  onProgress(s.finalizing, 98);
  console.log('[Reviser] extract-pdf terminé —', failedBatches, 'lot(s) en échec sur', Math.ceil(totalPages / 30));
  return { text: texts.join('').trim(), pages: totalPages };
}

export default function ReviserScreen() {
  const { courses, addCourse, removeCourse, setActiveCourse, userId, uiLanguage, fiches, flashcards } = useAppStore();
  const t = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const rtl = uiLanguage === 'ar';
  const s = STRINGS[rtl ? 'ar' : 'fr'];
  const [uploading, setUploading] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  const pickFile = async () => {
    // Limite de documents du plan (Gratuit : 1, Standard : 5, Premium : illimité).
    const { planLimits, courses: mine } = useAppStore.getState();
    if (planLimits?.maxDocuments != null && mine.length >= planLimits.maxDocuments) {
      Alert.alert(s.docLimitTitle, s.docLimitMsg(planLimits.maxDocuments), [
        { text: s.cancel, style: 'cancel' },
        { text: s.seePlans, onPress: () => navigation.navigate('Subscription') },
      ]);
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'text/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      const isTxt = file.name.toLowerCase().endsWith('.txt');

      setUploading(true);
      setProgressStep(s.readingFile);
      setProgressPercent(3);
      let content = '';
      let pages = 1;

      if (isTxt) {
        const FileSystem = require('expo-file-system/legacy');
        content = await FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' });
        pages = (content.match(/\[Page \d+\]/g) || []).length || Math.ceil(content.split(/\s+/).length / 300);
        setProgressPercent(90);
      } else {
        let ok = false;
        const pageEstimate = await estimatePDFPageCount(file.uri).catch(() => 0);
        // Seuil proportionnel au nombre de pages — un vrai cours médical fait
        // largement plus de 300 caractères/page ; en dessous, le texte est tronqué.
        const minExpected = Math.max(1000, pageEstimate * 300);

        // Gemini par défaut (bien moins cher) — Claude uniquement en secours si Gemini échoue,
        // et seulement si le PDF fait ≤100 pages (limite dure de l'API Claude).
        setProgressStep(s.analyzing);
        setProgressPercent(15);
        try {
          const g = await extractPDFWithGemini(file.uri);
          console.log('[Reviser] Gemini:', g.text.trim().length, 'chars sur', pageEstimate, 'pages estimées (attendu ≥', minExpected, ')');
          console.log('[Reviser] Gemini aperçu:', g.text.trim().slice(0, 300));
          if (g.text.trim().length >= minExpected) {
            content = g.text; pages = g.pages; ok = true;
            setProgressPercent(90);
          }
        } catch (e: any) { console.log('[Reviser] Gemini erreur:', e?.message); }

        // Gemini en un seul appel a échoué ou tronqué (typiquement au-delà d'une
        // grosse centaine de pages) → découpage par lots côté serveur (Edge Function).
        if (!ok && userId) {
          try {
            const r = await extractPDFViaEdgeFunction(file.uri, file.name, userId, s, (step, percent) => {
              setProgressStep(step);
              setProgressPercent(percent);
            });
            console.log('[Reviser] extract-pdf (par lots):', r.text.trim().length, 'chars sur', r.pages, 'pages');
            if (r.text.trim().length >= Math.max(1000, r.pages * 200)) {
              content = r.text; pages = r.pages; ok = true;
              setProgressPercent(95);
            }
          } catch (e: any) { console.log('[Reviser] extract-pdf erreur:', e?.message); }
        }

        if (!ok) {
          if (pageEstimate > 0 && pageEstimate <= 100) {
            try {
              const c = await extractPDFWithClaude(file.uri);
              console.log('[Reviser] Claude:', c.text.trim().length, 'chars');
              content = c.text; pages = c.pages; ok = true;
            } catch (e: any) { console.log('[Reviser] Claude erreur:', e?.message); }
          } else {
            console.log('[Reviser] Claude sauté —', pageEstimate, 'pages estimées (>100)');
          }
        }
        if (!ok) {
          try {
            const extracted = await extractPDFText(file.uri);
            console.log('[Reviser] JS parser:', extracted.text.trim().length, 'chars');
            content = extracted.text; pages = extracted.pages; ok = true;
          } catch (e: any) { console.log('[Reviser] JS parser erreur:', e?.message); }
        }
        if (!ok) {
          setUploading(false);
          setProgressStep(''); setProgressPercent(0);
          Alert.alert(s.pdfUnreadableTitle, s.pdfUnreadableMsg);
          return;
        }
      }

      if (!content.trim() || content.trim().length < 500) {
        setUploading(false);
        setProgressStep(''); setProgressPercent(0);
        Alert.alert(s.insufficientTextTitle, s.insufficientTextMsg(content.trim().length, pages));
        return;
      }

      setProgressStep(s.chunking);
      setProgressPercent(96);
      const chunks = autoChunk(content);
      const course: Course = {
        id: Date.now().toString(),
        name: file.name.replace(/\.(pdf|txt)$/i, ''),
        subjectName: '',
        fileName: file.name,
        fileUri: file.uri,
        pages,
        uploadedAt: new Date(),
        active: true,
        content,
        chunks,
      };
      addCourse(course);
      setProgressStep(s.done);
      setProgressPercent(100);
      setTimeout(() => { setUploading(false); setProgressStep(''); setProgressPercent(0); }, 500);
    } catch {
      setUploading(false);
      setProgressStep('');
      setProgressPercent(0);
      Alert.alert(s.genericErrorTitle, s.genericErrorMsg);
    }
  };

  const confirmDelete = (course: Course) => {
    Alert.alert(
      s.deleteConfirmTitle,
      s.deleteConfirmMsg(course.name),
      [
        { text: s.cancel, style: 'cancel' },
        { text: s.deleteConfirm, style: 'destructive', onPress: () => removeCourse(course.id) },
      ]
    );
  };

  const openDocument = (course: Course) => {
    setActiveCourse(course.id);
    navigation.navigate('Document', { courseId: course.id });
  };

  return (
    <View style={[styles.root, { backgroundColor: TEAL_BG }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerHalo1} />
        <View style={styles.headerHalo2} />
        <Text style={[styles.headerTitle, rtl && styles.textRight]}>{s.headerTitle}</Text>
        <Text style={[styles.headerSub, rtl && styles.textRight]}>{s.headerSub}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
      >
        <TouchableOpacity
          style={styles.uploadZone}
          onPress={pickFile}
          disabled={uploading}
          activeOpacity={0.9}
        >
          <View style={styles.uploadHalo1} />
          <View style={styles.uploadHalo2} />
          {uploading ? (
            <>
              <Text style={styles.uploadPercent}>{progressPercent}%</Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` as any }]} />
              </View>
              <Text style={styles.uploadSub}>{progressStep}</Text>
            </>
          ) : (
            <>
              <View style={styles.uploadIconWrap}>
                <Ionicons name="cloud-upload-outline" size={26} color="#fff" />
              </View>
              <Text style={styles.uploadTitle}>{s.uploadTitle}</Text>
              <Text style={styles.uploadSub}>{s.uploadSubIdle}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.toolsTitle, { color: t.text }, rtl && styles.textRight]}>{s.toolsTitle}</Text>
        <TouchableOpacity
          style={[styles.toolCard, { backgroundColor: t.surface }, rtl && { flexDirection: 'row-reverse' }]}
          onPress={() => navigation.navigate('Pomodoro')}
          activeOpacity={0.85}
        >
          <View style={[styles.toolIconWrap, rtl ? { marginLeft: 12 } : { marginRight: 12 }]}>
            <Ionicons name="timer-outline" size={22} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toolName, rtl && styles.textRight]}>{s.toolPomodoro}</Text>
            <Text style={[styles.toolSub, { color: t.textMuted }, rtl && styles.textRight]}>{s.toolPomodoroSub}</Text>
          </View>
          <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={t.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolCard, { backgroundColor: t.surface }, rtl && { flexDirection: 'row-reverse' }]}
          onPress={() => navigation.navigate('Calendar')}
          activeOpacity={0.85}
        >
          <View style={[styles.toolIconWrap, rtl ? { marginLeft: 12 } : { marginRight: 12 }]}>
            <Ionicons name="calendar-outline" size={22} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toolName, rtl && styles.textRight]}>{s.toolCalendar}</Text>
            <Text style={[styles.toolSub, { color: t.textMuted }, rtl && styles.textRight]}>{s.toolCalendarSub}</Text>
          </View>
          <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={t.textMuted} />
        </TouchableOpacity>

        {courses.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: t.surface }]}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="document-text-outline" size={26} color={TEAL} />
            </View>
            <Text style={[styles.emptyTitle, { color: t.text }]}>{s.emptyTitle}</Text>
            <Text style={[styles.emptySub, { color: t.textMuted }]}>
              {s.emptySub}
            </Text>
          </View>
        ) : (
          courses.map((c) => (
            <DocumentCard
              key={c.id}
              course={c}
              rtl={rtl}
              s={s}
              hasFiche={!!fiches[`${c.id}_0`]}
              hasFlash={(flashcards[c.id] ?? []).length > 0}
              onOpen={() => openDocument(c)}
              onDelete={() => confirmDelete(c)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function DocumentCard({
  course, rtl, s, hasFiche, hasFlash, onOpen, onDelete,
}: {
  course: Course; rtl: boolean; s: ReviserStrings;
  hasFiche: boolean; hasFlash: boolean;
  onOpen: () => void; onDelete: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 60, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }).start();

  return (
    <TouchableOpacity
      onPress={onOpen}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={0.95}
    >
      <Animated.View style={[styles.courseCard, rtl && { flexDirection: 'row-reverse' }, { transform: [{ scale }] }]}>
        <View style={[styles.pdfBox, rtl ? { marginLeft: 12 } : { marginRight: 12 }]}>
          <View style={styles.pdfBoxHalo} />
          <Ionicons name="document-text" size={22} color={TEAL} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.courseName, rtl && styles.textRight]} numberOfLines={2}>{course.name}</Text>
          <View style={[styles.courseMetaRow, rtl && { flexDirection: 'row-reverse' }]}>
            <Text style={styles.courseMeta}>{s.pagesLabel(course.pages)}</Text>
            {(hasFiche || hasFlash) && (
              <>
                <View style={styles.metaDot} />
                <View style={[styles.readyRow, rtl && { flexDirection: 'row-reverse' }]}>
                  {hasFiche && <Ionicons name="reader" size={12} color={TEAL} style={styles.readyIcon} />}
                  {hasFlash && <Ionicons name="albums" size={12} color={TEAL} style={styles.readyIcon} />}
                  <Text style={styles.readyTxt}>{s.readyLabel}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        <TouchableOpacity
          onPress={onDelete}
          hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={16} color="#CBD5E0" />
        </TouchableOpacity>
        <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={TEAL} />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  textRight: { textAlign: 'right', writingDirection: 'rtl' },

  header: {
    backgroundColor: NAVY,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerHalo1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(7,169,151,0.14)', top: -70, right: -40,
  },
  headerHalo2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(7,169,151,0.08)', bottom: -30, left: 20,
  },
  headerTitle: { fontFamily: SERIF, fontSize: 28, color: '#fff', letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: 12 },

  uploadZone: {
    backgroundColor: NAVY,
    borderRadius: 22, padding: 26, alignItems: 'center', gap: 6,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  uploadHalo1: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(7,169,151,0.16)', top: -60, right: -40,
  },
  uploadHalo2: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(7,169,151,0.1)', bottom: -20, left: 10,
  },
  uploadIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  uploadTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  uploadSub:   { fontSize: 12, marginTop: 2, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  uploadPercent: { fontFamily: SERIF, fontSize: 30, color: '#fff', marginBottom: 4 },
  progressBarBg: {
    width: '100%', height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', marginBottom: 8,
  },
  progressBarFill: { height: 6, borderRadius: 3, backgroundColor: TEAL },

  toolsTitle: { fontSize: 13, fontWeight: '700', marginTop: 22, marginBottom: 10, letterSpacing: 0.3 },
  toolCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 18, padding: 16, marginBottom: 18,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  toolIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center',
  },
  toolName: { fontSize: 14, fontWeight: '700', color: NAVY },
  toolSub:  { fontSize: 12, marginTop: 2 },

  emptyState: {
    borderRadius: 20, padding: 28, alignItems: 'center', gap: 8,
  },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  emptySub:   { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  courseCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(11,30,52,0.05)',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  pdfBox: {
    width: 48, height: 48, borderRadius: 15,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  pdfBoxHalo: {
    position: 'absolute', width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(7,169,151,0.14)', top: -18, right: -18,
  },
  courseName: { fontSize: 14.5, fontWeight: '700', color: NAVY, lineHeight: 19 },
  courseMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  courseMeta: { fontSize: 11.5, color: '#94A3B8', fontWeight: '500' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E0', marginHorizontal: 6 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  readyIcon: { marginRight: 1 },
  readyTxt: { fontSize: 11, color: TEAL, fontWeight: '700' },
  deleteBtn: { paddingHorizontal: 8 },
});
