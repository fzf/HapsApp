import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../src/theme';
import { Icon, Pill, ListRow, StatChip } from '../../src/ui';

const wrap = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

it('renders Icon', () => {
  expect(wrap(<Icon name="map-marker" />).toJSON()).toBeTruthy();
});
it('renders Pill string children inside a Text', () => {
  const { getByText } = wrap(<Pill>{'Today'}</Pill>);
  expect(getByText('Today')).toBeTruthy();
});
it('renders ListRow title/subtitle', () => {
  const { getByText } = wrap(<ListRow icon="walk" title="Blue Bottle" subtitle="45 min" />);
  expect(getByText('Blue Bottle')).toBeTruthy();
  expect(getByText('45 min')).toBeTruthy();
});
it('renders StatChip label', () => {
  const { getByText } = wrap(<StatChip icon="map-marker" label="5 visits" />);
  expect(getByText('5 visits')).toBeTruthy();
});
