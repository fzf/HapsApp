import BaseRepository from './BaseRepository';

/**
 * Repository for timeline-related data operations
 */
class TimelineRepository extends BaseRepository {
  constructor() {
    super('/api/timeline', 'timeline');
  }

  async getTimelineForDate(date) {
    const dateString = date.toISOString().split('T')[0];
    const data = await this.apiService.getTimelineForDate(dateString);
    return this.normalizeTimelineData(data);
  }

  async getTimelineForDateRange(startDate, endDate) {
    const startDateString = startDate.toISOString().split('T')[0];
    const endDateString = endDate.toISOString().split('T')[0];
    const data = await this.apiService.getTimelineForDateRange(startDateString, endDateString);
    return this.normalizeTimelineData(data);
  }

  async getRecentTimeline(days = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return await this.getTimelineForDateRange(startDate, endDate);
  }

  async searchTimeline(query, options = {}) {
    return await this.search(query, { q: query, ...options });
  }

  async getTimelineSummary(startDate, endDate) {
    return await this.findAll({
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      summary: true,
    });
  }

  normalizeTimelineData(data) {
    if (!data) return { timeline: [], visits: [], travels: [] };

    if (data.timeline) {
      const visits = data.timeline.filter(item => item.type === 'visit');
      const travels = data.timeline.filter(item => item.type === 'travel');
      return { ...data, visits, travels };
    }

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
}

export default new TimelineRepository();
