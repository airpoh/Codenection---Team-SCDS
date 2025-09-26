// App.tsx
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import StartupScreen from './src/screens/StartupScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import SignUpCompleteScreen from './src/screens/SignUpCompleteScreen';

import LighthouseScreen from './src/screens/LighthouseScreen';
import LighthouseSelectScreen from './src/screens/LighthouseSelectScreen';
import LighthouseResourcesScreen from './src/screens/LighthouseResourcesScreen';
import LighthouseTrustedContactsScreen from './src/screens/LighthouseTrustedContactsScreen';
import LighthouseEmergency from './src/screens/LighthouseEmergency';

import RewardMarketScreen from './src/screens/RewardMarketScreen';
import MyRewardsScreen from './src/screens/MyRewardsScreen';

import MainTabs from './src/navigation/MainTabs';
import ProfileSettings from './src/screens/ProfileSettings';
import ProfileScreen from './src/screens/ProfileScreen';

import CalendarScreen from './src/screens/CalendarScreen';

import ChallengeRunScreen from './src/screens/ChallengeRunScreen';
import ChallengeGymScreen from './src/screens/ChallengeGymScreen';

export type RootStackParamList = {
  Startup: undefined;
  Login: undefined;
  SignUp: undefined;
  SignUpComplete: undefined;
  Tabs: undefined;           // bottom tabs (Island lives here)
  Lighthouse: undefined;
  LighthouseSOS: undefined;
  LighthouseResources: undefined;
  LighthouseTrusted: undefined;
  LighthouseEmergency: undefined;
  RewardMarket: undefined;   // opened from Island building
  MyRewards: undefined; 
  Profile: undefined;
  ProfileSettings: undefined;     
  Calendar: undefined;
  ChallengeRun: 
    | { id: string; title?: string; durationSec?: number }
    | undefined;  
  ChallengeGym: undefined;

 
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Startup" component={StartupScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="SignUpComplete" component={SignUpCompleteScreen} />
          <Stack.Screen name="Tabs" component={MainTabs} />
          <Stack.Screen name="Lighthouse" component={LighthouseScreen} />
          <Stack.Screen name="LighthouseSOS" component={LighthouseSelectScreen} />
          <Stack.Screen name="LighthouseResources" component={LighthouseResourcesScreen} />
          <Stack.Screen name="LighthouseTrusted" component={LighthouseTrustedContactsScreen} />
          <Stack.Screen name="LighthouseEmergency" component={LighthouseEmergency} />
          <Stack.Screen name="Calendar" component={CalendarScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ProfileSettings" component={ProfileSettings} options={{ headerShown: false }} />
          <Stack.Screen name="ChallengeRun" component={ChallengeRunScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ChallengeGym" component={ChallengeGymScreen} options={{ headerShown: false }} />

          {/* Reward flow */}
          <Stack.Screen
            name="RewardMarket"
            component={RewardMarketScreen}
            options={{ headerShown: true, title: 'Reward Market' }}
          />
          <Stack.Screen
            name="MyRewards"
            component={MyRewardsScreen}
            options={{ headerShown: true, title: 'My Rewards' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
