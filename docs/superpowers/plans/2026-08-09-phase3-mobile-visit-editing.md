# Phase 3 Mobile: Visit Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visit-detail screen with a ranked "Wrong place?" picker, geocode refresh, and admin day-reprocessing — consuming the new Phase 3 API endpoints.

**Architecture:** Timeline tab becomes a native stack (TimelineMap → VisitDetail). Data via a `useVisitDetail` hook over new `APIService` methods; a tiny module-level refresh flag tells `TimelineMapScreen` to reload the day after edits. Spec: `docs/superpowers/specs/2026-08-09-phase3-timeline-editing-design.md` (mobile section).

**Tech Stack:** Existing Phase 2 stack (TS strict, tokens/ui primitives, react-navigation 7, jest-expo).

## Global Constraints

- Branch `redesign/phase-3-timeline-editing` (already created) off `redesign/phase-2-shell`. All commands from `/Users/fzf/Projects/haps/HapsApp`.
- After every task: full `npm test` green AND `npx tsc --noEmit` clean (baseline: 10 suites, 69 passed + 1 todo). Bundle check where a task says so: `npx expo export --platform ios --output-dir .expo-export-check > /dev/null && echo BUNDLE_OK; rm -rf .expo-export-check`.
- No hex colors outside `src/theme/tokens.ts`; no emoji glyphs; new UI uses `src/ui` primitives + tokens. `components/HeartbeatDebugScreen.js` is legacy-exempt for styling but not for emoji in NEW strings.
- Server contracts (types must match exactly): visit gains `location_source`, `location_confidence_score`; `location` + suggestions carry `{id,name,address,city,state,latitude,longitude}`; suggestions add `rank` (1-based, ordered) and `providers: string[]`. Endpoints: `GET /api/timeline/visits/:id` → visit object; `PATCH /api/timeline/visits/:id/location` body `{location_id}` → visit object; `POST /api/timeline/visits/:id/geocode` and `/force_geocode` → `{message, visit}` on 200, `{error}` on 422/429; `POST /api/timeline/reprocess_day` body `{date, mode}` → `{message, processed_count, visits_count, travels_count}`.
- TDD where a task defines tests; report RED/GREEN evidence and full-suite totals.

## File Structure

```
src/api/types.ts                          # extend: SuggestedLocation, source fields
services/APIService.js                    # +4 methods (legacy JS client, single transport)
src/hooks/useVisitDetail.ts               # NEW — fetch + mutations + optimistic select
src/screens/timeline/refreshFlag.ts       # NEW — { current: boolean } module ref
src/screens/timeline/VisitDetailScreen.tsx# NEW
src/screens/timeline/TimelineItemRow.tsx  # + chevron accessory / onDetailPress
src/screens/timeline/TimelineSheet.tsx    # thread onDetailPress
src/screens/timeline/TimelineMapScreen.tsx# navigation to detail + focus-refresh
src/navigation/AppTabs.tsx                # Timeline tab → stack
components/HeartbeatDebugScreen.js        # + Timeline reprocess section (admin)
```

---

### Task 1: Types + APIService methods

**Files:**
- Modify: `src/api/types.ts`, `services/APIService.js`
- Test: `__tests__/services/APIService.test.js` (append)

**Interfaces:**
- Produces in `types.ts` (additive):

```ts
export interface SuggestedLocation {
  id: number;
  name: string | null;
  address: string | null;
  city?: string | null;
  state?: string | null;
  latitude: number;
  longitude: number;
  rank: number;
  providers: string[];
}
```

`TimelineLocation` gains `city?: string | null; state?: string | null;`.
`TimelineVisit` gains `location_source?: string; location_confidence_score?: number;`
and its `suggested_locations?` becomes `SuggestedLocation[]`.
New: `export interface GeocodeResponse { message: string; visit: TimelineVisit; }`
and `export interface ReprocessResponse { message: string; processed_count: number; visits_count: number | null; travels_count: number | null; }`.

- Produces in `APIService.js` (mirror the existing write helpers' use of the
  internal `request` method — read `login()`/`uploadLocations()` first and copy
  their body/method conventions exactly):

```js
async getVisit(visitId) {
  return this.request(`/api/timeline/visits/${visitId}`);
}
async updateVisitLocation(visitId, locationId) {
  return this.request(`/api/timeline/visits/${visitId}/location`, {
    method: 'PATCH', body: JSON.stringify({ location_id: locationId }),
  });
}
async geocodeVisit(visitId, { force = false } = {}) {
  return this.request(`/api/timeline/visits/${visitId}/${force ? 'force_geocode' : 'geocode'}`, {
    method: 'POST',
  });
}
async reprocessDay(dateString, mode = 'unassigned') {
  return this.request('/api/timeline/reprocess_day', {
    method: 'POST', body: JSON.stringify({ date: dateString, mode }),
  });
}
```

(If `request`'s option shape differs — e.g. it takes `(endpoint, method, data)` —
adapt to the real signature and note it in the report; the endpoint paths and
payload keys above are the contract.)

- [ ] **Step 1: Write failing test** — append to `__tests__/services/APIService.test.js`:

```js
describe('Phase 3 visit editing methods', () => {
  it('exposes the visit editing API surface', () => {
    const APIService = require('../../services/APIService').default;
    for (const m of ['getVisit', 'updateVisitLocation', 'geocodeVisit', 'reprocessDay']) {
      expect(typeof APIService[m]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: RED** (methods undefined). **Step 3: Implement** types + methods.
- [ ] **Step 4: GREEN** — new test + full `npm test` + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: visit-editing API methods and types"`

---

### Task 2: `useVisitDetail` hook

**Files:**
- Create: `src/hooks/useVisitDetail.ts`, `src/screens/timeline/refreshFlag.ts`
- Test: `__tests__/hooks/useVisitDetail.test.tsx`

**Interfaces:**
- `refreshFlag.ts`:

```ts
// Set by VisitDetail after a successful mutation; consumed (and cleared)
// by TimelineMapScreen's focus listener.
export const timelineNeedsRefresh = { current: false };
```

- Hook:

```ts
export function useVisitDetail(visitId: number): {
  visit: TimelineVisit | null;
  loading: boolean;        // initial fetch
  busy: boolean;           // mutation in flight
  error: string | null;
  clearError: () => void;
  selectLocation: (locationId: number) => Promise<void>;  // optimistic
  refreshGeocode: (force?: boolean) => Promise<void>;
}
```

Behavior: fetch on mount via `APIService.getVisit`; `selectLocation` applies the
chosen suggestion to local state immediately (location + `location_source:'manual'`
+ confidence 1.0), calls `updateVisitLocation`, replaces state with the server
visit on success, reverts and sets `error` on failure; `refreshGeocode` sets
`busy`, calls `geocodeVisit(visitId, {force})`, applies `response.visit`; both
set `timelineNeedsRefresh.current = true` on success. Error text: use
`err.message`; when the error has `status === 429` use
`'Rate limited — try again later'` (the APIError class exposes `status`; verify
the property name in `services/APIService.js` and adapt).

- [ ] **Step 1: Write failing tests** (mock `../../services/APIService` like
  `__tests__/hooks/useTimelineDay.test.tsx` does): (a) loads visit on mount;
  (b) `selectLocation` optimistically sets location then replaces with server
  response, flips `timelineNeedsRefresh`; (c) failed `selectLocation` reverts to
  the pre-select visit and surfaces `error`; (d) `refreshGeocode` applies
  `response.visit`; (e) 429-shaped rejection → rate-limit message.
- [ ] **Step 2: RED.** **Step 3: Implement.** **Step 4: GREEN** + full suite + tsc.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: useVisitDetail hook with optimistic location selection"`

---

### Task 3: VisitDetailScreen + Timeline stack

**Files:**
- Create: `src/screens/timeline/VisitDetailScreen.tsx`
- Modify: `src/navigation/AppTabs.tsx`

**Interfaces:**
- AppTabs: Timeline tab component becomes `TimelineStackNavigator`:

```tsx
const TimelineStack = createNativeStackNavigator();
function TimelineStackNavigator() {
  const { colors } = useTheme();
  return (
    <TimelineStack.Navigator screenOptions={{
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
    }}>
      <TimelineStack.Screen name="TimelineMap" component={TimelineMapScreen} options={{ headerShown: false }} />
      <TimelineStack.Screen name="VisitDetail" component={VisitDetailScreen} options={{ title: 'Visit' }} />
    </TimelineStack.Navigator>
  );
}
```

Route params: `VisitDetail: { visitId: number }`.

- Screen structure (tokens/ui only): full-screen loading (ActivityIndicator) /
  full-screen error with Retry (same pattern as `TrackingStatusScreen`); content:
  - Header card: place name (`type.title`), address + city/state caption, source
    badge — `location_source === 'manual'` → "Set by you" (primarySoft/primary),
    `'purchase_match'` → "From purchase" (successSoft/success), else
    "Auto-detected · <round(confidence*100)>%" (surfaceAlt/textSecondary);
    time range + duration caption (reuse `fmtTime`/`fmtDuration`).
  - "Wrong place?" section (`type.heading`): one `ListRow` per suggestion in
    order — icon `map-marker-outline`, title name, subtitle
    `[address, providers[0]].filter(Boolean).join(' · ')`,
    `selected={visit.location?.id === s.id}`, right accessory `check` Icon when
    selected; `onPress={() => selectLocation(s.id)}`; rows disabled while `busy`.
    Empty state caption when no suggestions: "No alternative places found".
  - Actions: a primary-styled Pressable "Refresh place info" →
    `refreshGeocode(false)`; when `isAdminUser(user)`, `onLongPress` opens
    `Alert.alert('Force full refresh?', 'Re-queries all providers and rebuilds suggestions.', [Cancel, {text:'Force refresh', style:'destructive', onPress: () => refreshGeocode(true)}])`.
    Spinner replaces label while `busy`.
  - Inline error banner (dangerSoft/danger) with dismiss when `error`.
  - `navigation.setOptions({ title: visit.location?.name ?? 'Visit' })` when loaded.
- [ ] **Step 1: Implement** screen + stack (no dedicated screen test — hook holds the logic; verification is tsc + suite + bundle).
- [ ] **Step 2: Verify** — full `npm test`, `npx tsc --noEmit`, BUNDLE_OK.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: visit detail screen with ranked place picker"`

---

### Task 4: Entry point + focus refresh

**Files:**
- Modify: `src/screens/timeline/TimelineItemRow.tsx`, `src/screens/timeline/TimelineSheet.tsx`, `src/screens/timeline/TimelineMapScreen.tsx`

**Interfaces:**
- `TimelineItemRow` gains optional `onDetailPress?: (item: TimelineItem) => void`;
  when `item.type === 'visit' && selected && onDetailPress`, render a
  `chevron-right` Icon accessory (Pressable, accessibilityRole="button",
  hitSlop 8) at the row's right edge calling `onDetailPress(item)`; ALSO call
  `onDetailPress` (instead of `onPress`) when the row is tapped while already
  `selected` — tap-to-select, tap-again-for-detail.
- `TimelineSheet` accepts and threads `onDetailPress` to rows.
- `TimelineMapScreen`: `const navigation = useNavigation<any>();`
  `onDetailPress = (item) => navigation.navigate('VisitDetail', { visitId: item.id })`.
  Focus refresh: in a `useEffect`, `navigation.addListener('focus', () => { if (timelineNeedsRefresh.current) { timelineNeedsRefresh.current = false; state.reload(); } })` (cleanup on unmount).
- [ ] **Step 1: Implement.** **Step 2: Verify** — full suite + tsc + BUNDLE_OK.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: open visit detail from timeline; refresh day after edits"`

---

### Task 5: Diagnostics reprocess actions

**Files:**
- Modify: `components/HeartbeatDebugScreen.js`
- Test: `__tests__/services/APIService.test.js` (append a method-usage scan)

**Interfaces:**
- New "Timeline" section (legacy `Card`/`Button` styling acceptable — this screen
  is legacy-exempt): two buttons.
  - "Reprocess unassigned (today)" → `APIService.reprocessDay(todayString, 'unassigned')`,
    result `message` shown via `Alert.alert('Reprocess', message)`.
  - "Rebuild today (destructive)" → `Alert.alert` confirm
    (`'This deletes and rebuilds today\'s entire timeline from raw GPS. Continue?'`,
    Cancel / destructive Rebuild) → `APIService.reprocessDay(todayString, 'full')`.
  - `todayString` from a local `toLocalDateString(new Date())` (copy the 3-line
    helper or import from `src/screens/timeline/format`).
  - Errors → `Alert.alert('Error', err.message)`. No emoji in the new strings.
- [ ] **Step 1: Failing test** — append to the APIService suite:

```js
it('HeartbeatDebugScreen only calls existing APIService methods', () => {
  const APIService = require('../../services/APIService').default;
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../../components/HeartbeatDebugScreen.js'), 'utf8');
  const calls = [...source.matchAll(/APIService\.(\w+)\(/g)].map((m) => m[1]);
  for (const method of calls) expect(typeof APIService[method]).toBe('function');
});
```

(Passes trivially if the screen previously used no APIService — the value is
locking the NEW calls; if `calls.length === 0` after implementation, the
implementation is wrong.)
- [ ] **Step 2: Implement.** **Step 3: GREEN** + full suite + tsc.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: admin day-reprocessing actions in diagnostics"`

---

### Task 6: Final verification

- [ ] **Step 1:** `npm test && npx tsc --noEmit && npx expo export --platform ios --output-dir .expo-export-check > /dev/null && echo ALL_OK; rm -rf .expo-export-check` — Expected `ALL_OK` with totals quoted.
- [ ] **Step 2:** Human device checklist for the report: select a suggestion → sheet + map pin update after back-navigation; badge shows "Set by you"; force-refresh keeps the manual choice (server protection); reprocess actions respond from Diagnostics.
