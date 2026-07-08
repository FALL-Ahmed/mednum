import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Modal,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, ChatSession, Message } from '../store';
import { Colors, Spacing, Radius } from '../theme';
import { SourceBadge, useTheme, Text } from '../components';
import { useT, useUiLang } from '../i18n';
import type { TranslationShape } from '../i18n';
import { getSubjectStyle, getProfessorName } from '../utils/subjectStyles';

// ── Bulle de prévisualisation ────────────────────────────────────────────────

function MessagePreview({ msg, subjectBg }: { msg: Message; subjectBg: string }) {
  const t = useTheme();
  if (msg.role === 'user') {
    return (
      <View style={[styles.histBubbleUser, { backgroundColor: subjectBg }]}>
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

// ── Modal détail session ─────────────────────────────────────────────────────

function SessionModal({ session, onClose }: { session: ChatSession; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const { resumeSession } = useAppStore();
  const navigation = useNavigation<any>();
  const s = getSubjectStyle(session.courseName);

  const handleResume = () => {
    resumeSession(session);
    onClose();
    navigation.navigate('Chat');
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalRoot, { backgroundColor: t.bg }]}>
        {/* En-tête coloré */}
        <View style={[styles.modalHeader, { backgroundColor: s.bg }]}>
          <View style={styles.modalHeaderBubble1} />
          <View style={styles.modalHeaderBubble2} />
          <View style={{ flex: 1 }}>
            <Text style={styles.modalLabel}>{tr.history.chatSession}</Text>
            <Text style={styles.modalTitle} numberOfLines={1}>{session.courseName}</Text>
            <Text style={styles.modalDate}>
              {new Date(session.createdAt).toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleResume}
            style={[styles.resumeBtn, { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.3)' }]}
          >
            <Ionicons name="play" size={14} color="#fff" />
            <Text style={styles.resumeText}>{tr.history.resume}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}>
          {session.messages.map((m) => (
            <View key={m.id} style={{ marginBottom: Spacing.sm }}>
              <MessagePreview msg={m} subjectBg={s.bg} />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Écran principal ──────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { chatHistory, clearHistory, activeCourse, plan } = useAppStore();
  const t = useTheme();
  const tr = useT();
  const { top } = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [selected, setSelected] = useState<ChatSession | null>(null);
  const isFreemium = plan === 'freemium';
  const s = getSubjectStyle(activeCourse?.subjectName ?? '');
  const profName = getProfessorName(activeCourse?.subjectName ?? '');
  // RTL uniquement piloté par la langue de l'interface (pas par la langue du cours).
  const courseIsAr = useUiLang() === 'ar';

  const filtered = activeCourse
    ? chatHistory.filter(h => h.subjectName === activeCourse.subjectName || h.courseId === activeCourse.id)
    : chatHistory;

  // Groupement par date
  const grouped: { date: string; sessions: ChatSession[] }[] = [];
  const seen: Record<string, number> = {};
  for (const s of filtered) {
    const key = new Date(s.createdAt).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    if (seen[key] === undefined) {
      seen[key] = grouped.length;
      grouped.push({ date: key, sessions: [] });
    }
    grouped[seen[key]].sessions.push(s);
  }

  const confirmClear = () => {
    Alert.alert(tr.history.clearAllTitle, `${tr.history.clearAllMsg} ${activeCourse?.subjectName || tr.history.thisSubject} ${tr.history.clearAllMsgSuffix}`, [
      { text: tr.common.cancel, style: 'cancel' },
      { text: tr.history.clear, style: 'destructive', onPress: clearHistory },
    ]);
  };

  const renderGroup = ({ item }: { item: { date: string; sessions: ChatSession[] } }) => (
    <View style={styles.group}>
      <Text style={[styles.dateLabel, { color: t.textMuted }]}>{item.date}</Text>
      {item.sessions.map((session) => {
        const s = getSubjectStyle(session.courseName);
        const firstQ = session.messages.find((m) => m.role === 'user' && m.content.trim().length > 10)
          ?? session.messages.find((m) => m.role === 'user');
        const firstA = session.messages.find((m) => m.role === 'assistant' && m.content.trim().length > 20);
        const exchanges = Math.floor(session.messages.length / 2);

        return (
          <TouchableOpacity
            key={session.id}
            onPress={() => setSelected(session)}
            activeOpacity={0.82}
            style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            {/* Barre couleur matière */}
            <View style={[styles.cardAccent, { backgroundColor: s.bg }]} />

            {/* Icône */}
            <View style={[styles.cardIcon, { backgroundColor: s.bg + '22' }]}>
              <Ionicons name="chatbubble-ellipses" size={22} color={s.bg} />
            </View>

            {/* Contenu */}
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardQ, { color: t.text }]} numberOfLines={1}>
                {firstQ?.content || tr.history.chatSessionFallback}
              </Text>
              {firstA && (
                <Text style={[styles.cardA, { color: t.textMuted }]} numberOfLines={1}>
                  {firstA.content.replace(/\n/g, ' ')}
                </Text>
              )}
              <View style={styles.cardMeta}>
                <View style={[styles.subjectPill, { backgroundColor: s.bg }]}>
                  <Text style={styles.subjectPillText} numberOfLines={1}>{session.courseName}</Text>
                </View>
                <Text style={[styles.cardCount, { color: t.textMuted }]}>
                  {exchanges} {tr.history.exchange}
                </Text>
              </View>
            </View>

            <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={s.bg} />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: top + Spacing.lg, backgroundColor: s.bg }]}>
        <View style={styles.hBubble1} />
        <View style={styles.hBubble2} />
        <View style={[styles.headerRow, courseIsAr && { flexDirection: 'row-reverse' }]}>
          <View>
            <Text style={styles.headerLabel}>{activeCourse?.subjectName?.toUpperCase() || tr.history.historyFallback}</Text>
            <Text style={styles.headerTitle}>{tr.history.conversations}</Text>
            <Text style={styles.headerSub}>
              {filtered.length} {tr.history.session} {tr.history.sessionsSaved}
            </Text>
          </View>
          {filtered.length > 0 && (
            <TouchableOpacity onPress={confirmClear} style={styles.clearBtn}>
              <Ionicons name="trash-outline" size={15} color="#fff" />
              <Text style={styles.clearText}>{tr.history.clear}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Contenu ── */}
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: s.bg + '18' }]}>
            <Ionicons name="time-outline" size={48} color={s.bg} />
          </View>
          <Text style={[styles.emptyTitle, { color: t.text }]}>{tr.history.noConversation}</Text>
          <Text style={[styles.emptySub, { color: t.textMuted }]}>
            {activeCourse
              ? `${tr.history.exchangesWillAppear} ${profName} ${tr.history.exchangesWillAppearSuffix}`
              : tr.history.pickSubjectHistory}
          </Text>
        </View>
      ) : (
        <FlatList
          data={isFreemium ? grouped.slice(0, 3) : grouped}
          keyExtractor={(g) => g.date}
          renderItem={renderGroup}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <TouchableOpacity
              style={[styles.lockCard, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => navigation.navigate('Subscription')}
              activeOpacity={0.88}
            >
              <View style={styles.lockIconWrap}>
                <Ionicons name="lock-closed" size={22} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lockTitle, { color: t.text }]}>
                  {isFreemium ? tr.history.limitedHistory : tr.history.fullHistory}
                </Text>
                <Text style={[styles.lockSub, { color: t.textMuted }]}>
                  {isFreemium
                    ? tr.history.limitedHistorySub
                    : tr.history.fullHistorySub
                  }
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#7C3AED" />
            </TouchableOpacity>
          }
        />
      )}

      {selected && (
        <SessionModal session={selected} onClose={() => setSelected(null)} />
      )}

    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Lock card freemium */
  lockCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: '#7C3AED', borderRadius: 14,
    padding: 14, marginTop: 8,
  },
  lockIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center',
  },
  lockTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  lockSub:   { fontSize: 12, lineHeight: 17 },

  /* Header */
  header: {
    backgroundColor: Colors.blue,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  hBubble1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -50, right: -30,
  },
  hBubble2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: 8, left: 14,
  },
  headerRow:   { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.4, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.56)', marginTop: 6 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
    marginBottom: 4,
  },
  clearText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  /* Groups */
  group:     { marginBottom: 24 },
  dateLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 },

  /* Cards */
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 0.5, padding: 14,
    marginBottom: 10, overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  cardQ:     { fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 3 },
  cardA:     { fontSize: 12, lineHeight: 17, marginBottom: 7 },
  cardMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subjectPill: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3 },
  subjectPillText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  cardCount: { fontSize: 12 },

  /* Empty */
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.blueLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySub:   { fontSize: 14, textAlign: 'center', lineHeight: 22 },

  /* Modal */
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 50, paddingBottom: Spacing.lg, paddingHorizontal: Spacing.lg,
    gap: 10, overflow: 'hidden',
  },
  modalHeaderBubble1: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -50, right: -30,
  },
  modalHeaderBubble2: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: 0, left: 60,
  },
  modalLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.4, marginBottom: 3 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  modalDate:  { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4, textTransform: 'capitalize' },
  resumeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.sm, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 7,
    marginRight: 4,
  },
  resumeText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  modalCloseBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  /* Bulles dans modal */
  histBubbleUser: {
    borderRadius: 14, borderBottomRightRadius: 3,
    padding: Spacing.md, alignSelf: 'flex-end', maxWidth: '80%',
  },
  histBubbleUserText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  histBubbleAI: {
    borderRadius: 14, borderBottomLeftRadius: 3,
    borderWidth: 0.5, padding: Spacing.md,
    alignSelf: 'flex-start', maxWidth: '85%',
  },
  histBubbleAIText: { fontSize: 14, lineHeight: 20 },
});
