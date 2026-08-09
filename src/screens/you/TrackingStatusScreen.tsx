import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { useTheme } from '../../theme';
import { Icon, ListRow } from '../../ui';
import { isAdminUser } from '../../../utils/adminUtils';

// Import services (port of components/HomeScreen.js)
import { LocationService, LocationSyncService, LoggingService } from '../../../services';

// Import components
import { BuildInfo } from '../../../components/BuildInfo';

// Import hooks and contexts
import { useAuth } from '../../../AuthContext';
import { useAppState } from '../../../contexts';
import { useLocationTracking } from '../../../hooks';
import { handleAsyncOperation, createErrorHandler } from '../../../utils';

// Debug notifications configuration
const DEBUG_NOTIFICATIONS = true;
let ENABLE_LOCATION_DEBUG_NOTIFICATIONS = true;

// Helper function to send debug notifications
async function sendDebugNotification(title: string, body: string, data: Record<string, any> = {}) {
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
          source: 'expo_location_debug',
        },
        sound: 'default',
      },
      trigger: null, // Send immediately
    });
    console.log('[DEBUG] Notification sent:', title, body);
  } catch (error) {
    console.error('[DEBUG] Failed to send notification:', error);
  }
}

// Function to toggle debug notifications
function toggleDebugNotifications(enabled: boolean) {
  ENABLE_LOCATION_DEBUG_NOTIFICATIONS = enabled;
  console.log('[DEBUG] Location debug notifications:', enabled ? 'ENABLED' : 'DISABLED');
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
      permissionStatus: status.permissionsGranted ? 'granted' : 'denied',
    };
  } catch (error) {
    console.error('Failed to get location tracking status:', error);
    return {
      isTracking: false,
      isTaskRegistered: false,
      hasBackgroundPermission: false,
      permissionStatus: 'unknown',
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
      level: 'info',
    });
  } catch (error) {
    console.error('Failed to stop location tracking:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'location_tracking',
        error_type: 'stop_tracking_error',
      },
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
      action: 'request_started',
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
      manual_request: true,
    });

    // Send location immediately to backend
    try {
      LoggingService.info('Sending manual location to backend', {
        event_type: 'backend_sync',
        action: 'manual_sync_started',
      });

      await LocationSyncService.syncNow('manual_location_request');

      LoggingService.sync('manual_sync_success', {
        trigger: 'manual_location_button',
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });

      console.log('Manual location sent to backend successfully');
    } catch (syncError: any) {
      LoggingService.error('Failed to sync manual location to backend', syncError, {
        event_type: 'backend_sync',
        action: 'manual_sync_failed',
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      // Don't throw here, we still want to return the location
      console.error('Failed to sync manual location to backend:', syncError);
    }

    Sentry.addBreadcrumb({
      message: 'Manual location retrieved and synced',
      level: 'info',
      data: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        backend_sync_attempted: true,
      },
    });

    return location;
  } catch (error: any) {
    LoggingService.error('Failed to get current location', error, {
      event_type: 'manual_location',
      action: 'request_failed',
    });

    console.error('Failed to get current location:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'location_tracking',
        error_type: 'manual_location_error',
      },
    });
    throw error;
  }
}

async function startLocationTracking() {
  try {
    const success = await LocationService.startTracking();
    if (success) {
      console.log('Expo Location service started successfully');
      Sentry.addBreadcrumb({
        message: 'Location tracking started with Expo Location',
        level: 'info',
      });
    } else {
      throw new Error('Failed to start location tracking');
    }
  } catch (error) {
    console.error('Failed to start location tracking:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'location_tracking',
        error_type: 'start_error',
      },
    });
    throw error;
  }
}

type LocationStatus = 'checking' | 'active' | 'denied';

export function TrackingStatusScreen() {
  const { colors, spacing, type, radii } = useTheme();
  const insets = useSafeAreaInsets();

  // State management (port of components/HomeScreen.js)
  const [debugNotificationsEnabled, setDebugNotificationsEnabled] = useState(ENABLE_LOCATION_DEBUG_NOTIFICATIONS);
  const [error, setError] = useState<string | null>(null);
  const [locationTrackingDetails, setLocationTrackingDetails] = useState({
    isTracking: false,
    isTaskRegistered: false,
    hasBackgroundPermission: false,
    permissionStatus: 'unknown',
  });
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('checking');

  const { user } = useAuth();
  const showDebug = isAdminUser(user);
  const { isOnline, syncStatus, lastSyncTime, locationPermission, isTrackingLocation } = useAppState();
  const {
    startTracking,
    loading: locationLoading,
    error: locationError,
  } = useLocationTracking();

  // Create error handler for this component
  createErrorHandler('TrackingStatusScreen');

  useEffect(() => {
    const initializeLocationTracking = async () => {
      try {
        const trackingStatus = await getLocationTrackingStatus();
        setLocationTrackingDetails(trackingStatus);

        const result = await handleAsyncOperation(
          async () => await startTracking(),
          {
            onError: (error: any, userMessage: string) => {
              setError(userMessage);
              console.error('Location initialization failed:', error);
            },
            errorContext: { operation: 'initialize_location_tracking' },
          }
        );

        if (result.success) {
          console.log('Location tracking initialized successfully');
          const updatedStatus = await getLocationTrackingStatus();
          setLocationTrackingDetails(updatedStatus);
        }
      } catch (error) {
        console.error('Failed to get location tracking status:', error);
      }
    };

    if (user && !isTrackingLocation) {
      initializeLocationTracking();
    }

    // Set user context for Sentry with location tracking info
    Sentry.setUser({
      id: user?.id?.toString() || 'unknown',
      email: user?.email,
      username: 'location_tracker_user',
    });

    // Add app context
    Sentry.setTag('app_section', 'location_tracking');
    Sentry.setContext('app_info', {
      location_permissions_requested: true,
      background_task: LOCATION_TASK_NAME,
      api_endpoint: process.env.EXPO_PUBLIC_API_URL + '/users/locations',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Update location status based on tracking details
  useEffect(() => {
    if (locationTrackingDetails.hasBackgroundPermission && locationTrackingDetails.isTracking) {
      setLocationStatus('active');
    } else if (!locationTrackingDetails.hasBackgroundPermission) {
      setLocationStatus('denied');
    } else {
      setLocationStatus('checking');
    }
  }, [locationTrackingDetails]);

  const statusMeta: Record<LocationStatus, { icon: any; color: string; bg: string; text: string }> = {
    active: { icon: 'crosshairs-gps', color: colors.success, bg: colors.successSoft, text: 'Location tracking active' },
    denied: { icon: 'map-marker-off', color: colors.danger, bg: colors.dangerSoft, text: 'Location access denied' },
    checking: { icon: 'timer-sand', color: colors.warning, bg: colors.warningSoft, text: 'Checking permissions…' },
  };
  const status = statusMeta[locationStatus];

  const handleGetCurrentLocation = async () => {
    console.log('Manual location update triggered');
    try {
      LoggingService.info('Get Current Location button pressed', {
        event_type: 'user_interaction',
        button: 'get_current_location',
      });

      const location = await getCurrentLocationManually();
      if (location) {
        sendDebugNotification(
          'Location retrieved & sent',
          `Lat: ${location.coords.latitude.toFixed(6)}, Lng: ${location.coords.longitude.toFixed(6)}\nAccuracy: ${location.coords.accuracy}m\nSent to backend successfully`,
          {
            type: 'manual_location_success',
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            backend_synced: true,
          }
        );

        const trackingStatus = await getLocationTrackingStatus();
        setLocationTrackingDetails(trackingStatus);
      }
    } catch (error: any) {
      LoggingService.error('Get Current Location button failed', error, {
        event_type: 'user_interaction',
        button: 'get_current_location',
        error_message: error?.message,
      });

      sendDebugNotification(
        'Location request failed',
        `Failed to get location: ${error?.message}`,
        {
          type: 'manual_location_error',
          error: error?.message,
        }
      );
    }
  };

  const handleRestartTracking = async () => {
    console.log('Restarting location tracking...');
    await restartLocationTracking();
    const trackingStatus = await getLocationTrackingStatus();
    setLocationTrackingDetails(trackingStatus);
  };

  const handleToggleDebugNotifications = (newState: boolean) => {
    setDebugNotificationsEnabled(newState);
    toggleDebugNotifications(newState);

    if (newState) {
      sendDebugNotification(
        'Debug notifications enabled',
        'You will now receive notifications when location data is sent in the background',
        { type: 'debug_toggle', enabled: true }
      );
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
    >
      {/* Overall status banner */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: status.bg,
        borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.lg,
      }}>
        <Icon name={status.icon} size={20} color={status.color} />
        <Text style={[type.bodyBold, { color: status.color, marginLeft: spacing.sm }]}>{status.text}</Text>
        {locationLoading ? (
          <ActivityIndicator size="small" color={status.color} style={{ marginLeft: spacing.sm }} />
        ) : null}
      </View>

      {/* Error banner */}
      {error || locationError ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dangerSoft,
          borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.lg,
        }}>
          <Text style={[type.caption, { flex: 1, color: colors.danger }]}>{error || locationError}</Text>
          <Pressable onPress={() => setError(null)} accessibilityRole="button">
            <Text style={[type.caption, { color: colors.danger, fontWeight: '700', marginLeft: spacing.md }]}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Tracking detail rows */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, paddingVertical: spacing.xs, marginBottom: spacing.lg }}>
        <ListRow icon="wifi" title="Network"
          right={<Text style={[type.body, { color: colors.textSecondary }]}>{isOnline ? 'Online' : 'Offline'}</Text>} />
        <ListRow icon="shield-check-outline" title="Location permission"
          right={<Text style={[type.body, { color: colors.textSecondary }]}>
            {locationPermission === null ? 'Checking…' : locationPermission ? 'Granted (Always)' : 'Denied'}
          </Text>} />
        <ListRow icon="crosshairs-gps" title="Tracking active"
          right={<Text style={[type.body, { color: colors.textSecondary }]}>{locationTrackingDetails.isTracking ? 'Yes' : 'No'}</Text>} />
        <ListRow icon="cog-outline" title="Task registered"
          right={<Text style={[type.body, { color: colors.textSecondary }]}>{locationTrackingDetails.isTaskRegistered ? 'Yes' : 'No'}</Text>} />
        <ListRow icon="shield-lock-outline" title="Background permission"
          right={<Text style={[type.body, { color: colors.textSecondary }]}>{locationTrackingDetails.hasBackgroundPermission ? 'Granted' : 'Denied'}</Text>} />
        <ListRow icon="sync" title="Data sync"
          subtitle={lastSyncTime ? `Synced ${lastSyncTime.toLocaleTimeString()}` : syncStatus === 'syncing' ? 'Syncing…' : 'Waiting for data…'}
          right={<Text style={[type.body, { color: colors.textSecondary }]}>{syncStatus}</Text>} />
        <ListRow icon="server-network" title="API endpoint"
          subtitle={process.env.EXPO_PUBLIC_API_URL || 'Not configured'} />
        {showDebug ? (
          <ListRow icon="bell-outline" title="Debug notifications"
            subtitle="Local notifications for location/sync events"
            right={
              <Switch
                value={debugNotificationsEnabled}
                onValueChange={handleToggleDebugNotifications}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor={debugNotificationsEnabled ? colors.primary : colors.surfaceAlt}
              />
            } />
        ) : null}
      </View>

      {/* Actions */}
      <Pressable
        onPress={handleGetCurrentLocation}
        style={{
          backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md,
          alignItems: 'center', marginBottom: spacing.md,
        }}
      >
        <Text style={[type.bodyBold, { color: colors.onPrimary }]}>Get Current Location</Text>
      </Pressable>

      <Pressable
        onPress={handleRestartTracking}
        style={{
          backgroundColor: colors.surfaceAlt, borderRadius: radii.md, paddingVertical: spacing.md,
          alignItems: 'center', marginBottom: spacing.xl,
        }}
      >
        <Text style={[type.bodyBold, { color: colors.textPrimary }]}>Restart Location Tracking</Text>
      </Pressable>

      {/* Build information */}
      <BuildInfo style={undefined} />

      {Constants.expoConfig?.extra?.buildProfile !== 'production' ? (
        <Text style={[type.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>
          Build profile: {Constants.expoConfig?.extra?.buildProfile || 'dev'}
        </Text>
      ) : null}
    </ScrollView>
  );
}
