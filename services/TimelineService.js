import TimelineDatabase from './TimelineDatabase';

class TimelineService {
  constructor() {
    this.API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__
      ? 'http://localhost:3000'
      : 'https://haps.app'
    );
  }

  async fetchTimelineForDate(date, authToken) {
    try {
      const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD format

      const response = await fetch(`${this.API_URL}/api/timeline?date=${dateString}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Timeline API error: ${response.status}`);
      }

      const data = await response.json();

      // Handle new API format with combined timeline
      if (data.timeline) {
        // Convert combined timeline to separate visits and travels for backward compatibility
        const visits = data.timeline.filter(item => item.type === 'visit');
        const travels = data.timeline.filter(item => item.type === 'travel');

        const convertedData = {
          ...data,
          visits: visits,
          travels: travels
        };

        // Save to local database
        await TimelineDatabase.saveTimelineData(dateString, convertedData);

        return convertedData;
      } else {
        // Save to local database (old format)
        await TimelineDatabase.saveTimelineData(dateString, data);

        return data;
      }
    } catch (error) {
      console.error('Failed to fetch timeline from API:', error);

      // Fallback to local data if API fails
      const dateString = date.toISOString().split('T')[0];
      const localData = await TimelineDatabase.getTimelineForDate(dateString);
      if (localData.visits.length > 0 || localData.travels.length > 0) {
        console.log('Using cached timeline data');
        return {
          date: dateString,
          timezone: 'UTC', // Default since we don't have this info locally
          ...localData,
          fromCache: true
        };
      }

      throw error;
    }
  }

  async fetchTimelineForDateRange(startDate, endDate, authToken) {
    try {
      const startDateString = startDate.toISOString().split('T')[0];
      const endDateString = endDate.toISOString().split('T')[0];

      const response = await fetch(`${this.API_URL}/api/timeline?start_date=${startDateString}&end_date=${endDateString}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Timeline API error: ${response.status}`);
      }

      const data = await response.json();

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
    const dateString = date.toISOString().split('T')[0];

    try {
      // Try to get fresh data from API
      return await this.fetchTimelineForDate(date, authToken);
    } catch (error) {
      // If API fails, try local cache
      console.log('API failed, checking local cache...');
      const localData = await TimelineDatabase.getTimelineForDate(dateString);

      if (localData.visits.length > 0 || localData.travels.length > 0) {
        return {
          date: dateString,
          timezone: 'UTC',
          ...localData,
          fromCache: true
        };
      }

      // No data available
      return {
        date: dateString,
        timezone: 'UTC',
        visits: [],
        travels: [],
        fromCache: false,
        error: error.message
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
          console.warn(`Failed to sync timeline for ${date.toISOString().split('T')[0]}:`, error);
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
