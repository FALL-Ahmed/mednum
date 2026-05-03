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

import OnboardingScreen from './src/screens/OnboardingScreen';
import StudentSetupScreen from './src/screens/StudentSetupScreen';
import ChatScreen from './src/screens/ChatScreen';
import SubjectScreen from './src/screens/SubjectScreen';
import HistoryScreen from './src/screens/HistoryScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ label, emoji, focused }: { label: string; emoji: string; focused: boolean }) {
  return (
    <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
      <Text style={tabStyles.iconEmoji}>{emoji}</Text>
      <Text style={[tabStyles.iconLabel, { color: focused ? Colors.blue : Colors.textSecondary }]}>
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
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          borderTopWidth: 0.5,
          height: 62 + bottom,
          paddingBottom: bottom || 8,
          paddingTop: 6,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Cours"
        component={SubjectScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Cours" emoji="📚" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Chat" emoji="💬" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Historique"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Historique" emoji="📋" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { onboardingDone, studentName } = useAppStore();

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
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 2,
  },
  iconWrapActive: {
    backgroundColor: Colors.blueLight,
  },
  iconEmoji: { fontSize: 18 },
  iconLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
