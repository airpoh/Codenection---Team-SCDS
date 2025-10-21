/**
 * Example: How to integrate push notifications into your App.tsx
 * ===============================================================
 *
 * This file shows how to add push notifications to your existing app.
 * Copy the relevant parts into your actual App.tsx
 */

import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// ✅ Import notification service
import {
  registerForPushNotifications,
  setupNotificationListeners,
  unregisterPushNotifications,
} from './services/notificationService';

// Your existing screens/components
import HomeScreen from './screens/HomeScreen';
import TaskDetailScreen from './screens/TaskDetailScreen';
import RemindersScreen from './screens/RemindersScreen';
import RewardsScreen from './screens/RewardsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  // ✅ Create ref for navigation (needed for deep linking from notifications)
  const navigationRef = useRef<any>(null);

  useEffect(() => {
    // ✅ Register for push notifications when app starts
    registerForPushNotifications();

    // ✅ Setup notification listeners
    let cleanupListeners: (() => void) | undefined;

    if (navigationRef.current) {
      cleanupListeners = setupNotificationListeners(navigationRef.current);
    }

    // ✅ Cleanup on unmount
    return () => {
      if (cleanupListeners) {
        cleanupListeners();
      }
    };
  }, []);

  // ✅ Optional: Unregister when user logs out
  const handleLogout = async () => {
    await unregisterPushNotifications();
    // ... rest of your logout logic
  };

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
        <Stack.Screen name="Reminders" component={RemindersScreen} />
        <Stack.Screen name="Rewards" component={RewardsScreen} />
        {/* Add your other screens */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/**
 * Alternative: If you're using React Navigation v6+ with separate navigation setup
 */

/*
// In your navigation setup file (e.g., navigation/index.tsx)

import { useNavigationContainerRef } from '@react-navigation/native';
import { setupNotificationListeners } from '../services/notificationService';

export function RootNavigator() {
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    if (navigationRef.isReady()) {
      return setupNotificationListeners(navigationRef);
    }
  }, [navigationRef]);

  return (
    // Your navigation structure
  );
}
*/

/**
 * Example: Test notifications screen (for development)
 */

/*
import React from 'react';
import { View, Button, StyleSheet } from 'react-native';
import { sendTestNotification, clearAllNotifications } from '../services/notificationService';

export function NotificationTestScreen() {
  return (
    <View style={styles.container}>
      <Button
        title="Send Test Notification"
        onPress={sendTestNotification}
      />

      <Button
        title="Clear All Notifications"
        onPress={clearAllNotifications}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
});
*/
