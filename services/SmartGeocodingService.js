import * as Location from 'expo-location';
import * as Sentry from '@sentry/react-native';
import LocationCacheService from './LocationCacheService';

/**
 * SmartGeocodingService - Intelligent geocoding with local caching
 * 
 * Implements a hybrid geocoding strategy:
 * 1. Check local cache first (proximity-based)
 * 2. Rate-limited client geocoding using Expo Location
 * 3. Queue for server-side geocoding with rich APIs
 * 4. Smart proximity caching to avoid redundant requests
 */

class SmartGeocodingService {
  constructor() {
    this.isInitialized = false;
    this.lastGeocodeTime = 0;
    this.geocodeQueue = [];
    this.rateLimitMs = 60 * 1000; // 1 request per minute (Apple's recommendation)
    this.proximityRadius = 100; // meters - reuse geocodes within this radius
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      await LocationCacheService.initialize();
      await this.createGeocodeCache();
      this.isInitialized = true;
      console.log('✅ SmartGeocodingService initialized');
      
      Sentry.addBreadcrumb({
        message: 'SmartGeocodingService initialized',
        level: 'info'
      });
    } catch (error) {
      console.error('❌ Failed to initialize SmartGeocodingService:', error);
      Sentry.captureException(error, {
        tags: { section: 'smart_geocoding', error_type: 'initialization_error' }
      });
      throw error;
    }
  }

  async createGeocodeCache() {
    // Create geocode cache table
    await LocationCacheService.db.execAsync(`
      CREATE TABLE IF NOT EXISTS geocode_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        place_name TEXT,
        place_address TEXT,
        place_type TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        postal_code TEXT,
        street TEXT,
        confidence REAL DEFAULT 0.5,
        source TEXT DEFAULT 'expo_location', -- 'expo_location', 'server', 'manual'
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER, -- Optional expiration for geocodes
        UNIQUE(latitude, longitude) ON CONFLICT REPLACE
      )
    `);

    // Create spatial index for proximity searches
    await LocationCacheService.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_geocode_spatial ON geocode_cache(latitude, longitude);
      CREATE INDEX IF NOT EXISTS idx_geocode_expires ON geocode_cache(expires_at);
    `);

    // Create geocoding queue table for server requests
    await LocationCacheService.db.execAsync(`
      CREATE TABLE IF NOT EXISTS geocoding_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timeline_segment_id INTEGER,
        priority INTEGER DEFAULT 1, -- 1=low, 2=medium, 3=high
        requested_at INTEGER DEFAULT (strftime('%s', 'now')),
        attempts INTEGER DEFAULT 0,
        last_attempt_at INTEGER,
        status TEXT DEFAULT 'pending' -- 'pending', 'processing', 'completed', 'failed'
      )
    `);

    console.log('📍 Geocoding cache tables created');
  }

  /**
   * Main geocoding method - tries cache, then client, then queues for server
   */
  async geocodeLocation(latitude, longitude, options = {}) {
    if (!this.isInitialized) await this.initialize();

    try {
      console.log(`🔍 Geocoding location: ${latitude}, ${longitude}`);

      // Step 1: Check local cache first
      const cached = await this.getCachedGeocode(latitude, longitude);
      if (cached) {
        console.log(`📍 Found cached geocode: ${cached.place_name || 'Unknown'}`);
        return {
          success: true,
          location: cached,
          source: 'cache'
        };
      }

      // Step 2: Check if we can do client-side geocoding (rate limiting)
      if (this.canGeocodeNow() && !options.forceServerQueue) {
        try {
          const clientResult = await this.clientGeocode(latitude, longitude);
          if (clientResult.success) {
            // Cache the result for future use
            await this.cacheGeocode(latitude, longitude, clientResult.location, 'expo_location');
            console.log(`📍 Client geocoded: ${clientResult.location.place_name || 'Unknown'}`);
            return clientResult;
          }
        } catch (error) {
          console.warn('⚠️ Client geocoding failed, falling back to server queue:', error);
        }
      }

      // Step 3: Queue for server-side geocoding
      await this.queueServerGeocode(latitude, longitude, options);
      console.log(`⏳ Queued for server geocoding: ${latitude}, ${longitude}`);

      return {
        success: false,
        pending: true,
        message: 'Queued for server-side geocoding'
      };

    } catch (error) {
      console.error('❌ Geocoding failed:', error);
      Sentry.captureException(error, {
        tags: { section: 'smart_geocoding', error_type: 'geocoding_error' },
        extra: { latitude, longitude }
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check local cache for nearby geocodes
   */
  async getCachedGeocode(latitude, longitude) {
    try {
      // Search for geocodes within proximity radius
      const cached = await LocationCacheService.db.getAllAsync(`
        SELECT *, 
          ((latitude - ?) * 111000) * ((latitude - ?) * 111000) +
          ((longitude - ?) * 111000 * COS(? * 3.14159 / 180)) * ((longitude - ?) * 111000 * COS(? * 3.14159 / 180)) as distance_squared
        FROM geocode_cache
        WHERE (expires_at IS NULL OR expires_at > strftime('%s', 'now'))
        ORDER BY distance_squared ASC
        LIMIT 1
      `, [latitude, latitude, longitude, latitude, longitude, latitude]);

      if (cached.length > 0) {
        const result = cached[0];
        const distanceMeters = Math.sqrt(result.distance_squared);
        
        if (distanceMeters <= this.proximityRadius) {
          return {
            id: result.id,
            place_name: result.place_name,
            place_address: result.place_address,
            place_type: result.place_type,
            country: result.country,
            region: result.region,
            city: result.city,
            postal_code: result.postal_code,
            street: result.street,
            confidence: result.confidence,
            source: result.source,
            distance_from_query: distanceMeters,
            created_at: new Date(result.created_at * 1000)
          };
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Failed to get cached geocode:', error);
      return null;
    }
  }

  /**
   * Perform client-side geocoding using Expo Location
   */
  async clientGeocode(latitude, longitude) {
    try {
      // Check permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission not granted');
      }

      console.log(`🔍 Client geocoding: ${latitude}, ${longitude}`);
      
      const geocoded = await Location.reverseGeocodeAsync({
        latitude,
        longitude
      });

      this.lastGeocodeTime = Date.now();

      if (geocoded && geocoded.length > 0) {
        const result = geocoded[0];
        
        const location = {
          place_name: this.buildPlaceName(result),
          place_address: this.buildAddress(result),
          place_type: this.inferPlaceType(result),
          country: result.country,
          region: result.region,
          city: result.city,
          postal_code: result.postalCode,
          street: result.street,
          confidence: 0.7, // Moderate confidence for client geocoding
          source: 'expo_location'
        };

        return {
          success: true,
          location: location
        };
      } else {
        return {
          success: false,
          error: 'No geocoding results found'
        };
      }

    } catch (error) {
      console.error('❌ Client geocoding failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cache geocoding result locally
   */
  async cacheGeocode(latitude, longitude, locationData, source = 'expo_location') {
    try {
      // Set expiration time (30 days for client geocodes, longer for server)
      const expirationHours = source === 'server' ? 24 * 90 : 24 * 30; // 90 days for server, 30 for client
      const expiresAt = Math.floor(Date.now() / 1000) + (expirationHours * 60 * 60);

      await LocationCacheService.db.runAsync(`
        INSERT OR REPLACE INTO geocode_cache (
          latitude, longitude, place_name, place_address, place_type,
          country, region, city, postal_code, street, confidence,
          source, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `, [
        latitude,
        longitude,
        locationData.place_name,
        locationData.place_address,
        locationData.place_type,
        locationData.country,
        locationData.region,
        locationData.city,
        locationData.postal_code,
        locationData.street,
        locationData.confidence,
        source,
        expiresAt
      ]);

      console.log(`💾 Cached geocode: ${locationData.place_name || 'Unknown'}`);
    } catch (error) {
      console.error('❌ Failed to cache geocode:', error);
    }
  }

  /**
   * Queue location for server-side geocoding
   */
  async queueServerGeocode(latitude, longitude, options = {}) {
    try {
      // Check if already queued
      const existing = await LocationCacheService.db.getFirstAsync(`
        SELECT id FROM geocoding_queue 
        WHERE latitude = ? AND longitude = ? AND status IN ('pending', 'processing')
      `, [latitude, longitude]);

      if (existing) {
        console.log('📋 Location already queued for geocoding');
        return;
      }

      const priority = options.priority || 1;
      const timelineSegmentId = options.timelineSegmentId || null;

      await LocationCacheService.db.runAsync(`
        INSERT INTO geocoding_queue (
          latitude, longitude, timeline_segment_id, priority, requested_at
        ) VALUES (?, ?, ?, ?, strftime('%s', 'now'))
      `, [latitude, longitude, timelineSegmentId, priority]);

      console.log(`⏳ Queued for server geocoding (priority ${priority})`);
    } catch (error) {
      console.error('❌ Failed to queue server geocode:', error);
    }
  }

  /**
   * Get pending geocoding requests for server sync
   */
  async getPendingGeocodeRequests(limit = 20) {
    if (!this.isInitialized) await this.initialize();

    try {
      const pending = await LocationCacheService.db.getAllAsync(`
        SELECT * FROM geocoding_queue 
        WHERE status = 'pending'
        ORDER BY priority DESC, requested_at ASC
        LIMIT ?
      `, [limit]);

      return pending.map(row => ({
        id: row.id,
        latitude: row.latitude,
        longitude: row.longitude,
        timelineSegmentId: row.timeline_segment_id,
        priority: row.priority,
        requestedAt: new Date(row.requested_at * 1000),
        attempts: row.attempts
      }));
    } catch (error) {
      console.error('❌ Failed to get pending geocode requests:', error);
      return [];
    }
  }

  /**
   * Process server geocoding response
   */
  async processServerGeocodeResponse(requestId, locationData) {
    try {
      // Get the request details
      const request = await LocationCacheService.db.getFirstAsync(`
        SELECT * FROM geocoding_queue WHERE id = ?
      `, [requestId]);

      if (!request) {
        console.warn('⚠️ Geocode request not found:', requestId);
        return;
      }

      // Cache the server result
      await this.cacheGeocode(
        request.latitude,
        request.longitude,
        locationData,
        'server'
      );

      // Update timeline segment if applicable
      if (request.timeline_segment_id) {
        await LocationCacheService.db.runAsync(`
          UPDATE local_timeline_segments 
          SET place_name = ?, place_address = ?, updated_at = strftime('%s', 'now')
          WHERE id = ?
        `, [
          locationData.place_name,
          locationData.place_address,
          request.timeline_segment_id
        ]);
      }

      // Mark request as completed
      await LocationCacheService.db.runAsync(`
        UPDATE geocoding_queue 
        SET status = 'completed' 
        WHERE id = ?
      `, [requestId]);

      console.log(`✅ Processed server geocode response for request ${requestId}`);
    } catch (error) {
      console.error('❌ Failed to process server geocode response:', error);
    }
  }

  /**
   * Geocode a timeline segment
   */
  async geocodeTimelineSegment(segment) {
    const result = await this.geocodeLocation(
      segment.centerLat,
      segment.centerLon,
      {
        timelineSegmentId: segment.id,
        priority: segment.type === 'visit' ? 2 : 1 // Higher priority for visits
      }
    );

    if (result.success && result.location) {
      // Update the segment with place information
      await LocationCacheService.db.runAsync(`
        UPDATE local_timeline_segments 
        SET place_name = ?, place_address = ?, updated_at = strftime('%s', 'now')
        WHERE id = ?
      `, [
        result.location.place_name,
        result.location.place_address,
        segment.id
      ]);

      return {
        ...segment,
        placeName: result.location.place_name,
        placeAddress: result.location.place_address
      };
    }

    return segment;
  }

  // Utility methods

  canGeocodeNow() {
    const timeSinceLastGeocode = Date.now() - this.lastGeocodeTime;
    return timeSinceLastGeocode >= this.rateLimitMs;
  }

  buildPlaceName(geocodeResult) {
    // Build a human-readable place name
    const parts = [];
    
    if (geocodeResult.name) parts.push(geocodeResult.name);
    if (geocodeResult.street) parts.push(geocodeResult.street);
    if (geocodeResult.city) parts.push(geocodeResult.city);
    
    return parts.length > 0 ? parts.join(', ') : 'Unknown Location';
  }

  buildAddress(geocodeResult) {
    // Build a full address string
    const parts = [];
    
    if (geocodeResult.streetNumber) parts.push(geocodeResult.streetNumber);
    if (geocodeResult.street) parts.push(geocodeResult.street);
    if (geocodeResult.city) parts.push(geocodeResult.city);
    if (geocodeResult.region) parts.push(geocodeResult.region);
    if (geocodeResult.postalCode) parts.push(geocodeResult.postalCode);
    if (geocodeResult.country) parts.push(geocodeResult.country);
    
    return parts.join(', ');
  }

  inferPlaceType(geocodeResult) {
    // Infer place type from available data
    if (geocodeResult.name) {
      const name = geocodeResult.name.toLowerCase();
      if (name.includes('home') || name.includes('house')) return 'residence';
      if (name.includes('office') || name.includes('work')) return 'workplace';
      if (name.includes('school') || name.includes('university')) return 'education';
      if (name.includes('hospital') || name.includes('clinic')) return 'healthcare';
      if (name.includes('restaurant') || name.includes('cafe')) return 'restaurant';
      if (name.includes('shop') || name.includes('store') || name.includes('mall')) return 'retail';
    }
    
    return 'generic';
  }

  /**
   * Clean up expired geocodes and completed requests
   */
  async cleanupExpiredData() {
    try {
      const now = Math.floor(Date.now() / 1000);
      
      // Clean expired geocodes
      const geocodesDeleted = await LocationCacheService.db.runAsync(`
        DELETE FROM geocode_cache WHERE expires_at IS NOT NULL AND expires_at < ?
      `, [now]);
      
      // Clean old completed/failed geocoding requests (keep for 7 days)
      const requestsDeleted = await LocationCacheService.db.runAsync(`
        DELETE FROM geocoding_queue 
        WHERE status IN ('completed', 'failed') 
        AND requested_at < ?
      `, [now - (7 * 24 * 60 * 60)]);
      
      console.log(`🧹 Cleaned up ${geocodesDeleted.changes} expired geocodes and ${requestsDeleted.changes} old requests`);
      
      return {
        geocodesDeleted: geocodesDeleted.changes,
        requestsDeleted: requestsDeleted.changes
      };
    } catch (error) {
      console.error('❌ Failed to cleanup expired data:', error);
      return { geocodesDeleted: 0, requestsDeleted: 0 };
    }
  }

  /**
   * Get geocoding statistics
   */
  async getStats() {
    try {
      const [cacheStats, queueStats] = await Promise.all([
        LocationCacheService.db.getFirstAsync(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN source = 'expo_location' THEN 1 END) as client_geocodes,
            COUNT(CASE WHEN source = 'server' THEN 1 END) as server_geocodes,
            COUNT(CASE WHEN expires_at IS NULL OR expires_at > strftime('%s', 'now') THEN 1 END) as valid
          FROM geocode_cache
        `),
        LocationCacheService.db.getFirstAsync(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
          FROM geocoding_queue
        `)
      ]);

      return {
        cache: {
          total: cacheStats.total || 0,
          clientGeocodes: cacheStats.client_geocodes || 0,
          serverGeocodes: cacheStats.server_geocodes || 0,
          valid: cacheStats.valid || 0,
          expired: (cacheStats.total || 0) - (cacheStats.valid || 0)
        },
        queue: {
          total: queueStats.total || 0,
          pending: queueStats.pending || 0,
          completed: queueStats.completed || 0,
          failed: queueStats.failed || 0
        }
      };
    } catch (error) {
      console.error('❌ Failed to get geocoding stats:', error);
      return {
        cache: { total: 0, clientGeocodes: 0, serverGeocodes: 0, valid: 0, expired: 0 },
        queue: { total: 0, pending: 0, completed: 0, failed: 0 }
      };
    }
  }
}

export default new SmartGeocodingService();