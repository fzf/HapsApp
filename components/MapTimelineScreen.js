/**
 * MapTimelineScreen — unified map + timeline
 *
 * Map (top half) and scrollable timeline list (bottom half) share a single
 * data fetch. Tapping a list item pans/zooms the map to it.
 * Travel polylines use real GPS track points; segments are colored by speed
 * when speed data is available.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  SafeAreaView, ScrollView, FlatList, Animated, PanResponder, AppState,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../AuthContext';
import TimelineService from '../services/TimelineService';
import LoggingService from '../services/LoggingService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fmt(isoString, timezone) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
    });
  } catch (_) {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}

function fmtDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDistance(meters) {
  if (!meters) return '';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1609.34).toFixed(1)}mi`;
}

// Speed buckets → color (m/s)
// walking <2  cycling <8  driving <33  highway 33+
function speedColor(mps) {
  if (mps == null || mps < 0) return '#6B7280'; // unknown — grey
  if (mps < 2)   return '#10B981'; // walking — green
  if (mps < 8)   return '#3B82F6'; // cycling — blue
  if (mps < 33)  return '#F59E0B'; // driving — amber
  return '#EF4444';                // highway — red
}

// Split a track into colored segments where consecutive points share a speed bucket
function buildColoredSegments(points) {
  if (!points || points.length < 2) return [];
  const segments = [];
  let start = 0;
  for (let i = 1; i <= points.length; i++) {
    const prevColor = speedColor(points[i - 1]?.speed);
    const curColor = i < points.length ? speedColor(points[i]?.speed) : null;
    if (curColor !== prevColor || i === points.length) {
      if (i - start >= 2) {
        segments.push({
          coords: points.slice(start, i).map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
          color: prevColor,
        });
      }
      start = i - 1; // overlap by one point so segments connect
    }
  }
  return segments;
}

const VISIT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
const visitColor = (i) => VISIT_COLORS[i % VISIT_COLORS.length];

// ─── Day Selector ─────────────────────────────────────────────────────────────

const DaySelector = ({ date, onPrev, onNext }) => {
  const isToday = toLocalDateString(date) === toLocalDateString(new Date());
  const label = isToday
    ? 'Today'
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={styles.daySelector}>
      <TouchableOpacity onPress={onPrev} style={styles.dayArrow} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
        <Text style={styles.dayArrowText}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.dayLabel}>{label}</Text>
      <TouchableOpacity onPress={onNext} style={styles.dayArrow} disabled={isToday}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
        <Text style={[styles.dayArrowText, isToday && styles.dayArrowDisabled]}>›</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Timeline Item ────────────────────────────────────────────────────────────

const TimelineItem = ({ item, index, timezone, isSelected, onPress, visitIndex, locationPoints }) => {
  const isVisit = item.type === 'visit';
  const color = isVisit ? visitColor(visitIndex ?? 0) : '#6B7280';
  const hasTrack = !isVisit && item.track_points && item.track_points.length > 1;
  const visitGpsCount = isVisit && isSelected && locationPoints
    ? locationPoints.filter(p => p.timeline_id === item.id).length
    : 0;

  return (
    <TouchableOpacity
      style={[styles.timelineItem, isSelected && styles.timelineItemSelected]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      {/* Timeline spine */}
      <View style={styles.spineCol}>
        <View style={[styles.spineDot, { backgroundColor: color }]} />
        {index >= 0 && <View style={[styles.spineLine, { backgroundColor: '#E5E7EB' }]} />}
      </View>

      <View style={[styles.itemBody, isSelected && { borderColor: color }]}>
        {isVisit ? (
          <>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.location?.name || 'Unknown place'}
            </Text>
            {item.location?.address ? (
              <Text style={styles.itemSub} numberOfLines={1}>{item.location.address}</Text>
            ) : null}
            <Text style={styles.itemMeta}>
              {fmt(item.start_time, timezone)}
              {item.end_time ? ` – ${fmt(item.end_time, timezone)}` : ' – now'}
              {item.duration ? `  ·  ${fmtDuration(item.duration)}` : ''}
            </Text>
            {item.purchase_count > 0 ? (
              <Text style={styles.itemBadge}>💳 {item.purchase_count} purchase{item.purchase_count !== 1 ? 's' : ''}</Text>
            ) : null}
            {visitGpsCount > 0 ? (
              <Text style={styles.itemBadge}>📍 {visitGpsCount} GPS point{visitGpsCount !== 1 ? 's' : ''}</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.itemName}>
              {hasTrack ? '🗺️ Travel' : '✈️ Travel'}
              {item.distance ? `  ·  ${fmtDistance(item.distance)}` : ''}
            </Text>
            <Text style={styles.itemMeta}>
              {fmt(item.start_time, timezone)}
              {item.end_time ? ` – ${fmt(item.end_time, timezone)}` : ''}
              {item.duration ? `  ·  ${fmtDuration(item.duration)}` : ''}
            </Text>
            {hasTrack ? (
              <Text style={styles.itemBadge}>📍 {item.track_points.length} GPS points</Text>
            ) : (
              <Text style={[styles.itemBadge, { color: '#D1D5DB' }]}>No GPS track</Text>
            )}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ─── Speed Legend ─────────────────────────────────────────────────────────────

const SpeedLegend = () => (
  <View style={styles.legend}>
    {[
      { color: '#10B981', label: 'Walking' },
      { color: '#3B82F6', label: 'Cycling' },
      { color: '#F59E0B', label: 'Driving' },
      { color: '#EF4444', label: 'Highway' },
      { color: '#6B7280', label: 'Unknown' },
    ].map((e) => (
      <View key={e.label} style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: e.color }]} />
        <Text style={styles.legendLabel}>{e.label}</Text>
      </View>
    ))}
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

const SPLIT = 0.45; // default map fraction of screen height

export default function MapTimelineScreen() {
  const { token } = useAuth();
  const mapRef = useRef(null);
  const listRef = useRef(null);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [timeline, setTimeline] = useState(null);
  const [locationPoints, setLocationPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null); // "visit-123" or "travel-456"
  const [mapReady, setMapReady] = useState(false);
  const [hasTrackData, setHasTrackData] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // Device location for initial map region (fallback only)
  const [deviceRegion, setDeviceRegion] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setDeviceRegion({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          });
        }
      } catch (_) {}
    })();
  }, []);

  // Track what date was "today" when the screen last loaded
  const lastLoadedDate = useRef(toLocalDateString(new Date()));

  // Refresh when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const todayStr = toLocalDateString(new Date());
        // If the user was viewing today and the date has rolled over midnight, snap to new today
        if (lastLoadedDate.current !== todayStr) {
          setSelectedDate(new Date()); // triggers the load useEffect below
        } else {
          // Same day — just reload to pick up new timeline data
          load(selectedDate);
        }
        lastLoadedDate.current = todayStr;
      }
    });
    return () => sub.remove();
  }, [load, selectedDate]);

  const load = useCallback(async (date) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    setLocationPoints([]);
    try {
      const dateString = toLocalDateString(date);
      const [data, pointsData] = await Promise.all([
        TimelineService.getTimelineForDate(date, token),
        APIService.getLocationPointsForDate(dateString).catch(() => null),
      ]);
      setLocationPoints(pointsData?.location_points || []);
      setTimeline(data);
      const travels = data.travels || [];
      const anyTrack = travels.some(
        (t) => t.track_points && t.track_points.length > 1
      );
      setHasTrackData(anyTrack);
      LoggingService.info('map.load.result', {
        date: toLocalDateString(date),
        visits: (data.visits || []).length,
        travels: travels.length,
        from_cache: data.fromCache ?? false,
        travel_ids: travels.map(t => t.id),
        travel_types: travels.map(t => t.type),
        travel_has_track: travels.map(t => !!(t.track_points && t.track_points.length > 1)),
        travel_durations: travels.map(t => t.duration),
        has_timeline_key: !!data.timeline,
      });
      // Fit map
      const bounds = TimelineService.getTimelineBounds(data);
      if (bounds && mapReady) {
        mapRef.current?.animateToRegion(bounds, 600);
      } else if (bounds) {
        setDeviceRegion(bounds);
      }
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [token, mapReady]);

  useEffect(() => { load(selectedDate); }, [selectedDate, token]);

  const prevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };
  const nextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    if (d <= new Date()) setSelectedDate(d);
  };

  const tz = timeline?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const visits = timeline?.visits || [];
  const travels = timeline?.travels || [];

  // Merged + sorted timeline items for the list
  const items = [...visits.map((v) => ({ ...v, type: 'visit' })),
                 ...travels.map((t) => ({ ...t, type: 'travel' }))]
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  // Visit index lookup (for consistent colors between map and list)
  const visitIndexMap = {};
  visits.forEach((v, i) => { visitIndexMap[v.id] = i; });

  const selectItem = (item) => {
    const id = `${item.type}-${item.id}`;
    setSelectedId(id);

    // Pan map to item
    let region = null;
    if (item.type === 'visit' && item.center_latitude) {
      region = {
        latitude: item.center_latitude,
        longitude: item.center_longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      };
    } else if (item.type === 'travel') {
      const pts = item.track_points && item.track_points.length > 1
        ? item.track_points
        : null;
      if (pts) {
        const lats = pts.map((p) => p.latitude);
        const lngs = pts.map((p) => p.longitude);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        region = {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
          longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.01),
        };
      } else if (item.center_latitude) {
        region = { latitude: item.center_latitude, longitude: item.center_longitude,
          latitudeDelta: 0.05, longitudeDelta: 0.05 };
      }
    }
    if (region) mapRef.current?.animateToRegion(region, 500);

    // Scroll list to item
    const idx = items.findIndex((i) => i.type === item.type && i.id === item.id);
    if (idx >= 0) {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
    }
  };

  const renderMapContent = () => {
    if (!timeline) return null;
    return (
      <>
        {/* Visit circles + markers */}
        {visits.map((visit, i) => {
          if (!visit.center_latitude) return null;
          const coord = { latitude: visit.center_latitude, longitude: visit.center_longitude };
          const color = visitColor(i);
          const isSelected = selectedId === `visit-${visit.id}`;
          return (
            <React.Fragment key={`v-${visit.id}`}>
              <Circle
                center={coord}
                radius={visit.radius || 80}
                fillColor={color + (isSelected ? '44' : '1A')}
                strokeColor={color + (isSelected ? 'CC' : '66')}
                strokeWidth={isSelected ? 3 : 1.5}
              />
              <Marker
                coordinate={coord}
                pinColor={color}
                title={visit.location?.name || `Visit ${i + 1}`}
                description={fmt(visit.start_time, tz) + (visit.end_time ? ` – ${fmt(visit.end_time, tz)}` : '')}
                onPress={() => selectItem({ ...visit, type: 'visit' })}
              />
              {/* GPS points for this visit when selected */}
              {isSelected && locationPoints
                .filter(p => p.timeline_id === visit.id && p.latitude && p.longitude)
                .map(p => (
                  <Circle
                    key={`gps-${p.id}`}
                    center={{ latitude: p.latitude, longitude: p.longitude }}
                    radius={4}
                    fillColor={color + 'CC'}
                    strokeColor={color}
                    strokeWidth={1}
                  />
                ))
              }
            </React.Fragment>
          );
        })}

        {/* Travel polylines */}
        {travels.map((travel, i) => {
          const pts = travel.track_points && travel.track_points.length > 1
            ? travel.track_points
            : null;

          if (pts) {
            // Check if we have any speed data
            const hasSpeed = pts.some((p) => p.speed != null && p.speed >= 0);
            if (hasSpeed) {
              // Colored segments by speed
              const segments = buildColoredSegments(pts);
              return segments.map((seg, si) => (
                <Polyline
                  key={`tr-${travel.id}-seg-${si}`}
                  coordinates={seg.coords}
                  strokeColor={seg.color}
                  strokeWidth={selectedId === `travel-${travel.id}` ? 5 : 3}
                  tappable={true}
                  onPress={() => selectItem({ ...travel, type: 'travel' })}
                />
              ));
            } else {
              // Solid line, no speed data
              return (
                <Polyline
                  key={`tr-${travel.id}`}
                  coordinates={pts.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))}
                  strokeColor="#6B7280"
                  strokeWidth={selectedId === `travel-${travel.id}` ? 5 : 3}
                  tappable={true}
                  onPress={() => selectItem({ ...travel, type: 'travel' })}
                />
              );
            }
          } else {
            // No track — dashed straight line between flanking visits
            const startVisit = visits[i];
            const endVisit = visits[i + 1];
            if (!startVisit?.center_latitude || !endVisit?.center_latitude) return null;
            return (
              <Polyline
                key={`tr-${travel.id}-straight`}
                coordinates={[
                  { latitude: startVisit.center_latitude, longitude: startVisit.center_longitude },
                  { latitude: endVisit.center_latitude, longitude: endVisit.center_longitude },
                ]}
                strokeColor="#D1D5DB"
                strokeWidth={2}
                lineDashPattern={[6, 4]}
                tappable={true}
                onPress={() => selectItem({ ...travel, type: 'travel' })}
              />
            );
          }
        })}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <DaySelector date={selectedDate} onPrev={prevDay} onNext={nextDay} />

      {/* MAP */}
      <View style={styles.mapSection}>
        <MapView
          ref={mapRef}
          style={styles.map}
          region={deviceRegion || undefined}
          showsUserLocation={true}
          showsCompass={true}
          onMapReady={() => setMapReady(true)}
        >
          {renderMapContent()}
        </MapView>

        {loading ? (
          <View style={styles.mapLoadingOverlay}>
            <ActivityIndicator color="#3b82f6" size="small" />
          </View>
        ) : null}

        {error && !loading ? (
          <View style={styles.mapErrorBanner}>
            <Text style={styles.mapErrorText}>{error}</Text>
            <TouchableOpacity onPress={() => load(selectedDate)} style={styles.mapRetryBtn}>
              <Text style={styles.mapRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Speed legend toggle */}
        {hasTrackData ? (
          <TouchableOpacity style={styles.legendToggle} onPress={() => setShowLegend((v) => !v)}>
            <Text style={styles.legendToggleText}>🎨</Text>
          </TouchableOpacity>
        ) : null}
        {showLegend ? <SpeedLegend /> : null}
      </View>

      {/* TIMELINE LIST */}
      <View style={styles.listSection}>
        {/* Stats bar */}
        {timeline && !loading ? (
          <View style={styles.statsBar}>
            <Text style={styles.statChip}>📍 {visits.length} visit{visits.length !== 1 ? 's' : ''}</Text>
            <Text style={styles.statChip}>🚗 {travels.length} travel{travels.length !== 1 ? 's' : ''}</Text>
            {travels.some((t) => t.distance) ? (
              <Text style={styles.statChip}>
                📏 {fmtDistance(travels.reduce((s, t) => s + (t.distance || 0), 0))}
              </Text>
            ) : null}
          </View>
        ) : null}

        {loading && !timeline ? (
          <View style={styles.listLoading}>
            <ActivityIndicator color="#3b82f6" />
            <Text style={styles.listLoadingText}>Loading timeline…</Text>
          </View>
        ) : items.length === 0 && !loading ? (
          <View style={styles.listEmpty}>
            <Text style={styles.listEmptyText}>No timeline data for this day</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            renderItem={({ item, index }) => (
              <TimelineItem
                item={item}
                index={index}
                timezone={tz}
                isSelected={selectedId === `${item.type}-${item.id}`}
                onPress={selectItem}
                visitIndex={item.type === 'visit' ? visitIndexMap[item.id] : null}
                locationPoints={locationPoints}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onScrollToIndexFailed={() => {}}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  daySelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  dayArrow: { paddingHorizontal: 10, paddingVertical: 4 },
  dayArrowText: { fontSize: 28, color: '#3B82F6', lineHeight: 34 },
  dayArrowDisabled: { color: '#D1D5DB' },
  dayLabel: { fontSize: 17, fontWeight: '600', color: '#111827' },

  mapSection: { flex: 5, position: 'relative' },
  map: { flex: 1 },
  mapLoadingOverlay: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 16, padding: 6,
  },
  mapErrorBanner: {
    position: 'absolute', bottom: 8, left: 12, right: 12,
    backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#FCA5A5',
  },
  mapErrorText: { flex: 1, color: '#DC2626', fontSize: 12 },
  mapRetryBtn: { marginLeft: 8, backgroundColor: '#DC2626', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5 },
  mapRetryText: { color: '#FFF', fontWeight: '600', fontSize: 12 },

  legendToggle: {
    position: 'absolute', top: 10, left: 10,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 18,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
  },
  legendToggleText: { fontSize: 18 },
  legend: {
    position: 'absolute', top: 52, left: 10,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 7 },
  legendLabel: { fontSize: 12, color: '#374151' },

  listSection: { flex: 4, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  statsBar: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8,
    gap: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  statChip: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  listContent: { paddingBottom: 20 },
  listLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  listLoadingText: { marginTop: 8, color: '#9CA3AF', fontSize: 14 },
  listEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  listEmptyText: { color: '#9CA3AF', fontSize: 15 },

  // Timeline item
  timelineItem: {
    flexDirection: 'row', paddingLeft: 12, paddingRight: 14,
    paddingTop: 10, paddingBottom: 4,
  },
  timelineItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  spineCol: { width: 28, alignItems: 'center', paddingTop: 2 },
  spineDot: { width: 10, height: 10, borderRadius: 5 },
  spineLine: { flex: 1, width: 2, marginTop: 4, marginBottom: -4 },
  itemBody: {
    flex: 1, paddingBottom: 10, paddingLeft: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
    borderLeftWidth: 0,
  },
  itemName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  itemSub: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  itemMeta: { fontSize: 12, color: '#9CA3AF' },
  itemBadge: { fontSize: 11, color: '#6B7280', marginTop: 3 },
});
