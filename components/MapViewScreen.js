/**
 * MapViewScreen — server timeline map
 *
 * Shows visits and travel paths from the server timeline for a given day.
 * All times are displayed in the timeline's timezone.
 * Local visit detection is intentionally excluded (future: port to mobile).
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  SafeAreaView, ScrollView,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../AuthContext';
import TimelineService from '../services/TimelineService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(isoString, timezone) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
    });
  } catch (_) {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
      <TouchableOpacity onPress={onPrev} style={styles.dayArrow}>
        <Text style={styles.dayArrowText}>&#8249;</Text>
      </TouchableOpacity>
      <Text style={styles.dayLabel}>{label}</Text>
      <TouchableOpacity onPress={onNext} style={styles.dayArrow} disabled={isToday}>
        <Text style={[styles.dayArrowText, isToday && styles.dayArrowDisabled]}>&#8250;</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Selected Item Detail Panel ───────────────────────────────────────────────

const DetailPanel = ({ item, timezone, onClose }) => {
  if (!item) return null;
  const isVisit = item.type === 'visit';
  return (
    <View style={styles.detailPanel}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailType}>{isVisit ? '📍 Visit' : '🚗 Travel'}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
      {isVisit && item.location?.name ? (
        <Text style={styles.detailTitle}>{item.location.name}</Text>
      ) : null}
      {isVisit && item.location?.address ? (
        <Text style={styles.detailSubtitle}>{item.location.address}</Text>
      ) : null}
      <Text style={styles.detailTime}>
        {formatTime(item.start_time, timezone)}
        {item.end_time ? ` – ${formatTime(item.end_time, timezone)}` : ' – now'}
        {item.duration ? `  (${formatDuration(item.duration)})` : ''}
      </Text>
      {isVisit && item.purchase_count > 0 ? (
        <Text style={styles.detailMeta}>💳 {item.purchase_count} transaction{item.purchase_count !== 1 ? 's' : ''}</Text>
      ) : null}
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

const MapViewScreen = () => {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [mapRegion, setMapRegion] = useState(null); // null = use device location
  const [selectedItem, setSelectedItem] = useState(null);
  const { token } = useAuth();

  // Get device location once for map default
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!mapRegion) {
            setMapRegion({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            });
          }
        }
      } catch (_) {}
    })();
  }, []);

  useEffect(() => {
    loadTimeline();
  }, [selectedDate, token]);

  const loadTimeline = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSelectedItem(null);
    try {
      const data = await TimelineService.getTimelineForDate(selectedDate, token);
      setTimeline(data);
      // Fit map to timeline points
      const bounds = TimelineService.getTimelineBounds(data);
      if (bounds) setMapRegion(bounds);
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  const tz = timeline?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

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

  const visits = timeline?.visits || [];
  const travels = timeline?.travels || [];

  return (
    <SafeAreaView style={styles.container}>
      <DaySelector date={selectedDate} onPrev={prevDay} onNext={nextDay} />

      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          region={mapRegion || undefined}
          showsUserLocation={true}
          followsUserLocation={!mapRegion}
          showsCompass={true}
        >
          {/* Visit circles + markers */}
          {visits.map((visit, i) => {
            if (!visit.center_latitude || !visit.center_longitude) return null;
            const coord = { latitude: visit.center_latitude, longitude: visit.center_longitude };
            const color = visitColor(i);
            return (
              <React.Fragment key={'visit-' + visit.id}>
                <Circle
                  center={coord}
                  radius={visit.radius || 100}
                  fillColor={color + '22'}
                  strokeColor={color + '88'}
                  strokeWidth={2}
                />
                <Marker
                  coordinate={coord}
                  pinColor={color}
                  title={visit.location?.name || 'Visit ' + (i + 1)}
                  description={formatTime(visit.start_time, tz) + ' – ' + (visit.end_time ? formatTime(visit.end_time, tz) : 'now')}
                  onPress={() => setSelectedItem({ ...visit, type: 'visit' })}
                />
              </React.Fragment>
            );
          })}

          {/* Travel paths using GPS track if available, else straight line */}
          {travels.map((travel, i) => {
            const points = travel.location_points && travel.location_points.length > 1
              ? travel.location_points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))
              : (() => {
                  const startVisit = visits[i];
                  const endVisit = visits[i + 1];
                  if (!startVisit || !endVisit) return null;
                  if (!startVisit.center_latitude || !endVisit.center_latitude) return null;
                  return [
                    { latitude: startVisit.center_latitude, longitude: startVisit.center_longitude },
                    { latitude: endVisit.center_latitude, longitude: endVisit.center_longitude },
                  ];
                })();
            if (!points) return null;
            return (
              <Polyline
                key={'travel-' + (travel.id || i)}
                coordinates={points}
                strokeColor="#6B7280"
                strokeWidth={3}
                lineDashPattern={[5, 5]}
                tappable={true}
                onPress={() => setSelectedItem({ ...travel, type: 'travel' })}
              />
            );
          })}
        </MapView>

        {/* Loading overlay */}
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : null}

        {/* Error banner */}
        {error && !loading ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadTimeline} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Empty state */}
        {!loading && !error && visits.length === 0 && travels.length === 0 ? (
          <View style={styles.emptyOverlay}>
            <Text style={styles.emptyText}>No timeline data for this day</Text>
          </View>
        ) : null}
      </View>

      {/* Selected item detail */}
      <DetailPanel item={selectedItem} timezone={tz} onClose={() => setSelectedItem(null)} />

      {/* Visit list at bottom */}
      {visits.length > 0 && !selectedItem ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.visitStrip}
          contentContainerStyle={styles.visitStripContent}>
          {visits.map((visit, i) => (
            <TouchableOpacity
              key={'chip-' + visit.id}
              style={[styles.visitChip, { borderColor: visitColor(i) }]}
              onPress={() => setSelectedItem({ ...visit, type: 'visit' })}
            >
              <Text style={[styles.visitChipTime, { color: visitColor(i) }]}>
                {formatTime(visit.start_time, tz)}
              </Text>
              <Text style={styles.visitChipName} numberOfLines={1}>
                {visit.location?.name || 'Visit ' + (i + 1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  daySelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  dayArrow: { paddingHorizontal: 12, paddingVertical: 4 },
  dayArrowText: { fontSize: 28, color: '#3b82f6', lineHeight: 34 },
  dayArrowDisabled: { color: '#d1d5db' },
  dayLabel: { fontSize: 17, fontWeight: '600', color: '#111827' },
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  errorBanner: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: '#fef2f2', borderRadius: 10, padding: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#fca5a5',
  },
  errorText: { flex: 1, color: '#dc2626', fontSize: 13 },
  retryBtn: { marginLeft: 8, backgroundColor: '#dc2626', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  emptyOverlay: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: 12, alignItems: 'center',
  },
  emptyText: { color: '#fff', fontSize: 14 },
  detailPanel: {
    backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  detailType: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 16, color: '#9ca3af' },
  detailTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 2 },
  detailSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  detailTime: { fontSize: 14, color: '#374151' },
  detailMeta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  visitStrip: { maxHeight: 72, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  visitStripContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  visitChip: {
    borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#ffffff', minWidth: 100,
  },
  visitChipTime: { fontSize: 11, fontWeight: '700' },
  visitChipName: { fontSize: 12, color: '#374151', marginTop: 1 },
});

export default MapViewScreen;
