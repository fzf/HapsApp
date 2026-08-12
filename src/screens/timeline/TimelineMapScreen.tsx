import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Icon, Pill } from '../../ui';
import { TimelineItem } from '../../api/types';
import { useTimelineDay } from '../../hooks/useTimelineDay';
import { regionForItem, regionForBounds } from './mapGeometry';
import { MapOverlays } from './MapOverlays';
import { TimelineSheet } from './TimelineSheet';
import { timelineNeedsRefresh } from './refreshFlag';

export function TimelineMapScreen() {
  const theme = useTheme();
  const { colors, spacing, type } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const state = useTimelineDay();
  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [initialRegion, setInitialRegion] = useState<Region | undefined>(undefined);
  // Holds the device-location fallback region so it can be applied via animateToRegion
  // once the native map is ready (initialRegion is read only at native mount, so setting
  // it after mount is otherwise a no-op — see finding 1).
  const deviceRegionRef = useRef<Region | null>(null);
  // Live mirror of `mapReady` for use inside the location-fetch closure below, whose
  // effect only runs once (mount) so its captured `mapReady` would otherwise be stale.
  const mapReadyRef = useRef(false);
  useEffect(() => { mapReadyRef.current = mapReady; }, [mapReady]);

  const snapPoints = useMemo(() => ['12%', '45%', '88%'], []);

  // Tracks whether data-driven auto-focus (below) has run, so the device-location
  // fallback never fights it once real timeline data takes over the camera.
  const lastAutoFocusKey = useRef<string | null>(null);

  // Only pan to the device-location fallback if data-driven auto-focus hasn't
  // already taken over the camera — never fight the timeline auto-focus.
  const canApplyDeviceRegion = useCallback(
    () => lastAutoFocusKey.current === null || state.items.length === 0,
    [state.items.length],
  );
  // Live ref to the guard above, reassigned every render. The mount effect below
  // has `[]` deps (it must only fetch device location / request permission once),
  // so a closure over `canApplyDeviceRegion` captured there would be pinned to the
  // function instance — and the `state.items.length` it closed over — from the
  // FIRST render forever, permanently reading `state.items.length === 0` even
  // after data auto-focus has run and populated items. Calling
  // `canApplyDeviceRegionRef.current()` instead always reads the latest guard.
  const canApplyDeviceRegionRef = useRef(canApplyDeviceRegion);
  canApplyDeviceRegionRef.current = canApplyDeviceRegion;

  // Initial region: device location fallback (port of MapTimelineScreen.js:235-250)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const region: Region = {
            latitude: loc.coords.latitude, longitude: loc.coords.longitude,
            latitudeDelta: 0.05, longitudeDelta: 0.05,
          };
          deviceRegionRef.current = region;
          if (mapReadyRef.current) {
            // Map already mounted: setInitialRegion would be a no-op, so pan explicitly.
            if (canApplyDeviceRegionRef.current()) mapRef.current?.animateToRegion(region, 600);
          } else {
            setInitialRegion((r) => r ?? region);
          }
        }
      } catch { /* keep undefined; map uses its default */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ordering race: the device-location effect above may resolve before the map
  // reports ready, in which case the branch above already went through
  // setInitialRegion — but initialRegion is native-mount-only, so once the map
  // actually becomes ready we still need to explicitly pan to it here. This
  // effect re-runs fresh on every `mapReady` flip, so its closure over
  // `canApplyDeviceRegion` is not stale — but we route through the same live ref
  // for consistency (and in case `mapReady` never flips again after data
  // auto-focus already ran, which would otherwise leave a stale closure here too
  // if this effect had fired earlier and not re-run since).
  useEffect(() => {
    if (!mapReady || !deviceRegionRef.current) return;
    if (canApplyDeviceRegionRef.current()) mapRef.current?.animateToRegion(deviceRegionRef.current, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  const focusItem = useCallback((item: TimelineItem, animate = true) => {
    const region = regionForItem(item);
    if (region) {
      if (mapReady) mapRef.current?.animateToRegion(region, animate ? 500 : 0);
      else setInitialRegion(region);
    }
    const idx = state.items.findIndex((i) => i.type === item.type && i.id === item.id);
    if (idx >= 0) {
      setTimeout(() => listRef.current?.scrollToIndex?.({ index: idx, animated: true, viewPosition: 0.2 }), 300);
    }
  }, [mapReady, state.items]);

  const selectItem = useCallback((item: TimelineItem) => {
    setSelectedId(`${item.type}-${item.id}`);
    focusItem(item);
  }, [focusItem]);

  const onDetailPress = useCallback((item: TimelineItem) => {
    navigation.navigate('VisitDetail', {
      visitId: item.id,
      timezone: state.timezone,
      purchases: state.purchases.filter((p) => p.matched_visit?.visit_id === item.id),
    });
  }, [navigation, state.timezone, state.purchases]);

  // Refresh the day's data when this screen regains focus after a visit was
  // edited in VisitDetail (which sets timelineNeedsRefresh.current = true).
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (timelineNeedsRefresh.current) {
        timelineNeedsRefresh.current = false;
        state.reload();
      }
    });
    return unsubscribe;
  }, [navigation, state.reload]);

  // Auto-focus current item on load (port of MapTimelineScreen.js:335-388)
  useEffect(() => {
    if (state.loading || !state.day) return;
    const key = `${state.date.toDateString()}-${state.items.length}-${mapReady}`;
    if (lastAutoFocusKey.current === key) return;
    lastAutoFocusKey.current = key;
    if (state.currentItem) {
      setSelectedId(`${state.currentItem.type}-${state.currentItem.id}`);
      focusItem(state.currentItem, false);
    } else {
      const bounds = regionForBounds(state.day);
      if (bounds) {
        if (mapReady) mapRef.current?.animateToRegion(bounds, 600);
        else setInitialRegion(bounds);
      }
      setSelectedId(null);
    }
  }, [state.loading, state.day, state.currentItem, state.items, state.date, focusItem, mapReady]);

  const dateLabel = state.isToday
    ? 'Today'
    : state.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MapView
        ref={mapRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        initialRegion={initialRegion}
        showsUserLocation
        showsCompass={false}
        userInterfaceStyle={theme.dark ? 'dark' : 'light'}
        onMapReady={() => setMapReady(true)}
      >
        {state.day ? (
          <MapOverlays
            day={state.day}
            selectedId={selectedId}
            locationPoints={state.locationPoints}
            purchases={state.purchases}
            onSelect={selectItem}
          />
        ) : null}
      </MapView>

      {/* Floating date pill */}
      <View style={{
        position: 'absolute', top: insets.top + spacing.sm, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
      }}>
        <Pill onPress={state.goPrevDay} style={{ paddingHorizontal: spacing.md, marginRight: spacing.sm }}>
          <Icon name="chevron-left" size={22} color={colors.textPrimary} />
        </Pill>
        <Pill>{dateLabel}</Pill>
        <Pill
          onPress={state.isToday ? undefined : state.goNextDay}
          style={{ paddingHorizontal: spacing.md, marginLeft: spacing.sm, opacity: state.isToday ? 0.4 : 1 }}
        >
          <Icon name="chevron-right" size={22} color={colors.textPrimary} />
        </Pill>
        {state.loading ? (
          <View style={{ position: 'absolute', right: spacing.lg }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}
      </View>

      {/* Error banner */}
      {state.error && !state.loading ? (
        <View style={{
          position: 'absolute', top: insets.top + 64, left: spacing.lg, right: spacing.lg,
          backgroundColor: colors.dangerSoft, borderRadius: 12, padding: spacing.md,
          flexDirection: 'row', alignItems: 'center',
        }}>
          <Text style={[type.caption, { flex: 1, color: colors.danger }]}>{state.error}</Text>
          <Pressable onPress={state.reload} accessibilityRole="button">
            <Text style={[type.caption, { color: colors.danger, fontWeight: '700', marginLeft: spacing.md }]}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : null}

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      >
        <TimelineSheet
          state={state}
          selectedId={selectedId}
          onSelect={selectItem}
          onDetailPress={onDetailPress}
          listRef={listRef}
        />
      </BottomSheet>
    </View>
  );
}
