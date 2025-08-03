import LocationCacheService from './LocationCacheService';
import { getAuthTokenForBackgroundTask } from '../AuthContext';
import * as Sentry from '@sentry/react-native';
import * as Network from 'expo-network';

// React Native compatible timeout implementation
const createAbortSignalWithTimeout = (timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  // Clean up timeout if request completes normally
  const originalSignal = controller.signal;
  const cleanup = () => clearTimeout(timeoutId);
  originalSignal.addEventListener('abort', cleanup, { once: true });
  
  return controller.signal;
};

/**
 * LocationSyncService - Handles syncing cached location data to server
 * 
 * Features:
 * - Intelligent batching and retry logic
 * - Network-aware syncing (respects connectivity)
 * - Activity-based sync intervals
 * - Graceful error handling and recovery
 */
class LocationSyncService {
  constructor() {
    this.syncInProgress = false;
    this.lastSyncAttempt = null;
    this.consecutiveFailures = 0;
    this.maxRetries = 3;
    this.baseRetryDelay = 1000; // 1 second
    
    // Activity-based sync intervals (in milliseconds)
    this.syncIntervals = {
      stationary: 5 * 60 * 1000,    // 5 minutes when not moving
      walking: 2 * 60 * 1000,       // 2 minutes when walking
      vehicle: 30 * 1000,           // 30 seconds when in vehicle
      unknown: 3 * 60 * 1000,       // 3 minutes default
      immediate: 0                  // Immediate sync for important events
    };
    
    // Auto-sync timer
    this.syncTimer = null;
    this.currentActivity = 'unknown';
  }

  /**
   * Start automatic syncing based on activity
   */
  startAutoSync(initialActivity = 'unknown') {
    this.currentActivity = initialActivity;
    this.scheduleNextSync();
    console.log(`🔄 Auto-sync started with activity: ${initialActivity}`);
  }

  /**
   * Stop automatic syncing
   */
  stopAutoSync() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    console.log('⏹️ Auto-sync stopped');
  }

  /**
   * Update activity and reschedule sync if needed
   */
  updateActivity(newActivity) {
    if (this.currentActivity !== newActivity) {
      console.log(`🎯 Activity changed: ${this.currentActivity} → ${newActivity}`);
      this.currentActivity = newActivity;
      
      // Reschedule sync with new interval
      if (this.syncTimer) {
        this.stopAutoSync();
        this.scheduleNextSync();
      }
      
      // Immediate sync for important activity changes
      if (newActivity === 'vehicle' || (this.currentActivity === 'stationary' && newActivity !== 'stationary')) {
        this.syncNow('activity_change');
      }
    }
  }

  /**
   * Schedule the next sync based on current activity
   */
  scheduleNextSync() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    const interval = this.syncIntervals[this.currentActivity] || this.syncIntervals.unknown;
    
    this.syncTimer = setTimeout(() => {
      this.syncNow('scheduled');
    }, interval);

    console.log(`⏰ Next sync scheduled in ${Math.round(interval / 1000)}s (${this.currentActivity})`);
  }

  /**
   * Force immediate sync
   */
  async syncNow(reason = 'manual') {
    if (this.syncInProgress) {
      console.log('⏳ Sync already in progress, skipping...');
      return { success: false, reason: 'sync_in_progress' };
    }

    console.log(`🚀 Starting sync (reason: ${reason})`);
    this.syncInProgress = true;
    this.lastSyncAttempt = Date.now();

    try {
      // Check network connectivity
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected) {
        console.log('📶 No network connection, postponing sync');
        return { success: false, reason: 'no_network' };
      }

      // Get auth token
      const authToken = await getAuthTokenForBackgroundTask();
      if (!authToken) {
        console.log('🔐 No auth token available, postponing sync');
        return { success: false, reason: 'no_auth_token' };
      }

      const results = await Promise.all([
        this.syncLocations(authToken),
        this.syncHeartbeats(authToken)
      ]);

      const locationResult = results[0];
      const heartbeatResult = results[1];

      const totalSynced = locationResult.synced + heartbeatResult.synced;
      const hasErrors = locationResult.errors > 0 || heartbeatResult.errors > 0;

      if (totalSynced > 0) {
        this.consecutiveFailures = 0;
        console.log(`✅ Sync completed: ${locationResult.synced} locations, ${heartbeatResult.synced} heartbeats`);
        
        Sentry.addBreadcrumb({
          message: `Location sync completed: ${totalSynced} items`,
          level: 'info',
          data: { reason, locationResult, heartbeatResult }
        });
      }

      // Schedule next sync
      this.scheduleNextSync();

      return {
        success: !hasErrors,
        reason: 'completed',
        locationResult,
        heartbeatResult,
        totalSynced
      };

    } catch (error) {
      this.consecutiveFailures++;
      console.error(`❌ Sync failed (attempt ${this.consecutiveFailures}):`, error);
      
      Sentry.captureException(error, {
        tags: { 
          section: 'location_sync', 
          error_type: 'sync_error',
          consecutive_failures: this.consecutiveFailures 
        },
        extra: { reason }
      });

      // Exponential backoff for retries
      const retryDelay = this.baseRetryDelay * Math.pow(2, Math.min(this.consecutiveFailures - 1, 5));
      setTimeout(() => this.scheduleNextSync(), retryDelay);

      return { success: false, reason: 'sync_error', error: error.message };

    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync cached locations to server
   */
  async syncLocations(authToken) {
    const result = { synced: 0, errors: 0, details: [] };

    try {
      const unsyncedLocations = await LocationCacheService.getUnsyncedLocations(50);
      if (unsyncedLocations.length === 0) {
        return result;
      }

      console.log(`📤 Syncing ${unsyncedLocations.length} locations...`);

      // Batch upload locations
      const batchData = {
        type: 'location_batch',
        source: 'location_cache_sync',
        count: unsyncedLocations.length,
        locations: unsyncedLocations.map(loc => ({
          uuid: loc.uuid,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          altitude: loc.coords.altitude,
          altitude_accuracy: loc.coords.altitudeAccuracy,
          speed: loc.coords.speed,
          heading: loc.coords.heading,
          recorded_at: loc.recorded_at,
          time_zone: loc.time_zone,
          is_moving: loc.is_moving,
          activity: loc.activity,
          battery: loc.battery,
          payload: loc.payload
        }))
      };

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/users/locations`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(batchData),
        signal: createAbortSignalWithTimeout(30000) // 30 second timeout
      });

      if (response.ok) {
        const syncedIds = unsyncedLocations.map(loc => loc.id);
        await LocationCacheService.markLocationsSynced(syncedIds);
        result.synced = unsyncedLocations.length;
        result.details.push(`Successfully synced ${unsyncedLocations.length} locations`);
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        result.errors++;
        result.details.push(`HTTP ${response.status}: ${errorText}`);
        console.warn(`📤 Location sync failed: HTTP ${response.status}`, errorText);
      }

    } catch (error) {
      result.errors++;
      result.details.push(`Exception: ${error.message}`);
      console.error('📤 Location sync exception:', error);
    }

    return result;
  }

  /**
   * Sync cached heartbeats to server
   */
  async syncHeartbeats(authToken) {
    const result = { synced: 0, errors: 0, details: [] };

    try {
      const unsyncedHeartbeats = await LocationCacheService.getUnsyncedHeartbeats(20);
      if (unsyncedHeartbeats.length === 0) {
        return result;
      }

      console.log(`💓 Syncing ${unsyncedHeartbeats.length} heartbeats...`);

      for (const heartbeat of unsyncedHeartbeats) {
        try {
          const heartbeatData = {
            type: 'heartbeat',
            source: 'heartbeat_cache_sync',
            timestamp: new Date(heartbeat.timestamp).toISOString(),
            battery: heartbeat.battery,
            activity: heartbeat.activity,
            odometer: heartbeat.odometer,
            is_moving: heartbeat.is_moving,
            tracking_enabled: heartbeat.tracking_enabled,
            payload: heartbeat.payload
          };

          const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/users/locations`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(heartbeatData),
            signal: createAbortSignalWithTimeout(10000) // 10 second timeout
          });

          if (response.ok) {
            await LocationCacheService.markHeartbeatsSynced([heartbeat.id]);
            result.synced++;
          } else {
            result.errors++;
            const errorText = await response.text().catch(() => 'Unknown error');
            console.warn(`💓 Heartbeat sync failed: HTTP ${response.status}`, errorText);
          }
        } catch (error) {
          result.errors++;
          console.error('💓 Heartbeat sync exception:', error);
        }
      }

    } catch (error) {
      result.errors++;
      result.details.push(`Exception: ${error.message}`);
      console.error('💓 Heartbeat sync exception:', error);
    }

    return result;
  }

  /**
   * Get sync status and statistics
   */
  async getSyncStatus() {
    const cacheStats = await LocationCacheService.getCacheStats();
    
    return {
      syncInProgress: this.syncInProgress,
      lastSyncAttempt: this.lastSyncAttempt,
      consecutiveFailures: this.consecutiveFailures,
      currentActivity: this.currentActivity,
      nextSyncInterval: this.syncIntervals[this.currentActivity] || this.syncIntervals.unknown,
      cacheStats
    };
  }

  /**
   * Perform maintenance tasks (cleanup, etc.)
   */
  async performMaintenance() {
    try {
      console.log('🧹 Performing maintenance...');
      
      // Clean up old synced data (keep 30 days)
      const cleanupResult = await LocationCacheService.cleanupOldData(30);
      
      console.log(`🧹 Maintenance completed: cleaned ${cleanupResult.locationsDeleted + cleanupResult.heartbeatsDeleted} records`);
      
      return cleanupResult;
    } catch (error) {
      console.error('🧹 Maintenance failed:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_sync', error_type: 'maintenance_error' }
      });
      return { locationsDeleted: 0, heartbeatsDeleted: 0 };
    }
  }
}

// Export singleton instance
export default new LocationSyncService();