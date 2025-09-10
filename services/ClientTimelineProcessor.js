import * as Sentry from '@sentry/react-native';
import LocationCacheService from './LocationCacheService';

/**
 * ClientTimelineProcessor - Mobile-side timeline creation
 * 
 * Ports core server-side movement detection algorithms to the mobile app
 * for immediate timeline feedback and offline capabilities.
 * 
 * Based on haps-server/app/classes/timeline_processor/movement_detector.rb
 */

// Configuration constants (ported from server-side Config)
const Config = {
  // Movement detection parameters
  STATIONARY_RADIUS_THRESHOLD: 50.0, // meters
  MINIMUM_STATIONARY_DURATION: 5 * 60 * 1000, // 5 minutes in ms
  MINIMUM_MOVEMENT_DURATION: 2 * 60 * 1000, // 2 minutes in ms
  MOVEMENT_DISTANCE_THRESHOLD: 100.0, // meters
  
  // Area-based visit detection
  VISIT_AREA_RADIUS: 120.0, // meters
  MINIMUM_AREA_VISIT_DURATION: 10 * 60 * 1000, // 10 minutes in ms
  
  // Non-linear movement detection
  MOVEMENT_LINEARITY_THRESHOLD: 0.65,
  MAXIMUM_NONLINEAR_DISTANCE: 200.0, // meters
  
  // Segment merging
  VISIT_MERGE_RADIUS: 100.0, // meters
  VISIT_MERGE_TIME_GAP: 30 * 60 * 1000, // 30 minutes in ms
  
  // Force breaks on large gaps
  FORCE_SEGMENT_BREAK_GAP: 60 * 60 * 1000, // 1 hour in ms
  
  // Transportation thresholds
  WALKING_SPEED_MAX: 2.0, // m/s (~4.5 mph)
  CYCLING_SPEED_MAX: 8.0, // m/s (~18 mph)
  VEHICLE_SPEED_MIN: 5.0, // m/s (~11 mph)
  HIGH_SPEED_THRESHOLD: 15.0, // m/s (~33 mph)
};

class ClientTimelineProcessor {
  constructor() {
    this.isProcessing = false;
    this.lastProcessedTime = 0;
  }

  /**
   * Process locations into timeline segments
   */
  async processLocations(locations, options = {}) {
    if (this.isProcessing) {
      console.log('⏳ Timeline processing already in progress, skipping');
      return [];
    }

    try {
      this.isProcessing = true;
      console.log(`🔄 Processing ${locations.length} locations into timeline`);

      // Sort locations by timestamp
      const sortedLocations = locations.sort((a, b) => a.timestamp - b.timestamp);
      
      // Step 1: Detect movement vs stationary segments
      const segments = this.detectMovementSegments(sortedLocations);
      
      // Step 2: Merge nearby segments
      const mergedSegments = this.mergeNearbySegments(segments);
      
      // Step 3: Classify and finalize segments
      const finalizedSegments = this.finalizeSegments(mergedSegments);
      
      // Step 4: Store in local database
      const timelineSegments = await this.storeTimelineSegments(finalizedSegments);
      
      console.log(`✅ Created ${timelineSegments.length} timeline segments`);
      
      Sentry.addBreadcrumb({
        message: `Timeline processing completed: ${timelineSegments.length} segments`,
        level: 'info'
      });
      
      return timelineSegments;
      
    } catch (error) {
      console.error('❌ Failed to process timeline:', error);
      Sentry.captureException(error, {
        tags: { section: 'client_timeline', error_type: 'processing_error' }
      });
      return [];
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Detect movement vs stationary segments using server algorithms
   */
  detectMovementSegments(locations) {
    const segments = [];
    let currentSegment = null;
    
    for (let i = 0; i < locations.length; i++) {
      const location = locations[i];
      const stationaryResult = this.isStationaryAtLocation(location, i, locations);
      const isStationary = stationaryResult.isStationary;
      const detectedViaNonlinear = stationaryResult.detectedViaNonlinear;
      
      // Force segment break on large time gaps
      if (currentSegment && this.shouldForceSegmentBreak(currentSegment, location)) {
        segments.push(this.finalizeSegment(currentSegment));
        currentSegment = null;
      }
      
      if (!currentSegment) {
        // Start new segment
        currentSegment = {
          type: isStationary ? 'stationary' : 'movement',
          startTime: location.timestamp,
          endTime: location.timestamp,
          locations: [location],
          detectedViaNonlinear: detectedViaNonlinear
        };
      } else if (currentSegment.type === (isStationary ? 'stationary' : 'movement')) {
        // Continue current segment
        currentSegment.endTime = location.timestamp;
        currentSegment.locations.push(location);
        currentSegment.detectedViaNonlinear = currentSegment.detectedViaNonlinear || detectedViaNonlinear;
      } else {
        // Segment type changed - finalize current and start new
        if (this.isValidSegment(currentSegment)) {
          segments.push(this.finalizeSegment(currentSegment));
        }
        
        currentSegment = {
          type: isStationary ? 'stationary' : 'movement',
          startTime: location.timestamp,
          endTime: location.timestamp,
          locations: [location],
          detectedViaNonlinear: detectedViaNonlinear
        };
      }
    }
    
    // Don't forget the last segment
    if (currentSegment && this.isValidSegment(currentSegment)) {
      segments.push(this.finalizeSegment(currentSegment));
    }
    
    return segments;
  }

  /**
   * Check if location indicates stationary behavior (ported from server)
   */
  isStationaryAtLocation(location, index, allLocations) {
    // Calculate distance from previous point
    if (index > 0) {
      const prevLocation = allLocations[index - 1];
      const distanceFromPrev = this.calculateDistanceMeters(prevLocation, location);
      
      // If significant distance covered, this is movement
      if (distanceFromPrev > Config.MOVEMENT_DISTANCE_THRESHOLD) {
        return { isStationary: false, detectedViaNonlinear: false };
      }
      
      // If very close to previous point, likely stationary
      if (distanceFromPrev <= Config.STATIONARY_RADIUS_THRESHOLD) {
        return { isStationary: true, detectedViaNonlinear: false };
      }
    }
    
    // Area-based detection using larger window
    const windowStart = Math.max(0, index - 10);
    const windowEnd = Math.min(allLocations.length - 1, index + 10);
    const windowLocations = allLocations.slice(windowStart, windowEnd + 1);
    
    if (windowLocations.length < 6) {
      return { isStationary: false, detectedViaNonlinear: false };
    }
    
    // Check temporal span
    const timeSpan = windowLocations[windowLocations.length - 1].timestamp - windowLocations[0].timestamp;
    if (timeSpan < Config.MINIMUM_AREA_VISIT_DURATION) {
      return { isStationary: false, detectedViaNonlinear: false };
    }
    
    // Calculate spatial spread and characteristics
    const lats = windowLocations.map(loc => loc.coords.latitude);
    const lons = windowLocations.map(loc => loc.coords.longitude);
    
    // Calculate geographic area covered
    const latRangeMeters = (Math.max(...lats) - Math.min(...lats)) * 111000;
    const lonRangeMeters = (Math.max(...lons) - Math.min(...lons)) * 111000 * Math.cos(lats[0] * Math.PI / 180);
    const areaRadius = Math.sqrt(latRangeMeters ** 2 + lonRangeMeters ** 2) / 2;
    
    // Calculate total movement distance within area
    let totalAreaDistance = 0;
    for (let i = 0; i < windowLocations.length - 1; i++) {
      totalAreaDistance += this.calculateDistanceMeters(windowLocations[i], windowLocations[i + 1]);
    }
    
    // Check for constrained area visit
    const isConstrainedArea = areaRadius <= Config.VISIT_AREA_RADIUS;
    if (isConstrainedArea && timeSpan >= Config.MINIMUM_AREA_VISIT_DURATION) {
      const isVisitMovement = totalAreaDistance <= Config.VISIT_AREA_RADIUS * 2;
      return { isStationary: isVisitMovement, detectedViaNonlinear: false };
    }
    
    // Check for non-linear movement (parking lots, shopping)
    const movementLinearity = this.calculateMovementLinearity(windowLocations);
    if (movementLinearity <= Config.MOVEMENT_LINEARITY_THRESHOLD) {
      const isNonlinearVisit = totalAreaDistance <= Config.MAXIMUM_NONLINEAR_DISTANCE && 
                              timeSpan >= Config.MINIMUM_AREA_VISIT_DURATION;
      return { isStationary: isNonlinearVisit, detectedViaNonlinear: isNonlinearVisit };
    }
    
    // Fallback: distance-based clustering
    const distances = windowLocations.map(loc => this.calculateDistanceMeters(location, loc));
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const isStationaryFallback = avgDistance <= Config.STATIONARY_RADIUS_THRESHOLD;
    
    return { isStationary: isStationaryFallback, detectedViaNonlinear: false };
  }

  /**
   * Check if segment meets minimum duration requirements
   */
  isValidSegment(segment) {
    const duration = segment.endTime - segment.startTime;
    
    if (segment.type === 'stationary') {
      return duration >= Config.MINIMUM_STATIONARY_DURATION;
    } else {
      return duration >= Config.MINIMUM_MOVEMENT_DURATION;
    }
  }

  /**
   * Finalize segment with calculated metrics
   */
  finalizeSegment(segment) {
    const duration = segment.endTime - segment.startTime;
    const centerLat = segment.locations.reduce((sum, loc) => sum + loc.coords.latitude, 0) / segment.locations.length;
    const centerLon = segment.locations.reduce((sum, loc) => sum + loc.coords.longitude, 0) / segment.locations.length;
    
    let finalized = {
      type: segment.type,
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: duration,
      locations: segment.locations,
      centerLat: centerLat,
      centerLon: centerLon,
      detectedViaNonlinear: segment.detectedViaNonlinear || false,
      confidence: this.calculateSegmentConfidence(segment)
    };
    
    // Add movement-specific metrics
    if (segment.type === 'movement') {
      const distanceKm = this.calculateTotalDistanceKm(segment.locations);
      finalized.distanceKm = distanceKm;
      finalized.avgSpeedMs = duration > 0 ? (distanceKm * 1000) / (duration / 1000) : 0;
      finalized.transportationMode = this.inferTransportationMode(finalized.avgSpeedMs);
      
      // Check if movement should be converted to visit due to non-linear patterns
      if (this.shouldConvertMovementToVisit(segment)) {
        finalized.type = 'stationary';
        finalized.detectedViaNonlinear = true;
      }
    }
    
    // Distance-based override for stationary segments with significant movement
    if (segment.type === 'stationary') {
      const totalDistance = this.calculateTotalDistanceKm(segment.locations);
      if (totalDistance > 0.5) { // 500m threshold
        finalized.type = 'movement';
        finalized.distanceKm = totalDistance;
        finalized.avgSpeedMs = duration > 0 ? (totalDistance * 1000) / (duration / 1000) : 0;
        finalized.transportationMode = this.inferTransportationMode(finalized.avgSpeedMs);
      }
    }
    
    return finalized;
  }

  /**
   * Calculate segment confidence based on various factors
   */
  calculateSegmentConfidence(segment) {
    let confidence = 0.5; // Base confidence
    
    // More locations = higher confidence
    confidence += Math.min(segment.locations.length / 50, 0.3);
    
    // Longer duration = higher confidence  
    const durationMinutes = (segment.endTime - segment.startTime) / (60 * 1000);
    confidence += Math.min(durationMinutes / 60, 0.2);
    
    // High accuracy GPS = higher confidence
    const avgAccuracy = segment.locations.reduce((sum, loc) => sum + (loc.coords.accuracy || 100), 0) / segment.locations.length;
    if (avgAccuracy < 20) confidence += 0.1;
    else if (avgAccuracy > 100) confidence -= 0.1;
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Merge nearby segments that should be combined
   */
  mergeNearbySegments(segments) {
    if (segments.length <= 1) return segments;
    
    const merged = [];
    let current = segments[0];
    
    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];
      
      if (this.shouldMergeSegments(current, next)) {
        // Merge segments
        current = this.mergeSegments(current, next);
      } else {
        merged.push(current);
        current = next;
      }
    }
    
    merged.push(current); // Don't forget the last segment
    return merged;
  }

  /**
   * Check if two segments should be merged
   */
  shouldMergeSegments(segment1, segment2) {
    // Only merge segments of same type
    if (segment1.type !== segment2.type) return false;
    
    // Check time gap
    const timeGap = segment2.startTime - segment1.endTime;
    if (timeGap > Config.VISIT_MERGE_TIME_GAP) return false;
    
    // For stationary segments, check spatial proximity
    if (segment1.type === 'stationary') {
      const distance = this.calculateDistanceMeters(
        { coords: { latitude: segment1.centerLat, longitude: segment1.centerLon } },
        { coords: { latitude: segment2.centerLat, longitude: segment2.centerLon } }
      );
      return distance <= Config.VISIT_MERGE_RADIUS;
    }
    
    // For movement segments, be more conservative
    return timeGap < Config.MINIMUM_MOVEMENT_DURATION;
  }

  /**
   * Merge two segments into one
   */
  mergeSegments(segment1, segment2) {
    const totalLocations = segment1.locations.length + segment2.locations.length;
    
    return {
      type: segment1.type,
      startTime: segment1.startTime,
      endTime: segment2.endTime,
      duration: segment2.endTime - segment1.startTime,
      locations: [...segment1.locations, ...segment2.locations],
      centerLat: (segment1.centerLat * segment1.locations.length + segment2.centerLat * segment2.locations.length) / totalLocations,
      centerLon: (segment1.centerLon * segment1.locations.length + segment2.centerLon * segment2.locations.length) / totalLocations,
      detectedViaNonlinear: segment1.detectedViaNonlinear || segment2.detectedViaNonlinear,
      confidence: Math.max(segment1.confidence || 0.5, segment2.confidence || 0.5)
    };
  }

  /**
   * Store finalized segments in local database
   */
  async storeTimelineSegments(segments) {
    const stored = [];
    
    for (const segment of segments) {
      try {
        const timelineType = segment.type === 'stationary' ? 'visit' : 'travel';
        
        // Check if segment already exists to avoid duplicates
        const existing = await LocationCacheService.db.getFirstAsync(`
          SELECT id FROM local_timeline_segments 
          WHERE start_time = ? AND end_time = ? AND type = ?
        `, [segment.startTime, segment.endTime, timelineType]);
        
        if (existing) {
          console.log(`⏭️  Segment already exists, skipping: ${timelineType} ${new Date(segment.startTime).toISOString()}`);
          continue;
        }
        
        const result = await LocationCacheService.db.runAsync(`
          INSERT INTO local_timeline_segments (
            type, start_time, end_time, start_latitude, start_longitude,
            end_latitude, end_longitude, center_latitude, center_longitude,
            distance, location_count, confidence, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
        `, [
          timelineType,
          segment.startTime,
          segment.endTime,
          segment.locations[0].coords.latitude,
          segment.locations[0].coords.longitude,
          segment.locations[segment.locations.length - 1].coords.latitude,
          segment.locations[segment.locations.length - 1].coords.longitude,
          segment.centerLat,
          segment.centerLon,
          segment.distanceKm || 0,
          segment.locations.length,
          segment.confidence || 0.5
        ]);
        
        stored.push({
          id: result.lastInsertRowId,
          type: timelineType,
          startTime: segment.startTime,
          endTime: segment.endTime,
          centerLat: segment.centerLat,
          centerLon: segment.centerLon,
          distance: segment.distanceKm || 0,
          locationCount: segment.locations.length,
          confidence: segment.confidence || 0.5,
          detectedViaNonlinear: segment.detectedViaNonlinear || false,
          transportationMode: segment.transportationMode || null
        });
        
        console.log(`📍 Stored ${timelineType} segment: ${new Date(segment.startTime).toISOString()} (${segment.locations.length} points)`);
        
      } catch (error) {
        console.error('❌ Failed to store timeline segment:', error);
        Sentry.captureException(error, {
          tags: { section: 'client_timeline', error_type: 'storage_error' }
        });
      }
    }
    
    return stored;
  }

  // Utility methods

  shouldForceSegmentBreak(currentSegment, location) {
    const timeGap = location.timestamp - currentSegment.endTime;
    return timeGap >= Config.FORCE_SEGMENT_BREAK_GAP;
  }

  shouldConvertMovementToVisit(segment) {
    if (segment.locations.length < 10) return false;
    
    const linearity = this.calculateMovementLinearity(segment.locations);
    const totalDistance = this.calculateTotalDistanceKm(segment.locations) * 1000; // to meters
    const duration = segment.endTime - segment.startTime;
    
    // Calculate area covered
    const lats = segment.locations.map(loc => loc.coords.latitude);
    const lons = segment.locations.map(loc => loc.coords.longitude);
    const latRangeMeters = (Math.max(...lats) - Math.min(...lats)) * 111000;
    const lonRangeMeters = (Math.max(...lons) - Math.min(...lons)) * 111000 * Math.cos(lats[0] * Math.PI / 180);
    const areaRadius = Math.sqrt(latRangeMeters ** 2 + lonRangeMeters ** 2) / 2;
    
    const isNonlinear = linearity <= Config.MOVEMENT_LINEARITY_THRESHOLD;
    const isConstrainedArea = areaRadius <= Config.VISIT_AREA_RADIUS;
    const isMinimalDistance = totalDistance <= Config.MAXIMUM_NONLINEAR_DISTANCE;
    const hasSufficientDuration = duration >= Config.MINIMUM_AREA_VISIT_DURATION;
    
    return isNonlinear && isConstrainedArea && isMinimalDistance && hasSufficientDuration;
  }

  calculateMovementLinearity(locations) {
    if (locations.length < 3) return 1.0;
    
    // Calculate total distance traveled
    let totalDistance = 0;
    for (let i = 0; i < locations.length - 1; i++) {
      totalDistance += this.calculateDistanceMeters(locations[i], locations[i + 1]);
    }
    
    // Calculate straight-line distance
    const straightLineDistance = this.calculateDistanceMeters(
      locations[0], 
      locations[locations.length - 1]
    );
    
    // Linearity = straight line / total distance
    return totalDistance > 0 ? straightLineDistance / totalDistance : 1.0;
  }

  calculateTotalDistanceKm(locations) {
    let total = 0;
    for (let i = 0; i < locations.length - 1; i++) {
      total += this.calculateDistanceKm(locations[i], locations[i + 1]);
    }
    return total;
  }

  calculateDistanceKm(loc1, loc2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(loc2.coords.latitude - loc1.coords.latitude);
    const dLon = this.toRadians(loc2.coords.longitude - loc1.coords.longitude);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(loc1.coords.latitude)) * Math.cos(this.toRadians(loc2.coords.latitude)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  calculateDistanceMeters(loc1, loc2) {
    return this.calculateDistanceKm(loc1, loc2) * 1000;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  inferTransportationMode(speedMs) {
    if (speedMs <= Config.WALKING_SPEED_MAX) return 'walking';
    if (speedMs <= Config.CYCLING_SPEED_MAX) return 'cycling';
    if (speedMs >= Config.VEHICLE_SPEED_MIN) return 'driving';
    return 'unknown';
  }

  /**
   * Get local timeline segments for a time range
   */
  async getLocalTimelineSegments(startTime, endTime) {
    await LocationCacheService.initialize();
    
    try {
      const result = await LocationCacheService.db.getAllAsync(`
        SELECT * FROM local_timeline_segments 
        WHERE start_time >= ? AND start_time <= ?
        ORDER BY start_time ASC
      `, [startTime, endTime]);
      
      return result.map(row => ({
        id: row.id,
        type: row.type,
        startTime: row.start_time,
        endTime: row.end_time,
        centerLat: row.center_latitude,
        centerLon: row.center_longitude,
        distance: row.distance,
        locationCount: row.location_count,
        placeName: row.place_name,
        placeAddress: row.place_address,
        confidence: row.confidence,
        synced: Boolean(row.synced),
        createdAt: new Date(row.created_at * 1000),
        updatedAt: new Date(row.updated_at * 1000)
      }));
    } catch (error) {
      console.error('❌ Failed to get local timeline segments:', error);
      return [];
    }
  }

  /**
   * Process recent unprocessed locations
   */
  async processRecentLocations(hoursBack = 2) {
    const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
    
    await LocationCacheService.initialize();
    
    // Get recent locations that haven't been processed yet
    const locations = await LocationCacheService.db.getAllAsync(`
      SELECT * FROM cached_locations 
      WHERE timestamp >= ? 
      ORDER BY timestamp ASC
    `, [Math.floor(cutoffTime / 1000)]);
    
    if (locations.length === 0) {
      console.log('🔍 No recent locations to process');
      return [];
    }
    
    // Convert to expected format
    const formattedLocations = locations.map(row => ({
      uuid: row.uuid,
      coords: {
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy: row.accuracy,
        speed: row.speed,
        heading: row.heading
      },
      timestamp: row.timestamp * 1000, // Convert to milliseconds
      is_moving: Boolean(row.is_moving),
      activity: row.activity_type ? {
        type: row.activity_type,
        confidence: row.activity_confidence
      } : null
    }));
    
    console.log(`🔄 Processing ${formattedLocations.length} recent locations`);
    return await this.processLocations(formattedLocations);
  }
}

export default new ClientTimelineProcessor();