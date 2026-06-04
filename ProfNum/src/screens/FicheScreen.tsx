import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, Platform,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
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

// ── Génération HTML pour PDF ──────────────────────────────────────────────────

function buildFicheHTML(
  sections: FicheSection[],
  chapterTitle: string,
  subjectName: string,
  accent: string,
  headerBg: string,
): string {
  const sectionColors: Record<string, string> = {
    '💡': '#F59E0B', '📖': '#2563EB', '📐': '#7C3AED', '🔧': '#059669',
    '📅': '#DC2626', '👤': '#DB2777', '📝': '#0891B2', '✍️': '#0891B2',
    '🎯': '#16A34A', '🚨': '#EA580C', '⚠️': '#D97706',
  };

  const sectionsHTML = sections.map(sec => {
    const color = sectionColors[sec.emoji] ?? accent;
    const bodyHTML = sec.body
      .split('\n')
      .filter(l => l.trim())
      .map(line => {
        const t = line.trim();
        if (/^\d+\./.test(t)) {
          const num = t.match(/^(\d+)/)?.[1] ?? '';
          const content = t.replace(/^\d+\.\s*/, '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/→/g, '<span style="color:' + color + '">→</span>');
          return `<div class="numbered"><div class="num-cell"><span class="num" style="background:${color}22;color:${color}">${num}</span></div><span>${content}</span></div>`;
        }
        if (/^[•\-]/.test(t)) {
          const content = t.replace(/^[•\-]\s*/, '').replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${color}">$1</strong>`).replace(/→/g, '<span style="color:' + color + '">→</span>');
          return `<div class="bullet"><div class="dot"><div class="dot-inner" style="background:${color}"></div></div><span>${content}</span></div>`;
        }
        return `<p>${t.replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${color}">$1</strong>`).replace(/→/g, `<span style="color:${color}">→</span>`)}</p>`;
      }).join('');

    return `
      <div class="section" style="border-left-color:${color}">
        <div class="section-header">
          <span class="emoji">${sec.emoji}</span>
          <span class="section-title" style="color:${color}">${sec.title}</span>
        </div>
        <div class="section-body">${bodyHTML}</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${subjectName} — ${chapterTitle}</title>
<style>
  @page { margin: 22mm 14mm 18mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #1A1D23; background: #F5F6F8; }
  .header { background: ${headerBg}; color: white; padding: 24px 20px 20px; page-break-after: avoid; margin-bottom: 14px; }
  .header-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; opacity: 0.7; margin-bottom: 6px; }
  .header-title { font-size: 20px; font-weight: 800; line-height: 1.3; letter-spacing: -0.3px; }
  .header-sub { font-size: 11px; opacity: 0.65; margin-top: 6px; font-weight: 500; }
  .content { padding: 0 14px; }
  .section { background: white; border-radius: 10px; border-left: 4px solid; box-shadow: 0 1px 3px rgba(0,0,0,0.07); page-break-inside: avoid; break-inside: avoid; margin-bottom: 12px; margin-top: 4px; }
  .section-header { display: table; width: 100%; padding: 11px 14px 8px; page-break-after: avoid; }
  .emoji { display: table-cell; font-size: 17px; width: 28px; vertical-align: middle; }
  .section-title { display: table-cell; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; vertical-align: middle; }
  .section-body { padding: 0 14px 12px; }
  .bullet { display: table; width: 100%; margin-bottom: 6px; line-height: 1.55; }
  .dot { display: table-cell; width: 10px; vertical-align: top; padding-top: 6px; }
  .dot-inner { width: 6px; height: 6px; border-radius: 3px; }
  .bullet span { display: table-cell; vertical-align: top; }
  .numbered { display: table; width: 100%; margin-bottom: 6px; line-height: 1.55; }
  .num-cell { display: table-cell; width: 28px; vertical-align: top; }
  .num { display: inline-block; width: 22px; height: 22px; border-radius: 11px; font-size: 11px; font-weight: 800; text-align: center; line-height: 22px; }
  .numbered span { display: table-cell; vertical-align: top; }
  p { line-height: 1.6; color: #374151; margin-bottom: 6px; }
  strong { font-weight: 700; }
  .footer { text-align: center; padding: 20px; font-size: 10px; color: #9CA3AF; font-weight: 500; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-label">${subjectName.toUpperCase()} · FICHE DE RÉVISION</div>
    <div class="header-title">${chapterTitle}</div>
    <div class="header-sub">ProfNum — Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  </div>
  <div class="content">${sectionsHTML}</div>
  <div class="footer">ProfNum · Mauritanie</div>
</body>
</html>`;
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

  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!sections.length) return;
    setSharing(true);
    try {
      const html = buildFicheHTML(sections, chapterTitle, activeCourse?.subjectName ?? '', accent, bg);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      // Renommer le fichier avec un nom lisible
      const safeName = `Fiche_${(activeCourse?.subjectName ?? '').replace(/[^a-zA-Z0-9]/g, '_')}_${chapterTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.pdf`;
      const newUri = (FileSystem.documentDirectory ?? '') + safeName;
      await FileSystem.moveAsync({ from: uri, to: newUri });
      await Sharing.shareAsync(newUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Fiche — ${chapterTitle}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      Alert.alert('Erreur', 'Impossible de générer le PDF.');
    }
    setSharing(false);
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
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.75} disabled={sharing}>
                {sharing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="share-outline" size={20} color="#fff" />
                }
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
