import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Icon, ListRow } from '../../ui';
import { useVisitDetail } from '../../hooks/useVisitDetail';
import { fmtTime, fmtDuration } from './format';
import { isAdminUser } from '../../../utils/adminUtils';
import { useAuth } from '../../../AuthContext';

function sourceBadge(visit: { location_source?: string; location_confidence_score?: number }) {
  if (visit.location_source === 'manual') {
    return { label: 'Set by you', bg: 'primarySoft' as const, fg: 'primary' as const };
  }
  if (visit.location_source === 'purchase_match') {
    return { label: 'From purchase', bg: 'successSoft' as const, fg: 'success' as const };
  }
  const pct = Math.round((visit.location_confidence_score ?? 0) * 100);
  return { label: `Auto-detected · ${pct}%`, bg: 'surfaceAlt' as const, fg: 'textSecondary' as const };
}

export function VisitDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { colors, spacing, type, radii } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const visitId: number = route.params.visitId;
  const { visit, loading, busy, error, clearError, reload, selectLocation, refreshGeocode } = useVisitDetail(visitId);

  useEffect(() => {
    if (visit) {
      navigation.setOptions({ title: visit.location?.name ?? 'Visit' });
    }
  }, [visit, navigation]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && !visit) {
    return (
      <View style={{
        flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
      }}>
        <Icon name="alert-circle-outline" size={40} color={colors.danger} />
        <Text style={[type.heading, { color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' }]}>
          Something went wrong
        </Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
          {error}
        </Text>
        <Pressable
          onPress={reload}
          style={{
            marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radii.md,
            paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
          }}
        >
          <Text style={[type.bodyBold, { color: colors.onPrimary }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!visit) {
    // Defensive fallback: loading is false, there's no error, yet visit is still
    // null (shouldn't normally happen, but never render a silent blank screen).
    return (
      <View style={{
        flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
      }}>
        <Icon name="alert-circle-outline" size={40} color={colors.textTertiary} />
        <Text style={[type.heading, { color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' }]}>
          Couldn't load visit
        </Text>
        <Pressable
          onPress={reload}
          style={{
            marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radii.md,
            paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
          }}
        >
          <Text style={[type.bodyBold, { color: colors.onPrimary }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const badge = sourceBadge(visit);
  const suggestions = visit.suggested_locations || [];
  const timeRange = `${fmtTime(visit.start_time)}${visit.end_time ? ` – ${fmtTime(visit.end_time)}` : ' – now'}`;

  const handleRefreshLongPress = () => {
    if (!isAdminUser(user) || busy) return;
    Alert.alert(
      'Force full refresh?',
      'Re-queries all providers and rebuilds suggestions.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Force refresh', style: 'destructive', onPress: () => refreshGeocode(true) },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
    >
      {/* Header card */}
      <View style={{
        backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg,
      }}>
        <Text style={[type.title, { color: colors.textPrimary }]}>
          {visit.location?.name ?? 'Unknown place'}
        </Text>
        {(visit.location?.address || visit.location?.city || visit.location?.state) ? (
          <Text style={[type.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            {[visit.location?.address, [visit.location?.city, visit.location?.state].filter(Boolean).join(', ')]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}

        <View style={{
          flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center',
          backgroundColor: colors[badge.bg], borderRadius: radii.pill,
          paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginTop: spacing.sm,
        }}>
          <Text style={[type.micro, { color: colors[badge.fg], fontWeight: '600' }]}>{badge.label}</Text>
        </View>

        <Text style={[type.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
          {timeRange}{visit.duration ? `  ·  ${fmtDuration(visit.duration)}` : ''}
        </Text>
      </View>

      {/* Wrong place? */}
      <Text style={[type.heading, { color: colors.textPrimary, marginBottom: spacing.sm }]}>Wrong place?</Text>
      <View style={{
        backgroundColor: colors.surface, borderRadius: radii.lg, paddingVertical: spacing.xs, marginBottom: spacing.lg,
        opacity: busy ? 0.5 : 1,
      }}>
        {suggestions.length === 0 ? (
          <Text style={[type.caption, { color: colors.textSecondary, padding: spacing.lg }]}>
            No alternative places found
          </Text>
        ) : (
          suggestions.map((s) => {
            const selected = visit.location?.id === s.id;
            return (
              <ListRow
                key={s.id}
                icon="map-marker-outline"
                title={s.name ?? 'Unknown place'}
                subtitle={[s.address, s.providers?.[0]].filter(Boolean).join(' · ')}
                selected={selected}
                right={selected ? <Icon name="check" size={20} color={colors.primary} /> : undefined}
                onPress={busy ? undefined : () => selectLocation(s.id)}
              />
            );
          })
        )}
      </View>

      {/* Inline error banner */}
      {error ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dangerSoft,
          borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.lg,
        }}>
          <Text style={[type.caption, { flex: 1, color: colors.danger }]}>{error}</Text>
          <Pressable onPress={clearError} accessibilityRole="button">
            <Text style={[type.caption, { color: colors.danger, fontWeight: '700', marginLeft: spacing.md }]}>
              Dismiss
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Actions */}
      <Pressable
        onPress={busy ? undefined : () => refreshGeocode(false)}
        onLongPress={handleRefreshLongPress}
        style={{
          backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md,
          alignItems: 'center', opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <Text style={[type.bodyBold, { color: colors.onPrimary }]}>Refresh place info</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
