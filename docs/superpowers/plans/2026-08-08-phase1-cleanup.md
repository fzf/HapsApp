# Phase 1: Cleanup & Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four latent bugs, delete dead code, remove committed secrets, and turn on crash reporting so Phase 2 builds on a clean base.

**Architecture:** No new architecture — surgical fixes and deletions in the existing Expo/React Native app. Spec: `docs/superpowers/specs/2026-08-08-mobile-parity-redesign-design.md` (Phase 1 section).

**Tech Stack:** Expo SDK 53, React Native 0.79.5, Jest (jest-expo preset, already configured), @sentry/react-native ~6.14.0.

## Global Constraints

- Work on branch `redesign/phase-1-cleanup`, created from `design/parity-redesign-spec` (which sits on top of `fix/background-heartbeat-task-identifier`, the de-facto mainline — **not** `master`, which is ancient).
- All commands run from the repo root `/Users/fzf/Projects/haps/HapsApp`.
- `npm test` must pass after every task (existing suites: `__tests__/hooks/useAuthRequest.test.js`, `__tests__/services/APIService.test.js`, `tests/HeartbeatService.test.js`).
- Do not modify `hooks/useAuthRequest.js` (it is used and has its own test suite).
- Never print or commit values from `.env*` files; refer to keys by name only.

---

### Task 0: Create the working branch

**Files:** none

- [ ] **Step 1: Branch**

```bash
git checkout design/parity-redesign-spec
git checkout -b redesign/phase-1-cleanup
```

- [ ] **Step 2: Baseline test run**

Run: `npm test`
Expected: current suites pass (record any pre-existing failures verbatim in the task report; do not fix them silently). Note: `App.test.js` in the repo root is NOT a jest test — it is an abandoned app entry deleted in Task 1. If jest picks it up and errors, that confirms Task 1's motivation; note it and continue.

**Baseline finding (2026-08-08):** the baseline is RED — 25/30 tests failing across all 4 suites before any change. Task 0.5 repairs this; until it lands, "npm test passes" in later tasks means "the suites Task 0.5 made green stay green."

---

### Task 0.5: Repair or quarantine the stale test suites

The suites predate the current service implementations: `__tests__/services/APIService.test.js` mocks `fetch`/network in ways the current `APIService` no longer matches; `tests/HeartbeatService.test.js` likewise; `__tests__/hooks/useAuthRequest.test.js` fails in `renderHook`/`act` under React 19 + RN 0.79. (`App.test.js` is not a test and dies in Task 1.)

**Files:**
- Modify: `__tests__/services/APIService.test.js`, `tests/HeartbeatService.test.js`, `__tests__/hooks/useAuthRequest.test.js` (repair to test CURRENT behavior)
- Modify (only if needed): `jest-setup.js`, `package.json` jest config

**Interfaces:** Tasks 4 and 5 append regression tests to the APIService and HeartbeatService suites — those files must run green after this task.

- [ ] **Step 1: Diagnose each suite** — run each file individually (`npx jest <file>`) and classify every failure: (a) stale mock vs. current implementation, (b) React 19 incompatibility, (c) genuinely broken product code.
- [ ] **Step 2: Repair** — rewrite stale mocks/assertions against current service behavior. Keep test intent; drop tests whose subject no longer exists. For (c) cases: do NOT fix product code in this task — report them.
- [ ] **Step 3: Delete only irreparable tests** — a test may be deleted only when the behavior it tested is gone or the test never asserted real behavior; list every deletion in the task report with the reason.
- [ ] **Step 4: Verify** — `npm test` → all suites pass (App.test.js failures excepted until Task 1 removes it; if it blocks the run, add `App.test.js` to jest `testPathIgnorePatterns` and note that Task 1 deletes the file).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "test: repair stale suites against current service implementations"`

---

### Task 1: Delete abandoned entries, build artifact, and unused data layer

**Files:**
- Delete: `App.js.backup`, `App.js.complex`, `App.minimal.js`, `App.test.js` (tracked)
- Delete: `build-1782230691280.ipa` (untracked, 15 MB)
- Delete: `repositories/BaseRepository.js`, `repositories/LocationRepository.js`, `repositories/TimelineRepository.js`, `repositories/index.js`
- Delete: `hooks/useTimeline.js`
- Modify: `hooks/index.js` (remove the `useTimeline` re-export line)

**Interfaces:**
- Consumes: nothing
- Produces: nothing — later tasks rely only on these files being gone.

- [ ] **Step 1: Verify nothing imports the doomed files**

```bash
grep -rn "repositories\|useTimeline\|usePaginatedTimeline\|App.js.backup\|App.minimal" \
  --include='*.js' . | grep -v node_modules | grep -v '^\./repositories/' | grep -v '^\./hooks/useTimeline.js'
```

Expected: the only hits are `hooks/index.js` (the re-export you are about to remove) and possibly comments. If any screen/service imports these, STOP and report — do not delete.

- [ ] **Step 2: Delete**

```bash
git rm App.js.backup App.js.complex App.minimal.js App.test.js
git rm -r repositories
git rm hooks/useTimeline.js
rm -f build-1782230691280.ipa
```

- [ ] **Step 3: Remove the re-export from `hooks/index.js`**

Delete the line that re-exports from `./useTimeline` (keep the `useAuthRequest` and `useLocation` lines).

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: PASS (same result set as Task 0 baseline, minus any noise from `App.test.js`).
Run: `npx expo export --platform ios --output-dir /tmp/phase1-bundle-check > /dev/null && echo BUNDLE_OK`
Expected: `BUNDLE_OK` (proves the JS bundle still resolves all imports). Delete `/tmp/phase1-bundle-check` afterwards.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove abandoned app entries, unused repositories layer, and stray ipa"
```

---

### Task 2: Delete the unrouted legacy screens

**Files:**
- Delete: `components/MapViewScreen.js`, `components/TimelineListScreen.js`
- Modify: `components/index.js` (remove the two exports)

**Interfaces:**
- Consumes: nothing
- Produces: `components/index.js` no longer exports `MapViewScreen`/`TimelineListScreen`. Task 7 (VisitTrackingService removal) relies on `TimelineListScreen.js` being gone.

- [ ] **Step 1: Verify they are unrouted**

```bash
grep -rn "MapViewScreen\|TimelineListScreen" --include='*.js' . | grep -v node_modules
```

Expected: hits only in `components/index.js` and the two files themselves. (`navigation/AppNavigator.js` imports `MapTimelineScreen` — different file, keep it.)

- [ ] **Step 2: Delete and un-export**

```bash
git rm components/MapViewScreen.js components/TimelineListScreen.js
```

In `components/index.js` delete these two lines:

```js
export { default as MapViewScreen } from './MapViewScreen';
export { default as TimelineListScreen } from './TimelineListScreen';
```

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unrouted MapViewScreen and TimelineListScreen"
```

---

### Task 3: Remove committed env files from tracking; add example file

`.env` is gitignored today but `.env.development` and `.env.production` are **tracked**, and `.env` itself was committed historically (commit `77f8bd7`). Secrets in any of these must be treated as leaked.

**Files:**
- Modify: `.gitignore` (track-stop patterns)
- Untrack (keep on disk): `.env.development`, `.env.production`
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing
- Produces: `.env.example` documenting required env keys (names only, no values).

- [ ] **Step 1: Untrack without deleting from disk**

```bash
git rm --cached .env.development .env.production
```

- [ ] **Step 2: Extend `.gitignore`**

In the `# local env files` section, add exactly these two lines (`.env.example` must stay trackable — do not ignore it):

```
.env.development
.env.production
```

- [ ] **Step 3: Create `.env.example`**

List every key present in `.env`, `.env.development`, `.env.production` (read them locally; copy KEY names only, values as empty or `<see 1Password>`). Known keys from the audit: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_LOGTAIL_TOKEN`, `SENTRY_AUTH_TOKEN`, `HERE_API_KEY`, `EXPO_PUBLIC_ERROR_WEBHOOK` (this last one is referenced by no code — omit it from the example and delete the line from `.env` if present).

- [ ] **Step 4: Verify**

```bash
git status --short | grep -E '\.env' ; git ls-files | grep -E '^\.env'
```

Expected: `.env.development`/`.env.production` show as deleted-from-index (`D`), untracked on disk; `git ls-files` shows only `.env.example`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: stop tracking env files; add .env.example

.env.development/.env.production were tracked and .env was committed
historically (77f8bd7). Treat SENTRY_AUTH_TOKEN, HERE_API_KEY, the
Discord webhook, and Logtail tokens as leaked - rotate them."
```

- [ ] **Step 6: Report rotation list**

In the task report, list the key NAMES needing rotation so the human can rotate them (never print values).

---

### Task 4: Fix `HeartbeatService.start()` call in AppStateContext

`contexts/AppStateContext.js:183` calls `HeartbeatService.start()`; the service (class instance default-exported from `services/HeartbeatService.js`) only defines `startHeartbeat()` (line 78). The call sits behind a `state.heartbeatStatus === 'active'` guard that never fires today, so it's a landmine, not a crash — fix the call.

**Files:**
- Modify: `contexts/AppStateContext.js:183`
- Test: `tests/HeartbeatService.test.js` (extend existing suite)

**Interfaces:**
- Consumes: `HeartbeatService.startHeartbeat(): Promise<void>` (existing)
- Produces: nothing new.

- [ ] **Step 1: Write the failing regression test**

Append to `tests/HeartbeatService.test.js`:

```js
describe('AppStateContext heartbeat integration', () => {
  it('calls a method that actually exists on HeartbeatService', () => {
    const HeartbeatService = require('../services/HeartbeatService').default;
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../contexts/AppStateContext.js'), 'utf8');
    // Every HeartbeatService.<method>( call in the context must exist on the service
    const calls = [...source.matchAll(/HeartbeatService\.(\w+)\(/g)].map(m => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const method of calls) {
      expect(typeof HeartbeatService[method]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npx jest tests/HeartbeatService.test.js -t "actually exists" `
Expected: FAIL — `start` is not a function on the service.

- [ ] **Step 3: Fix the call site**

In `contexts/AppStateContext.js` line 183: `await HeartbeatService.start();` → `await HeartbeatService.startHeartbeat();`

- [ ] **Step 4: Run tests — must pass**

Run: `npx jest tests/HeartbeatService.test.js`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add contexts/AppStateContext.js tests/HeartbeatService.test.js
git commit -m "fix: AppStateContext called nonexistent HeartbeatService.start()"
```

---

### Task 5: Fix `APIService.getTransactions()` call in TransactionsScreen

`components/TransactionsScreen.js:94` calls `APIService.getTransactions(...)`; the client (default-exported instance from `services/APIService.js`) defines `getTransactionsForDate(dateString)`. The screen is currently unrouted but Phase 2 mounts it as the Spend placeholder — it must work.

**Files:**
- Modify: `components/TransactionsScreen.js:94`
- Test: `__tests__/services/APIService.test.js` (extend existing suite)

**Interfaces:**
- Consumes: `APIService.getTransactionsForDate(dateString: 'YYYY-MM-DD'): Promise<{date, timezone, transactions: [...]}>` (existing)
- Produces: a working `TransactionsScreen` that Phase 2 Task "Navigation shell" mounts unchanged.

- [ ] **Step 1: Write the failing regression test**

Append to `__tests__/services/APIService.test.js`:

```js
describe('TransactionsScreen API usage', () => {
  it('only calls methods that exist on APIService', () => {
    const APIService = require('../../services/APIService').default;
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../components/TransactionsScreen.js'), 'utf8');
    const calls = [...source.matchAll(/APIService\.(\w+)\(/g)].map(m => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const method of calls) {
      expect(typeof APIService[method]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npx jest __tests__/services/APIService.test.js -t "only calls methods"`
Expected: FAIL — `getTransactions` is not a function.

- [ ] **Step 3: Fix the call site**

Line 94: `APIService.getTransactions(toLocalDateString(date))` → `APIService.getTransactionsForDate(toLocalDateString(date))`

- [ ] **Step 4: Run tests — must pass**

Run: `npx jest __tests__/services/APIService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/TransactionsScreen.js __tests__/services/APIService.test.js
git commit -m "fix: TransactionsScreen called nonexistent APIService.getTransactions()"
```

---

### Task 6: Fix effect-ordering TDZ hazard in MapTimelineScreen

The `AppState` effect at `components/MapTimelineScreen.js:256-271` lists `load` in its dependency array, but `load` (a `useCallback`) is declared at line 300 — below the effect. It works only because the closure runs async. Move the AppState effect below the `load` declaration.

**Files:**
- Modify: `components/MapTimelineScreen.js` (move the effect block at lines 255–271 to just after the `useEffect(() => { load(selectedDate); }, ...)` at line 396)

**Interfaces:** none.

- [ ] **Step 1: Move the block**

Cut lines 252–271 (the `lastLoadedDate` ref + the "Refresh when app comes back to foreground" `useEffect`) and paste them immediately AFTER line 396 (`useEffect(() => { load(selectedDate); }, [selectedDate, token]);`). Keep the code identical — only position changes. The `lastLoadedDate` ref declaration moves together with the effect that uses it.

- [ ] **Step 2: Verify order and behavior**

```bash
awk '/const load = useCallback/{l=NR} /AppState.addEventListener/{a=NR} END{ if (l && a && l < a) print "ORDER_OK"; else print "ORDER_BAD l=" l " a=" a }' components/MapTimelineScreen.js
```

Expected: `ORDER_OK`
Run: `npm test` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/MapTimelineScreen.js
git commit -m "fix: declare load before the AppState effect that depends on it"
```

---

### Task 7: Remove on-device VisitTrackingService

The server owns visit detection; this 583-line on-device clustering service runs on every GPS point with no routed consumer (its only reader, `TimelineListScreen`, was deleted in Task 2). Removing it saves CPU/battery on every location update.

**Files:**
- Delete: `services/VisitTrackingService.js`
- Modify: `services/index.js` (remove line 9: `export { default as VisitTrackingService } from './VisitTrackingService';`)
- Modify: `services/LocationService.js` — remove line 9 (import), line 49 (`await VisitTrackingService.initialize();`), line 176 (`await VisitTrackingService.processLocation(locationData);`), and in `getServiceStatus()` remove line 474 (`const visitStats = ...`) plus the `visitStats` keys at lines 485 and 498 (set nothing — delete the property from both return objects)
- Modify: `hooks/useLocation.js` — remove `VisitTrackingService` from the import on line 3 and delete the entire `useVisitTracking` export (lines 124 to the end of that function)
- Modify: `hooks/index.js` line 3 — `export { useLocationTracking, useVisitTracking } from './useLocation';` → `export { useLocationTracking } from './useLocation';`

**Interfaces:**
- Consumes: nothing
- Produces: `LocationService.getServiceStatus()` return no longer contains `visitStats` (verified consumer-free: only `HomeScreen` uses `useLocationTracking`, and no component reads `visitStats`).

- [ ] **Step 1: Confirm no remaining consumers**

```bash
grep -rn "VisitTrackingService\|useVisitTracking\|visitStats" --include='*.js' . | grep -v node_modules
```

Expected: hits only in the files listed above. Anything else → STOP and report.

- [ ] **Step 2: Apply the removals** (as listed in **Files**)

```bash
git rm services/VisitTrackingService.js
```

Then edit the four modify-files exactly as described.

- [ ] **Step 3: Verify**

```bash
grep -rn "VisitTrackingService\|useVisitTracking\|visitStats" --include='*.js' . | grep -v node_modules | grep -v docs/
```

Expected: no output.
Run: `npm test` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "perf: remove on-device VisitTrackingService (server owns visit detection)"
```

---

### Task 8: Initialize Sentry

`@sentry/react-native` is installed, the Expo plugin is configured in `app.json`, and 8 files call `Sentry.captureException`/`addBreadcrumb`/`setUser` — but `Sentry.init()` is never called, so every one is a silent no-op.

**Files:**
- Modify: `App.js` (init + wrap)
- Create: `config/sentry.js`

**Interfaces:**
- Consumes: `process.env.EXPO_PUBLIC_SENTRY_DSN` (add the key to `.env.example`; the human supplies the value — the DSN is client-safe by design)
- Produces: `initSentry(): void` from `config/sentry.js`; `App` default export wrapped in `Sentry.wrap()`.

- [ ] **Step 1: Create `config/sentry.js`**

```js
import * as Sentry from '@sentry/react-native';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // no DSN configured (e.g. local dev) — stay silent
  Sentry.init({
    dsn,
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
  });
  initialized = true;
}
```

- [ ] **Step 2: Wire into `App.js`**

Replace the current `App.js` (24 lines) with:

```js
import React from 'react';
import * as Sentry from '@sentry/react-native';
// Import task definitions early to ensure background tasks are defined
import './taskDefinitions';
import { initSentry } from './config/sentry';
import { AuthProvider } from './AuthContext';
import { AppStateProvider } from './contexts';
import { ErrorBoundary } from './components';
import { RootNavigator } from './navigation';

initSentry();

function App() {
  return (
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
  );
}

export default Sentry.wrap(App);
```

Add `EXPO_PUBLIC_SENTRY_DSN=` to `.env.example`.

- [ ] **Step 3: Write a test that init is actually called from App**

Create `__tests__/sentry-init.test.js`:

```js
it('App.js calls initSentry and wraps the export', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../App.js'), 'utf8');
  expect(source).toMatch(/initSentry\(\)/);
  expect(source).toMatch(/Sentry\.wrap\(App\)/);
});
```

Run: `npx jest __tests__/sentry-init.test.js` — Expected: PASS.
Run: `npm test` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add App.js config/sentry.js __tests__/sentry-init.test.js .env.example
git commit -m "fix: initialize Sentry - capture calls were silent no-ops"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full suite + bundle check**

```bash
npm test && npx expo export --platform ios --output-dir /tmp/phase1-final-check > /dev/null && echo ALL_OK && rm -rf /tmp/phase1-final-check
```

Expected: `ALL_OK`.

- [ ] **Step 2: Manual smoke test (human)**

Report to the human: run `npm run dev:ios`, confirm login → Timeline loads → Home status card correct. Sentry verification (throw a test error on a production-profile build) is a human step — list it as pending in the report.
