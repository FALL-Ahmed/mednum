import React, { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, Platform,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, CourseChunk } from '../store';
import { supabase } from '../lib/supabase';
import { generateFiche } from '../utils/rag';
import { Colors, Spacing, Radius, Shadows } from '../theme';
import { useTheme, Text } from '../components';
import { useT, useUiLang } from '../i18n';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

// Hash léger du contenu (djb2) — pour détecter si le cours a changé
function hashContent(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// ── Parsing des sections ##  ──────────────────────────────────────────────────

type FicheSection = { title: string; emoji: string; body: string };

// Ionicons par numéro de section médicale
type SectionIcon = { name: React.ComponentProps<typeof Ionicons>['name']; color: string };

const SECTION_ICONS: Record<string, SectionIcon> = {
  'I':   { name: 'document-text-outline',    color: '#2563EB' },
  'II':  { name: 'pulse-outline',            color: '#7C3AED' },
  'III': { name: 'search-outline',           color: '#059669' },
  'IV':  { name: 'medkit-outline',           color: '#DC2626' },
  'V':   { name: 'help-circle-outline',      color: '#4F46E5' },
  'VI':  { name: 'warning-outline',          color: '#D97706' },
  'VII': { name: 'grid-outline',             color: '#0D9488' },
};

const SECTION_COLORS: Record<string, string> = {
  '📋': '#2563EB',
  '🔬': '#7C3AED',
  '🩺': '#059669',
  '💊': '#DC2626',
  '⭐': '#F59E0B',
  '★':  '#F59E0B',
  '📄': '#6B7280',
  '📌': '#6B7280',
};

function parseFiche(raw: string): FicheSection[] {
  // Format médical Axone : séparateurs ═══ et sections numérotées (I. II. III. IV. V.)
  const medicalPattern = /═{3,}\n((?:VII|VI|IV|III|II|V|I)\.?\s+[^\n]+)\n═{3,}/g;
  const hasMedicalFormat = medicalPattern.test(raw);

  if (hasMedicalFormat) {
    // Parse le format médical avec séparateurs ═══
    const sections: FicheSection[] = [];
    // Extraire l'en-tête (avant le premier ═══)
    const beforeFirst = raw.split(/═{3,}/)[0].trim();
    if (beforeFirst) {
      sections.push({ title: beforeFirst, emoji: '📄', body: '' });
    }
    // Découper par les blocs ═══ TITRE ═══ ... ═══
    const blocks = raw.split(/═{15,}/);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      if (!block) continue;
      const lines = block.split('\n');
      const titleLine = lines[0].trim();
      // Detect section number (I., II., III., IV., V.)
      const numMatch = titleLine.match(/^(VII|VI|IV|III|II|V|I)\.?\s+(.+)/);
      if (numMatch) {
        const num = numMatch[1];
        const title = numMatch[2].trim();
        const body = lines.slice(1).join('\n').trim();
        sections.push({ title, emoji: num, body });
      } else if (titleLine && i > 0) {
        // Bloc sans numéro romain — inclure dans la section précédente ou comme section orpheline
        const body = lines.join('\n').trim();
        if (body && sections.length > 0) {
          sections[sections.length - 1].body += '\n' + body;
        }
      }
    }
    return sections.filter(s => s.title || s.body);
  }

  // Fallback : ancien format ProfNum avec ## emoji TITRE
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

function BodyText({ text, accent, rtl }: { text: string; accent: string; rtl?: boolean }) {
  const t = useTheme();
  const lines = text.split('\n').filter(l => l.trim());
  const align: 'left' | 'right' = rtl ? 'right' : 'left';
  const dir: 'rtl' | 'ltr' = rtl ? 'rtl' : 'ltr';

  return (
    <View style={{ gap: 6 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Sous-titre markdown : "### texte" ou "### **texte**" (ex: "Méthode 1", "Méthode 2")
        if (/^#{2,4}\s/.test(trimmed)) {
          const content = trimmed.replace(/^#{2,4}\s*/, '').replace(/\*\*/g, '');
          return (
            <Text
              key={i}
              style={[
                styles.subHeading,
                { color: accent, textAlign: align, writingDirection: dir, marginTop: i === 0 ? 0 : 10 },
              ]}
            >
              {content}
            </Text>
          );
        }

        // Ligne numérotée : "1. texte"
        if (/^\d+\./.test(trimmed)) {
          const num = trimmed.match(/^(\d+)\./)?.[1] ?? '';
          const content = trimmed.replace(/^\d+\.\s*/, '');
          return (
            <View key={i} style={[styles.numberedLine, rtl && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.numBadge, { backgroundColor: accent + '22' }]}>
                <Text style={[styles.numTxt, { color: accent }]}>{num}</Text>
              </View>
              <Text style={[styles.bodyLine, { color: t.text, flex: 1, textAlign: align, writingDirection: dir }]}>
                {renderInline(content, accent, t.textMuted, rtl)}
              </Text>
            </View>
          );
        }

        // Ligne ★ (points clés concours médical)
        if (/^★/.test(trimmed)) {
          const content = trimmed.replace(/^★\s*/, '');
          return (
            <View key={i} style={[styles.bulletLine, rtl && { flexDirection: 'row-reverse' }]}>
              <Text style={{ fontSize: 14, color: '#F59E0B', marginTop: 2 }}>★</Text>
              <Text style={[styles.bodyLine, { color: t.text, flex: 1, textAlign: align, writingDirection: dir, fontWeight: '600' }]}>
                {renderInline(content, accent, t.textMuted, rtl)}
              </Text>
            </View>
          );
        }

        // Ligne bullet : "• texte"
        if (/^[•\-]/.test(trimmed)) {
          const content = trimmed.replace(/^[•\-]\s*/, '');
          return (
            <View key={i} style={[styles.bulletLine, rtl && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.bullet, { backgroundColor: accent }]} />
              <Text style={[styles.bodyLine, { color: t.text, flex: 1, textAlign: align, writingDirection: dir }]}>
                {renderInline(content, accent, t.textMuted, rtl)}
              </Text>
            </View>
          );
        }

        // Ligne normale
        return (
          <Text key={i} style={[styles.bodyLine, { color: t.text, textAlign: align, writingDirection: dir }]}>
            {renderInline(trimmed, accent, t.textMuted, rtl)}
          </Text>
        );
      })}
    </View>
  );
}

// Gras inline **texte** et flèche →
function renderInline(text: string, accent: string, muted: string, rtl?: boolean): React.ReactNode {
  const dir: 'rtl' | 'ltr' = rtl ? 'rtl' : 'ltr';
  const arrow = rtl ? '←' : '→';
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '700', color: accent, writingDirection: dir }}>{part.slice(2, -2)}</Text>;
    }
    // Flèche → colorée (← en arabe, pour suivre le sens de lecture)
    if (part.includes('→')) {
      return (
        <Text key={i} style={{ writingDirection: dir }}>
          {part.split('→').map((seg, j, arr) => (
            <Text key={j} style={{ writingDirection: dir }}>
              {seg}
              {j < arr.length - 1 && <Text style={{ color: accent, fontWeight: '700' }}> {arrow} </Text>}
            </Text>
          ))}
        </Text>
      );
    }
    return <Text key={i} style={{ writingDirection: dir }}>{part}</Text>;
  });
}

// ── Génération HTML pour PDF ──────────────────────────────────────────────────

function buildFicheHTML(
  sections: FicheSection[],
  chapterTitle: string,
  subjectName: string,
  accent: string,
  headerBg: string,
  isArabic?: boolean,
): string {
  const sectionColors: Record<string, string> = {
    'I': '#2563EB', 'II': '#7C3AED', 'III': '#059669', 'IV': '#DC2626',
    'V': '#4F46E5', 'VI': '#D97706', 'VII': '#0D9488',
  };

  const sectionsHTML = sections.map(sec => {
    const color = sectionColors[sec.emoji] ?? accent;
    const bodyHTML = sec.body
      .split('\n')
      .filter(l => l.trim())
      .map(line => {
        const t = line.trim();
        if (/^#{2,4}\s/.test(t)) {
          const content = t.replace(/^#{2,4}\s*/, '').replace(/\*\*/g, '');
          return `<p class="subhead" style="color:${color}">${content}</p>`;
        }
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
      <div class="section" style="${isArabic ? 'border-right-color' : 'border-left-color'}:${color}">
        <div class="section-header">
          <span class="emoji">${sec.emoji}</span>
          <span class="section-title" style="color:${color}">${sec.title}</span>
        </div>
        <div class="section-body">${bodyHTML}</div>
      </div>`;
  }).join('');

  const rtlCSS = isArabic ? `
  body { direction: rtl; }
  .section { border-left: none; border-right: 4px solid; }
  .header-label, .header-title, .header-sub { text-align: right; }
  p, .bullet span:last-child, .numbered span:last-child { text-align: right; }` : '';

  return `<!DOCTYPE html>
<html lang="${isArabic ? 'ar' : 'fr'}" dir="${isArabic ? 'rtl' : 'ltr'}">
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
  .subhead { font-weight: 800; margin-top: 10px; margin-bottom: 4px; }
  strong { font-weight: 700; }
  .footer { text-align: center; padding: 20px; font-size: 10px; color: #9CA3AF; font-weight: 500; }
  ${rtlCSS}
</style>
</head>
<body>
  <div class="header">
    <div class="header-label">${subjectName.toUpperCase()} · ${isArabic ? 'بطاقة مراجعة' : 'FICHE DE RÉVISION'}</div>
    <div class="header-title">${chapterTitle}</div>
    <div class="header-sub">Axone — Dr. Ahmed — ${isArabic ? 'أُنشئت في' : 'Généré le'} ${new Date().toLocaleDateString(isArabic ? 'ar' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  </div>
  <div class="content">${sectionsHTML}</div>
  <div class="footer">Axone · Mauritanie</div>
</body>
</html>`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FicheScreen({ navigation }: any) {
  const t = useTheme();
  const tr = useT();
  const { top } = useSafeAreaInsets();
  const { activeCourse, fiches, ficheContentHash, saveFiche, decrementQuota, syncQuota, studentClassName, studentFiliere } = useAppStore();
  const niveauEtudiant = studentClassName || 'P3';
  const filiere = (studentFiliere as 'medecine' | 'pharmacie') || 'medecine';
  // Fiche générée sur le document entier (plus de découpage par chapitre)
  const chunk: CourseChunk | undefined = activeCourse
    ? { title: activeCourse.name, content: activeCourse.content, index: 0 }
    : undefined;
  const chapterTitle = activeCourse?.name ?? '';
  const accent = TEAL;
  const bg = NAVY;
  // isArabic pilote la langue du CONTENU (fiche générée / export PDF) — suit la langue du cours.
  const isArabic = activeCourse?.language === 'ar';
  // uiRtl pilote le CHROME de l'écran (en-tête, bouton retour) — suit la langue de l'app, comme le reste de l'app.
  const uiRtl = useUiLang() === 'ar';

  const [raw, setRaw] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadFiche(); }, []);

  const loadFiche = async () => {
    if (!chunk || !activeCourse) { setError(tr.fiche.chapterNotFound); setLoading(false); return; }

    // 1. Cache local
    const cacheKey = `${activeCourse.id}_0`;
    const currentHash = hashContent(chunk.content);
    if (fiches[cacheKey]) {
      // Met à jour le hash si manquant
      if (!ficheContentHash[cacheKey]) saveFiche(activeCourse.id, 0, fiches[cacheKey], currentHash);
      setRaw(fiches[cacheKey]); setLoading(false); return;
    }

    // 2. Supabase (persistée sur le compte de l'élève, survit à une réinstallation)
    try {
      const { data } = await supabase
        .from('documents').select('fiche').eq('id', activeCourse.id).maybeSingle();
      if (data?.fiche) {
        saveFiche(activeCourse.id, 0, data.fiche, currentHash);
        setRaw(data.fiche); setLoading(false); return;
      }
    } catch {}

    // 3. Génération IA — vérifie la connexion d'abord
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      setError(tr.fiche.notGeneratedYet);
      setLoading(false);
      return;
    }
    generate();
  };

  const generate = async () => {
    if (!chunk || !activeCourse) return;
    setLoading(true); setError('');
    try {
      const result = await generateFiche(chunk, activeCourse.name, niveauEtudiant, filiere);
      decrementQuota();
      const hash = hashContent(chunk.content);
      // Affichage + cache local immédiatement
      setRaw(result);
      saveFiche(activeCourse.id, 0, result, hash);
      // Sauvegarde Supabase en arrière-plan (silencieuse si échec) — évite de
      // regénérer (coût + temps) si l'élève revient sur ce document plus tard.
      supabase.from('documents')
        .update({ fiche: result, fiche_hash: hash, updated_at: new Date().toISOString() })
        .eq('id', activeCourse.id)
        .then(({ error }) => { if (error) console.log('[Fiche] sauvegarde Supabase échouée:', error.message); });
    } catch (e: any) {
      if (e?.isQuotaExceeded) {
        syncQuota();
        setError(tr.chat.quotaExceededMsg);
      } else {
        setError(e.message || 'Erreur de génération.');
      }
    }
    setLoading(false);
  };

  const sections = raw ? parseFiche(raw) : [];

  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!sections.length) return;
    // L'export PDF est réservé aux plans Standard et Premium.
    if (useAppStore.getState().planLimits?.pdfExport === false) {
      Alert.alert(
        isArabic ? 'ميزة للخطط المدفوعة' : 'Réservé aux plans payants',
        isArabic ? 'تصدير البطاقات بصيغة PDF متاح في خطتي Standard وPremium.' : "L'export des fiches en PDF est disponible avec les plans Standard et Premium.",
        [
          { text: isArabic ? 'إلغاء' : 'Annuler', style: 'cancel' },
          { text: isArabic ? 'عرض الخطط' : 'Voir les plans', onPress: () => navigation.navigate('Subscription') },
        ]
      );
      return;
    }
    setSharing(true);
    try {
      const html = buildFicheHTML(sections, chapterTitle, activeCourse?.subjectName ?? '', accent, bg, isArabic);
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
      Alert.alert(tr.subject.error, tr.fiche.pdfGenError);
    }
    setSharing(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: top + Spacing.sm, backgroundColor: bg }]}>
        <View style={styles.hBubble} />
        <View style={styles.hBubble2} />
        <View style={[styles.headerRow, uiRtl && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={uiRtl ? 'arrow-forward' : 'arrow-back'} size={22} color="#fff" />
          </TouchableOpacity>
          <View style={[
            { flex: 1, marginLeft: Spacing.md },
            uiRtl && { marginLeft: 0, marginRight: Spacing.md },
          ]}>
            <Text style={[styles.headerSub, { textAlign: uiRtl ? 'right' : 'left' }]}>{tr.fiche.pill}</Text>
            <Text style={[styles.headerTitle, { textAlign: uiRtl ? 'right' : 'left' }]} numberOfLines={2}>{chapterTitle}</Text>
          </View>
          {!loading && raw ? (
            <View style={[{ flexDirection: 'row', gap: 8 }, uiRtl && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity
                style={styles.shareBtn}
                activeOpacity={0.75}
                onPress={() => {
                  if (!chunk) return;
                  const key = `${activeCourse?.id}_0`;
                  const storedHash = ficheContentHash[key];
                  const currentHash = hashContent(chunk.content);
                  if (storedHash && storedHash === currentHash) {
                    Alert.alert(
                      tr.fiche.unchangedTitle,
                      tr.fiche.unchangedMsg
                    );
                    return;
                  }
                  Alert.alert(
                    tr.fiche.newContentTitle,
                    tr.fiche.newContentMsg,
                    [
                      { text: tr.common.cancel, style: 'cancel' },
                      { text: tr.fiche.regenerate, style: 'destructive', onPress: generate },
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
      </View>

      {/* Contenu */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={accent} size="large" />
          <Text style={[styles.loadingTxt, { color: t.textMuted }]}>
            {tr.fiche.generating}
          </Text>
          <Text style={[styles.loadingHint, { color: t.textMuted }]}>
            {tr.fiche.generatingHint}
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
            <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60, gap: 12 }}
        >
          {sections.map((sec, i) => {
            // Pour les sections médicales numérotées (I–V), utilise Ionicons
            const medIcon = SECTION_ICONS[sec.emoji];
            const sectionAccent = medIcon?.color ?? SECTION_COLORS[sec.emoji] ?? accent;
            // Section d'en-tête (titre du cours) — affichage différent
            if (sec.emoji === '📄') {
              return (
                <View key={i} style={[styles.card, { backgroundColor: t.surfaceAlt }, Shadows.sm]}>
                  <Text style={[styles.cardTitle, { color: t.text, fontFamily: SERIF, fontSize: 17, textTransform: 'none' }]}>{sec.title}</Text>
                  {sec.body ? <BodyText text={sec.body} accent={accent} rtl={isArabic} /> : null}
                </View>
              );
            }
            return (
              <View
                key={i}
                style={[
                  styles.card,
                  { backgroundColor: t.surface },
                  isArabic
                    ? { borderLeftWidth: 0, borderRightWidth: 4, borderRightColor: sectionAccent }
                    : { borderLeftColor: sectionAccent },
                  Shadows.sm,
                ]}
              >
                <View style={[styles.cardHeader, isArabic && { flexDirection: 'row-reverse' }]}>
                  <View style={[styles.emojiBox, { backgroundColor: sectionAccent + '18' }]}>
                    {medIcon
                      ? <Ionicons name={medIcon.name} size={18} color={sectionAccent} />
                      : <Text style={styles.emoji}>{sec.emoji}</Text>
                    }
                  </View>
                  <Text style={[styles.cardTitle, { color: sectionAccent, textAlign: isArabic ? 'right' : 'left' }]}>{sec.title}</Text>
                </View>
                {sec.body ? <BodyText text={sec.body} accent={sectionAccent} rtl={isArabic} /> : null}
              </View>
            );
          })}

          {/* Bannière quiz — lire la fiche ne fait pas progresser, il faut faire le quiz */}
          <View style={[styles.quizBanner, { backgroundColor: accent + '12', borderColor: accent + '40' }]}>
            <Text style={styles.quizBannerEmoji}>🎯</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.quizBannerTitle, { color: accent }]}>{tr.fiche.readyTitle}</Text>
              <Text style={[styles.quizBannerSub, { color: t.textMuted }]}>{tr.fiche.readySub}</Text>
            </View>
            <TouchableOpacity
              style={[styles.quizBannerBtn, { backgroundColor: accent }]}
              onPress={() => navigation.replace('Quiz', { courseId: activeCourse?.id })}
              activeOpacity={0.8}
            >
              <Text style={styles.quizBannerBtnText}>{tr.fiche.quizArrow}</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: 'rgba(7,169,151,0.14)', top: -70, right: -40,
  },
  hBubble2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(7,169,151,0.08)', bottom: -20, left: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerSub: { fontSize: 10, fontWeight: '800', color: TEAL, letterSpacing: 1.2 },
  headerTitle: { fontFamily: SERIF, fontSize: 19, color: '#fff', letterSpacing: -0.3, marginTop: 3 },
  shareBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingTxt:  { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  loadingHint: { fontSize: 13, textAlign: 'center' },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.md },
  quizBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: Radius.lg, borderWidth: 1,
    padding: 14, marginTop: 4,
  },
  quizBannerEmoji: { fontSize: 28 },
  quizBannerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  quizBannerSub: { fontSize: 12, lineHeight: 16 },
  quizBannerBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.md,
  },
  quizBannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

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
  subHeading: { fontSize: 14, fontWeight: '800' },

  bulletLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8, flexShrink: 0 },

  numberedLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  numBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  numTxt: { fontSize: 11, fontWeight: '800' },
});
