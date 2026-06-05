import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Modal,
  KeyboardAvoidingView,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme';
import { useTheme } from '../components';
import { computeNiveau } from '../utils/rag';
import type { NiveauType } from '../utils/rag';

// Score à appliquer quand l'élève choisit manuellement un niveau
const NIVEAU_SCORE: Record<NiveauType, number> = { facile: 1, moyen: 5, avance: 8 };

const NIVEAU_OPTIONS: { value: NiveauType; label: string; sub: string; color: string }[] = [
  { value: 'facile',  label: 'Débutant',      sub: 'Explication simple',   color: '#16A34A' },
  { value: 'moyen',   label: 'Intermédiaire', sub: 'Niveau collège',       color: '#2563EB' },
  { value: 'avance',  label: 'Avancé',        sub: 'Rigueur scientifique', color: '#D97706' },
];

function Avatar({ name, size = 80 }: { name: string; size?: number }) {
  const initials = name.trim().split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials || '?'}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const { top } = useSafeAreaInsets();
  const {
    studentName, studentClassName, studentSchoolName,
    darkMode, toggleDarkMode,
    difficultyScore, setDifficultyScore,
    xpTotal, streakCurrent,
    dailyGoal, setDailyGoal,
    setStudentInfo, studentClassId, userId,
    resetStudent, clearHistory,
  } = useAppStore();

  const GOAL_OPTIONS = [25, 50, 100, 200];

  const niveau = computeNiveau(difficultyScore);

  const [editNameModal, setEditNameModal] = useState(false);
  const [editSchoolModal, setEditSchoolModal] = useState(false);
  const [nameInput, setNameInput] = useState(studentName);
  const [schoolInput, setSchoolInput] = useState(studentSchoolName);

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setStudentInfo(trimmed, studentClassId, studentClassName);
    setEditNameModal(false);
    supabase.from('students').update({ name: trimmed }).eq('user_id', userId).then(() => {});
  };

  const saveSchool = () => {
    const trimmed = schoolInput.trim();
    if (!trimmed) return;
    setStudentInfo(studentName, studentClassId, studentClassName, trimmed);
    setEditSchoolModal(false);
    supabase.from('students').update({ school_name: trimmed }).eq('user_id', userId).then(() => {});
  };

  const confirmReset = (type: 'history' | 'profile') => {
    if (type === 'history') {
      Alert.alert(
        "Effacer l'historique ?",
        'Tous tes échanges avec le prof IA seront supprimés.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Effacer', style: 'destructive', onPress: clearHistory },
        ]
      );
    } else {
      Alert.alert(
        'Réinitialiser le profil ?',
        'Tu devras renseigner ton prénom et ta classe à nouveau.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Réinitialiser', style: 'destructive', onPress: resetStudent },
        ]
      );
    }
  };

  const currentNiveau = NIVEAU_OPTIONS.find(o => o.value === niveau) || NIVEAU_OPTIONS[1];


  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blue} />

      {/* ── HEADER fixe ────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: top + Spacing.xl }]}>
        <View style={styles.hCircle1} />
        <View style={styles.hCircle2} />
        <View style={styles.hCircle3} />

        <Avatar name={studentName} size={84} />

        <Text style={styles.headerName}>{studentName || 'Élève'}</Text>

        <View style={styles.classBadge}>
          <Ionicons name="business-outline" size={13} color="rgba(255,255,255,0.9)" />
          <Text style={styles.classBadgeTxt}>{studentSchoolName || '—'}</Text>
          {studentClassName ? (
            <>
              <Text style={styles.classBadgeDot}>·</Text>
              <Ionicons name="school-outline" size={13} color="rgba(255,255,255,0.9)" />
              <Text style={styles.classBadgeTxt}>{studentClassName}</Text>
            </>
          ) : null}
        </View>

        {/* Stats grid — 3 cartes */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{xpTotal}</Text>
            <Text style={styles.statLbl}>XP total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{streakCurrent}</Text>
            <Text style={styles.statLbl}>Jours streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{currentNiveau.label}</Text>
            <Text style={styles.statLbl}>Niveau</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>

        {/* ── SECTION : PROFIL ───────────────────────────────────── */}
        <SectionLabel label="PROFIL" />
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <RowItem
            icon="pencil-outline"
            iconColor={Colors.blue}
            label="Modifier le prénom"
            onPress={() => { setNameInput(studentName); setEditNameModal(true); }}
            t={t}
          />
          <View style={[styles.sep, { backgroundColor: t.border }]} />
          <RowItem
            icon="business-outline"
            iconColor="#7C3AED"
            label="Modifier l'école"
            value={studentSchoolName || 'Non renseignée'}
            onPress={() => { setSchoolInput(studentSchoolName); setEditSchoolModal(true); }}
            t={t}
          />
        </View>

        {/* ── SECTION : NIVEAU ───────────────────────────────────── */}
        <SectionLabel label="NIVEAU D'APPRENTISSAGE" />
        <View style={[styles.card, { backgroundColor: t.surface, padding: Spacing.lg }]}>
          <View style={styles.niveauGrid}>
            {NIVEAU_OPTIONS.map(opt => {
              const active = niveau === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.niveauBtn,
                    {
                      backgroundColor: active ? opt.color : t.surfaceAlt,
                      borderColor: active ? opt.color : t.border,
                    },
                    active && Platform.select({
                      ios: { shadowColor: opt.color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
                      android: { elevation: 6 },
                    }),
                  ]}
                  onPress={() => setDifficultyScore(NIVEAU_SCORE[opt.value])}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.niveauLabel, { color: active ? '#fff' : t.text }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.niveauSub, { color: active ? 'rgba(255,255,255,0.75)' : t.textMuted }]}>
                    {opt.sub}
                  </Text>
                  {active && <View style={styles.niveauCheck}><Ionicons name="checkmark" size={13} color="#fff" /></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── SECTION : PRÉFÉRENCES ─────────────────────────────── */}
        <SectionLabel label="PRÉFÉRENCES" />
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <View style={[styles.rowWrap, { backgroundColor: t.surface }]}>
            <View style={[styles.rowIconBox, { backgroundColor: darkMode ? '#818CF818' : '#D9740618' }]}>
              <Ionicons name={darkMode ? 'moon' : 'sunny-outline'} size={18} color={darkMode ? '#818CF8' : '#D97706'} />
            </View>
            <Text style={[styles.rowLabel, { color: t.text, flex: 1 }]}>Mode sombre</Text>
            <Switch
              value={darkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: Colors.border, true: Colors.blue + '90' }}
              thumbColor={darkMode ? Colors.blue : '#fff'}
            />
          </View>
        </View>

        {/* ── SECTION : OBJECTIF QUOTIDIEN ─────────────────────── */}
        <SectionLabel label="OBJECTIF QUOTIDIEN" />
        <View style={[styles.card, { backgroundColor: t.surface, padding: Spacing.lg }]}>
          <Text style={[styles.goalDesc, { color: t.textMuted }]}>XP à gagner chaque jour pour maintenir ton streak</Text>
          <View style={styles.goalGrid}>
            {GOAL_OPTIONS.map(goal => {
              const active = dailyGoal === goal;
              return (
                <TouchableOpacity
                  key={goal}
                  style={[
                    styles.goalBtn,
                    { borderColor: active ? Colors.blue : t.border, backgroundColor: active ? Colors.blue : t.surfaceAlt },
                  ]}
                  onPress={() => setDailyGoal(goal)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.goalXP, { color: active ? '#fff' : t.text }]}>{goal}</Text>
                  <Text style={[styles.goalLabel, { color: active ? 'rgba(255,255,255,0.75)' : t.textMuted }]}>XP</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── SECTION : DONNÉES ─────────────────────────────────── */}
        <SectionLabel label="DONNÉES" />
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <RowItem
            icon="trash-outline"
            iconColor={Colors.error}
            label="Effacer l'historique des chats"
            onPress={() => confirmReset('history')}
            danger
            t={t}
          />
          <View style={[styles.sep, { backgroundColor: t.border }]} />
          <RowItem
            icon="refresh-outline"
            iconColor={Colors.error}
            label="Réinitialiser le profil"
            onPress={() => confirmReset('profile')}
            danger
            t={t}
          />
        </View>

        <Text style={[styles.version, { color: t.textMuted }]}>ProfNum v1.0</Text>
      </ScrollView>

      {/* ── MODAL : Modifier prénom ────────────────────────────── */}
      <Modal visible={editNameModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Modifier le prénom</Text>
            <TextInput
              style={[styles.modalInput, { color: t.text, borderColor: nameInput.trim() ? Colors.blue : t.border, backgroundColor: t.surfaceAlt }]}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              autoCapitalize="words"
              selectionColor={Colors.blue}
              placeholder="Ton prénom"
              placeholderTextColor={t.textMuted}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: t.surfaceAlt }]} onPress={() => setEditNameModal(false)}>
                <Text style={{ color: t.textMuted, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { opacity: nameInput.trim() ? 1 : 0.4 }]}
                onPress={saveName}
                disabled={!nameInput.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL : Modifier l'école ───────────────────────────── */}
      <Modal visible={editSchoolModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Modifier l'école</Text>
            <TextInput
              style={[styles.modalInput, { color: t.text, borderColor: schoolInput.trim() ? Colors.blue : t.border, backgroundColor: t.surfaceAlt }]}
              value={schoolInput}
              onChangeText={setSchoolInput}
              autoFocus
              autoCapitalize="words"
              selectionColor={Colors.blue}
              placeholder="ex : École Privée Main Al Ouloum…"
              placeholderTextColor={t.textMuted}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: t.surfaceAlt }]} onPress={() => setEditSchoolModal(false)}>
                <Text style={{ color: t.textMuted, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { opacity: schoolInput.trim() ? 1 : 0.4 }]}
                onPress={saveSchool}
                disabled={!schoolInput.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function SectionLabel({ label }: { label: string }) {
  const t = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: t.textMuted }]}>{label}</Text>
  );
}

function RowItem({
  icon, iconColor, label, value, onPress, danger, t,
}: {
  icon: string; iconColor: string; label: string; value?: string;
  onPress: () => void; danger?: boolean; t: ReturnType<typeof useTheme>;
}) {
  return (
    <TouchableOpacity style={[styles.rowWrap, { backgroundColor: t.surface }]} onPress={onPress} activeOpacity={0.65}>
      <View style={[styles.rowIconBox, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? Colors.error : t.text, flex: 1 }]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, { color: t.textMuted }]} numberOfLines={1}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1 },

  /* ── Header ── */
  header: {
    backgroundColor: Colors.blue,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl + 8,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: Colors.blue, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  hCircle1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -50,
  },
  hCircle2: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: 0, left: -20,
  },
  hCircle3: {
    position: 'absolute', width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.06)', top: 40, left: 30,
  },

  avatar: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarText: { color: '#fff', fontWeight: '900', letterSpacing: -1 },

  headerName: {
    fontSize: 26, fontWeight: '800', color: '#fff',
    letterSpacing: -0.5, marginBottom: 10,
  },

  classBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    marginBottom: Spacing.xl,
  },
  classBadgeTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  classBadgeDot: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginHorizontal: 2 },

  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    gap: 4,
  },
  statVal: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.62)', fontWeight: '600', letterSpacing: 0.3 },

  /* ── Section label ── */
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    paddingHorizontal: Spacing.xl, marginTop: Spacing.xl, marginBottom: Spacing.sm,
  },

  /* ── Card ── */
  card: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadows.md,
  },

  /* ── Row ── */
  rowWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 15, gap: Spacing.md,
  },
  rowIconBox: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { ...Typography.label },
  rowValue: { ...Typography.bodySmall, maxWidth: 120 },
  sep: { height: 0.5, marginLeft: 64 },

  /* ── Niveau ── */
  niveauGrid: { gap: 10 },
  niveauBtn: {
    borderRadius: Radius.md, borderWidth: 1.5,
    paddingVertical: 14, paddingHorizontal: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  niveauLabel: { fontSize: 15, fontWeight: '700', flex: 1 },
  niveauSub: { fontSize: 12, fontWeight: '500' },
  niveauCheck: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },

  /* ── Version ── */
  goalDesc: { fontSize: 12, marginBottom: Spacing.md },
  goalGrid: { flexDirection: 'row', gap: 10 },
  goalBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: Radius.md, borderWidth: 1.5, gap: 2,
  },
  goalXP: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  goalLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  version: { textAlign: 'center', fontSize: 12, marginTop: Spacing.xxxl, letterSpacing: 0.3 },

  /* ── Modals ── */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, gap: Spacing.md,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { ...Typography.h3, fontWeight: '700' },
  modalInput: {
    borderWidth: 1.5, borderRadius: Radius.md,
    padding: 14, fontSize: 18, fontWeight: '600',
  },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: 4 },
  modalBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: Radius.md },
  modalBtnPrimary: { backgroundColor: Colors.blue },

});
