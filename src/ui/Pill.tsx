import React from 'react';
import { Pressable, Text, View, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../theme';

export function Pill({ children, onPress, style }: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii, spacing, elevation, type } = useTheme();
  const inner = typeof children === 'string'
    ? <Text style={[type.bodyBold, { color: colors.textPrimary }]}>{children}</Text>
    : children;
  const base: ViewStyle = {
    backgroundColor: colors.mapControlBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    ...elevation.floating,
  };
  if (!onPress) return <View style={[base, style]}>{inner}</View>;
  return <Pressable onPress={onPress} style={[base, style]}>{inner}</Pressable>;
}
