import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  SafeAreaView,
  StatusBar,
  Modal,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { useAppStore, Message, CourseChunk } from '../store';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { SourceBadge, TypingIndicator, useTheme } from '../components';
import { askRAG, askWithImage, transcribeAudio, generateSummary, extractPDFWithGemini, NiveauType, detecterMode, computeNiveau } from '../utils/rag';
import { extractPDFText } from '../utils/pdfExtractor';
import { getSubjectStyle, getProfessorName } from '../utils/subjectStyles';
import { ProfessorAvatar } from '../components/ProfessorAvatar';
import { supabase } from '../lib/supabase';

// ─── Bubble ──────────────────────────────────────────────────────────────────

const PulseDot = React.memo(function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: anim }} />;
});

const ChatBubble = React.memo(function ChatBubble({
  msg,
  accentColor,
  lightColor,
  bgColor,
  onFeedback,
  onSuggestion,
  onSpeak,
  isSpeaking,
}: {
  msg: Message;
  accentColor: string;
  lightColor: string;
  bgColor: string;
  onFeedback: (id: string, f: 'up' | 'down') => void;
  onSuggestion: (q: string) => void;
  onSpeak: (msg: Message) => void;
  isSpeaking: boolean;
}) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (msg.role === 'user') {
    return (
      <View style={styles.rowUser}>
        <View style={[styles.bubbleUser, { backgroundColor: bgColor }]}>
          {msg.userImageUri && (
            <Image
              source={{ uri: msg.userImageUri }}
              style={styles.bubbleUserImage as any}
              resizeMode="cover"
            />
          )}
          {msg.pdfName && (
            <View style={styles.bubblePDFBadge}>
              <Text style={styles.bubblePDFIcon}>📄</Text>
              <Text style={styles.bubblePDFName} numberOfLines={1}>{msg.pdfName}</Text>
            </View>
          )}
          {msg.content ? (
            <Text style={[styles.bubbleUserText, (msg.userImageUri || msg.pdfName) && { marginTop: 6 }]}>
              {msg.content}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (msg.role === 'error') {
    return (
      <View style={styles.rowAI}>
        <View style={styles.aiAvatar}>
          <Text style={{ fontSize: 14 }}>⚠️</Text>
        </View>
        <View style={[styles.bubbleAI, { backgroundColor: Colors.errorLight, borderColor: Colors.error }]}>
          <Text style={[styles.bubbleAIText, { color: Colors.error }]}>{msg.content}</Text>
        </View>
      </View>
    );
  }

  if (msg.role === 'refusal') {
    return (
      <View style={styles.rowAI}>
        <View style={[styles.aiAvatar, { backgroundColor: Colors.blueLight }]}>
          <Text style={{ fontSize: 14 }}>🤔</Text>
        </View>
        <View style={[styles.bubbleAI, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
          <Text style={[styles.bubbleAIText, { color: t.textMuted }]}>{msg.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rowAI}>
      <View style={[styles.aiAvatar, { backgroundColor: lightColor }]}>
        <Text style={{ fontSize: 14 }}>🎓</Text>
      </View>
      <View style={[styles.bubbleAI, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
        <Text style={[styles.bubbleAIText, { color: t.text }]}>{msg.content}</Text>
        {msg.images && msg.images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
            {msg.images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.msgImage as any} resizeMode="contain" />
            ))}
          </ScrollView>
        )}
        {msg.hallucination && (
          <View style={styles.hallucinationBadge}>
            <Text style={styles.hallucinationText}>⚠️ Vérifie dans ton cours — cette réponse n'est peut-être pas dans ton manuel</Text>
          </View>
        )}
        {msg.sources && msg.sources.length > 0 && <SourceBadge pages={msg.sources} />}
        {msg.suggestions && msg.suggestions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggRow}>
            {msg.suggestions.map((q, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.suggChip, { backgroundColor: lightColor, borderColor: accentColor }]}
                onPress={() => onSuggestion(q)}
              >
                <Text style={[styles.suggText, { color: accentColor }]}>💡 {q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <View style={styles.feedbackRow}>
          <TouchableOpacity
            onPress={() => onFeedback(msg.id, 'up')}
            style={[styles.fbBtn, msg.feedback === 'up' && { backgroundColor: lightColor, borderColor: accentColor }]}
          >
            <Ionicons name="thumbs-up-outline" size={13} color={msg.feedback === 'up' ? accentColor : '#9CA3AF'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onFeedback(msg.id, 'down')}
            style={[styles.fbBtn, msg.feedback === 'down' && { backgroundColor: '#FEF2F2', borderColor: Colors.error }]}
          >
            <Ionicons name="thumbs-down-outline" size={13} color={msg.feedback === 'down' ? Colors.error : '#9CA3AF'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleCopy(msg.content)}
            style={[styles.fbBtn, copied && { backgroundColor: lightColor, borderColor: accentColor }]}
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={copied ? accentColor : '#9CA3AF'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onSpeak(msg)}
            style={[styles.fbBtn, isSpeaking && { backgroundColor: lightColor, borderColor: accentColor }]}
          >
            <Ionicons name={isSpeaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={13} color={isSpeaking ? accentColor : '#9CA3AF'} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ emoji, subjectName, courseName, accentColor, lightColor, t }: any) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyEmojiWrap, { backgroundColor: lightColor }]}>
        <Text style={styles.emptyEmoji}>{emoji}</Text>
      </View>
      {courseName ? (
        <>
          <Text style={[styles.emptyTitle, { color: t.text }]}>Prêt à apprendre !</Text>
          <Text style={[styles.emptyCourse, { color: accentColor }]}>{subjectName}</Text>
          <Text style={[styles.emptyHint, { color: t.textMuted }]}>
            Pose n'importe quelle question sur ce cours
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.emptyTitle, { color: t.text }]}>Aucun cours chargé</Text>
          <Text style={[styles.emptySub, { color: t.textMuted }]}>
            Va dans l'onglet Cours et sélectionne une matière
          </Text>
        </>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ChatScreen({ route }: any) {
  const prefill = route?.params?.prefill;
  const {
    currentMessages, activeCourse, isLoading,
    addMessage, setLoading, clearChat, saveChatSession, setFeedback,
    studentName, updateCourseChunks, difficultyScore, updateDifficulty,
    trackConcept, addXP, updateChapterMastery, activeChapterIndex,
  } = useAppStore();
  const t = useTheme();
  const navigation = useNavigation<any>();
  const [input, setInput] = useState(prefill || '');
  const [showNoCourseModal, setShowNoCourseModal] = useState(false);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [chapterSummaryTitle, setChapterSummaryTitle] = useState('');
  const [chapterSummaryContent, setChapterSummaryContent] = useState('');
  const [chapterSummaryLoading, setChapterSummaryLoading] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [pendingBase64, setPendingBase64] = useState<string | null>(null);
  // PDF temporaire : contexte additionnel pour 1 message, n'écrase PAS le cours actif
  const [attachedPDF, setAttachedPDF] = useState<{ name: string; text: string } | null>(null);
  const [isPDFLoading, setIsPDFLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const headerAnim = useRef(new Animated.Value(1)).current;
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const listRef = useRef<FlatList>(null);

  const subjectStyle = getSubjectStyle(activeCourse?.subjectName || '');

  useEffect(() => { if (prefill) setInput(prefill); }, [prefill]);

  // Re-fetche les chunks depuis Supabase à chaque ouverture du Chat (pick up admin edits)
  useEffect(() => {
    if (!activeCourse?.id) return;
    supabase.from('courses').select('chunks').eq('id', activeCourse.id).single()
      .then(({ data }) => {
        if (!data?.chunks) return;
        try {
          const chunks: CourseChunk[] = JSON.parse(data.chunks);
          updateCourseChunks(activeCourse.id, chunks);
        } catch {}
      });
  }, [activeCourse?.id]);

  const scrollToBottom = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'L\'accès au micro est nécessaire.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      Alert.alert('Erreur', 'Impossible de démarrer l\'enregistrement.');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) return;
      setIsTranscribing(true);
      const text = await transcribeAudio(uri);
      if (text) setInput(text);
    } catch {
      Alert.alert('Transcription échouée', 'Réessaie ou tape ta question.');
    } finally {
      setIsTranscribing(false);
      recordingRef.current = null;
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const handleSpeak = useCallback((msg: Message) => {
    if (speakingMsgId === msg.id) {
      Speech.stop();
      setSpeakingMsgId(null);
    } else {
      Speech.stop();
      Speech.speak(msg.content, {
        language: 'fr-FR',
        rate: 0.9,
        onDone: () => setSpeakingMsgId(null),
        onError: () => setSpeakingMsgId(null),
      });
      setSpeakingMsgId(msg.id);
    }
  }, [speakingMsgId]);

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'L\'accès à la galerie est nécessaire.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingUri(result.assets[0].uri);
      setPendingBase64(result.assets[0].base64 || null);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'L\'accès à la caméra est nécessaire.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingUri(result.assets[0].uri);
      setPendingBase64(result.assets[0].base64 || null);
    }
  };

  const confirmImage = () => {
    setImageUri(pendingUri);
    setImageBase64(pendingBase64);
    setPendingUri(null);
    setPendingBase64(null);
  };

  const cancelImage = () => {
    setPendingUri(null);
    setPendingBase64(null);
  };

  const pickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'public.pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      if (!file?.uri) { Alert.alert('Erreur', 'Fichier introuvable.'); return; }
      setIsPDFLoading(true);

      // Copie vers cache pour garantir un URI file:// lisible (Android content://)
      const FileSystem = require('expo-file-system');
      let fileUri = file.uri;
      if (!fileUri.startsWith('file://')) {
        const dest = FileSystem.cacheDirectory + (file.name || 'doc.pdf');
        await FileSystem.copyAsync({ from: fileUri, to: dest });
        fileUri = dest;
      }

      let text = '', ok = false;
      try {
        const g = await extractPDFWithGemini(fileUri);
        text = g.text; ok = true;
      } catch (e: any) {
        console.warn('[PDF] Gemini failed:', e?.message);
      }
      if (!ok) {
        try {
          const r = await extractPDFText(fileUri);
          text = r.text; ok = true;
        } catch (e: any) {
          console.warn('[PDF] JS parser failed:', e?.message);
        }
      }
      setIsPDFLoading(false);
      if (!ok || text.trim().length < 20) {
        Alert.alert('PDF illisible', 'Impossible d\'extraire le texte.\nEssaie de copier-coller le texte dans l\'onglet Cours.', [{ text: 'OK' }]);
        return;
      }
      const name = file.name.replace(/\.pdf$/i, '');
      setAttachedPDF({ name, text });
    } catch (e: any) {
      setIsPDFLoading(false);
      console.warn('[PDF] pickPDF error:', e?.message);
      Alert.alert('Erreur', 'Impossible d\'ouvrir ce fichier PDF.\n' + (e?.message ?? ''));
    }
  };

  const handleAttach = () => setShowAttachSheet(true);

  const collapseHeader = () =>
    Animated.timing(headerAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();

  const expandHeader = () =>
    Animated.timing(headerAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();

  const sendMessage = async () => {
    Keyboard.dismiss();
    expandHeader();
    const q = input.trim();
    if ((!q && !imageUri) || isLoading) return;

    // Mode image — pas besoin de cours
    if (imageBase64) {
      const displayContent = q || '';
      const capturedBase64 = imageBase64;
      const capturedUri = imageUri;
      setInput('');
      setImageUri(null);
      setImageBase64(null);
      addMessage({ id: Date.now().toString(), role: 'user', content: displayContent, userImageUri: capturedUri!, timestamp: new Date() });
      setLoading(true);
      scrollToBottom();
      const result = await askWithImage(q, capturedBase64, computeNiveau(difficultyScore), studentName || undefined);
      addMessage({
        id: (Date.now() + 1).toString(),
        role: result.type === 'answer' ? 'assistant' : result.type,
        content: result.content,
        sources: result.sources,
        suggestions: result.suggestions,
        timestamp: new Date(),
      });
      if (result.type === 'answer') addXP(15);
      setLoading(false);
      scrollToBottom();
      return;
    }

    if (!q || isLoading) return;
    if (!activeCourse) { setShowNoCourseModal(true); return; }

    // PDF : capturé et vidé du chip — le contenu reste dans l'historique API via apiContent
    const capturedPDF = attachedPDF;
    if (capturedPDF) setAttachedPDF(null);

    // Détection frustration
    const FRUSTRATED_RE = /\b(comprends?\s*pas|rien\s*compris?|trop\s*dur|sais?\s*pas|toujours\s*pas|encore\s*pas|j[e']\s*comprends?\s*pas|j[e']\s*sais?\s*pas|c['']est\s*(dur|compliqué|difficile)|je\s*bloque|j[e']\s*arrive\s*pas)\b/i;
    const frustrated = FRUSTRATED_RE.test(q);

    // Niveau d'indice : nb de corrections consécutives dans les 6 derniers messages user
    const recentUserMsgs = currentMessages.filter(m => m.role === 'user').slice(-6);
    const hintLevel = recentUserMsgs.filter(m => detecterMode(m.content) === 'correction').length;

    const questionWithPDF = capturedPDF
      ? `${q}\n\n[Document joint par l'élève : "${capturedPDF.name}"]\n---\n${capturedPDF.text.slice(0, 3000)}\n---`
      : q;

    setInput('');
    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: q,
      timestamp: new Date(),
      pdfName: capturedPDF?.name,
      apiContent: capturedPDF ? questionWithPDF : undefined,
    });
    setLoading(true);
    scrollToBottom();

    const niveau = computeNiveau(difficultyScore, frustrated);

    const chapterIdx = activeChapterIndex[activeCourse.id] ?? 0;
    const activeChapterTitle = activeCourse.chunks?.[chapterIdx]?.title || undefined;

    const result = await askRAG(questionWithPDF, activeCourse.content ?? '', activeCourse.name, currentMessages, niveau, activeCourse.chunks, studentName || undefined, activeCourse.id, hintLevel, frustrated, activeChapterTitle, activeCourse.subjectName);
    addMessage({
      id: (Date.now() + 1).toString(),
      role: result.type === 'answer' ? 'assistant' : result.type,
      content: result.content,
      sources: result.sources,
      images: result.images,
      suggestions: result.suggestions,
      hallucination: result.hallucination,
      timestamp: new Date(),
    });
    if (result.type === 'answer' && activeCourse.id) {
      trackConcept(activeCourse.id, q);
      addXP(result.mode === 'exercice' ? 20 : result.mode === 'correction' ? 15 : 10);
      // Mise à jour du niveau adaptatif (IRT 2-Up/1-Down)
      if (frustrated) updateDifficulty('frustration');
      else if (hintLevel >= 3) updateDifficulty('struggle');
      else if (hintLevel === 0 && (result.mode === 'exercice' || result.mode === 'correction')) updateDifficulty('success');
    }
    setLoading(false);
    scrollToBottom();
  };

  const handleNewChat = () => { saveChatSession(); clearChat(); };

  const handleChapterSummary = async (chunk: CourseChunk) => {
    setChapterSummaryTitle(chunk.title);
    setChapterSummaryContent('');
    setChapterSummaryLoading(true);
    try {
      const text = await generateSummary(chunk.content, chunk.title);
      setChapterSummaryContent(text);
    } catch {
      setChapterSummaryContent('Impossible de générer le résumé. Réessaie plus tard.');
    }
    setChapterSummaryLoading(false);
  };
  const handleSuggestion = useCallback((q: string) => setInput(q), []);
  const handleFeedback = useCallback((id: string, f: 'up' | 'down') => {
    setFeedback(id, f);
    // Mise à jour maîtrise du chapitre actif sur 👍
    if (f === 'up' && activeCourse) {
      const chapterIdx = activeChapterIndex[activeCourse.id] ?? 0;
      updateChapterMastery(activeCourse.id, chapterIdx, 8);
    }
    // Log vers Supabase pour améliorer le système
    const msg = currentMessages.find(m => m.id === id);
    const prevUser = currentMessages.slice(0, currentMessages.findIndex(m => m.id === id)).reverse().find(m => m.role === 'user');
    if (msg && activeCourse) {
      supabase.from('message_feedback').insert({
        course_id: activeCourse.id,
        course_name: activeCourse.name,
        question: prevUser?.content ?? '',
        response: msg.content?.slice(0, 500),
        rating: f,
        student_name: studentName || null,
      }).then(({ error }) => { if (error) console.log('[Feedback] Supabase error:', error.message); });
    }
  }, [setFeedback, currentMessages, activeCourse, studentName, updateChapterMastery, activeChapterIndex]);

  const renderItem = useCallback(({ item }: { item: Message }) => (
    <ChatBubble
      msg={item}
      accentColor={subjectStyle.accent}
      lightColor={subjectStyle.light}
      bgColor={subjectStyle.bg}
      onFeedback={handleFeedback}
      onSuggestion={handleSuggestion}
      onSpeak={handleSpeak}
      isSpeaking={speakingMsgId === item.id}
    />
  ), [handleFeedback, handleSuggestion, handleSpeak, speakingMsgId, subjectStyle]);

  const hasContent = activeCourse?.content && activeCourse.content.trim().length > 50;

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={subjectStyle.bg} />

      {/* ── Header (se replie quand l'input est focus) ── */}
      <Animated.View style={[
        styles.header,
        { backgroundColor: subjectStyle.bg, overflow: 'hidden' },
        { maxHeight: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] }) },
        { opacity: headerAnim },
      ]}>
        <SafeAreaView>
          <View style={styles.headerTop}>
            {/* Course info */}
            <View style={styles.headerLeft}>
              <View style={styles.headerAvatarWrap}>
                <ProfessorAvatar
                  subjectName={activeCourse?.subjectName || ''}
                  width={68}
                  height={90}
                  fallbackSize={58}
                  animate={false}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerProfName}>
                  {getProfessorName(activeCourse?.subjectName || '')}
                </Text>
                <Text style={styles.headerSubject}>
                  {activeCourse?.subjectName || 'ProfNum'}
                </Text>
              </View>
            </View>
            {/* Actions */}
            <View style={styles.headerBtns}>
              {activeCourse && (activeCourse.chunks?.length > 0 || hasContent) && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => { setChapterSummaryTitle(''); setChapterSummaryContent(''); setShowChapters(true); }}
                >
                  <Ionicons name="list-outline" size={20} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.newChatBtn} onPress={handleNewChat}>
                <Text style={styles.newChatText}>✦ Nouveau</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Niveau automatique affiché en lecture seule */}
          <View style={styles.niveauRow}>
            {(() => {
              const niv = computeNiveau(difficultyScore);
              const labels: Record<NiveauType, string> = { facile: 'Débutant', moyen: 'Intermédiaire', avance: 'Avancé' };
              const chipColors: Record<NiveauType, string> = { facile: '#22C55E', moyen: '#3B82F6', avance: '#F59E0B' };
              return (
                <View style={[styles.niveauChip, { backgroundColor: chipColors[niv] + '30', borderWidth: 1, borderColor: chipColors[niv] + '60' }]}>
                  <PulseDot color={chipColors[niv]} />
                  <Text style={[styles.niveauText, { color: '#fff', fontWeight: '800' }]}>
                    {labels[niv]}
                  </Text>
                </View>
              );
            })()}
          </View>
        </SafeAreaView>
      </Animated.View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        {currentMessages.length === 0 ? (
          <EmptyState
            emoji={subjectStyle.emoji}
            subjectName={activeCourse?.subjectName}
            courseName={activeCourse?.name}
            accentColor={subjectStyle.accent}
            lightColor={subjectStyle.light}
            t={t}
          />
        ) : (
          <FlatList
            ref={listRef}
            data={currentMessages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={isLoading ? (
              <View style={styles.typingWrap}>
                <View style={[styles.aiAvatar, { backgroundColor: subjectStyle.light }]}>
                  <Text style={{ fontSize: 14 }}>🎓</Text>
                </View>
                <View style={[styles.typingBubble, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
                  <TypingIndicator />
                </View>
              </View>
            ) : null}
          />
        )}

        {/* Chips pièces jointes (photo + PDF) */}
        {(imageUri || attachedPDF) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.attachBar, { backgroundColor: t.surface, borderTopColor: t.border }]}
            contentContainerStyle={styles.attachBarContent}
          >
            {imageUri && (
              <View style={styles.attachChip}>
                <Image source={{ uri: imageUri }} style={styles.attachThumb as any} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.attachClose}
                  onPress={() => { setImageUri(null); setImageBase64(null); }}
                >
                  <Text style={styles.attachCloseText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            {attachedPDF && (
              <View style={[styles.attachChip, styles.attachChipFile, { borderColor: t.border }]}>
                <View style={[styles.attachFileIconWrap, { backgroundColor: Colors.blueLight }]}>
                  <Text style={{ fontSize: 18 }}>📄</Text>
                </View>
                <Text style={[styles.attachFileName, { color: t.text }]} numberOfLines={1}>
                  {attachedPDF.name}
                </Text>
                <TouchableOpacity
                  style={styles.attachClose}
                  onPress={() => setAttachedPDF(null)}
                >
                  <Text style={styles.attachCloseText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
          <TouchableOpacity
            style={[styles.attachBtn, { backgroundColor: isPDFLoading ? Colors.blueLight : 'transparent' }]}
            onPress={handleAttach}
            activeOpacity={0.7}
            disabled={isPDFLoading}
          >
            {isPDFLoading
              ? <ActivityIndicator size="small" color={Colors.blue} />
              : <Ionicons name="attach" size={20} color="#6B7280" />
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.micBtn, isRecording && styles.micBtnActive]}
            onPress={toggleRecording}
            activeOpacity={0.7}
            disabled={isTranscribing}
          >
            {isTranscribing
              ? <ActivityIndicator size="small" color={Colors.blue} />
              : <Ionicons name={isRecording ? 'stop' : 'mic'} size={20} color={isRecording ? Colors.error : '#6B7280'} />
            }
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { backgroundColor: t.bg, color: t.text, borderColor: t.border }]}
            placeholder="Pose ta question…"
            placeholderTextColor={t.textMuted}
            value={input}
            onChangeText={setInput}
            onFocus={collapseHeader}
            onBlur={expandHeader}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            blurOnSubmit
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: subjectStyle.bg },
              ((!input.trim() && !imageUri) || isLoading) && { opacity: 0.35 },
            ]}
            onPress={sendMessage}
            disabled={(!input.trim() && !imageUri) || isLoading}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <SafeAreaView style={{ backgroundColor: t.surface }} />
      </KeyboardAvoidingView>

      {/* Modal Chapitres + Résumé par chapitre */}
      <Modal visible={showChapters} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.summaryRoot, { backgroundColor: t.bg }]}>
          <View style={[styles.summaryHeader, { backgroundColor: subjectStyle.bg }]}>
            <View style={styles.summaryHeaderLeft}>
              {chapterSummaryTitle ? (
                <TouchableOpacity
                  onPress={() => { setChapterSummaryTitle(''); setChapterSummaryContent(''); }}
                  style={{ marginRight: 12, padding: 4 }}
                >
                  <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
              ) : (
                <Text style={styles.summaryHeaderEmoji}>{subjectStyle.emoji}</Text>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryHeaderLabel}>
                  {chapterSummaryTitle ? 'RÉSUMÉ DU CHAPITRE' : 'CHAPITRES DU PROGRAMME'}
                </Text>
                {chapterSummaryTitle ? (
                  <Text style={styles.summaryHeaderCourse} numberOfLines={1}>
                    {chapterSummaryTitle}
                  </Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity
              onPress={() => { setShowChapters(false); setChapterSummaryTitle(''); setChapterSummaryContent(''); }}
              style={styles.summaryClose}
            >
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {chapterSummaryTitle ? (
            /* ── Vue résumé d'un chapitre ── */
            <ScrollView contentContainerStyle={styles.summaryBody} showsVerticalScrollIndicator={false}>
              {chapterSummaryLoading ? (
                <View style={styles.summaryLoading}>
                  <Ionicons name="hourglass-outline" size={36} color={subjectStyle.accent} style={{ marginBottom: 16 }} />
                  <Text style={[styles.summaryLoadingText, { color: t.text }]}>
                    L'IA lit le chapitre…
                  </Text>
                  <Text style={[{ color: t.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' }]}>
                    5 à 10 secondes
                  </Text>
                </View>
              ) : (
                chapterSummaryContent.split('\n').map((line, i) => {
                  if (!line.trim()) return <View key={i} style={{ height: 6 }} />;
                  const isTitle = /^[🎯📌💡❓🔑🗺️⚠️🧠]/.test(line.trim());
                  return (
                    <Text key={i} style={isTitle
                      ? [styles.summaryTitle, { color: subjectStyle.bg }]
                      : [styles.summaryLine, { color: t.text }]
                    }>{line}</Text>
                  );
                })
              )}
            </ScrollView>
          ) : (
            /* ── Liste des chapitres ── */
            <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}>
              <Text style={[{ fontSize: 13, marginBottom: 16, lineHeight: 20 }, { color: t.textMuted }]}>
                Appuie sur un chapitre pour poser une question, ou sur le bouton résumé pour en obtenir une synthèse.
              </Text>
              {activeCourse?.chunks?.map((chunk, i) => (
                <View
                  key={i}
                  style={[styles.chapterItem, { backgroundColor: t.surface, borderColor: t.border }]}
                >
                  <View style={[styles.chapterNum, { backgroundColor: subjectStyle.light }]}>
                    <Text style={[styles.chapterNumText, { color: subjectStyle.bg }]}>{i + 1}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => { setShowChapters(false); setInput(`Explique-moi "${chunk.title}"`); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chapterTitle, { color: t.text }]}>{chunk.title}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chapterSummaryBtn, { backgroundColor: subjectStyle.light }]}
                    onPress={() => handleChapterSummary(chunk)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text-outline" size={17} color={subjectStyle.bg} />
                  </TouchableOpacity>
                </View>
              ))}
              {(!activeCourse?.chunks || activeCourse.chunks.length === 0) && (
                <Text style={[{ fontSize: 14, textAlign: 'center', marginTop: 40 }, { color: t.textMuted }]}>
                  Aucun chapitre structuré pour ce cours.
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Modal prévisualisation photo */}
      <Modal visible={!!pendingUri} transparent animationType="fade">
        <View style={styles.previewOverlay}>
          <Image source={{ uri: pendingUri! }} style={styles.previewImage as any} resizeMode="contain" />
          <View style={styles.previewBtns}>
            <TouchableOpacity style={styles.previewBtnCancel} onPress={cancelImage}>
              <Text style={styles.previewBtnCancelText}>✕ Reprendre</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.previewBtnConfirm, { backgroundColor: subjectStyle.bg }]} onPress={confirmImage}>
              <Text style={styles.previewBtnConfirmText}>✓ Utiliser cette photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal no course */}
      <Modal visible={showNoCourseModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: t.surface }]}>
            <Text style={styles.modalEmoji}>📚</Text>
            <Text style={[styles.modalTitle, { color: t.text }]}>Choisis une matière</Text>
            <Text style={[styles.modalSub, { color: t.textMuted }]}>
              Va dans l'onglet{' '}
              <Text style={{ fontWeight: '700', color: Colors.blue }}>Cours</Text>{' '}
              et sélectionne une matière pour commencer.
            </Text>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: Colors.blue }]}
              onPress={() => { setShowNoCourseModal(false); navigation.navigate('Cours'); }}
            >
              <Text style={styles.modalBtnText}>Choisir une matière →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowNoCourseModal(false)} style={{ paddingVertical: 8 }}>
              <Text style={[{ fontSize: 14 }, { color: t.textMuted }]}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Attach Bottom Sheet (pas de Modal pour ne pas bloquer les pickers) ── */}
      {showAttachSheet && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowAttachSheet(false)} />
          <View style={[styles.sheetContainer, { backgroundColor: t.surface }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: t.text }]}>Ajouter un fichier</Text>
            {[
              { icon: 'camera-outline' as const,   label: 'Prendre une photo', action: takePhoto },
              { icon: 'image-outline' as const,    label: 'Galerie',           action: pickFromGallery },
              { icon: 'document-outline' as const, label: 'Fichier PDF',       action: pickPDF },
            ].map(({ icon, label, action }) => (
              <TouchableOpacity
                key={label}
                style={[styles.sheetOption, { borderBottomColor: t.border }]}
                onPress={() => { setShowAttachSheet(false); action(); }}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetIconWrap, { backgroundColor: t.surfaceAlt }]}>
                  <Ionicons name={icon} size={22} color={t.text} />
                </View>
                <Text style={[styles.sheetOptionText, { color: t.text }]}>{label}</Text>
                <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.sheetCancel, { backgroundColor: t.surfaceAlt }]} onPress={() => setShowAttachSheet(false)}>
              <Text style={[styles.sheetCancelText, { color: t.text }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerAvatarWrap: {
    width: 72, height: 94,
    justifyContent: 'flex-end', alignItems: 'center',
  },
  headerProfName: {
    fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  headerSubject: {
    fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 3,
  },
  headerCourseName: {
    fontSize: 15, fontWeight: '700', color: '#fff', marginTop: 1,
  },
  newChatBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  newChatText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  /* Niveau */
  niveauRow: { flexDirection: 'row', gap: 6 },
  niveauChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 6,
  },

  niveauText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  /* Messages */
  listContent: { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.md },
  rowUser: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  rowAI: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-end', gap: 8, marginBottom: 12 },

  aiAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bubbleUser: {
    borderRadius: 20, borderBottomRightRadius: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    maxWidth: '78%',
  },
  bubbleUserText: { fontSize: 15, color: '#fff', lineHeight: 22 },
  bubblePDFBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
    maxWidth: 200,
  },
  bubblePDFIcon: { fontSize: 14 },
  bubblePDFName: { fontSize: 12, color: '#fff', fontWeight: '600', flex: 1 },
  bubbleUserImage: {
    width: 220, height: 160, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bubbleAI: {
    borderRadius: 20, borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    maxWidth: '78%', flex: 1,
  },
  bubbleAIText: { fontSize: 15, lineHeight: 22 },

  /* Typing */
  typingWrap: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
  },
  typingBubble: {
    borderRadius: 20, borderBottomLeftRadius: 4,
    borderWidth: 0.5, padding: Spacing.md,
  },

  /* Images du cours */
  imagesRow: { marginTop: 10, marginBottom: 4 },
  msgImage: {
    width: 220, height: 160, borderRadius: 10,
    marginRight: 8, backgroundColor: '#F1F5F9',
  },

  /* Suggestions */
  suggRow: { marginTop: 8, marginBottom: 2 },
  suggChip: {
    borderRadius: Radius.full, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 5,
    marginRight: 6,
  },
  suggText: { fontSize: 12, fontWeight: '600' },

  /* Hallucination warning */
  hallucinationBadge: {
    marginTop: 6, marginBottom: 2,
    backgroundColor: '#FEF9C3', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 0.5, borderColor: '#FCD34D',
  },
  hallucinationText: { fontSize: 11, color: '#92400E', lineHeight: 16 },

  /* Feedback */
  feedbackRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  fbBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 0.5, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  fbEmoji: { fontSize: 12 },

  /* Empty state */
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8,
  },
  emptyEmojiWrap: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { ...Typography.h3, textAlign: 'center' },
  emptyCourse: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 4 },

  /* Input */
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderTopWidth: 0.5, gap: 8,
  },
  input: {
    flex: 1, borderRadius: 20, borderWidth: 0.5,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 100, minHeight: 44,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  sendArrow: { color: '#fff', fontSize: 20, fontWeight: '700' },

  /* Bouton + */
  attachBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: '#1C1C1E',
  },
  micBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: '#1C1C1E',
  },
  micBtnActive: {
    backgroundColor: '#FEE2E2', borderWidth: 1.5, borderColor: Colors.error,
  },

  /* Chips pièces jointes */
  attachBar: { borderTopWidth: 0.5, maxHeight: 90 },
  attachBarContent: { paddingHorizontal: Spacing.md, paddingVertical: 10, flexDirection: 'row', gap: 10, alignItems: 'center' },
  attachChip: { position: 'relative' },
  attachThumb: { width: 64, height: 64, borderRadius: 12 },
  attachChipFile: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingLeft: 6, paddingRight: 32, paddingVertical: 8,
    maxWidth: 220,
  },
  attachFileIconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  attachFileName: { fontSize: 13, fontWeight: '600', flex: 1 },
  attachClose: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#1F2937',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  attachCloseText: { color: '#fff', fontSize: 14, fontWeight: '800', lineHeight: 18 },

  /* Photo preview modal */
  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewImage: {
    width: '100%', height: '75%',
  },
  previewBtns: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 24, paddingTop: 20,
  },
  previewBtnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  previewBtnCancelText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  previewBtnConfirm: {
    flex: 2, paddingVertical: 14, borderRadius: 16,
    alignItems: 'center',
  },
  previewBtnConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  /* Header buttons */
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { fontSize: 18 },

  /* Summary modal */
  summaryRoot: { flex: 1 },
  summaryHeader: {
    paddingTop: 50, paddingBottom: Spacing.lg, paddingHorizontal: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  summaryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  summaryHeaderEmoji: { fontSize: 28 },
  summaryHeaderLabel: {
    fontSize: 18, fontWeight: '800', color: '#fff',
    letterSpacing: -0.3,
  },
  summaryHeaderCourse: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  summaryClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  summaryBody: { padding: Spacing.lg, paddingBottom: 60 },
  summaryLoading: { alignItems: 'center', paddingVertical: 60 },
  summaryLoadingText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  summaryTitle: { fontSize: 16, fontWeight: '800', marginTop: 16, marginBottom: 4 },
  summaryLine: { fontSize: 15, lineHeight: 24 },
  regenBtn: {
    marginTop: 32, borderWidth: 1.5, borderRadius: Radius.lg,
    paddingVertical: 12, alignItems: 'center',
  },
  regenBtnText: { fontSize: 14, fontWeight: '700' },

  /* Chapters modal */
  chapterItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Radius.md, borderWidth: 0.5,
    padding: Spacing.md, marginBottom: 8,
  },
  chapterNum: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  chapterNumText: { fontSize: 13, fontWeight: '800' },
  chapterTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  chapterSummaryBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  /* Modal */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  modalBox: {
    borderRadius: 24, padding: 28, alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
  },
  /* Attach bottom sheet */
  sheetOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetContainer:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },
  sheetHandle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },
  sheetTitle:       { fontSize: 16, fontWeight: '700', marginBottom: 16, letterSpacing: -0.2 },
  sheetOption:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetIconWrap:    { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetOptionText:  { flex: 1, fontSize: 15, fontWeight: '500' },
  sheetCancel:      { marginTop: 14, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sheetCancelText:  { fontSize: 15, fontWeight: '600' },

  modalEmoji: { fontSize: 52, marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, letterSpacing: -0.3 },
  modalSub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalBtn: {
    borderRadius: Radius.lg, paddingVertical: 14, paddingHorizontal: 28,
    width: '100%', alignItems: 'center', marginBottom: 12,
  },
  modalBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
