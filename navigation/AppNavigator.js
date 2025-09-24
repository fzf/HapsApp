import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import TabBarIcon from './TabBarIcon';
import HomeScreen from '../components/HomeScreen';
import { 
  MapViewScreen, 
  TimelineListScreen, 
  HeartbeatDebugScreen 
} from '../components';

const Tab = createBottomTabNavigator();

/**
 * Main app navigator with bottom tab navigation
 */
const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#3B82F6',
          tabBarInactiveTintColor: '#6B7280',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor: '#E5E7EB',
            paddingTop: 8,
            paddingBottom: 34, // Extra padding for device safe area
            height: 84, // Increased height to accommodate extra padding
          },
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color, size, focused }) => (
              <TabBarIcon name="home" color={color} size={size} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Map"
          component={MapViewScreen}
          options={{
            tabBarIcon: ({ color, size, focused }) => (
              <TabBarIcon name="map" color={color} size={size} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Timeline"
          component={TimelineListScreen}
          options={{
            tabBarIcon: ({ color, size, focused }) => (
              <TabBarIcon name="timeline" color={color} size={size} focused={focused} />
            ),
          }}
        />
        {__DEV__ && (
          <Tab.Screen
            name="Debug"
            component={HeartbeatDebugScreen}
            options={{
              tabBarIcon: ({ color, size, focused }) => (
                <TabBarIcon name="debug" color={color} size={size} focused={focused} />
              ),
            }}
          />
        )}
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;