# Phase 2: Design System + Map-First Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the app shell Google-Maps-style: design tokens + dark mode, real icons, 3 tabs (Timeline / Spend / You), and a full-screen map with a draggable bottom-sheet timeline.

**Architecture:** New `src/` tree for TypeScript code (theme, hooks, screens); existing `services/`, `contexts/`, `AuthContext.js` stay untouched JS. The current `MapTimelineScreen` is replaced by `TimelineMapScreen` (full-screen map + `@gorhom/bottom-sheet`); `HomeScreen` content moves to a `You` stack. Spec: `docs/superpowers/specs/2026-08-08-mobile-parity-redesign-design.md` (Phase 2 section).

**Tech Stack:** TypeScript (allowJs), `@gorhom/bottom-sheet` v5, `react-native-reanimated` ~3.17, `react-native-gesture-handler` ~2.24, `@expo/vector-icons` (MaterialCommunityIcons, already vendored with Expo), react-navigation 7 (installed), react-native-maps 1.20.1 (installed, Apple Maps provider unchanged).

## Global Constraints

- Branch `redesign/phase-2-shell` off the completed Phase 1 branch.
- Prereq: Phase 1 plan fully landed (TransactionsScreen fixed, dead screens gone).
- All commands run from `/Users/fzf/Projects/haps/HapsApp`.
- After every task: `npm test` passes AND `npx tsc --noEmit` passes (from Task 2 on).
- New/rebuilt files are TypeScript under `src/`; never edit untouched `.js` services except where a task says so.
- No hex color literals outside `src/theme/tokens.ts`; no emoji as UI glyphs in any file this phase creates or rewrites.
- Expo-managed native deps must be installed with `npx expo install <pkg>` (never plain `npm install`) so versions match SDK 53.
- Existing behavior contracts that must survive: background tracking untouched (`taskDefinitions.js`, `services/*` unchanged except noted); timeline data flow via `TimelineService.getTimelineForDate(date, token)` and SQLite cache.

## File Structure

```
src/
  theme/tokens.ts          # palettes (light/dark), spacing, type, radii, elevation
  theme/ThemeContext.tsx    # ThemeProvider + useTheme()
  theme/index.ts
  api/types.ts             # server payload types (timeline, visit, travel, purchase)
  ui/Icon.tsx              # thin wrapper over MaterialCommunityIcons
  ui/Pill.tsx              # floating pill (date selector, map controls)
  ui/ListRow.tsx           # icon + title + subtitle + accessory row
  ui/StatChip.tsx          # small stat unit for the day-stats strip
  ui/index.ts
  hooks/useTimelineDay.ts  # data hook: fetch/cache/foreground-refresh/midnight rollover
  screens/timeline/TimelineMapScreen.tsx   # full-screen map + sheet (composition root)
  screens/timeline/TimelineSheet.tsx       # bottom sheet: stats strip + item list
  screens/timeline/TimelineItemRow.tsx     # visit/travel row (ported render logic)
  screens/timeline/MapOverlays.tsx         # markers/polylines/circles (ported)
  screens/timeline/mapGeometry.ts          # speedColor, buildColoredSegments, regionForItem
  screens/timeline/format.ts              # toLocalDateString, fmt, fmtDuration, fmtDistance, fmtAmount
  screens/you/YouScreen.tsx               # profile header + nav links + logout
  screens/you/TrackingStatusScreen.tsx    # port of HomeScreen content
  navigation/AppTabs.tsx                  # 3 tabs, stacks, icons, theme
```

`navigation/AppNavigator.js` is replaced by `src/navigation/AppTabs.tsx`; `navigation/RootNavigator.js` is edited in place (JS) to consume it and apply nav theme. `components/HomeScreen.js`, `components/MapTimelineScreen.js`, `navigation/TabBarIcon.js` are deleted at the end (Task 10).

---

### Task 1: TypeScript toolchain

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json` (devDependencies)
- Create: `src/api/types.ts`

**Interfaces:**
- Produces: compilable TS setup; `src/api/types.ts` exports `TimelineVisit`, `TimelineTravel`, `TimelineDay`, `TrackPoint`, `Purchase`, `LocationPoint` used by every later task.

- [ ] **Step 1: Install**

```bash
npx expo install typescript @types/react
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "allowJs": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "App.js", "*.d.ts"]
}
```

(`expo/tsconfig.base` ships with the `expo` package — no extra install. Scope `include` to `src` so legacy JS isn't type-checked yet.)

- [ ] **Step 3: Create `src/api/types.ts`**

Types mirror the live API (see `services/APIService.js` + server `Api::TimelineController`):

```ts
export interface TrackPoint {
  latitude: number;
  longitude: number;
  speed: number | null;      // m/s, may be -1/null for unknown
  heading?: number | null;
  recorded_at?: string;      // ISO8601
}

export interface TimelineLocation {
  id: number;
  name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
}

export interface TimelineVisit {
  id: number;
  type: 'visit';
  start_time: string;
  end_time: string | null;
  duration: number | null;        // seconds
  center_latitude: number | null;
  center_longitude: number | null;
  radius?: number | null;         // meters
  location: TimelineLocation | null;
  suggested_locations?: TimelineLocation[];
  gps_gap?: boolean;
}

export interface TimelineTravel {
  id: number;
  type: 'travel';
  start_time: string;
  end_time: string | null;
  duration: number | null;
  distance: number | null;        // meters
  center_latitude: number | null;
  center_longitude: number | null;
  track_points?: TrackPoint[];
}

export type TimelineItem = TimelineVisit | TimelineTravel;

export interface TimelineDay {
  date?: string;
  timezone?: string;              // IANA
  visits: TimelineVisit[];
  travels: TimelineTravel[];
  fromCache?: boolean;
}

export interface MatchedVisitRef {
  visit_id: number;
  confidence: number;
  confidence_label: string;
  method: string;
  verified: boolean;
}

export interface Purchase {
  id: number;
  name: string;
  merchant: string | null;
  amount: number;
  currency: string;
  purchased_at: string;
  category?: string | null;
  matched_visit: MatchedVisitRef | null;
}

export interface LocationPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  timeline_id: number | null;
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.
Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json package.json package-lock.json src/api/types.ts
git commit -m "feat: TypeScript toolchain with typed API contracts"
```

---

### Task 2: Design tokens + ThemeProvider

**Files:**
- Create: `src/theme/tokens.ts`, `src/theme/ThemeContext.tsx`, `src/theme/index.ts`
- Test: `__tests__/theme/tokens.test.ts`

**Interfaces:**
- Produces:
  - `tokens.ts`: `export interface Palette { ... }`, `export const light: Palette`, `export const dark: Palette`, `export const spacing`, `export const type`, `export const radii`, `export const elevation`, `export const modeColors`
  - `ThemeContext.tsx`: `export function ThemeProvider({children}): JSX.Element`, `export function useTheme(): Theme` where `Theme = { colors: Palette; dark: boolean; spacing; type; radii; elevation }`

- [ ] **Step 1: Write the failing test**

`__tests__/theme/tokens.test.ts`:

```ts
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
```

Run: `npx jest __tests__/theme` — Expected: FAIL (module not found).

- [ ] **Step 2: Create `src/theme/tokens.ts`**

```ts
export interface Palette {
  // Surfaces
  background: string;      // screen ground
  surface: string;         // cards, sheet
  surfaceAlt: string;      // secondary panels, stats strip
  border: string;
  borderStrong: string;
  overlay: string;         // scrim behind floating controls
  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  // Brand + semantic
  primary: string;
  onPrimary: string;
  primarySoft: string;     // selected-row wash
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  // Map-specific
  mapControlBg: string;    // floating pill/button background
  visitPin: string;
  visitPinSelected: string;
}

export const light: Palette = {
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F4',
  border: '#E8EAED',
  borderStrong: '#DADCE0',
  overlay: 'rgba(255,255,255,0.92)',
  textPrimary: '#202124',
  textSecondary: '#5F6368',
  textTertiary: '#9AA0A6',
  textInverse: '#FFFFFF',
  primary: '#1A73E8',
  onPrimary: '#FFFFFF',
  primarySoft: '#E8F0FE',
  success: '#188038',
  successSoft: '#E6F4EA',
  warning: '#E37400',
  warningSoft: '#FEF7E0',
  danger: '#D93025',
  dangerSoft: '#FCE8E6',
  mapControlBg: 'rgba(255,255,255,0.95)',
  visitPin: '#1A73E8',
  visitPinSelected: '#174EA6',
};

export const dark: Palette = {
  background: '#202124',
  surface: '#2D2E30',
  surfaceAlt: '#35363A',
  border: '#3C4043',
  borderStrong: '#5F6368',
  overlay: 'rgba(32,33,36,0.92)',
  textPrimary: '#E8EAED',
  textSecondary: '#9AA0A6',
  textTertiary: '#80868B',
  textInverse: '#202124',
  primary: '#8AB4F8',
  onPrimary: '#202124',
  primarySoft: 'rgba(138,180,248,0.16)',
  success: '#81C995',
  successSoft: 'rgba(129,201,149,0.16)',
  warning: '#FDD663',
  warningSoft: 'rgba(253,214,99,0.16)',
  danger: '#F28B82',
  dangerSoft: 'rgba(242,139,130,0.16)',
  mapControlBg: 'rgba(45,46,48,0.95)',
  visitPin: '#8AB4F8',
  visitPinSelected: '#AECBFA',
};

// Travel polyline colors — chosen to read on both Apple light & dark tiles
export const modeColors = {
  walking: '#188038',
  cycling: '#1A73E8',
  driving: '#E37400',
  highway: '#D93025',
  unknown: '#80868B',
} as const;
export type ModeKey = keyof typeof modeColors;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  title: { fontSize: 20, fontWeight: '600' as const },
  heading: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  bodyBold: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '500' as const },
} as const;

export const radii = { sm: 8, md: 12, lg: 16, pill: 24, full: 999 } as const;

export const elevation = {
  card: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12, shadowRadius: 3, elevation: 2,
  },
  floating: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 6, elevation: 5,
  },
} as const;
```

- [ ] **Step 3: Create `src/theme/ThemeContext.tsx`**

```tsx
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { light, dark, spacing, type, radii, elevation, Palette } from './tokens';

export interface Theme {
  colors: Palette;
  dark: boolean;
  spacing: typeof spacing;
  type: typeof type;
  radii: typeof radii;
  elevation: typeof elevation;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const value = useMemo<Theme>(() => ({
    colors: scheme === 'dark' ? dark : light,
    dark: scheme === 'dark',
    spacing, type, radii, elevation,
  }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
```

`src/theme/index.ts`:

```ts
export * from './tokens';
export * from './ThemeContext';
```

- [ ] **Step 4: Verify**

Run: `npx jest __tests__/theme` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/theme __tests__/theme
git commit -m "feat: design tokens (light/dark) and ThemeProvider"
```

---

### Task 3: Gesture/animation dependencies + app-level providers

**Files:**
- Modify: `package.json`, `babel.config.js`, `App.js`, `app.json`

**Interfaces:**
- Produces: `GestureHandlerRootView` + `ThemeProvider` wrapping the app; reanimated worklets compile; `userInterfaceStyle: "automatic"`.

- [ ] **Step 1: Install (expo-pinned versions)**

```bash
npx expo install react-native-reanimated react-native-gesture-handler
npm install @gorhom/bottom-sheet@^5
```

- [ ] **Step 2: Babel plugin (must be last in plugins array)**

`babel.config.js`:

```js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

- [ ] **Step 3: Wrap the app**

In `App.js`, add imports:

```js
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from './src/theme';
```

and change the JSX body of `App` to:

```js
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <ErrorBoundary
          name="App Root"
          friendlyMessage="The app encountered an error during startup. Please restart the app."
          showReportButton={true}
        >
          <AuthProvider>
            <AppStateProvider>
              <RootNavigator />
            </AppStateProvider>
          </AuthProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
```

- [ ] **Step 4: Dark mode opt-in**

`app.json`: `"userInterfaceStyle": "light"` → `"userInterfaceStyle": "automatic"`.

- [ ] **Step 5: Verify**

Run: `npm test && npx tsc --noEmit` — Expected: PASS/clean.
Run: `npx expo export --platform ios --output-dir /tmp/p2-bundle > /dev/null && echo OK && rm -rf /tmp/p2-bundle`
Expected: `OK` (reanimated plugin wired correctly; a miswired plugin fails the bundle).
Note: dependency changes require a new dev build for device testing — flag in task report.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: reanimated + gesture-handler + bottom-sheet deps, theme/gesture roots, automatic dark mode"
```

---

### Task 4: UI primitives (Icon, Pill, ListRow, StatChip)

**Files:**
- Create: `src/ui/Icon.tsx`, `src/ui/Pill.tsx`, `src/ui/ListRow.tsx`, `src/ui/StatChip.tsx`, `src/ui/index.ts`
- Test: `__tests__/ui/primitives.test.tsx`

**Interfaces:**
- Produces:
  - `Icon`: `({ name, size?, color? }: { name: IconName; size?: number; color?: string })` — `IconName` = `keyof typeof MaterialCommunityIcons.glyphMap`
  - `Pill`: `({ children, onPress?, style? })` — floating rounded control, themed `mapControlBg` + `elevation.floating`
  - `ListRow`: `({ icon, title, subtitle?, right?, onPress?, selected? })`
  - `StatChip`: `({ icon, label }: { icon: IconName; label: string })`

- [ ] **Step 1: Write the failing render test**

`__tests__/ui/primitives.test.tsx`:

```tsx
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
```

Run: `npx jest __tests__/ui` — Expected: FAIL (modules missing).

- [ ] **Step 2: Implement the four components**

`src/ui/Icon.tsx`:

```tsx
import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color ?? colors.textSecondary} />;
}
```

`src/ui/Pill.tsx`:

```tsx
import React from 'react';
import { Pressable, Text, View, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../theme';

export function Pill({ children, onPress, style }: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii, spacing, elevation, type } = useTheme();
  const inner = typeof children === 'string'
    ? <Text style={[type.bodyBold, { color: colors.textPrimary }]}>{children}</Text>
    : children;
  const base: ViewStyle = {
    backgroundColor: colors.mapControlBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    ...elevation.floating,
  };
  if (!onPress) return <View style={[base, style]}>{inner}</View>;
  return <Pressable onPress={onPress} style={[base, style]}>{inner}</Pressable>;
}
```

`src/ui/ListRow.tsx`:

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon, IconName } from './Icon';
import { useTheme } from '../theme';

export function ListRow({ icon, title, subtitle, right, onPress, selected }: {
  icon: IconName; title: string; subtitle?: string;
  right?: React.ReactNode; onPress?: () => void; selected?: boolean;
}) {
  const { colors, spacing, type, radii } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
        backgroundColor: selected ? colors.primarySoft : 'transparent',
        borderRadius: radii.md,
      }}
    >
      <Icon name={icon} size={22} color={selected ? colors.primary : colors.textSecondary} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[type.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}
```

`src/ui/StatChip.tsx`:

```tsx
import React from 'react';
import { Text, View } from 'react-native';
import { Icon, IconName } from './Icon';
import { useTheme } from '../theme';

export function StatChip({ icon, label }: { icon: IconName; label: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: spacing.lg }}>
      <Icon name={icon} size={14} color={colors.textTertiary} />
      <Text style={[type.micro, { color: colors.textSecondary, marginLeft: 4 }]}>{label}</Text>
    </View>
  );
}
```

`src/ui/index.ts`:

```ts
export * from './Icon';
export * from './Pill';
export * from './ListRow';
export * from './StatChip';
```

- [ ] **Step 3: Verify**

Run: `npx jest __tests__/ui && npx tsc --noEmit` — Expected: PASS/clean. If the Pill test's empty-fragment line is awkward, simplify it to only the `'Today'` assertion — the intent is "string children render inside a Text".

- [ ] **Step 4: Commit**

```bash
git add src/ui __tests__/ui
git commit -m "feat: themed UI primitives (Icon, Pill, ListRow, StatChip)"
```

---

### Task 5: Timeline formatting + map geometry modules

Pure-function extraction of `components/MapTimelineScreen.js` helpers so the screen rebuild is thin. Source lines cited from that file as of Phase 1 end.

**Files:**
- Create: `src/screens/timeline/format.ts`, `src/screens/timeline/mapGeometry.ts`
- Test: `__tests__/timeline/format.test.ts`, `__tests__/timeline/mapGeometry.test.ts`

**Interfaces:**
- Produces:
  - `format.ts`: `toLocalDateString(date: Date): string`, `fmtTime(iso: string | null, tz?: string): string`, `fmtDuration(seconds?: number | null): string`, `fmtDistance(meters?: number | null): string`, `fmtAmount(amount?: number | null): string`
  - `mapGeometry.ts`: `speedMode(mps: number | null | undefined): ModeKey`, `buildColoredSegments(points: TrackPoint[]): { coords: {latitude: number; longitude: number}[]; mode: ModeKey }[]`, `regionForItem(item: TimelineItem): Region | null` (Region from `react-native-maps`), `regionForBounds(day: TimelineDay): Region | null`

- [ ] **Step 1: Write failing tests**

`__tests__/timeline/format.test.ts`:

```ts
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
```

`__tests__/timeline/mapGeometry.test.ts`:

```ts
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
```

Run: `npx jest __tests__/timeline` — Expected: FAIL (modules missing).

- [ ] **Step 2: Implement `format.ts`**

Port from `components/MapTimelineScreen.js:23-56` verbatim, renaming `fmt` → `fmtTime`, adding types:

```ts
export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fmtTime(isoString: string | null, timezone?: string): string {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
    });
  } catch {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}

export function fmtDuration(seconds?: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtDistance(meters?: number | null): string {
  if (!meters) return '';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1609.34).toFixed(1)}mi`;
}

export function fmtAmount(amount?: number | null): string {
  if (amount == null) return '';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${abs.toFixed(2)}`;
}
```

- [ ] **Step 3: Implement `mapGeometry.ts`**

Port `speedColor`/`buildColoredSegments` from `MapTimelineScreen.js:60-87` but return **mode keys** (color lookup moves to render time via `modeColors` so themes can restyle):

```ts
import { Region } from 'react-native-maps';
import { ModeKey } from '../../theme/tokens';
import { TimelineDay, TimelineItem, TrackPoint } from '../../api/types';

export function speedMode(mps: number | null | undefined): ModeKey {
  if (mps == null || mps < 0) return 'unknown';
  if (mps < 2) return 'walking';
  if (mps < 8) return 'cycling';
  if (mps < 33) return 'driving';
  return 'highway';
}

export interface ColoredSegment {
  coords: { latitude: number; longitude: number }[];
  mode: ModeKey;
}

export function buildColoredSegments(points: TrackPoint[]): ColoredSegment[] {
  if (!points || points.length < 2) return [];
  const segments: ColoredSegment[] = [];
  let start = 0;
  for (let i = 1; i <= points.length; i++) {
    const prevMode = speedMode(points[i - 1]?.speed);
    const curMode = i < points.length ? speedMode(points[i]?.speed) : null;
    if (curMode !== prevMode || i === points.length) {
      if (i - start >= 2) {
        segments.push({
          coords: points.slice(start, i).map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
          mode: prevMode,
        });
      }
      start = i - 1; // overlap by one point so segments connect
    }
  }
  return segments;
}

export function regionForItem(item: TimelineItem): Region | null {
  if (item.type === 'visit' && item.center_latitude != null && item.center_longitude != null) {
    return {
      latitude: item.center_latitude, longitude: item.center_longitude,
      latitudeDelta: 0.015, longitudeDelta: 0.015,
    };
  }
  if (item.type === 'travel') {
    const pts = item.track_points && item.track_points.length > 1 ? item.track_points : null;
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
    for (const p of t.track_points ?? []) coords.push({ lat: p.latitude, lng: p.longitude });
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
```

- [ ] **Step 4: Verify**

Run: `npx jest __tests__/timeline && npx tsc --noEmit` — Expected: PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add src/screens/timeline __tests__/timeline
git commit -m "feat: extract timeline formatting and map geometry as tested pure modules"
```

---

### Task 6: `useTimelineDay` data hook

Port of the data logic in `MapTimelineScreen.js:222-426` (state, parallel fetch, foreground refresh, midnight rollover, current-item detection, day paging) into one typed hook, leaving rendering to the screen.

**Files:**
- Create: `src/hooks/useTimelineDay.ts`
- Test: `__tests__/hooks/useTimelineDay.test.tsx`

**Interfaces:**
- Consumes: `TimelineService.getTimelineForDate(date: Date, token: string)` (JS, returns `TimelineDay`-shaped object), `APIService.getLocationPointsForDate(dateString)`, `APIService.getTransactionsForDate(dateString)`, `useAuth()` from `../../AuthContext`, `getTimelineBounds` NOT consumed (replaced by `regionForBounds`).
- Produces:

```ts
export interface TimelineDayState {
  date: Date;
  isToday: boolean;
  day: TimelineDay | null;
  items: TimelineItem[];           // visits+travels merged, sorted by start_time
  locationPoints: LocationPoint[];
  purchases: Purchase[];
  timezone: string;
  loading: boolean;
  error: string | null;
  currentItem: TimelineItem | null; // active/most-recent item when isToday
  reload: () => void;
  goPrevDay: () => void;
  goNextDay: () => void;            // no-op when isToday
}
export function useTimelineDay(): TimelineDayState;
```

- [ ] **Step 1: Write the failing test** (mock the JS services)

`__tests__/hooks/useTimelineDay.test.tsx`:

```tsx
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';

jest.mock('../../services/TimelineService', () => ({
  __esModule: true,
  default: { getTimelineForDate: jest.fn() },
}));
jest.mock('../../services/APIService', () => ({
  __esModule: true,
  default: {
    getLocationPointsForDate: jest.fn().mockResolvedValue({ location_points: [] }),
    getTransactionsForDate: jest.fn().mockResolvedValue({ transactions: [] }),
  },
}));
jest.mock('../../AuthContext', () => ({
  useAuth: () => ({ token: 'tok', isAuthenticated: true }),
}));
jest.mock('../../services/LoggingService', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

import TimelineService from '../../services/TimelineService';
import { useTimelineDay } from '../../src/hooks/useTimelineDay';

const day = (visits = [], travels = []) => ({ visits, travels, timezone: 'America/Los_Angeles' });

it('loads and merges items sorted by start_time', async () => {
  (TimelineService.getTimelineForDate as jest.Mock).mockResolvedValue(day(
    [{ id: 1, type: 'visit', start_time: '2026-08-08T10:00:00Z', end_time: null, duration: null, center_latitude: 1, center_longitude: 1, location: null }],
    [{ id: 2, type: 'travel', start_time: '2026-08-08T09:00:00Z', end_time: '2026-08-08T09:30:00Z', duration: 1800, distance: 1000, center_latitude: 1, center_longitude: 1 }],
  ));
  const { result } = renderHook(() => useTimelineDay());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.items.map((i) => i.id)).toEqual([2, 1]);
  expect(result.current.timezone).toBe('America/Los_Angeles');
});

it('goNextDay is a no-op on today; goPrevDay steps back', async () => {
  (TimelineService.getTimelineForDate as jest.Mock).mockResolvedValue(day());
  const { result } = renderHook(() => useTimelineDay());
  await waitFor(() => expect(result.current.loading).toBe(false));
  const today = result.current.date;
  act(() => result.current.goNextDay());
  expect(result.current.date).toEqual(today);
  act(() => result.current.goPrevDay());
  expect(result.current.date.getDate()).not.toBe(today.getDate());
});

it('surfaces load errors', async () => {
  (TimelineService.getTimelineForDate as jest.Mock).mockRejectedValue(new Error('boom'));
  const { result } = renderHook(() => useTimelineDay());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe('boom');
});
```

Run: `npx jest __tests__/hooks/useTimelineDay` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement the hook**

`src/hooks/useTimelineDay.ts` — port these behaviors from `MapTimelineScreen.js`, referenced by line:

- state + parallel `Promise.all` fetch with per-call `.catch(() => null)` for points/transactions (`:300-316`)
- `getCurrentItem` active/most-recent logic (`:275-298`), returned as `currentItem` (computed, not stored)
- AppState foreground listener with midnight-rollover snap (`:256-271`) — declared AFTER `load` (Phase 1 Task 6 fixed this ordering in the old file; keep it correct here)
- `prevDay`/`nextDay` with future guard (`:417-426`) as `goPrevDay`/`goNextDay`
- `LoggingService.info('map.load.result', …)` telemetry (`:323-333`) — keep, it's used for production debugging

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
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
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const todayStr = toLocalDateString(new Date());
      if (lastLoadedDate.current !== todayStr) {
        setDate(new Date());
      } else {
        load(date);
      }
      lastLoadedDate.current = todayStr;
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
```

- [ ] **Step 3: Verify**

Run: `npx jest __tests__/hooks/useTimelineDay && npx tsc --noEmit` — Expected: PASS/clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTimelineDay.ts __tests__/hooks/useTimelineDay.test.tsx
git commit -m "feat: useTimelineDay hook - typed port of timeline data flow"
```

---

### Task 7: Map overlays + timeline sheet components

**Files:**
- Create: `src/screens/timeline/MapOverlays.tsx`, `src/screens/timeline/TimelineItemRow.tsx`, `src/screens/timeline/TimelineSheet.tsx`
- Test: `__tests__/timeline/TimelineItemRow.test.tsx`

**Interfaces:**
- Consumes: Task 5 geometry/format, Task 4 primitives, Task 2 theme, types from Task 1.
- Produces:
  - `MapOverlays`: `({ day, selectedId, locationPoints, purchases, onSelect }: { day: TimelineDay; selectedId: string | null; locationPoints: LocationPoint[]; purchases: Purchase[]; onSelect: (item: TimelineItem) => void })` — renders Markers/Polylines/Circles inside a `<MapView>`. Selection ids are `` `${item.type}-${item.id}` `` (same convention as the old screen).
  - `TimelineItemRow`: `({ item, timezone, selected, purchases, onPress })` — visit rows show place name/address/time/duration + matched purchase sub-rows (walk/bike/car icon per mode for travels; `map-marker` for visits).
  - `TimelineSheet`: `({ state, selectedId, onSelect, listRef }: { state: TimelineDayState; selectedId: string | null; onSelect: (item: TimelineItem) => void; listRef: React.RefObject<any> })` — `BottomSheetFlatList` with a day-stats strip header and unmatched-purchases footer.

- [ ] **Step 1: Write failing row test**

`__tests__/timeline/TimelineItemRow.test.tsx`:

```tsx
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
  { id: 5, name: 'Coffee', merchant: 'Blue Bottle', amount: 6.75, currency: 'USD',
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
```

Run: `npx jest __tests__/timeline/TimelineItemRow` — Expected: FAIL.

- [ ] **Step 2: Implement `TimelineItemRow.tsx`**

Structure (port display logic from `MapTimelineScreen.js:115-192`, restyled — no emoji, spine drawn with theme colors):

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Icon, IconName } from '../../ui';
import { Purchase, TimelineItem } from '../../api/types';
import { fmtTime, fmtDuration, fmtDistance, fmtAmount } from './format';
import { speedMode } from './mapGeometry';

const modeIcon: Record<string, IconName> = {
  walking: 'walk', cycling: 'bike', driving: 'car', highway: 'highway', unknown: 'map-marker-distance',
};

function travelModeOf(item: TimelineItem): string {
  if (item.type !== 'travel' || !item.track_points?.length) return 'unknown';
  const speeds = item.track_points.map((p) => p.speed).filter((s): s is number => s != null && s >= 0);
  if (!speeds.length) return 'unknown';
  const mid = [...speeds].sort((a, b) => a - b)[Math.floor(speeds.length / 2)];
  return speedMode(mid);
}

export function TimelineItemRow({ item, timezone, selected, purchases, onPress, isLast }: {
  item: TimelineItem; timezone: string; selected: boolean;
  purchases: Purchase[]; onPress: (item: TimelineItem) => void; isLast?: boolean;
}) {
  const { colors, spacing, type, radii } = useTheme();
  const isVisit = item.type === 'visit';
  const visitPurchases = isVisit ? purchases.filter((p) => p.matched_visit?.visit_id === item.id) : [];
  const mode = travelModeOf(item);
  const timeRange = `${fmtTime(item.start_time, timezone)}${item.end_time ? ` – ${fmtTime(item.end_time, timezone)}` : ' – now'}`;

  return (
    <Pressable onPress={() => onPress(item)} style={{ flexDirection: 'row', paddingHorizontal: spacing.lg }}>
      {/* spine */}
      <View style={{ width: 28, alignItems: 'center' }}>
        <View style={{
          width: isVisit ? 12 : 8, height: isVisit ? 12 : 8, borderRadius: 6, marginTop: 6,
          backgroundColor: isVisit ? (selected ? colors.primary : colors.visitPin) : colors.textTertiary,
        }} />
        {!isLast && <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginTop: 4 }} />}
      </View>
      {/* body */}
      <View style={{
        flex: 1, marginLeft: spacing.sm, marginBottom: spacing.md, padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: selected ? colors.primarySoft : 'transparent',
      }}>
        {isVisit ? (
          <>
            <Text style={[type.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.location?.name ?? 'Unknown place'}
            </Text>
            {item.location?.address ? (
              <Text style={[type.caption, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
                {item.location.address}
              </Text>
            ) : null}
            <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]}>
              {timeRange}{item.duration ? `  ·  ${fmtDuration(item.duration)}` : ''}
            </Text>
            {visitPurchases.map((p) => (
              <View key={p.id} style={{
                flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs,
                backgroundColor: colors.successSoft, borderRadius: radii.sm,
                paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
              }}>
                <Icon name="credit-card-outline" size={13} color={colors.success} />
                <Text style={[type.caption, { flex: 1, color: colors.textPrimary, marginLeft: 6 }]} numberOfLines={1}>
                  {p.merchant ?? p.name}
                </Text>
                <Text style={[type.caption, { color: colors.success, fontWeight: '600' }]}>{fmtAmount(p.amount)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name={modeIcon[mode]} size={18} color={colors.textSecondary} />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[type.body, { color: colors.textSecondary }]}>
                {mode === 'unknown' ? 'Travel' : mode[0].toUpperCase() + mode.slice(1)}
                {item.distance ? `  ·  ${fmtDistance(item.distance)}` : ''}
                {item.duration ? `  ·  ${fmtDuration(item.duration)}` : ''}
              </Text>
              <Text style={[type.micro, { color: colors.textTertiary, marginTop: 1 }]}>{timeRange}</Text>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}
```

Note: `'highway'` is not a MaterialCommunityIcons glyph name in some versions — if `npx tsc --noEmit` rejects it, use `'road-variant'` instead.

- [ ] **Step 3: Implement `MapOverlays.tsx`**

Port `renderMapContent` from `MapTimelineScreen.js:497-622` with these changes and NOTHING else structural:
- colors come from `useTheme()` + `modeColors[seg.mode]` (via Task 5's mode-keyed segments) instead of literals;
- visit markers become custom circular badge markers: a `Marker` with a child `View` (28×28, `borderRadius: 14`, `backgroundColor: selected ? colors.visitPinSelected : colors.visitPin`, white `map-marker` Icon 16) with `anchor={{ x: 0.5, y: 0.5 }}`, plus `tracksViewChanges={false}` for performance;
- purchase markers keep the white chip but use `Icon name="credit-card-outline"` instead of 💳, themed `surface`/`success` colors;
- dashed no-track fallback line uses `colors.borderStrong`;
- visit `Circle` fill/stroke derive from `colors.primary` with the existing alpha suffixes (`'1A'`/`'44'`, `'66'`/`'CC'`);
- keep `tappable`, `onPress` → `onSelect({...item})`, selected stroke-width logic, GPS-dot circles for the selected visit (`radius={4}`), and the purchase latitude-fanning offsets exactly as in the source.

Export signature as declared in **Interfaces**. All data lookups (`purchasesByVisit`, `visitById`) are built inside with `useMemo`.

- [ ] **Step 4: Implement `TimelineSheet.tsx`**

```tsx
import React from 'react';
import { Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTheme } from '../../theme';
import { StatChip } from '../../ui';
import { Purchase, TimelineItem } from '../../api/types';
import { TimelineItemRow } from './TimelineItemRow';
import { fmtDistance, fmtAmount } from './format';
import type { TimelineDayState } from '../../hooks/useTimelineDay';

export function TimelineSheet({ state, selectedId, onSelect, listRef }: {
  state: TimelineDayState; selectedId: string | null;
  onSelect: (item: TimelineItem) => void; listRef: React.RefObject<any>;
}) {
  const { colors, spacing, type } = useTheme();
  const { items, purchases, timezone, loading } = state;
  const travels = state.day?.travels ?? [];
  const totalDistance = travels.reduce((s, t) => s + (t.distance ?? 0), 0);
  const totalSpend = purchases.reduce((s, p) => s + (p.amount > 0 ? p.amount : 0), 0);
  const unmatched = purchases.filter((p) => !p.matched_visit);

  return (
    <BottomSheetFlatList
      ref={listRef}
      data={items}
      keyExtractor={(item: TimelineItem) => `${item.type}-${item.id}`}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <StatChip icon="map-marker" label={`${state.day?.visits.length ?? 0} visits`} />
          <StatChip icon="routes" label={`${travels.length} trips`} />
          {totalDistance > 0 ? <StatChip icon="map-marker-distance" label={fmtDistance(totalDistance)} /> : null}
          {totalSpend > 0 ? <StatChip icon="credit-card-outline" label={fmtAmount(totalSpend)} /> : null}
        </View>
      }
      renderItem={({ item, index }: { item: TimelineItem; index: number }) => (
        <TimelineItemRow
          item={item}
          timezone={timezone}
          selected={selectedId === `${item.type}-${item.id}`}
          purchases={purchases}
          onPress={onSelect}
          isLast={index === items.length - 1}
        />
      )}
      ListEmptyComponent={
        loading ? null : (
          <Text style={[type.body, { color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.xxl }]}>
            No timeline data for this day
          </Text>
        )
      }
      ListFooterComponent={
        unmatched.length === 0 ? null : (
          <View style={{
            marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.xl,
            backgroundColor: colors.warningSoft, borderRadius: 12, padding: spacing.md,
          }}>
            <Text style={[type.caption, { fontWeight: '600', color: colors.warning, marginBottom: spacing.sm }]}>
              Unmatched purchases
            </Text>
            {unmatched.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', paddingVertical: spacing.xs }}>
                <Text style={[type.caption, { flex: 1, color: colors.textPrimary }]} numberOfLines={1}>
                  {p.merchant ?? p.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>{fmtAmount(p.amount)}</Text>
              </View>
            ))}
          </View>
        )
      }
      onScrollToIndexFailed={() => {}}
      showsVerticalScrollIndicator={false}
    />
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx jest __tests__/timeline && npx tsc --noEmit` — Expected: PASS/clean.

- [ ] **Step 6: Commit**

```bash
git add src/screens/timeline __tests__/timeline
git commit -m "feat: map overlays, timeline rows, and bottom-sheet list components"
```

---

### Task 8: TimelineMapScreen — composition root

**Files:**
- Create: `src/screens/timeline/TimelineMapScreen.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4–7; `react-native-maps` MapView; `@gorhom/bottom-sheet` BottomSheet; `expo-location` for initial device region (port of `MapTimelineScreen.js:235-250`).
- Produces: `export function TimelineMapScreen(): JSX.Element` — registered by Task 9.

- [ ] **Step 1: Implement**

```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Icon, Pill } from '../../ui';
import { TimelineItem } from '../../api/types';
import { useTimelineDay } from '../../hooks/useTimelineDay';
import { regionForItem, regionForBounds } from './mapGeometry';
import { MapOverlays } from './MapOverlays';
import { TimelineSheet } from './TimelineSheet';

export function TimelineMapScreen() {
  const theme = useTheme();
  const { colors, spacing, type } = theme;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const state = useTimelineDay();
  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [initialRegion, setInitialRegion] = useState<Region | undefined>(undefined);

  const snapPoints = useMemo(() => ['12%', '45%', '88%'], []);

  // Initial region: device location fallback (port of MapTimelineScreen.js:235-250)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setInitialRegion((r) => r ?? {
            latitude: loc.coords.latitude, longitude: loc.coords.longitude,
            latitudeDelta: 0.05, longitudeDelta: 0.05,
          });
        }
      } catch { /* keep undefined; map uses its default */ }
    })();
  }, []);

  const focusItem = useCallback((item: TimelineItem, animate = true) => {
    const region = regionForItem(item);
    if (region) {
      if (mapReady) mapRef.current?.animateToRegion(region, animate ? 500 : 0);
      else setInitialRegion(region);
    }
    const idx = state.items.findIndex((i) => i.type === item.type && i.id === item.id);
    if (idx >= 0) {
      setTimeout(() => listRef.current?.scrollToIndex?.({ index: idx, animated: true, viewPosition: 0.2 }), 300);
    }
  }, [mapReady, state.items]);

  const selectItem = useCallback((item: TimelineItem) => {
    setSelectedId(`${item.type}-${item.id}`);
    focusItem(item);
  }, [focusItem]);

  // Auto-focus current item on load (port of MapTimelineScreen.js:335-388)
  const lastAutoFocusKey = useRef<string | null>(null);
  useEffect(() => {
    if (state.loading || !state.day) return;
    const key = `${state.date.toDateString()}-${state.items.length}`;
    if (lastAutoFocusKey.current === key) return;
    lastAutoFocusKey.current = key;
    if (state.currentItem) {
      setSelectedId(`${state.currentItem.type}-${state.currentItem.id}`);
      focusItem(state.currentItem, false);
    } else {
      const bounds = regionForBounds(state.day);
      if (bounds) {
        if (mapReady) mapRef.current?.animateToRegion(bounds, 600);
        else setInitialRegion(bounds);
      }
      setSelectedId(null);
    }
  }, [state.loading, state.day, state.currentItem, state.items, state.date, focusItem, mapReady]);

  const dateLabel = state.isToday
    ? 'Today'
    : state.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MapView
        ref={mapRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        initialRegion={initialRegion}
        showsUserLocation
        showsCompass={false}
        userInterfaceStyle={theme.dark ? 'dark' : 'light'}
        onMapReady={() => setMapReady(true)}
      >
        {state.day ? (
          <MapOverlays
            day={state.day}
            selectedId={selectedId}
            locationPoints={state.locationPoints}
            purchases={state.purchases}
            onSelect={selectItem}
          />
        ) : null}
      </MapView>

      {/* Floating date pill */}
      <View style={{
        position: 'absolute', top: insets.top + spacing.sm, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
      }}>
        <Pill onPress={state.goPrevDay} style={{ paddingHorizontal: spacing.md, marginRight: spacing.sm }}>
          <Icon name="chevron-left" size={22} color={colors.textPrimary} />
        </Pill>
        <Pill>{dateLabel}</Pill>
        <Pill
          onPress={state.isToday ? undefined : state.goNextDay}
          style={{ paddingHorizontal: spacing.md, marginLeft: spacing.sm, opacity: state.isToday ? 0.4 : 1 }}
        >
          <Icon name="chevron-right" size={22} color={colors.textPrimary} />
        </Pill>
        {state.loading ? (
          <View style={{ position: 'absolute', right: spacing.lg }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}
      </View>

      {/* Error banner */}
      {state.error && !state.loading ? (
        <View style={{
          position: 'absolute', top: insets.top + 64, left: spacing.lg, right: spacing.lg,
          backgroundColor: colors.dangerSoft, borderRadius: 12, padding: spacing.md,
          flexDirection: 'row', alignItems: 'center',
        }}>
          <Text style={[type.caption, { flex: 1, color: colors.danger }]}>{state.error}</Text>
          <Text onPress={state.reload} style={[type.caption, { color: colors.danger, fontWeight: '700', marginLeft: spacing.md }]}>
            Retry
          </Text>
        </View>
      ) : null}

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      >
        <TimelineSheet state={state} selectedId={selectedId} onSelect={selectItem} listRef={listRef} />
      </BottomSheet>
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm test` — Expected: clean/PASS.

- [ ] **Step 3: Commit**

```bash
git add src/screens/timeline/TimelineMapScreen.tsx
git commit -m "feat: full-screen TimelineMapScreen with floating date pill and bottom sheet"
```

---

### Task 9: You tab + navigation shell

**Files:**
- Create: `src/screens/you/YouScreen.tsx`, `src/screens/you/TrackingStatusScreen.tsx`, `src/navigation/AppTabs.tsx`
- Modify: `navigation/RootNavigator.js` (consume AppTabs + nav theme)

**Interfaces:**
- Consumes: `useAuth()` (`user`, `logout`), `isAdminUser` from `utils/adminUtils.js`, existing `HomeScreen` content (ported), `HeartbeatDebugScreen` (mounted as-is inside the You stack), `TransactionsScreen` (mounted as-is as Spend placeholder), `TimelineMapScreen` (Task 8).
- Produces: `AppTabs` default export replacing `AppNavigator`; route names: tabs `Timeline`, `Spend`, `You`; You-stack screens `YouHome`, `TrackingStatus`, `Diagnostics`.

- [ ] **Step 1: `TrackingStatusScreen.tsx`**

Port the content of `components/HomeScreen.js` (status cards, tracking detail rows, action buttons, BuildInfo) onto the design system. The spec's separate "AboutScreen" is deliberately folded in here: the existing `BuildInfo` expandable panel at the bottom of this screen covers it — do not create a fourth You-stack screen. Details: reuse its hooks/state logic verbatim (`useLocationTracking`, `useAppState` if used, `BuildInfo` component import stays), but render with themed `View`/`Text`/`ListRow`/`Pill` instead of the old `Card`/`Button`/emoji. Keep the debug-notifications toggle and "Get Current Location" / "Restart Location Tracking" buttons with their existing handlers. Logout does NOT live here (moves to YouScreen).

- [ ] **Step 2: `YouScreen.tsx`**

```tsx
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { ListRow } from '../../ui';
import { useAuth } from '../../../AuthContext';
import { isAdminUser } from '../../../utils/adminUtils';

export function YouScreen({ navigation }: { navigation: any }) {
  const { colors, spacing, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.xl, paddingHorizontal: spacing.lg }}>
      {/* Profile header */}
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <View style={{
          width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft,
          alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
        }}>
          <Text style={[type.title, { color: colors.primary }]}>
            {(user?.email ?? '?')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={[type.heading, { color: colors.textPrimary }]}>{user?.email ?? ''}</Text>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: 16, paddingVertical: spacing.xs }}>
        <ListRow icon="crosshairs-gps" title="Location tracking"
          subtitle="Status, permissions, sync" onPress={() => navigation.navigate('TrackingStatus')} />
        {isAdminUser(user) ? (
          <ListRow icon="stethoscope" title="Diagnostics"
            subtitle="Heartbeats and background tasks" onPress={() => navigation.navigate('Diagnostics')} />
        ) : null}
        <ListRow icon="logout" title="Sign out" onPress={logout} />
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 3: `AppTabs.tsx`**

```tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { TimelineMapScreen } from '../screens/timeline/TimelineMapScreen';
import { YouScreen } from '../screens/you/YouScreen';
import { TrackingStatusScreen } from '../screens/you/TrackingStatusScreen';
import TransactionsScreen from '../../components/TransactionsScreen';
import HeartbeatDebugScreen from '../../components/HeartbeatDebugScreen';

const Tab = createBottomTabNavigator();
const YouStack = createNativeStackNavigator();

function YouStackNavigator() {
  const { colors } = useTheme();
  return (
    <YouStack.Navigator screenOptions={{
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
    }}>
      <YouStack.Screen name="YouHome" component={YouScreen} options={{ headerShown: false }} />
      <YouStack.Screen name="TrackingStatus" component={TrackingStatusScreen} options={{ title: 'Location tracking' }} />
      <YouStack.Screen name="Diagnostics" component={HeartbeatDebugScreen} options={{ title: 'Diagnostics' }} />
    </YouStack.Navigator>
  );
}

const tabIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Timeline: 'map-clock', Spend: 'credit-card-outline', You: 'account-circle-outline',
};

export default function AppTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textTertiary,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      tabBarIcon: ({ color, size }) => (
        <MaterialCommunityIcons name={tabIcons[route.name]} color={color} size={size} />
      ),
    })}>
      <Tab.Screen name="Timeline" component={TimelineMapScreen} />
      <Tab.Screen name="Spend" component={TransactionsScreen} />
      <Tab.Screen name="You" component={YouStackNavigator} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 4: Rewire `navigation/RootNavigator.js`**

Replace the `AppNavigator` import with `import AppTabs from '../src/navigation/AppTabs';`, render `<AppTabs />` where `<AppNavigator />` was, and theme the container:

```js
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useColorScheme } from 'react-native';
```

inside the component: `const scheme = useColorScheme();` and `<NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test` — Expected: clean/PASS.
Run the bundle check (`npx expo export --platform ios --output-dir /tmp/p2-nav > /dev/null && echo OK && rm -rf /tmp/p2-nav`) — Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add src/screens/you src/navigation navigation/RootNavigator.js
git commit -m "feat: 3-tab shell (Timeline/Spend/You) with themed navigation"
```

---

### Task 10: Retire replaced screens + auth restyle + final sweep

**Files:**
- Delete: `components/MapTimelineScreen.js`, `components/HomeScreen.js`, `navigation/AppNavigator.js`, `navigation/TabBarIcon.js`
- Modify: `components/index.js`, `navigation/index.js` (drop deleted exports)
- Modify: `LoginScreen.js`, `RegisterScreen.js` (theme-consume restyle)

**Interfaces:** none new.

- [ ] **Step 1: Delete replaced files and fix barrels**

```bash
git rm components/MapTimelineScreen.js components/HomeScreen.js navigation/AppNavigator.js navigation/TabBarIcon.js
```

Remove `MapTimelineScreen` export from `components/index.js`; remove `AppNavigator` and `TabBarIcon` exports from `navigation/index.js`. Then:

```bash
grep -rn "MapTimelineScreen\|AppNavigator\|TabBarIcon\|HomeScreen" --include='*.js' --include='*.tsx' . | grep -v node_modules | grep -v docs/
```

Expected: no output (AuthNavigator still exists and stays).

- [ ] **Step 2: Restyle Login/Register**

Convert both screens to consume `useTheme()`: background `colors.background`, card `colors.surface`, inputs bordered `colors.border` with `colors.textPrimary` text, primary button `colors.primary`/`colors.onPrimary`, status bar via `expo-status-bar` `<StatusBar style="auto" />` (replaces the hardcoded `barStyle="dark-content"` in `LoginScreen.js:51`). No flow/handler changes. These files may stay `.js` — `useTheme` imports fine from JS.

- [ ] **Step 3: No-emoji / no-hex sweep**

```bash
grep -rnE '#[0-9A-Fa-f]{6}' src/ --include='*.ts' --include='*.tsx' | grep -v theme/tokens.ts
grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' src/ LoginScreen.js RegisterScreen.js 2>/dev/null
```

Expected: first grep hits only shadow colors `#000` inside `tokens.ts`-adjacent elevation use (none outside tokens.ts is the goal — move any stragglers into tokens); second grep: no output. Legacy untouched files (`components/*.js` still alive, `HeartbeatDebugScreen`, `TransactionsScreen`) are exempt this phase.

- [ ] **Step 4: Full verify**

```bash
npm test && npx tsc --noEmit && npx expo export --platform ios --output-dir /tmp/p2-final > /dev/null && echo ALL_OK && rm -rf /tmp/p2-final
```

Expected: `ALL_OK`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: retire legacy shell, restyle auth screens, enforce token-only colors"
```

---

### Task 11: Device verification (human-in-the-loop)

- [ ] **Step 1: Report build instructions**

Dependencies changed (reanimated/gesture-handler) → a new dev build is required: `npm run dev:ios` locally, or an EAS dev build for device. List in the report.

- [ ] **Step 2: Manual checklist for the human**

- Timeline tab: map fills screen; date pill navigates days; sheet drags between 12/45/88%; tapping rows pans map; tapping markers scrolls list; travel lines colored by mode; purchases show on visits.
- Dark mode: flip system appearance — map, sheet, pills, tabs all follow.
- Spend tab: transactions list loads (placeholder screen).
- You tab: profile header, tracking status screen works (start/stop tracking), diagnostics (admin), sign out.
- Background tracking still runs after the app is backgrounded (check Home→You status card and server ingest).
