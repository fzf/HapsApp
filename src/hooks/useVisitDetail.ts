import { useCallback, useEffect, useState } from 'react';
import APIService from '../../services/APIService';
import { TimelineLocation, TimelineVisit } from '../api/types';
import { timelineNeedsRefresh } from '../screens/timeline/refreshFlag';

function errorMessage(err: any): string {
  if (err && err.status === 429) return 'Rate limited — try again later';
  return (err && err.message) || 'Something went wrong';
}

export function useVisitDetail(visitId: number): {
  visit: TimelineVisit | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  selectLocation: (locationId: number) => Promise<void>;
  refreshGeocode: (force?: boolean) => Promise<void>;
} {
  const [visit, setVisit] = useState<TimelineVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await APIService.getVisit(visitId);
      setVisit(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    load();
  }, [load]);

  const clearError = useCallback(() => setError(null), []);

  const selectLocation = useCallback(async (locationId: number) => {
    if (!visit) return;
    const previous = visit;
    const suggestion = (visit.suggested_locations || []).find((s) => s.id === locationId);
    const optimisticLocation: TimelineLocation = suggestion
      ? {
          id: suggestion.id,
          name: suggestion.name,
          address: suggestion.address,
          city: suggestion.city,
          state: suggestion.state,
          latitude: suggestion.latitude,
          longitude: suggestion.longitude,
        }
      : { ...(visit.location as TimelineLocation), id: locationId };

    setVisit({
      ...visit,
      location: optimisticLocation,
      location_source: 'manual',
      location_confidence_score: 1.0,
    });
    setBusy(true);
    setError(null);
    try {
      const updated = await APIService.updateVisitLocation(visitId, locationId);
      setVisit(updated);
      timelineNeedsRefresh.current = true;
    } catch (err) {
      setVisit(previous);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [visit, visitId]);

  const refreshGeocode = useCallback(async (force = false) => {
    setBusy(true);
    setError(null);
    try {
      const response = await APIService.geocodeVisit(visitId, { force });
      setVisit(response.visit);
      timelineNeedsRefresh.current = true;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [visitId]);

  return { visit, loading, busy, error, clearError, selectLocation, refreshGeocode };
}
