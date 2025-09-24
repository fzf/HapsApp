import * as SQLite from 'expo-sqlite';
import * as Sentry from '@sentry/react-native';

/**
 * LocationCacheService - Local SQLite caching for location data
 * 
 * This service provides Google Timeline-like local caching capabilities:
 * - Stores location data locally first, syncs to server later
 * - Handles offline scenarios gracefully
 * - Implements intelligent batching and sync strategies
 * - Provides local timeline analysis capabilities
 */
class LocationCacheService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.syncInProgress = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      this.db = await SQLite.openDatabaseAsync('haps_locations.db');
      await this.createTables();
      this.isInitialized = true;
      console.log('✅ LocationCacheService initialized');
      
      Sentry.addBreadcrumb({
        message: 'LocationCacheService initialized',
        level: 'info'
      });
    } catch (error) {
      console.error('❌ Failed to initialize LocationCacheService:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_cache', error_type: 'initialization_error' }
      });
      throw error;
    }
  }

  async createTables() {
    // Apply migrations first for existing tables
    await this.applyMigrations();

    // Location cache table - stores all location points locally
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS cached_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        altitude REAL,
        altitude_accuracy REAL,
        speed REAL,
        heading REAL,
        timestamp INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL,
        time_zone TEXT,
        is_moving BOOLEAN DEFAULT 0,
        activity_type TEXT,
        activity_confidence INTEGER,
        battery_level REAL,
        battery_charging BOOLEAN DEFAULT 0,
        payload TEXT, -- JSON string of full background-geolocation payload
        synced BOOLEAN DEFAULT 0,
        sync_attempts INTEGER DEFAULT 0,
        last_sync_attempt INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Heartbeat cache table - stores heartbeat/stationary events
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS cached_heartbeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER,
        battery_level REAL,
        battery_charging BOOLEAN DEFAULT 0,
        activity_type TEXT,
        activity_confidence INTEGER,
        odometer REAL,
        is_moving BOOLEAN DEFAULT 0,
        tracking_enabled BOOLEAN DEFAULT 1,
        timestamp INTEGER NOT NULL,
        payload TEXT, -- JSON string of full heartbeat data
        synced BOOLEAN DEFAULT 0,
        sync_attempts INTEGER DEFAULT 0,
        last_sync_attempt INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (location_id) REFERENCES cached_locations(id)
      )
    `);

    // Local timeline segments (for offline timeline building)
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS local_timeline_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL, -- 'visit' or 'travel'
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        start_latitude REAL,
        start_longitude REAL,
        end_latitude REAL,
        end_longitude REAL,
        center_latitude REAL,
        center_longitude REAL,
        distance REAL DEFAULT 0,
        location_count INTEGER DEFAULT 0,
        place_name TEXT,
        place_address TEXT,
        confidence REAL DEFAULT 0.5,
        is_active BOOLEAN DEFAULT 0,
        visit_radius REAL DEFAULT 150,
        last_updated INTEGER,
        synced BOOLEAN DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create indexes for performance
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON cached_locations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_locations_synced ON cached_locations(synced);
      CREATE INDEX IF NOT EXISTS idx_locations_uuid ON cached_locations(uuid);
      CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON cached_heartbeats(timestamp);
      CREATE INDEX IF NOT EXISTS idx_heartbeats_synced ON cached_heartbeats(synced);
      CREATE INDEX IF NOT EXISTS idx_timeline_time_range ON local_timeline_segments(start_time, end_time);
      CREATE INDEX IF NOT EXISTS idx_timeline_active ON local_timeline_segments(is_active);
      CREATE INDEX IF NOT EXISTS idx_timeline_type ON local_timeline_segments(type);
    `);

    console.log('📁 Database tables created successfully');
  }

  async applyMigrations() {
    try {
      // Check if local_timeline_segments table exists
      const tableExists = await this.db.getFirstAsync(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='local_timeline_segments'
      `);
      
      if (tableExists) {
        console.log('🔄 Checking local_timeline_segments table schema...');
        
        // Check if is_active column exists
        const tableInfo = await this.db.getAllAsync(`PRAGMA table_info(local_timeline_segments)`);
        const hasIsActiveColumn = tableInfo.some(column => column.name === 'is_active');
        
        if (!hasIsActiveColumn) {
          console.log('🔄 Adding is_active column to local_timeline_segments table');
          await this.db.execAsync(`
            ALTER TABLE local_timeline_segments 
            ADD COLUMN is_active BOOLEAN DEFAULT 0
          `);
          console.log('✅ Migration completed: Added is_active column');
        } else {
          console.log('✅ is_active column already exists');
        }
      } else {
        console.log('📝 Table local_timeline_segments does not exist yet, will be created');
      }
    } catch (error) {
      console.log('⚠️ Migration check failed:', error.message);
      // Don't throw here as the table creation will handle it
    }
  }

  /**
   * Cache a location point locally
   */
  async cacheLocation(locationData) {
    if (!this.isInitialized) await this.initialize();

    try {
      const {
        uuid,
        coords,
        timestamp,
        is_moving,
        activity,
        battery,
        ...extraData
      } = locationData;

      // Convert timestamp to Unix timestamp if needed
      const unixTimestamp = typeof timestamp === 'string' 
        ? Math.floor(new Date(timestamp).getTime() / 1000)
        : Math.floor(timestamp / 1000);

      const result = await this.db.runAsync(`
        INSERT OR REPLACE INTO cached_locations (
          uuid, latitude, longitude, accuracy, altitude, altitude_accuracy,
          speed, heading, timestamp, recorded_at, time_zone, is_moving,
          activity_type, activity_confidence, battery_level, battery_charging,
          payload, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `, [
        uuid,
        coords.latitude,
        coords.longitude,
        coords.accuracy || null,
        coords.altitude || null,
        coords.altitudeAccuracy || null,
        coords.speed || null,
        coords.heading || null,
        unixTimestamp,
        unixTimestamp, // recorded_at same as timestamp for now
        extraData.time_zone || null,
        is_moving ? 1 : 0,
        activity?.type || null,
        activity?.confidence || null,
        battery?.level || null,
        battery?.is_charging ? 1 : 0,
        JSON.stringify(locationData)
      ]);

      console.log(`📍 Cached location ${uuid} (ID: ${result.lastInsertRowId})`);
      
      return result.lastInsertRowId;
    } catch (error) {
      console.error('❌ Failed to cache location:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_cache', error_type: 'cache_location_error' }
      });
      throw error;
    }
  }

  /**
   * Cache a heartbeat event locally
   */
  async cacheHeartbeat(heartbeatData, locationId = null) {
    if (!this.isInitialized) await this.initialize();

    try {
      const {
        timestamp,
        battery,
        activity,
        odometer,
        enabled,
        location
      } = heartbeatData;

      const unixTimestamp = typeof timestamp === 'string'
        ? Math.floor(new Date(timestamp).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      const result = await this.db.runAsync(`
        INSERT INTO cached_heartbeats (
          location_id, battery_level, battery_charging, activity_type,
          activity_confidence, odometer, is_moving, tracking_enabled,
          timestamp, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        locationId,
        battery?.level || null,
        battery?.is_charging ? 1 : 0,
        activity?.type || null,
        activity?.confidence || null,
        odometer || null,
        location && location.coords.speed > 0.5 ? 1 : 0,
        enabled ? 1 : 0,
        unixTimestamp,
        JSON.stringify(heartbeatData)
      ]);

      console.log(`💓 Cached heartbeat (ID: ${result.lastInsertRowId})`);
      return result.lastInsertRowId;
    } catch (error) {
      console.error('❌ Failed to cache heartbeat:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_cache', error_type: 'cache_heartbeat_error' }
      });
      throw error;
    }
  }

  /**
   * Get unsynced locations for batch upload
   */
  async getUnsyncedLocations(limit = 50) {
    if (!this.isInitialized) await this.initialize();

    try {
      const result = await this.db.getAllAsync(`
        SELECT * FROM cached_locations 
        WHERE synced = 0 
        ORDER BY timestamp ASC 
        LIMIT ?
      `, [limit]);

      return result.map(row => ({
        id: row.id,
        uuid: row.uuid,
        coords: {
          latitude: row.latitude,
          longitude: row.longitude,
          accuracy: row.accuracy,
          altitude: row.altitude,
          altitudeAccuracy: row.altitude_accuracy,
          speed: row.speed,
          heading: row.heading
        },
        timestamp: row.timestamp * 1000, // Convert back to milliseconds
        recorded_at: new Date(row.recorded_at * 1000).toISOString(),
        time_zone: row.time_zone,
        is_moving: Boolean(row.is_moving),
        activity: row.activity_type ? {
          type: row.activity_type,
          confidence: row.activity_confidence
        } : null,
        battery: row.battery_level !== null ? {
          level: row.battery_level,
          is_charging: Boolean(row.battery_charging)
        } : null,
        payload: row.payload ? JSON.parse(row.payload) : null
      }));
    } catch (error) {
      console.error('❌ Failed to get unsynced locations:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_cache', error_type: 'get_unsynced_error' }
      });
      return [];
    }
  }

  /**
   * Get unsynced heartbeats for batch upload
   */
  async getUnsyncedHeartbeats(limit = 20) {
    if (!this.isInitialized) await this.initialize();

    try {
      const result = await this.db.getAllAsync(`
        SELECT * FROM cached_heartbeats 
        WHERE synced = 0 
        ORDER BY timestamp ASC 
        LIMIT ?
      `, [limit]);

      return result.map(row => ({
        id: row.id,
        location_id: row.location_id,
        timestamp: row.timestamp * 1000,
        battery: row.battery_level !== null ? {
          level: row.battery_level,
          is_charging: Boolean(row.battery_charging)
        } : null,
        activity: row.activity_type ? {
          type: row.activity_type,
          confidence: row.activity_confidence
        } : null,
        odometer: row.odometer,
        is_moving: Boolean(row.is_moving),
        tracking_enabled: Boolean(row.tracking_enabled),
        payload: row.payload ? JSON.parse(row.payload) : null
      }));
    } catch (error) {
      console.error('❌ Failed to get unsynced heartbeats:', error);
      return [];
    }
  }

  /**
   * Mark locations as synced after successful upload
   */
  async markLocationsSynced(locationIds) {
    if (!this.isInitialized) await this.initialize();

    try {
      const placeholders = locationIds.map(() => '?').join(',');
      await this.db.runAsync(`
        UPDATE cached_locations 
        SET synced = 1, updated_at = strftime('%s', 'now')
        WHERE id IN (${placeholders})
      `, locationIds);

      console.log(`✅ Marked ${locationIds.length} locations as synced`);
    } catch (error) {
      console.error('❌ Failed to mark locations as synced:', error);
      Sentry.captureException(error, {
        tags: { section: 'location_cache', error_type: 'mark_synced_error' }
      });
    }
  }

  /**
   * Mark heartbeats as synced after successful upload
   */
  async markHeartbeatsSynced(heartbeatIds) {
    if (!this.isInitialized) await this.initialize();

    try {
      const placeholders = heartbeatIds.map(() => '?').join(',');
      await this.db.runAsync(`
        UPDATE cached_heartbeats 
        SET synced = 1 
        WHERE id IN (${placeholders})
      `, heartbeatIds);

      console.log(`✅ Marked ${heartbeatIds.length} heartbeats as synced`);
    } catch (error) {
      console.error('❌ Failed to mark heartbeats as synced:', error);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats() {
    if (!this.isInitialized) await this.initialize();

    try {
      const [locationStats, heartbeatStats] = await Promise.all([
        this.db.getFirstAsync(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN synced = 0 THEN 1 END) as unsynced,
            MIN(timestamp) as oldest,
            MAX(timestamp) as newest
          FROM cached_locations
        `),
        this.db.getFirstAsync(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN synced = 0 THEN 1 END) as unsynced
          FROM cached_heartbeats
        `)
      ]);

      const stats = {
        locations: {
          total: locationStats.total || 0,
          unsynced: locationStats.unsynced || 0,
          synced: (locationStats.total || 0) - (locationStats.unsynced || 0),
          timeRange: locationStats.oldest && locationStats.newest ? {
            oldest: new Date(locationStats.oldest * 1000),
            newest: new Date(locationStats.newest * 1000),
            spanHours: Math.round((locationStats.newest - locationStats.oldest) / 3600)
          } : null
        },
        heartbeats: {
          total: heartbeatStats.total || 0,
          unsynced: heartbeatStats.unsynced || 0,
          synced: (heartbeatStats.total || 0) - (heartbeatStats.unsynced || 0)
        }
      };

      return stats;
    } catch (error) {
      console.error('❌ Failed to get cache stats:', error);
      return {
        locations: { total: 0, unsynced: 0, synced: 0, timeRange: null },
        heartbeats: { total: 0, unsynced: 0, synced: 0 }
      };
    }
  }

  /**
   * Clean up old synced data to prevent database from growing too large
   */
  async cleanupOldData(retentionDays = 30) {
    if (!this.isInitialized) await this.initialize();

    try {
      const cutoffTime = Math.floor((Date.now() - (retentionDays * 24 * 60 * 60 * 1000)) / 1000);
      
      const [locationsDeleted, heartbeatsDeleted] = await Promise.all([
        this.db.runAsync(`
          DELETE FROM cached_locations 
          WHERE synced = 1 AND timestamp < ?
        `, [cutoffTime]),
        this.db.runAsync(`
          DELETE FROM cached_heartbeats 
          WHERE synced = 1 AND timestamp < ?
        `, [cutoffTime])
      ]);

      console.log(`🧹 Cleaned up ${locationsDeleted.changes} old locations and ${heartbeatsDeleted.changes} old heartbeats`);
      
      return {
        locationsDeleted: locationsDeleted.changes,
        heartbeatsDeleted: heartbeatsDeleted.changes
      };
    } catch (error) {
      console.error('❌ Failed to cleanup old data:', error);
      return { locationsDeleted: 0, heartbeatsDeleted: 0 };
    }
  }
}

// Export singleton instance
export default new LocationCacheService();