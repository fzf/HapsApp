import React, { useState, useEffect, useRef } from 'react';
import { Text, View, ScrollView, SafeAreaView, StatusBar, Platform, StyleSheet } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import LocationService from '../services/LocationService';
import LocationSyncService from '../services/LocationSyncService';
import LoggingService from '../services/LoggingService';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

// Import components
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';
import { BuildInfo, BuildInfoFooter } from './BuildInfo';
import { useAuth } from '../AuthContext';

// Debug notifications configuration
const DEBUG_NOTIFICATIONS = true;
let ENABLE_LOCATION_DEBUG_NOTIFICATIONS = true;

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

const LOCATION_TASK_NAME = 'background-location-task';

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

const HomeScreen = () => {
  const [locationStatus, setLocationStatus] = useState('checking');
  const [locationTrackingDetails, setLocationTrackingDetails] = useState({
    isTracking: false,
    isTaskRegistered: false,
    hasBackgroundPermission: false,
    permissionStatus: 'unknown'
  });
  const [debugNotificationsEnabled, setDebugNotificationsEnabled] = useState(ENABLE_LOCATION_DEBUG_NOTIFICATIONS);
  const { user, logout } = useAuth();

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
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <BuildInfoFooter />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
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

export default HomeScreen;
