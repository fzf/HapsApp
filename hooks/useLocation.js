import { useState, useEffect, useCallback } from 'react';
import { useAuthRequest } from './useAuthRequest';
import { LocationService, VisitTrackingService, LocationSyncService } from '../services';

/**
 * Hook for managing location tracking state and operations
 */
export const useLocationTracking = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [locationPermission, setLocationPermission] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const { execute, loading, error, clearError } = useAuthRequest();

  // Check location permission status
  const checkLocationPermission = useCallback(async () => {
    try {
      const hasPermission = await LocationService.checkLocationPermission();
      setLocationPermission(hasPermission);
      return hasPermission;
    } catch (err) {
      console.error('Error checking location permission:', err);
      setLocationPermission(false);
      return false;
    }
  }, []);

  // Request location permissions
  const requestLocationPermission = useCallback(async () => {
    try {
      const granted = await LocationService.requestLocationPermission();
      setLocationPermission(granted);
      return granted;
    } catch (err) {
      console.error('Error requesting location permission:', err);
      setLocationPermission(false);
      return false;
    }
  }, []);

  // Start location tracking
  const startTracking = useCallback(async () => {
    try {
      const hasPermission = await checkLocationPermission();
      if (!hasPermission) {
        throw new Error('Location permission not granted');
      }

      await LocationService.startLocationTracking();
      setIsTracking(true);
      return true;
    } catch (err) {
      console.error('Error starting location tracking:', err);
      setIsTracking(false);
      throw err;
    }
  }, [checkLocationPermission]);

  // Stop location tracking
  const stopTracking = useCallback(async () => {
    try {
      await LocationService.stopLocationTracking();
      setIsTracking(false);
      return true;
    } catch (err) {
      console.error('Error stopping location tracking:', err);
      throw err;
    }
  }, []);

  // Get current location
  const getCurrentLocation = useCallback(async () => {
    try {
      const location = await LocationService.getCurrentLocation();
      setCurrentLocation(location);
      return location;
    } catch (err) {
      console.error('Error getting current location:', err);
      throw err;
    }
  }, []);

  // Sync locations to server
  const syncLocations = useCallback(async () => {
    return execute(async () => {
      return await LocationSyncService.syncAllLocations();
    });
  }, [execute]);

  // Check tracking status on mount
  useEffect(() => {
    const checkTrackingStatus = async () => {
      try {
        const tracking = await LocationService.isLocationTrackingActive();
        setIsTracking(tracking);
      } catch (err) {
        console.error('Error checking tracking status:', err);
        setIsTracking(false);
      }
    };

    checkTrackingStatus();
    checkLocationPermission();
  }, [checkLocationPermission]);

  return {
    isTracking,
    locationPermission,
    currentLocation,
    loading,
    error,
    startTracking,
    stopTracking,
    getCurrentLocation,
    syncLocations,
    requestLocationPermission,
    checkLocationPermission,
    clearError,
  };
};

/**
 * Hook for managing visit tracking
 */
export const useVisitTracking = () => {
  const [activeVisit, setActiveVisit] = useState(null);
  const [recentVisits, setRecentVisits] = useState([]);
  const { execute, loading, error, clearError } = useAuthRequest();

  // Get active visit
  const getActiveVisit = useCallback(async () => {
    try {
      const visit = await VisitTrackingService.getCurrentVisit();
      setActiveVisit(visit);
      return visit;
    } catch (err) {
      console.error('Error getting active visit:', err);
      throw err;
    }
  }, []);

  // Get recent visits
  const getRecentVisits = useCallback(async (limit = 10) => {
    try {
      const visits = await VisitTrackingService.getRecentVisits(limit);
      setRecentVisits(visits);
      return visits;
    } catch (err) {
      console.error('Error getting recent visits:', err);
      throw err;
    }
  }, []);

  // Start a new visit
  const startVisit = useCallback(async (location) => {
    return execute(async () => {
      const visit = await VisitTrackingService.startVisit(location);
      setActiveVisit(visit);
      return visit;
    });
  }, [execute]);

  // End current visit
  const endVisit = useCallback(async () => {
    return execute(async () => {
      const result = await VisitTrackingService.endCurrentVisit();
      setActiveVisit(null);
      // Refresh recent visits
      await getRecentVisits();
      return result;
    });
  }, [execute, getRecentVisits]);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        await getActiveVisit();
        await getRecentVisits();
      } catch (err) {
        console.error('Error loading initial visit data:', err);
      }
    };

    loadInitialData();
  }, [getActiveVisit, getRecentVisits]);

  return {
    activeVisit,
    recentVisits,
    loading,
    error,
    getActiveVisit,
    getRecentVisits,
    startVisit,
    endVisit,
    clearError,
  };
};