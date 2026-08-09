import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { TimelineMapScreen } from '../screens/timeline/TimelineMapScreen';
import { YouScreen } from '../screens/you/YouScreen';
import { TrackingStatusScreen } from '../screens/you/TrackingStatusScreen';
import TransactionsScreen from '../../components/TransactionsScreen';
import HeartbeatDebugScreen from '../../components/HeartbeatDebugScreen';

const Tab = createBottomTabNavigator();
const YouStack = createNativeStackNavigator();

function YouStackNavigator() {
  const { colors } = useTheme();
  return (
    <YouStack.Navigator screenOptions={{
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
    }}>
      <YouStack.Screen name="YouHome" component={YouScreen} options={{ headerShown: false }} />
      <YouStack.Screen name="TrackingStatus" component={TrackingStatusScreen} options={{ title: 'Location tracking' }} />
      <YouStack.Screen name="Diagnostics" component={HeartbeatDebugScreen} options={{ title: 'Diagnostics' }} />
    </YouStack.Navigator>
  );
}

const tabIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Timeline: 'map-clock', Spend: 'credit-card-outline', You: 'account-circle-outline',
};

export default function AppTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textTertiary,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      tabBarIcon: ({ color, size }) => (
        <MaterialCommunityIcons name={tabIcons[route.name]} color={color} size={size} />
      ),
    })}>
      <Tab.Screen name="Timeline" component={TimelineMapScreen} />
      <Tab.Screen name="Spend" component={TransactionsScreen} />
      <Tab.Screen name="You" component={YouStackNavigator} />
    </Tab.Navigator>
  );
}
