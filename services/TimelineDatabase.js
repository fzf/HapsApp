import * as SQLite from 'expo-sqlite';

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
    // Visits table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY,
        backend_id INTEGER UNIQUE,
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
        suggested_locations TEXT, -- JSON string
        synced_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Travels table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS travels (
        id INTEGER PRIMARY KEY,
        backend_id INTEGER UNIQUE,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration INTEGER,
        distance REAL,
        center_latitude REAL,
        center_longitude REAL,
        synced_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better query performance
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date);
      CREATE INDEX IF NOT EXISTS idx_travels_date ON travels(date);
      CREATE INDEX IF NOT EXISTS idx_visits_backend_id ON visits(backend_id);
      CREATE INDEX IF NOT EXISTS idx_travels_backend_id ON travels(backend_id);
    `);
  }

  async saveTimelineData(date, timelineData) {
    await this.init();

    const syncedAt = new Date().toISOString();

    // Clear existing data for this date
    await this.db.runAsync('DELETE FROM visits WHERE date = ?', [date]);
    await this.db.runAsync('DELETE FROM travels WHERE date = ?', [date]);

    // Insert visits
    for (const visit of timelineData.visits) {
      await this.db.runAsync(`
        INSERT INTO visits (
          backend_id, date, start_time, end_time, duration,
          center_latitude, center_longitude,
          location_name, location_address, location_latitude, location_longitude,
          suggested_locations, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        visit.id,
        date,
        visit.start_time,
        visit.end_time,
        visit.duration,
        visit.center_latitude,
        visit.center_longitude,
        visit.location?.name,
        visit.location?.address,
        visit.location?.latitude,
        visit.location?.longitude,
        JSON.stringify(visit.suggested_locations || []),
        syncedAt
      ]);
    }

    // Insert travels
    for (const travel of timelineData.travels) {
      await this.db.runAsync(`
        INSERT INTO travels (
          backend_id, date, start_time, end_time, duration, distance,
          center_latitude, center_longitude, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        travel.id,
        date,
        travel.start_time,
        travel.end_time,
        travel.duration,
        travel.distance,
        travel.center_latitude,
        travel.center_longitude,
        syncedAt
      ]);
    }
  }

  async getTimelineForDate(date) {
    await this.init();

    const visits = await this.db.getAllAsync(`
      SELECT * FROM visits WHERE date = ? ORDER BY start_time
    `, [date]);

    const travels = await this.db.getAllAsync(`
      SELECT * FROM travels WHERE date = ? ORDER BY start_time
    `, [date]);

    // Parse suggested_locations JSON
    const parsedVisits = visits.map(visit => ({
      ...visit,
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
}

export default new TimelineDatabase();
