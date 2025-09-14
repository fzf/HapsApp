import BaseRepository from './BaseRepository';
import TimelineDatabase from '../services/TimelineDatabase';

/**
 * Repository for timeline-related data operations
 * Handles both remote API calls and local database caching
 */
class TimelineRepository extends BaseRepository {
  constructor() {
    super('/api/timeline', 'timeline');
  }

  /**
   * Get timeline for specific date with local caching fallback
   */
  async getTimelineForDate(date) {
    try {
      const dateString = date.toISOString().split('T')[0];
      const data = await this.apiService.getTimelineForDate(dateString);
      
      // Cache the timeline data locally
      await TimelineDatabase.saveTimelineData(dateString, data);
      
      return this.normalizeTimelineData(data);
    } catch (error) {
      // Fallback to local cache if available
      try {
        const dateString = date.toISOString().split('T')[0];
        const cachedData = await TimelineDatabase.getTimelineData(dateString);
        
        if (cachedData) {
          console.log('Using cached timeline data for', dateString);
          return {
            ...this.normalizeTimelineData(cachedData),
            fromCache: true,
          };
        }
      } catch (cacheError) {
        console.warn('Failed to retrieve cached timeline:', cacheError);
      }
      
      this.handleError(error, 'getTimelineForDate', { date });
    }
  }

  /**
   * Get timeline for date range
   */
  async getTimelineForDateRange(startDate, endDate) {
    try {
      const startDateString = startDate.toISOString().split('T')[0];
      const endDateString = endDate.toISOString().split('T')[0];
      
      const data = await this.apiService.getTimelineForDateRange(startDateString, endDateString);
      
      return this.normalizeTimelineData(data);
    } catch (error) {
      this.handleError(error, 'getTimelineForDateRange', { startDate, endDate });
    }
  }

  /**
   * Get recent timeline entries
   */
  async getRecentTimeline(days = 7) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      return await this.getTimelineForDateRange(startDate, endDate);
    } catch (error) {
      this.handleError(error, 'getRecentTimeline', { days });
    }
  }

  /**
   * Search timeline entries
   */
  async searchTimeline(query, options = {}) {
    try {
      const params = {
        q: query,
        ...options,
      };
      return await this.search(query, params);
    } catch (error) {
      this.handleError(error, 'searchTimeline', { query, options });
    }
  }

  /**
   * Get timeline summary for a date range
   */
  async getTimelineSummary(startDate, endDate) {
    try {
      const params = {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        summary: true,
      };
      return await this.findAll(params);
    } catch (error) {
      this.handleError(error, 'getTimelineSummary', { startDate, endDate });
    }
  }

  /**
   * Normalize timeline data to ensure consistent format
   */
  normalizeTimelineData(data) {
    if (!data) {
      return { timeline: [], visits: [], travels: [] };
    }

    // Handle new API format with combined timeline
    if (data.timeline) {
      const visits = data.timeline.filter(item => item.type === 'visit');
      const travels = data.timeline.filter(item => item.type === 'travel');

      return {
        ...data,
        visits,
        travels,
        timeline: data.timeline,
      };
    }

    // Handle legacy format
    return {
      ...data,
      visits: data.visits || [],
      travels: data.travels || [],
      timeline: [
        ...(data.visits || []).map(v => ({ ...v, type: 'visit' })),
        ...(data.travels || []).map(t => ({ ...t, type: 'travel' })),
      ].sort((a, b) => new Date(a.started_at) - new Date(b.started_at)),
    };
  }

  /**
   * Clear local timeline cache
   */
  async clearCache() {
    try {
      await TimelineDatabase.clearAllTimeline();
      return { success: true, message: 'Timeline cache cleared' };
    } catch (error) {
      this.handleError(error, 'clearCache');
    }
  }

  /**
   * Get cache status
   */
  async getCacheStatus() {
    try {
      const stats = await TimelineDatabase.getCacheStats();
      return stats;
    } catch (error) {
      this.handleError(error, 'getCacheStatus');
    }
  }
}

export default new TimelineRepository();