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

export function TimelineItemRow({ item, timezone, selected, purchases, onPress, onDetailPress, isLast }: {
  item: TimelineItem; timezone: string; selected: boolean;
  purchases: Purchase[]; onPress: (item: TimelineItem) => void;
  onDetailPress?: (item: TimelineItem) => void; isLast?: boolean;
}) {
  const { colors, spacing, type, radii } = useTheme();
  const isVisit = item.type === 'visit';
  const visitPurchases = isVisit ? purchases.filter((p) => p.matched_visit?.visit_id === item.id) : [];
  const mode = travelModeOf(item);
  const timeRange = `${fmtTime(item.start_time, timezone)}${item.end_time ? ` – ${fmtTime(item.end_time, timezone)}` : ' – now'}`;
  const showDetailAccessory = isVisit && selected && !!onDetailPress;

  const handleRowPress = () => {
    if (showDetailAccessory) {
      onDetailPress!(item);
    } else {
      onPress(item);
    }
  };

  return (
    <Pressable onPress={handleRowPress} style={{ flexDirection: 'row', paddingHorizontal: spacing.lg }}>
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
      {showDetailAccessory ? (
        <Pressable
          onPress={() => onDetailPress!(item)}
          accessibilityRole="button"
          hitSlop={8}
          style={{ justifyContent: 'center', paddingLeft: spacing.sm }}
        >
          <Icon name="chevron-right" size={20} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}
