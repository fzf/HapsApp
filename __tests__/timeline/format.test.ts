import { toLocalDateString, fmtDuration, fmtDistance, fmtAmount } from '../../src/screens/timeline/format';

it('toLocalDateString pads month/day', () => {
  expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
});
it('fmtDuration renders h/m', () => {
  expect(fmtDuration(3900)).toBe('1h 5m');
  expect(fmtDuration(240)).toBe('4m');
  expect(fmtDuration(null)).toBe('');
});
it('fmtDistance uses meters below 1km, miles above', () => {
  expect(fmtDistance(400)).toBe('400m');
  expect(fmtDistance(3218.68)).toBe('2.0mi');
});
it('fmtAmount signs and fixes to cents', () => {
  expect(fmtAmount(6.75)).toBe('$6.75');
  expect(fmtAmount(-12.5)).toBe('-$12.50');
  expect(fmtAmount(null)).toBe('');
});
