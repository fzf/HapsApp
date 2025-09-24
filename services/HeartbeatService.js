import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LocationCacheService from './LocationCacheService';
import LocationSyncService from './LocationSyncService';
import { getAuthTokenForBackgroundTask } from '../AuthContext';
import LoggingService from './LoggingService';
import * as Sentry from '@sentry/react-native';
import * as Network from 'expo-network';

import { HEARTBEAT_TASK_NAME } from '../taskDefinitions';
const HEARTBEAT_STORAGE_KEY = '@haps_last_heartbeat';
const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * HeartbeatService - Guarantees location is sent every 30 minutes
 *
 * This service ensures that regardless of activity state or other sync intervals,
 * the user's location is captured and sent to the server at least every 30 minutes.
 * This is critical for maintaining location continuity and detecting if the app
 * stops tracking properly.
 *
 * Features:
 * - Guaranteed 30-minute interval regardless of user activity
 * - Background task execution using Expo TaskManager
 * - Fallback location capture if regular tracking fails
 * - Persistent storage of last heartbeat time
 * - Integration with existing location caching and sync systems
 */
class HeartbeatService {
  constructor() {
    this.isActive = false;
    this.lastHeartbeatTime = null;
    this.heartbeatTimer = null;
    this.initialize();
  }

  async initialize() {
    try {
      // Load last heartbeat time from storage
      await this.loadLastHeartbeatTime();

      // Background heartbeat task is pre-defined in taskDefinitions.js

      console.log('✅ HeartbeatService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize HeartbeatService:', error);
      Sentry.captureException(error, {
        tags: { section: 'heartbeat_service', error_type: 'initialization_error' }
      });
    }
  }


  async loadLastHeartbeatTime() {
    try {
      const stored = await AsyncStorage.getItem(HEARTBEAT_STORAGE_KEY);
      if (stored) {
        this.lastHeartbeatTime = parseInt(stored, 10);
        console.log(`📱 Loaded last heartbeat time: ${new Date(this.lastHeartbeatTime).toLocaleString()}`);
      }
    } catch (error) {
      console.error('❌ Failed to load last heartbeat time:', error);
      this.lastHeartbeatTime = null;
    }
  }

  async saveLastHeartbeatTime(timestamp) {
    try {
      this.lastHeartbeatTime = timestamp;
      await AsyncStorage.setItem(HEARTBEAT_STORAGE_KEY, timestamp.toString());
    } catch (error) {
      console.error('❌ Failed to save last heartbeat time:', error);
    }
  }

  async startHeartbeat() {
    if (this.isActive) {
      console.log('💓 Heartbeat already active');
      return true;
    }

    try {
      // Register the background task with 30-minute interval
      await BackgroundTask.registerTaskAsync(HEARTBEAT_TASK_NAME, {
        minimumInterval: Math.max(15, HEARTBEAT_INTERVAL_MS / 60000), // Convert to minutes, minimum 15 minutes
      });

      // Start immediate heartbeat timer as backup
      this.startHeartbeatTimer();

      // Execute initial heartbeat if needed
      await this.checkAndExecuteHeartbeat();

      this.isActive = true;
      console.log('✅ Heartbeat service started with 30-minute guarantee');

      Sentry.addBreadcrumb({
        message: 'Heartbeat service started',
        level: 'info'
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to start heartbeat service:', error);
      Sentry.captureException(error, {
        tags: { section: 'heartbeat_service', error_type: 'start_error' }
      });
      return false;
    }
  }

  async stopHeartbeat() {
    try {
      // Try to unregister the task (will silently fail if not registered)
      try {
        await BackgroundTask.unregisterTaskAsync(HEARTBEAT_TASK_NAME);
      } catch (unregisterError) {
        // Ignore errors if task was not registered
        console.log('📝 Background task was not registered or already unregistered');
      }

      this.stopHeartbeatTimer();

      this.isActive = false;
      console.log('⏹️ Heartbeat service stopped');

      Sentry.addBreadcrumb({
        message: 'Heartbeat service stopped',
        level: 'info'
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to stop heartbeat service:', error);
      Sentry.captureException(error, {
        tags: { section: 'heartbeat_service', error_type: 'stop_error' }
      });
      return false;
    }
  }

  startHeartbeatTimer() {
    this.stopHeartbeatTimer(); // Clear any existing timer

    // Set up a timer that runs every 30 minutes as backup
    this.heartbeatTimer = setInterval(() => {
      this.checkAndExecuteHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    console.log('⏰ Heartbeat timer started (30-minute intervals)');
  }

  stopHeartbeatTimer() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async checkAndExecuteHeartbeat() {
    const now = Date.now();
    const timeSinceLastHeartbeat = this.lastHeartbeatTime ? (now - this.lastHeartbeatTime) : null;

    // Execute heartbeat if it's been 30+ minutes or we have no record
    if (!timeSinceLastHeartbeat || timeSinceLastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      await this.executeHeartbeat();
      return true;
    }

    const timeUntilNext = HEARTBEAT_INTERVAL_MS - timeSinceLastHeartbeat;
    console.log(`💓 Next heartbeat in ${Math.round(timeUntilNext / 60000)} minutes`);
    return false;
  }

  async executeHeartbeat() {
    try {
      const now = Date.now();

      console.log('💓 Executing guaranteed heartbeat...');

      // Check network connectivity
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected) {
        console.log('📶 No network for heartbeat, will cache locally');
      }

      // Get current location with fallback options
      let location = null;
      let locationSource = 'unknown';

      try {
        // Try to get a fresh location
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          maximumAge: 5 * 60 * 1000, // Accept location up to 5 minutes old
        });
        locationSource = 'fresh_location';
        console.log('📍 Got fresh location for heartbeat');
      } catch (locationError) {
        console.warn('⚠️ Could not get fresh location for heartbeat:', locationError);

        // Try to get last known location
        try {
          location = await Location.getLastKnownPositionAsync({
            maxAge: 30 * 60 * 1000, // Accept location up to 30 minutes old
          });
          locationSource = 'last_known_location';
          console.log('📍 Using last known location for heartbeat');
        } catch (lastKnownError) {
          console.warn('⚠️ Could not get last known location:', lastKnownError);
          locationSource = 'no_location';
        }
      }

      // Create heartbeat data
      const heartbeatData = {
        uuid: `heartbeat-${now}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        type: 'guaranteed_heartbeat',
        interval_ms: HEARTBEAT_INTERVAL_MS,
        location_source: locationSource,
        location: location ? {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          altitude: location.coords.altitude,
          altitude_accuracy: location.coords.altitudeAccuracy,
          speed: location.coords.speed,
          heading: location.coords.heading,
          timestamp: location.timestamp
        } : null,
        activity: {
          type: 'unknown',
          confidence: 50
        },
        battery: await this.getBatteryInfo(),
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        enabled: this.isActive,
        last_heartbeat_ms_ago: this.lastHeartbeatTime ? (now - this.lastHeartbeatTime) : null
      };

      // Cache the heartbeat locally
      await LocationCacheService.cacheHeartbeat(heartbeatData);

      // Save the heartbeat time
      await this.saveLastHeartbeatTime(now);

      // Trigger immediate sync if we have network
      if (networkState.isConnected) {
        try {
          await LocationSyncService.syncNow('heartbeat_sync');
        } catch (syncError) {
          console.warn('⚠️ Heartbeat sync failed, will retry later:', syncError);
        }
      }

      console.log(`✅ Heartbeat executed successfully (source: ${locationSource})`);

      // Log to Better Stack
      LoggingService.location('guaranteed_heartbeat', {
        location_source: locationSource,
        has_location: !!location,
        latitude: location?.coords?.latitude,
        longitude: location?.coords?.longitude,
        accuracy: location?.coords?.accuracy,
        network_connected: networkState.isConnected,
        uuid: heartbeatData.uuid
      });

      Sentry.addBreadcrumb({
        message: 'Guaranteed heartbeat executed',
        level: 'info',
        data: {
          location_source: locationSource,
          has_location: !!location,
          network_connected: networkState.isConnected
        }
      });

      return {
        success: true,
        timestamp: now,
        location_source: locationSource,
        has_location: !!location
      };

    } catch (error) {
      console.error('❌ Failed to execute heartbeat:', error);

      Sentry.captureException(error, {
        tags: {
          section: 'heartbeat_service',
          error_type: 'execution_error'
        }
      });

      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  async getBatteryInfo() {
    try {
      // Note: Expo doesn't have a built-in battery API
      // This would need to be implemented with a native module
      // For now, return null
      return null;
    } catch (error) {
      return null;
    }
  }

  async getStatus() {
    const now = Date.now();
    const timeSinceLastHeartbeat = this.lastHeartbeatTime ? (now - this.lastHeartbeatTime) : null;
    const timeUntilNext = timeSinceLastHeartbeat ?
      Math.max(0, HEARTBEAT_INTERVAL_MS - timeSinceLastHeartbeat) : 0;

    return {
      isActive: this.isActive,
      intervalMs: HEARTBEAT_INTERVAL_MS,
      lastHeartbeatTime: this.lastHeartbeatTime,
      timeSinceLastHeartbeat,
      timeUntilNextHeartbeat: timeUntilNext,
      nextHeartbeatDue: timeSinceLastHeartbeat >= HEARTBEAT_INTERVAL_MS,
      isTaskRegistered: this.isActive // Use the service's isActive state as a proxy
    };
  }

  // Manual trigger for testing
  async forceHeartbeat() {
    console.log('🧪 Forcing heartbeat for testing...');
    return await this.executeHeartbeat();
  }
}

// Export singleton instance
export default new HeartbeatService();
