import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon, IconName } from './Icon';
import { useTheme } from '../theme';

export function ListRow({ icon, title, subtitle, right, onPress, selected }: {
  icon: IconName; title: string; subtitle?: string;
  right?: React.ReactNode; onPress?: () => void; selected?: boolean;
}) {
  const { colors, spacing, type, radii } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
        backgroundColor: selected ? colors.primarySoft : 'transparent',
        borderRadius: radii.md,
      }}
    >
      <Icon name={icon} size={22} color={selected ? colors.primary : colors.textSecondary} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[type.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}
