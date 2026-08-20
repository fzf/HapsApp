import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Sentry from '@sentry/react-native';
import TimelineService from '../../services/TimelineService';
import APIService from '../../services/APIService';
import LoggingService from '../../services/LoggingService';
import { useAuth } from '../../AuthContext';
import { LocationPoint, Purchase, TimelineDay, TimelineItem } from '../api/types';
import { toLocalDateString } from '../screens/timeline/format';

function mergeItems(day: TimelineDay | null): TimelineItem[] {
  if (!day) return [];
  return [
    ...day.visits.map((v) => ({ ...v, type: 'visit' as const })),
    ...day.travels.map((t) => ({ ...t, type: 'travel' as const })),
  ].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

function findCurrentItem(items: TimelineItem[], isToday: boolean): TimelineItem | null {
  if (!isToday || items.length === 0) return null;
  const now = Date.now();
  const active = items.find((item) => {
    const start = new Date(item.start_time).getTime();
    const end = item.end_time ? new Date(item.end_time).getTime() : null;
    return start <= now && (!end || end >= now);
  });
  if (active) return active;
  const past = items.filter((i) => i.end_time && new Date(i.end_time).getTime() < now);
  return past.length > 0 ? past[past.length - 1] : items[0];
}

export function useTimelineDay() {
  const { token } = useAuth();
  const [date, setDate] = useState(new Date());
  const [day, setDay] = useState<TimelineDay | null>(null);
  const [locationPoints, setLocationPoints] = useState<LocationPoint[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isToday = toLocalDateString(date) === toLocalDateString(new Date());

  const load = useCallback(async (d: Date) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const dateString = toLocalDateString(d);
      const [data, pointsData, txData] = await Promise.all([
        TimelineService.getTimelineForDate(d, token) as Promise<TimelineDay>,
        APIService.getLocationPointsForDate(dateString).catch(() => null),
        APIService.getTransactionsForDate(dateString).catch(() => null),
      ]);
      setLocationPoints(pointsData?.location_points ?? []);
      setPurchases(txData?.transactions ?? []);
      setDay(data);
      LoggingService.info('map.load.result', {
        date: dateString,
        visits: (data.visits || []).length,
        travels: (data.travels || []).length,
        from_cache: data.fromCache ?? false,
      });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(date); }, [date, load]);

  // Foreground refresh + midnight rollover (port of MapTimelineScreen.js:256-271)
  const lastLoadedDate = useRef(toLocalDateString(new Date()));
  useEffect(() => {
    // A synchronous throw in this callback runs inside a native event
    // dispatch: no error boundary applies and the app dies as a fatal
    // jsi::JSError (Sentry MOBILE-38), so the whole body is guarded.
    const sub = AppState.addEventListener('change', (nextState) => {
      try {
        if (nextState !== 'active') return;
        const todayStr = toLocalDateString(new Date());
        if (lastLoadedDate.current !== todayStr) {
          setDate(new Date());
        } else {
          load(date);
        }
        lastLoadedDate.current = todayStr;
      } catch (error) {
        Sentry.captureException(error, {
          tags: { section: 'timeline', error_type: 'foreground_refresh_error' },
        });
      }
    });
    return () => sub.remove();
  }, [load, date]);

  const items = useMemo(() => mergeItems(day), [day]);
  const currentItem = useMemo(() => findCurrentItem(items, isToday), [items, isToday]);

  const goPrevDay = useCallback(() => {
    setDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  }, []);
  const goNextDay = useCallback(() => {
    setDate((d) => {
      const n = new Date(d); n.setDate(n.getDate() + 1);
      return n <= new Date() ? n : d;
    });
  }, []);

  return {
    date, isToday, day, items, locationPoints, purchases,
    timezone: day?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    loading, error, currentItem,
    reload: () => load(date), goPrevDay, goNextDay,
  };
}

export type TimelineDayState = ReturnType<typeof useTimelineDay>;
