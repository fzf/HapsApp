import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import * as Sentry from '@sentry/react-native';
import { LocationService, HeartbeatService } from '../services';
import LoggingService from '../services/LoggingService';

const AppStateContext = createContext();

// Module-level registry so services can notify without importing React context
// (avoids circular import issues; LocationSyncService uses this)
export const SyncStatusRegistry = { notify: null };

// App state reducer
const appStateReducer = (state, action) => {
  switch (action.type) {
    case 'SET_APP_STATE':
      return { ...state, appState: action.payload };
    case 'SET_NETWORK_STATE':
      return { ...state, networkState: action.payload };
    case 'SET_LOCATION_PERMISSION':
      return { ...state, locationPermission: action.payload };
    case 'SET_LOCATION_TRACKING':
      return { ...state, isTrackingLocation: action.payload };
    case 'SET_SYNC_STATUS':
      return { ...state, syncStatus: action.payload };
    case 'SET_LAST_SYNC':
      return { ...state, lastSyncTime: action.payload };
    case 'INCREMENT_SYNC_ERRORS':
      return { ...state, syncErrorCount: state.syncErrorCount + 1 };
    case 'RESET_SYNC_ERRORS':
      return { ...state, syncErrorCount: 0 };
    case 'SET_CURRENT_LOCATION':
      return { ...state, currentLocation: action.payload };
    case 'SET_HEARTBEAT_STATUS':
      return { ...state, heartbeatStatus: action.payload };
    default:
      return state;
  }
};

const initialState = {
  // AppState.currentState can be null briefly at startup; a null here made the
  // change listener's .match() throw inside a native event callback, killing
  // the app as a fatal jsi::JSError (Sentry MOBILE-38).
  appState: AppState.currentState || 'unknown',
  networkState: { isConnected: true, isInternetReachable: true, type: 'unknown' },
  locationPermission: null,
  isTrackingLocation: false,
  syncStatus: 'idle', // idle, syncing, success, error
  lastSyncTime: null,
  syncErrorCount: 0,
  currentLocation: null,
  heartbeatStatus: 'idle', // idle, active, error
};

/**
 * App state provider that manages global application state
 */
export const AppStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appStateReducer, initialState);

  // Handle app state changes
  useEffect(() => {
    // A synchronous throw in this callback runs inside a native event dispatch:
    // no error boundary applies and the app dies as a fatal jsi::JSError
    // (Sentry MOBILE-38), so the whole body is guarded.
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      try {
        LoggingService.info('App state changed', {
          event_type: 'app_state',
          action: 'state_change',
          previous_state: state.appState,
          new_state: nextAppState,
        });

        dispatch({ type: 'SET_APP_STATE', payload: nextAppState });

        // Handle app becoming active
        if (state.appState.match(/inactive|background/) && nextAppState === 'active') {
          handleAppBecameActive();
        }

        // Handle app going to background
        if (nextAppState.match(/inactive|background/)) {
          handleAppWentToBackground();
        }
      } catch (error) {
        Sentry.captureException(error, {
          tags: { section: 'app_state', error_type: 'app_state_change_error' },
        });
      }
    });

    return () => subscription?.remove();
  }, [state.appState]);

  // Handle network state changes
  useEffect(() => {
    let subscription;

    const setupNetworkListener = async () => {
      // Get initial network state
      const networkState = await Network.getNetworkStateAsync();
      dispatch({ type: 'SET_NETWORK_STATE', payload: networkState });

      // Set up network state listener. Same guard rationale as the AppState
      // listener above: a sync throw here runs inside a native event dispatch
      // and kills the app as a fatal jsi::JSError.
      subscription = Network.addNetworkStateListener((networkState) => {
        try {
          LoggingService.info('Network state changed', {
            event_type: 'network',
            action: 'state_change',
            network_state: networkState,
          });

          dispatch({ type: 'SET_NETWORK_STATE', payload: networkState });
        } catch (error) {
          Sentry.captureException(error, {
            tags: { section: 'app_state', error_type: 'network_state_change_error' },
          });
        }
      });
    };

    setupNetworkListener();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  // Check location permission status
  const checkLocationPermission = async () => {
    try {
      const hasPermission = await LocationService.checkLocationPermission();
      dispatch({ type: 'SET_LOCATION_PERMISSION', payload: hasPermission });
      return hasPermission;
    } catch (error) {
      LoggingService.error('Failed to check location permission', error);
      dispatch({ type: 'SET_LOCATION_PERMISSION', payload: false });
      return false;
    }
  };

  // Check location tracking status
  const checkLocationTracking = async () => {
    try {
      // Check if the background location task is registered with the OS
      // (more reliable than in-memory flag which resets on cold start)
      const TaskManager = require('expo-task-manager');
      const { LOCATION_TASK_NAME } = require('../taskDefinitions');
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME).catch(() => false);
      const isServiceTracking = await LocationService.isLocationTrackingActive();
      const isTracking = isTaskRegistered || isServiceTracking;
      dispatch({ type: 'SET_LOCATION_TRACKING', payload: isTracking });
      return isTracking;
    } catch (error) {
      LoggingService.error('Failed to check location tracking status', error);
      dispatch({ type: 'SET_LOCATION_TRACKING', payload: false });
      return false;
    }
  };

  // Update sync status
  const updateSyncStatus = (status, error = null) => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: status });
    
    if (status === 'success') {
      dispatch({ type: 'SET_LAST_SYNC', payload: new Date() });
      dispatch({ type: 'RESET_SYNC_ERRORS' });
    } else if (status === 'error') {
      dispatch({ type: 'INCREMENT_SYNC_ERRORS' });
      LoggingService.error('Sync error occurred', error);
    }
  };

  // Update current location
  const updateCurrentLocation = (location) => {
    dispatch({ type: 'SET_CURRENT_LOCATION', payload: location });
  };

  // Update heartbeat status
  const updateHeartbeatStatus = (status) => {
    dispatch({ type: 'SET_HEARTBEAT_STATUS', payload: status });
  };

  // Handle app becoming active
  const handleAppBecameActive = async () => {
    LoggingService.info('App became active - refreshing state');
    
    // Refresh all status checks
    await Promise.all([
      checkLocationPermission(),
      checkLocationTracking(),
    ]);
    
    // Resume heartbeat service if it was running
    if (state.heartbeatStatus === 'active') {
      try {
        await HeartbeatService.startHeartbeat();
      } catch (error) {
        LoggingService.error('Failed to resume heartbeat service', error);
      }
    }
  };

  // Handle app going to background
  const handleAppWentToBackground = () => {
    LoggingService.info('App went to background');
    
    // Background tasks are handled by the services themselves
    // This is mainly for logging and state tracking
  };

  // Initialize app state on mount
  useEffect(() => {
    const initializeAppState = async () => {
      await Promise.all([
        checkLocationPermission(),
        checkLocationTracking(),
      ]);
    };

    initializeAppState();
  }, []);

  // Register a global callback so LocationSyncService can update sync status
  // without importing the context (avoids circular deps)
  React.useEffect(() => {
    SyncStatusRegistry.notify = updateSyncStatus;
    // Also keep legacy path for any code still using this
    AppStateContext._updateSyncStatus = updateSyncStatus;
    return () => {
      SyncStatusRegistry.notify = null;
      AppStateContext._updateSyncStatus = null;
    };
  }, [updateSyncStatus]);

  const value = {
    ...state,
    // Actions
    checkLocationPermission,
    checkLocationTracking,
    updateSyncStatus,
    updateCurrentLocation,
    updateHeartbeatStatus,
    // Computed values
    isOnline: state.networkState.isConnected && state.networkState.isInternetReachable,
    canSync: state.networkState.isConnected && state.networkState.isInternetReachable,
    isAppActive: state.appState === 'active',
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
};