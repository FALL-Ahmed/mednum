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
import { Spacing, Radius } from '../theme';
import { useTheme, Text, TextInput } from '../components';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const STRINGS = {
  fr: {
    title1:      'Dossier',
    title2:      'etudiant',
    sub:         "Dr. Ahmed s'adapte a votre niveau et votre programme",
    labelName:   'PRENOM',
    placeholder: 'Votre prenom...',
    labelYear:   "ANNEE D'ETUDES",
    empty:       'Aucune promotion disponible',
    btn:         'Commencer',
    hint1:       "Renseignez votre prenom d'abord",
    hint2:       "Choisissez votre annee d'etudes",
  },
  ar: {
    title1:      'ملف',
    title2:      'الطالب',
    sub:         'د. أحمد يتكيّف مع مستواك ودروسك',
    labelName:   'الاسم',
    placeholder: 'اسمك...',
    labelYear:   'السنة الدراسية',
    empty:       'لا توجد ترقيات متاحة',
    btn:         'ابدأ',
    hint1:       'أدخل اسمك أولاً',
    hint2:       'اختر سنتك الدراسية',
  },
} as const;

export default function StudentSetupScreen() {
  const { setStudentInfo, userId, uiLanguage } = useAppStore();
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const s   = STRINGS[uiLanguage] ?? STRINGS.fr;
  const rtl = uiLanguage === 'ar';
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
    <View style={[styles.root, { paddingTop: top }]}>

      {/* ── HEADER navy ── */}
      <View style={[styles.header, rtl && styles.rtl]}>
        <Text style={[styles.titleLine1, rtl && styles.rtlText]}>{s.title1}</Text>
        <Text style={[styles.titleLine2, rtl && styles.rtlText]}>{s.title2}</Text>
        <Text style={[styles.headerSub, rtl && styles.rtlText]}>{s.sub}</Text>
      </View>

      {/* ── BODY blanc ── */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Prenom */}
        <Text style={[styles.fieldLabel, { color: t.textMuted }, rtl && styles.rtlText]}>
          {s.labelName}
        </Text>
        <View style={[
          styles.inputRow,
          { borderBottomColor: step1Done ? TEAL : t.border },
          rtl && styles.rtl,
        ]}>
          <TextInput
            style={[styles.nameInput, { color: t.text }, rtl && styles.rtlText]}
            placeholder={s.placeholder}
            placeholderTextColor={t.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
            selectionColor={TEAL}
            textAlign={rtl ? 'right' : 'left'}
          />
          {step1Done && (
            <Ionicons name="checkmark-circle" size={22} color={TEAL} />
          )}
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: t.border }]} />

        {/* Promotion */}
        <Text style={[styles.fieldLabel, { color: t.textMuted }, rtl && styles.rtlText]}>
          {s.labelYear}
        </Text>

        {loading ? (
          <ActivityIndicator color={TEAL} style={{ marginTop: 20 }} />
        ) : promotions.length === 0 ? (
          <Text style={[styles.emptyText, { color: t.textMuted }, rtl && styles.rtlText]}>
            {s.empty}
          </Text>
        ) : (
          <View style={styles.radioList}>
            {promotions.map(item => {
              const active = selected?.id === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.radioItem,
                    active && { backgroundColor: TEAL_BG },
                  ]}
                  onPress={() => setSelected(item)}
                  activeOpacity={0.6}
                >
                  {/* cercle radio */}
                  <View style={[styles.radioCircle, active && styles.radioCircleActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>

                  {/* textes */}
                  <View style={[styles.radioTexts, rtl && styles.rtl]}>
                    <Text style={[
                      styles.radioMain,
                      { color: t.text },
                      active && { color: NAVY, fontWeight: '700' },
                      rtl && styles.rtlText,
                    ]}>
                      {item.description ?? item.name}
                    </Text>
                    <Text style={[
                      styles.radioCode,
                      { color: t.textMuted },
                      active && { color: TEAL },
                      rtl && styles.rtlText,
                    ]}>
                      {item.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Bouton */}
        <View style={styles.btnWrap}>
          <TouchableOpacity
            style={[styles.btn, !ready && styles.btnOff]}
            onPress={handleStart}
            disabled={!ready}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnText, !ready && styles.btnTextOff]}>
              {s.btn}
            </Text>
            {ready && (
              <Ionicons
                name={rtl ? 'arrow-back' : 'arrow-forward'}
                size={18}
                color="#fff"
              />
            )}
          </TouchableOpacity>
          {!ready && (
            <Text style={[styles.hintText, { color: t.textMuted }, rtl && styles.rtlText]}>
              {!step1Done ? s.hint1 : s.hint2}
            </Text>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NAVY,
  },

  /* ── Header ── */
  header: {
    paddingHorizontal: 28,
    paddingTop: Spacing.lg,
    paddingBottom: 36,
  },
  titleLine1: {
    fontFamily: SERIF,
    fontSize: 46,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 50,
  },
  titleLine2: {
    fontFamily: SERIF,
    fontSize: 46,
    fontWeight: '400',
    color: TEAL,
    letterSpacing: -2,
    lineHeight: 50,
    marginBottom: 14,
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.38)',
    lineHeight: 19,
    maxWidth: 220,
  },

  /* ── Body ── */
  body: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bodyContent: {
    flexGrow: 1,
    padding: 28,
  },

  /* ── Field label ── */
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 14,
  },

  /* ── Input underline ── */
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 2,
    paddingBottom: 11,
    marginBottom: 28,
  },
  nameInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
    paddingVertical: 0,
  },

  /* ── Divider ── */
  divider: {
    height: 1,
    marginLeft: -28,
    marginRight: -28,
    marginBottom: 28,
  },

  /* ── Radio list ── */
  radioList: {
    gap: 2,
    marginBottom: 32,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioCircleActive: {
    borderColor: TEAL,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: TEAL,
  },
  radioTexts: { flex: 1 },
  radioMain: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  radioCode: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: 0.3,
  },

  /* ── Empty ── */
  emptyText: {
    fontSize: 14,
    marginTop: 16,
    marginBottom: 32,
  },

  /* ── Button ── */
  btnWrap: {
    alignItems: 'center',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TEAL,
    borderRadius: Radius.lg,
    paddingVertical: 17,
    alignSelf: 'stretch',
    ...Platform.select({
      ios: {
        shadowColor: TEAL,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  btnOff: {
    backgroundColor: '#E2E8F0',
    elevation: 0,
    shadowOpacity: 0,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  btnTextOff: { color: '#A0AEC0' },
  hintText: {
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },

  /* ── RTL (arabe) ── */
  rtl:     { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});
