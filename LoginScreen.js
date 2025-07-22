import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useAuth } from './AuthContext';
import { Card, CardContent } from './components/Card';
import { Button } from './components/Button';
import { Alert as FlowbiteAlert } from './components/Alert';

export default function LoginScreen({ onSwitchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error);
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View className="px-6 py-8">
            {/* Header */}
            <View className="mb-8 items-center">
              <Text className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</Text>
              <Text className="text-gray-600 text-center">Sign in to your Haps account</Text>
            </View>

            {/* Login Form Card */}
            <Card className="mb-6">
              <CardContent>
                {/* Error Alert */}
                {error ? (
                  <FlowbiteAlert variant="danger" className="mb-4">
                    {error}
                  </FlowbiteAlert>
                ) : null}

                {/* Email Input */}
                <View className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 mb-2">Email Address</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2.5"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="name@company.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#9ca3af"
                  />
                </View>

                {/* Password Input */}
                <View className="mb-6">
                  <Text className="text-sm font-medium text-gray-700 mb-2">Password</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2.5"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry
                    autoCapitalize="none"
                    placeholderTextColor="#9ca3af"
                  />
                </View>

                {/* Login Button */}
                <Button
                  variant="primary"
                  size="lg"
                  loading={loading}
                  disabled={loading}
                  onPress={handleLogin}
                  className="w-full mb-4"
                >
                  {loading ? 'Signing In...' : 'Sign In'}
                </Button>

                {/* Switch to Register */}
                <Button
                  variant="ghost"
                  onPress={onSwitchToRegister}
                  className="w-full"
                >
                  <Text className="text-primary-600">
                    Don't have an account? <Text className="font-semibold">Sign up</Text>
                  </Text>
                </Button>
              </CardContent>
            </Card>

            {/* Footer */}
            <View className="items-center">
              <Text className="text-sm text-gray-500">Haps Location Tracker</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
