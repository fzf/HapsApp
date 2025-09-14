import { useState, useCallback } from 'react';
import { useAuthRequest, usePaginatedRequest } from './useAuthRequest';
import { TimelineService } from '../services';

/**
 * Hook for managing timeline data and operations
 */
export const useTimeline = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [timelineData, setTimelineData] = useState([]);
  const { execute, loading, error, clearError } = useAuthRequest();

  // Get timeline for a specific date
  const getTimelineForDate = useCallback(async (date = selectedDate) => {
    return execute(async (api) => {
      const dateString = date.toISOString().split('T')[0];
      const data = await api.getTimelineForDate(dateString);
      
      if (date.toDateString() === selectedDate.toDateString()) {
        setTimelineData(data || []);
      }
      
      return data;
    });
  }, [execute, selectedDate]);

  // Get timeline for date range
  const getTimelineForDateRange = useCallback(async (startDate, endDate) => {
    return execute(async (api) => {
      const startDateString = startDate.toISOString().split('T')[0];
      const endDateString = endDate.toISOString().split('T')[0];
      return await api.getTimelineForDateRange(startDateString, endDateString);
    });
  }, [execute]);

  // Change selected date and load its timeline
  const changeDate = useCallback(async (newDate) => {
    setSelectedDate(newDate);
    await getTimelineForDate(newDate);
  }, [getTimelineForDate]);

  // Navigate to previous day
  const goToPreviousDay = useCallback(async () => {
    const prevDay = new Date(selectedDate);
    prevDay.setDate(prevDay.getDate() - 1);
    await changeDate(prevDay);
  }, [selectedDate, changeDate]);

  // Navigate to next day
  const goToNextDay = useCallback(async () => {
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    await changeDate(nextDay);
  }, [selectedDate, changeDate]);

  // Go to today
  const goToToday = useCallback(async () => {
    await changeDate(new Date());
  }, [changeDate]);

  // Refresh current timeline
  const refreshTimeline = useCallback(async () => {
    await getTimelineForDate(selectedDate);
  }, [getTimelineForDate, selectedDate]);

  return {
    selectedDate,
    timelineData,
    loading,
    error,
    getTimelineForDate,
    getTimelineForDateRange,
    changeDate,
    goToPreviousDay,
    goToNextDay,
    goToToday,
    refreshTimeline,
    clearError,
  };
};

/**
 * Hook for managing paginated timeline data
 */
export const usePaginatedTimeline = (initialStartDate, initialEndDate) => {
  const [dateRange, setDateRange] = useState({
    start: initialStartDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    end: initialEndDate || new Date(),
  });

  const {
    data: timelineData,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    clearError,
  } = usePaginatedRequest();

  // Load timeline for current date range
  const loadTimeline = useCallback(async () => {
    await refresh(async (api, page, pageSize) => {
      const startDateString = dateRange.start.toISOString().split('T')[0];
      const endDateString = dateRange.end.toISOString().split('T')[0];
      
      // For timeline, we might want to load by date ranges rather than traditional pagination
      // This is a simplified version - you might need to adjust based on your API
      return await api.getTimelineForDateRange(startDateString, endDateString);
    });
  }, [refresh, dateRange]);

  // Change date range and reload
  const changeDateRange = useCallback(async (start, end) => {
    setDateRange({ start, end });
  }, []);

  // Extend date range backwards (load older data)
  const extendBackwards = useCallback(async (days = 7) => {
    const newStart = new Date(dateRange.start);
    newStart.setDate(newStart.getDate() - days);
    setDateRange(prev => ({ ...prev, start: newStart }));
    await loadTimeline();
  }, [dateRange.start, loadTimeline]);

  // Extend date range forwards (load newer data)
  const extendForwards = useCallback(async (days = 7) => {
    const newEnd = new Date(dateRange.end);
    newEnd.setDate(newEnd.getDate() + days);
    setDateRange(prev => ({ ...prev, end: newEnd }));
    await loadTimeline();
  }, [dateRange.end, loadTimeline]);

  return {
    timelineData,
    dateRange,
    loading,
    error,
    hasMore,
    loadTimeline,
    loadMore,
    changeDateRange,
    extendBackwards,
    extendForwards,
    refresh: loadTimeline,
    clearError,
  };
};