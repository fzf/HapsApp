import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { Platform } from 'react-native';
import LocationCacheService from './LocationCacheService';
import LocationSyncService from './LocationSyncService';
import HeartbeatService from './HeartbeatService';
import LoggingService from './LoggingService';
import VisitTrackingService from './VisitTrackingService';
import * as Sentry from '@sentry/react-native';

import { LOCATION_TASK_NAME, BACKGROUND_TASK_NAME } from '../taskDefinitions';

/**
 * LocationService - Modern location tracking using Expo Location
 * 
 * Features:
 * - Background location tracking
 * - Activity detection
 * - Local caching with SQLite
 * - Intelligent sync intervals
 * - Heartbeat functionality for stationary periods
 */
class LocationService {
  constructor() {
    this.isTracking = false;
    this.lastKnownLocation = null;
    this.lastActivityTime = Date.now();
    this.heartbeatInterval = null;
    this.currentActivity = 'unknown';
    this.permissionsGranted = false;
    
    // Activity detection thresholds
    this.activityThresholds = {
      stationary: { speed: 0.5, time: 3 * 60 * 1000 }, // 3 minutes
      walking: { speed: 7, time: 30 * 1000 }, // 30 seconds
      vehicle: { speed: 15, time: 15 * 1000 }, // 15 seconds
    };
    
    this.initialize();
  }

  async initialize() {
    try {
      // Initialize cache service
      await LocationCacheService.initialize();
      
      // Initialize visit tracking service
      await VisitTrackingService.initialize();
      
      // Background tasks are pre-defined in taskDefinitions.js
      
      console.log('✅ LocationService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize LocationService:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_service', error_type: 'initialization_error' }
      });
    }
  }


  async handleBackgroundLocations(locations) {
    if (!locations || locations.length === 0) {
      console.log('📍 No background locations to process');
      return;
    }

    console.log(`📍 Processing ${locations.length} background locations`);
    
    try {
      let processedCount = 0;
      let errorCount = 0;

      for (const location of locations) {
        try {
          await this.processLocationWithRetry(location, true);
          processedCount++;
        } catch (locationError) {
          errorCount++;
          console.error('❌ Failed to process background location:', locationError);
          Sentry.captureException(locationError, {
            tags: { section: 'location_service', error_type: 'location_processing_error' },
            extra: { 
              latitude: location.coords?.latitude,
              longitude: location.coords?.longitude,
              timestamp: location.timestamp,
              accuracy: location.coords?.accuracy
            }
          });
        }
      }

      console.log(`✅ Background location processing complete: ${processedCount} processed, ${errorCount} errors`);
      
      if (processedCount > 0) {
        LoggingService.location('background_batch_processed', {
          total: locations.length,
          processed: processedCount,
          errors: errorCount
        });
      }
    } catch (error) {
      console.error('❌ Error handling background locations batch:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_service', error_type: 'background_location_batch_error' },
        extra: { locationCount: locations.length }
      });
    }
  }

  async processLocationWithRetry(location, isBackground, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.processLocation(location, isBackground);
        return; // Success
      } catch (error) {
        console.error(`❌ Location processing attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          throw error; // Re-throw on final attempt
        }
        
        // Wait before retry with exponential backoff
        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async processLocation(location, isBackground = false) {
    try {
      // Generate UUID for this location
      const uuid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Detect activity based on location data
      const detectedActivity = this.detectActivity(location);
      const isMoving = detectedActivity !== 'stationary';
      
      // Update activity tracking
      if (this.currentActivity !== detectedActivity) {
        this.currentActivity = detectedActivity;
        LocationSyncService.updateActivity(detectedActivity);
      }
      
      // Get battery information
      const battery = await this.getBatteryInfo();
      
      // Create location data object
      const locationData = {
        uuid,
        coords: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          altitude: location.coords.altitude,
          altitudeAccuracy: location.coords.altitudeAccuracy,
          speed: location.coords.speed || 0,
          heading: location.coords.heading,
        },
        timestamp: location.timestamp,
        is_moving: isMoving,
        activity: {
          type: detectedActivity,
          confidence: this.getActivityConfidence(location)
        },
        battery,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        source: isBackground ? 'background' : 'foreground'
      };
      
      // Cache location locally
      await LocationCacheService.cacheLocation(locationData);
      
      // Process for visit detection
      await VisitTrackingService.processLocation(locationData);
      
      // Update last known location
      this.lastKnownLocation = location;
      this.lastActivityTime = Date.now();
      
      // Log the location
      console.log(`📍 Processed location: ${detectedActivity} at ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`);
      
      // Log to Better Stack
      LoggingService.location('location_processed', {
        activity: detectedActivity,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        speed: location.coords.speed,
        is_background: isBackground,
        uuid: uuid
      });
      
    } catch (error) {
      console.error('❌ Error processing location:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_service', error_type: 'process_location_error' }
      });
    }
  }

  detectActivity(location) {
    const speed = location.coords.speed || 0;
    const speedKmh = speed * 3.6; // Convert m/s to km/h
    
    if (speedKmh < this.activityThresholds.stationary.speed) {
      return 'stationary';
    } else if (speedKmh < this.activityThresholds.walking.speed) {
      return 'walking';
    } else if (speedKmh < this.activityThresholds.vehicle.speed) {
      return 'cycling';
    } else {
      return 'vehicle';
    }
  }

  getActivityConfidence(location) {
    // Simple confidence based on accuracy
    const accuracy = location.coords.accuracy || 100;
    if (accuracy < 10) return 100;
    if (accuracy < 20) return 80;
    if (accuracy < 50) return 60;
    return 40;
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

  async checkLocationPermission() {
    try {
      const foregroundPermission = await Location.getForegroundPermissionsAsync();
      const backgroundPermission = await Location.getBackgroundPermissionsAsync();
      
      this.permissionsGranted = foregroundPermission.status === 'granted' && 
                                backgroundPermission.status === 'granted';
      
      return this.permissionsGranted;
    } catch (error) {
      console.error('❌ Error checking location permissions:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_service', error_type: 'permission_check_error' }
      });
      return false;
    }
  }

  async isLocationTrackingActive() {
    try {
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      return this.isTracking && isTaskRegistered;
    } catch (error) {
      console.error('❌ Error checking location tracking status:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_service', error_type: 'tracking_status_error' }
      });
      return false;
    }
  }

  async requestLocationPermission() {
    return await this.requestPermissions();
  }

  async requestPermissions() {
    try {
      // Request foreground location permission first
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('❌ Foreground location permission denied');
        return false;
      }

      // Request background location permission
      const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
      if (backgroundPermission.status !== 'granted') {
        console.log('❌ Background location permission denied');
        return false;
      }

      this.permissionsGranted = true;
      console.log('✅ Location permissions granted');
      return true;
    } catch (error) {
      console.error('❌ Error requesting permissions:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_service', error_type: 'permission_error' }
      });
      return false;
    }
  }

  async startTracking() {
    if (this.isTracking) {
      console.log('📍 Location tracking already started');
      return true;
    }

    try {
      // Check permissions
      if (!this.permissionsGranted) {
        const granted = await this.requestPermissions();
        if (!granted) {
          throw new Error('Location permissions not granted');
        }
      }

      // Configure background location tracking
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15000, // 15 seconds
        distanceInterval: 10, // 10 meters
        deferredUpdatesInterval: 30000, // 30 seconds
        foregroundService: {
          notificationTitle: 'Haps is tracking your location',
          notificationBody: 'Location tracking is active for timeline features',
          notificationColor: '#000000',
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: Platform.OS === 'ios',
      });

      // Register background task (minimum 15 minutes on Android)
      await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
        minimumInterval: 15 // 15 minutes minimum
      });

      // Start sync service
      LocationSyncService.startAutoSync(this.currentActivity);

      // Start heartbeat monitoring (legacy)
      this.startHeartbeatMonitoring();

      // Start guaranteed heartbeat service (30-minute guarantee)
      await HeartbeatService.startHeartbeat();

      this.isTracking = true;
      console.log('✅ Location tracking started');

      Sentry.addBreadcrumb({
        message: 'Location tracking started',
        level: 'info'
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to start location tracking:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_service', error_type: 'start_tracking_error' }
      });
      return false;
    }
  }

  async stopTracking() {
    try {
      if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      if (TaskManager.isTaskDefined(BACKGROUND_TASK_NAME)) {
        await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME);
      }

      LocationSyncService.stopAutoSync();
      this.stopHeartbeatMonitoring();

      // Stop guaranteed heartbeat service
      await HeartbeatService.stopHeartbeat();

      this.isTracking = false;
      console.log('⏹️ Location tracking stopped');

      Sentry.addBreadcrumb({
        message: 'Location tracking stopped',
        level: 'info'
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to stop location tracking:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_service', error_type: 'stop_tracking_error' }
      });
      return false;
    }
  }

  startHeartbeatMonitoring() {
    this.stopHeartbeatMonitoring(); // Clear any existing interval
    
    // Send heartbeats every 5 minutes when stationary
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeatIfNeeded();
    }, 5 * 60 * 1000); // 5 minutes
  }

  stopHeartbeatMonitoring() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async sendHeartbeatIfNeeded() {
    try {
      // Only send heartbeat if we've been stationary for a while
      const timeSinceLastActivity = Date.now() - this.lastActivityTime;
      const isStationary = this.currentActivity === 'stationary' && 
                          timeSinceLastActivity > this.activityThresholds.stationary.time;

      if (isStationary) {
        const battery = await this.getBatteryInfo();
        
        const heartbeatData = {
          timestamp: Date.now(),
          battery,
          activity: {
            type: this.currentActivity,
            confidence: 90
          },
          odometer: 0,
          enabled: this.isTracking,
          location: this.lastKnownLocation
        };

        await LocationCacheService.cacheHeartbeat(heartbeatData);
        console.log('💓 Heartbeat sent (stationary)');
      }
    } catch (error) {
      console.error('❌ Error sending heartbeat:', error);
    }
  }

  async getCurrentLocation() {
    try {
      if (!this.permissionsGranted) {
        const granted = await this.requestPermissions();
        if (!granted) {
          throw new Error('Location permissions not granted');
        }
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        maximumAge: 10000, // 10 seconds
      });

      await this.processLocation(location, false);
      return location;
    } catch (error) {
      console.error('❌ Error getting current location:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_service', error_type: 'get_location_error' }
      });
      throw error;
    }
  }

  async getServiceStatus() {
    try {
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      const syncStatus = await LocationSyncService.getSyncStatus();
      const heartbeatStatus = await HeartbeatService.getStatus();
      const visitStats = await VisitTrackingService.getVisitStats();
      
      return {
        isTracking: this.isTracking,
        permissionsGranted: this.permissionsGranted,
        isTaskRegistered,
        currentActivity: this.currentActivity,
        lastKnownLocation: this.lastKnownLocation,
        lastActivityTime: this.lastActivityTime,
        syncStatus,
        heartbeatStatus,
        visitStats
      };
    } catch (error) {
      console.error('❌ Error getting service status:', error);
      return {
        isTracking: false,
        permissionsGranted: false,
        isTaskRegistered: false,
        currentActivity: 'unknown',
        lastKnownLocation: null,
        lastActivityTime: null,
        syncStatus: null,
        heartbeatStatus: null,
        visitStats: null
      };
    }
  }
}

// Export singleton instance
export default new LocationService();