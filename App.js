import React, { useState, useEffect, useRef } from 'react';
import { Text, View, ScrollView, SafeAreaView, StatusBar, Platform, StyleSheet } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import * as SecureStore from 'expo-secure-store';

// NativeWind styles are handled by babel plugin

// Import Flowbite-style components
import { Card, CardHeader, CardTitle, CardContent } from './components/Card';
import { Button } from './components/Button';
import { Badge } from './components/Badge';

// Import authentication components
import { AuthProvider, useAuth } from './AuthContext';
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

    // Get auth token for authenticated request
    SecureStore.getItemAsync('authToken').then(authToken => {
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      if (authToken) {
        headers['Authorization'] = authToken;
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
    }).catch((secureStoreError) => {
      console.error('Failed to get auth token from SecureStore:', secureStoreError);
      Sentry.captureException(secureStoreError, {
        tags: {
          section: 'background_location_task',
          error_type: 'auth_token_retrieval'
        }
      });
    });
  }
});

function MainApp() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(undefined);
  const [locationStatus, setLocationStatus] = useState('checking');
  const [locationCount, setLocationCount] = useState(0);
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

  useEffect(() => {
    requestLocationPermissions().then(() => {
      setLocationStatus('active');
    }).catch(() => {
      setLocationStatus('denied');
    });

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
                <Text style={styles.infoLabel}>API Endpoint</Text>
                <Text style={[styles.infoValue, styles.apiEndpoint]} numberOfLines={1}>
                  {process.env.EXPO_PUBLIC_API_URL || 'Not configured'}
                </Text>
              </View>
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

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Button
            variant="primary"
            style={styles.actionButton}
            onPress={() => {
              console.log('Manual location update triggered');
            }}
          >
            Trigger Location Update
          </Button>

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
          <Text style={styles.footerText}>
            Haps Location Tracker v1.0.0
          </Text>
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
