import LocationCacheService from './LocationCacheService';
import ClientTimelineProcessor from './ClientTimelineProcessor';
import SmartGeocodingService from './SmartGeocodingService';
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
        this.syncHeartbeats(authToken),
        this.syncHybridTimeline(authToken),
        this.syncGeocodeRequests(authToken)
      ]);

      const locationResult = results[0];
      const heartbeatResult = results[1];
      const timelineResult = results[2];
      const geocodeResult = results[3];

      const totalSynced = locationResult.synced + heartbeatResult.synced + timelineResult.synced + geocodeResult.synced;
      const hasErrors = locationResult.errors > 0 || heartbeatResult.errors > 0 || timelineResult.errors > 0 || geocodeResult.errors > 0;

      if (totalSynced > 0) {
        this.consecutiveFailures = 0;
        console.log(`✅ Sync completed: ${locationResult.synced} locations, ${heartbeatResult.synced} heartbeats, ${timelineResult.synced} timeline insights, ${geocodeResult.synced} geocodes`);
        
        Sentry.addBreadcrumb({
          message: `Hybrid sync completed: ${totalSynced} items`,
          level: 'info',
          data: { reason, locationResult, heartbeatResult, timelineResult, geocodeResult }
        });
      }

      // Schedule next sync
      this.scheduleNextSync();

      return {
        success: !hasErrors,
        reason: 'completed',
        locationResult,
        heartbeatResult,
        timelineResult,
        geocodeResult,
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
   * Sync hybrid timeline insights to server
   */
  async syncHybridTimeline(authToken) {
    const result = { synced: 0, errors: 0, details: [] };

    try {
      // Process recent locations into timeline segments
      const recentSegments = await ClientTimelineProcessor.processRecentLocations(2); // Last 2 hours
      
      if (recentSegments.length === 0) {
        return result;
      }

      console.log(`🧠 Syncing ${recentSegments.length} client timeline insights...`);

      // Get recent raw locations for context
      const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      const rawLocations = await LocationCacheService.db.getAllAsync(`
        SELECT * FROM cached_locations 
        WHERE timestamp >= ? 
        ORDER BY timestamp ASC
      `, [Math.floor(cutoffTime / 1000)]);

      if (rawLocations.length === 0) {
        return result;
      }

      // Build hybrid payload
      const hybridPayload = {
        type: 'hybrid_timeline_batch',
        source: 'client_timeline_processor',
        timestamp: Date.now(),
        raw_locations: rawLocations.slice(0, 200).map(row => ({ // Limit to 200 locations
          uuid: row.uuid,
          latitude: row.latitude,
          longitude: row.longitude,
          accuracy: row.accuracy,
          speed: row.speed,
          timestamp: row.timestamp * 1000,
          is_moving: Boolean(row.is_moving),
          activity: row.activity_type ? {
            type: row.activity_type,
            confidence: row.activity_confidence
          } : null
        })),
        client_insights: {
          segments: recentSegments.map(segment => ({
            type: segment.type,
            start_time: segment.startTime,
            end_time: segment.endTime,
            center_latitude: segment.centerLat,
            center_longitude: segment.centerLon,
            confidence_score: segment.confidence,
            location_count: segment.locationCount,
            distance_km: segment.distance || 0,
            detection_method: segment.detectedViaNonlinear ? 'nonlinear_area' : 'area_based',
            transportation_mode: segment.transportationMode || null,
            place_name: segment.placeName || null,
            place_address: segment.placeAddress || null
          })),
          processing_stats: {
            total_locations_processed: rawLocations.length,
            segments_created: recentSegments.length,
            visits: recentSegments.filter(s => s.type === 'visit').length,
            travels: recentSegments.filter(s => s.type === 'travel').length,
            avg_confidence: recentSegments.reduce((sum, s) => sum + s.confidence, 0) / recentSegments.length,
            processing_time_range: {
              start: Math.min(...rawLocations.map(r => r.timestamp * 1000)),
              end: Math.max(...rawLocations.map(r => r.timestamp * 1000))
            }
          }
        }
      };

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/users/hybrid_timeline`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(hybridPayload),
        signal: createAbortSignalWithTimeout(45000) // 45 second timeout for larger payload
      });

      if (response.ok) {
        // Mark timeline segments as synced
        const segmentIds = recentSegments.map(s => s.id).filter(id => id);
        if (segmentIds.length > 0) {
          await LocationCacheService.db.runAsync(`
            UPDATE local_timeline_segments 
            SET synced = 1, updated_at = strftime('%s', 'now')
            WHERE id IN (${segmentIds.map(() => '?').join(',')})
          `, segmentIds);
        }
        
        result.synced = recentSegments.length;
        result.details.push(`Successfully synced ${recentSegments.length} timeline insights`);
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        result.errors++;
        result.details.push(`HTTP ${response.status}: ${errorText}`);
        console.warn(`🧠 Hybrid timeline sync failed: HTTP ${response.status}`, errorText);
      }

    } catch (error) {
      result.errors++;
      result.details.push(`Exception: ${error.message}`);
      console.error('🧠 Hybrid timeline sync exception:', error);
    }

    return result;
  }

  /**
   * Sync pending geocoding requests to server
   */
  async syncGeocodeRequests(authToken) {
    const result = { synced: 0, errors: 0, details: [] };

    try {
      const pendingRequests = await SmartGeocodingService.getPendingGeocodeRequests(10);
      
      if (pendingRequests.length === 0) {
        return result;
      }

      console.log(`📍 Syncing ${pendingRequests.length} geocoding requests...`);

      // Batch geocoding requests
      const geocodePayload = {
        type: 'batch_geocode_request',
        source: 'mobile_app',
        timestamp: Date.now(),
        requests: pendingRequests.map(req => ({
          id: req.id,
          latitude: req.latitude,
          longitude: req.longitude,
          timeline_segment_id: req.timelineSegmentId,
          priority: req.priority,
          requested_at: req.requestedAt.toISOString()
        }))
      };

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/users/geocode_batch`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(geocodePayload),
        signal: createAbortSignalWithTimeout(30000)
      });

      if (response.ok) {
        const responseData = await response.json();
        
        // Process geocoding results if provided immediately
        if (responseData.results && responseData.results.length > 0) {
          for (const geocodeResult of responseData.results) {
            await SmartGeocodingService.processServerGeocodeResponse(
              geocodeResult.request_id,
              geocodeResult.location_data
            );
          }
        } else {
          // Mark requests as processing if server will handle them asynchronously
          const requestIds = pendingRequests.map(req => req.id);
          if (requestIds.length > 0) {
            await LocationCacheService.db.runAsync(`
              UPDATE geocoding_queue 
              SET status = 'processing', last_attempt_at = strftime('%s', 'now')
              WHERE id IN (${requestIds.map(() => '?').join(',')})
            `, requestIds);
          }
        }
        
        result.synced = pendingRequests.length;
        result.details.push(`Successfully synced ${pendingRequests.length} geocoding requests`);
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        result.errors++;
        result.details.push(`HTTP ${response.status}: ${errorText}`);
        console.warn(`📍 Geocoding sync failed: HTTP ${response.status}`, errorText);
      }

    } catch (error) {
      result.errors++;
      result.details.push(`Exception: ${error.message}`);
      console.error('📍 Geocoding sync exception:', error);
    }

    return result;
  }

  /**
   * Perform maintenance tasks (cleanup, etc.)
   */
  async performMaintenance() {
    try {
      console.log('🧹 Performing maintenance...');
      
      // Clean up old synced data (keep 30 days)
      const cleanupResult = await LocationCacheService.cleanupOldData(30);
      
      // Clean up geocoding cache
      const geocodeCleanup = await SmartGeocodingService.cleanupExpiredData();
      
      console.log(`🧹 Maintenance completed: cleaned ${cleanupResult.locationsDeleted + cleanupResult.heartbeatsDeleted} location records, ${geocodeCleanup.geocodesDeleted + geocodeCleanup.requestsDeleted} geocoding records`);
      
      return {
        ...cleanupResult,
        geocodesDeleted: geocodeCleanup.geocodesDeleted,
        geocodeRequestsDeleted: geocodeCleanup.requestsDeleted
      };
    } catch (error) {
      console.error('🧹 Maintenance failed:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_sync', error_type: 'maintenance_error' }
      });
      return { locationsDeleted: 0, heartbeatsDeleted: 0, geocodesDeleted: 0, geocodeRequestsDeleted: 0 };
    }
  }

  /**
   * Trigger intelligent timeline processing and sync
   */
  async processAndSyncTimeline(options = {}) {
    try {
      const hoursBack = options.hoursBack || 4;
      console.log(`🧠 Processing timeline for last ${hoursBack} hours...`);
      
      // Process recent locations into timeline segments
      const segments = await ClientTimelineProcessor.processRecentLocations(hoursBack);
      
      // Geocode visits for better place recognition
      const geocodedSegments = [];
      for (const segment of segments) {
        if (segment.type === 'visit') {
          const geocoded = await SmartGeocodingService.geocodeTimelineSegment(segment);
          geocodedSegments.push(geocoded);
        } else {
          geocodedSegments.push(segment);
        }
      }
      
      console.log(`✅ Processed ${segments.length} timeline segments (${segments.filter(s => s.type === 'visit').length} visits, ${segments.filter(s => s.type === 'travel').length} travels)`);
      
      // Trigger sync if we have network and auth
      const networkState = await Network.getNetworkStateAsync();
      const authToken = await getAuthTokenForBackgroundTask();
      
      if (networkState.isConnected && authToken) {
        await this.syncNow('timeline_processing');
      }
      
      return geocodedSegments;
      
    } catch (error) {
      console.error('❌ Timeline processing and sync failed:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_sync', error_type: 'timeline_processing_error' }
      });
      return [];
    }
  }
}

// Export singleton instance
export default new LocationSyncService();