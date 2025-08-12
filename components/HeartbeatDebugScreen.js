import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl
} from 'react-native';
import HeartbeatService from '../services/HeartbeatService';
import LocationService from '../services/LocationService';
import { Card } from './Card';
import { Button } from './Button';

const HeartbeatDebugScreen = () => {
  const [heartbeatStatus, setHeartbeatStatus] = useState(null);
  const [locationStatus, setLocationStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastHeartbeatResult, setLastHeartbeatResult] = useState(null);

  const loadStatus = async () => {
    try {
      const [hbStatus, locStatus] = await Promise.all([
        HeartbeatService.getStatus(),
        LocationService.getServiceStatus()
      ]);
      setHeartbeatStatus(hbStatus);
      setLocationStatus(locStatus);
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStatus();
    setRefreshing(false);
  };

  const forceHeartbeat = async () => {
    try {
      const result = await HeartbeatService.forceHeartbeat();
      setLastHeartbeatResult(result);
      await loadStatus();
    } catch (error) {
      setLastHeartbeatResult({
        success: false,
        error: error.message
      });
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const getStatusColor = (isGood) => isGood ? '#10b981' : '#ef4444';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>Heartbeat Debug Screen</Text>

      {/* Heartbeat Service Status */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Heartbeat Service Status</Text>
        {heartbeatStatus ? (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.label}>Service Active:</Text>
              <Text style={[styles.value, { color: getStatusColor(heartbeatStatus.isActive) }]}>
                {heartbeatStatus.isActive ? 'YES' : 'NO'}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.label}>Task Registered:</Text>
              <Text style={[styles.value, { color: getStatusColor(heartbeatStatus.isTaskRegistered) }]}>
                {heartbeatStatus.isTaskRegistered ? 'YES' : 'NO'}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.label}>Interval:</Text>
              <Text style={styles.value}>{formatDuration(heartbeatStatus.intervalMs)}</Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.label}>Last Heartbeat:</Text>
              <Text style={styles.value}>{formatTime(heartbeatStatus.lastHeartbeatTime)}</Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.label}>Time Since Last:</Text>
              <Text style={styles.value}>
                {heartbeatStatus.timeSinceLastHeartbeat ? formatDuration(heartbeatStatus.timeSinceLastHeartbeat) : 'N/A'}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.label}>Next Heartbeat In:</Text>
              <Text style={[styles.value, { color: heartbeatStatus.nextHeartbeatDue ? '#ef4444' : '#10b981' }]}>
                {heartbeatStatus.nextHeartbeatDue ? 'DUE NOW' : formatDuration(heartbeatStatus.timeUntilNextHeartbeat)}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.loading}>Loading...</Text>
        )}
      </Card>

      {/* Location Service Status */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Location Service Status</Text>
        {locationStatus ? (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.label}>Tracking:</Text>
              <Text style={[styles.value, { color: getStatusColor(locationStatus.isTracking) }]}>
                {locationStatus.isTracking ? 'YES' : 'NO'}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.label}>Current Activity:</Text>
              <Text style={styles.value}>{locationStatus.currentActivity}</Text>
            </View>

            {locationStatus.heartbeatStatus && (
              <>
                <View style={styles.statusRow}>
                  <Text style={styles.label}>Heartbeat Active:</Text>
                  <Text style={[styles.value, { color: getStatusColor(locationStatus.heartbeatStatus.isActive) }]}>
                    {locationStatus.heartbeatStatus.isActive ? 'YES' : 'NO'}
                  </Text>
                </View>
              </>
            )}
          </>
        ) : (
          <Text style={styles.loading}>Loading...</Text>
        )}
      </Card>

      {/* Last Heartbeat Result */}
      {lastHeartbeatResult && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Last Forced Heartbeat Result</Text>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Success:</Text>
            <Text style={[styles.value, { color: getStatusColor(lastHeartbeatResult.success) }]}>
              {lastHeartbeatResult.success ? 'YES' : 'NO'}
            </Text>
          </View>

          {lastHeartbeatResult.location_source && (
            <View style={styles.statusRow}>
              <Text style={styles.label}>Location Source:</Text>
              <Text style={styles.value}>{lastHeartbeatResult.location_source}</Text>
            </View>
          )}

          {lastHeartbeatResult.has_location !== undefined && (
            <View style={styles.statusRow}>
              <Text style={styles.label}>Has Location:</Text>
              <Text style={[styles.value, { color: getStatusColor(lastHeartbeatResult.has_location) }]}>
                {lastHeartbeatResult.has_location ? 'YES' : 'NO'}
              </Text>
            </View>
          )}

          {lastHeartbeatResult.error && (
            <View style={styles.statusRow}>
              <Text style={styles.label}>Error:</Text>
              <Text style={[styles.value, styles.errorText]}>{lastHeartbeatResult.error}</Text>
            </View>
          )}

          <View style={styles.statusRow}>
            <Text style={styles.label}>Timestamp:</Text>
            <Text style={styles.value}>{formatTime(lastHeartbeatResult.timestamp)}</Text>
          </View>
        </Card>
      )}

      {/* Actions */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Test Actions</Text>
        <Button
          onPress={forceHeartbeat}
          style={styles.button}
        >
          Force Heartbeat Now
        </Button>
        <Button
          onPress={() => onRefresh()}
          variant="secondary"
          style={styles.button}
        >
          Refresh Status
        </Button>
      </Card>

      {/* Info */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Info</Text>
        <Text style={styles.infoText}>
          This screen helps debug the 30-minute heartbeat system. The heartbeat service ensures
          that location data is captured and sent at least every 30 minutes, regardless of user
          activity or other sync intervals.
        </Text>
        <Text style={styles.infoText}>
          • Pull to refresh status{'\n'}
          • Status updates every 5 seconds{'\n'}
          • Use "Force Heartbeat Now" to test immediately
        </Text>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    textAlign: 'right',
  },
  loading: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
  button: {
    marginBottom: 12,
  },
  errorText: {
    color: '#ef4444',
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 8,
  },
});

export default HeartbeatDebugScreen;
