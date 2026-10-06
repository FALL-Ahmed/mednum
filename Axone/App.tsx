import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useFonts } from 'expo-font';
import { ElMessiri_400Regular, ElMessiri_600SemiBold } from '@expo-google-fonts/el-messiri';

import { useAppStore } from './src/store';
import { useTheme, Text } from './src/components';
import { useT } from './src/i18n';
import { getProfessorName } from './src/utils/subjectStyles';
import { scheduleStreakReminder } from './src/utils/notifications';
import { maybeSendParentReport } from './src/utils/parentReport';
import { linkCurrentDevice } from './src/utils/account';
import { supabase } from './src/lib/supabase';

import OnboardingScreen from './src/screens/OnboardingScreen';
import StudentSetupScreen from './src/screens/StudentSetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import ChatScreen from './src/screens/ChatScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ReviserScreen from './src/screens/ReviserScreen';
import DocumentScreen from './src/screens/DocumentScreen';
import FicheScreen from './src/screens/FicheScreen';
import QuizScreen from './src/screens/QuizScreen';
import FlashcardScreen from './src/screens/FlashcardScreen';
import ClinicalCaseScreen from './src/screens/ClinicalCaseScreen';
import PomodoroScreen from './src/screens/PomodoroScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_CONFIG = [
  { name: 'Accueil',    labelKey: 'home'     as const, color: '#07A997', icon: 'home-outline'                as IoniconsName, iconOn: 'home'                as IoniconsName },
  { name: 'Chat',       labelKey: 'chat'     as const, color: '#07A997', icon: 'chatbubble-ellipses-outline' as IoniconsName, iconOn: 'chatbubble-ellipses' as IoniconsName },
  { name: 'Reviser',    labelKey: 'progress' as const, color: '#07A997', icon: 'reader-outline'               as IoniconsName, iconOn: 'reader'              as IoniconsName },
  { name: 'Historique', labelKey: 'history'  as const, color: '#07A997', icon: 'time-outline'                as IoniconsName, iconOn: 'time'                as IoniconsName },
  { name: 'Profil',     labelKey: 'profile'  as const, color: '#07A997', icon: 'person-circle-outline'       as IoniconsName, iconOn: 'person-circle'       as IoniconsName },
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
      <Ionicons name={focused ? iconOn : icon} size={22} color={focused ? color : '#94A3B8'} />
      <Text
        style={[tab.label, { color: focused ? color : '#94A3B8', fontWeight: focused ? '700' : '500' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
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
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: bottom + 16,
          backgroundColor: t.surface,
          borderTopWidth: 0,
          borderRadius: 28,
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.12,
              shadowRadius: 20,
            },
            android: { elevation: 14 },
          }),
        },
      }}
    >
      {TAB_CONFIG.map((cfg) => {
        const Screen =
          cfg.name === 'Accueil'      ? HomeScreen     :
          cfg.name === 'Chat'         ? ChatScreen     :
          cfg.name === 'Reviser'      ? ReviserScreen  :
          cfg.name === 'Historique'   ? HistoryScreen  :
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
      await linkCurrentDevice();
      syncQuota();
      useAppStore.getState().hydrateCoursesFromSupabase();
      const { data } = await supabase.from('students').select('school_name').eq('user_id', uid).maybeSingle();
      const { studentName: n, studentClassId: cid, studentClassName: cn, studentSchoolName: sn, setStudentInfo } = useAppStore.getState();
      if (data) {
        if (data.school_name) setStudentInfo(n, cid, cn, data.school_name);
      } else if (n) {
        await supabase.from('students').upsert({
          user_id: uid, name: n, promotion_id: cid, promotion_name: cn, school_name: sn,
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
            <Stack.Screen name="Document" component={DocumentScreen} />
            <Stack.Screen name="Fiche" component={FicheScreen} />
            <Stack.Screen name="Quiz" component={QuizScreen} />
            <Stack.Screen name="Flashcards" component={FlashcardScreen} />
            <Stack.Screen name="ClinicalCase" component={ClinicalCaseScreen} />
            <Stack.Screen name="Pomodoro" component={PomodoroScreen} />
            <Stack.Screen name="Calendar" component={CalendarScreen} />
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
  const [fontsLoaded] = useFonts({ ElMessiri_400Regular, ElMessiri_600SemiBold });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#0B1E34' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
        <GlobalOfflineBanner />
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
    gap: 3,
    minWidth: 50,
  },
  label: {
    fontSize: 9.5,
    letterSpacing: 0.1,
  },
});
