import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase, SBPromotion } from '../lib/supabase';
import { useAppStore } from '../store';
import { Spacing, Radius, Shadows } from '../theme';
import { useTheme, Text, TextInput } from '../components';

// Palette medicale
const NAVY    = '#0B1E34';
const NAVY_MID= '#152C47';
const RED     = '#C0392B';
const RED_BG  = '#FDF2F1';
const GOLD    = '#B8860B';

export default function StudentSetupScreen() {
  const { setStudentInfo, userId } = useAppStore();
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const [name, setName]             = useState('');
  const [promotions, setPromotions] = useState<SBPromotion[]>([]);
  const [selected, setSelected]     = useState<SBPromotion | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    supabase
      .from('promotions')
      .select('id, name, description, sort_order')
      .order('sort_order')
      .then(({ data }) => {
        if (data) setPromotions(data as SBPromotion[]);
        setLoading(false);
      });
  }, []);

  const ready     = name.trim().length > 0 && selected !== null;
  const step1Done = name.trim().length > 0;
  const step2Done = selected !== null;

  const handleStart = async () => {
    if (!ready) return;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id || userId;
    supabase.from('students').upsert({
      user_id:        uid,
      name:           name.trim(),
      promotion_id:   selected!.id,
      promotion_name: selected!.name,
      school_name:    'FMPOS UNAM',
    }, { onConflict: 'user_id' }).then(() => {});
    setStudentInfo(name.trim(), selected!.id, selected!.name);
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ══ HERO ══ */}
        <View style={[styles.hero, { paddingTop: top + 20 }]}>

          {/* ECG line decoration */}
          <View style={styles.ecgLine}>
            <View style={styles.ecgFlat1} />
            <View style={styles.ecgUp} />
            <View style={styles.ecgDown} />
            <View style={styles.ecgUp2} />
            <View style={styles.ecgFlat2} />
          </View>

          {/* icone centrale */}
          <View style={styles.iconRing}>
            <Ionicons name="pulse-outline" size={28} color="#fff" />
          </View>

          <Text style={styles.heroTitle}>Bienvenue</Text>
          <Text style={styles.heroSub}>
            Dites-nous ou vous en etes dans vos etudes
          </Text>

          {/* steps */}
          <View style={styles.stepsRow}>
            <View style={styles.stepWrap}>
              <View style={[styles.stepCircle, step1Done && styles.stepCircleDone]}>
                <Text style={[styles.stepNum, step1Done && styles.stepNumDone]}>
                  {step1Done ? '✓' : '1'}
                </Text>
              </View>
              <Text style={[styles.stepLabel, step1Done && styles.stepLabelDone]}>
                Identite
              </Text>
            </View>
            <View style={[styles.stepLine, step1Done && styles.stepLineDone]} />
            <View style={styles.stepWrap}>
              <View style={[styles.stepCircle, step2Done && styles.stepCircleDone]}>
                <Text style={[styles.stepNum, step2Done && styles.stepNumDone]}>
                  {step2Done ? '✓' : '2'}
                </Text>
              </View>
              <Text style={[styles.stepLabel, step2Done && styles.stepLabelDone]}>
                Promotion
              </Text>
            </View>
          </View>
        </View>

        {/* ══ PRENOM ══ */}
        <View style={styles.section}>
          <View style={styles.fieldHeader}>
            <View style={[styles.fieldNum, step1Done && styles.fieldNumDone]}>
              <Text style={[styles.fieldNumText, step1Done && styles.fieldNumTextDone]}>
                {step1Done ? '✓' : '1'}
              </Text>
            </View>
            <Text style={[styles.fieldLabel, { color: t.textMuted }]}>VOTRE PRENOM</Text>
          </View>

          <View style={[
            styles.inputCard,
            { backgroundColor: t.surface, borderColor: name ? RED : t.border },
          ]}>
            <TextInput
              style={[styles.nameInput, { color: t.text }]}
              placeholder="Ahmed, Fatima..."
              placeholderTextColor={t.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoFocus
              selectionColor={RED}
            />
            {step1Done && (
              <Ionicons name="checkmark-circle" size={22} color={RED} style={{ marginLeft: 8 }} />
            )}
          </View>
        </View>

        {/* ══ PROMOTION ══ */}
        <View style={styles.section}>
          <View style={styles.fieldHeader}>
            <View style={[styles.fieldNum, step2Done && styles.fieldNumDone]}>
              <Text style={[styles.fieldNumText, step2Done && styles.fieldNumTextDone]}>
                {step2Done ? '✓' : '2'}
              </Text>
            </View>
            <Text style={[styles.fieldLabel, { color: t.textMuted }]}>ANNEE D'ETUDES</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={RED} style={{ marginTop: 24 }} />
          ) : promotions.length === 0 ? (
            <Text style={[styles.emptyText, { color: t.textMuted }]}>
              Aucune promotion disponible
            </Text>
          ) : (
            <View style={styles.promoList}>
              {promotions.map((item, idx) => {
                const active = selected?.id === item.id;
                const isResidanat = idx === promotions.length - 1;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.promoCard,
                      { backgroundColor: t.surface, borderColor: t.border },
                      active && { backgroundColor: RED_BG, borderColor: RED },
                    ]}
                    onPress={() => setSelected(item)}
                    activeOpacity={0.7}
                  >
                    {/* accent gauche */}
                    <View style={[styles.cardAccent, active && styles.cardAccentActive]} />

                    {/* badge annee */}
                    <View style={[
                      styles.yearBadge,
                      { backgroundColor: active ? RED : t.surfaceAlt ?? '#F1F3F6' },
                    ]}>
                      <Text style={[
                        styles.yearBadgeText,
                        { color: active ? '#fff' : t.textMuted },
                      ]}>
                        {item.name}
                      </Text>
                    </View>

                    {/* texte */}
                    <View style={styles.cardBody}>
                      <Text style={[
                        styles.cardTitle,
                        { color: active ? RED : t.text },
                      ]}>
                        {item.description ?? item.name}
                      </Text>
                      {isResidanat && (
                        <Text style={[styles.cardSub, { color: active ? '#8B1A14' : t.textMuted }]}>
                          Specialisation post-graduee
                        </Text>
                      )}
                    </View>

                    {active && (
                      <Ionicons name="checkmark-circle" size={20} color={RED} style={{ marginRight: 14 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ══ BOUTON ══ */}
        <View style={styles.btnWrap}>
          <TouchableOpacity
            style={[styles.btn, !ready && styles.btnDisabled]}
            onPress={handleStart}
            disabled={!ready}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnText, !ready && styles.btnTextOff]}>
              Commencer
            </Text>
            {ready && (
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            )}
          </TouchableOpacity>
          {!ready && (
            <Text style={[styles.btnHint, { color: t.textMuted }]}>
              {!step1Done
                ? 'Entrez votre prenom pour continuer'
                : 'Choisissez votre annee d\'etudes'}
            </Text>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1 },
  scroll: { paddingTop: 0 },

  /* ── Hero ── */
  hero: {
    backgroundColor: NAVY,
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingBottom: 44,
    marginBottom: Spacing.xxxl,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },

  /* ECG decoratif */
  ecgLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.12,
  },
  ecgFlat1: { flex: 2, height: 2, backgroundColor: '#fff' },
  ecgUp:    { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 22, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff' },
  ecgDown:  { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 18, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff' },
  ecgUp2:   { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 14, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff' },
  ecgFlat2: { flex: 3, height: 2, backgroundColor: '#fff' },

  iconRing: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },

  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 240,
  },

  /* Steps */
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xxxl,
  },
  stepWrap:  { alignItems: 'center', gap: 5 },
  stepCircle: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleDone: { backgroundColor: RED, borderColor: RED },
  stepNum: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.35)' },
  stepNumDone: { color: '#fff' },
  stepLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.3)', letterSpacing: 0.4 },
  stepLabelDone: { color: 'rgba(255,255,255,0.75)' },
  stepLine: {
    width: 52, height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 10, marginBottom: 14,
  },
  stepLineDone: { backgroundColor: RED },

  /* ── Section ── */
  section: { marginBottom: Spacing.xxxl, paddingHorizontal: Spacing.xxl },
  fieldHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  fieldNum: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#CBD5E0',
    alignItems: 'center', justifyContent: 'center',
  },
  fieldNumDone: { backgroundColor: RED, borderColor: RED },
  fieldNumText: { fontSize: 10, fontWeight: '700', color: '#A0AEC0' },
  fieldNumTextDone: { color: '#fff' },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },

  /* ── Input ── */
  inputCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.lg, borderWidth: 1.5,
    paddingHorizontal: Spacing.lg,
    ...Shadows.sm,
  },
  nameInput: {
    flex: 1,
    fontSize: 19,
    fontWeight: '600',
    paddingVertical: 14,
    letterSpacing: -0.2,
  },

  /* ── Promo list ── */
  promoList: { gap: 8 },
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    overflow: 'hidden',
    minHeight: 60,
    ...Shadows.sm,
  },
  cardAccent: { width: 4, alignSelf: 'stretch', backgroundColor: 'transparent' },
  cardAccentActive: { backgroundColor: RED },
  yearBadge: {
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    minWidth: 44,
    alignItems: 'center',
  },
  yearBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: -0.2 },
  cardBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 12 },
  cardTitle: { fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },
  cardSub:   { fontSize: 11, fontWeight: '400', marginTop: 2 },

  /* ── Empty ── */
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: Spacing.lg },

  /* ── Bouton ── */
  btnWrap: { paddingHorizontal: Spacing.xxl, alignItems: 'center' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: NAVY,
    borderRadius: Radius.xl,
    paddingVertical: 16,
    alignSelf: 'stretch',
    ...Platform.select({
      ios: {
        shadowColor: NAVY,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  btnDisabled: { backgroundColor: '#9CA3AF', elevation: 0, shadowOpacity: 0 },
  btnText:     { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  btnTextOff:  { color: 'rgba(255,255,255,0.7)' },
  btnHint:     { fontSize: 12, marginTop: 10, textAlign: 'center' },
});
