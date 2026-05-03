import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  Modal,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore, Message } from '../store';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { SourceBadge, TypingIndicator, useTheme } from '../components';
import { askRAG, NIVEAU_LABELS, NiveauType } from '../utils/rag';
import { getSubjectStyle } from '../utils/subjectStyles';

// ─── Bubble ──────────────────────────────────────────────────────────────────

const ChatBubble = React.memo(function ChatBubble({
  msg,
  accentColor,
  lightColor,
  onFeedback,
  onSuggestion,
}: {
  msg: Message;
  accentColor: string;
  lightColor: string;
  onFeedback: (id: string, f: 'up' | 'down') => void;
  onSuggestion: (q: string) => void;
}) {
  const t = useTheme();

  if (msg.role === 'user') {
    return (
      <View style={styles.rowUser}>
        <View style={[styles.bubbleUser, { backgroundColor: Colors.blue }]}>
          <Text style={styles.bubbleUserText}>{msg.content}</Text>
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
            <Text style={styles.fbEmoji}>👍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onFeedback(msg.id, 'down')}
            style={[styles.fbBtn, msg.feedback === 'down' && { backgroundColor: '#FEF2F2', borderColor: Colors.error }]}
          >
            <Text style={styles.fbEmoji}>👎</Text>
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
          <Text style={[styles.emptySub, { color: t.textMuted }]} numberOfLines={2}>{courseName}</Text>
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
    niveau, setNiveau,
  } = useAppStore();
  const t = useTheme();
  const navigation = useNavigation<any>();
  const [input, setInput] = useState(prefill || '');
  const [showNoCourseModal, setShowNoCourseModal] = useState(false);
  const listRef = useRef<FlatList>(null);

  const subjectStyle = getSubjectStyle(activeCourse?.subjectName || '');

  useEffect(() => { if (prefill) setInput(prefill); }, [prefill]);

  const scrollToBottom = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || isLoading) return;
    if (!activeCourse) { setShowNoCourseModal(true); return; }

    setInput('');
    addMessage({ id: Date.now().toString(), role: 'user', content: q, timestamp: new Date() });
    setLoading(true);
    scrollToBottom();

    const result = await askRAG(q, activeCourse.content ?? '', activeCourse.name, currentMessages, niveau);
    addMessage({
      id: (Date.now() + 1).toString(),
      role: result.type === 'answer' ? 'assistant' : result.type,
      content: result.content,
      sources: result.sources,
      suggestions: result.suggestions,
      timestamp: new Date(),
    });
    setLoading(false);
    scrollToBottom();
  };

  const handleNewChat = () => { saveChatSession(); clearChat(); };
  const handleSuggestion = useCallback((q: string) => setInput(q), []);
  const handleFeedback = useCallback((id: string, f: 'up' | 'down') => setFeedback(id, f), [setFeedback]);

  const renderItem = useCallback(({ item }: { item: Message }) => (
    <ChatBubble
      msg={item}
      accentColor={subjectStyle.accent}
      lightColor={subjectStyle.light}
      onFeedback={handleFeedback}
      onSuggestion={handleSuggestion}
    />
  ), [handleFeedback, handleSuggestion, subjectStyle]);

  const hasContent = activeCourse?.content && activeCourse.content.trim().length > 50;

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={subjectStyle.bg} />

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: subjectStyle.bg }]}>
        <SafeAreaView>
          <View style={styles.headerTop}>
            {/* Course info */}
            <View style={styles.headerLeft}>
              <View style={[styles.headerEmojiWrap, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.headerEmoji}>{subjectStyle.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerSubject}>
                  {activeCourse?.subjectName || 'ProfNum'}
                </Text>
                <Text style={styles.headerCourseName} numberOfLines={1}>
                  {activeCourse
                    ? hasContent ? activeCourse.name : '⚠️ Cours non lisible'
                    : 'Sélectionne un cours'}
                </Text>
              </View>
            </View>
            {/* Actions */}
            <TouchableOpacity style={styles.newChatBtn} onPress={handleNewChat}>
              <Text style={styles.newChatText}>✦ Nouveau</Text>
            </TouchableOpacity>
          </View>

          {/* Niveau selector */}
          <View style={styles.niveauRow}>
            {(['facile', 'moyen', 'avance'] as NiveauType[]).map((n) => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.niveauChip,
                  niveau === n
                    ? { backgroundColor: '#fff' }
                    : { backgroundColor: 'rgba(255,255,255,0.12)' },
                ]}
                onPress={() => setNiveau(n)}
              >
                <Text style={[
                  styles.niveauText,
                  { color: niveau === n ? subjectStyle.bg : 'rgba(255,255,255,0.75)' },
                ]}>
                  {NIVEAU_LABELS[n]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </View>

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

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: t.bg, color: t.text, borderColor: t.border }]}
            placeholder="Pose ta question…"
            placeholderTextColor={t.textMuted}
            value={input}
            onChangeText={setInput}
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
              (!input.trim() || isLoading) && { opacity: 0.35 },
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || isLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.sendArrow}>↑</Text>
          </TouchableOpacity>
        </View>
        <SafeAreaView style={{ backgroundColor: t.surface }} />
      </KeyboardAvoidingView>

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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerEmojiWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  headerEmoji: { fontSize: 22 },
  headerSubject: {
    fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.2, textTransform: 'uppercase',
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
    borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  niveauText: { fontSize: 12, fontWeight: '700' },

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

  /* Suggestions */
  suggRow: { marginTop: 8, marginBottom: 2 },
  suggChip: {
    borderRadius: Radius.full, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 5,
    marginRight: 6,
  },
  suggText: { fontSize: 12, fontWeight: '600' },

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
  modalEmoji: { fontSize: 52, marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, letterSpacing: -0.3 },
  modalSub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalBtn: {
    borderRadius: Radius.lg, paddingVertical: 14, paddingHorizontal: 28,
    width: '100%', alignItems: 'center', marginBottom: 12,
  },
  modalBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
