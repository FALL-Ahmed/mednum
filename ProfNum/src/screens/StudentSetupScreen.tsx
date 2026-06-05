import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, SBClass } from '../lib/supabase';
import { useAppStore } from '../store';
import { Colors, Spacing, Radius } from '../theme';
import { useTheme } from '../components';

export default function StudentSetupScreen() {
  const { setStudentInfo, userId } = useAppStore();
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [classes, setClasses] = useState<SBClass[]>([]);
  const [selected, setSelected] = useState<SBClass | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('classes')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setClasses(data as SBClass[]);
        setLoading(false);
      });
  }, []);

  const ready = name.trim().length > 0 && school.trim().length > 0 && selected !== null;

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: top }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>✨</Text>
          <Text style={styles.heroTitle}>Bienvenue !</Text>
          <Text style={styles.heroSub}>
            Deux informations et tu peux commencer à apprendre
          </Text>
        </View>

        {/* Nom */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>TON PRÉNOM</Text>
          <TextInput
            style={[styles.nameInput, { color: t.text, borderBottomColor: name ? Colors.blue : t.border }]}
            placeholder="ex : Mohamed, Mariem, Cheikh…"
            placeholderTextColor={t.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
            selectionColor={Colors.blue}
          />
        </View>

        {/* École */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>TON ÉCOLE</Text>
          <TextInput
            style={[styles.nameInput, { color: t.text, borderBottomColor: school ? Colors.blue : t.border }]}
            placeholder="ex : École Privée Main Al Ouloum…"
            placeholderTextColor={t.textMuted}
            value={school}
            onChangeText={setSchool}
            autoCapitalize="words"
            selectionColor={Colors.blue}
          />
        </View>

        {/* Classe */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>TA CLASSE</Text>

          {loading ? (
            <ActivityIndicator color={Colors.blue} style={{ marginTop: 20 }} />
          ) : classes.length === 0 ? (
            <Text style={[styles.emptyText, { color: t.textMuted }]}>
              Aucune classe disponible.{'\n'}Contacte ton administrateur.
            </Text>
          ) : (
            <View style={styles.chipsWrap}>
              {classes.map(item => {
                const active = selected?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.chip,
                      active
                        ? styles.chipActive
                        : { backgroundColor: t.surface, borderColor: t.border },
                    ]}
                    onPress={() => setSelected(item)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Bouton */}
        <View style={styles.btnWrap}>
          <TouchableOpacity
            style={[styles.btn, !ready && styles.btnDisabled]}
            onPress={async () => {
              if (!ready) return;
              // Lire l'UID depuis la session en cours, pas depuis le store (qui peut être '' si auth pas encore finie)
              const { data: { session } } = await supabase.auth.getSession();
              const uid = session?.user?.id || userId;
              supabase.from('students').upsert({
                user_id: uid,
                name: name.trim(),
                class_id: selected!.id,
                class_name: selected!.name,
                school_name: school.trim(),
              }, { onConflict: 'user_id' }).then(() => {});
              setStudentInfo(name.trim(), selected!.id, selected!.name, school.trim());
            }}
            disabled={!ready}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>C'est parti</Text>
            <Text style={styles.btnArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingTop: 0, paddingHorizontal: 0 },

  /* Hero */
  hero: {
    backgroundColor: Colors.blue,
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxxl + 8,
    paddingHorizontal: Spacing.xxl,
    marginBottom: Spacing.xxxl,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroEmoji: { fontSize: 52, marginBottom: Spacing.lg },
  heroTitle: {
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

  /* Section */
  section: { marginBottom: Spacing.xxxl, paddingHorizontal: Spacing.xxl },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: Spacing.lg,
  },

  /* Name input */
  nameInput: {
    fontSize: 22,
    fontWeight: '600',
    borderBottomWidth: 2,
    paddingBottom: 10,
    letterSpacing: -0.3,
  },

  /* Chips */
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  chipActive: {
    backgroundColor: Colors.blue,
    borderColor: Colors.blue,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: '#fff',
  },

  /* Empty */
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },

  /* Button */
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
