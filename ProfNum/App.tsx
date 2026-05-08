import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useAppStore } from './src/store';
import { Colors } from './src/theme';
import { useTheme } from './src/components';
import { scheduleStreakReminder } from './src/utils/notifications';

import OnboardingScreen from './src/screens/OnboardingScreen';
import StudentSetupScreen from './src/screens/StudentSetupScreen';
import ChatScreen from './src/screens/ChatScreen';
import SubjectScreen from './src/screens/SubjectScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProgressScreen from './src/screens/ProgressScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  const t = useTheme();
  return (
    <View style={[tabStyles.item, focused && tabStyles.itemActive]}>
      <Text style={tabStyles.emoji}>{emoji}</Text>
      <Text style={[tabStyles.label, { color: focused ? Colors.blue : t.textMuted }]}>
        {label}
      </Text>
    </View>
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
          borderTopWidth: 1,
          borderTopColor: t.border,
          height: 56 + bottom,
          paddingBottom: bottom || 6,
          paddingTop: 6,
        },
      }}
    >
      <Tab.Screen
        name="Cours"
        component={SubjectScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📚" label="Cours" focused={focused} /> }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="Chat" focused={focused} /> }}
      />
      <Tab.Screen
        name="Progression"
        component={ProgressScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📈" label="Progrès" focused={focused} /> }}
      />
      <Tab.Screen
        name="Historique"
        component={HistoryScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🕐" label="Historique" focused={focused} /> }}
      />
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

const tabStyles = StyleSheet.create({
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 2,
  },
  itemActive: {
    backgroundColor: Colors.blueLight,
  },
  emoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
