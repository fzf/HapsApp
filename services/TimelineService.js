import APIService from './APIService';

class TimelineService {
  async fetchTimelineForDate(date, authToken) {
    const dateString = date.toISOString().split('T')[0];

    APIService.setCachedAuthToken(authToken);

    const data = await APIService.getTimelineForDate(dateString);

    // Normalize combined timeline format → separate visits/travels arrays
    if (data.timeline) {
      return {
        ...data,
        visits: data.timeline.filter(item => item.type === 'visit'),
        travels: data.timeline.filter(item => item.type === 'travel'),
      };
    }

    return data;
  }

  async fetchTimelineForDateRange(startDate, endDate, authToken) {
    const startDateString = startDate.toISOString().split('T')[0];
    const endDateString = endDate.toISOString().split('T')[0];

    APIService.setCachedAuthToken(authToken);

    const data = await APIService.getTimelineForDateRange(startDateString, endDateString);

    if (data.timeline) {
      return {
        ...data,
        visits: data.timeline.filter(item => item.type === 'visit'),
        travels: data.timeline.filter(item => item.type === 'travel'),
      };
    }

    return data;
  }

  async getTimelineForDate(date, authToken) {
    const dateString = date.toISOString().split('T')[0];

    try {
      return await this.fetchTimelineForDate(date, authToken);
    } catch (error) {
      console.error('Failed to fetch timeline from API:', error);
      return {
        date: dateString,
        timezone: 'UTC',
        visits: [],
        travels: [],
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
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  formatDistance(meters) {
    if (!meters) return '0m';
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
    return `${Math.round(meters)}m`;
  }

  isValidTimeZone(timezone) {
    if (!timezone || typeof timezone !== 'string') return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  formatTime(isoString, timezone = null) {
    const date = new Date(isoString);
    const options = { hour: '2-digit', minute: '2-digit' };
    if (timezone && this.isValidTimeZone(timezone)) options.timeZone = timezone;
    return date.toLocaleTimeString([], options);
  }

  formatDateTime(isoString, timezone = null) {
    const date = new Date(isoString);
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    if (timezone && this.isValidTimeZone(timezone)) options.timeZone = timezone;
    return date.toLocaleString([], options);
  }

  getTimelineBounds(timeline) {
    const allPoints = [];

    if (timeline.timeline) {
      timeline.timeline.forEach(item => {
        if (item.center_latitude && item.center_longitude) {
          allPoints.push({ latitude: item.center_latitude, longitude: item.center_longitude });
        }
      });
    } else {
      (timeline.visits || []).forEach(v => {
        if (v.center_latitude && v.center_longitude) {
          allPoints.push({ latitude: v.center_latitude, longitude: v.center_longitude });
        }
      });
      (timeline.travels || []).forEach(t => {
        if (t.center_latitude && t.center_longitude) {
          allPoints.push({ latitude: t.center_latitude, longitude: t.center_longitude });
        }
      });
    }

    if (allPoints.length === 0) {
      return { latitude: 37.7749, longitude: -122.4194, latitudeDelta: 0.0922, longitudeDelta: 0.0421 };
    }

    const lats = allPoints.map(p => p.latitude);
    const lngs = allPoints.map(p => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(maxLat - minLat, 0.01) * 1.2,
      longitudeDelta: Math.max(maxLng - minLng, 0.01) * 1.2,
    };
  }
}

export default new TimelineService();
