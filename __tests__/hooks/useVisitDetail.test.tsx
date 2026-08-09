import { renderHook, waitFor, act } from '@testing-library/react-native';

jest.mock('../../services/APIService', () => ({
  __esModule: true,
  default: {
    getVisit: jest.fn(),
    updateVisitLocation: jest.fn(),
    geocodeVisit: jest.fn(),
  },
}));

import APIService from '../../services/APIService';
import { useVisitDetail } from '../../src/hooks/useVisitDetail';
import { timelineNeedsRefresh } from '../../src/screens/timeline/refreshFlag';

const baseVisit = (overrides: any = {}) => ({
  id: 1,
  type: 'visit' as const,
  start_time: '2026-08-08T10:00:00Z',
  end_time: null,
  duration: null,
  center_latitude: 1,
  center_longitude: 1,
  location: null,
  suggested_locations: [
    { id: 10, name: 'Cafe', address: '1 Main St', latitude: 1, longitude: 1, rank: 1, providers: ['here'] },
  ],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  timelineNeedsRefresh.current = false;
});

it('(a) loads visit on mount', async () => {
  (APIService.getVisit as jest.Mock).mockResolvedValue(baseVisit());
  const { result } = renderHook(() => useVisitDetail(1));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(APIService.getVisit).toHaveBeenCalledWith(1);
  expect(result.current.visit?.id).toBe(1);
  expect(result.current.error).toBeNull();
});

it('(b) selectLocation optimistically sets location then replaces with server response, flips timelineNeedsRefresh', async () => {
  (APIService.getVisit as jest.Mock).mockResolvedValue(baseVisit());
  const serverVisit = baseVisit({
    location: { id: 10, name: 'Cafe', address: '1 Main St', latitude: 1, longitude: 1 },
    location_source: 'manual',
    location_confidence_score: 1.0,
  });
  let resolveUpdate: (v: any) => void = () => {};
  (APIService.updateVisitLocation as jest.Mock).mockReturnValue(
    new Promise((resolve) => { resolveUpdate = resolve; })
  );

  const { result } = renderHook(() => useVisitDetail(1));
  await waitFor(() => expect(result.current.loading).toBe(false));

  act(() => {
    result.current.selectLocation(10);
  });

  // optimistic update applied synchronously (before the update call resolves)
  await waitFor(() => {
    expect(result.current.visit?.location?.id).toBe(10);
  });
  expect(result.current.visit?.location_source).toBe('manual');
  expect(result.current.visit?.location_confidence_score).toBe(1.0);
  expect(result.current.busy).toBe(true);
  expect(timelineNeedsRefresh.current).toBe(false);

  await act(async () => {
    resolveUpdate(serverVisit);
    await Promise.resolve();
  });

  await waitFor(() => expect(result.current.busy).toBe(false));
  expect(result.current.visit).toEqual(serverVisit);
  expect(timelineNeedsRefresh.current).toBe(true);
});

it('(c) failed selectLocation reverts to the pre-select visit and surfaces error', async () => {
  const original = baseVisit();
  (APIService.getVisit as jest.Mock).mockResolvedValue(original);
  (APIService.updateVisitLocation as jest.Mock).mockRejectedValue(new Error('server exploded'));

  const { result } = renderHook(() => useVisitDetail(1));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.selectLocation(10);
  });

  expect(result.current.visit).toEqual(original);
  expect(result.current.error).toBe('server exploded');
  expect(result.current.busy).toBe(false);
  expect(timelineNeedsRefresh.current).toBe(false);
});

it('(d) refreshGeocode applies response.visit', async () => {
  (APIService.getVisit as jest.Mock).mockResolvedValue(baseVisit());
  const geocoded = baseVisit({ location_source: 'geocoded' });
  (APIService.geocodeVisit as jest.Mock).mockResolvedValue({ message: 'ok', visit: geocoded });

  const { result } = renderHook(() => useVisitDetail(1));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.refreshGeocode();
  });

  expect(APIService.geocodeVisit).toHaveBeenCalledWith(1, { force: false });
  expect(result.current.visit).toEqual(geocoded);
  expect(result.current.busy).toBe(false);
  expect(timelineNeedsRefresh.current).toBe(true);
});

it('(e) 429-shaped rejection surfaces rate-limit message', async () => {
  (APIService.getVisit as jest.Mock).mockResolvedValue(baseVisit());
  (APIService.geocodeVisit as jest.Mock).mockRejectedValue({ message: 'Too Many Requests', status: 429 });

  const { result } = renderHook(() => useVisitDetail(1));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.refreshGeocode(true);
  });

  expect(APIService.geocodeVisit).toHaveBeenCalledWith(1, { force: true });
  expect(result.current.error).toBe('Rate limited — try again later');
  expect(timelineNeedsRefresh.current).toBe(false);
});

it('selectLocation is a no-op while a mutation is already in flight', async () => {
  (APIService.getVisit as jest.Mock).mockResolvedValue(baseVisit());
  let resolveUpdate: (v: any) => void = () => {};
  (APIService.updateVisitLocation as jest.Mock).mockReturnValue(
    new Promise((resolve) => { resolveUpdate = resolve; })
  );

  const { result } = renderHook(() => useVisitDetail(1));
  await waitFor(() => expect(result.current.loading).toBe(false));

  act(() => {
    result.current.selectLocation(10);
  });
  await waitFor(() => expect(result.current.busy).toBe(true));

  // second call while the first is still in flight should be a no-op
  act(() => {
    result.current.selectLocation(10);
  });

  await act(async () => {
    resolveUpdate(baseVisit({ location: { id: 10, name: 'Cafe', address: '1 Main St', latitude: 1, longitude: 1 } }));
    await Promise.resolve();
  });

  await waitFor(() => expect(result.current.busy).toBe(false));
  expect(APIService.updateVisitLocation).toHaveBeenCalledTimes(1);
});

it('reload re-fetches and populates visit after a failed initial fetch', async () => {
  (APIService.getVisit as jest.Mock).mockRejectedValueOnce(new Error('network down'));

  const { result } = renderHook(() => useVisitDetail(1));
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.visit).toBeNull();
  expect(result.current.error).toBe('network down');

  (APIService.getVisit as jest.Mock).mockResolvedValueOnce(baseVisit());

  await act(async () => {
    await result.current.reload();
  });

  expect(APIService.getVisit).toHaveBeenCalledTimes(2);
  expect(result.current.loading).toBe(false);
  expect(result.current.visit?.id).toBe(1);
  expect(result.current.error).toBeNull();
});

it('clearError resets error state', async () => {
  (APIService.getVisit as jest.Mock).mockResolvedValue(baseVisit());
  (APIService.geocodeVisit as jest.Mock).mockRejectedValue(new Error('boom'));

  const { result } = renderHook(() => useVisitDetail(1));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.refreshGeocode();
  });
  expect(result.current.error).toBe('boom');

  act(() => result.current.clearError());
  expect(result.current.error).toBeNull();
});
