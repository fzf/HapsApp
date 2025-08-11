# Heartbeat System for HapsApp

## Overview

The HeartbeatService ensures that user location data is captured and sent to the server **at least every 30 minutes**, regardless of user activity state, device sleep mode, or other sync intervals. This is critical for maintaining location continuity and detecting if the app stops tracking properly.

## Architecture

### Components

1. **HeartbeatService** (`services/HeartbeatService.js`)
   - Main heartbeat coordinator
   - Manages 30-minute guaranteed intervals
   - Handles background task registration
   - Provides fallback location capture

2. **LocationService Integration**
   - Automatically starts/stops heartbeat with location tracking
   - Includes heartbeat status in service status reporting

3. **LocationCacheService Integration** 
   - Stores heartbeat data locally using existing SQLite infrastructure
   - Handles offline scenarios gracefully

4. **LocationSyncService Integration**
   - Syncs cached heartbeat data to server
   - Triggered immediately after heartbeat execution (when online)

### Key Features

- **30-minute guarantee**: Location captured every 30 minutes maximum
- **Background execution**: Uses Expo TaskManager for background tasks
- **Fallback location methods**: Fresh location → last known location → no location
- **Persistent storage**: Remembers last heartbeat time across app restarts
- **Network awareness**: Works offline, syncs when online
- **Activity independence**: Works regardless of user activity state
- **Integration**: Seamlessly works with existing location system

## Implementation Details

### Timing Strategy

The service uses a dual approach for reliability:

1. **Background Task**: Registered with TaskManager for 30-minute intervals
2. **Timer Fallback**: JavaScript timer as backup (cleared/reset as needed)

### Location Capture Strategy

When executing a heartbeat, the service tries multiple location sources:

1. **Fresh Location**: `Location.getCurrentPositionAsync()` with 5-minute max age
2. **Last Known**: `Location.getLastKnownPositionAsync()` with 30-minute max age  
3. **No Location**: Heartbeat sent without location data (still valuable for activity tracking)

### Data Structure

Heartbeat data includes:

```javascript
{
  uuid: "heartbeat-timestamp-random",
  timestamp: 1234567890000,
  type: "guaranteed_heartbeat",
  interval_ms: 1800000, // 30 minutes
  location_source: "fresh_location|last_known_location|no_location",
  location: { /* location coords if available */ },
  activity: { type: "unknown", confidence: 50 },
  battery: null, // Future implementation
  time_zone: "America/New_York",
  enabled: true,
  last_heartbeat_ms_ago: 1800000
}
```

## Usage

### Starting the Heartbeat

The HeartbeatService is automatically started when LocationService starts tracking:

```javascript
import LocationService from './services/LocationService';

// This also starts the heartbeat service
await LocationService.startTracking();
```

### Manual Control

For advanced usage or testing:

```javascript
import HeartbeatService from './services/HeartbeatService';

// Manual start/stop
await HeartbeatService.startHeartbeat();
await HeartbeatService.stopHeartbeat();

// Get status
const status = await HeartbeatService.getStatus();

// Force immediate heartbeat (for testing)
const result = await HeartbeatService.forceHeartbeat();
```

### Status Monitoring

The service provides comprehensive status information:

```javascript
const status = await HeartbeatService.getStatus();
// Returns:
// {
//   isActive: boolean,
//   intervalMs: 1800000,
//   lastHeartbeatTime: timestamp,
//   timeSinceLastHeartbeat: ms,
//   timeUntilNextHeartbeat: ms,
//   nextHeartbeatDue: boolean,
//   isTaskRegistered: boolean
// }
```

## Testing

### Debug Screen

A debug screen (`components/HeartbeatDebugScreen.js`) is available for testing:

- Real-time status monitoring
- Force heartbeat execution
- View last heartbeat results
- Integration with existing location service status

Access the debug screen through the "Heartbeat" tab in the app.

### Manual Testing

Run manual tests using:

```javascript
import { runTests } from './tests/HeartbeatService.test.js';
await runTests();
```

## Integration with Existing System

The HeartbeatService integrates seamlessly with the existing location system:

### LocationService Integration

- `startTracking()` → starts heartbeat service
- `stopTracking()` → stops heartbeat service  
- `getServiceStatus()` → includes heartbeat status

### LocationCacheService Integration

- Uses existing `cached_heartbeats` table
- Follows same caching patterns as location data
- Supports batch operations and cleanup

### LocationSyncService Integration  

- Heartbeats sync using existing sync infrastructure
- Immediate sync triggered after heartbeat execution
- Follows same retry/error handling patterns

## Background Task Considerations

### iOS
- Background tasks work well with proper permissions
- TaskManager handles background execution
- Location permission required for background location access

### Android
- Minimum 15-minute intervals enforced by system
- Foreground service notification required for background location
- Doze mode and battery optimization may affect execution

## Monitoring and Debugging

### Logs
- All heartbeat activity logged to console with 💓 prefix
- Better Stack logging integration for production monitoring
- Sentry integration for error tracking

### Status Indicators
- Service active/inactive status
- Last heartbeat timestamp
- Time until next heartbeat  
- Background task registration status
- Location source for last heartbeat

## Future Enhancements

1. **Battery API Integration**: Add native battery level reporting
2. **Adaptive Intervals**: Adjust frequency based on activity patterns
3. **Network Quality**: Adjust behavior based on connection quality
4. **Health Integration**: Include device health/activity data
5. **Geofence Integration**: Enhanced heartbeats near important locations

## Troubleshooting

### Common Issues

1. **Heartbeats not firing**: Check background permissions and task registration
2. **No location in heartbeats**: Verify location permissions
3. **Service not starting**: Check LocationService integration
4. **Background execution stopped**: Check device battery optimization settings

### Debug Steps

1. Use the HeartbeatDebugScreen for real-time monitoring
2. Check `getStatus()` for service state
3. Verify background task registration
4. Test with `forceHeartbeat()` for immediate execution
5. Check logs for error messages and timing information

The HeartbeatService provides a robust foundation for guaranteed location tracking with comprehensive monitoring, testing, and integration capabilities.