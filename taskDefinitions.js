import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Sentry from '@sentry/react-native';

// Task names - keep in sync with service files
const LOCATION_TASK_NAME = 'background-location-task';
const BACKGROUND_TASK_NAME = 'background-sync-task';
const HEARTBEAT_TASK_NAME = 'background-heartbeat-task';

/**
 * Define all background tasks here to ensure they're available when needed
 * This file should be imported early in the app lifecycle
 */

// Background location task
TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error('❌ Background location task error:', error);
    Sentry.captureException(error, {
      tags: { section: 'background_location', error_type: 'task_error' }
    });
    return;
  }

  if (data) {
    const { locations } = data;
    console.log('📍 Background location received:', locations?.length || 0, 'locations');
    
    // We can't directly import services here due to potential circular dependencies
    // The LocationService will handle these through its background location handler
    if (locations && locations.length > 0) {
      // Just log for now - the actual handling will be done by LocationService
      console.log('📍 Processing background locations...');
    }
  }
});

// Background task for heartbeats and sync
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    console.log('🔄 Background sync task executing...');
    
    // Return success for now - the actual sync logic will be handled by services
    // when they detect this task running
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('❌ Background sync task error:', error);
    Sentry.captureException(error, {
      tags: { section: 'background_sync', error_type: 'task_error' }
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Heartbeat task
TaskManager.defineTask(HEARTBEAT_TASK_NAME, async ({ data, error }) => {
  try {
    if (error) {
      console.error('❌ Heartbeat task error:', error);
      Sentry.captureException(error, {
        tags: { section: 'heartbeat', error_type: 'task_error' }
      });
      return;
    }

    console.log('💓 Heartbeat task executed');
    
    // Return success - actual heartbeat logic handled by HeartbeatService
    return;
  } catch (error) {
    console.error('❌ Heartbeat task execution error:', error);
    Sentry.captureException(error, {
      tags: { section: 'heartbeat', error_type: 'execution_error' }
    });
  }
});

console.log('✅ Background tasks defined:', {
  location: LOCATION_TASK_NAME,
  background: BACKGROUND_TASK_NAME,
  heartbeat: HEARTBEAT_TASK_NAME
});

// Export task names for use by services
export {
  LOCATION_TASK_NAME,
  BACKGROUND_TASK_NAME,
  HEARTBEAT_TASK_NAME
};