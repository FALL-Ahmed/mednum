import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, StatusBar, Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { useTheme, Text } from '../components';
import { useT } from '../i18n';
import { Colors, Spacing, Radius, Shadows } from '../theme';

// ─── Types ───────────────────────────────────────────────────────────────────

type PlanRow = {
  plan: string;
  label: string;
  price_monthly: number;
  price_yearly: number | null;
  sort_order: number;
};

type Method = 'bankily' | 'masrivi' | 'sedad' | 'click';
type Duration = 'monthly' | 'yearly';
type Step = 'plan' | 'payment' | 'success';

const METHOD_LOGOS: Partial<Record<Method, any>> = {
  bankily: require('../../assets/images/payment/Bankily.png'),
  masrivi: require('../../assets/images/payment/Masrivi.png'),
  sedad:   require('../../assets/images/payment/Sedad.png'),
  click:   require('../../assets/images/payment/Click.png'),
};

const METHODS: { id: Method; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { id: 'bankily', icon: 'phone-portrait-outline', label: 'Bankily' },
  { id: 'masrivi', icon: 'phone-portrait-outline', label: 'Masrivi' },
  { id: 'sedad',   icon: 'globe-outline',          label: 'Sedad'   },
  { id: 'click',   icon: 'card-outline',           label: 'Click'   },
];


function genRefCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'MN-' + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function SubscriptionScreen() {
  const t = useTheme();
  const tr = useT();
  const PLAN_FEATURES: Record<string, string[]> = {
    one_subject:    [tr.subscription.featOneSubject, tr.subscription.featProgress, tr.subscription.featFiches, tr.subscription.featQuiz, tr.subscription.featHistory],
    three_subjects: [tr.subscription.featThreeSubjects, tr.subscription.featProgress, tr.subscription.featFiches, tr.subscription.featQuiz, tr.subscription.featHistory],
    full:           [tr.subscription.featAllSubjects, tr.subscription.featProgress, tr.subscription.featFiches, tr.subscription.featQuiz, tr.subscription.featHistory],
    standard:       tr.subscription.planStandardFeatures,
    premium:        tr.subscription.planPremiumFeatures,
  };
  const { top } = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { deviceId, studentName, syncQuota } = useAppStore();

  const [step, setStep]                           = useState<Step>('plan');
  const [plans, setPlans]                         = useState<PlanRow[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [selectedPlan, setSelectedPlan]           = useState<PlanRow | null>(null);
  const [duration, setDuration]                   = useState<Duration>('monthly');
  const [method, setMethod]                       = useState<Method | null>(null);
  const [screenshot, setScreenshot]               = useState<string | null>(null);
  const [submitting, setSubmitting]               = useState(false);
  const [refCode]                                 = useState(genRefCode);
  const [payAccounts, setPayAccounts]             = useState<Record<string, string>>({});
  const [copiedMethod, setCopiedMethod]           = useState<string | null>(null);
  const [supportPhone, setSupportPhone]           = useState('22241513211');
  const [availableSubjects, setAvailableSubjects]   = useState<string[]>([]);
  const [loadingSubjects, setLoadingSubjects]       = useState(false);
  const [selectedSubjects, setSelectedSubjects]     = useState<string[]>([]);
  const copyTimer                                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Offres à la vente : Standard et Premium (les anciens plans restent en base pour l'historique).
    supabase.from('plans').select('*').in('plan', ['standard', 'premium']).order('sort_order')
      .then(({ data }) => {
        setPlans((data || []) as PlanRow[]);
        setLoading(false);
      });
    supabase.from('payment_accounts').select('method,account_number')
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data || []).forEach((r: any) => { map[r.method] = r.account_number; });
        setPayAccounts(map);
      });
    supabase.from('app_config').select('value').eq('key', 'support_whatsapp').single()
      .then(({ data }) => { if (data?.value) setSupportPhone(data.value); });
    setLoadingSubjects(true);
    supabase.from('subjects').select('name').order('name')
      .then(({ data }) => {
        setAvailableSubjects((data || []).map((s: any) => s.name).filter(Boolean));
        setLoadingSubjects(false);
      });
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const amount = selectedPlan
    ? duration === 'yearly'
      ? (selectedPlan.price_yearly ?? Math.round(selectedPlan.price_monthly * 10))
      : selectedPlan.price_monthly
    : 0;

  const maxSubjects    = selectedPlan?.plan === 'one_subject' ? 1 : 3;
  const needsSubjects  = selectedPlan?.plan === 'one_subject' || selectedPlan?.plan === 'three_subjects';
  const subjectsDone   = !needsSubjects || selectedSubjects.length === maxSubjects;
  const canContinue    = !!selectedPlan && subjectsDone;
  const canSubmit      = !!method && !!screenshot && !submitting;

  const copyNumber = async (num: string, id: string) => {
    await Clipboard.setStringAsync(num);
    setCopiedMethod(id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedMethod(null), 2000);
  };

  const toggleSubject = (subject: string) => {
    if (selectedSubjects.includes(subject)) {
      setSelectedSubjects(prev => prev.filter(x => x !== subject));
    } else if (maxSubjects === 1) {
      setSelectedSubjects([subject]);
    } else if (selectedSubjects.length < maxSubjects) {
      setSelectedSubjects(prev => [...prev, subject]);
    }
  };

  const pickScreenshot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) setScreenshot(result.assets[0].uri);
  };

  const submit = async () => {
    if (!selectedPlan || !method) return;
    setSubmitting(true);
    try {
      let screenshotUrl: string | null = null;
      if (screenshot) {
        const ext = screenshot.split('.').pop() || 'jpg';
        const filename = `receipts/${refCode}.${ext}`;
        const response = await fetch(screenshot);
        const blob = await response.blob();
        const { error: upErr } = await supabase.storage
          .from('payment-screenshots')
          .upload(filename, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        screenshotUrl = supabase.storage.from('payment-screenshots').getPublicUrl(filename).data.publicUrl;
      }
      const { error } = await supabase.rpc('submit_payment_request', {
        p_user_id: deviceId, p_student_name: studentName,
        p_plan: selectedPlan.plan, p_duration: duration,
        p_amount: amount, p_payment_method: method,
        p_reference_code: refCode, p_screenshot_url: screenshotUrl,
        p_subjects: selectedSubjects.length > 0 ? selectedSubjects : null,
      });
      if (error) throw error;
      setStep('success');
    } catch (e: any) {
      alert(e?.message || tr.subscription.genericError);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Header ──────────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View style={[s.header, { paddingTop: top + 12 }]}>
      <View style={s.hBubble1} />
      <View style={s.hBubble2} />
      <View style={s.headerRow}>
        <TouchableOpacity
          onPress={() => {
            if (step === 'payment') setStep('plan');
            else navigation.goBack();
          }}
          style={s.backBtn}
        >
          <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={s.headerChip}>{tr.subscription.headerChip}</Text>
          <Text style={s.headerTitle}>
            {step === 'plan'    ? tr.subscription.stepPlan    :
             step === 'payment' ? tr.subscription.stepPayment : tr.subscription.stepSuccess}
          </Text>
        </View>
        {step !== 'success' && (
          <View style={s.stepperRow}>
            {(['plan', 'payment'] as Step[]).map((id, i) => {
              const cur = ['plan', 'payment'].indexOf(step);
              return (
                <View key={id} style={[
                  s.stepDot,
                  i < cur   && { backgroundColor: 'rgba(255,255,255,0.9)' },
                  i === cur && { backgroundColor: '#fff', width: 18 },
                  i > cur   && { backgroundColor: 'rgba(255,255,255,0.3)' },
                ]} />
              );
            })}
          </View>
        )}
      </View>
    </View>
  );

  // ── Step 1 : Plan + Matières ────────────────────────────────────────────────

  const renderPlan = () => (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

      {/* Toggle durée */}
      <View style={[s.durationRow, { backgroundColor: t.surfaceAlt }]}>
        {(['monthly', 'yearly'] as Duration[]).map(d => (
          <TouchableOpacity
            key={d}
            style={[s.durationBtn, duration === d && { backgroundColor: t.surface, ...Shadows.sm }]}
            onPress={() => setDuration(d)}
          >
            <Text style={[s.durationBtnText, { color: duration === d ? t.text : t.textMuted },
              duration === d && { fontWeight: '700' as any }]}>
              {d === 'monthly' ? tr.subscription.monthly : tr.subscription.yearly}
            </Text>
            {d === 'yearly' && (
              <View style={s.saveBadge}><Text style={s.saveBadgeText}>−25%</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Comparaison cours particuliers */}
      <View style={[s.compareCard, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={s.compareRow}>
          <View style={[s.compareCol, { borderRightWidth: 1, borderRightColor: t.border }]}>
            <Text style={[s.compareTopLabel, { color: t.textMuted }]}>{tr.subscription.privateLessons}</Text>
            <Text style={[s.comparePrice, { color: '#DC2626' }]}>1 000 MRU</Text>
            <Text style={[s.compareSubLabel, { color: t.textMuted }]}>{tr.subscription.privateLessonsSub}</Text>
          </View>
          <View style={s.compareCol}>
            <Text style={[s.compareTopLabel, { color: Colors.blue }]}>Axone</Text>
            <Text style={[s.comparePrice, { color: Colors.blue }]}>{`${(plans.find(p => p.plan === 'standard')?.price_monthly ?? 800).toLocaleString()} MRU`}</Text>
            <Text style={[s.compareSubLabel, { color: t.textMuted }]}>{tr.subscription.unlimited247}</Text>
          </View>
        </View>
      </View>

      {/* Plans */}
      {loading ? (
        <ActivityIndicator color={Colors.blue} style={{ marginTop: 40 }} />
      ) : plans.map(plan => {
        const price    = duration === 'yearly'
          ? (plan.price_yearly ?? Math.round(plan.price_monthly * 10))
          : plan.price_monthly;
        const selected  = selectedPlan?.plan === plan.plan;
        const isPopular = plan.plan === 'standard';
        return (
          <TouchableOpacity
            key={plan.plan}
            style={[s.planCard, { backgroundColor: t.surface, borderColor: selected ? Colors.blue : t.border },
              selected && { borderWidth: 2 },
            ]}
            onPress={() => { setSelectedPlan(plan); setSelectedSubjects([]); }}
            activeOpacity={0.85}
          >
            {isPopular && (
              <View style={s.popularBadge}><Text style={s.popularText}>{tr.subscription.popular}</Text></View>
            )}
            <View style={s.planCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={[s.planLabel, { color: t.text }]}>{plan.label}</Text>
                <Text style={[s.planPrice, { color: selected ? Colors.blue : t.text }]}>
                  {price.toLocaleString()} <Text style={s.planPriceSub}>MRU/{duration === 'yearly' ? tr.subscription.yearShort : tr.subscription.monthShort}</Text>
                </Text>
              </View>
              <View style={[s.planRadio, selected && { borderColor: Colors.blue, backgroundColor: Colors.blue }]}>
                {selected && <View style={s.planRadioInner} />}
              </View>
            </View>
            <View style={[s.planDivider, { backgroundColor: t.border }]} />
            {(PLAN_FEATURES[plan.plan] || []).map((f, i) => (
              <View key={i} style={s.featureRow}>
                <Ionicons name="checkmark" size={14} color={selected ? Colors.blue : Colors.green} />
                <Text style={[s.featureText, { color: t.textMuted }]}>{f}</Text>
              </View>
            ))}
          </TouchableOpacity>
        );
      })}

      {/* Sélection matières — apparaît si plan nécessite un choix */}
      {needsSubjects && (
        <View style={[s.subjectSection, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={s.subjectSectionHeader}>
            <Text style={[s.subjectSectionTitle, { color: t.text }]}>
              {maxSubjects === 1 ? tr.subscription.pickOneSubject : `${tr.subscription.pickNSubjects} ${maxSubjects} ${tr.subscription.subjectsWord}`}
            </Text>
            <View style={[s.subjectCountBadge,
              { backgroundColor: subjectsDone ? Colors.greenLight : t.surfaceAlt }
            ]}>
              <Text style={[s.subjectCountText,
                { color: subjectsDone ? Colors.green : t.textMuted }
              ]}>
                {selectedSubjects.length}/{maxSubjects}
              </Text>
            </View>
          </View>
          {loadingSubjects ? (
            <ActivityIndicator color={Colors.blue} />
          ) : availableSubjects.length === 0 ? (
            <Text style={[s.noSubjectsText, { color: t.textMuted }]}>
              {tr.subscription.noSubjectsAvailable}
            </Text>
          ) : (
            <View style={s.subjectGrid}>
              {availableSubjects.map(subject => {
                const isSelected = selectedSubjects.includes(subject);
                const isDisabled = maxSubjects > 1 && !isSelected && selectedSubjects.length >= maxSubjects;
                return (
                  <TouchableOpacity
                    key={subject}
                    style={[
                      s.subjectChip,
                      { backgroundColor: t.surfaceAlt, borderColor: t.border },
                      isSelected && { backgroundColor: Colors.blue + '15', borderColor: Colors.blue, borderWidth: 2 },
                      isDisabled && { opacity: 0.35 },
                    ]}
                    onPress={() => toggleSubject(subject)}
                    disabled={isDisabled}
                    activeOpacity={0.8}
                  >
                    {isSelected && (
                      <View style={s.chipCheck}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                    <Text style={[s.subjectChipText, { color: isSelected ? Colors.blue : t.text }]}>
                      {subject}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[s.primaryBtn, !canContinue && { opacity: 0.4 }]}
        onPress={() => canContinue && setStep('payment')}
        disabled={!canContinue}
      >
        <Text style={s.primaryBtnText}>{tr.subscription.continueBtn}</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Step 2 : Paiement (méthode + upload) ────────────────────────────────────

  const renderPayment = () => (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

      {/* Récap plan */}
      <View style={[s.summaryCard, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
        <View style={s.summaryRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryPlan, { color: t.text }]}>
              {selectedPlan?.label} · {duration === 'yearly' ? tr.subscription.yearly : tr.subscription.monthly}
            </Text>
            {selectedSubjects.length > 0 && (
              <View style={s.subjectTagsRow}>
                {selectedSubjects.map(sub => (
                  <View key={sub} style={[s.subjectTag, { backgroundColor: Colors.blue + '15', borderColor: Colors.blue + '44' }]}>
                    <Text style={[s.subjectTagText, { color: Colors.blue }]}>{sub}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <Text style={[s.summaryAmount, { color: Colors.blue }]}>{amount.toLocaleString()} MRU</Text>
        </View>
      </View>

      {/* Méthodes */}
      <Text style={[s.sectionChip, { color: t.textMuted }]}>{tr.subscription.paymentMethod}</Text>

      {METHODS.map(m => {
        const isSelected = method === m.id;
        const accountNum = payAccounts[m.id] || '41513211';
        const isCopied   = copiedMethod === m.id;
        return (
          <TouchableOpacity
            key={m.id}
            style={[
              s.methodCard,
              { backgroundColor: t.surface, borderColor: isSelected ? Colors.blue : t.border },
              isSelected && { borderWidth: 2, backgroundColor: Colors.blue + '08' },
            ]}
            onPress={() => setMethod(m.id)}
            activeOpacity={0.88}
          >
            <View style={s.methodCardTop}>
              <View style={[s.methodLogoWrap, { backgroundColor: isSelected ? '#fff' : t.surfaceAlt }]}>
                {METHOD_LOGOS[m.id]
                  ? <Image source={METHOD_LOGOS[m.id]} style={s.methodLogo} resizeMode="contain" />
                  : <Ionicons name={m.icon} size={24} color={isSelected ? Colors.blue : t.textMuted} />
                }
              </View>
              <Text style={[s.methodLabel, { color: t.text, flex: 1 }]}>{m.label}</Text>
              {isSelected
                ? <View style={s.checkCircle}><Ionicons name="checkmark" size={14} color="#fff" /></View>
                : <View style={[s.radioEmpty, { borderColor: t.border }]} />
              }
            </View>
            {isSelected && (
              <View style={[s.accountSection, { borderTopColor: Colors.blue + '33' }]}>
                <Text style={[s.accountLabel, { color: Colors.blue }]}>{tr.subscription.paymentNumber}</Text>
                <View style={[s.accountRow, { backgroundColor: t.surface, borderColor: Colors.blue + '55' }]}>
                  <Text style={[s.accountNumber, { color: t.text }]}>{accountNum}</Text>
                  <TouchableOpacity
                    style={[s.copyBtn, { backgroundColor: isCopied ? Colors.green : Colors.blue }]}
                    onPress={() => copyNumber(accountNum, m.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={isCopied ? 'checkmark' : 'copy-outline'} size={14} color="#fff" />
                    <Text style={s.copyBtnText}>{isCopied ? tr.subscription.copied : tr.subscription.copy}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[s.accountHint, { color: t.textMuted }]}>
                  {tr.subscription.sendExactly}{' '}
                  <Text style={{ fontWeight: '700' as any, color: t.text }}>{amount.toLocaleString()} MRU</Text>
                  {' '}{tr.subscription.toThisNumber}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {/* Upload reçu */}
      <Text style={[s.sectionChip, { color: t.textMuted, marginTop: 4 }]}>{tr.subscription.receiptSection}</Text>

      <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={s.cardTitleRow}>
          <Text style={[s.cardTitle, { color: t.text }]}>{tr.subscription.receiptScreenshot}</Text>
          <View style={s.requiredBadge}>
            <Text style={s.requiredText}>{tr.subscription.required}</Text>
          </View>
        </View>
        <Text style={[s.cardSub, { color: t.textMuted }]}>
          {tr.subscription.receiptHint}
        </Text>
        {screenshot ? (
          <View style={[s.previewContainer, { borderColor: Colors.green }]}>
            <Image source={{ uri: screenshot }} style={s.previewImg} resizeMode="cover" />
            <TouchableOpacity style={s.changePhotoBtn} onPress={pickScreenshot} activeOpacity={0.85}>
              <Ionicons name="camera-outline" size={13} color="#fff" />
              <Text style={s.changePhotoBtnText}>{tr.common.change}</Text>
            </TouchableOpacity>
            <View style={s.previewCheckBadge}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.green} />
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.uploadZone, { borderColor: t.border, backgroundColor: t.surfaceAlt }]}
            onPress={pickScreenshot}
            activeOpacity={0.85}
          >
            <View style={[s.uploadIconWrap, { backgroundColor: t.surface }]}>
              <Ionicons name="camera-outline" size={28} color={t.textMuted} />
            </View>
            <Text style={[s.uploadZoneText, { color: t.textMuted }]}>{tr.subscription.tapToChoosePhoto}</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[s.primaryBtn, { backgroundColor: Colors.green }, !canSubmit && { opacity: 0.4 }]}
        onPress={submit}
        disabled={!canSubmit}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : (
            <>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>{tr.subscription.activateSubscription}</Text>
            </>
          )
        }
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Success ─────────────────────────────────────────────────────────────────

  const renderSuccess = () => (
    <ScrollView contentContainerStyle={[s.scroll, { alignItems: 'center' }]} showsVerticalScrollIndicator={false}>

      <View style={[s.successIconWrap, { backgroundColor: Colors.greenLight }]}>
        <Ionicons name="checkmark-circle" size={64} color={Colors.green} />
      </View>

      <Text style={[s.successTitle, { color: t.text }]}>{tr.subscription.stepSuccess} !</Text>
      <Text style={[s.successSub, { color: t.textMuted }]}>
        {tr.subscription.paymentVerifying}{'\n'}
        {tr.subscription.activationWithin} <Text style={{ fontWeight: '700' as any, color: t.text }}>24h</Text>.
      </Text>

      <View style={[s.successPlanCard, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[s.successPlanChip, { color: t.textMuted }]}>{tr.subscription.planChosen}</Text>
        <Text style={[s.successPlanName, { color: t.text }]}>{selectedPlan?.label}</Text>
        {selectedSubjects.length > 0 && (
          <View style={s.subjectTagsRow}>
            {selectedSubjects.map(sub => (
              <View key={sub} style={[s.subjectTag, { backgroundColor: Colors.blue + '15', borderColor: Colors.blue + '44' }]}>
                <Text style={[s.subjectTagText, { color: Colors.blue }]}>{sub}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={[s.successDivider, { backgroundColor: t.border }]} />
        <View style={s.successPlanRow}>
          <Text style={[s.successPlanDetail, { color: t.textMuted }]}>
            {duration === 'yearly' ? tr.subscription.yearly : tr.subscription.monthly} · {METHODS.find(m => m.id === method)?.label}
          </Text>
          <Text style={[s.successPlanPrice, { color: Colors.blue }]}>{amount.toLocaleString()} MRU</Text>
        </View>
      </View>

      <View style={[s.supportCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
        <Ionicons name="time-outline" size={18} color={Colors.green} />
        <View style={{ flex: 1 }}>
          <Text style={[s.supportTitle, { color: '#15803D' }]}>{tr.subscription.instantActivation}</Text>
          <Text style={[s.supportSub, { color: '#166534' }]}>{tr.subscription.contactSupport}</Text>
        </View>
        <TouchableOpacity
          style={s.whatsappBtn}
          onPress={() => Linking.openURL(`https://wa.me/${supportPhone}`)}
          activeOpacity={0.85}
        >
          <Ionicons name="logo-whatsapp" size={16} color="#fff" />
          <Text style={s.whatsappBtnText}>{tr.subscription.write}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.primaryBtn, { alignSelf: 'stretch' }]}
        onPress={() => { syncQuota(); navigation.goBack(); }}
      >
        <Text style={s.primaryBtnText}>{tr.subscription.backToApp}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={[s.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" />
      {renderHeader()}
      {step === 'plan'    && renderPlan()}
      {step === 'payment' && renderPayment()}
      {step === 'success' && renderSuccess()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
  header: {
    backgroundColor: Colors.blue,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  hBubble1:    { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40 },
  hBubble2:    { position: 'absolute', width: 110, height: 110, borderRadius: 55,  backgroundColor: 'rgba(255,255,255,0.05)', bottom: 10, left: 20 },
  headerRow:   { flexDirection: 'row', alignItems: 'center' },
  backBtn:     { padding: 6, marginRight: 4 },
  headerChip:  { fontSize: 10, fontWeight: '800' as any, color: 'rgba(255,255,255,0.55)', letterSpacing: 1.4, marginBottom: 3 },
  headerTitle: { fontSize: 22, fontWeight: '800' as any, color: '#fff', letterSpacing: -0.3 },
  stepperRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stepDot:     { height: 6, width: 6, borderRadius: 3 },

  /* Scroll */
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: 40, gap: 12 },

  /* Toggle durée */
  durationRow:     { flexDirection: 'row', borderRadius: Radius.md, padding: 4 },
  durationBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: Radius.sm },
  durationBtnText: { fontSize: 14 },
  saveBadge:       { backgroundColor: Colors.greenLight, borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 },
  saveBadgeText:   { color: Colors.green, fontSize: 10, fontWeight: '700' as any },

  /* Comparaison */
  compareCard:     { borderWidth: 1, borderRadius: 20, overflow: 'hidden', ...Shadows.sm },
  compareRow:      { flexDirection: 'row' },
  compareCol:      { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm },
  compareTopLabel: { fontSize: 10, fontWeight: '700' as any, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' as any },
  comparePrice:    { fontSize: 22, fontWeight: '900' as any, letterSpacing: -0.5, marginBottom: 2 },
  compareSubLabel: { fontSize: 11, textAlign: 'center' as any },

  /* Plan card */
  planCard:       { borderWidth: 1, borderRadius: 20, padding: Spacing.lg, ...Shadows.sm },
  planCardTop:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  planLabel:      { fontSize: 16, fontWeight: '700' as any, marginBottom: 4 },
  planPrice:      { fontSize: 22, fontWeight: '800' as any, letterSpacing: -0.5 },
  planPriceSub:   { fontSize: 13, fontWeight: '400' as any },
  planRadio:      { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#E0E4EA', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  planRadioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  planDivider:    { height: 1, marginBottom: 10 },
  featureRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  featureText:    { fontSize: 13 },
  popularBadge:   { position: 'absolute', top: 0, right: 0, backgroundColor: Colors.blue, paddingHorizontal: 10, paddingVertical: 4, borderTopRightRadius: 19, borderBottomLeftRadius: 12 },
  popularText:    { color: '#fff', fontSize: 9, fontWeight: '800' as any, letterSpacing: 1 },

  /* Section matières intégrée */
  subjectSection:       { borderWidth: 1, borderRadius: 20, padding: Spacing.lg, gap: 12, ...Shadows.sm },
  subjectSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subjectSectionTitle:  { fontSize: 15, fontWeight: '700' as any },
  subjectCountBadge:    { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  subjectCountText:     { fontSize: 13, fontWeight: '700' as any },
  subjectGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  noSubjectsText:       { fontSize: 13, fontStyle: 'italic' as any, textAlign: 'center' as any, paddingVertical: 8 },
  subjectChip:          { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, ...Shadows.sm },
  subjectChipText:      { fontSize: 13, fontWeight: '600' as any },
  chipCheck:            { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.blue, alignItems: 'center', justifyContent: 'center' },

  /* Summary */
  summaryCard:    { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  summaryRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  summaryPlan:    { fontSize: 14, fontWeight: '700' as any, marginBottom: 4 },
  summaryAmount:  { fontSize: 18, fontWeight: '800' as any, flexShrink: 0 },

  /* Subject tags */
  subjectTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  subjectTag:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  subjectTagText: { fontSize: 11, fontWeight: '600' as any },

  /* Section chip */
  sectionChip: { fontSize: 10, fontWeight: '800' as any, letterSpacing: 1.4 },

  /* Method card */
  methodCard:     { borderWidth: 1, borderRadius: 20, overflow: 'hidden', ...Shadows.sm },
  methodCardTop:  { flexDirection: 'row', alignItems: 'center', gap: 14, padding: Spacing.lg },
  methodLogoWrap: { width: 52, height: 52, borderRadius: 13, alignItems: 'center', justifyContent: 'center', ...Shadows.sm },
  methodLogo:     { width: 44, height: 30 },
  methodLabel:    { fontSize: 16, fontWeight: '700' as any },
  checkCircle:    { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.blue, alignItems: 'center', justifyContent: 'center' },
  radioEmpty:     { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },

  /* Numéro de paiement */
  accountSection: { borderTopWidth: 1, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: 10 },
  accountLabel:   { fontSize: 9, fontWeight: '800' as any, letterSpacing: 1.5 },
  accountRow:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.md, paddingLeft: Spacing.md, paddingRight: 6, paddingVertical: 6, gap: 8 },
  accountNumber:  { flex: 1, fontSize: 18, fontWeight: '700' as any, letterSpacing: 1 },
  copyBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm },
  copyBtnText:    { color: '#fff', fontSize: 12, fontWeight: '700' as any },
  accountHint:    { fontSize: 12, lineHeight: 18 },

  /* Card générique */
  card:           { borderWidth: 1, borderRadius: 20, padding: Spacing.lg, ...Shadows.sm },
  cardTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle:      { fontSize: 15, fontWeight: '700' as any },
  requiredBadge:  { backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  requiredText:   { fontSize: 9, fontWeight: '800' as any, color: '#DC2626', letterSpacing: 1 },
  cardSub:        { fontSize: 12, lineHeight: 18, marginBottom: 14 },

  /* Upload */
  uploadZone:        { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.md, padding: Spacing.xxl, alignItems: 'center', marginTop: 4 },
  uploadIconWrap:    { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  uploadZoneText:    { fontSize: 13 },
  previewContainer:  { borderWidth: 2, borderRadius: Radius.md, overflow: 'hidden', marginTop: 4, position: 'relative' },
  previewImg:        { width: '100%', height: 220 },
  changePhotoBtn:    { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  changePhotoBtnText:{ color: '#fff', fontSize: 12, fontWeight: '600' as any },
  previewCheckBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: '#fff', borderRadius: 12, padding: 1 },

  /* Bouton principal */
  primaryBtn:     { backgroundColor: Colors.blue, borderRadius: Radius.md, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...Shadows.md },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' as any },

  /* Success */
  successIconWrap:   { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  successTitle:      { fontSize: 24, fontWeight: '800' as any, letterSpacing: -0.3, textAlign: 'center' },
  successSub:        { fontSize: 14, textAlign: 'center', lineHeight: 22, color: '#6B7280' },
  successPlanCard:   { alignSelf: 'stretch', borderWidth: 1, borderRadius: 20, padding: Spacing.lg, gap: 6, ...Shadows.sm },
  successPlanChip:   { fontSize: 9, fontWeight: '800' as any, letterSpacing: 1.4 },
  successPlanName:   { fontSize: 20, fontWeight: '800' as any, letterSpacing: -0.3 },
  successDivider:    { height: 1, marginVertical: 4 },
  successPlanRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  successPlanDetail: { fontSize: 13 },
  successPlanPrice:  { fontSize: 18, fontWeight: '800' as any },
  supportCard:       { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  supportTitle:      { fontSize: 13, fontWeight: '700' as any, marginBottom: 2 },
  supportSub:        { fontSize: 11, lineHeight: 16 },
  whatsappBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#25D366', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  whatsappBtnText:   { color: '#fff', fontSize: 12, fontWeight: '700' as any },
});
