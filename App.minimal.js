import React from 'react';
import { Text, View, SafeAreaView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

function HomeScreen() {
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Home Screen</Text>
      <Text style={{ fontSize: 16, marginTop: 10 }}>This is the Home tab</Text>
    </SafeAreaView>
  );
}

function MapScreen() {
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e0f0ff' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Map Screen</Text>
      <Text style={{ fontSize: 16, marginTop: 10 }}>This is the Map tab</Text>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#999999',
          headerShown: false,
        }}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Text style={{ color, fontSize: 20 }}>🏠</Text>
            ),
          }}
        />
        <Tab.Screen 
          name="Map" 
          component={MapScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Text style={{ color, fontSize: 20 }}>🗺️</Text>
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
