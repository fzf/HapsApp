import React, { useState, useEffect, useRef } from 'react';
import { Text, View, ScrollView, SafeAreaView, StatusBar, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

// Import NativeWind styles
import './global.css';

// Import Flowbite-style components
import { Card, CardHeader, CardTitle, CardContent } from './components/Card';
import { Button } from './components/Button';
import { Badge } from './components/Badge';

Sentry.init({
  dsn: 'https://9c7c2e67c26186ebe88339d35c9f3a26@o4506169033621504.ingest.us.sentry.io/4507059749781504',
  sendDefaultPii: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function handleRegistrationError(errorMessage) {
  alert(errorMessage);
  throw new Error(errorMessage);
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      handleRegistrationError('Permission not granted to get push token for push notification!');
      return;
    }
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      handleRegistrationError('Project ID not found');
    }
    try {
      const pushTokenString = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log(pushTokenString);
      return pushTokenString;
    } catch (e) {
      handleRegistrationError(`${e}`);
    }
  } else {
    handleRegistrationError('Must use physical device for push notifications');
  }
}

const LOCATION_TASK_NAME = 'background-location-task';

// Helper functions for location analysis
function calculateTotalDistance(locations) {
  if (locations.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < locations.length; i++) {
    const prev = locations[i - 1];
    const curr = locations[i];
    if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
      totalDistance += calculateDistanceBetween(prev, curr);
    }
  }
  return Math.round(totalDistance);
}

function calculateDistanceBetween(loc1, loc2) {
  const R = 6371000; // Earth's radius in meters
  const lat1Rad = loc1.latitude * Math.PI / 180;
  const lat2Rad = loc2.latitude * Math.PI / 180;
  const deltaLat = (loc2.latitude - loc1.latitude) * Math.PI / 180;
  const deltaLng = (loc2.longitude - loc1.longitude) * Math.PI / 180;

  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

function calculateAverageAccuracy(locations) {
  const accuracies = locations.filter(l => l.accuracy).map(l => l.accuracy);
  return accuracies.length > 0 ?
    Math.round(accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length) : null;
}

async function requestLocationPermissions() {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus === 'granted') {
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus === 'granted') {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        deferredUpdatesInterval: 300000,
        pausesUpdatesAutomatically: true
      });
    }
  }
}

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        section: 'background_location_task'
      },
      extra: {
        task_name: LOCATION_TASK_NAME,
        error_message: error.message
      }
    });
    console.error('Background location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data;

    // Log successful location collection to Sentry with detailed location data
    const locationDetails = locations.map(loc => ({
      latitude: loc.coords?.latitude,
      longitude: loc.coords?.longitude,
      accuracy: loc.coords?.accuracy,
      altitude: loc.coords?.altitude,
      heading: loc.coords?.heading,
      speed: loc.coords?.speed,
      timestamp: new Date(loc.timestamp).toISOString()
    }));

    Sentry.addBreadcrumb({
      message: `Background location task collected ${locations.length} locations`,
      level: 'info',
      data: {
        location_count: locations.length,
        api_url: process.env.EXPO_PUBLIC_API_URL,
        first_location: locationDetails[0],
        last_location: locationDetails[locationDetails.length - 1],
        all_locations: locationDetails,
        time_span_minutes: locations.length > 1 ?
          (locations[locations.length - 1].timestamp - locations[0].timestamp) / (1000 * 60) : 0
      }
    });

    console.log('API URL:', process.env.EXPO_PUBLIC_API_URL);
    console.log('Locations collected:', locations.length);

    fetch(
      process.env.EXPO_PUBLIC_API_URL + '/users/locations',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locations: locations
        })
      }
    ).then(async (res) => {
      if (res.ok) {
        const responseData = await res.json();
        // Log successful API call to Sentry with full location details
        Sentry.captureMessage('Location data sent successfully', {
          level: 'info',
          tags: {
            section: 'background_location_task',
            api_status: 'success'
          },
          extra: {
            locations_sent: locations.length,
            response_status: res.status,
            response_data: responseData,
            location_details: locationDetails,
            distance_traveled_meters: calculateTotalDistance(locationDetails),
            average_accuracy: calculateAverageAccuracy(locationDetails),
            max_speed: Math.max(...locationDetails.map(l => l.speed || 0))
          }
        });
        console.log('Location data sent successfully:', responseData);
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    }).catch((error) => {
      // Log API errors to Sentry with location context
      Sentry.captureException(error, {
        tags: {
          section: 'background_location_task',
          api_status: 'error'
        },
        extra: {
          api_url: process.env.EXPO_PUBLIC_API_URL + '/users/locations',
          locations_attempted: locations.length,
          error_message: error.message,
          failed_location_data: locationDetails,
          first_location_coords: locationDetails[0] ?
            `${locationDetails[0].latitude}, ${locationDetails[0].longitude}` : null,
          last_location_coords: locationDetails[locationDetails.length - 1] ?
            `${locationDetails[locationDetails.length - 1].latitude}, ${locationDetails[locationDetails.length - 1].longitude}` : null
        }
      });
      console.error('Failed to send location data:', error);
    });
  }
});

export default Sentry.wrap(function App() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(undefined);
  const [locationStatus, setLocationStatus] = useState('checking');
  const [locationCount, setLocationCount] = useState(0);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    registerForPushNotificationsAsync()
      .then(token => setExpoPushToken(token ?? ''))
      .catch(error => setExpoPushToken(`${error}`));

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log(response);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  useEffect(() => {
    requestLocationPermissions().then(() => {
      setLocationStatus('active');
    }).catch(() => {
      setLocationStatus('denied');
    });

    // Set user context for Sentry with location tracking info
    Sentry.setUser({
      id: "1", // Your hardcoded user ID
      username: "location_tracker_user"
    });

    // Add app context
    Sentry.setTag("app_section", "location_tracking");
    Sentry.setContext("app_info", {
      location_permissions_requested: true,
      background_task: LOCATION_TASK_NAME,
      api_endpoint: process.env.EXPO_PUBLIC_API_URL + '/users/locations'
    });
  }, []);

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'denied': return 'danger';
      default: return 'warning';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return 'Location Tracking Active';
      case 'denied': return 'Location Access Denied';
      default: return 'Checking Permissions...';
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />

      <ScrollView className="flex-1 px-4 py-6">
        {/* Header */}
        <View className="mb-6">
          <Text className="text-3xl font-bold text-gray-900 mb-2">Haps Tracker</Text>
          <Text className="text-gray-600">Location tracking and timeline management</Text>
        </View>

        {/* Status Card */}
        <Card className="mb-6">
          <CardHeader>
            <View className="flex-row items-center justify-between">
              <CardTitle>Tracking Status</CardTitle>
              <Badge variant={getStatusBadgeVariant(locationStatus)}>
                {getStatusText(locationStatus)}
              </Badge>
            </View>
          </CardHeader>
          <CardContent>
            <View className="space-y-3">
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Background Task</Text>
                <Text className="font-medium text-gray-900">{LOCATION_TASK_NAME}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-600">API Endpoint</Text>
                <Text className="font-medium text-gray-900 flex-1 text-right" numberOfLines={1}>
                  {process.env.EXPO_PUBLIC_API_URL || 'Not configured'}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Push Token Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Push Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="space-y-3">
              <Text className="text-gray-600">Expo Push Token:</Text>
              <View className="bg-gray-50 p-3 rounded-lg border">
                <Text className="text-xs font-mono text-gray-700" numberOfLines={3}>
                  {expoPushToken || 'Loading...'}
                </Text>
              </View>
              {expoPushToken && (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    // Copy to clipboard logic here
                    console.log('Token copied to clipboard');
                  }}
                >
                  Copy Token
                </Button>
              )}
            </View>
          </CardContent>
        </Card>

        {/* Last Notification Card */}
        {notification && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Latest Notification</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="space-y-2">
                <View>
                  <Text className="text-gray-600 text-sm">Title</Text>
                  <Text className="font-medium text-gray-900">
                    {notification.request.content.title || 'No title'}
                  </Text>
                </View>
                <View>
                  <Text className="text-gray-600 text-sm">Body</Text>
                  <Text className="text-gray-900">
                    {notification.request.content.body || 'No body'}
                  </Text>
                </View>
                {notification.request.content.data && (
                  <View>
                    <Text className="text-gray-600 text-sm">Data</Text>
                    <View className="bg-gray-50 p-2 rounded border mt-1">
                      <Text className="text-xs font-mono text-gray-700">
                        {JSON.stringify(notification.request.content.data, null, 2)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <View className="space-y-3">
          <Button
            variant="primary"
            onPress={() => {
              // Trigger manual location update
              console.log('Manual location update triggered');
            }}
          >
            Trigger Location Update
          </Button>

          <Button
            variant="outline"
            onPress={() => {
              // Open settings
              console.log('Opening settings...');
            }}
          >
            App Settings
          </Button>
        </View>

        {/* Footer */}
        <View className="mt-8 pt-6 border-t border-gray-200">
          <Text className="text-center text-sm text-gray-500">
            Haps Location Tracker v1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
});
