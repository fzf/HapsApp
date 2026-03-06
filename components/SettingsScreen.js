import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Screen, Card, CardHeader, CardTitle, CardContent, Button } from '../components';
import { Switch } from 'react-native';
import { NotificationService } from '../services';
import { handleAsyncOperation, createErrorHandler } from '../utils';

const SettingsScreen = () => {
  const [settings, setSettings] = useState({
    enabled: true,
    travelStart: true,
    visitArrival: true,
    silent: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleError = createErrorHandler('SettingsScreen');

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const result = await handleAsyncOperation(
      async () => {
        const currentSettings = NotificationService.getSettings();
        setSettings(currentSettings);
        setLoading(false);
      },
      {
        onError: (error, userMessage) => {
          setError(userMessage);
          setLoading(false);
        },
        errorContext: { operation: 'load_notification_settings' }
      }
    );
  };

  const updateSetting = async (key, value) => {
    const result = await handleAsyncOperation(
      async () => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        await NotificationService.updateSettings(newSettings);
      },
      {
        onError: (error, userMessage) => {
          setError(userMessage);
          // Revert the setting change on error
          setSettings(settings);
        },
        errorContext: { operation: 'update_notification_setting', setting: key }
      }
    );
  };

  const testNotifications = async () => {
    const result = await handleAsyncOperation(
      async () => {
        const success = await NotificationService.testNotification();
        if (success) {
          Alert.alert(
            'Test Successful',
            'If notifications are enabled, you should see a test notification.',
            [{ text: 'OK' }]
          );
        } else {
          throw new Error('Test notification failed');
        }
      },
      {
        onError: (error, userMessage) => {
          Alert.alert(
            'Test Failed',
            'Failed to send test notification. Please check your notification permissions.',
            [{ text: 'OK' }]
          );
        },
        errorContext: { operation: 'test_notification' }
      }
    );
  };

  const SettingRow = ({ title, description, value, onValueChange, disabled = false }) => (
    <View style={styles.settingRow}>
      <View style={styles.settingTextContainer}>
        <Text style={[styles.settingTitle, disabled && styles.disabledText]}>{title}</Text>
        {description && (
          <Text style={[styles.settingDescription, disabled && styles.disabledText]}>
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
        thumbColor={value ? '#FFFFFF' : '#9CA3AF'}
      />
    </View>
  );

  return (
    <Screen
      safeArea={true}
      scrollable={true}
      loading={loading}
      error={error}
      onRetry={() => {
        setError(null);
        loadSettings();
      }}
      errorBoundaryName="SettingsScreen"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Configure your travel notifications</Text>
        </View>

        {/* Notification Settings Card */}
        <Card style={styles.card}>
          <CardHeader>
            <CardTitle>Travel Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingRow
              title="Enable Notifications"
              description="Receive notifications about your travel and location activities"
              value={settings.enabled}
              onValueChange={(value) => updateSetting('enabled', value)}
            />
            
            <View style={styles.separator} />
            
            <SettingRow
              title="Travel Start/Stop"
              description="Get notified when you start or stop traveling"
              value={settings.travelStart}
              onValueChange={(value) => updateSetting('travelStart', value)}
              disabled={!settings.enabled}
            />
            
            <View style={styles.separator} />
            
            <SettingRow
              title="Arrival Notifications"
              description="Get notified when you arrive at a new location"
              value={settings.visitArrival}
              onValueChange={(value) => updateSetting('visitArrival', value)}
              disabled={!settings.enabled}
            />
            
            <View style={styles.separator} />
            
            <SettingRow
              title="Silent Notifications"
              description="Notifications appear without sound or vibration"
              value={settings.silent}
              onValueChange={(value) => updateSetting('silent', value)}
              disabled={!settings.enabled}
            />
          </CardContent>
        </Card>

        {/* Test Section */}
        <Card style={styles.card}>
          <CardHeader>
            <CardTitle>Test Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <Text style={styles.testDescription}>
              Send a test notification to verify your settings are working correctly.
            </Text>
            <Button
              title="Send Test Notification"
              onPress={testNotifications}
              disabled={!settings.enabled}
              style={[styles.testButton, !settings.enabled && styles.disabledButton]}
            />
          </CardContent>
        </Card>

        {/* Info Section */}
        <Card style={styles.card}>
          <CardHeader>
            <CardTitle>About Travel Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <Text style={styles.infoText}>
              • <Text style={styles.bold}>Travel Start:</Text> Notifies when you begin moving from a stationary state
            </Text>
            <Text style={styles.infoText}>
              • <Text style={styles.bold}>Travel Stop:</Text> Notifies when you stop moving and become stationary
            </Text>
            <Text style={styles.infoText}>
              • <Text style={styles.bold}>Arrivals:</Text> Notifies when you arrive at a new location and stay there
            </Text>
            <Text style={styles.infoText}>
              • <Text style={styles.bold}>Silent Mode:</Text> Shows notifications without sound to avoid distraction
            </Text>
            <Text style={styles.infoText}>
              {'\n'}Notifications help you stay aware of your movement patterns and ensure location tracking is working properly.
            </Text>
          </CardContent>
        </Card>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  disabledText: {
    color: '#9CA3AF',
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  testDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  testButton: {
    backgroundColor: '#3B82F6',
  },
  disabledButton: {
    backgroundColor: '#E5E7EB',
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 8,
  },
  bold: {
    fontWeight: '600',
    color: '#1F2937',
  },
});

export default SettingsScreen;