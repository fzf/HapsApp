import BaseRepository from './BaseRepository';
import LocationCacheService from '../services/LocationCacheService';

/**
 * Repository for location-related data operations
 */
class LocationRepository extends BaseRepository {
  constructor() {
    super('/users/locations', 'location');
  }

  /**
   * Upload locations with local caching fallback
   */
  async uploadLocations(locations) {
    try {
      // Use the dedicated upload endpoint
      return await this.apiService.uploadLocations(locations);
    } catch (error) {
      // Cache locations locally if upload fails
      if (error.isNetworkError || error.isServerError) {
        await LocationCacheService.cacheLocations(locations);
        console.log('Locations cached locally due to upload failure');
      }
      this.handleError(error, 'uploadLocations', { locationCount: locations.length });
    }
  }

  /**
   * Get locations for a specific date range
   */
  async getLocationsByDateRange(startDate, endDate) {
    try {
      const params = {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      };
      return await this.findAll(params);
    } catch (error) {
      this.handleError(error, 'getLocationsByDateRange', { startDate, endDate });
    }
  }

  /**
   * Get recent locations
   */
  async getRecentLocations(limit = 100) {
    try {
      return await this.findPaginated(1, limit, { sort: 'recorded_at', order: 'desc' });
    } catch (error) {
      this.handleError(error, 'getRecentLocations', { limit });
    }
  }

  /**
   * Sync all cached locations to server
   */
  async syncCachedLocations() {
    try {
      const cachedLocations = await LocationCacheService.getUnsyncedLocations();
      
      if (cachedLocations.length === 0) {
        return { synced: 0, message: 'No locations to sync' };
      }

      const result = await this.uploadLocations(cachedLocations);
      
      // Mark locations as synced in local cache
      const locationIds = cachedLocations.map(loc => loc.id);
      await LocationCacheService.markLocationsSynced(locationIds);
      
      return {
        synced: cachedLocations.length,
        result,
        message: `Successfully synced ${cachedLocations.length} locations`
      };
    } catch (error) {
      this.handleError(error, 'syncCachedLocations');
    }
  }

  /**
   * Get location stats for a date range
   */
  async getLocationStats(startDate, endDate) {
    try {
      const params = {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        stats: true,
      };
      return await this.findAll(params);
    } catch (error) {
      this.handleError(error, 'getLocationStats', { startDate, endDate });
    }
  }
}

export default new LocationRepository();