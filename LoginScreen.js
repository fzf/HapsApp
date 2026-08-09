import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from './AuthContext';
import { useTheme } from './src/theme';
import { Card, CardContent } from './components/Card';
import Button from './components/Button';
import { Alert as CustomAlert } from './components/Alert';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { colors, radii } = useTheme();
  const styles = createStyles(colors, radii);
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
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to your Haps account</Text>
            </View>

            {/* Login Form Card */}
            <Card style={styles.card}>
              <CardContent>
                {/* Error Alert */}
                {error ? (
                  <CustomAlert variant="danger" style={styles.alert}>
                    {error}
                  </CustomAlert>
                ) : null}

                {/* Email Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="name@company.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>

                {/* Password Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry
                    autoCapitalize="none"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>

                {/* Login Button */}
                {/* Themed Pressable instead of <Button variant="primary">: Button.js hardcodes
                    white label/spinner text, which is illegible against colors.primary in dark
                    mode (#8AB4F8). Button.js has no text-style override prop, so we replicate its
                    layout here with theme-aware text/spinner color (colors.onPrimary). */}
                <Pressable
                  onPress={handleLogin}
                  disabled={loading}
                  accessibilityRole="button"
                  style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.loginButtonText}>Sign In</Text>
                  )}
                </Pressable>

                {/* Switch to Register */}
                <Button
                  variant="ghost"
                  onPress={() => navigation.navigate('Register')}
                  style={styles.switchButton}
                >
                  <Text style={styles.switchText}>
                    Don't have an account? <Text style={styles.switchTextBold}>Sign up</Text>
                  </Text>
                </Button>
              </CardContent>
            </Card>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Haps Location Tracker</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors, radii) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    header: {
      marginBottom: 32,
      alignItems: 'center',
    },
    title: {
      fontSize: 30,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    subtitle: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    card: {
      marginBottom: 24,
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    alert: {
      marginBottom: 16,
    },
    inputGroup: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
      fontSize: 14,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    loginButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      marginBottom: 16,
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    loginButtonDisabled: {
      opacity: 0.5,
    },
    loginButtonText: {
      fontWeight: '500',
      fontSize: 14,
      color: colors.onPrimary,
    },
    switchButton: {
      width: '100%',
    },
    switchText: {
      color: colors.primary,
    },
    switchTextBold: {
      fontWeight: '600',
    },
    footer: {
      alignItems: 'center',
    },
    footerText: {
      fontSize: 14,
      color: colors.textTertiary,
    },
  });
