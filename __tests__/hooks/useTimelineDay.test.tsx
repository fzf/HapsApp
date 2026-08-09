import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';

jest.mock('../../services/TimelineService', () => ({
  __esModule: true,
  default: { getTimelineForDate: jest.fn() },
}));
jest.mock('../../services/APIService', () => ({
  __esModule: true,
  default: {
    getLocationPointsForDate: jest.fn().mockResolvedValue({ location_points: [] }),
    getTransactionsForDate: jest.fn().mockResolvedValue({ transactions: [] }),
  },
}));
jest.mock('../../AuthContext', () => ({
  useAuth: () => ({ token: 'tok', isAuthenticated: true }),
}));
jest.mock('../../services/LoggingService', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

import TimelineService from '../../services/TimelineService';
import { useTimelineDay } from '../../src/hooks/useTimelineDay';

const day = (visits = [], travels = []) => ({ visits, travels, timezone: 'America/Los_Angeles' });

it('loads and merges items sorted by start_time', async () => {
  (TimelineService.getTimelineForDate as jest.Mock).mockResolvedValue(day(
    [{ id: 1, type: 'visit', start_time: '2026-08-08T10:00:00Z', end_time: null, duration: null, center_latitude: 1, center_longitude: 1, location: null }],
    [{ id: 2, type: 'travel', start_time: '2026-08-08T09:00:00Z', end_time: '2026-08-08T09:30:00Z', duration: 1800, distance: 1000, center_latitude: 1, center_longitude: 1 }],
  ));
  const { result } = renderHook(() => useTimelineDay());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.items.map((i) => i.id)).toEqual([2, 1]);
  expect(result.current.timezone).toBe('America/Los_Angeles');
});

it('goNextDay is a no-op on today; goPrevDay steps back', async () => {
  (TimelineService.getTimelineForDate as jest.Mock).mockResolvedValue(day());
  const { result } = renderHook(() => useTimelineDay());
  await waitFor(() => expect(result.current.loading).toBe(false));
  const today = result.current.date;
  act(() => result.current.goNextDay());
  expect(result.current.date).toEqual(today);
  act(() => result.current.goPrevDay());
  expect(result.current.date.getDate()).not.toBe(today.getDate());
});

it('surfaces load errors', async () => {
  (TimelineService.getTimelineForDate as jest.Mock).mockRejectedValue(new Error('boom'));
  const { result } = renderHook(() => useTimelineDay());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe('boom');
});
