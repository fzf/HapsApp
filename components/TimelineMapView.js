import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import DateTimePicker from 'react-native-date-picker';
import { useAuth } from '../AuthContext';
import TimelineService from '../services/TimelineService';
import { Card, CardContent } from './Card';
import { Button } from './Button';

const TimelineMapView = () => {
  const { token } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mapRegion, setMapRegion] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    loadTimelineForDate(selectedDate);
  }, [selectedDate]);

  const loadTimelineForDate = async (date) => {
    if (!token) return;

    setLoading(true);
    try {
      const timelineData = await TimelineService.getTimelineForDate(date, token);
      setTimeline(timelineData);

      // Set map region to fit timeline data
      if (timelineData.visits.length > 0 || timelineData.travels.length > 0) {
        const bounds = TimelineService.getTimelineBounds(timelineData);
        setMapRegion(bounds);

        // Animate to fit the timeline
        setTimeout(() => {
          mapRef.current?.animateToRegion(bounds, 1000);
        }, 500);
      }
    } catch (error) {
      console.error('Failed to load timeline:', error);
      Alert.alert('Error', 'Failed to load timeline data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getVisitMarkerColor = (visit, index) => {
    // Color code visits by duration or just cycle through colors
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    return colors[index % colors.length];
  };

  const renderVisitMarkers = () => {
    if (!timeline?.visits) return null;

    return timeline.visits.map((visit, index) => {
      if (!visit.center_latitude || !visit.center_longitude) return null;

      return (
        <Marker
          key={`visit-${visit.id || index}`}
          coordinate={{
            latitude: visit.center_latitude,
            longitude: visit.center_longitude
          }}
          title={visit.location_name || 'Unknown Location'}
          description={`${TimelineService.formatTime(visit.start_time)} - ${TimelineService.formatTime(visit.end_time)} (${TimelineService.formatDuration(visit.duration)})`}
          pinColor={getVisitMarkerColor(visit, index)}
        />
      );
    });
  };

  const renderTravelPolylines = () => {
    if (!timeline?.travels || timeline.travels.length === 0) return null;

    // Create polylines connecting consecutive points
    const points = [];

    // Combine visits and travels, sort by time
    const allItems = [
      ...timeline.visits.map(v => ({ ...v, type: 'visit' })),
      ...timeline.travels.map(t => ({ ...t, type: 'travel' }))
    ].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    // Extract coordinates in chronological order
    allItems.forEach(item => {
      if (item.center_latitude && item.center_longitude) {
        points.push({
          latitude: item.center_latitude,
          longitude: item.center_longitude
        });
      }
    });

    if (points.length < 2) return null;

    return (
      <Polyline
        coordinates={points}
        strokeColor="#007AFF"
        strokeWidth={3}
        strokePattern={[1]}
      />
    );
  };

  const renderTimelineStats = () => {
    if (!timeline) return null;

    const totalVisits = timeline.visits.length;
    const totalTravels = timeline.travels.length;
    const totalDistance = timeline.travels.reduce((sum, travel) => sum + (travel.distance || 0), 0);
    const totalTravelTime = timeline.travels.reduce((sum, travel) => sum + (travel.duration || 0), 0);

    return (
      <Card style={styles.statsCard}>
        <CardContent>
          <Text style={styles.statsTitle}>Day Summary</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{totalVisits}</Text>
              <Text style={styles.statLabel}>Visits</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{totalTravels}</Text>
              <Text style={styles.statLabel}>Travels</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{TimelineService.formatDistance(totalDistance)}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{TimelineService.formatDuration(totalTravelTime)}</Text>
              <Text style={styles.statLabel}>Travel Time</Text>
            </View>
          </View>
          {timeline.fromCache && (
            <Text style={styles.cacheNote}>📱 Showing cached data</Text>
          )}
        </CardContent>
      </Card>
    );
  };

  if (!token) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Please log in to view timeline</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Date Selector */}
      <View style={styles.dateSection}>
        <Button
          variant="outline"
          onPress={() => setShowDatePicker(true)}
          style={styles.dateButton}
        >
          📅 {formatDate(selectedDate)}
        </Button>
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading timeline...</Text>
        </View>
      )}

      {/* Map */}
      {mapRegion && (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={mapRegion}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {renderVisitMarkers()}
          {renderTravelPolylines()}
        </MapView>
      )}

      {/* Timeline Stats */}
      {renderTimelineStats()}

      {/* Date Picker Modal */}
      <DateTimePicker
        modal
        open={showDatePicker}
        date={selectedDate}
        mode="date"
        maximumDate={new Date()}
        onConfirm={(date) => {
          setShowDatePicker(false);
          setSelectedDate(date);
        }}
        onCancel={() => setShowDatePicker(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  dateSection: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dateButton: {
    alignSelf: 'flex-start',
  },
  loadingContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 8,
    color: '#666',
  },
  map: {
    flex: 1,
  },
  statsCard: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: 'white',
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  cacheNote: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  errorText: {
    textAlign: 'center',
    margin: 20,
    fontSize: 16,
    color: '#666',
  },
});

export default TimelineMapView;
