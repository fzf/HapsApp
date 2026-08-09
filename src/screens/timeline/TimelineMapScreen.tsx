import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Icon, Pill } from '../../ui';
import { TimelineItem } from '../../api/types';
import { useTimelineDay } from '../../hooks/useTimelineDay';
import { regionForItem, regionForBounds } from './mapGeometry';
import { MapOverlays } from './MapOverlays';
import { TimelineSheet } from './TimelineSheet';

export function TimelineMapScreen() {
  const theme = useTheme();
  const { colors, spacing, type } = theme;
  const insets = useSafeAreaInsets();
  const state = useTimelineDay();
  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [initialRegion, setInitialRegion] = useState<Region | undefined>(undefined);

  const snapPoints = useMemo(() => ['12%', '45%', '88%'], []);

  // Initial region: device location fallback (port of MapTimelineScreen.js:235-250)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setInitialRegion((r) => r ?? {
            latitude: loc.coords.latitude, longitude: loc.coords.longitude,
            latitudeDelta: 0.05, longitudeDelta: 0.05,
          });
        }
      } catch { /* keep undefined; map uses its default */ }
    })();
  }, []);

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

  // Auto-focus current item on load (port of MapTimelineScreen.js:335-388)
  const lastAutoFocusKey = useRef<string | null>(null);
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
        <TimelineSheet state={state} selectedId={selectedId} onSelect={selectItem} listRef={listRef} />
      </BottomSheet>
    </View>
  );
}
