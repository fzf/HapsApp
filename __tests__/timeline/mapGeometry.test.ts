import { speedMode, travelCoords, regionForItem, regionForBounds } from '../../src/screens/timeline/mapGeometry';
import { TimelineDay, TimelineTravel, TimelineVisit } from '../../src/api/types';

it('buckets speeds into modes', () => {
  expect(speedMode(null)).toBe('unknown');
  expect(speedMode(-1)).toBe('unknown');
  expect(speedMode(1)).toBe('walking');
  expect(speedMode(5)).toBe('cycling');
  expect(speedMode(20)).toBe('driving');
  expect(speedMode(35)).toBe('highway');
});

const baseTravel: TimelineTravel = {
  id: 1, type: 'travel', start_time: '2026-08-10T12:00:00Z', end_time: '2026-08-10T12:30:00Z',
  duration: 1800, distance: 2, center_latitude: 37.7, center_longitude: -122.4,
};

it('travelCoords prefers server geometry over track points', () => {
  const travel: TimelineTravel = {
    ...baseTravel,
    geometry: [{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }],
    track_points: [
      { latitude: 9, longitude: 9, speed: null, heading: null, recorded_at: '' },
      { latitude: 8, longitude: 8, speed: null, heading: null, recorded_at: '' },
    ],
  };
  expect(travelCoords(travel)).toEqual(travel.geometry);
});

it('travelCoords falls back to track points', () => {
  const travel: TimelineTravel = {
    ...baseTravel,
    track_points: [
      { latitude: 9, longitude: 9, speed: null, heading: null, recorded_at: '' },
      { latitude: 8, longitude: 8, speed: null, heading: null, recorded_at: '' },
    ],
  };
  expect(travelCoords(travel)).toEqual([
    { latitude: 9, longitude: 9 },
    { latitude: 8, longitude: 8 },
  ]);
});

it('travelCoords returns null with fewer than 2 points', () => {
  expect(travelCoords(baseTravel)).toBeNull();
  expect(travelCoords({ ...baseTravel, geometry: [{ latitude: 1, longitude: 2 }] })).toBeNull();
});

it('regionForBounds includes travel geometry', () => {
  const day: TimelineDay = {
    visits: [],
    travels: [{
      ...baseTravel,
      geometry: [{ latitude: 10, longitude: 20 }, { latitude: 12, longitude: 22 }],
    }],
  };
  const region = regionForBounds(day);
  expect(region).not.toBeNull();
  expect(region!.latitude).toBeCloseTo(11);
  expect(region!.longitude).toBeCloseTo(21);
});

it('regionForItem centers on a visit', () => {
  const visit = {
    id: 1, type: 'visit', start_time: '', end_time: null, duration: null,
    center_latitude: 37.77, center_longitude: -122.42, location: null,
  } as TimelineVisit;
  const r = regionForItem(visit)!;
  expect(r.latitude).toBe(37.77);
  expect(r.latitudeDelta).toBeCloseTo(0.015);
});
