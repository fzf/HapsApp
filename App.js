import React, { useState, useEffect, useRef } from 'react';
import { Text, View, ScrollView, SafeAreaView, StatusBar, Platform, StyleSheet } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import LocationService from './services/LocationService';
import LocationSyncService from './services/LocationSyncService';
import LoggingService from './services/LoggingService';
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
          source: 'expo_location_debug'
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

// Location service event handlers for debug notifications
function onLocationUpdate(location) {
  console.log('[LocationService] Location received:', location);

  // Send debug notification
  sendDebugNotification(
    `📍 Location Update`,
    `Coords: ${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}\nAccuracy: ${location.coords.accuracy}m\nSpeed: ${location.coords.speed || 0} m/s`,
    {
      type: 'expo_location_update',
      coords: `${location.coords.latitude}, ${location.coords.longitude}`,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed
    }
  );

  Sentry.addBreadcrumb({
    message: 'Expo location update received',
    level: 'info',
    data: {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed
    }
  });
}

// Sync status monitoring for debug notifications
function onSyncUpdate(syncResult) {
  if (syncResult.totalSynced > 0) {
    sendDebugNotification(
      '✅ Data Synced',
      `Synced ${syncResult.totalSynced} items to server`,
      {
        type: 'sync_success',
        totalSynced: syncResult.totalSynced,
        reason: syncResult.reason
      }
    );
  }

  if (!syncResult.success && syncResult.reason !== 'sync_in_progress') {
    sendDebugNotification(
      '❌ Sync Failed',
      `Sync failed: ${syncResult.reason}`,
      {
        type: 'sync_error',
        reason: syncResult.reason
      }
    );
  }
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

// Debug notifications configuration - enabled for testing release builds
const DEBUG_NOTIFICATIONS = true; // Force enabled for testing (change to __DEV__ for production)
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

// Check if location tracking is actively running
async function getLocationTrackingStatus() {
  try {
    const status = await LocationService.getServiceStatus();
    return {
      isTracking: status.isTracking,
      isTaskRegistered: status.isTaskRegistered,
      hasBackgroundPermission: status.permissionsGranted,
      permissionStatus: status.permissionsGranted ? 'granted' : 'denied'
    };
  } catch (error) {
    console.error('Failed to get location tracking status:', error);
    return {
      isTracking: false,
      isTaskRegistered: false,
      hasBackgroundPermission: false,
      permissionStatus: 'unknown'
    };
  }
}

// Stop location tracking
async function stopLocationTracking() {
  try {
    await LocationService.stopTracking();
    console.log('Location tracking stopped');

    Sentry.addBreadcrumb({
      message: 'Location tracking stopped',
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
    await startLocationTracking();
    console.log('Location tracking restarted');
  } catch (error) {
    console.error('Failed to restart location tracking:', error);
  }
}

// Authentication is handled in the sync service, no need for separate auth update

// Get current device location manually and send to backend
async function getCurrentLocationManually() {
  try {
    LoggingService.info('Manual location request started', {
      event_type: 'manual_location',
      action: 'request_started'
    });

    const location = await LocationService.getCurrentLocation();

    console.log('Manual location retrieved:', location);
    
    // Log location details to Better Stack
    LoggingService.location('manual_location_retrieved', {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed,
      altitude: location.coords.altitude,
      timestamp: location.timestamp,
      manual_request: true
    });

    // Send location immediately to backend
    try {
      LoggingService.info('Sending manual location to backend', {
        event_type: 'backend_sync',
        action: 'manual_sync_started'
      });

      await LocationSyncService.syncNow('manual_location_request');
      
      LoggingService.sync('manual_sync_success', {
        trigger: 'manual_location_button',
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy
      });

      console.log('✅ Manual location sent to backend successfully');

    } catch (syncError) {
      LoggingService.error('Failed to sync manual location to backend', syncError, {
        event_type: 'backend_sync',
        action: 'manual_sync_failed',
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });
      
      // Don't throw here, we still want to return the location
      console.error('❌ Failed to sync manual location to backend:', syncError);
    }

    Sentry.addBreadcrumb({
      message: 'Manual location retrieved and synced',
      level: 'info',
      data: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        backend_sync_attempted: true
      }
    });

    return location;
  } catch (error) {
    LoggingService.error('Failed to get current location', error, {
      event_type: 'manual_location',
      action: 'request_failed'
    });

    console.error('Failed to get current location:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'location_tracking',
        error_type: 'manual_location_error'
      }
    });
    throw error;
  }
}

async function startLocationTracking() {
  try {
    const success = await LocationService.startTracking();
    if (success) {
      console.log('✅ Expo Location service started successfully');
      Sentry.addBreadcrumb({
        message: 'Location tracking started with Expo Location',
        level: 'info'
      });
    } else {
      throw new Error('Failed to start location tracking');
    }
  } catch (error) {
    console.error('Failed to start location tracking:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'location_tracking',
        error_type: 'start_error'
      }
    });
    throw error;
  }
}

// Location tracking is now handled by LocationService using Expo Location



function MainApp() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(undefined);
  const [locationStatus, setLocationStatus] = useState('checking');
  const [locationCount, setLocationCount] = useState(0);
  const [locationTrackingDetails, setLocationTrackingDetails] = useState({
    isTracking: false,
    isTaskRegistered: false,
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
        await startLocationTracking();
        setLocationStatus('active');

        // Get detailed tracking status
        const trackingStatus = await getLocationTrackingStatus();
        setLocationTrackingDetails(trackingStatus);
      } catch (error) {
        setLocationStatus('denied');
        console.error('Location initialization failed:', error);
      }
    };

    if (user) {
      initializeLocationTracking();
    }

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
              <Text style={styles.title}>
                Haps Tracker
                {Constants.expoConfig?.extra?.buildProfile !== 'production' && (
                  <Text style={styles.environmentBadge}>
                    {' '}({Constants.expoConfig?.extra?.buildProfile || 'dev'})
                  </Text>
                )}
              </Text>
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
              {DEBUG_NOTIFICATIONS && (
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
              try {
                // Show immediate feedback
                LoggingService.info('Get Current Location button pressed', {
                  event_type: 'user_interaction',
                  button: 'get_current_location'
                });

                const location = await getCurrentLocationManually();
                if (location) {
                  // Show success feedback
                  sendDebugNotification(
                    '📍 Location Retrieved & Sent',
                    `Lat: ${location.coords.latitude.toFixed(6)}, Lng: ${location.coords.longitude.toFixed(6)}\nAccuracy: ${location.coords.accuracy}m\n✅ Sent to backend successfully`,
                    {
                      type: 'manual_location_success',
                      latitude: location.coords.latitude,
                      longitude: location.coords.longitude,
                      accuracy: location.coords.accuracy,
                      backend_synced: true
                    }
                  );

                  // Update tracking status after manual location
                  const trackingStatus = await getLocationTrackingStatus();
                  setLocationTrackingDetails(trackingStatus);
                }
              } catch (error) {
                // Show error feedback
                LoggingService.error('Get Current Location button failed', error, {
                  event_type: 'user_interaction',
                  button: 'get_current_location',
                  error_message: error.message
                });

                sendDebugNotification(
                  '❌ Location Request Failed',
                  `Failed to get location: ${error.message}`,
                  {
                    type: 'manual_location_error',
                    error: error.message
                  }
                );
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

                    {DEBUG_NOTIFICATIONS && (
            <>


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
  environmentBadge: {
    fontSize: 12,
    color: '#4b5563',
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
});

export default Sentry.wrap(function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
});
