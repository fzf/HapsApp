import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../src/theme';
import { TimelineItemRow } from '../../src/screens/timeline/TimelineItemRow';

const visit: any = {
  id: 1, type: 'visit', start_time: '2026-08-08T16:00:00Z', end_time: '2026-08-08T17:00:00Z',
  duration: 3600, center_latitude: 1, center_longitude: 1,
  location: { id: 9, name: 'Blue Bottle', address: '66 Mint St', latitude: 1, longitude: 1 },
};
const purchases: any[] = [
  { id: 5, name: 'Coffee', merchant: 'Blue Bottle Coffee Co', amount: 6.75, currency: 'USD',
    purchased_at: '2026-08-08T16:10:00Z', matched_visit: { visit_id: 1, confidence: 0.9, confidence_label: 'high', method: 'time', verified: false } },
];

it('renders visit name, duration and matched purchase', () => {
  const { getByText } = render(
    <ThemeProvider>
      <TimelineItemRow item={visit} timezone="UTC" selected={false} purchases={purchases} onPress={() => {}} />
    </ThemeProvider>
  );
  expect(getByText('Blue Bottle')).toBeTruthy();
  expect(getByText(/1h 0m/)).toBeTruthy();
  expect(getByText('$6.75')).toBeTruthy();
});

it('renders travel with distance and mode', () => {
  const travel: any = {
    id: 2, type: 'travel', start_time: '2026-08-08T15:00:00Z', end_time: '2026-08-08T15:12:00Z',
    duration: 720, distance: 3218.68, center_latitude: 1, center_longitude: 1,
    track_points: [{ latitude: 0, longitude: 0, speed: 15 }, { latitude: 0, longitude: 1, speed: 15 }],
  };
  const { getByText } = render(
    <ThemeProvider>
      <TimelineItemRow item={travel} timezone="UTC" selected={false} purchases={[]} onPress={() => {}} />
    </ThemeProvider>
  );
  expect(getByText(/2\.0mi/)).toBeTruthy();
});
