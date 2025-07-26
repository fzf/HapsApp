import React, { useState, useEffect, useRef } from 'react';
import { Text, View, ScrollView, SafeAreaView, StatusBar, Platform, StyleSheet } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import * as SecureStore from 'expo-secure-store';

// Helper function to send debug notifications
async function sendDebugNotification(title, body, data = {}) {
  if (!DEBUG_NOTIFICATIONS || !ENABLE_LOCATION_DEBUG_NOTIFICATIONS) {
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          ...data,
          timestamp: new Date().toISOString(),
          source: 'background_location_debug'
        },
        sound: 'default'
      },
      trigger: null // Send immediately
    });
    console.log('[DEBUG] Notification sent:', title, body);
  } catch (error) {
    console.error('[DEBUG] Failed to send notification:', error);
  }
}

// Function to toggle debug notifications
function toggleDebugNotifications(enabled) {
  ENABLE_LOCATION_DEBUG_NOTIFICATIONS = enabled;
  console.log('[DEBUG] Location debug notifications:', enabled ? 'ENABLED' : 'DISABLED');
}

// NativeWind styles are handled by babel plugin

// Import Flowbite-style components
import { Card, CardHeader, CardTitle, CardContent } from './components/Card';
import { Button } from './components/Button';
import { Badge } from './components/Badge';
import { BuildInfo, BuildInfoFooter } from './components/BuildInfo';

// Import authentication components
import { AuthProvider, useAuth, getAuthTokenForBackgroundTask, updateCachedAuthToken, clearCachedAuthToken } from './AuthContext';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';

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
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_TASK_NAME = 'heartbeat-location-task';

// Debug notifications configuration
const DEBUG_NOTIFICATIONS = __DEV__; // Only in development mode
let ENABLE_LOCATION_DEBUG_NOTIFICATIONS = true; // Default value, can be toggled in UI

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

// Check if background location is actively running
async function getLocationTrackingStatus() {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    const isHeartbeatRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK_NAME);
    const permissions = await Location.getBackgroundPermissionsAsync();

    return {
      isTracking,
      isTaskRegistered,
      isHeartbeatRegistered,
      hasBackgroundPermission: permissions.granted,
      permissionStatus: permissions.status
    };
  } catch (error) {
    console.error('Failed to get location tracking status:', error);
    return {
      isTracking: false,
      isTaskRegistered: false,
      isHeartbeatRegistered: false,
      hasBackgroundPermission: false,
      permissionStatus: 'unknown'
    };
  }
}

// Stop background location tracking
async function stopLocationTracking() {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      console.log('Background location tracking stopped');
    }

    // Also unregister heartbeat task
    try {
      await BackgroundTask.unregisterTaskAsync(HEARTBEAT_TASK_NAME);
      console.log('Heartbeat task unregistered');
    } catch (heartbeatError) {
      console.error('Failed to unregister heartbeat task:', heartbeatError);
    }

    Sentry.addBreadcrumb({
      message: 'Background location tracking and heartbeat stopped',
      level: 'info'
    });
  } catch (error) {
    console.error('Failed to stop location tracking:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'location_tracking',
        error_type: 'stop_tracking_error'
      }
    });
  }
}

// Restart location tracking with current settings
async function restartLocationTracking() {
  try {
    await stopLocationTracking();
    await requestLocationPermissions();
    console.log('Location tracking restarted');
  } catch (error) {
    console.error('Failed to restart location tracking:', error);
  }
}

// Get current device location manually (for testing)
async function getCurrentLocationManually() {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (granted) {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        maximumAge: 1000, // Use location up to 1 second old
        timeout: 15000 // 15 second timeout
      });

      console.log('Manual location retrieved:', location);
      Sentry.addBreadcrumb({
        message: 'Manual location retrieved',
        level: 'info',
        data: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy
        }
      });

      return location;
    }
  } catch (error) {
    console.error('Failed to get current location:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'location_tracking',
        error_type: 'manual_location_error'
      }
    });
  }
}

// Test heartbeat functionality (development only)
async function triggerHeartbeatForTesting() {
  try {
    if (__DEV__) {
      console.log('Triggering heartbeat task for testing...');

      // Trigger the heartbeat background task
      const result = await BackgroundTask.triggerTaskWorkerForTestingAsync();
      console.log('Heartbeat task triggered:', result);

      Sentry.addBreadcrumb({
        message: 'Heartbeat task manually triggered for testing',
        level: 'info'
      });

      return result;
    } else {
      console.warn('Heartbeat testing is only available in development mode');
    }
  } catch (error) {
    console.error('Failed to trigger heartbeat for testing:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'heartbeat_testing',
        error_type: 'trigger_error'
      }
    });
  }
}

async function requestLocationPermissions() {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus === 'granted') {
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus === 'granted') {
      // Configure for more frequent location updates (prioritizing frequency over battery)
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        // High accuracy for precise tracking
        accuracy: Location.Accuracy.BestForNavigation,
        // Update every 30 seconds (minimum for background)
        timeInterval: 30000,
        // Update when device moves 10 meters
        distanceInterval: 10,
        // Enable deferred updates but with shorter interval
        deferredUpdatesInterval: 60000, // 1 minute vs 5 minutes
        deferredUpdatesDistance: 50, // 50 meters vs default
        // Disable automatic pausing to maintain tracking
        pausesUpdatesAutomatically: false,
        // Enable background activity type for better performance
        activityType: Location.ActivityType.AutomotiveNavigation,
        // Show location icon in status bar
        showsBackgroundLocationIndicator: true
              });

        // Register heartbeat background task to ensure 5-minute updates
        try {
          await BackgroundTask.registerTaskAsync(HEARTBEAT_TASK_NAME, {
            minimumInterval: 5 // 5 minutes
          });
          console.log('Heartbeat background task registered successfully');
        } catch (heartbeatError) {
          console.error('Failed to register heartbeat task:', heartbeatError);
          Sentry.captureException(heartbeatError, {
            tags: {
              section: 'heartbeat_task_registration',
              error_type: 'registration_error'
            }
          });
        }

        console.log('Background location tracking started with high frequency settings + heartbeat');
        Sentry.addBreadcrumb({
          message: 'Background location tracking configured with heartbeat',
          level: 'info',
          data: {
            accuracy: 'BestForNavigation',
            timeInterval: 30000,
            distanceInterval: 10,
            deferredUpdatesInterval: 60000,
            heartbeatInterval: HEARTBEAT_INTERVAL
          }
        });
      }
    }
  }

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    // Properly handle error objects that may have non-standard formats
    // Fixes MOBILE-4: Object captured as exception with keys: code, message
    let errorToLog = error;

    // If error is an object with code/message properties, convert to proper Error
    if (error && typeof error === 'object' && error.code && error.message) {
      errorToLog = new Error(`${error.code}: ${error.message}`);
      errorToLog.originalError = error;
    }

    // Log error to Sentry with better error handling
    Sentry.captureException(errorToLog, {
      tags: {
        section: 'background_location_task',
        error_type: 'task_manager_error'
      },
      extra: {
        task_name: LOCATION_TASK_NAME,
        error_message: error?.message || 'Unknown error',
        error_code: error?.code || 'UNKNOWN',
        original_error: error
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

    // Get auth token for authenticated request using background-safe method
    // Fixes MOBILE-8: SecureStore access from background tasks
    getAuthTokenForBackgroundTask().then(authToken => {
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      if (authToken) {
        headers['Authorization'] = authToken;
      } else {
        console.warn('No auth token available for background location upload');
        // Log missing token to Sentry but don't fail completely
        Sentry.captureMessage('Background location task: No auth token available', {
          level: 'warning',
          tags: {
            section: 'background_location_task',
            issue_type: 'missing_auth_token'
          },
          extra: {
            locations_count: locations.length
          }
        });
      }

      fetch(
        process.env.EXPO_PUBLIC_API_URL + '/users/locations',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            locations: locations
          })
        }
      ).then(async (res) => {
        if (res.ok) {
          const responseData = await res.json();

          // Send debug notification for successful location upload
          if (locations.length > 0) {
            const firstLocation = locationDetails[0];
            const lastLocation = locationDetails[locationDetails.length - 1];
            const distance = calculateTotalDistance(locationDetails);

            await sendDebugNotification(
              `📍 Location Upload (${locations.length} points)`,
              `Coords: ${firstLocation.latitude.toFixed(4)}, ${firstLocation.longitude.toFixed(4)}\nDistance: ${distance}m\nAccuracy: ${calculateAverageAccuracy(locationDetails)}m`,
              {
                type: 'movement_tracking',
                locations_count: locations.length,
                distance_meters: distance,
                first_coords: `${firstLocation.latitude}, ${firstLocation.longitude}`,
                average_accuracy: calculateAverageAccuracy(locationDetails)
              }
            );
          }

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
              max_speed: Math.max(...locationDetails.map(l => l.speed || 0)),
              auth_token_present: !!authToken
            }
          });
          console.log('Location data sent successfully:', responseData);
        } else {
          // Fixes MOBILE-7: Better handling of HTTP 401 errors
          const errorMessage = `HTTP ${res.status}: ${res.statusText}`;
          const responseText = await res.text().catch(() => 'Could not read response');

          // Send debug notification for API failure
          await sendDebugNotification(
            '❌ Location Upload Failed',
            `HTTP ${res.status}: ${res.statusText}\nLocations: ${locations.length}\nAuth: ${authToken ? 'Present' : 'Missing'}`,
            {
              type: 'movement_tracking_error',
              status: res.status,
              locations_count: locations.length,
              auth_token_present: !!authToken,
              error: errorMessage
            }
          );

          // Create a more informative error
          const apiError = new Error(errorMessage);
          apiError.status = res.status;
          apiError.statusText = res.statusText;
          apiError.responseText = responseText;

          throw apiError;
        }
      }).catch((error) => {
        // Enhanced error logging for API failures
        // Fixes MOBILE-7: HTTP 401 and other API errors
        Sentry.captureException(error, {
          tags: {
            section: 'background_location_task',
            api_status: 'error',
            http_status: error.status || 'unknown'
          },
          extra: {
            api_url: process.env.EXPO_PUBLIC_API_URL + '/users/locations',
            locations_attempted: locations.length,
            error_message: error.message,
            error_status: error.status,
            error_status_text: error.statusText,
            error_response: error.responseText,
            auth_token_present: !!authToken,
            auth_token_length: authToken ? authToken.length : 0,
            failed_location_data: locationDetails,
            first_location_coords: locationDetails[0] ?
              `${locationDetails[0].latitude}, ${locationDetails[0].longitude}` : null,
            last_location_coords: locationDetails[locationDetails.length - 1] ?
              `${locationDetails[locationDetails.length - 1].latitude}, ${locationDetails[locationDetails.length - 1].longitude}` : null
          }
        });
        console.error('Failed to send location data:', error);
      });
    }).catch((tokenError) => {
      console.error('Failed to get auth token for background task:', tokenError);
      Sentry.captureException(tokenError, {
        tags: {
          section: 'background_location_task',
          error_type: 'auth_token_retrieval'
        },
        extra: {
          locations_count: locations.length
        }
      });
    });
  }
});

// Heartbeat task to ensure regular location updates even when stationary
TaskManager.defineTask(HEARTBEAT_TASK_NAME, async () => {
  try {
    console.log('Heartbeat location task triggered');

    // Get current location manually for heartbeat
    const authToken = await getAuthTokenForBackgroundTask();

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        maximumAge: 10000, // Use location up to 10 seconds old
        timeout: 30000 // 30 second timeout
      });

      if (location) {
        const locationData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          altitude: location.coords.altitude,
          heading: location.coords.heading,
          speed: location.coords.speed,
          timestamp: new Date(location.timestamp).toISOString(),
          isHeartbeat: true // Flag to identify heartbeat locations
        };

        console.log('Heartbeat location collected:', locationData);

        Sentry.addBreadcrumb({
          message: 'Heartbeat location collected',
          level: 'info',
          data: {
            ...locationData,
            auth_token_present: !!authToken
          }
        });

        // Send heartbeat location to API
        const headers = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        };

        if (authToken) {
          headers['Authorization'] = authToken;
        }

        const response = await fetch(
          process.env.EXPO_PUBLIC_API_URL + '/users/locations',
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              locations: [{
                coords: location.coords,
                timestamp: location.timestamp,
                isHeartbeat: true
              }]
            })
          }
        );

                if (response.ok) {
          const responseData = await response.json();

          // Send debug notification for successful heartbeat upload
          await sendDebugNotification(
            '💓 Heartbeat Location Sent',
            `Coords: ${locationData.latitude.toFixed(4)}, ${locationData.longitude.toFixed(4)}\nAccuracy: ${locationData.accuracy}m\nTime: ${new Date().toLocaleTimeString()}`,
            {
              type: 'heartbeat_tracking',
              coords: `${locationData.latitude}, ${locationData.longitude}`,
              accuracy: locationData.accuracy,
              timestamp: locationData.timestamp
            }
          );

          console.log('Heartbeat location sent successfully:', responseData);

          Sentry.captureMessage('Heartbeat location sent successfully', {
            level: 'info',
            tags: {
              section: 'heartbeat_location_task',
              api_status: 'success'
            },
            extra: {
              location_data: locationData,
              response_data: responseData
            }
          });
        } else {
          const errorMessage = `HTTP ${response.status}: ${response.statusText}`;

          // Send debug notification for heartbeat failure
          await sendDebugNotification(
            '💔 Heartbeat Upload Failed',
            `HTTP ${response.status}: ${response.statusText}\nCoords: ${locationData.latitude.toFixed(4)}, ${locationData.longitude.toFixed(4)}\nAuth: ${authToken ? 'Present' : 'Missing'}`,
            {
              type: 'heartbeat_tracking_error',
              status: response.status,
              coords: `${locationData.latitude}, ${locationData.longitude}`,
              auth_token_present: !!authToken,
              error: errorMessage
            }
          );

          throw new Error(errorMessage);
        }
      }
    } catch (locationError) {
      console.error('Failed to get heartbeat location:', locationError);
      Sentry.captureException(locationError, {
        tags: {
          section: 'heartbeat_location_task',
          error_type: 'location_fetch_error'
        },
        extra: {
          auth_token_present: !!authToken
        }
      });
    }

    console.log('Heartbeat task completed successfully');
    return { status: 'success' };
  } catch (error) {
    console.error('Heartbeat task error:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'heartbeat_location_task',
        error_type: 'task_error'
      }
    });
    return { status: 'failed', error: error.message };
  }
});

function MainApp() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(undefined);
  const [locationStatus, setLocationStatus] = useState('checking');
  const [locationCount, setLocationCount] = useState(0);
  const [locationTrackingDetails, setLocationTrackingDetails] = useState({
    isTracking: false,
    isTaskRegistered: false,
    isHeartbeatRegistered: false,
    hasBackgroundPermission: false,
    permissionStatus: 'unknown'
  });
  const [debugNotificationsEnabled, setDebugNotificationsEnabled] = useState(ENABLE_LOCATION_DEBUG_NOTIFICATIONS);
  const notificationListener = useRef();
  const responseListener = useRef();
  const { isAuthenticated, loading, user, logout, token } = useAuth();

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

  // Update cached auth token when token changes
  useEffect(() => {
    if (token) {
      updateCachedAuthToken(token);
    } else {
      clearCachedAuthToken();
    }
  }, [token]);

  useEffect(() => {
    const initializeLocationTracking = async () => {
      try {
        await requestLocationPermissions();
        setLocationStatus('active');

        // Get detailed tracking status
        const trackingStatus = await getLocationTrackingStatus();
        setLocationTrackingDetails(trackingStatus);
      } catch (error) {
        setLocationStatus('denied');
        console.error('Location initialization failed:', error);
      }
    };

    initializeLocationTracking();

    // Set user context for Sentry with location tracking info
    Sentry.setUser({
      id: user?.id?.toString() || "unknown",
      email: user?.email,
      username: "location_tracker_user"
    });

    // Add app context
    Sentry.setTag("app_section", "location_tracking");
    Sentry.setContext("app_info", {
      location_permissions_requested: true,
      background_task: LOCATION_TASK_NAME,
      api_endpoint: process.env.EXPO_PUBLIC_API_URL + '/users/locations'
    });
  }, [user]);

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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreens />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Haps Tracker</Text>
              <Text style={styles.subtitle}>Welcome, {user?.email}</Text>
            </View>
            <Button
              variant="outline"
              size="sm"
              onPress={logout}
            >
              Logout
            </Button>
          </View>
        </View>

        {/* Status Card */}
        <Card style={styles.cardMargin}>
          <CardHeader>
            <View style={styles.cardHeaderRow}>
              <CardTitle>Tracking Status</CardTitle>
              <Badge variant={getStatusBadgeVariant(locationStatus)}>
                {getStatusText(locationStatus)}
              </Badge>
            </View>
          </CardHeader>
          <CardContent>
            <View style={styles.infoRows}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Background Task</Text>
                <Text style={styles.infoValue}>{LOCATION_TASK_NAME}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Tracking Active</Text>
                <Text style={styles.infoValue}>
                  {locationTrackingDetails.isTracking ? 'Yes' : 'No'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Task Registered</Text>
                <Text style={styles.infoValue}>
                  {locationTrackingDetails.isTaskRegistered ? 'Yes' : 'No'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Heartbeat Active</Text>
                <Text style={styles.infoValue}>
                  {locationTrackingDetails.isHeartbeatRegistered ? 'Yes' : 'No'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Background Permission</Text>
                <Text style={styles.infoValue}>
                  {locationTrackingDetails.hasBackgroundPermission ? 'Granted' : 'Denied'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>API Endpoint</Text>
                <Text style={[styles.infoValue, styles.apiEndpoint]} numberOfLines={1}>
                  {process.env.EXPO_PUBLIC_API_URL || 'Not configured'}
                </Text>
              </View>
              {__DEV__ && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Debug Notifications</Text>
                  <Text style={styles.infoValue}>
                    {debugNotificationsEnabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
              )}
            </View>
          </CardContent>
        </Card>

        {/* Authentication Card */}
        <Card style={styles.cardMargin}>
          <CardHeader>
            <View style={styles.cardHeaderRow}>
              <CardTitle>Authentication</CardTitle>
              <Badge variant="success">Authenticated</Badge>
            </View>
          </CardHeader>
          <CardContent>
            <View style={styles.authContent}>
              <View style={styles.authRow}>
                <Text style={styles.authLabel}>User Email</Text>
                <Text style={styles.authValue}>{user?.email || 'Not available'}</Text>
              </View>

              <View style={styles.authRow}>
                <Text style={styles.authLabel}>Auth Token (JWT):</Text>
                <View style={styles.tokenContainer}>
                  <Text style={styles.tokenText} numberOfLines={4}>
                    {token || 'No token available'}
                  </Text>
                </View>
              </View>

              <View style={styles.buttonRow}>
                <Button
                  variant="outline"
                  size="sm"
                  style={styles.buttonFlex}
                  onPress={() => {
                    console.log('Auth token copied to clipboard');
                  }}
                >
                  Copy Token
                </Button>

                <Button
                  variant="danger"
                  size="sm"
                  style={styles.buttonFlex}
                  onPress={() => {
                    console.log('Logging out...');
                    logout();
                  }}
                >
                  Logout
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Push Token Card */}
        <Card style={styles.cardMargin}>
          <CardHeader>
            <CardTitle>Push Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <View style={styles.pushContent}>
              <Text style={styles.pushLabel}>Expo Push Token:</Text>
              <View style={styles.tokenContainer}>
                <Text style={styles.tokenText} numberOfLines={3}>
                  {expoPushToken || 'Loading...'}
                </Text>
              </View>
              {expoPushToken && (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    console.log('Push token copied to clipboard');
                  }}
                >
                  Copy Push Token
                </Button>
              )}
            </View>
          </CardContent>
        </Card>

        {/* Last Notification Card */}
        {notification && (
          <Card style={styles.cardMargin}>
            <CardHeader>
              <CardTitle>Latest Notification</CardTitle>
            </CardHeader>
            <CardContent>
              <View style={styles.notificationContent}>
                <View style={styles.notificationRow}>
                  <Text style={styles.notificationLabel}>Title</Text>
                  <Text style={styles.notificationValue}>
                    {notification.request.content.title || 'No title'}
                  </Text>
                </View>
                <View style={styles.notificationRow}>
                  <Text style={styles.notificationLabel}>Body</Text>
                  <Text style={styles.notificationBody}>
                    {notification.request.content.body || 'No body'}
                  </Text>
                </View>
                {notification.request.content.data && (
                  <View style={styles.notificationRow}>
                    <Text style={styles.notificationLabel}>Data</Text>
                    <View style={styles.notificationDataContainer}>
                      <Text style={styles.notificationData}>
                        {JSON.stringify(notification.request.content.data, null, 2)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </CardContent>
        </Card>
        )}

        {/* Build Information */}
        <BuildInfo />

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Button
            variant="primary"
            style={styles.actionButton}
            onPress={async () => {
              console.log('Manual location update triggered');
              const location = await getCurrentLocationManually();
              if (location) {
                // Update tracking status after manual location
                const trackingStatus = await getLocationTrackingStatus();
                setLocationTrackingDetails(trackingStatus);
              }
            }}
          >
            📍 Get Current Location
          </Button>

          <Button
            variant="secondary"
            style={styles.actionButton}
            onPress={async () => {
              console.log('Restarting location tracking...');
              await restartLocationTracking();
              const trackingStatus = await getLocationTrackingStatus();
              setLocationTrackingDetails(trackingStatus);
            }}
          >
            🔄 Restart Location Tracking
          </Button>

          {__DEV__ && (
            <>
              <Button
                variant="outline"
                style={styles.actionButton}
                onPress={async () => {
                  await triggerHeartbeatForTesting();
                  // Update status after triggering heartbeat
                  const trackingStatus = await getLocationTrackingStatus();
                  setLocationTrackingDetails(trackingStatus);
                }}
              >
                💓 Test Heartbeat (5min)
              </Button>

              <Button
                variant={debugNotificationsEnabled ? "secondary" : "outline"}
                style={styles.actionButton}
                onPress={() => {
                  const newState = !debugNotificationsEnabled;
                  setDebugNotificationsEnabled(newState);
                  toggleDebugNotifications(newState);

                  // Send a test notification to confirm it's working
                  if (newState) {
                    sendDebugNotification(
                      '🔔 Debug Notifications Enabled',
                      'You will now receive notifications when location data is sent in the background',
                      { type: 'debug_toggle', enabled: true }
                    );
                  }
                }}
              >
                🔔 Debug Notifications: {debugNotificationsEnabled ? 'ON' : 'OFF'}
              </Button>
            </>
          )}

          <Button
            variant="outline"
            style={styles.actionButton}
            onPress={() => {
              console.log('Opening settings...');
            }}
          >
            App Settings
          </Button>

          <Button
            variant="danger"
            onPress={() => {
              console.log('Logging out user...');
              logout();
            }}
          >
            🚪 Sign Out
          </Button>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <BuildInfoFooter />
        </View>
      </ScrollView>
    </SafeAreaView>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#6b7280',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    color: '#6b7280',
  },
  cardMargin: {
    marginBottom: 24,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoRows: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: '#6b7280',
  },
  infoValue: {
    fontWeight: '500',
    color: '#111827',
  },
  apiEndpoint: {
    flex: 1,
    textAlign: 'right',
  },
  authContent: {
    gap: 16,
  },
  authRow: {
    gap: 4,
  },
  authLabel: {
    color: '#6b7280',
    fontSize: 14,
  },
  authValue: {
    fontWeight: '500',
    color: '#111827',
  },
  tokenContainer: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tokenText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#374151',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  buttonFlex: {
    flex: 1,
  },
  pushContent: {
    gap: 12,
  },
  pushLabel: {
    color: '#6b7280',
  },
  notificationContent: {
    gap: 8,
  },
  notificationRow: {
    gap: 4,
  },
  notificationLabel: {
    color: '#6b7280',
    fontSize: 14,
  },
  notificationValue: {
    fontWeight: '500',
    color: '#111827',
  },
  notificationBody: {
    color: '#111827',
  },
  notificationDataContainer: {
    backgroundColor: '#f9fafb',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 4,
  },
  notificationData: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#374151',
  },
  actionButtons: {
    gap: 12,
  },
  actionButton: {
    marginBottom: 12,
  },
  footer: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#9ca3af',
  },
});

export default Sentry.wrap(function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
});
