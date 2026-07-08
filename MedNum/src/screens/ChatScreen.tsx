import React, { useState, useRef, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
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
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore, Message, CourseChunk } from '../store';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { SourceBadge, TypingIndicator, useTheme, Text, TextInput } from '../components';
import { useT, useUiLang } from '../i18n';
import { askRAG, askWithImage, transcribeAudio, generateSummary, extractPDFWithGemini, detecterMode, computeNiveau } from '../utils/rag';
import { extractPDFText } from '../utils/pdfExtractor';
import { getSubjectStyle, getProfessorName } from '../utils/subjectStyles';
import { supabase } from '../lib/supabase';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

// ─── Bubble ──────────────────────────────────────────────────────────────────

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
        <Text style={{ fontSize: 14 }}>🩺</Text>
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

function EmptyState({ subjectName, courseName, accentColor, lightColor, t }: any) {
  const tr = useT();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyEmojiWrap, { backgroundColor: lightColor }]}>
        <Text style={styles.emptyEmoji}>🩺</Text>
      </View>
      {courseName ? (
        <>
          <Text style={[styles.emptyTitle, { color: t.text }]}>{tr.chat.emptyReadyTitle}</Text>
          <Text style={[styles.emptyCourse, { color: accentColor }]}>{subjectName}</Text>
          <Text style={[styles.emptyHint, { color: t.textMuted }]}>
            {tr.chat.emptyReadyHint}
          </Text>
        </>
      ) : (
        <Text style={[styles.emptyTitle, { color: t.text }]}>{tr.chat.emptyNoCourseTitle}</Text>
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
    quotaUsed, quotaLimit, quotaDate, plan, syncQuota, decrementQuota,
  } = useAppStore();

  const quotaRemaining = Math.max(0, quotaLimit - quotaUsed);
  const isQuotaBlocked = quotaRemaining === 0;
  const t = useTheme();
  const tr = useT();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { bottom } = useSafeAreaInsets();

  // Sauvegarde automatique quand l'élève quitte l'écran Chat
  useEffect(() => {
    if (!isFocused) {
      saveChatSession();
    }
  }, [isFocused]);
  const [input, setInput] = useState(prefill || '');
  const [isOnline, setIsOnline] = useState(true);
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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const tabBarClearance = isKeyboardVisible ? 8 : bottom + 88;
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<FlatList>(null);
  const micLevel = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring1Loop = useRef<Animated.CompositeAnimation | null>(null);
  const ring2Loop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    ring1Loop.current?.stop();
    ring2Loop.current?.stop();
  }, []);

  const subjectStyle = getSubjectStyle(activeCourse?.subjectName || '');

  useEffect(() => { if (prefill) setInput(prefill); }, [prefill]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? true);
    });
    return () => unsub();
  }, []);

  // Sync quota si nouveau jour ou pas encore chargé
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (quotaDate !== today) syncQuota();
  }, []);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvt, () => setIsKeyboardVisible(true));
    const subHide = Keyboard.addListener(hideEvt, () => setIsKeyboardVisible(false));
    return () => { subShow.remove(); subHide.remove(); };
  }, []);

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

  const startRingLoops = () => {
    ring1.setValue(0);
    ring2.setValue(0);
    ring1Loop.current = Animated.loop(
      Animated.timing(ring1, { toValue: 1, duration: 1800, useNativeDriver: true })
    );
    ring2Loop.current = Animated.loop(
      Animated.timing(ring2, { toValue: 1, duration: 1800, useNativeDriver: true, delay: 600 })
    );
    ring1Loop.current.start();
    ring2Loop.current.start();
  };

  const stopRingLoops = () => {
    ring1Loop.current?.stop();
    ring2Loop.current?.stop();
    ring1.setValue(0);
    ring2.setValue(0);
    micLevel.setValue(0);
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(tr.chat.permissionTitle, tr.chat.micPermMsg);
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => {
          if (status.isRecording && typeof status.metering === 'number') {
            const norm = Math.max(0, Math.min(1, (status.metering + 50) / 50));
            Animated.timing(micLevel, { toValue: norm, duration: 120, useNativeDriver: true }).start();
          }
        },
        80
      );
      recordingRef.current = recording;
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
      startRingLoops();
      setIsRecording(true);
    } catch {
      Alert.alert(tr.subject.error, tr.chat.recordErrorMsg);
    }
  };

  const teardownRecording = async () => {
    setIsRecording(false);
    stopRingLoops();
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (!recordingRef.current) return null;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      return uri;
    } finally {
      recordingRef.current = null;
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    try {
      const uri = await teardownRecording();
      if (!uri) {
        Alert.alert(tr.chat.transcribeFailedTitle, tr.chat.transcribeFailedMsg);
        return;
      }
      setIsTranscribing(true);
      const text = await transcribeAudio(uri);
      if (text) {
        setInput((prev: string) => (prev.trim() ? `${prev.trim()} ${text}` : text));
      } else {
        Alert.alert(tr.chat.transcribeFailedTitle, tr.chat.transcribeFailedMsg);
      }
    } catch {
      Alert.alert(tr.chat.transcribeFailedTitle, tr.chat.transcribeFailedMsg);
    } finally {
      setIsTranscribing(false);
    }
  };

  const cancelRecording = () => { teardownRecording(); };

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
      Alert.alert(tr.chat.permissionTitle, tr.chat.galleryPermMsg);
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
      Alert.alert(tr.chat.permissionTitle, tr.chat.cameraPermMsg);
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
      if (!file?.uri) { Alert.alert(tr.subject.error, tr.chat.fileNotFound); return; }
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
        Alert.alert(tr.chat.pdfUnreadableTitle, tr.chat.pdfUnreadableMsg, [{ text: 'OK' }]);
        return;
      }
      const name = file.name.replace(/\.pdf$/i, '');
      setAttachedPDF({ name, text });
    } catch (e: any) {
      setIsPDFLoading(false);
      console.warn('[PDF] pickPDF error:', e?.message);
      Alert.alert(tr.subject.error, tr.chat.pdfOpenErrorMsg + (e?.message ?? ''));
    }
  };

  const handleAttach = () => setShowAttachSheet(true);

  const sendMessage = async () => {
    Keyboard.dismiss();
    const q = input.trim();
    if ((!q && !imageUri) || isLoading) return;
    if (isQuotaBlocked) return;
    console.log('💬 ENVOI :', q, '| Matière :', activeCourse?.subjectName || 'N/A', '| Cours :', activeCourse?.name || 'N/A');
    if (!isOnline) {
      addMessage({
        id: Date.now().toString(),
        role: 'error',
        content: `${getProfessorName(activeCourse?.subjectName || '')} ${tr.chat.offlineSuffix}`,
        timestamp: new Date(),
      });
      return;
    }

    // Mode image — pas besoin de cours
    if (imageBase64) {
      const displayContent = q || '';
      const capturedBase64 = imageBase64;
      const capturedUri = imageUri;
      setInput('');
      setImageUri(null);
      setImageBase64(null);
      addMessage({ id: Date.now().toString(), role: 'user', content: displayContent, userImageUri: capturedUri!, timestamp: new Date() });
      saveChatSession();
      setLoading(true);
      scrollToBottom();
      const result = await askWithImage(q, capturedBase64, computeNiveau(difficultyScore), studentName || undefined);
      addMessage({
        id: (Date.now() + 1).toString(),
        role: result.type === 'answer' ? 'assistant' : (result.type as 'refusal' | 'error'),
        content: result.content,
        sources: result.sources,
        suggestions: result.suggestions,
        timestamp: new Date(),
      });
      saveChatSession();
      if (result.type === 'answer') addXP(15);
      setLoading(false);
      scrollToBottom();
      return;
    }

    if (!q || isLoading) return;

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
    saveChatSession();
    setLoading(true);
    scrollToBottom();

    const niveau = computeNiveau(difficultyScore, frustrated);

    const chapterIdx = activeCourse ? (activeChapterIndex[activeCourse.id] ?? 0) : 0;
    const activeChapterTitle = activeCourse?.chunks?.[chapterIdx]?.title || undefined;

    decrementQuota();
    const result = await askRAG(questionWithPDF, activeCourse?.content ?? '', activeCourse?.name ?? '', currentMessages, niveau, activeCourse?.chunks, studentName || undefined, activeCourse?.id, hintLevel, frustrated, activeChapterTitle, activeCourse?.subjectName, activeCourse?.language);

    if (result.type === 'quota_exceeded') {
      syncQuota();  // resync depuis le serveur
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'error',
        content: tr.chat.quotaExceededMsg,
        timestamp: new Date(),
      });
      saveChatSession();
      setLoading(false);
      scrollToBottom();
      return;
    }

    addMessage({
      id: (Date.now() + 1).toString(),
      role: result.type === 'answer' ? 'assistant' : (result.type as 'refusal' | 'error'),
      content: result.content,
      sources: result.sources,
      images: result.images,
      suggestions: result.suggestions,
      hallucination: result.hallucination,
      timestamp: new Date(),
    });
    saveChatSession();
    if (result.type === 'answer') {
      if (activeCourse?.id) trackConcept(activeCourse.id, result.topic || q);
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
      setChapterSummaryContent(tr.chat.summaryError);
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
      accentColor={TEAL}
      lightColor={TEAL_BG}
      bgColor={NAVY}
      onFeedback={handleFeedback}
      onSuggestion={handleSuggestion}
      onSpeak={handleSpeak}
      isSpeaking={speakingMsgId === item.id}
    />
  ), [handleFeedback, handleSuggestion, handleSpeak, speakingMsgId]);

  const hasContent = activeCourse?.content && activeCourse.content.trim().length > 50;
  // RTL uniquement piloté par la langue de l'interface (pas par la langue du cours).
  const courseIsAr = useUiLang() === 'ar';

  return (
    <View style={[styles.root, { backgroundColor: TEAL_BG }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* ── Header ── */}
      <View style={styles.headerWrap}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: NAVY }}>
          <View style={[styles.consultBar, courseIsAr && { flexDirection: 'row-reverse' }]}>
            <Ionicons
              name="medical-outline"
              size={130}
              color="rgba(255,255,255,0.05)"
              style={[styles.consultWatermark, courseIsAr && { right: undefined, left: -24 }]}
            />

            <View style={[styles.consultLeft, courseIsAr && { flexDirection: 'row-reverse' }]}>
              <View style={styles.consultAvatarWrap}>
                <Image
                  source={require('../../assets/dr_ahmed.png')}
                  style={styles.consultAvatar}
                  resizeMode="contain"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerProfName} numberOfLines={1}>
                  {getProfessorName(activeCourse?.subjectName || '')}
                </Text>
                <View style={[styles.consultStatusRow, courseIsAr && { flexDirection: 'row-reverse' }]}>
                  <View style={styles.consultStatusDot} />
                  <Text style={styles.consultStatusText} numberOfLines={1}>
                    En ligne
                  </Text>
                </View>
                {activeCourse?.name ? (
                  <Text style={styles.consultCourseText} numberOfLines={1}>
                    {activeCourse.name}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={[styles.consultActions, courseIsAr && { flexDirection: 'row-reverse' }]}>
              {activeCourse && (activeCourse.chunks?.length > 0 || hasContent) && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => { setChapterSummaryTitle(''); setChapterSummaryContent(''); setShowChapters(true); }}
                >
                  <Ionicons name="list-outline" size={18} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.iconBtn} onPress={handleNewChat}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {(plan === 'freemium' || plan === 'trial') && (
        <TouchableOpacity style={styles.upgradeStrip} onPress={() => navigation.navigate('Subscription')} activeOpacity={0.9}>
          <View style={styles.upgradeHalo} />
          <View style={{ flex: 1 }}>
            <View style={styles.upgradeBadge}>
              <Ionicons name={plan === 'trial' ? 'gift-outline' : 'sparkles'} size={11} color={TEAL} />
              <Text style={styles.upgradeBadgeText}>{plan === 'trial' ? 'Essai gratuit' : 'Freemium'}</Text>
            </View>
            <Text style={styles.upgradeStripTitle}>
              {quotaRemaining} message{quotaRemaining > 1 ? 's' : ''} restant{quotaRemaining > 1 ? 's' : ''} aujourd'hui
            </Text>
          </View>
          <View style={styles.upgradeStripBtn}>
            <Text style={styles.upgradeStripBtnText}>S'abonner</Text>
          </View>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        {currentMessages.length === 0 ? (
          <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
            <View style={{ flex: 1 }}>
              <EmptyState
                emoji={subjectStyle.emoji}
                subjectName={activeCourse?.subjectName}
                courseName={activeCourse?.name}
                accentColor={TEAL}
                lightColor={TEAL_BG}
                t={t}
              />
            </View>
          </TouchableWithoutFeedback>
        ) : (
          <FlatList
            ref={listRef}
            data={currentMessages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            onTouchStart={() => Keyboard.dismiss()}
            ListFooterComponent={isLoading ? (
              <View style={styles.typingWrap}>
                <View style={[styles.aiAvatar, { backgroundColor: TEAL_BG }]}>
                  <Text style={{ fontSize: 14 }}>🩺</Text>
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
                <View style={[styles.attachFileIconWrap, { backgroundColor: TEAL_BG }]}>
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


        {/* Input Bar — ou zone de blocage si quota atteint */}
        {isQuotaBlocked ? (
          <View style={[styles.quotaLockedZone, { backgroundColor: t.surface, paddingBottom: tabBarClearance }]}>
            <Ionicons name="lock-closed" size={22} color="#9CA3AF" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.quotaLockedTitle, { color: t.text }]}>
                {plan === 'freemium' ? tr.chat.quotaLockedFreemiumTitle : tr.chat.quotaLockedTrialTitle}
              </Text>
              <Text style={[styles.quotaLockedSub, { color: t.textMuted }]}>
                {plan === 'freemium' ? tr.chat.quotaLockedFreemiumSub : tr.chat.quotaLockedTrialSub}
              </Text>
            </View>
            {plan === 'freemium' && (
              <TouchableOpacity
                style={[styles.quotaLockedBtn, { backgroundColor: NAVY }]}
                onPress={() => navigation.navigate('Subscription')}
                activeOpacity={0.88}
              >
                <Text style={styles.quotaLockedBtnText}>{tr.chat.subscribe}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[styles.inputBar, { backgroundColor: TEAL_BG, paddingBottom: tabBarClearance }]}>
            <View style={styles.inputCard}>
              <TextInput
                style={[styles.input, { color: t.text }]}
                placeholder={tr.chat.inputPlaceholder}
                placeholderTextColor={t.textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={sendMessage}
                blurOnSubmit
              />
              <View style={styles.inputToolsRow}>
                <View style={styles.inputToolsLeft}>
                  <TouchableOpacity
                    style={styles.attachBtn}
                    onPress={handleAttach}
                    activeOpacity={0.7}
                    disabled={isPDFLoading}
                  >
                    {isPDFLoading
                      ? <ActivityIndicator size="small" color={TEAL} />
                      : <Ionicons name="attach" size={19} color={TEAL} />
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.micBtn, isRecording && styles.micBtnActive]}
                    onPress={toggleRecording}
                    activeOpacity={0.7}
                    disabled={isTranscribing}
                  >
                    {isTranscribing
                      ? <ActivityIndicator size="small" color={TEAL} />
                      : <Ionicons name={isRecording ? 'stop' : 'mic'} size={19} color={isRecording ? Colors.error : TEAL} />
                    }
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    { backgroundColor: NAVY },
                    ((!input.trim() && !imageUri) || isLoading) && { opacity: 0.35 },
                  ]}
                  onPress={sendMessage}
                  disabled={(!input.trim() && !imageUri) || isLoading}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-up" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Modal Chapitres + Résumé par chapitre */}
      <Modal visible={showChapters} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.summaryRoot, { backgroundColor: t.bg }]}>
          <View style={[styles.summaryHeader, { backgroundColor: NAVY }]}>
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
                  {chapterSummaryTitle ? tr.chat.chapterSummaryLabel : tr.chat.chaptersListLabel}
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
                  <Ionicons name="hourglass-outline" size={36} color={TEAL} style={{ marginBottom: 16 }} />
                  <Text style={[styles.summaryLoadingText, { color: t.text }]}>
                    {tr.chat.aiReading}
                  </Text>
                  <Text style={[{ color: t.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' }]}>
                    {tr.chat.fewSeconds}
                  </Text>
                </View>
              ) : (
                chapterSummaryContent.split('\n').map((line, i) => {
                  if (!line.trim()) return <View key={i} style={{ height: 6 }} />;
                  const isTitle = /^[🎯📌💡❓🔑🗺️⚠️🧠]/.test(line.trim());
                  return (
                    <Text key={i} style={isTitle
                      ? [styles.summaryTitle, { color: NAVY }]
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
                {tr.chat.tapChapterHint}
              </Text>
              {activeCourse?.chunks?.map((chunk, i) => (
                <View
                  key={i}
                  style={[styles.chapterItem, { backgroundColor: t.surface, borderColor: t.border }]}
                >
                  <View style={[styles.chapterNum, { backgroundColor: TEAL_BG }]}>
                    <Text style={[styles.chapterNumText, { color: TEAL }]}>{i + 1}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => { setShowChapters(false); setInput(`${tr.chat.explainPrefix} "${chunk.title}"`); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chapterTitle, { color: t.text }]}>{chunk.title}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chapterSummaryBtn, { backgroundColor: TEAL_BG }]}
                    onPress={() => handleChapterSummary(chunk)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text-outline" size={17} color={TEAL} />
                  </TouchableOpacity>
                </View>
              ))}
              {(!activeCourse?.chunks || activeCourse.chunks.length === 0) && (
                <Text style={[{ fontSize: 14, textAlign: 'center', marginTop: 40 }, { color: t.textMuted }]}>
                  {tr.chat.noChaptersStructured}
                </Text>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Modal prévisualisation photo */}
      <Modal visible={!!pendingUri} transparent animationType="fade">
        <View style={styles.previewOverlay}>
          <Image source={{ uri: pendingUri! }} style={styles.previewImage as any} resizeMode="contain" />
          <View style={styles.previewBtns}>
            <TouchableOpacity style={styles.previewBtnCancel} onPress={cancelImage}>
              <Text style={styles.previewBtnCancelText}>{tr.chat.retakePhoto}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.previewBtnConfirm, { backgroundColor: NAVY }]} onPress={confirmImage}>
              <Text style={styles.previewBtnConfirmText}>{tr.chat.usePhoto}</Text>
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
            <Text style={[styles.sheetTitle, { color: t.text }]}>{tr.chat.attachSheetTitle}</Text>
            {[
              { icon: 'camera-outline' as const,   label: tr.chat.takePhoto, action: takePhoto },
              { icon: 'image-outline' as const,    label: tr.chat.gallery,   action: pickFromGallery },
              { icon: 'document-outline' as const, label: tr.chat.pdfFile,   action: pickPDF },
            ].map(({ icon, label, action }) => (
              <TouchableOpacity
                key={label}
                style={[styles.sheetOption, { borderBottomColor: t.border }]}
                onPress={() => { setShowAttachSheet(false); action(); }}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetIconWrap, { backgroundColor: TEAL_BG }]}>
                  <Ionicons name={icon} size={22} color={TEAL} />
                </View>
                <Text style={[styles.sheetOptionText, { color: t.text }]}>{label}</Text>
                <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.sheetCancel, { backgroundColor: t.surfaceAlt }]} onPress={() => setShowAttachSheet(false)}>
              <Text style={[styles.sheetCancelText, { color: t.text }]}>{tr.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Overlay enregistrement vocal ── */}
      {(isRecording || isTranscribing) && (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.recOverlay}>
            {isTranscribing ? (
              <>
                <ActivityIndicator size="large" color={TEAL} />
                <Text style={styles.recLabel}>Transcription en cours…</Text>
              </>
            ) : (
              <>
                <View style={styles.recRingWrap}>
                  <Animated.View style={[styles.recRing, {
                    opacity: ring1.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                    transform: [{ scale: ring1.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
                  }]} />
                  <Animated.View style={[styles.recRing, {
                    opacity: ring2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                    transform: [{ scale: ring2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
                  }]} />
                  <Animated.View style={[styles.recCore, {
                    transform: [{ scale: micLevel.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }],
                  }]}>
                    <Ionicons name="mic" size={30} color="#fff" />
                  </Animated.View>
                </View>

                <Text style={styles.recTimer}>
                  {`${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}`}
                </Text>
                <Text style={styles.recLabel}>Je t'écoute…</Text>

                <View style={styles.recActionsRow}>
                  <TouchableOpacity style={styles.recCancelBtn} onPress={cancelRecording} activeOpacity={0.8}>
                    <Ionicons name="close" size={24} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.recConfirmBtn} onPress={stopRecording} activeOpacity={0.85}>
                    <Ionicons name="checkmark" size={26} color={NAVY} />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Header — bandeau consultation */
  headerWrap: {
    overflow: 'hidden',
  },
  consultBar: {
    backgroundColor: NAVY,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  consultWatermark: {
    position: 'absolute', top: -20, right: -24,
  },
  consultLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  consultAvatarWrap: {
    position: 'relative', width: 46, height: 60,
    borderRadius: 15, overflow: 'hidden',
    backgroundColor: TEAL_BG,
    borderWidth: 2, borderColor: TEAL,
  },
  consultAvatar: {
    width: '100%', height: '100%',
  },
  headerProfName: {
    fontFamily: SERIF, fontSize: 19, color: '#fff', letterSpacing: -0.3,
  },
  consultStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  consultStatusDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: TEAL },
  consultStatusText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.65)', flexShrink: 1 },
  consultCourseText: { fontSize: 11, fontWeight: '600', color: TEAL, marginTop: 2 },
  consultActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  /* Hors ligne */
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#E24B4A',
    paddingHorizontal: 16, paddingVertical: 11,
    borderRadius: 16,
    marginHorizontal: 12, marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: '#E24B4A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  offlineTitle: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  offlineSub:   { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '500', marginTop: 1 },
  offlineDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },

  /* Quota — zone de blocage (remplace toute la barre de saisie) */
  quotaLockedZone: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 14,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },
  quotaLockedTitle:   { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  quotaLockedSub:     { fontSize: 11, lineHeight: 16 },
  quotaLockedBtn:     { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, flexShrink: 0 },
  quotaLockedBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

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
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
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
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
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
  emptyTitle: { ...Typography.h3, fontFamily: SERIF, textAlign: 'center' },
  emptyCourse: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 4 },

  /* Input */
  inputBar: {
    paddingHorizontal: Spacing.md, paddingTop: 12,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },
  inputCard: {
    borderRadius: 22,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
    backgroundColor: '#fff',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  input: {
    fontSize: 15, lineHeight: 20, maxHeight: 90, minHeight: 22,
    paddingHorizontal: 0, paddingVertical: 0,
  },
  inputToolsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10,
  },
  inputToolsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  dismissBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  sendArrow: { color: '#fff', fontSize: 20, fontWeight: '700' },

  /* Bouton + */
  attachBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: TEAL_BG,
  },
  micBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: TEAL_BG,
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
  iconBtn: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  upgradeStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: NAVY,
    borderRadius: 18,
    marginHorizontal: Spacing.lg, marginTop: 12,
    padding: 14,
    overflow: 'hidden',
  },
  upgradeHalo: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(7,169,151,0.16)', top: -40, right: -30,
  },
  upgradeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', marginBottom: 6,
  },
  upgradeBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  upgradeStripTitle: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  upgradeStripBtn: {
    backgroundColor: '#fff', borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  upgradeStripBtnText: { fontSize: 12, fontWeight: '800', color: NAVY },

  /* Summary modal */
  summaryRoot: { flex: 1 },
  summaryHeader: {
    paddingTop: 50, paddingBottom: Spacing.lg, paddingHorizontal: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  summaryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  summaryHeaderEmoji: { fontSize: 28 },
  summaryHeaderLabel: {
    fontFamily: SERIF, fontSize: 19, color: '#fff',
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

  /* Attach bottom sheet */
  sheetOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetContainer:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },
  sheetHandle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },
  sheetTitle:       { fontFamily: SERIF, fontSize: 17, marginBottom: 16, letterSpacing: -0.2 },
  sheetOption:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetIconWrap:    { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetOptionText:  { flex: 1, fontSize: 15, fontWeight: '500' },
  sheetCancel:      { marginTop: 14, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sheetCancelText:  { fontSize: 15, fontWeight: '600' },

  /* Overlay enregistrement vocal */
  recOverlay: {
    flex: 1, backgroundColor: 'rgba(11,30,52,0.94)',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  recRingWrap: {
    width: 120, height: 120, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  recRing: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    backgroundColor: TEAL,
  },
  recCore: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: TEAL,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: TEAL, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  recTimer: {
    fontFamily: SERIF, fontSize: 24, color: '#fff', letterSpacing: 1,
  },
  recLabel: {
    fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.6)', marginTop: 2,
  },
  recActionsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 28,
    marginTop: 36,
  },
  recCancelBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  recConfirmBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
});
