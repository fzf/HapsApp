import { Region } from 'react-native-maps';
import { ModeKey } from '../../theme/tokens';
import { GeoPoint, TimelineDay, TimelineItem, TimelineTravel } from '../../api/types';

export function speedMode(mps: number | null | undefined): ModeKey {
  if (mps == null || mps < 0) return 'unknown';
  if (mps < 2) return 'walking';
  if (mps < 8) return 'cycling';
  if (mps < 33) return 'driving';
  return 'highway';
}

export function travelCoords(travel: TimelineTravel): GeoPoint[] | null {
  if (travel.geometry && travel.geometry.length > 1) return travel.geometry;
  const pts = travel.track_points;
  if (pts && pts.length > 1) return pts.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  return null;
}

export function regionForItem(item: TimelineItem): Region | null {
  if (item.type === 'visit' && item.center_latitude != null && item.center_longitude != null) {
    return {
      latitude: item.center_latitude, longitude: item.center_longitude,
      latitudeDelta: 0.015, longitudeDelta: 0.015,
    };
  }
  if (item.type === 'travel') {
    const pts = travelCoords(item);
    if (pts) {
      const lats = pts.map((p) => p.latitude);
      const lngs = pts.map((p) => p.longitude);
      return {
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.4, 0.01),
        longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.4, 0.01),
      };
    }
    if (item.center_latitude != null && item.center_longitude != null) {
      return {
        latitude: item.center_latitude, longitude: item.center_longitude,
        latitudeDelta: 0.05, longitudeDelta: 0.05,
      };
    }
  }
  return null;
}

export function regionForBounds(day: TimelineDay): Region | null {
  const coords: { lat: number; lng: number }[] = [];
  for (const v of day.visits) {
    if (v.center_latitude != null && v.center_longitude != null) {
      coords.push({ lat: v.center_latitude, lng: v.center_longitude });
    }
  }
  for (const t of day.travels) {
    for (const p of travelCoords(t) ?? []) coords.push({ lat: p.latitude, lng: p.longitude });
  }
  if (coords.length === 0) return null;
  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  return {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.3, 0.02),
    longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.3, 0.02),
  };
}
