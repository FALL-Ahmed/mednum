import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { useAppStore, Course, CourseChunk } from '../store';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { SectionHeader, useTheme } from '../components';
import { extractPDFText } from '../utils/pdfExtractor';
import { extractPDFWithClaude, extractPDFWithGemini } from '../utils/rag';
import { autoChunk } from '../utils/courseChunker';

export default function CourseScreen() {
  const { courses, activeCourse, addCourse, removeCourse, setActiveCourse } = useAppStore();
  const t = useTheme();
  const navigation = useNavigation<any>();
  const [uploading, setUploading] = useState(false);
  const [pasteModal, setPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteName, setPasteName] = useState('');

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

      let content = '';
      let pages = 1;

      if (isTxt) {
        // Fichier texte exporté par export_text.py ou copié manuellement
        const FileSystem = require('expo-file-system/legacy');
        content = await FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' });
        pages = (content.match(/\[Page \d+\]/g) || []).length || Math.ceil(content.split(/\s+/).length / 300);
      } else {
        // Ordre : Claude → Gemini → parseur JS
        let ok = false;
        try {
          const c = await extractPDFWithClaude(file.uri);
          console.log('[CourseScreen] Claude:', c.text.trim().length, 'chars');
          content = c.text; pages = c.pages; ok = true;
        } catch (e: any) { console.log('[CourseScreen] Claude erreur:', e?.message); }
        if (!ok) {
          try {
            const g = await extractPDFWithGemini(file.uri);
            console.log('[CourseScreen] Gemini:', g.text.trim().length, 'chars');
            if (g.text.trim().length >= 1000) {
              content = g.text; pages = g.pages; ok = true;
            }
          } catch (e: any) { console.log('[CourseScreen] Gemini erreur:', e?.message); }
        }
        if (!ok) {
          try {
            const extracted = await extractPDFText(file.uri);
            console.log('[CourseScreen] JS extractor:', extracted.text.trim().length, 'chars');
            content = extracted.text; pages = extracted.pages; ok = true;
          } catch (e: any) { console.log('[CourseScreen] JS erreur:', e?.message); }
        }
        if (!ok) {
          setUploading(false);
          Alert.alert(
            'PDF illisible',
            'Ce PDF est peut-être un scan ou protégé.\n\nUtilise "Coller le texte manuellement" ci-dessous.',
            [{ text: 'OK' }]
          );
          return;
        }
      }

      if (!content.trim() || content.trim().length < 500) {
        setUploading(false);
        Alert.alert(
          'Texte insuffisant',
          `Seulement ${content.trim().length} caractères extraits sur ${pages} pages.\n\nCe PDF est probablement un scan (image) ou protégé. Le texte doit être sélectionnable.\n\n👉 Utilise "Coller le texte manuellement" après avoir copié le texte depuis un lecteur PDF.`,
          [{ text: 'OK' }]
        );
        return;
      }

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
      setUploading(false);

      Alert.alert(
        'Cours chargé !',
        `"${course.name}" — ${pages} pages, ${chunks.length} chapitre(s) détecté(s).`,
        [{ text: 'Voir les chapitres →', onPress: () => navigation.navigate('SkillTree') }]
      );
    } catch (e) {
      setUploading(false);
      Alert.alert('Erreur', 'Impossible de charger ce fichier.');
    }
  };

  const addManualText = () => {
    if (!pasteText.trim() || !pasteName.trim()) return;
    const content = pasteText.trim();
    const chunks = autoChunk(content);
    const course: Course = {
      id: Date.now().toString(),
      name: pasteName.trim(),
      subjectName: '',
      fileName: pasteName.trim() + '.txt',
      fileUri: '',
      pages: Math.ceil(content.split(/\s+/).length / 300),
      uploadedAt: new Date(),
      active: true,
      content,
      chunks,
    };
    addCourse(course);
    setPasteModal(false);
    setPasteText('');
    setPasteName('');
    navigation.navigate('SkillTree');
  };

  const confirmDelete = (course: Course) => {
    Alert.alert(
      'Supprimer le cours ?',
      `"${course.name}" sera supprimé de l'application.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => removeCourse(course.id),
        },
      ]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blue} />
      <View style={styles.header}>
        <SafeAreaView>
          <Text style={styles.headerTitle}>Mes cours</Text>
          <Text style={styles.headerSub}>Charge tes PDF pour activer l'IA</Text>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* Upload zone */}
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}>
          <TouchableOpacity
            style={[styles.uploadZone, { borderColor: Colors.blue, backgroundColor: Colors.blueLight }]}
            onPress={pickFile}
            disabled={uploading}
            activeOpacity={0.75}
          >
            {uploading ? (
              <>
                <ActivityIndicator color={Colors.blue} size="large" />
                <Text style={styles.uploadingText}>Extraction en cours… (quelques secondes)</Text>
              </>
            ) : (
              <>
                <View style={styles.uploadIconCircle}>
                  <Text style={{ fontSize: 28 }}>📄</Text>
                </View>
                <Text style={styles.uploadTitle}>Sélectionne un PDF ou TXT</Text>
                <Text style={styles.uploadSub}>PDF sélectionnable ou fichier .txt exporté</Text>
                <View style={styles.uploadBtn}>
                  <Text style={styles.uploadBtnText}>+ Ajouter un cours</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Option texte manuel */}
        <TouchableOpacity
          style={[styles.pasteBtn, { borderColor: t.border, backgroundColor: t.surface }]}
          onPress={() => setPasteModal(true)}
        >
          <Text style={[styles.pasteBtnText, { color: t.textMuted }]}>
            ✏️  PDF difficile à lire ? Colle le texte manuellement
          </Text>
        </TouchableOpacity>

        {/* Course list */}
        <SectionHeader title={`Cours chargés (${courses.length})`} />
        {courses.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🎒</Text>
            <Text style={[styles.emptyText, { color: t.textMuted }]}>
              Aucun cours pour l'instant.{'\n'}Ajoute ton premier PDF !
            </Text>
          </View>
        ) : (
          courses.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setActiveCourse(c.id)}
              activeOpacity={0.8}
              style={[
                styles.courseCard,
                {
                  backgroundColor: t.surface,
                  borderColor: c.active ? Colors.blue : t.border,
                  borderWidth: c.active ? 1.5 : 0.5,
                },
                Shadows.sm,
              ]}
            >
              <View style={[styles.pdfBox, { backgroundColor: c.active ? Colors.blueLight : t.surfaceAlt }]}>
                <Text style={{ fontSize: 22 }}>📄</Text>
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.courseNameRow}>
                  <Text style={[styles.courseName, { color: t.text }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {c.active && (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>Actif</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.courseMeta, { color: t.textMuted }]}>
                  {c.pages} pages · {c.content ? `${Math.round(c.content.length / 1000)}k chars` : 'chargement...'}
                </Text>

                {/* Progress bar (visual only) */}
                <View style={[styles.progressBg, { backgroundColor: t.border }]}>
                  <View style={styles.progressFill} />
                </View>
              </View>

              <TouchableOpacity
                onPress={() => confirmDelete(c)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteText}>🗑️</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}

        {/* Modal : coller le texte manuellement */}
      <Modal visible={pasteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Coller le texte du cours</Text>
            <Text style={[styles.modalSub, { color: t.textMuted }]}>
              Copie le texte depuis ton PDF (sélectionne tout → copier) et colle-le ici.
            </Text>
            <TextInput
              style={[styles.modalNameInput, { color: t.text, borderColor: t.border, backgroundColor: t.surfaceAlt }]}
              placeholder="Nom du cours"
              placeholderTextColor={t.textMuted}
              value={pasteName}
              onChangeText={setPasteName}
            />
            <TextInput
              style={[styles.modalTextInput, { color: t.text, borderColor: t.border, backgroundColor: t.surfaceAlt }]}
              placeholder="Colle le texte ici…"
              placeholderTextColor={t.textMuted}
              value={pasteText}
              onChangeText={setPasteText}
              multiline
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: t.border }]}
                onPress={() => { setPasteModal(false); setPasteText(''); setPasteName(''); }}
              >
                <Text style={{ color: t.text, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: Colors.blue, opacity: (!pasteText.trim() || !pasteName.trim()) ? 0.4 : 1 }]}
                onPress={addManualText}
                disabled={!pasteText.trim() || !pasteName.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tips */}
        <View style={[styles.tipCard, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
          <Text style={[styles.tipTitle, { color: t.text }]}>💡 Conseils</Text>
          <Text style={[styles.tipText, { color: t.textMuted }]}>
            • Jusqu'à 2 cours chargés simultanément{'\n'}
            • PDF de 100+ pages supportés (RAG intégré){'\n'}
            • Le texte doit être sélectionnable (pas un scan){'\n'}
            • Appuie sur un cours pour l'activer
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { backgroundColor: Colors.blue, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  headerTitle: { ...Typography.h2, color: '#fff', paddingTop: Spacing.sm },
  headerSub: { ...Typography.bodySmall, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  uploadZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 160,
    justifyContent: 'center',
  },
  uploadIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  uploadTitle: { ...Typography.label, color: Colors.blue },
  uploadSub: { ...Typography.caption, color: Colors.textSecondary },
  uploadBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.blue,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  uploadBtnText: { ...Typography.label, color: '#fff' },
  uploadingText: { ...Typography.label, color: Colors.blue, marginTop: Spacing.sm },
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginVertical: 5,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  pdfBox: {
    width: 48,
    height: 52,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  courseName: { ...Typography.label, flex: 1 },
  activePill: {
    backgroundColor: Colors.blueLight,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  activePillText: { ...Typography.labelSmall, color: Colors.blue },
  courseMeta: { ...Typography.caption },
  progressBg: { height: 3, borderRadius: 2, marginTop: 6 },
  progressFill: { height: 3, width: '65%', backgroundColor: Colors.green, borderRadius: 2 },
  deleteBtn: { padding: 4 },
  deleteText: { fontSize: 18 },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { ...Typography.body, textAlign: 'center', lineHeight: 26 },
  pasteBtn: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    borderStyle: 'dashed' as const,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pasteBtnText: { fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  modalTitle: { ...Typography.h3 },
  modalSub: { ...Typography.bodySmall, lineHeight: 20 },
  modalNameInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: 10,
    fontSize: 14,
  },
  modalTextInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: 10,
    fontSize: 13,
    height: 180,
    textAlignVertical: 'top',
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'flex-end' },
  modalBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.sm,
  },
  tipCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    padding: Spacing.lg,
  },
  tipTitle: { ...Typography.label, marginBottom: 8 },
  tipText: { ...Typography.bodySmall, lineHeight: 22 },
});
