import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { ListRow } from '../../ui';
import { useAuth } from '../../../AuthContext';
import { isAdminUser } from '../../../utils/adminUtils';

export function YouScreen({ navigation }: { navigation: any }) {
  const { colors, spacing, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.xl, paddingHorizontal: spacing.lg }}>
      {/* Profile header */}
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <View style={{
          width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft,
          alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
        }}>
          <Text style={[type.title, { color: colors.primary }]}>
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={[type.heading, { color: colors.textPrimary }]}>{user?.email ?? ''}</Text>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: 16, paddingVertical: spacing.xs }}>
        <ListRow icon="crosshairs-gps" title="Location tracking"
          subtitle="Status, permissions, sync" onPress={() => navigation.navigate('TrackingStatus')} />
        {isAdminUser(user) ? (
          <ListRow icon="stethoscope" title="Diagnostics"
            subtitle="Heartbeats and background tasks" onPress={() => navigation.navigate('Diagnostics')} />
        ) : null}
        <ListRow icon="logout" title="Sign out" onPress={logout} />
      </View>
    </ScrollView>
  );
}
