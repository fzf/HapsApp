import React, { useState, useEffect, useRef } from 'react';
import { Text, View, Platform, Button } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

import { AuthProvider, useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';

Sentry.init({
  dsn: 'https://9c7c2e67c26186ebe88339d35c9f3a26@o4506169033621504.ingest.us.sentry.io/4507059749781504',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
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
};

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

    // Note: This will need to be updated to use authenticatedFetch from context
    // For now, keeping the existing functionality
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

function MainApp() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(undefined);
  const notificationListener = useRef();
  const responseListener = useRef();
  const { isAuthenticated, loading, user } = useAuth();
  
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Loading...</Text>
      </View>
    );
  }
  
  if (!isAuthenticated) {
    return <AuthScreens />;
  }

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
    requestLocationPermissions()

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
  }, [])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-around' }}>
      <Text>Welcome, {user?.email}!</Text>
      <Button title='Try!' onPress={ () => { Sentry.captureException(new Error('First error')) }}/>
      <Text>Your Expo push token: {expoPushToken}</Text>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text>Title: {notification && notification.request.content.title} </Text>
        <Text>Body: {notification && notification.request.content.body}</Text>
        <Text>Data: {notification && JSON.stringify(notification.request.content.data)}</Text>
      </View>
    </View>
  );
}

function AuthScreens() {
  const [isLogin, setIsLogin] = useState(true);
  
  return isLogin ? (
    <LoginScreen onSwitchToRegister={() => setIsLogin(false)} />
  ) : (
    <RegisterScreen onSwitchToLogin={() => setIsLogin(true)} />
  );
}

export default Sentry.wrap(function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
});
