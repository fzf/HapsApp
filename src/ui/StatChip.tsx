import React from 'react';
import { Text, View } from 'react-native';
import { Icon, IconName } from './Icon';
import { useTheme } from '../theme';

export function StatChip({ icon, label }: { icon: IconName; label: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: spacing.lg }}>
      <Icon name={icon} size={14} color={colors.textTertiary} />
      <Text style={[type.micro, { color: colors.textSecondary, marginLeft: 4 }]}>{label}</Text>
    </View>
  );
}
