import * as SQLite from 'expo-sqlite';
import LoggingService from './LoggingService';

class TimelineDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    this.db = await SQLite.openDatabaseAsync('timeline.db');
    await this.createTables();
    return this.db;
  }

  async createTables() {
    // Migrate: drop old tables if they used backend_id UNIQUE (single column),
    // which broke items that appear in multiple days' API responses.
    // We now use UNIQUE(backend_id, date) so the same item can be cached
    // under each day it appears in without overwriting each other.
    // Note: execAsync doesn't reliably support multiple statements — run separately.
    await this.db.execAsync('DROP TABLE IF EXISTS visits');
    await this.db.execAsync('DROP TABLE IF EXISTS travels');
    await this.db.execAsync('DROP TABLE IF EXISTS schema_version');

    // Visits table — unique per (backend_id, date) pair
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY,
        backend_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration INTEGER,
        center_latitude REAL,
        center_longitude REAL,
        location_name TEXT,
        location_address TEXT,
        location_latitude REAL,
        location_longitude REAL,
        suggested_locations TEXT,
        synced_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(backend_id, date)
      );
    `);

    // Travels table — unique per (backend_id, date) pair
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS travels (
        id INTEGER PRIMARY KEY,
        backend_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration INTEGER,
        distance REAL,
        center_latitude REAL,
        center_longitude REAL,
        synced_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(backend_id, date)
      );
    `);

    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date);
      CREATE INDEX IF NOT EXISTS idx_travels_date ON travels(date);
    `);
  }

  async saveTimelineData(date, timelineData) {
    await this.init();

    const syncedAt = new Date().toISOString();
    const visits = timelineData.visits || [];
    const travels = timelineData.travels || [];

    LoggingService.info('timeline.db.save_start', {
      date,
      visits: visits.length,
      travels: travels.length,
      visit_ids: visits.map(v => v.id),
      travel_ids: travels.map(t => t.id),
    });

    // Clear existing data for this date
    await this.db.runAsync('DELETE FROM visits WHERE date = ?', [date]);
    await this.db.runAsync('DELETE FROM travels WHERE date = ?', [date]);

    // Insert visits
    for (const visit of visits) {
      try {
        await this.db.runAsync(`
          INSERT OR REPLACE INTO visits (
            backend_id, date, start_time, end_time, duration,
            center_latitude, center_longitude,
            location_name, location_address, location_latitude, location_longitude,
            suggested_locations, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          visit.id, date, visit.start_time, visit.end_time, visit.duration,
          visit.center_latitude, visit.center_longitude,
          visit.location?.name, visit.location?.address,
          visit.location?.latitude, visit.location?.longitude,
          JSON.stringify(visit.suggested_locations || []), syncedAt,
        ]);
      } catch (err) {
        LoggingService.error('timeline.db.visit_insert_failed', err, {
          date, visit_id: visit.id, error: err?.message,
        });
        throw err;
      }
    }

    // Insert travels
    for (const travel of travels) {
      try {
        await this.db.runAsync(`
          INSERT OR REPLACE INTO travels (
            backend_id, date, start_time, end_time, duration, distance,
            center_latitude, center_longitude, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          travel.id, date, travel.start_time, travel.end_time,
          travel.duration, travel.distance,
          travel.center_latitude, travel.center_longitude, syncedAt,
        ]);
      } catch (err) {
        LoggingService.error('timeline.db.travel_insert_failed', err, {
          date, travel_id: travel.id, error: err?.message,
        });
        throw err;
      }
    }

    LoggingService.info('timeline.db.save_complete', { date, visits: visits.length, travels: travels.length });
  }

  async getTimelineForDate(date) {
    await this.init();

    const visits = await this.db.getAllAsync(`
      SELECT * FROM visits WHERE date = ? ORDER BY start_time
    `, [date]);

    const travels = await this.db.getAllAsync(`
      SELECT * FROM travels WHERE date = ? ORDER BY start_time
    `, [date]);

    // Parse suggested_locations JSON and reconstruct nested location object
    const parsedVisits = visits.map(visit => ({
      ...visit,
      location: visit.location_name ? {
        id: null,
        name: visit.location_name,
        address: visit.location_address,
        latitude: visit.location_latitude,
        longitude: visit.location_longitude,
      } : null,
      suggested_locations: visit.suggested_locations ? JSON.parse(visit.suggested_locations) : []
    }));

    return {
      visits: parsedVisits,
      travels
    };
  }

  async getLastSyncDate() {
    await this.init();

    const result = await this.db.getFirstAsync(`
      SELECT MAX(synced_at) as last_sync FROM (
        SELECT synced_at FROM visits
        UNION ALL
        SELECT synced_at FROM travels
      )
    `);

    return result?.last_sync;
  }

  async clearAllData() {
    await this.init();
    await this.db.runAsync('DELETE FROM visits');
    await this.db.runAsync('DELETE FROM travels');
  }

  async getStats() {
    await this.init();
    const [visitRow, travelRow, dateRow] = await Promise.all([
      this.db.getFirstAsync('SELECT COUNT(*) as count FROM visits'),
      this.db.getFirstAsync('SELECT COUNT(*) as count FROM travels'),
      this.db.getFirstAsync(`
        SELECT
          MIN(date) as oldest,
          MAX(date) as newest
        FROM (
          SELECT date FROM visits
          UNION ALL
          SELECT date FROM travels
        )
      `),
    ]);
    return {
      visitCount: visitRow?.count ?? 0,
      travelCount: travelRow?.count ?? 0,
      oldestDate: dateRow?.oldest ?? null,
      newestDate: dateRow?.newest ?? null,
    };
  }
}

export default new TimelineDatabase();
