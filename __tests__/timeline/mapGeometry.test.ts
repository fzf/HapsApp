import { speedMode, buildColoredSegments, regionForItem } from '../../src/screens/timeline/mapGeometry';
import { TimelineVisit } from '../../src/api/types';

it('buckets speeds into modes', () => {
  expect(speedMode(null)).toBe('unknown');
  expect(speedMode(-1)).toBe('unknown');
  expect(speedMode(1)).toBe('walking');
  expect(speedMode(5)).toBe('cycling');
  expect(speedMode(20)).toBe('driving');
  expect(speedMode(35)).toBe('highway');
});

it('splits a track where the mode changes, overlapping one point', () => {
  const pts = [
    { latitude: 0, longitude: 0, speed: 1 },
    { latitude: 0, longitude: 1, speed: 1 },
    { latitude: 0, longitude: 2, speed: 20 },
    { latitude: 0, longitude: 3, speed: 20 },
  ];
  const segs = buildColoredSegments(pts);
  expect(segs).toHaveLength(2);
  expect(segs[0].mode).toBe('walking');
  expect(segs[1].mode).toBe('driving');
  // segments share the boundary point so lines connect
  expect(segs[0].coords[segs[0].coords.length - 1]).toEqual(segs[1].coords[0]);
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
