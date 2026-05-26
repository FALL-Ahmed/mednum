import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useAppStore } from './src/store';
import { useTheme } from './src/components';
import { scheduleStreakReminder } from './src/utils/notifications';

import OnboardingScreen from './src/screens/OnboardingScreen';
import StudentSetupScreen from './src/screens/StudentSetupScreen';
import ChatScreen from './src/screens/ChatScreen';
import SubjectScreen from './src/screens/SubjectScreen';
import SkillTreeScreen from './src/screens/SkillTreeScreen';
import QuizScreen from './src/screens/QuizScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProgressScreen from './src/screens/ProgressScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const SubjectStack = createStackNavigator();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// Couleur unique par onglet — identité visuelle propre à chaque section
const TAB_CONFIG = [
  { name: 'Cours',      label: 'Cours',      color: '#2563EB', icon: 'book-outline'              as IoniconsName, iconOn: 'book'                as IoniconsName },
  { name: 'Chat',       label: 'Chat',       color: '#059669', icon: 'chatbubble-ellipses-outline'as IoniconsName, iconOn: 'chatbubble-ellipses' as IoniconsName },
  { name: 'Progression',label: 'Progrès',    color: '#D97706', icon: 'bar-chart-outline'          as IoniconsName, iconOn: 'bar-chart'           as IoniconsName },
  { name: 'Historique', label: 'Historique', color: '#7C3AED', icon: 'time-outline'               as IoniconsName, iconOn: 'time'                as IoniconsName },
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
      {/* Fond coloré derrière l'icône active */}
      <View style={[
        tab.iconBox,
        focused && { backgroundColor: color + '18' },
      ]}>
        <Ionicons
          name={focused ? iconOn : icon}
          size={focused ? 23 : 21}
          color={focused ? color : '#94A3B8'}
        />
      </View>

      <Text style={[
        tab.label,
        { color: focused ? color : '#94A3B8' },
        focused && tab.labelActive,
      ]}>
        {label}
      </Text>

      {/* Petit point indicateur sous le label */}
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
    </SubjectStack.Navigator>
  );
}

function MainTabs() {
  const t = useTheme();
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
          // Ligne fine en haut via borderTop simulé par shadow
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
          cfg.name === 'Cours'       ? SubjectNavigator :
          cfg.name === 'Chat'        ? ChatScreen       :
          cfg.name === 'Progression' ? ProgressScreen   :
          HistoryScreen;

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
                  label={cfg.label}
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
  const { onboardingDone, studentName, streakCurrent, xpToday } = useAppStore();

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
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

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
