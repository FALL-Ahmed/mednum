import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import { Spacing, Radius, Typography } from '../theme';
import { useTheme, Text, TextInput } from '../components';
import { useT } from '../i18n';
import { computeNiveau } from '../utils/rag';
import { getAccountInfo, linkGoogleAccount, signInGoogleAccount, type AccountInfo, type AuthResult } from '../utils/account';
import type { NiveauType } from '../utils/rag';

const NAVY    = '#0B1E34';
const TEAL    = '#07A997';
const TEAL_BG = '#EAF7F6';
const SERIF   = Platform.OS === 'ios' ? 'Georgia' : 'serif';

// Score à appliquer quand l'élève choisit manuellement un niveau
const NIVEAU_SCORE: Record<NiveauType, number> = { facile: 1, moyen: 5, avance: 8 };

function Avatar({ name, size = 80 }: { name: string; size?: number }) {
  const initials = name.trim().split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38, fontFamily: SERIF }]}>{initials || '?'}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const tr = useT();
  const { top, bottom } = useSafeAreaInsets();
  const {
    studentName, studentClassName, studentSchoolName,
    uiLanguage, setUiLanguage,
    difficultyScore, setDifficultyScore,
    xpTotal, streakCurrent,
    dailyGoal, setDailyGoal,
    setStudentInfo, studentClassId, userId,
    resetStudent, clearHistory, replayOnboarding,
  } = useAppStore();
  const rtl = uiLanguage === 'ar';

  // ── Compte (lien Google) ───────────────────────────────────────────────
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  useEffect(() => { getAccountInfo().then(setAccount).catch(() => {}); }, []);

  const reportAuth = async (r: AuthResult, okMsg: string) => {
    if (r.ok) {
      setAccount(await getAccountInfo());
      Alert.alert(tr.account.sectionAccount, okMsg);
    } else if (r.reason === 'cancelled') {
      Alert.alert(tr.account.sectionAccount, tr.account.cancelled);
    } else if (r.reason === 'already_linked') {
      Alert.alert(tr.account.sectionAccount, tr.account.errorAlreadyLinked);
    } else {
      Alert.alert(tr.account.sectionAccount, tr.account.errorGeneric);
    }
  };
  const doLink = async () => {
    setAccountBusy(true);
    try { await reportAuth(await linkGoogleAccount(), tr.account.linkedOk); }
    finally { setAccountBusy(false); }
  };
  const doSignIn = () => {
    Alert.alert(tr.account.confirmSwitchTitle, tr.account.confirmSwitchMsg, [
      { text: tr.common.cancel, style: 'cancel' },
      {
        text: tr.account.confirmSwitchOk,
        onPress: async () => {
          setAccountBusy(true);
          try { await reportAuth(await signInGoogleAccount(), tr.account.signedInOk); }
          finally { setAccountBusy(false); }
        },
      },
    ]);
  };

  const GOAL_OPTIONS = [25, 50, 100, 200];

  const NIVEAU_OPTIONS: { value: NiveauType; label: string; sub: string }[] = [
    { value: 'facile', label: tr.settings.levelBeginner, sub: tr.settings.levelBeginnerSub },
    { value: 'moyen',   label: tr.settings.levelMedium,   sub: tr.settings.levelMediumSub },
    { value: 'avance',  label: tr.settings.levelAdvanced, sub: tr.settings.levelAdvancedSub },
  ];

  const niveau = computeNiveau(difficultyScore);

  const [editNameModal, setEditNameModal]     = useState(false);
  const [editSchoolModal, setEditSchoolModal] = useState(false);
  const [nameInput, setNameInput]             = useState(studentName);
  const [schoolInput, setSchoolInput]         = useState(studentSchoolName);

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
        tr.settings.clearHistoryTitle,
        tr.settings.clearHistoryMsg,
        [
          { text: tr.common.cancel, style: 'cancel' },
          { text: tr.settings.clear, style: 'destructive', onPress: clearHistory },
        ]
      );
    } else {
      Alert.alert(
        tr.settings.resetProfileTitle,
        tr.settings.resetProfileMsg,
        [
          { text: tr.common.cancel, style: 'cancel' },
          { text: tr.settings.reset, style: 'destructive', onPress: resetStudent },
        ]
      );
    }
  };

  const currentNiveau = NIVEAU_OPTIONS.find(o => o.value === niveau) || NIVEAU_OPTIONS[1];


  return (
    <View style={[styles.root, { backgroundColor: TEAL_BG }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* ── HEADER fixe ────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: top + Spacing.xl }]}>
        <View style={styles.hCircle1} />
        <View style={styles.hCircle2} />
        <View style={styles.hCircle3} />

        <View style={[styles.headerTop, rtl && { flexDirection: 'row-reverse' }]}>
          <Avatar name={studentName} size={56} />
          <View style={styles.headerTopTexts}>
            <Text style={[styles.headerName, { fontFamily: SERIF }, rtl && styles.textRight]} numberOfLines={1}>{studentName || tr.settings.defaultStudentName}</Text>
            <View style={[styles.classBadge, rtl && { flexDirection: 'row-reverse', alignSelf: 'flex-end' }]}>
              <Ionicons name="business-outline" size={12} color={TEAL} />
              <Text style={styles.classBadgeTxt} numberOfLines={1}>{studentSchoolName || '—'}</Text>
              {studentClassName ? (
                <>
                  <Text style={styles.classBadgeDot}>·</Text>
                  <Text style={styles.classBadgeTxt}>{studentClassName}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>

        {/* Stats — une seule rangée compacte */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Text style={styles.statVal}>{xpTotal}</Text>
            <Text style={styles.statLbl}>{tr.settings.statXpTotal}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statChip}>
            <Text style={styles.statVal}>{streakCurrent}</Text>
            <Text style={styles.statLbl}>{tr.settings.statStreak}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statChip}>
            <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{currentNiveau.label}</Text>
            <Text style={styles.statLbl}>{tr.settings.statLevel}</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottom + 100 }}>

        {/* ── SECTION : PROFIL ───────────────────────────────────── */}
        <SectionLabel label={tr.settings.sectionProfile} rtl={rtl} />
        <View style={styles.card}>
          <RowItem
            icon="pencil-outline"
            iconColor={TEAL}
            label={tr.settings.editFirstName}
            onPress={() => { setNameInput(studentName); setEditNameModal(true); }}
            rtl={rtl}
          />
          <View style={styles.sep} />
          <RowItem
            icon="business-outline"
            iconColor={NAVY}
            label={tr.settings.editSchool}
            value={studentSchoolName || tr.settings.schoolNotSet}
            onPress={() => { setSchoolInput(studentSchoolName); setEditSchoolModal(true); }}
            rtl={rtl}
          />
        </View>

        {/* ── SECTION : COMPTE ───────────────────────────────────── */}
        <SectionLabel label={tr.account.sectionAccount} rtl={rtl} />
        <View style={styles.card}>
          {account?.linked ? (
            <RowItem
              icon="checkmark-circle-outline"
              iconColor={TEAL}
              label={tr.account.connectedAs}
              value={account.email ?? 'Google'}
              onPress={() => {}}
              rtl={rtl}
            />
          ) : (
            <>
              <View style={{ padding: Spacing.lg }}>
                <Text style={[styles.accountTitle, rtl && styles.textRight]}>{tr.account.secureTitle}</Text>
                <Text style={[styles.accountSub, rtl && styles.textRight]}>{tr.account.secureSub}</Text>
              </View>
              <View style={styles.sep} />
              <RowItem
                icon="logo-google"
                iconColor={NAVY}
                label={accountBusy ? '…' : tr.account.linkGoogle}
                onPress={accountBusy ? () => {} : doLink}
                rtl={rtl}
              />
              <View style={styles.sep} />
              <RowItem
                icon="log-in-outline"
                iconColor={TEAL}
                label={tr.account.alreadyHave}
                onPress={accountBusy ? () => {} : doSignIn}
                rtl={rtl}
              />
            </>
          )}
        </View>

        {/* ── SECTION : NIVEAU ───────────────────────────────────── */}
        <SectionLabel label={tr.settings.sectionLevel} rtl={rtl} />
        <View style={[styles.card, { padding: Spacing.lg }]}>
          <View style={styles.niveauGrid}>
            {NIVEAU_OPTIONS.map(opt => {
              const active = niveau === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.niveauBtn,
                    {
                      backgroundColor: active ? TEAL : TEAL_BG,
                      borderColor: active ? TEAL : 'transparent',
                    },
                    active && Platform.select({
                      ios: { shadowColor: TEAL, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
                      android: { elevation: 4 },
                    }),
                    rtl && { flexDirection: 'row-reverse' },
                  ]}
                  onPress={() => setDifficultyScore(NIVEAU_SCORE[opt.value])}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.niveauLabel, { color: active ? '#fff' : NAVY }, rtl && styles.textRight]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.niveauSub, { color: active ? 'rgba(255,255,255,0.75)' : '#5B7184' }, rtl && styles.textRight]}>
                    {opt.sub}
                  </Text>
                  {active && <View style={styles.niveauCheck}><Ionicons name="checkmark" size={13} color="#fff" /></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── SECTION : PRÉFÉRENCES ─────────────────────────────── */}
        <SectionLabel label={tr.settings.sectionPrefs} rtl={rtl} />
        <View style={styles.card}>
          <View style={[styles.rowWrap, rtl && { flexDirection: 'row-reverse' }]}>
            <View style={styles.rowIconBox}>
              <Ionicons name="language-outline" size={18} color={NAVY} />
            </View>
            <Text style={[styles.rowLabel, { flex: 1 }, rtl && styles.textRight]}>{tr.settings.language}</Text>
            <View style={[styles.langToggle, rtl && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity
                style={[styles.langBtn, uiLanguage === 'fr' && { backgroundColor: TEAL }]}
                onPress={() => setUiLanguage('fr')}
                activeOpacity={0.75}
              >
                <Text style={[styles.langBtnTxt, { color: uiLanguage === 'fr' ? '#fff' : '#5B7184' }]}>{tr.settings.languageFr}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, uiLanguage === 'ar' && { backgroundColor: TEAL }]}
                onPress={() => setUiLanguage('ar')}
                activeOpacity={0.75}
              >
                <Text style={[styles.langBtnTxt, { color: uiLanguage === 'ar' ? '#fff' : '#5B7184' }]}>{tr.settings.languageAr}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── SECTION : OBJECTIF QUOTIDIEN ─────────────────────── */}
        <SectionLabel label={tr.settings.sectionGoal} rtl={rtl} />
        <View style={[styles.card, { padding: Spacing.lg }]}>
          <Text style={[styles.goalDesc, rtl && styles.textRight]}>{tr.settings.goalDesc}</Text>
          <View style={styles.goalGrid}>
            {GOAL_OPTIONS.map(goal => {
              const active = dailyGoal === goal;
              return (
                <TouchableOpacity
                  key={goal}
                  style={[
                    styles.goalBtn,
                    { borderColor: active ? TEAL : 'transparent', backgroundColor: active ? TEAL : TEAL_BG },
                  ]}
                  onPress={() => setDailyGoal(goal)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.goalXP, { color: active ? '#fff' : NAVY }]}>{goal}</Text>
                  <Text style={[styles.goalLabel, { color: active ? 'rgba(255,255,255,0.75)' : '#5B7184' }]}>XP</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── SECTION : DONNÉES ─────────────────────────────────── */}
        <SectionLabel label={tr.settings.sectionData} rtl={rtl} />
        <View style={styles.card}>
          <RowItem
            icon="trash-outline"
            iconColor="#DC2626"
            label={tr.settings.clearHistory}
            onPress={() => confirmReset('history')}
            danger
            rtl={rtl}
          />
          <View style={styles.sep} />
          <RowItem
            icon="refresh-outline"
            iconColor="#DC2626"
            label={tr.settings.resetProfile}
            onPress={() => confirmReset('profile')}
            danger
            rtl={rtl}
          />
          <View style={styles.sep} />
          <RowItem
            icon="play-circle-outline"
            iconColor={TEAL}
            label={tr.settings.replayOnboarding}
            onPress={replayOnboarding}
            rtl={rtl}
          />
        </View>

        <Text style={styles.version}>Axone v1.0</Text>
      </ScrollView>

      {/* ── MODAL : Modifier prénom ────────────────────────────── */}
      <Modal visible={editNameModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, { fontFamily: SERIF }, rtl && styles.textRight]}>{tr.settings.editFirstNameTitle}</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: nameInput.trim() ? TEAL : '#E2E8F0' }, rtl && styles.textRight]}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              autoCapitalize="words"
              selectionColor={TEAL}
              placeholder={tr.settings.firstNamePlaceholder}
              placeholderTextColor="#94A3B8"
            />
            <View style={[styles.modalBtns, rtl && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setEditNameModal(false)}>
                <Text style={{ color: '#5B7184', fontWeight: '600' }}>{tr.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { opacity: nameInput.trim() ? 1 : 0.4 }]}
                onPress={saveName}
                disabled={!nameInput.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.common.save}</Text>
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
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, { fontFamily: SERIF }, rtl && styles.textRight]}>{tr.settings.editSchoolTitle}</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: schoolInput.trim() ? TEAL : '#E2E8F0' }, rtl && styles.textRight]}
              value={schoolInput}
              onChangeText={setSchoolInput}
              autoFocus
              autoCapitalize="words"
              selectionColor={TEAL}
              placeholder={tr.settings.schoolPlaceholder}
              placeholderTextColor="#94A3B8"
            />
            <View style={[styles.modalBtns, rtl && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setEditSchoolModal(false)}>
                <Text style={{ color: '#5B7184', fontWeight: '600' }}>{tr.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { opacity: schoolInput.trim() ? 1 : 0.4 }]}
                onPress={saveSchool}
                disabled={!schoolInput.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.common.save}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function SectionLabel({ label, rtl }: { label: string; rtl?: boolean }) {
  return (
    <Text style={[styles.sectionLabel, rtl && styles.textRight]}>{label}</Text>
  );
}

function RowItem({
  icon, iconColor, label, value, onPress, danger, rtl,
}: {
  icon: string; iconColor: string; label: string; value?: string;
  onPress: () => void; danger?: boolean; rtl?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.rowWrap, rtl && { flexDirection: 'row-reverse' }]} onPress={onPress} activeOpacity={0.65}>
      <View style={[styles.rowIconBox, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? '#DC2626' : NAVY, flex: 1 }, rtl && styles.textRight]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, rtl && styles.textRight]} numberOfLines={1}>{value}</Text> : null}
      <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color="#94A3B8" />
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  accountTitle: { fontSize: 15, fontWeight: '700', color: NAVY },
  accountSub: { fontSize: 13, lineHeight: 19, color: '#5B7184', marginTop: 4 },
  root: { flex: 1 },
  textRight: { textAlign: 'right', writingDirection: 'rtl' },

  /* ── Header ── */
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: NAVY, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: Spacing.lg,
  },
  headerTopTexts: { flex: 1, gap: 6 },
  hCircle1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(7,169,151,0.10)', top: -60, right: -50,
  },
  hCircle2: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: 0, left: -20,
  },
  hCircle3: {
    position: 'absolute', width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(7,169,151,0.08)', top: 40, left: 30,
  },

  avatar: {
    backgroundColor: 'rgba(7,169,151,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(7,169,151,0.4)',
    flexShrink: 0,
  },
  avatarText: { color: '#fff', fontWeight: '700', letterSpacing: -1 },

  headerName: {
    fontSize: 20, fontWeight: '400', color: '#fff',
    letterSpacing: -0.3,
  },

  classBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(7,169,151,0.16)',
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  classBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },
  classBadgeDot: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginHorizontal: 1 },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
  },
  statChip: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 22, backgroundColor: 'rgba(255,255,255,0.14)' },
  statVal: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  statLbl: { fontSize: 9.5, color: 'rgba(255,255,255,0.55)', fontWeight: '600', letterSpacing: 0.3 },

  /* ── Section label ── */
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: '#5B7184',
    paddingHorizontal: Spacing.xl, marginTop: Spacing.xl, marginBottom: Spacing.sm,
  },

  /* ── Card ── */
  card: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(11,30,52,0.06)',
  },

  /* ── Row ── */
  rowWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 15, gap: Spacing.md,
    backgroundColor: '#fff',
  },
  rowIconBox: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: TEAL_BG,
  },
  rowLabel: { ...Typography.label, color: NAVY },
  rowValue: { ...Typography.bodySmall, maxWidth: 120, color: '#5B7184' },
  sep: { height: 0.5, marginLeft: 64, backgroundColor: 'rgba(11,30,52,0.08)' },

  /* ── Langue ── */
  langToggle: { flexDirection: 'row', backgroundColor: TEAL_BG, borderRadius: Radius.full, padding: 3, gap: 2 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  langBtnTxt: { fontSize: 12, fontWeight: '700' },

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

  /* ── Objectif ── */
  goalDesc: { fontSize: 12, marginBottom: Spacing.md, color: '#5B7184' },
  goalGrid: { flexDirection: 'row', gap: 10 },
  goalBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: Radius.md, borderWidth: 1.5, gap: 2,
  },
  goalXP: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  goalLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  version: { textAlign: 'center', fontSize: 12, marginTop: Spacing.xxxl, letterSpacing: 0.3, color: '#94A3B8' },

  /* ── Modals ── */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(11,30,52,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, gap: Spacing.md,
    backgroundColor: '#fff',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { ...Typography.h3, fontWeight: '400', color: NAVY, fontSize: 22 },
  modalInput: {
    borderWidth: 1.5, borderRadius: Radius.md,
    padding: 14, fontSize: 18, fontWeight: '600',
    color: NAVY, backgroundColor: TEAL_BG,
  },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: 4 },
  modalBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: TEAL_BG },
  modalBtnPrimary: { backgroundColor: TEAL },

});
