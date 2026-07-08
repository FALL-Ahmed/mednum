import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, Platform,
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
  onProgress: (step: string, percent: number) => void
): Promise<{ text: string; pages: number }> {
  onProgress('Envoi du fichier…', 5);
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
    onProgress(`Analyse des pages ${batch.startPage + 1}-${batch.endPage} sur ${totalPages}…`, percent);

    if (batch.isLastBatch) break;
    startPage = batch.endPage;
  }

  onProgress('Finalisation…', 98);
  console.log('[Reviser] extract-pdf terminé —', failedBatches, 'lot(s) en échec sur', Math.ceil(totalPages / 30));
  return { text: texts.join('').trim(), pages: totalPages };
}

export default function ReviserScreen() {
  const { courses, addCourse, removeCourse, setActiveCourse, userId } = useAppStore();
  const t = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'text/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      const isTxt = file.name.toLowerCase().endsWith('.txt');

      setUploading(true);
      setProgressStep('Lecture du fichier…');
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
        setProgressStep('Analyse du document…');
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
            const r = await extractPDFViaEdgeFunction(file.uri, file.name, userId, (step, percent) => {
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
          Alert.alert('PDF illisible', "Ce PDF est peut-être un scan ou protégé. Essaie un autre fichier.");
          return;
        }
      }

      if (!content.trim() || content.trim().length < 500) {
        setUploading(false);
        setProgressStep(''); setProgressPercent(0);
        Alert.alert(
          'Texte insuffisant',
          `Seulement ${content.trim().length} caractères extraits sur ${pages} pages. Ce PDF est probablement un scan (image) — le texte doit être sélectionnable.`
        );
        return;
      }

      setProgressStep('Découpage en chapitres…');
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
      setProgressStep('Terminé !');
      setProgressPercent(100);
      setTimeout(() => { setUploading(false); setProgressStep(''); setProgressPercent(0); }, 500);
    } catch {
      setUploading(false);
      setProgressStep('');
      setProgressPercent(0);
      Alert.alert('Erreur', 'Impossible de charger ce fichier.');
    }
  };

  const confirmDelete = (course: Course) => {
    Alert.alert(
      'Supprimer ce document ?',
      `"${course.name}" sera retiré de l'application.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => removeCourse(course.id) },
      ]
    );
  };

  const openFiche = (course: Course) => {
    setActiveCourse(course.id);
    navigation.navigate('Fiche');
  };

  const openQuiz = (course: Course) => {
    setActiveCourse(course.id);
    navigation.navigate('Quiz', { courseId: course.id });
  };

  return (
    <View style={[styles.root, { backgroundColor: TEAL_BG }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerHalo1} />
        <View style={styles.headerHalo2} />
        <Text style={styles.headerTitle}>Réviser</Text>
        <Text style={styles.headerSub}>Fiches de révision et QCM à partir de tes cours</Text>
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
              <Text style={styles.uploadTitle}>Ajouter un document</Text>
              <Text style={styles.uploadSub}>PDF sélectionnable ou fichier .txt</Text>
            </>
          )}
        </TouchableOpacity>

        {courses.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: t.surface }]}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="document-text-outline" size={26} color={TEAL} />
            </View>
            <Text style={[styles.emptyTitle, { color: t.text }]}>Aucun document pour l'instant</Text>
            <Text style={[styles.emptySub, { color: t.textMuted }]}>
              Ajoute un PDF de cours pour générer des fiches et des QCM.
            </Text>
          </View>
        ) : (
          courses.map((c) => (
            <View key={c.id} style={[styles.courseCard, { backgroundColor: t.surface }]}>
              <View style={styles.courseAccent} />
              <View style={styles.courseInner}>
                <View style={styles.courseTop}>
                  <View style={styles.pdfBox}>
                    <Ionicons name="document-text" size={20} color={TEAL} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.courseName, { color: t.text }]} numberOfLines={1}>{c.name}</Text>
                    <Text style={[styles.courseMeta, { color: t.textMuted }]}>{c.pages} pages</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDelete(c)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={t.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.courseActions}>
                  <TouchableOpacity style={styles.ficheBtn} onPress={() => openFiche(c)} activeOpacity={0.85}>
                    <Ionicons name="reader-outline" size={16} color={NAVY} />
                    <Text style={styles.ficheBtnText}>Fiche</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quizBtn} onPress={() => openQuiz(c)} activeOpacity={0.85}>
                    <Ionicons name="help-circle-outline" size={16} color="#fff" />
                    <Text style={styles.quizBtnText}>QCM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

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
    borderRadius: 18, overflow: 'hidden',
    flexDirection: 'row',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },
  courseAccent: { width: 4, backgroundColor: TEAL },
  courseInner:  { flex: 1, padding: 14, gap: 12 },
  courseTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pdfBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: TEAL_BG, alignItems: 'center', justifyContent: 'center',
  },
  courseName: { fontSize: 14, fontWeight: '700' },
  courseMeta: { fontSize: 11, marginTop: 2 },

  courseActions: { flexDirection: 'row', gap: 8 },
  ficheBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: TEAL_BG, borderRadius: 12, paddingVertical: 10,
  },
  ficheBtnText: { fontSize: 13, fontWeight: '700', color: NAVY },
  quizBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: NAVY, borderRadius: 12, paddingVertical: 10,
  },
  quizBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
