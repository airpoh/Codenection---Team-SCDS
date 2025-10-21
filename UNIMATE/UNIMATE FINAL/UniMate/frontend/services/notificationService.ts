/**
 * Push Notification Service
 * ==========================
 * Handles push notification registration and listening for UniMate mobile app.
 *
 * Features:
 * - Request notification permissions
 * - Register device with Expo Push Notifications
 * - Send token to backend
 * - Listen for notifications
 * - Handle notification taps
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,  // Show notification banner
    shouldPlaySound: true,  // Play notification sound
    shouldSetBadge: true,   // Update app badge count
  }),
});

/**
 * Register device for push notifications
 *
 * Steps:
 * 1. Check if device is physical (not simulator/emulator)
 * 2. Request notification permissions
 * 3. Get Expo Push Token
 * 4. Send token to backend API
 * 5. Configure Android notification channel
 *
 * @returns Push token string or null if registration failed
 */
export async function registerForPushNotifications(): Promise<string | null> {
  let token: string | null = null;

  // ✅ Check if running on physical device
  if (!Device.isDevice) {
    console.warn('⚠️  Push notifications require a physical device (not simulator/emulator)');
    // Return null but don't show alert - silently skip for development
    return null;
  }

  try {
    // ✅ Step 1: Check current permission status
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // ✅ Step 2: Request permission if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    // ✅ Step 3: Verify permission was granted
    if (finalStatus !== 'granted') {
      console.warn('⚠️  Push notification permission denied');
      return null;
    }

    // ✅ Step 4: Get Expo Push Token
    // Get projectId from app.json (set by EAS)
    const projectId =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ||
      '5e4bbd04-da5a-4786-9fe0-7fb8d18e1859'; // EAS project ID

    console.log('📋 Using Project ID:', projectId);

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = tokenData.data;

    console.log('📱 Expo Push Token obtained:', token);

    // ✅ Step 5: Send token to backend
    await sendTokenToBackend(token);

    // ✅ Step 6: Configure Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5', // UniMate primary color
        sound: 'default',
      });

      console.log('✅ Android notification channel configured');
    }

    console.log('✅ Push notifications registered successfully');
    return token;

  } catch (error) {
    console.error('❌ Failed to register for push notifications:', error);
    return null;
  }
}

/**
 * Send push token to backend API
 *
 * @param pushToken Expo push token
 */
async function sendTokenToBackend(pushToken: string): Promise<void> {
  try {
    // Use the same API URL as the main app (from api.ts)
    const API_BASE_URL = 'http://10.72.127.211:8000'; // Match DEVELOPMENT_CONFIG.MOBILE_IP
    const accessToken = await AsyncStorage.getItem('auth_token'); // Match AuthContext key

    if (!accessToken) {
      console.warn('⚠️  User not authenticated, will register token after login');
      // Store token temporarily to register after login
      await AsyncStorage.setItem('pending_push_token', pushToken);
      return;
    }

    // Get device info
    const deviceType = Platform.OS; // 'ios' or 'android'
    const deviceName = Device.modelName || Device.deviceName || 'Unknown Device';

    // Send to backend
    const response = await axios.post(
      `${API_BASE_URL}/notifications/register-token`,
      {
        push_token: pushToken,
        device_type: deviceType,
        device_name: deviceName,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      }
    );

    if (response.data.success) {
      console.log('✅ Push token registered with backend');
      // Store token locally for reference
      await AsyncStorage.setItem('push_token', pushToken);
    } else {
      console.warn('⚠️  Backend token registration failed:', response.data);
    }

  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ Failed to send token to backend:', error.response?.data || error.message);
    } else {
      console.error('❌ Unexpected error sending token to backend:', error);
    }
    // Don't throw - failing to register token shouldn't crash the app
  }
}

/**
 * Unregister push notifications when user logs out
 */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    const API_BASE_URL = await AsyncStorage.getItem('API_BASE_URL');
    const accessToken = await AsyncStorage.getItem('access_token');

    if (!API_BASE_URL || !accessToken) {
      console.log('Skipping unregister - not authenticated');
      return;
    }

    await axios.delete(
      `${API_BASE_URL}/notifications/unregister-token`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 5000,
      }
    );

    // Remove stored token
    await AsyncStorage.removeItem('push_token');

    console.log('✅ Push tokens unregistered');

  } catch (error) {
    console.error('❌ Failed to unregister push tokens:', error);
  }
}

/**
 * Setup notification listeners
 *
 * Handles:
 * - Notifications received while app is in foreground
 * - User tapping on notifications
 * - Deep linking to specific screens
 *
 * @param navigation React Navigation object for deep linking
 */
export function setupNotificationListeners(navigation: any) {
  // ✅ Listener 1: Notification received while app is in foreground
  const notificationListener = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('📬 Notification received (foreground):', notification);

      const { title, body, data } = notification.request.content;

      console.log(`  Title: ${title}`);
      console.log(`  Body: ${body}`);
      console.log(`  Data:`, data);

      // You can show an in-app alert here if desired
    }
  );

  // ✅ Listener 2: User tapped on notification
  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('👆 Notification tapped:', response);

      const data = response.notification.request.content.data;

      // Navigate based on notification type
      if (data.type === 'task_reminder' && data.task_id) {
        console.log(`Navigating to Calendar (task: ${data.task_id})`);
        navigation.navigate('Calendar');
      } else if (data.type === 'reminder' && data.reminder_id) {
        console.log(`Navigating to Calendar (reminders)`);
        navigation.navigate('Calendar');
      } else if (data.type === 'points_earned') {
        console.log(`Navigating to rewards`);
        navigation.navigate('RewardMarket');
      } else if (data.screen) {
        // Generic screen navigation
        console.log(`Navigating to: ${data.screen}`);
        navigation.navigate(data.screen);
      }
    }
  );

  // Return cleanup function
  return () => {
    notificationListener.remove();
    responseListener.remove();
  };
}

/**
 * Register any pending push token after user logs in
 * Call this function after successful login
 */
export async function registerPendingPushToken(): Promise<void> {
  try {
    const pendingToken = await AsyncStorage.getItem('pending_push_token');
    if (pendingToken) {
      console.log('📲 Registering pending push token after login...');
      await sendTokenToBackend(pendingToken);
      await AsyncStorage.removeItem('pending_push_token');
    }
  } catch (error) {
    console.error('❌ Failed to register pending push token:', error);
  }
}

/**
 * Send a test notification (for development/testing)
 */
export async function sendTestNotification(): Promise<void> {
  try {
    const API_BASE_URL = 'http://10.72.127.211:8000'; // Match DEVELOPMENT_CONFIG.MOBILE_IP
    const accessToken = await AsyncStorage.getItem('auth_token'); // Match AuthContext key

    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await axios.post(
      `${API_BASE_URL}/notifications/test`,
      {
        title: '🧪 Test Notification',
        body: 'This is a test notification from UniMate!',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
      }
    );

    console.log('✅ Test notification sent:', response.data);
    alert('Test notification sent! Check your device.');

  } catch (error) {
    console.error('❌ Failed to send test notification:', error);
    alert('Failed to send test notification');
  }
}

/**
 * Get badge count (iOS only)
 */
export async function getBadgeCount(): Promise<number> {
  if (Platform.OS !== 'ios') {
    return 0;
  }
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set badge count (iOS only)
 */
export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
  console.log('✅ All notifications cleared');
}
