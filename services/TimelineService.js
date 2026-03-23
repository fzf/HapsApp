import TimelineDatabase from './TimelineDatabase';
import APIService from './APIService';
import LoggingService from './LoggingService';

// Build YYYY-MM-DD in local time (toISOString() is UTC and can give wrong date)
function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

class TimelineService {
  constructor() {
    // No longer need to store API_URL since we use APIService
  }

  async fetchTimelineForDate(date, authToken) {
    const dateString = toLocalDateString(date);
    LoggingService.info('timeline.fetch.start', { date: dateString });

    try {
      APIService.setCachedAuthToken(authToken);

      const data = await APIService.getTimelineForDate(dateString);

      const totalItems = data.timeline?.length ?? 0;
      const visits = data.timeline ? data.timeline.filter(item => item.type === 'visit') : (data.visits || []);
      const travels = data.timeline ? data.timeline.filter(item => item.type === 'travel') : (data.travels || []);

      LoggingService.info('timeline.fetch.api_success', {
        date: dateString,
        total_items: totalItems,
        visits: visits.length,
        travels: travels.length,
        has_timeline_key: !!data.timeline,
        visit_ids: visits.map(v => v.id),
        travel_ids: travels.map(t => t.id),
      });

      const convertedData = { ...data, visits, travels };

      // Save to local database
      try {
        await TimelineDatabase.saveTimelineData(dateString, convertedData);
        LoggingService.info('timeline.cache.save_success', { date: dateString, visits: visits.length, travels: travels.length });
      } catch (saveError) {
        LoggingService.error('timeline.cache.save_failed', saveError, {
          date: dateString,
          visits: visits.length,
          travels: travels.length,
          error: saveError?.message,
        });
        // Don't throw — save failure shouldn't block returning good data
      }

      return convertedData;
    } catch (error) {
      LoggingService.error('timeline.fetch.api_failed', error, {
        date: dateString,
        error: error?.message,
        status: error?.status,
      });

      // Fallback to local cache
      try {
        const localData = await TimelineDatabase.getTimelineForDate(dateString);
        LoggingService.info('timeline.cache.read', {
          date: dateString,
          visits: localData.visits?.length ?? 0,
          travels: localData.travels?.length ?? 0,
          has_data: (localData.visits?.length > 0 || localData.travels?.length > 0),
        });

        if (localData.visits.length > 0 || localData.travels.length > 0) {
          return { date: dateString, timezone: 'UTC', ...localData, fromCache: true };
        }
      } catch (cacheError) {
        LoggingService.error('timeline.cache.read_failed', cacheError, { date: dateString, error: cacheError?.message });
      }

      throw error;
    }
  }

  async fetchTimelineForDateRange(startDate, endDate, authToken) {
    try {
      const startDateString = toLocalDateString(startDate);
      const endDateString = toLocalDateString(endDate);
      
      // Ensure API service has the auth token
      APIService.setCachedAuthToken(authToken);
      
      const data = await APIService.getTimelineForDateRange(startDateString, endDateString);

      // Handle new API format with combined timeline
      if (data.timeline) {
        // Convert combined timeline to separate visits and travels for backward compatibility
        const visits = data.timeline.filter(item => item.type === 'visit');
        const travels = data.timeline.filter(item => item.type === 'travel');

        return {
          ...data,
          visits: visits,
          travels: travels
        };
      } else {
        return data;
      }
    } catch (error) {
      console.error('Failed to fetch timeline range from API:', error);
      throw error;
    }
  }

  async getTimelineForDate(date, authToken) {
    const dateString = toLocalDateString(date);
    LoggingService.info('timeline.get.start', { date: dateString });

    try {
      const result = await this.fetchTimelineForDate(date, authToken);
      LoggingService.info('timeline.get.success', {
        date: dateString,
        visits: result.visits?.length ?? 0,
        travels: result.travels?.length ?? 0,
        from_cache: result.fromCache ?? false,
      });
      return result;
    } catch (error) {
      LoggingService.warn('timeline.get.fallback_to_cache', {
        date: dateString,
        error: error?.message,
      });

      try {
        const localData = await TimelineDatabase.getTimelineForDate(dateString);
        LoggingService.info('timeline.get.cache_result', {
          date: dateString,
          visits: localData.visits?.length ?? 0,
          travels: localData.travels?.length ?? 0,
        });

        if (localData.visits.length > 0 || localData.travels.length > 0) {
          return { date: dateString, timezone: 'UTC', ...localData, fromCache: true };
        }
      } catch (cacheError) {
        LoggingService.error('timeline.get.cache_error', cacheError, { date: dateString });
      }

      LoggingService.warn('timeline.get.empty_result', { date: dateString, error: error?.message });
      return {
        date: dateString,
        timezone: 'UTC',
        visits: [],
        travels: [],
        fromCache: false,
        error: error.message,
      };
    }
  }

  async syncRecentTimeline(authToken, daysBack = 7) {
    const promises = [];

    for (let i = 0; i < daysBack; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      promises.push(
        this.fetchTimelineForDate(date, authToken).catch(error => {
          console.warn(`Failed to sync timeline for ${toLocalDateString(date)}:`, error);
        })
      );
    }

    await Promise.all(promises);
  }

  formatDuration(seconds) {
    if (!seconds) return '0m';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  formatDistance(meters) {
    if (!meters) return '0m';

    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${Math.round(meters)}m`;
  }

  isValidTimeZone(timezone) {
    if (!timezone || typeof timezone !== 'string') {
      return false;
    }

    try {
      // Test if the timezone is valid by trying to use it
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch (error) {
      console.warn('Invalid timezone:', timezone, error);
      return false;
    }
  }

  formatTime(isoString, timezone = null) {
    const date = new Date(isoString);
    const options = {
      hour: '2-digit',
      minute: '2-digit'
    };
    if (timezone && this.isValidTimeZone(timezone)) {
      options.timeZone = timezone;
    }
    return date.toLocaleTimeString([], options);
  }

  formatDateTime(isoString, timezone = null) {
    const date = new Date(isoString);
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    if (timezone && this.isValidTimeZone(timezone)) {
      options.timeZone = timezone;
    }
    return date.toLocaleString([], options);
  }

  getTimelineBounds(timeline) {
    const allPoints = [];

    // Handle new combined timeline format or old separate format
    if (timeline.timeline) {
      // New format with combined timeline
      timeline.timeline.forEach(item => {
        if (item.center_latitude && item.center_longitude) {
          allPoints.push({
            latitude: item.center_latitude,
            longitude: item.center_longitude
          });
        }
      });
    } else {
      // Old format with separate visits and travels
      // Add visit coordinates
      timeline.visits.forEach(visit => {
        if (visit.center_latitude && visit.center_longitude) {
          allPoints.push({
            latitude: visit.center_latitude,
            longitude: visit.center_longitude
          });
        }
      });

      // Add travel coordinates
      timeline.travels.forEach(travel => {
        if (travel.center_latitude && travel.center_longitude) {
          allPoints.push({
            latitude: travel.center_latitude,
            longitude: travel.center_longitude
          });
        }
      });
    }

    if (allPoints.length === 0) {
      // Default to San Francisco if no data
      return {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }

    const latitudes = allPoints.map(p => p.latitude);
    const longitudes = allPoints.map(p => p.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const latDelta = Math.max(maxLat - minLat, 0.01) * 1.2; // Add 20% padding
    const lngDelta = Math.max(maxLng - minLng, 0.01) * 1.2;

    return {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }
}

export default new TimelineService();
