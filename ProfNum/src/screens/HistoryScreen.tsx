import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore, ChatSession, Message } from '../store';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { SourceBadge, useTheme } from '../components';

function MessagePreview({ msg }: { msg: Message }) {
  const t = useTheme();
  if (msg.role === 'user') {
    return (
      <View style={styles.histBubbleUser}>
        <Text style={styles.histBubbleUserText} numberOfLines={2}>{msg.content}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.histBubbleAI, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
      <Text style={[styles.histBubbleAIText, { color: t.text }]} numberOfLines={3}>
        {msg.content}
      </Text>
      {msg.sources && msg.sources.length > 0 && <SourceBadge pages={msg.sources} />}
    </View>
  );
}

function SessionModal({ session, onClose }: { session: ChatSession; onClose: () => void }) {
  const t = useTheme();
  const { resumeSession } = useAppStore();
  const navigation = useNavigation<any>();

  const handleResume = () => {
    resumeSession(session);
    onClose();
    navigation.navigate('Chat');
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalRoot, { backgroundColor: t.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Session de chat</Text>
            <Text style={[styles.modalSub, { color: t.textMuted }]}>
              {session.courseName} · {new Date(session.createdAt).toLocaleDateString('fr-FR')}
            </Text>
          </View>
          <TouchableOpacity onPress={handleResume} style={[styles.resumeBtn]}>
            <Text style={styles.resumeText}>▶ Reprendre</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeText, { color: t.text }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
          {session.messages.map((m) => (
            <View key={m.id} style={{ marginBottom: Spacing.sm }}>
              <MessagePreview msg={m} />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function HistoryScreen() {
  const { chatHistory, clearChat } = useAppStore();
  const t = useTheme();
  const [selected, setSelected] = useState<ChatSession | null>(null);

  const grouped = chatHistory.reduce((acc: Record<string, ChatSession[]>, s) => {
    const key = new Date(s.createdAt).toLocaleDateString('fr-FR');
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const confirmClear = () => {
    Alert.alert('Effacer tout ?', 'Tout l\'historique sera supprimé.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: clearChat },
    ]);
  };

  const renderSession = ({ item }: { item: ChatSession }) => {
    const firstQ = item.messages.find((m) => m.role === 'user');
    const msgCount = item.messages.length;
    return (
      <TouchableOpacity
        onPress={() => setSelected(item)}
        activeOpacity={0.8}
        style={[
          styles.sessionCard,
          { backgroundColor: t.surface, borderColor: t.border },
        ]}
      >
        <View style={styles.sessionLeft}>
          <Text style={{ fontSize: 24 }}>💬</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sessionQ, { color: t.text }]} numberOfLines={2}>
            {firstQ?.content || 'Session'}
          </Text>
          <View style={styles.sessionMeta}>
            <View style={[styles.coursePill, { backgroundColor: Colors.blueLight }]}>
              <Text style={styles.coursePillText} numberOfLines={1}>
                {item.courseName}
              </Text>
            </View>
            <Text style={[styles.sessionCount, { color: t.textMuted }]}>
              {Math.floor(msgCount / 2)} échanges
            </Text>
          </View>
        </View>
        <Text style={[styles.chevron, { color: t.textMuted }]}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blue} />
      <View style={styles.header}>
        <SafeAreaView>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Historique</Text>
              <Text style={styles.headerSub}>{chatHistory.length} sessions sauvegardées</Text>
            </View>
            {chatHistory.length > 0 && (
              <TouchableOpacity onPress={confirmClear} style={styles.clearBtn}>
                <Text style={styles.clearText}>Tout effacer</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </View>

      {chatHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 56, marginBottom: 12 }}>📋</Text>
          <Text style={[styles.emptyTitle, { color: t.text }]}>Aucun historique</Text>
          <Text style={[styles.emptySub, { color: t.textMuted }]}>
            Tes conversations seront sauvegardées ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={chatHistory}
          keyExtractor={(s) => s.id}
          renderItem={renderSession}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      {selected && (
        <SessionModal session={selected} onClose={() => setSelected(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { backgroundColor: Colors.blue, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.sm },
  headerTitle: { ...Typography.h2, color: '#fff' },
  headerSub: { ...Typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  clearBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clearText: { ...Typography.labelSmall, color: '#fff' },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 0.5,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sessionLeft: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionQ: { ...Typography.label, marginBottom: 6, lineHeight: 20 },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coursePill: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  coursePillText: { ...Typography.labelSmall, color: Colors.blue },
  sessionCount: { ...Typography.caption },
  chevron: { fontSize: 22, fontWeight: '300' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { ...Typography.h3, marginBottom: 8, textAlign: 'center' },
  emptySub: { ...Typography.body, textAlign: 'center', lineHeight: 24 },
  histBubbleUser: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    borderBottomRightRadius: 4,
    padding: Spacing.md,
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  histBubbleUserText: { ...Typography.chat, color: '#fff' },
  histBubbleAI: {
    borderRadius: Radius.md,
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    padding: Spacing.md,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  histBubbleAIText: { ...Typography.chat },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    paddingTop: 50,
    borderBottomWidth: 0.5,
  },
  modalTitle: { ...Typography.h3 },
  modalSub: { ...Typography.caption, marginTop: 2 },
  resumeBtn: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  resumeText: { ...Typography.labelSmall, color: '#fff' },
  closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, fontWeight: '500' },
});
