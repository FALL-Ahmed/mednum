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
  Alert,
} from 'react-native';
import { useAppStore, Message } from '../store';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { SourceBadge, TypingIndicator, useTheme } from '../components';
import { askRAG, NIVEAU_LABELS, NiveauType } from '../utils/rag';

const ChatBubble = React.memo(function ChatBubble({ msg, onFeedback, onSuggestion }: { msg: Message; onFeedback: (id: string, f: 'up' | 'down') => void; onSuggestion: (q: string) => void }) {
  const t = useTheme();

  if (msg.role === 'user') {
    return (
      <View style={styles.rowUser}>
        <View style={styles.bubbleUser}>
          <Text style={styles.bubbleUserText}>{msg.content}</Text>
        </View>
      </View>
    );
  }

  if (msg.role === 'refusal') {
    return (
      <View style={styles.rowAI}>
        <View style={styles.bubbleRefusal}>
          <Text style={styles.bubbleRefusalText}>{msg.content}</Text>
        </View>
      </View>
    );
  }

  if (msg.role === 'error') {
    return (
      <View style={styles.rowAI}>
        <View style={styles.bubbleError}>
          <Text style={styles.bubbleErrorText}>⚠️ {msg.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rowAI}>
      <View style={[styles.bubbleAI, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
        <Text style={[styles.bubbleAIText, { color: t.text }]}>{msg.content}</Text>
        {msg.sources && msg.sources.length > 0 && <SourceBadge pages={msg.sources} />}
        {msg.suggestions && msg.suggestions.length > 0 && (
          <View style={styles.suggRow}>
            {msg.suggestions.map((q, i) => (
              <TouchableOpacity key={i} style={styles.suggChip} onPress={() => onSuggestion(q)}>
                <Text style={styles.suggText}>💡 {q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.feedbackRow}>
          <TouchableOpacity
            onPress={() => onFeedback(msg.id, 'up')}
            style={[styles.fbBtn, msg.feedback === 'up' && styles.fbBtnActive]}
          >
            <Text style={styles.fbEmoji}>👍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onFeedback(msg.id, 'down')}
            style={[styles.fbBtn, msg.feedback === 'down' && styles.fbBtnActive]}
          >
            <Text style={styles.fbEmoji}>👎</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

export default function ChatScreen({ route }: any) {
  const prefill = route?.params?.prefill;
  const {
    currentMessages,
    activeCourse,
    isLoading,
    addMessage,
    setLoading,
    clearChat,
    saveChatSession,
    setFeedback,
    niveau,
    setNiveau,
  } = useAppStore();
  const t = useTheme();
  const [input, setInput] = useState(prefill || '');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (prefill) setInput(prefill);
  }, [prefill]);

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || isLoading) return;
    if (!activeCourse) {
      Alert.alert('Pas de cours', 'Charge un cours PDF pour poser des questions.');
      return;
    }

    setInput('');

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: q,
      timestamp: new Date(),
    };
    addMessage(userMsg);
    setLoading(true);
    scrollToBottom();

    // Contenu réel extrait du PDF (pdfjs-dist) stocké dans le store
    const courseContent = activeCourse?.content ?? '';

    const result = await askRAG(q, courseContent, activeCourse.name, currentMessages, niveau);

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: result.type === 'answer' ? 'assistant' : result.type,
      content: result.content,
      sources: result.sources,
      suggestions: result.suggestions,
      timestamp: new Date(),
    };
    addMessage(aiMsg);
    setLoading(false);
    scrollToBottom();
  };

  const handleNewChat = () => {
    saveChatSession();
    clearChat();
  };

  const handleSuggestion = useCallback((q: string) => {
    setInput(q);
  }, []);

  const handleFeedback = useCallback((id: string, f: 'up' | 'down') => {
    setFeedback(id, f);
  }, [setFeedback]);

  const renderItem = useCallback(({ item }: { item: Message }) => (
    <ChatBubble msg={item} onFeedback={handleFeedback} onSuggestion={handleSuggestion} />
  ), [handleFeedback, handleSuggestion]);

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blue} />

      {/* Header */}
      <View style={styles.header}>
        <SafeAreaView>
          <View style={styles.headerInner}>
            <View>
              <Text style={styles.headerTitle}>ProfNum</Text>
              {activeCourse ? (
                <View style={styles.headerBadge}>
                  <View style={styles.headerBadgeDot} />
                  <Text style={styles.headerBadgeText}>Cours chargé ✓</Text>
                </View>
              ) : (
                <Text style={styles.headerNoCourse}>Aucun cours</Text>
              )}
            </View>
            <View style={styles.headerRight}>
              {/* Sélecteur de niveau */}
              <View style={styles.niveauRow}>
                {(['facile', 'moyen', 'avance'] as NiveauType[]).map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.niveauChip, niveau === n && styles.niveauChipActive]}
                    onPress={() => setNiveau(n)}
                  >
                    <Text style={[styles.niveauChipText, niveau === n && styles.niveauChipTextActive]}>
                      {NIVEAU_LABELS[n]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.newChatBtn} onPress={handleNewChat}>
                <Text style={styles.newChatText}>Nouveau</Text>
              </TouchableOpacity>
            </View>
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
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎓</Text>
            <Text style={[styles.emptyTitle, { color: t.text }]}>
              {activeCourse ? 'Pose ta première question !' : 'Charge un cours pour commencer'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: t.textMuted }]}>
              {activeCourse
                ? `Je répondrai depuis "${activeCourse.name}"`
                : 'Va dans l\'onglet "Cours" pour ajouter un PDF'}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={currentMessages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={isLoading ? (
              <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm }}>
                <TypingIndicator />
              </View>
            ) : null}
          />
        )}

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: t.surfaceAlt, color: t.text, borderColor: t.border },
            ]}
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
            style={[styles.sendBtn, (!input.trim() || isLoading) && { opacity: 0.4 }]}
            onPress={sendMessage}
            disabled={!input.trim() || isLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.sendArrow}>→</Text>
          </TouchableOpacity>
        </View>
        <SafeAreaView style={{ backgroundColor: t.surface }} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { backgroundColor: Colors.blue },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: { ...Typography.h3, color: '#fff' },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5EE9B8' },
  headerBadgeText: { ...Typography.caption, color: 'rgba(255,255,255,0.85)' },
  headerNoCourse: { ...Typography.caption, color: 'rgba(255,255,255,0.55)' },
  headerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  niveauRow: {
    flexDirection: 'row',
    gap: 4,
  },
  niveauChip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  niveauChipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  niveauChipText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.8)',
  },
  niveauChipTextActive: {
    color: Colors.blue,
  },
  newChatBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  newChatText: { ...Typography.labelSmall, color: '#fff' },
  listContent: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.md },
  rowUser: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  rowAI: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 10 },
  bubbleUser: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    borderBottomRightRadius: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: '80%',
  },
  bubbleUserText: { ...Typography.chat, color: '#fff' },
  bubbleAI: {
    borderRadius: Radius.md,
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: '85%',
  },
  bubbleAIText: { ...Typography.chat, lineHeight: 22 },
  bubbleRefusal: {
    backgroundColor: Colors.orange,
    borderRadius: Radius.md,
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: Colors.orangeBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: '85%',
  },
  bubbleRefusalText: { ...Typography.chat, color: Colors.orangeText },
  bubbleError: {
    backgroundColor: Colors.errorLight,
    borderRadius: Radius.md,
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: Colors.error,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: '85%',
  },
  bubbleErrorText: { ...Typography.chat, color: Colors.error },
  suggRow: { flexDirection: 'column', gap: 6, marginTop: 8 },
  suggChip: {
    backgroundColor: Colors.blueLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.blue,
  },
  suggText: { fontSize: 12, color: Colors.blue, fontWeight: '500' },
  feedbackRow: { flexDirection: 'row', gap: 6, marginTop: 7 },
  fbBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 0.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbBtnActive: { backgroundColor: Colors.blueLight, borderColor: Colors.blue },
  fbEmoji: { fontSize: 13 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: Spacing.md,
  },
  emptyEmoji: { fontSize: 56, marginBottom: Spacing.sm },
  emptyTitle: { ...Typography.h3, textAlign: 'center' },
  emptySubtitle: { ...Typography.body, textAlign: 'center', lineHeight: 24 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 0.5,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrow: { color: '#fff', fontSize: 20, fontWeight: '600', marginLeft: 2 },
});
