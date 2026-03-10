import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Sentry from '@sentry/react-native';

// Task names — imported by LocationService and HeartbeatService
export const LOCATION_TASK_NAME   = 'background-location-task';
export const BACKGROUND_TASK_NAME = 'background-sync-task';
export const HEARTBEAT_TASK_NAME  = 'background-heartbeat-task';

/**
 * All background task handlers must be defined at module evaluation time
 * (before the app registers), so this file is imported early in App.js.
 *
 * Services are loaded via require() inside each handler to avoid circular
 * dependencies and to ensure they are fully initialised before being called.
 *
 * Do NOT use `await import()` here — dynamic ESM imports are unreliable in
 * React Native background contexts (Metro bundles everything synchronously).
 */

// ─── Background location updates ────────────────────────────────────────────
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[BG:location] Task error:', error.message);
    Sentry.captureException(error, {
      tags: { section: 'background_location', error_type: 'task_error' },
    });
    return;
  }

  if (!data?.locations?.length) return;

  try {
    const LocationService = require('./services/LocationService').default;
    await LocationService.handleBackgroundLocations(data.locations);
    console.log('[BG:location] Processed', data.locations.length, 'location(s)');
  } catch (err) {
    console.error('[BG:location] Failed to process locations:', err.message);
    Sentry.captureException(err, {
      tags: { section: 'background_location', error_type: 'processing_error' },
      extra: { locationCount: data.locations.length },
    });
  }
});

// ─── Periodic background sync (uploads cached locations + heartbeats) ────────
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    console.log('[BG:sync] Task executing...');
    const LocationSyncService = require('./services/LocationSyncService').default;
    await LocationSyncService.syncNow('background_task');
    console.log('[BG:sync] Sync complete');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.error('[BG:sync] Sync failed:', err.message);
    Sentry.captureException(err, {
      tags: { section: 'background_sync', error_type: 'task_error' },
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// ─── Heartbeat (ensures a location ping is sent every ~30 min) ───────────────
TaskManager.defineTask(HEARTBEAT_TASK_NAME, async ({ error }) => {
  if (error) {
    console.error('[BG:heartbeat] Task error:', error.message);
    Sentry.captureException(error, {
      tags: { section: 'heartbeat', error_type: 'task_error' },
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }

  try {
    console.log('[BG:heartbeat] Task executing...');
    const HeartbeatService = require('./services/HeartbeatService').default;
    await HeartbeatService.executeHeartbeat();
    console.log('[BG:heartbeat] Complete');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.error('[BG:heartbeat] Failed:', err.message);
    Sentry.captureException(err, {
      tags: { section: 'heartbeat', error_type: 'execution_error' },
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

console.log('[Tasks] Registered:', LOCATION_TASK_NAME, BACKGROUND_TASK_NAME, HEARTBEAT_TASK_NAME);
