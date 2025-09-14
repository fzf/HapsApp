import React, { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../LoginScreen';
import RegisterScreen from '../RegisterScreen';

const Stack = createNativeStackNavigator();

/**
 * Authentication navigator that handles login/register flow
 */
const AuthNavigator = () => {
  const [initialRoute] = useState('Login');

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="Login"
        component={LoginScreen}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
      />
    </Stack.Navigator>
  );
};

export default AuthNavigator;