import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

import { useAppStore } from './src/store';
import { useTheme, Text } from './src/components';
import { useT } from './src/i18n';
import { getProfessorName } from './src/utils/subjectStyles';
import { scheduleStreakReminder } from './src/utils/notifications';
import { maybeSendParentReport } from './src/utils/parentReport';
import { supabase } from './src/lib/supabase';

import OnboardingScreen from './src/screens/OnboardingScreen';
import StudentSetupScreen from './src/screens/StudentSetupScreen';
import CourseScreen from './src/screens/CourseScreen';
import ChatScreen from './src/screens/ChatScreen';
import SubjectScreen from './src/screens/SubjectScreen';
import SkillTreeScreen from './src/screens/SkillTreeScreen';
import QuizScreen from './src/screens/QuizScreen';
import FicheScreen from './src/screens/FicheScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const SubjectStack = createStackNavigator();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_CONFIG = [
  { name: 'Cours',      labelKey: 'courses'  as const, color: '#2563EB', icon: 'book-outline'               as IoniconsName, iconOn: 'book'                as IoniconsName },
  { name: 'Chat',       labelKey: 'chat'     as const, color: '#059669', icon: 'chatbubble-ellipses-outline' as IoniconsName, iconOn: 'chatbubble-ellipses' as IoniconsName },
  { name: 'Progression',labelKey: 'progress' as const, color: '#D97706', icon: 'bar-chart-outline'           as IoniconsName, iconOn: 'bar-chart'           as IoniconsName },
  { name: 'Historique', labelKey: 'history'  as const, color: '#7C3AED', icon: 'time-outline'                as IoniconsName, iconOn: 'time'                as IoniconsName },
  { name: 'Profil',     labelKey: 'profile'  as const, color: '#64748B', icon: 'person-circle-outline'       as IoniconsName, iconOn: 'person-circle'       as IoniconsName },
] as const;

function TabIcon({
  icon, iconOn, label, color, focused,
}: {
  icon: IoniconsName;
  iconOn: IoniconsName;
  label: string;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={tab.item}>
      <View style={[tab.iconBox, focused && { backgroundColor: color + '18' }]}>
        <Ionicons
          name={focused ? iconOn : icon}
          size={focused ? 23 : 21}
          color={focused ? color : '#94A3B8'}
        />
      </View>
      <Text style={[tab.label, { color: focused ? color : '#94A3B8' }, focused && tab.labelActive]}>
        {label}
      </Text>
      <View style={[tab.dot, focused && { backgroundColor: color }]} />
    </View>
  );
}

function SubjectNavigator() {
  const activeCourse = useAppStore(s => s.activeCourse);
  const initialRoute = activeCourse ? 'SkillTree' : 'SubjectList';
  return (
    <SubjectStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <SubjectStack.Screen name="SubjectList" component={SubjectScreen} />
      <SubjectStack.Screen name="SkillTree"   component={SkillTreeScreen} />
      <SubjectStack.Screen name="Quiz"        component={QuizScreen} />
      <SubjectStack.Screen name="Fiche"       component={FicheScreen} />
      <SubjectStack.Screen name="AdminUpload" component={CourseScreen} />
    </SubjectStack.Navigator>
  );
}

function MainTabs() {
  const t = useTheme();
  const tr = useT();
  const { bottom } = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopWidth: 0,
          height: 64 + bottom,
          paddingBottom: bottom || 10,
          paddingTop: 8,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.07,
              shadowRadius: 10,
            },
            android: { elevation: 14 },
          }),
        },
      }}
    >
      {TAB_CONFIG.map((cfg) => {
        const Screen =
          cfg.name === 'Cours'        ? SubjectNavigator :
          cfg.name === 'Chat'         ? ChatScreen       :
          cfg.name === 'Progression'  ? ProgressScreen   :
          cfg.name === 'Historique'   ? HistoryScreen    :
          SettingsScreen;

        return (
          <Tab.Screen
            key={cfg.name}
            name={cfg.name}
            component={Screen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  icon={cfg.icon}
                  iconOn={cfg.iconOn}
                  label={tr.tabs[cfg.labelKey]}
                  color={cfg.color}
                  focused={focused}
                />
              ),
            }}
          />
        );
      })}
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { onboardingDone, studentName, streakCurrent, xpToday, setUserId, syncQuota, chatHistory } = useAppStore();

  React.useEffect(() => {
    const syncStudent = async (uid: string) => {
      setUserId(uid);
      syncQuota();
      const { data } = await supabase.from('students').select('school_name').eq('user_id', uid).maybeSingle();
      const { studentName: n, studentClassId: cid, studentClassName: cn, studentSchoolName: sn, setStudentInfo } = useAppStore.getState();
      if (data) {
        if (data.school_name) setStudentInfo(n, cid, cn, data.school_name);
      } else if (n) {
        await supabase.from('students').upsert({
          user_id: uid, name: n, class_id: cid, class_name: cn, school_name: sn,
        }, { onConflict: 'user_id' });
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        supabase.auth.signInAnonymously().then(({ data }) => {
          if (data.user) syncStudent(data.user.id);
        });
      } else {
        syncStudent(session.user.id);
      }
    });
  }, []);

  React.useEffect(() => {
    const { userId, studentName: name, chatHistory: history } = useAppStore.getState();
    if (!userId || !name) return;
    maybeSendParentReport({ userId, studentName: name, chatHistory: history });
  }, []);

  React.useEffect(() => {
    if (onboardingDone && studentName) {
      scheduleStreakReminder(streakCurrent, xpToday);
    }
  }, [onboardingDone, studentName]);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!onboardingDone ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : !studentName ? (
          <Stack.Screen name="StudentSetup" component={StudentSetupScreen} />
        ) : (
          <Stack.Group>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="Subscription"
              component={SubscriptionScreen}
              options={{ presentation: 'modal', headerShown: false }}
            />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function GlobalOfflineBanner() {
  const { top } = useSafeAreaInsets();
  const tr = useT();
  const activeCourse = useAppStore(s => s.activeCourse);
  const slideAnim = React.useRef(new Animated.Value(-100)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = (offline: boolean) => {
      setVisible(offline);
      Animated.spring(slideAnim, {
        toValue: offline ? 0 : -100,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    };

    const timer = setTimeout(() => {
      NetInfo.fetch().then(state => show(!(state.isConnected ?? true)));
    }, 1500);

    const unsub = NetInfo.addEventListener(state => show(!(state.isConnected ?? true)));
    return () => { unsub(); clearTimeout(timer); };
  }, []);

  const profName = getProfessorName(activeCourse?.subjectName || '');

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        offlineStyle.banner,
        { top: top + 8, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Ionicons name="wifi-outline" size={16} color="#fff" />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={offlineStyle.title}>{profName.toUpperCase()} {tr.offline.offlineSuffix}</Text>
        <Text style={offlineStyle.sub}>{tr.offline.checkConnection}</Text>
      </View>
      <View style={offlineStyle.dot} />
    </Animated.View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
        <GlobalOfflineBanner />
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const offlineStyle = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16, right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E24B4A',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 9999,
    ...Platform.select({
      ios:     { shadowColor: '#E24B4A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
      android: { elevation: 10 },
    }),
  },
  title: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  sub:   { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  dot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
});

const tab = StyleSheet.create({
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 60,
  },
  iconBox: {
    width: 44,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  labelActive: {
    fontWeight: '700',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginTop: 2,
  },
});
