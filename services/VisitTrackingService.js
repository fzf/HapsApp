import LocationCacheService from './LocationCacheService';
import LoggingService from './LoggingService';
import * as Sentry from '@sentry/react-native';

/**
 * VisitTrackingService - Intelligent visit detection system
 * 
 * Detects visits (stops at locations) using spatial clustering and temporal analysis.
 * Handles complex scenarios like drive-throughs and walking around large venues.
 * 
 * Algorithm:
 * 1. Spatial clustering: Group nearby points within visit radius
 * 2. Temporal analysis: Check dwell time and movement patterns  
 * 3. Context awareness: Different rules for different activities
 * 4. Visit merging: Combine related stops into single visits
 */
class VisitTrackingService {
  constructor() {
    this.isInitialized = false;
    this.activeVisits = new Map(); // Track ongoing visits
    this.locationBuffer = []; // Recent locations for analysis
    this.lastProcessedTime = 0;
    
    // Visit detection parameters
    this.config = {
      visitRadius: 150, // meters - allows for large venues
      minDwellTime: 90, // seconds - catches drive-throughs
      maxGapTime: 300, // seconds - allows brief exits/re-entries
      movementThreshold: 50, // meters - distinguishes venue walking from departure
      bufferSize: 20, // number of recent locations to keep
      processInterval: 30000, // ms - how often to analyze visits
      confidenceThreshold: 0.6, // minimum confidence for visit detection
      
      // Activity-specific adjustments
      activityAdjustments: {
        stationary: { radiusMultiplier: 1.0, dwellMultiplier: 1.0 },
        walking: { radiusMultiplier: 1.5, dwellMultiplier: 0.7 },
        cycling: { radiusMultiplier: 0.8, dwellMultiplier: 1.2 },
        vehicle: { radiusMultiplier: 0.6, dwellMultiplier: 1.5 }
      }
    };
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      await LocationCacheService.initialize();
      this.isInitialized = true;
      console.log('✅ VisitTrackingService initialized');
      
      // Load any incomplete visits from database
      await this.loadIncompleteVisits();
      
      Sentry.addBreadcrumb({
        message: 'VisitTrackingService initialized',
        level: 'info'
      });
    } catch (error) {
      console.error('❌ Failed to initialize VisitTrackingService:', error);
      Sentry.captureException(error, {
        tags: { section: 'visit_tracking', error_type: 'initialization_error' }
      });
      throw error;
    }
  }

  /**
   * Process a new location point for visit detection
   */
  async processLocation(locationData) {
    if (!this.isInitialized) await this.initialize();

    try {
      const { coords, timestamp, activity } = locationData;
      
      // Add to buffer
      this.locationBuffer.push({
        latitude: coords.latitude,
        longitude: coords.longitude,
        timestamp,
        activity: activity?.type || 'unknown',
        confidence: activity?.confidence || 50,
        accuracy: coords.accuracy || 100
      });

      // Keep buffer at manageable size
      if (this.locationBuffer.length > this.config.bufferSize) {
        this.locationBuffer = this.locationBuffer.slice(-this.config.bufferSize);
      }

      // Process visits periodically or when we have enough data
      const now = Date.now();
      if (now - this.lastProcessedTime > this.config.processInterval || 
          this.locationBuffer.length >= this.config.bufferSize) {
        await this.analyzeVisits();
        this.lastProcessedTime = now;
      }

      LoggingService.debug('visit_tracking', 'Location processed for visit detection', {
        latitude: coords.latitude,
        longitude: coords.longitude,
        bufferSize: this.locationBuffer.length,
        activeVisits: this.activeVisits.size
      });

    } catch (error) {
      console.error('❌ Error processing location for visits:', error);
      Sentry.captureException(error, {
        tags: { section: 'visit_tracking', error_type: 'process_location_error' }
      });
    }
  }

  /**
   * Analyze recent locations to detect visits
   */
  async analyzeVisits() {
    if (this.locationBuffer.length < 3) return;

    try {
      // Get activity-adjusted parameters
      const recentActivity = this.getMostRecentActivity();
      const adjustedConfig = this.getAdjustedConfig(recentActivity);

      // Find potential visit clusters
      const clusters = this.findSpatialClusters(adjustedConfig);
      
      // Analyze each cluster for visit potential
      for (const cluster of clusters) {
        await this.analyzeCluster(cluster, adjustedConfig);
      }

      // Check for visit endings
      await this.checkVisitEndings(adjustedConfig);

      LoggingService.debug('visit_tracking', 'Visit analysis completed', {
        clusters: clusters.length,
        activeVisits: this.activeVisits.size,
        recentActivity
      });

    } catch (error) {
      console.error('❌ Error analyzing visits:', error);
      Sentry.captureException(error, {
        tags: { section: 'visit_tracking', error_type: 'analyze_visits_error' }
      });
    }
  }

  /**
   * Find spatial clusters of location points
   */
  findSpatialClusters(config) {
    const clusters = [];
    const used = new Set();

    for (let i = 0; i < this.locationBuffer.length; i++) {
      if (used.has(i)) continue;

      const cluster = [this.locationBuffer[i]];
      used.add(i);

      // Find all points within visit radius
      for (let j = i + 1; j < this.locationBuffer.length; j++) {
        if (used.has(j)) continue;

        const distance = this.calculateDistance(
          this.locationBuffer[i],
          this.locationBuffer[j]
        );

        if (distance <= config.visitRadius) {
          cluster.push(this.locationBuffer[j]);
          used.add(j);
        }
      }

      // Only consider clusters with multiple points
      if (cluster.length >= 2) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Analyze a cluster to determine if it represents a visit
   */
  async analyzeCluster(cluster, config) {
    try {
      // Calculate cluster properties
      const center = this.calculateClusterCenter(cluster);
      const timeSpan = this.calculateTimeSpan(cluster);
      const avgAccuracy = cluster.reduce((sum, p) => sum + p.accuracy, 0) / cluster.length;
      
      // Check minimum dwell time
      if (timeSpan < config.minDwellTime * 1000) return;

      // Calculate confidence based on various factors
      const confidence = this.calculateVisitConfidence(cluster, timeSpan, avgAccuracy, config);
      
      if (confidence < this.config.confidenceThreshold) return;

      // Check if this overlaps with an existing active visit
      const existingVisit = this.findOverlappingVisit(center, config.visitRadius);
      
      if (existingVisit) {
        // Update existing visit
        await this.updateExistingVisit(existingVisit, cluster, center, confidence);
      } else {
        // Create new visit
        await this.createNewVisit(cluster, center, timeSpan, confidence);
      }

    } catch (error) {
      console.error('❌ Error analyzing cluster:', error);
      Sentry.captureException(error, {
        tags: { section: 'visit_tracking', error_type: 'analyze_cluster_error' }
      });
    }
  }

  /**
   * Calculate visit confidence based on multiple factors
   */
  calculateVisitConfidence(cluster, timeSpan, avgAccuracy, config) {
    let confidence = 0.5; // Base confidence

    // Time factor: longer stays = higher confidence
    const timeFactor = Math.min(timeSpan / (config.minDwellTime * 1000 * 3), 1.0);
    confidence += timeFactor * 0.3;

    // Accuracy factor: better accuracy = higher confidence
    const accuracyFactor = Math.max(0, 1 - (avgAccuracy / 100));
    confidence += accuracyFactor * 0.2;

    // Density factor: more points in cluster = higher confidence
    const densityFactor = Math.min(cluster.length / 10, 1.0);
    confidence += densityFactor * 0.2;

    // Activity factor: stationary activity = higher confidence
    const stationaryCount = cluster.filter(p => p.activity === 'stationary').length;
    const activityFactor = stationaryCount / cluster.length;
    confidence += activityFactor * 0.3;

    return Math.min(confidence, 1.0);
  }

  /**
   * Create a new visit entry
   */
  async createNewVisit(cluster, center, timeSpan, confidence) {
    try {
      const visitId = `visit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Math.min(...cluster.map(p => p.timestamp));
      const endTime = Math.max(...cluster.map(p => p.timestamp));

      const visitData = {
        id: visitId,
        type: 'visit',
        startTime: Math.floor(startTime / 1000),
        endTime: Math.floor(endTime / 1000),
        centerLatitude: center.latitude,
        centerLongitude: center.longitude,
        confidence,
        locationCount: cluster.length,
        isActive: true,
        lastUpdated: Date.now()
      };

      // Store in database
      await this.saveVisitToDatabase(visitData);
      
      // Add to active visits
      this.activeVisits.set(visitId, visitData);

      console.log(`🏢 New visit detected: ${visitId} at ${center.latitude.toFixed(6)}, ${center.longitude.toFixed(6)} (${timeSpan/1000}s, confidence: ${confidence.toFixed(2)})`);
      
      LoggingService.location('visit_detected', {
        visitId,
        latitude: center.latitude,
        longitude: center.longitude,
        duration: timeSpan / 1000,
        confidence,
        locationCount: cluster.length
      });

    } catch (error) {
      console.error('❌ Error creating new visit:', error);
      Sentry.captureException(error, {
        tags: { section: 'visit_tracking', error_type: 'create_visit_error' }
      });
    }
  }

  /**
   * Update an existing active visit
   */
  async updateExistingVisit(visitData, cluster, center, confidence) {
    try {
      const endTime = Math.max(...cluster.map(p => p.timestamp));
      
      visitData.endTime = Math.floor(endTime / 1000);
      visitData.centerLatitude = center.latitude;
      visitData.centerLongitude = center.longitude;
      visitData.confidence = Math.max(visitData.confidence, confidence);
      visitData.locationCount += cluster.length;
      visitData.lastUpdated = Date.now();

      // Update in database
      await this.updateVisitInDatabase(visitData);

      LoggingService.debug('visit_tracking', 'Visit updated', {
        visitId: visitData.id,
        newEndTime: visitData.endTime,
        confidence: visitData.confidence
      });

    } catch (error) {
      console.error('❌ Error updating existing visit:', error);
      Sentry.captureException(error, {
        tags: { section: 'visit_tracking', error_type: 'update_visit_error' }
      });
    }
  }

  /**
   * Check if any active visits should be ended
   */
  async checkVisitEndings(config) {
    const now = Date.now();
    const recentLocation = this.locationBuffer[this.locationBuffer.length - 1];
    
    if (!recentLocation) return;

    for (const [visitId, visitData] of this.activeVisits) {
      const timeSinceUpdate = now - visitData.lastUpdated;
      const distanceFromVisit = this.calculateDistance(
        recentLocation,
        { latitude: visitData.centerLatitude, longitude: visitData.centerLongitude }
      );

      // End visit if we've moved away or haven't updated in a while
      if (timeSinceUpdate > config.maxGapTime * 1000 || 
          distanceFromVisit > config.movementThreshold) {
        await this.endVisit(visitId, visitData);
      }
    }
  }

  /**
   * End an active visit
   */
  async endVisit(visitId, visitData) {
    try {
      visitData.isActive = false;
      
      // Update in database
      await this.updateVisitInDatabase(visitData);
      
      // Remove from active visits
      this.activeVisits.delete(visitId);

      const duration = visitData.endTime - visitData.startTime;
      console.log(`🏁 Visit ended: ${visitId} (duration: ${duration}s, confidence: ${visitData.confidence.toFixed(2)})`);
      
      LoggingService.location('visit_ended', {
        visitId,
        duration,
        confidence: visitData.confidence,
        locationCount: visitData.locationCount
      });

    } catch (error) {
      console.error('❌ Error ending visit:', error);
      Sentry.captureException(error, {
        tags: { section: 'visit_tracking', error_type: 'end_visit_error' }
      });
    }
  }

  /**
   * Helper methods
   */
  calculateDistance(point1, point2) {
    const R = 6371000; // Earth's radius in meters
    const lat1Rad = point1.latitude * Math.PI / 180;
    const lat2Rad = point2.latitude * Math.PI / 180;
    const deltaLatRad = (point2.latitude - point1.latitude) * Math.PI / 180;
    const deltaLngRad = (point2.longitude - point1.longitude) * Math.PI / 180;

    const a = Math.sin(deltaLatRad/2) * Math.sin(deltaLatRad/2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad/2) * Math.sin(deltaLngRad/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  calculateClusterCenter(cluster) {
    const avgLat = cluster.reduce((sum, p) => sum + p.latitude, 0) / cluster.length;
    const avgLng = cluster.reduce((sum, p) => sum + p.longitude, 0) / cluster.length;
    return { latitude: avgLat, longitude: avgLng };
  }

  calculateTimeSpan(cluster) {
    const timestamps = cluster.map(p => p.timestamp);
    return Math.max(...timestamps) - Math.min(...timestamps);
  }

  getMostRecentActivity() {
    if (this.locationBuffer.length === 0) return 'unknown';
    return this.locationBuffer[this.locationBuffer.length - 1].activity;
  }

  getAdjustedConfig(activity) {
    const adjustments = this.config.activityAdjustments[activity] || 
                       this.config.activityAdjustments.stationary;
    
    return {
      visitRadius: this.config.visitRadius * adjustments.radiusMultiplier,
      minDwellTime: this.config.minDwellTime * adjustments.dwellMultiplier,
      maxGapTime: this.config.maxGapTime,
      movementThreshold: this.config.movementThreshold
    };
  }

  findOverlappingVisit(center, radius) {
    for (const [visitId, visitData] of this.activeVisits) {
      const distance = this.calculateDistance(
        center,
        { latitude: visitData.centerLatitude, longitude: visitData.centerLongitude }
      );
      if (distance <= radius) {
        return visitData;
      }
    }
    return null;
  }

  /**
   * Database operations
   */
  async saveVisitToDatabase(visitData) {
    const db = LocationCacheService.db;
    const result = await db.runAsync(`
      INSERT INTO local_timeline_segments (
        type, start_time, end_time, center_latitude, center_longitude,
        location_count, confidence, is_active, visit_radius, last_updated, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      visitData.type,
      visitData.startTime,
      visitData.endTime,
      visitData.centerLatitude,
      visitData.centerLongitude,
      visitData.locationCount,
      visitData.confidence,
      visitData.isActive ? 1 : 0,
      this.config.visitRadius,
      Math.floor(visitData.lastUpdated / 1000)
    ]);
    
    visitData.dbId = result.lastInsertRowId;
  }

  async updateVisitInDatabase(visitData) {
    const db = LocationCacheService.db;
    if (visitData.dbId) {
      await db.runAsync(`
        UPDATE local_timeline_segments 
        SET end_time = ?, center_latitude = ?, center_longitude = ?,
            location_count = ?, confidence = ?, is_active = ?, 
            last_updated = ?, updated_at = strftime('%s', 'now')
        WHERE id = ?
      `, [
        visitData.endTime,
        visitData.centerLatitude,
        visitData.centerLongitude,
        visitData.locationCount,
        visitData.confidence,
        visitData.isActive ? 1 : 0,
        Math.floor(visitData.lastUpdated / 1000),
        visitData.dbId
      ]);
    }
  }

  async loadIncompleteVisits() {
    try {
      const db = LocationCacheService.db;
      const result = await db.getAllAsync(`
        SELECT * FROM local_timeline_segments 
        WHERE type = 'visit' AND is_active = 1
        ORDER BY start_time DESC
        LIMIT 5
      `);

      for (const row of result) {
        const visitId = `visit_${row.start_time}_${row.id}`;
        this.activeVisits.set(visitId, {
          id: visitId,
          dbId: row.id,
          type: 'visit',
          startTime: row.start_time,
          endTime: row.end_time,
          centerLatitude: row.center_latitude,
          centerLongitude: row.center_longitude,
          confidence: row.confidence,
          locationCount: row.location_count,
          isActive: true,
          lastUpdated: row.last_updated ? row.last_updated * 1000 : Date.now()
        });
      }

      console.log(`📍 Loaded ${result.length} active visits`);
    } catch (error) {
      console.error('❌ Error loading incomplete visits:', error);
    }
  }

  /**
   * Public API methods
   */
  async getRecentVisits(hours = 24) {
    if (!this.isInitialized) await this.initialize();

    try {
      const db = LocationCacheService.db;
      const cutoffTime = Math.floor((Date.now() - (hours * 60 * 60 * 1000)) / 1000);
      
      const result = await db.getAllAsync(`
        SELECT * FROM local_timeline_segments 
        WHERE type = 'visit' AND start_time > ?
        ORDER BY start_time DESC
      `, [cutoffTime]);

      return result.map(row => ({
        id: row.id,
        startTime: new Date(row.start_time * 1000),
        endTime: row.end_time ? new Date(row.end_time * 1000) : null,
        latitude: row.center_latitude,
        longitude: row.center_longitude,
        confidence: row.confidence,
        locationCount: row.location_count,
        duration: row.end_time ? row.end_time - row.start_time : null
      }));
    } catch (error) {
      console.error('❌ Error getting recent visits:', error);
      return [];
    }
  }

  async getVisitStats() {
    if (!this.isInitialized) await this.initialize();

    try {
      const db = LocationCacheService.db;
      const result = await db.getFirstAsync(`
        SELECT 
          COUNT(*) as total_visits,
          AVG(end_time - start_time) as avg_duration,
          SUM(location_count) as total_locations
        FROM local_timeline_segments 
        WHERE type = 'visit' AND end_time IS NOT NULL
      `);

      return {
        totalVisits: result.total_visits || 0,
        averageDuration: result.avg_duration || 0,
        totalLocations: result.total_locations || 0,
        activeVisits: this.activeVisits.size
      };
    } catch (error) {
      console.error('❌ Error getting visit stats:', error);
      return { totalVisits: 0, averageDuration: 0, totalLocations: 0, activeVisits: 0 };
    }
  }
}

// Export singleton instance
export default new VisitTrackingService();