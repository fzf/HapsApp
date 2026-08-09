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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from './AuthContext';
import { useTheme } from './src/theme';
import { Card, CardContent } from './components/Card';
import Button from './components/Button';
import { Alert as CustomAlert } from './components/Alert';

export default function RegisterScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();

  const handleRegister = async () => {
    if (!email || !password || !passwordConfirmation) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== passwordConfirmation) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await register(email, password, passwordConfirmation);
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
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Sign up to start tracking your timeline</Text>
            </View>

            {/* Register Form Card */}
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
                  <Text style={styles.hint}>Must be at least 6 characters</Text>
                </View>

                {/* Confirm Password Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    value={passwordConfirmation}
                    onChangeText={setPasswordConfirmation}
                    placeholder="••••••••"
                    secureTextEntry
                    autoCapitalize="none"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>

                {/* Register Button */}
                <Button
                  variant="primary"
                  size="lg"
                  loading={loading}
                  disabled={loading}
                  onPress={handleRegister}
                  style={styles.registerButton}
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </Button>

                {/* Switch to Login */}
                <Button
                  variant="ghost"
                  onPress={() => navigation.navigate('Login')}
                  style={styles.switchButton}
                >
                  <Text style={styles.switchText}>
                    Already have an account? <Text style={styles.switchTextBold}>Sign in</Text>
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

const createStyles = (colors) =>
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
    hint: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 4,
    },
    registerButton: {
      width: '100%',
      marginBottom: 16,
      backgroundColor: colors.primary,
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
