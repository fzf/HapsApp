import React from 'react';
import { Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTheme } from '../../theme';
import { StatChip } from '../../ui';
import { Purchase, TimelineItem } from '../../api/types';
import { TimelineItemRow } from './TimelineItemRow';
import { fmtDistance, fmtAmount } from './format';
import type { TimelineDayState } from '../../hooks/useTimelineDay';

export function TimelineSheet({ state, selectedId, onSelect, onDetailPress, listRef }: {
  state: TimelineDayState; selectedId: string | null;
  onSelect: (item: TimelineItem) => void; onDetailPress?: (item: TimelineItem) => void;
  listRef: React.RefObject<any>;
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
          onDetailPress={onDetailPress}
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
