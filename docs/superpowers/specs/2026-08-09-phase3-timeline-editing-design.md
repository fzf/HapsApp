# Phase 3: Timeline Editing — Design

**Date:** 2026-08-09
**Status:** Approved
**Parent:** `2026-08-08-mobile-parity-redesign-design.md` (Phase 3)
**Repos:** haps-server (API, via PR) + HapsApp (UI, branch `redesign/phase-3-timeline-editing` on top of `redesign/phase-2-shell`)

## Goal

Let the mobile app correct visit locations (with preference learning), re-geocode
visits, and reprocess a day — the web-only timeline-editing features — via new
token-authenticated API endpoints and a visit-detail screen.

## Server design (haps-server)

### New endpoints (all in `Api::TimelineController`, bearer auth, no CSRF)

Every lookup is scoped `Timeline::Visit.where(user: current_user).find(...)`
(the existing `show_visit` pattern — deliberately stricter than the web
controller's find-then-compare). Namespace error convention:
`{ error: "<message>" }` + status.

**`PATCH /api/timeline/visits/:id/location`** — body `{ "location_id": <int> }`
- The location must be one of the visit's `suggested_locations`;
  `find_by(id:)` miss → 422 `{"error":"Location is not a suggestion for this visit"}`.
  (Stricter than web, which accepts any Location id in the DB.)
- Missing `location_id` → 422; unknown visit → 404 `{"error":"Visit not found"}`.
- Effects (mirrors web `TimelineController#update_visit_location:161-188`):
  `visit.update!(location:, location_source: 'manual', location_confidence_score: 1.0)`
  then `UserLocationPreference.record_selection(user:, location:, latitude: visit.center_latitude, longitude: visit.center_longitude)`.
- Returns 200 with the **enriched `serialize_visit`** (below).

**`POST /api/timeline/visits/:id/geocode`** — no body
- Synchronous, mirrors web: calls `visit.geocode_now!`. Existing semantics kept:
  no-op success when the visit is already geocoded.
- 200 → `{ "message": <string>, "visit": <serialize_visit> }` (visit reloaded).
- Geocode failure → 422 `{ "error": <string> }`.
- `ApiCallTrackerService::RateLimitExceeded` → 429 `{ "error": "Geocoding rate limit exceeded" }`.

**`POST /api/timeline/visits/:id/force_geocode`** — no body
- Clears the Overpass request cache, then `VisitGeocodingService.new(visit).force_refresh_geocoding!`,
  reload; same response contract as geocode (200/422/429).
- **Shared extraction:** the web controller's `clear_geocoding_caches` moves into
  `VisitGeocodingService#clear_request_caches!`; both web and API call it
  (web controller refactored, behavior identical).

**`POST /api/timeline/reprocess_day`** — body `{ "date": "YYYY-MM-DD", "mode": "unassigned" | "full" }`
- `mode` defaults to `"unassigned"`; invalid mode or unparseable date → 422.
- Timezone: `current_user.time_zone.presence || 'UTC'` (web behavior).
- **Shared extraction:** new `TimelineReprocessingService` with
  `.reprocess_unassigned(user:, date:, timezone:)` and
  `.reprocess_full_day(user:, date:, timezone:)`, containing the logic currently
  inlined in `TimelineController#reprocess_unassigned:250-287` /
  `#reprocess_all_day:289-322` (day-range computation, empty-set short-circuit,
  `RealtimeTimelineBuilder` / `LinearTimelineProcessor.reprocess_date_range`
  calls). Web controller refactored to call the service; redirects/notices
  unchanged.
- 200 → `{ "message": <string>, "processed_count": <int>, "visits_count": <int|null>, "travels_count": <int|null> }`
  (counts null for the empty/no-op case). Runs synchronously — same as web;
  acceptable for this app's scale, documented as such.

### Serializer enrichment (`serialize_visit`, used by index + show_visit + new endpoints)

- Visit gains: `"location_source"`, `"location_confidence_score"`.
- `location` object gains `"city"`, `"state"`.
- `suggested_locations` becomes **rank-ordered** and per-item enriched:
  built from `visit.visit_suggested_locations.includes(:location).order(:rank)`,
  each item `{ id, name, address, city, state, latitude, longitude, rank, providers: [<provider_name>, ...] }`
  (`providers` from `location.provider_names`).
- Additive only — no fields removed; `GET /api/timeline` (index) inherits the
  enrichment.

### Behavior change: protect manual selections from force-refresh

`VisitGeocodingService#persist_geocoding_result` currently preserves
`visit.location` only when `location_source == 'purchase_match'`
(`visit_geocoding_service.rb:161-179`); a user's `'manual'` pick is clobbered.
Change the guard to `%w[purchase_match manual].include?(visit.location_source)`.
Suggestions still refresh; the primary location and source stay manual.
Affects web + API identically (intended). Service specs gain cases.

### Testing (server)

RSpec request specs — the first under `spec/requests/api/` — covering every new
endpoint: 401 without/with bad token (auth via
`headers: { 'Authorization' => "Bearer #{user.authentication_token}" }`),
404 for other users' visits, 422 validation paths, success shapes (exact JSON),
`UserLocationPreference` side effect (count + increment on reselect), 429 mapping
(raise `RateLimitExceeded` from a stub). Heavy paths mocked:
`geocode_now!`/`force_refresh_geocoding!`/`RealtimeTimelineBuilder`/
`LinearTimelineProcessor` stubbed per existing `timeline_spec.rb` style.
`TimelineReprocessingService` gets its own service spec (real logic, processor
calls stubbed). Serializer enrichment covered via `show_visit` expectations.
Existing web request specs must stay green (refactor is behavior-preserving).

## Mobile design (HapsApp)

### Navigation

Timeline tab becomes a native stack (`TimelineStack`): `TimelineMap`
(headerShown false, existing screen) → `VisitDetail` (themed header, title =
place name or "Visit").

### Entry point

The selected visit's row in the bottom sheet gains a chevron-right accessory;
tapping the row when it is **already selected** (or tapping the chevron) pushes
`VisitDetail` with the visit id. Travels unchanged.

### VisitDetailScreen

- Data: `useVisitDetail(visitId)` hook — fetches `GET /api/timeline/visits/:id`
  on mount; exposes `{ visit, loading, error, selectLocation(id), refreshGeocode(force) , busy }`.
- Layout (all tokens/design system): place header (name, address, city/state),
  source badge (`manual` → "Set by you", `purchase_match` → "From purchase",
  else "Auto-detected" + confidence %), time range + duration, matched purchases
  (passed via route params from the day data).
- **"Wrong place?" section:** ranked `suggested_locations` as selectable rows
  (name, address, provider caption; current location checked). Tap →
  `PATCH .../location`, optimistic UI, on success replace local visit with
  response. Errors → inline banner.
- **Refresh action:** "Refresh place info" button → `POST .../geocode`; for
  admin users a long-press offers "Force full refresh" (confirm dialog) →
  `force_geocode`. Spinner while busy; 429 shows "Rate limited — try later".
- On navigating back after any successful mutation, the map screen refreshes:
  `TimelineMapScreen` reloads the day on navigation focus when a change was
  flagged (simple param/ref flag — no global state).

### Diagnostics addition

`HeartbeatDebugScreen` (admin) gains a "Timeline" section with two actions:
"Reprocess unassigned (today)" and "Rebuild today" (destructive — confirm
dialog), calling `POST /api/timeline/reprocess_day`. Minimal styling edits to
that legacy screen are acceptable.

### Client & types

- `services/APIService.js` gains: `getVisit(id)`, `updateVisitLocation(id, locationId)`,
  `geocodeVisit(id, { force })`, `reprocessDay(dateString, mode)`.
- `src/api/types.ts`: `TimelineVisit` gains `location_source?`,
  `location_confidence_score?`; new `SuggestedLocation` type
  (`id,name,address,city?,state?,latitude,longitude,rank,providers`);
  `TimelineLocation` gains `city?/state?`. Optional fields so older servers
  don't break the client.

### Testing (mobile)

Jest: `useVisitDetail` hook (mocked APIService — fetch, optimistic select,
error path), APIService method-existence regression extension. tsc + full suite
+ bundle check green. Device verification (human): picker E2E against local
server.

## Acceptance

- All new endpoints pass request specs; web timeline pages behave identically
  (manual-protection change aside); haps-server PR opened, not merged by me.
- Mobile: selecting a suggestion updates the visit everywhere (detail, sheet,
  map pin title) and survives force-refresh; reprocess actions work from
  Diagnostics; suite + tsc + bundle green.

## Out of scope

Place search beyond existing suggestions (`Visit#search_places` exists server-side
— future phase), async job-based geocoding, offline queueing of edits.
