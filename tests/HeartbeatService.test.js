// Tests for HeartbeatService, which guarantees a location heartbeat is
// captured/synced at least every 30 minutes.
//
// The original version of this file (see git history) exported a manual
// test-runner function with no `describe`/`it` blocks at all, so Jest never
// collected any actual tests ("Your test suite must contain at least one
// test."). This rewrite converts the same intent (status shape, 30-minute
// interval, forced heartbeat execution) into real Jest tests against the
// current HeartbeatService implementation, and adds coverage for
// start/stop and the network-aware sync/fallback-location branches.
//
// HeartbeatService's real collaborators (LocationCacheService,
// LocationSyncService) hit SQLite/network and are mocked here so this file
// tests HeartbeatService's own logic in isolation.

import HeartbeatService from '../services/HeartbeatService';
import LocationCacheService from '../services/LocationCacheService';
import LocationSyncService from '../services/LocationSyncService';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import * as BackgroundTask from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../services/LocationCacheService', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn().mockResolvedValue(undefined),
    cacheHeartbeat: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../services/LocationSyncService', () => ({
  __esModule: true,
  default: {
    syncNow: jest.fn().mockResolvedValue({ success: true }),
  },
}));

jest.mock('../services/LoggingService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    location: jest.fn(),
    sync: jest.fn(),
    backgroundTask: jest.fn(),
  },
}));

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;

describe('HeartbeatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // HeartbeatService is a singleton (module-level instance), so its state
    // carries over between tests unless reset explicitly.
    HeartbeatService.stopHeartbeatTimer();
    HeartbeatService.isActive = false;
    HeartbeatService.lastHeartbeatTime = null;

    // Restore default mock behavior after clearAllMocks() wipes it.
    Network.getNetworkStateAsync.mockResolvedValue({
      type: 'WIFI',
      isConnected: true,
      isInternetReachable: true,
    });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
      timestamp: Date.now(),
    });
    LocationCacheService.cacheHeartbeat.mockResolvedValue(1);
    LocationSyncService.syncNow.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    HeartbeatService.stopHeartbeatTimer();
  });

  describe('getStatus', () => {
    it('reports the guaranteed 30-minute interval and required fields', async () => {
      const status = await HeartbeatService.getStatus();

      expect(status).toEqual({
        isActive: false,
        intervalMs: HEARTBEAT_INTERVAL_MS,
        lastHeartbeatTime: null,
        timeSinceLastHeartbeat: null,
        timeUntilNextHeartbeat: 0,
        nextHeartbeatDue: false,
        isTaskRegistered: false,
      });
    });
  });

  describe('forceHeartbeat', () => {
    it('executes a heartbeat, caches it, and records the heartbeat time', async () => {
      const result = await HeartbeatService.forceHeartbeat();

      expect(result.success).toBe(true);
      expect(result.location_source).toBe('fresh_location');
      expect(result.has_location).toBe(true);
      expect(LocationCacheService.cacheHeartbeat).toHaveBeenCalledTimes(1);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@haps_last_heartbeat',
        expect.any(String)
      );
      expect(HeartbeatService.lastHeartbeatTime).not.toBeNull();
    });

    it('updates getStatus() to reflect the new heartbeat time', async () => {
      await HeartbeatService.forceHeartbeat();
      const status = await HeartbeatService.getStatus();

      expect(status.lastHeartbeatTime).toBe(HeartbeatService.lastHeartbeatTime);
      expect(status.nextHeartbeatDue).toBe(false);
      expect(status.timeSinceLastHeartbeat).toBeLessThan(1000);
    });

    it('triggers an immediate sync when the network is connected', async () => {
      await HeartbeatService.forceHeartbeat();
      expect(LocationSyncService.syncNow).toHaveBeenCalledWith('heartbeat_sync');
    });

    it('still succeeds but skips sync when there is no network', async () => {
      Network.getNetworkStateAsync.mockResolvedValueOnce({
        type: 'NONE',
        isConnected: false,
        isInternetReachable: false,
      });

      const result = await HeartbeatService.forceHeartbeat();

      expect(result.success).toBe(true);
      expect(LocationSyncService.syncNow).not.toHaveBeenCalled();
    });

    it('falls back to the last known location when a fresh location is unavailable', async () => {
      Location.getCurrentPositionAsync.mockRejectedValueOnce(new Error('location unavailable'));
      Location.getLastKnownPositionAsync.mockResolvedValueOnce({
        coords: { latitude: 1, longitude: 2, accuracy: 5 },
        timestamp: Date.now(),
      });

      const result = await HeartbeatService.forceHeartbeat();

      expect(result.success).toBe(true);
      expect(result.location_source).toBe('last_known_location');
    });

    it('still reports success with no location when both location lookups fail', async () => {
      Location.getCurrentPositionAsync.mockRejectedValueOnce(new Error('no fresh location'));
      // jest-setup's default expo-location mock already rejects
      // getLastKnownPositionAsync, so no override is needed here.

      const result = await HeartbeatService.forceHeartbeat();

      expect(result.success).toBe(true);
      expect(result.location_source).toBe('no_location');
      expect(result.has_location).toBe(false);
    });
  });

  describe('checkAndExecuteHeartbeat', () => {
    it('executes immediately when there is no recorded heartbeat', async () => {
      const executed = await HeartbeatService.checkAndExecuteHeartbeat();

      expect(executed).toBe(true);
      expect(LocationCacheService.cacheHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('skips execution when the last heartbeat was recent', async () => {
      // A few seconds ago rather than exactly `Date.now()`: checkAndExecuteHeartbeat
      // treats a `timeSinceLastHeartbeat` of precisely 0 as falsy and executes
      // anyway (`!timeSinceLastHeartbeat` short-circuits), so this avoids that edge case.
      HeartbeatService.lastHeartbeatTime = Date.now() - 1000;

      const executed = await HeartbeatService.checkAndExecuteHeartbeat();

      expect(executed).toBe(false);
      expect(LocationCacheService.cacheHeartbeat).not.toHaveBeenCalled();
    });
  });

  describe('startHeartbeat / stopHeartbeat', () => {
    it('registers the background task and marks the service active', async () => {
      const started = await HeartbeatService.startHeartbeat();

      expect(started).toBe(true);
      expect(BackgroundTask.registerTaskAsync).toHaveBeenCalled();
      expect(HeartbeatService.isActive).toBe(true);
    });

    it('is idempotent when already active', async () => {
      await HeartbeatService.startHeartbeat();
      BackgroundTask.registerTaskAsync.mockClear();

      const startedAgain = await HeartbeatService.startHeartbeat();

      expect(startedAgain).toBe(true);
      expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
    });

    it('unregisters the background task and marks the service inactive', async () => {
      await HeartbeatService.startHeartbeat();

      const stopped = await HeartbeatService.stopHeartbeat();

      expect(stopped).toBe(true);
      expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalled();
      expect(HeartbeatService.isActive).toBe(false);
    });
  });
});

describe('AppStateContext heartbeat integration', () => {
  it('calls a method that actually exists on HeartbeatService', () => {
    const HeartbeatService = require('../services/HeartbeatService').default;
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../contexts/AppStateContext.js'), 'utf8');
    // Every HeartbeatService.<method>( call in the context must exist on the service
    const calls = [...source.matchAll(/HeartbeatService\.(\w+)\(/g)].map(m => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const method of calls) {
      expect(typeof HeartbeatService[method]).toBe('function');
    }
  });
});
