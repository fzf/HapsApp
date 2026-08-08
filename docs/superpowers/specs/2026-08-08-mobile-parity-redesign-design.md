# Haps Mobile — Parity + Redesign Design

**Date:** 2026-08-08
**Status:** Approved (roadmap + Phases 1–2 detailed; Phases 3–6 get their own specs)
**Scope:** HapsApp (this repo) for Phases 1–2; later phases also touch haps-server

## Goal

Bring the mobile app to feature parity with the haps-server web application and give
it a modern, Google-Maps-style interface. The work is decomposed into six sub-projects,
each shipping independently with the app working after every phase.

## Background (from the 2026-08-08 audit)

Mobile today: three screens (Home status dashboard, MapTimeline split view, admin
Debug). Strong tracking core (background location, SQLite offline cache, adaptive
sync, heartbeats). No settings/profile, no dark mode, no component library — hardcoded
hex colors and emoji icons. A Transactions screen exists but is unrouted. Latent bugs:
Sentry configured but never initialized; `AppStateContext` calls a nonexistent
`HeartbeatService.start()`; `TransactionsScreen` calls a nonexistent
`APIService.getTransactions()`; `MapTimelineScreen` references `load` in a dep array
before its declaration.

Web-only features (no mobile UI, and mostly **no API endpoints either**): timeline
editing (visit location selection with preference learning, re-geocode, reprocess),
purchases list/detail with receipts and match management, accounts/balances,
net-worth + category dashboards, Plaid/Teller bank linking, Gmail receipt
correlation, and account settings (including `User#time_zone`, editable nowhere).

## Roadmap

| Phase | Name | Repos | Depends on |
|---|---|---|---|
| 1 | Cleanup & foundations | HapsApp | — |
| 2 | Design system + map-first shell | HapsApp | 1 |
| 3 | Timeline editing | both | 2 |
| 4 | Purchases & financial | both | 2 |
| 5 | Bank linking (Plaid/Teller) | both | 4 |
| 6 | Gmail receipts + Settings | both | 2 |

Phases 3–6 each get their own spec when reached. Server work lands via PRs; mobile
work in a feature branch per phase.

---

## Phase 1 — Cleanup & foundations (mobile)

### Bug fixes

1. **Initialize Sentry.** Call `Sentry.init()` in `App.js` (DSN from config), wrap the
   root component per `@sentry/react-native` Expo guidance. Every existing
   `captureException`/`addBreadcrumb`/`setUser` call site becomes live.
2. **`contexts/AppStateContext.js:183`** — `HeartbeatService.start()` →
   `HeartbeatService.startHeartbeat()`.
3. **`components/TransactionsScreen.js:94`** — `APIService.getTransactions(...)` →
   `APIService.getTransactionsForDate(...)`.
4. **`components/MapTimelineScreen.js:271`** — reorder so the `AppState` effect is
   declared after `load`, removing the temporal-dead-zone hazard.

### Dead code removal

Delete: `App.js.backup`, `App.js.complex`, `App.test.js`, `App.minimal.js`,
`build-1782230691280.ipa`, the entire unused `repositories/` directory, unused hooks
(`hooks/useTimeline.js`, unused exports in `hooks/useAuthRequest.js`), and the
unrouted screens `components/MapViewScreen.js` and `components/TimelineListScreen.js`
(Phase 2 replaces both). Remove their exports from `components/index.js`.

### Disable on-device visit detection

`services/VisitTrackingService.js` (583 lines) runs clustering on every location with
no routed consumer; the server owns visit detection. Remove its initialization from
`LocationService` and delete the service plus its hook wiring. (Recoverable from git
history if on-device detection is ever revived.)

### Secrets

- Verify `.gitignore` covers `.env`; if the file was ever committed, note the
  affected tokens for rotation (SENTRY_AUTH_TOKEN, HERE_API_KEY, Discord webhook,
  Logtail tokens).
- Move build-time secrets to EAS secrets; keep only client-safe values
  (Sentry DSN, Logtail source tokens) in app config.
- Remove the unused `EXPO_PUBLIC_ERROR_WEBHOOK` reference from `.env`.

### Acceptance

- App builds and runs; tracking, sync, timeline unchanged.
- A thrown test error appears in Sentry.
- Repo contains no `.ipa`, no dead app entries, no unused data layer.

---

## Phase 2 — Design system + map-first shell (mobile)

### TypeScript adoption

- Add `tsconfig.json` with `allowJs: true`, `strict: true`; Babel/Metro already
  handle TS in Expo SDK 53.
- New and rebuilt files are `.ts`/`.tsx`. Untouched services stay `.js` and are
  migrated opportunistically when edited.
- Add typed API layer: `src/api/types.ts` describing the server contracts
  (timeline, visits, travels, track points, transactions, session), and a typed
  client wrapping the existing `APIService` fetch core.

### Design tokens & theming

- `src/theme/tokens.ts`: color palettes (light + dark), typography scale, spacing
  (4-pt grid), radii, elevation/shadows.
- Palette direction: Google-Maps-like neutral surfaces (white/near-black), a single
  brand accent (existing `#2563EB` blue family), semantic colors for
  success/warning/danger, and a fixed mode-color set for travel polylines
  (walk/cycle/drive/highway) that reads on both light and dark map tiles.
- `ThemeProvider` + `useTheme()` hook; components consume tokens, never hex
  literals. `app.json` `userInterfaceStyle` → `"automatic"`; map, navigation
  theme, and status bar follow the system scheme.
- Icons: `@expo/vector-icons` MaterialCommunityIcons everywhere; all emoji
  usage in UI removed (tab bar, buttons, badges, markers).
- Rebuild the shared primitives on tokens: `Card`, `Button`, `Badge`,
  `StatusIndicator`, `Screen`, plus new `Sheet`, `Pill`, `ListRow`, `Avatar`.

### Navigation shell

3 bottom tabs, each a native stack (react-navigation 7, already installed):

- **Timeline** (default): `TimelineMapScreen`
- **Spend**: fixed `TransactionsScreen` mounts here as a placeholder; fully
  rebuilt in Phase 4
- **You**: `YouScreen` → stack: `TrackingStatusScreen` (absorbs today's
  HomeScreen content), `DiagnosticsScreen` (admin-gated, absorbs Debug tab),
  `AboutScreen` (BuildInfo)

Tab bar: token-styled, Material icons, no headers (screens own their chrome).
The Debug tab disappears as a top-level tab.

### TimelineMapScreen (the centerpiece)

Layout:
- Full-screen `react-native-maps` MapView (Apple Maps provider unchanged — the
  Google-Maps feel comes from overlay design, not base tiles).
- Floating date pill top-center: `‹ Today, Aug 8 ›` with tap-to-open date picker;
  prev/next chevrons; snaps back to "Today" label when on current day.
- Floating controls: locate-me button; map legend toggle.
- `@gorhom/bottom-sheet` (new deps: `@gorhom/bottom-sheet`,
  `react-native-reanimated`, `react-native-gesture-handler`) with three snap
  points: peek (~12%, shows day stats strip), half (~45%, default), full.

Sheet content:
- Day stats strip: distance, visit count, travel time, total spend.
- Timeline list: visit cards (place name, time range, duration, spend chips for
  matched purchases) and travel rows (mode icon, duration, distance) joined by a
  timeline spine. Unmatched purchases grouped in a footer card.
- Tap a visit/travel → map animates to it, item highlights; tap a marker → sheet
  scrolls to the item. (Port of the existing selection sync, redesigned.)

Map overlays (rebuilt from `MapTimelineScreen`'s logic, restyled):
- Visit markers: circular badge markers (category icon once Phase 3+ provides
  place data; numbered dots until then), selected state enlarges.
- Visit radius circles only for the selected visit.
- Travel polylines: speed-segmented coloring retained, softened palette, rounded
  caps; dashed fallback when no track points.
- Purchase pins: small chip markers with amounts, fanned as today.
- GPS point dots only for the selected item.

Data flow: existing `TimelineService`/SQLite cache retained; screen state moves to
a `useTimelineDay(date)` hook (fetch + cache + refresh-on-foreground + midnight
rollover, ported from the current screen).

### Auth screens

Restyle `Login`/`Register` on the design system (tokens, typed forms, dark mode).
No flow changes.

### Out of scope for Phase 2

Visit editing (Phase 3), Spend rebuild (Phase 4), settings forms (Phase 6),
push notifications, OTA update UI.

### Acceptance

- All previous functionality reachable in the new shell; tracking untouched.
- Dark mode correct on every screen (system-driven).
- No emoji icons, no hex literals outside `tokens.ts`.
- Sheet interactions at 60 fps on device (reanimated worklets).

---

## Phases 3–6 (summaries; own specs later)

**3 — Timeline editing.** Server: `PATCH /api/timeline/visits/:id/location`
(select suggested location; records `UserLocationPreference`),
`POST .../geocode` and `force_geocode`, `POST /api/timeline/reprocess_day`;
logic extracted into services shared with the web controllers; request specs
(namespace currently has none). Mobile: visit detail sheet with "Wrong place?"
picker over `suggested_locations`, re-geocode action, day reprocess in a debug
menu.

**4 — Purchases & financial.** Server: `/api/purchases` (Ransack-backed search,
filters, Pagy pagination; show with receipt line items, match metadata, rematch/
unmatch), `/api/accounts` (+ `toggle_negate`), `/api/dashboard` (net-worth
series, category spend), `/api/categories`, `/api/merchants`. Mobile: Spend tab —
dashboard header (net-worth chart, category donut), searchable purchases list,
purchase detail (receipt, verify/rematch), accounts list/detail. Chart library
chosen in that spec.

**5 — Bank linking.** Server: link-token issuance + public-token exchange
endpoints reusing `CredentialsController`/Plaid service logic; Teller Connect
equivalent; relink flow for errored credentials. Mobile:
`react-native-plaid-link-sdk`, Teller Connect mobile flow, credentials management
screen under You.

**6 — Gmail receipts + Settings.** Server: Gmail OAuth for mobile (web flow +
deep-link callback), `/api/emails` list/detail, sync, correlate,
verify/reject association; `/api/user` profile endpoint (email, password,
time_zone, purchase_emails_enabled). Mobile: Settings screens under You
(profile, password, **time zone**, purchase-email toggle), email receipts list
with match verification.

## Cross-cutting conventions

- **API**: all new endpoints under the existing `/api` namespace +
  `Api::BaseController` bearer auth; shared service objects so web controllers and
  API stay behaviorally identical; consistent error shape
  `{error: {code, message}}`; every new endpoint gets an RSpec request spec.
- **Mobile errors**: keep typed `APIError`; user-visible failures surface as
  inline banners/toasts on the design system, never bare `Alert.alert`.
- **Testing**: Jest for new mobile services/hooks where practical; UI verified on
  dev builds; server via RSpec. iOS builds ship via EAS cloud (iOS 26 SDK
  requirement).
- **Git**: haps-server via PRs; HapsApp per-phase feature branches.
