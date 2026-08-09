import { light, dark, modeColors, spacing } from '../../src/theme/tokens';

it('light and dark palettes define the same keys', () => {
  expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
});

it('every palette value is a color string', () => {
  for (const p of [light, dark]) {
    for (const [k, v] of Object.entries(p)) {
      expect(typeof v).toBe('string');
      expect(v).toMatch(/^(#|rgba?\()/);
    }
  }
});

it('travel mode colors cover all speed buckets', () => {
  expect(Object.keys(modeColors).sort()).toEqual(
    ['cycling', 'driving', 'highway', 'unknown', 'walking'].sort());
});

it('spacing follows a 4pt grid', () => {
  Object.values(spacing).forEach((v) => expect(v % 4).toBe(0));
});
