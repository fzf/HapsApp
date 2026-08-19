import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Circle, Marker, Polyline } from 'react-native-maps';
import { useTheme } from '../../theme';
import { modeColors } from '../../theme/tokens';
import { Icon } from '../../ui';
import { LocationPoint, Purchase, TimelineDay, TimelineItem, TimelineVisit } from '../../api/types';
import { fmtAmount, fmtTime } from './format';
import { travelCoords } from './mapGeometry';

export function MapOverlays({ day, selectedId, locationPoints, purchases, onSelect }: {
  day: TimelineDay; selectedId: string | null; locationPoints: LocationPoint[];
  purchases: Purchase[]; onSelect: (item: TimelineItem) => void;
}) {
  const { colors } = useTheme();
  const visits = day.visits;
  const travels = day.travels;
  const tz = day.timezone;

  // Build a map of visit_id → visit for purchase coordinate lookup
  const visitById = useMemo(() => {
    const map: Record<number, TimelineVisit> = {};
    visits.forEach((v) => { map[v.id] = v; });
    return map;
  }, [visits]);

  // Group purchases by visit_id for map rendering
  const purchasesByVisit = useMemo(() => {
    const map: Record<number, Purchase[]> = {};
    purchases.forEach((p) => {
      const vid = p.matched_visit?.visit_id;
      if (vid) {
        if (!map[vid]) map[vid] = [];
        map[vid].push(p);
      }
    });
    return map;
  }, [purchases]);

  return (
    <>
      {/* Visit circles + markers */}
      {visits.map((visit, i) => {
        if (!visit.center_latitude || !visit.center_longitude) return null;
        const coord = { latitude: visit.center_latitude, longitude: visit.center_longitude };
        const isSelected = selectedId === `visit-${visit.id}`;
        const visitPurchases = purchasesByVisit[visit.id] || [];
        return (
          <React.Fragment key={`v-${visit.id}`}>
            <Circle
              center={coord}
              radius={visit.radius || 80}
              fillColor={colors.primary + (isSelected ? '44' : '1A')}
              strokeColor={colors.primary + (isSelected ? 'CC' : '66')}
              strokeWidth={isSelected ? 3 : 1.5}
            />
            <Marker
              coordinate={coord}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              title={visit.location?.name || `Visit ${i + 1}`}
              description={fmtTime(visit.start_time, tz) + (visit.end_time ? ` – ${fmtTime(visit.end_time, tz)}` : '')}
              onPress={() => onSelect({ ...visit })}
            >
              <View style={{
                width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isSelected ? colors.visitPinSelected : colors.visitPin,
              }}>
                <Icon name="map-marker" size={16} color={colors.onPrimary} />
              </View>
            </Marker>
            {/* Purchase markers at visit location */}
            {visitPurchases.map((p, pi) => {
              // Slightly offset each purchase marker so stacked ones are visible
              const offset = visitPurchases.length > 1
                ? { latitude: coord.latitude + (pi - (visitPurchases.length - 1) / 2) * 0.0001,
                    longitude: coord.longitude + 0.0002 }
                : { latitude: coord.latitude, longitude: coord.longitude + 0.0002 };
              return (
                <Marker
                  key={`purch-${p.id}`}
                  coordinate={offset}
                  title={p.merchant || p.name}
                  description={fmtAmount(p.amount)}
                  anchor={{ x: 0.5, y: 1 }}
                  tracksViewChanges={false}
                >
                  <View style={{
                    backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
                    alignItems: 'center', borderWidth: 1.5, borderColor: colors.success,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.2, shadowRadius: 2, elevation: 3,
                  }}>
                    <Icon name="credit-card-outline" size={12} color={colors.success} />
                    <Text style={{ fontSize: 10, color: colors.success, fontWeight: '700' }}>{fmtAmount(p.amount)}</Text>
                  </View>
                </Marker>
              );
            })}
            {/* GPS points for this visit when selected */}
            {isSelected && locationPoints
              .filter((p) => p.timeline_id === visit.id && p.latitude && p.longitude)
              .map((p) => (
                <Circle
                  key={`gps-${p.id}`}
                  center={{ latitude: p.latitude, longitude: p.longitude }}
                  radius={4}
                  fillColor={colors.primary + 'CC'}
                  strokeColor={colors.primary}
                  strokeWidth={1}
                />
              ))
            }
          </React.Fragment>
        );
      })}

      {/* Travel polylines — server geometry is street-snapped and anchored to visits */}
      {travels.map((travel, i) => {
        const coords = travelCoords(travel);
        const isSelected = selectedId === `travel-${travel.id}`;

        if (coords) {
          return (
            <Polyline
              key={`tr-${travel.id}`}
              coordinates={coords}
              strokeColor={modeColors[travel.mode ?? 'unknown']}
              strokeWidth={isSelected ? 5 : 3}
              tappable
              onPress={() => onSelect({ ...travel })}
            />
          );
        }

        // No geometry at all (coverage gaps) — dashed straight line between flanking visits
        const startVisit = visits[i];
        const endVisit = visits[i + 1];
        if (!startVisit?.center_latitude || !startVisit?.center_longitude
          || !endVisit?.center_latitude || !endVisit?.center_longitude) return null;
        return (
          <Polyline
            key={`tr-${travel.id}-straight`}
            coordinates={[
              { latitude: startVisit.center_latitude, longitude: startVisit.center_longitude },
              { latitude: endVisit.center_latitude, longitude: endVisit.center_longitude },
            ]}
            strokeColor={colors.borderStrong}
            strokeWidth={2}
            lineDashPattern={[6, 4]}
            tappable
            onPress={() => onSelect({ ...travel })}
          />
        );
      })}
    </>
  );
}
