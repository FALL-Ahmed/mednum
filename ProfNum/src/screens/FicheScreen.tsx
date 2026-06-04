import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Share, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { generateFiche } from '../utils/rag';
import { Colors, Spacing, Radius, Shadows } from '../theme';
import { useTheme } from '../components';
import { getSubjectStyle } from '../utils/subjectStyles';

// Hash léger du contenu (djb2) — pour détecter si le cours a changé
function hashContent(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// ── Parsing des sections ##  ──────────────────────────────────────────────────

type FicheSection = { title: string; emoji: string; body: string };

const SECTION_COLORS: Record<string, string> = {
  '💡': '#F59E0B',
  '📖': '#2563EB',
  '📐': '#7C3AED',
  '🔧': '#059669',
  '📅': '#DC2626',
  '👤': '#DB2777',
  '📝': '#0891B2',
  '✍️': '#0891B2',
  '🎯': '#16A34A',
  '🚨': '#EA580C',
  '⚠️': '#D97706',
};

function parseFiche(raw: string): FicheSection[] {
  const parts = raw.split(/^## /m).filter(Boolean);
  return parts.map(part => {
    const lines = part.trim().split('\n');
    const header = lines[0].trim();
    const emoji = header.match(/[\u{1F300}-\u{1FFFF}]|[☀-➿]|⚠️|✍️/u)?.[0] ?? '•';
    const title = header.replace(/[\u{1F300}-\u{1FFFF}]|[☀-➿]|⚠️|✍️/gu, '').trim();
    const body = lines.slice(1).join('\n').trim();
    return { title, emoji, body };
  });
}

// ── Rendu d'un bloc body ──────────────────────────────────────────────────────

function BodyText({ text, accent }: { text: string; accent: string }) {
  const t = useTheme();
  const lines = text.split('\n').filter(l => l.trim());

  return (
    <View style={{ gap: 6 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Ligne numérotée : "1. texte"
        if (/^\d+\./.test(trimmed)) {
          const num = trimmed.match(/^(\d+)\./)?.[1] ?? '';
          const content = trimmed.replace(/^\d+\.\s*/, '');
          return (
            <View key={i} style={styles.numberedLine}>
              <View style={[styles.numBadge, { backgroundColor: accent + '22' }]}>
                <Text style={[styles.numTxt, { color: accent }]}>{num}</Text>
              </View>
              <Text style={[styles.bodyLine, { color: t.text, flex: 1 }]}>
                {renderInline(content, accent, t.textMuted)}
              </Text>
            </View>
          );
        }

        // Ligne bullet : "• texte"
        if (/^[•\-]/.test(trimmed)) {
          const content = trimmed.replace(/^[•\-]\s*/, '');
          return (
            <View key={i} style={styles.bulletLine}>
              <View style={[styles.bullet, { backgroundColor: accent }]} />
              <Text style={[styles.bodyLine, { color: t.text, flex: 1 }]}>
                {renderInline(content, accent, t.textMuted)}
              </Text>
            </View>
          );
        }

        // Ligne normale
        return (
          <Text key={i} style={[styles.bodyLine, { color: t.text }]}>
            {renderInline(trimmed, accent, t.textMuted)}
          </Text>
        );
      })}
    </View>
  );
}

// Gras inline **texte** et flèche →
function renderInline(text: string, accent: string, muted: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '700', color: accent }}>{part.slice(2, -2)}</Text>;
    }
    // Flèche → colorée
    if (part.includes('→')) {
      return (
        <Text key={i}>
          {part.split('→').map((seg, j, arr) => (
            <Text key={j}>
              {seg}
              {j < arr.length - 1 && <Text style={{ color: accent, fontWeight: '700' }}> → </Text>}
            </Text>
          ))}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FicheScreen({ route, navigation }: any) {
  const { chapterIndex, chapterTitle } = route.params as {
    chapterIndex: number;
    chapterTitle: string;
  };

  const t = useTheme();
  const { top } = useSafeAreaInsets();
  const { activeCourse, fiches, ficheContentHash, saveFiche } = useAppStore();
  const chunk = activeCourse?.chunks?.[chapterIndex];
  const subjectStyle = getSubjectStyle(activeCourse?.subjectName ?? '');
  const accent = subjectStyle.accent;
  const bg = subjectStyle.bg;

  const [raw, setRaw] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadFiche(); }, []);

  const loadFiche = async () => {
    if (!chunk || !activeCourse) { setError('Chapitre introuvable.'); setLoading(false); return; }

    // 1. Cache local
    const cacheKey = `${activeCourse.id}_${chapterIndex}`;
    const currentHash = hashContent(chunk.content);
    if (fiches[cacheKey]) {
      // Met à jour le hash si manquant
      if (!ficheContentHash[cacheKey]) saveFiche(activeCourse.id, chapterIndex, fiches[cacheKey], currentHash);
      setRaw(fiches[cacheKey]); setLoading(false); return;
    }

    // 2. Supabase (partagé entre tous les élèves de la classe)
    try {
      const { data } = await supabase
        .from('courses').select('fiches').eq('id', activeCourse.id).single();
      const sbFiche = (data?.fiches as Record<string, string> | null)?.[String(chapterIndex)];
      if (sbFiche) {
        saveFiche(activeCourse.id, chapterIndex, sbFiche, currentHash);
        setRaw(sbFiche); setLoading(false); return;
      }
    } catch {}

    // 3. Génération IA
    generate();
  };

  const generate = async () => {
    if (!chunk || !activeCourse) return;
    setLoading(true); setError('');
    try {
      const result = await generateFiche(chunk, activeCourse.subjectName, activeCourse.name);
      const hash = hashContent(chunk.content);
      // Affichage + cache local immédiatement
      setRaw(result);
      saveFiche(activeCourse.id, chapterIndex, result, hash);
      // Sauvegarde Supabase en arrière-plan (silencieuse si échec)
      supabase.from('courses').select('fiches').eq('id', activeCourse.id).single()
        .then(({ data }) => {
          const existing = (data?.fiches as Record<string, string>) || {};
          supabase.from('courses').update({
            fiches: { ...existing, [String(chapterIndex)]: result },
          }).eq('id', activeCourse.id).then(() => {});
        });
    } catch (e: any) {
      setError(e.message || 'Erreur de génération.');
    }
    setLoading(false);
  };

  const sections = raw ? parseFiche(raw) : [];

  const handleShare = async () => {
    try {
      await Share.share({
        message: `📚 Fiche — ${chapterTitle}\n\n${raw}`,
        title: `Fiche ${chapterTitle}`,
      });
    } catch {}
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: top + Spacing.sm, backgroundColor: bg }]}>
        <View style={styles.hBubble} />
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: Spacing.md }}>
            <Text style={styles.headerSub}>{activeCourse?.subjectName?.toUpperCase()}</Text>
            <Text style={styles.headerTitle} numberOfLines={2}>{chapterTitle}</Text>
          </View>
          {!loading && raw ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={styles.shareBtn}
                activeOpacity={0.75}
                onPress={() => {
                  if (!chunk) return;
                  const key = `${activeCourse?.id}_${chapterIndex}`;
                  const storedHash = ficheContentHash[key];
                  const currentHash = hashContent(chunk.content);
                  if (storedHash && storedHash === currentHash) {
                    Alert.alert(
                      'Cours inchangé',
                      'Le contenu du cours n\'a pas été modifié. La fiche est déjà à jour.'
                    );
                    return;
                  }
                  Alert.alert(
                    'Nouveau contenu détecté',
                    'Le cours a été mis à jour. Regénérer la fiche pour tous les élèves de la classe ?',
                    [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Regénérer', style: 'destructive', onPress: generate },
                    ]
                  );
                }}
              >
                <Ionicons name="refresh-outline" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.75}>
                <Ionicons name="share-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <View style={[styles.fichePill, { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.28)' }]}>
          <Ionicons name="document-text-outline" size={12} color="#fff" />
          <Text style={styles.fichePillTxt}>FICHE DE RÉVISION</Text>
        </View>
      </View>

      {/* Contenu */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={accent} size="large" />
          <Text style={[styles.loadingTxt, { color: t.textMuted }]}>
            Génération de ta fiche en cours…
          </Text>
          <Text style={[styles.loadingHint, { color: t.textMuted }]}>
            Prof Moctar prépare ça pour toi
          </Text>
        </View>
      ) : error ? (
        <View style={styles.loadingWrap}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>😕</Text>
          <Text style={[styles.loadingTxt, { color: Colors.error }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: accent }]}
            onPress={generate}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60, gap: 12 }}
        >
          {sections.map((sec, i) => {
            const sectionAccent = SECTION_COLORS[sec.emoji] ?? accent;
            return (
              <View key={i} style={[styles.card, { backgroundColor: t.surface, borderLeftColor: sectionAccent }, Shadows.sm]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.emojiBox, { backgroundColor: sectionAccent + '18' }]}>
                    <Text style={styles.emoji}>{sec.emoji}</Text>
                  </View>
                  <Text style={[styles.cardTitle, { color: sectionAccent }]}>{sec.title}</Text>
                </View>
                <BodyText text={sec.body} accent={sectionAccent} />
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14 },
      android: { elevation: 10 },
    }),
  },
  hBubble: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerSub: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginTop: 2 },
  shareBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  fichePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1,
  },
  fichePillTxt: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingTxt:  { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  loadingHint: { fontSize: 13, textAlign: 'center' },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.md },

  card: {
    borderRadius: Radius.md, padding: Spacing.lg,
    borderLeftWidth: 4, gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  emojiBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 18 },
  cardTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3, flex: 1, textTransform: 'uppercase' },

  bodyLine: { fontSize: 14, lineHeight: 21 },

  bulletLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8, flexShrink: 0 },

  numberedLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  numBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  numTxt: { fontSize: 11, fontWeight: '800' },
});
