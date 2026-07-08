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
import { supabase, SBPromotion } from '../lib/supabase';
import { useAppStore } from '../store';
import { Colors, Spacing, Radius, Shadows } from '../theme';
import { useTheme, Text, TextInput } from '../components';

export default function StudentSetupScreen() {
  const { setStudentInfo, userId } = useAppStore();
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [promotions, setPromotions] = useState<SBPromotion[]>([]);
  const [selected, setSelected] = useState<SBPromotion | null>(null);
  const [loading, setLoading] = useState(true);

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

  const ready = name.trim().length > 0 && selected !== null;

  const handleStart = async () => {
    if (!ready) return;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id || userId;
    supabase.from('students').upsert({
      user_id: uid,
      name: name.trim(),
      promotion_id: selected!.id,
      promotion_name: selected!.name,
      school_name: 'FMPOS UNAM',
    }, { onConflict: 'user_id' }).then(() => {});
    setStudentInfo(name.trim(), selected!.id, selected!.name);
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: top }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: Colors.blue }]}>
          <View style={styles.heroBubble1} />
          <View style={styles.heroBubble2} />
          <Text style={styles.heroTitle}>Bienvenue</Text>
          <Text style={styles.heroSub}>
            Dr. Ahmed va personnaliser votre revision selon votre promotion
          </Text>
          <View style={styles.stepsRow}>
            <View style={[styles.stepDot, name.trim() ? styles.stepDotDone : {}]} />
            <View style={styles.stepLine} />
            <View style={[styles.stepDot, selected ? styles.stepDotDone : {}]} />
          </View>
        </View>

        {/* Prenom */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>VOTRE PRENOM</Text>
          <View style={[
            styles.inputCard,
            { backgroundColor: t.surface, borderColor: name ? Colors.blue : t.border },
          ]}>
            <TextInput
              style={[styles.nameInput, { color: t.text }]}
              placeholder="Ahmed, Fatima..."
              placeholderTextColor={t.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoFocus
              selectionColor={Colors.blue}
            />
          </View>
        </View>

        {/* Promotion */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>VOTRE PROMOTION</Text>

          {loading ? (
            <ActivityIndicator color={Colors.blue} style={{ marginTop: 20 }} />
          ) : promotions.length === 0 ? (
            <Text style={[styles.emptyText, { color: t.textMuted }]}>
              Aucune promotion disponible
            </Text>
          ) : (
            <View style={styles.promoGrid}>
              {promotions.map(item => {
                const active = selected?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.promoCard,
                      { backgroundColor: t.surface, borderColor: t.border },
                      active ? styles.promoCardActive : {},
                    ]}
                    onPress={() => setSelected(item)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.promoLabel, active ? styles.promoLabelActive : {}]}>
                      {item.name}
                    </Text>
                    {item.description ? (
                      <Text style={[styles.promoDesc, { color: active ? 'rgba(255,255,255,0.75)' : t.textMuted }]}>
                        {item.description}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Bouton */}
        <View style={styles.btnWrap}>
          <TouchableOpacity
            onPress={handleStart}
            disabled={!ready}
            activeOpacity={0.85}
          >
            <View style={[styles.btn, !ready ? styles.btnDisabled : {}]}>
              <Text style={styles.btnText}>Commencer</Text>
              <Text style={styles.btnArrow}>{'->'}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingTop: 0, paddingHorizontal: 0 },

  hero: {
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxxl + 8,
    paddingHorizontal: Spacing.xxl,
    marginBottom: Spacing.xxxl,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  heroBubble1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -40,
  },
  heroBubble2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: -20, left: -20,
  },
  heroTitle: {
    marginTop: Spacing.sm,
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: Spacing.sm,
  },
  heroSub: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 260,
    color: 'rgba(255,255,255,0.75)',
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  stepDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stepDotDone: { backgroundColor: '#fff' },
  stepLine: {
    width: 40, height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 6,
  },

  section: { marginBottom: Spacing.xxxl, paddingHorizontal: Spacing.xxl },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: Spacing.lg,
  },

  inputCard: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.lg,
    ...Shadows.sm,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: '600',
    paddingVertical: 14,
    letterSpacing: -0.3,
  },

  promoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  promoCard: {
    width: '46%',
    flexGrow: 1,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  promoCardActive: {
    backgroundColor: Colors.blue,
    borderColor: Colors.blue,
  },
  promoLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  promoLabelActive: {
    color: '#fff',
  },
  promoDesc: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },

  btn: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    paddingHorizontal: Spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: Spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: Colors.blue,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  btnDisabled: { backgroundColor: Colors.blueMid, elevation: 0, shadowOpacity: 0 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  btnArrow: { fontSize: 18, color: '#fff', fontWeight: '700' },
  btnWrap: { paddingHorizontal: Spacing.xxl },
});
