import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView, SafeAreaView } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useAuth } from '../AuthContext';
import TimelineService from '../services/TimelineService';
import { Button } from './Button';
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { Badge } from './Badge';

const MapViewScreen = () => {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [mapRegion, setMapRegion] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const [selectedItem, setSelectedItem] = useState(null);
  const [showLocationPoints, setShowLocationPoints] = useState(false);
  const [locationPoints, setLocationPoints] = useState([]);
  const [locationPointsLoading, setLocationPointsLoading] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    loadTimelineData();
  }, [selectedDate, token]);

  const loadTimelineData = async () => {
    if (!token) return;

    try {
      setLoading(true);
      const timelineData = await TimelineService.getTimelineForDate(selectedDate, token);
      setTimeline(timelineData);

      // Set map region to fit all timeline points
      if (timelineData.visits.length > 0 || timelineData.travels.length > 0) {
        const bounds = TimelineService.getTimelineBounds(timelineData);
        setMapRegion(bounds);
      }
    } catch (error) {
      console.error('Failed to load timeline data:', error);
      Alert.alert('Error', 'Failed to load timeline data');
    } finally {
      setLoading(false);
    }
  };

  const changeDate = (days) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const toggleLocationPoints = async () => {
    if (showLocationPoints) {
      setShowLocationPoints(false);
      setLocationPoints([]);
    } else {
      try {
        setLocationPointsLoading(true);
        const locationData = await TimelineService.fetchLocationPointsForDate(selectedDate, token);
        setLocationPoints(locationData.location_points || []);
        setShowLocationPoints(true);
        
        // Adjust map region to fit location points if available
        if (locationData.location_points && locationData.location_points.length > 0) {
          const bounds = getLocationPointsBounds(locationData.location_points);
          setMapRegion(bounds);
        }
      } catch (error) {
        console.error('Failed to load location points:', error);
        Alert.alert('Error', 'Failed to load location points for this date');
      } finally {
        setLocationPointsLoading(false);
      }
    }
  };

  const getLocationPointsBounds = (points) => {
    if (!points || points.length === 0) {
      return mapRegion;
    }

    const latitudes = points.map(p => p.latitude);
    const longitudes = points.map(p => p.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const latDelta = Math.max(maxLat - minLat, 0.01) * 1.2;
    const lngDelta = Math.max(maxLng - minLng, 0.01) * 1.2;

    return {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  };

  const getVisitColor = (index) => {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
    return colors[index % colors.length];
  };

  const renderVisitMarkers = () => {
    if (!timeline?.visits) return null;

    return timeline.visits.map((visit, index) => {
      if (!visit.center_latitude || !visit.center_longitude) return null;

      return (
        <Marker
          key={`visit-${visit.id}`}
          coordinate={{
            latitude: visit.center_latitude,
            longitude: visit.center_longitude,
          }}
          pinColor={getVisitColor(index)}
          title={visit.location?.name || `Visit ${index + 1}`}
          description={`${TimelineService.formatTime(visit.start_time)} - ${TimelineService.formatTime(visit.end_time)} (${TimelineService.formatDuration(visit.duration)})`}
          onPress={() => setSelectedItem(visit)}
        />
      );
    });
  };

  const renderTravelPaths = () => {
    if (!timeline?.visits || timeline.visits.length < 2) return null;

    const paths = [];
    for (let i = 0; i < timeline.visits.length - 1; i++) {
      const start = timeline.visits[i];
      const end = timeline.visits[i + 1];

      if (start.center_latitude && start.center_longitude &&
          end.center_latitude && end.center_longitude) {
        paths.push(
          <Polyline
            key={`travel-${i}`}
            coordinates={[
              {
                latitude: start.center_latitude,
                longitude: start.center_longitude,
              },
              {
                latitude: end.center_latitude,
                longitude: end.center_longitude,
              }
            ]}
            strokeColor="#6B7280"
            strokeWidth={3}
            lineDashPattern={[5, 5]}
          />
        );
      }
    }
    return paths;
  };

  const renderLocationPoints = () => {
    if (!showLocationPoints || !locationPoints) return null;

    return locationPoints.map((point, index) => (
      <Marker
        key={`location-point-${point.id}`}
        coordinate={{
          latitude: point.latitude,
          longitude: point.longitude,
        }}
        title={`Location Point ${index + 1}`}
        description={`${TimelineService.formatDateTime(point.recorded_at)} ${point.is_moving ? '(Moving)' : '(Stationary)'}`}
        pinColor={point.is_moving ? "#3B82F6" : "#10B981"}
        onPress={() => setSelectedItem({
          ...point,
          type: 'location_point',
          start_time: point.recorded_at
        })}
      />
    ));
  };

  const renderSelectedItemDetails = () => {
    if (!selectedItem) return null;

    const isVisit = selectedItem.type === 'visit';
    const isTravel = selectedItem.type === 'travel';
    const isLocationPoint = selectedItem.type === 'location_point';

    return (
      <Card style={styles.detailCard}>
        <CardHeader>
          <View style={styles.detailHeader}>
            <CardTitle>
              {isLocationPoint ? 'Location Point Details' : isVisit ? 'Visit Details' : 'Travel Details'}
            </CardTitle>
            <Badge variant={isLocationPoint ? 'warning' : isVisit ? 'success' : 'info'}>
              {isLocationPoint ? 'GPS Point' : isVisit ? 'Visit' : 'Travel'}
            </Badge>
          </View>
        </CardHeader>
        <CardContent>
          {isVisit && selectedItem.location && (
            <Text style={styles.locationName}>{selectedItem.location.name}</Text>
          )}
          {isVisit && selectedItem.location?.address && (
            <Text style={styles.locationAddress}>{selectedItem.location.address}</Text>
          )}
          
          {isLocationPoint ? (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Recorded:</Text>
                <Text style={styles.detailValue}>{TimelineService.formatDateTime(selectedItem.recorded_at)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status:</Text>
                <Text style={styles.detailValue}>{selectedItem.is_moving ? 'Moving' : 'Stationary'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Accuracy:</Text>
                <Text style={styles.detailValue}>{selectedItem.accuracy ? `${selectedItem.accuracy}m` : 'N/A'}</Text>
              </View>
              {selectedItem.speed && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Speed:</Text>
                  <Text style={styles.detailValue}>{(selectedItem.speed * 3.6).toFixed(1)} km/h</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Coordinates:</Text>
                <Text style={styles.detailValue}>{selectedItem.latitude.toFixed(6)}, {selectedItem.longitude.toFixed(6)}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Start:</Text>
                <Text style={styles.detailValue}>{TimelineService.formatTime(selectedItem.start_time)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>End:</Text>
                <Text style={styles.detailValue}>{TimelineService.formatTime(selectedItem.end_time)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Duration:</Text>
                <Text style={styles.detailValue}>{TimelineService.formatDuration(selectedItem.duration)}</Text>
              </View>
              {isTravel && selectedItem.distance && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Distance:</Text>
                  <Text style={styles.detailValue}>{TimelineService.formatDistance(selectedItem.distance)}</Text>
                </View>
              )}
            </>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onPress={() => setSelectedItem(null)}
            style={styles.closeButton}
          >
            Close
          </Button>
        </CardContent>
      </Card>
    );
  };

  const renderTimelineStats = () => {
    if (!timeline) return null;

    const totalVisits = timeline.visits?.length || 0;
    const totalTravels = timeline.travels?.length || 0;
    const totalDistance = timeline.travels?.reduce((sum, travel) => sum + (travel.distance || 0), 0) || 0;

    return (
      <Card style={styles.statsCard}>
        <CardContent>
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
          </View>
          <View style={styles.locationToggleContainer}>
            <Button
              variant={showLocationPoints ? 'primary' : 'outline'}
              size="sm"
              onPress={toggleLocationPoints}
              style={styles.locationToggleButton}
              disabled={locationPointsLoading}
            >
              {locationPointsLoading ? '⏳ Loading...' : showLocationPoints ? '📍 Hide GPS Points' : '📍 Show GPS Points'}
            </Button>
          </View>
          {timeline.fromCache && (
            <Badge variant="warning" style={styles.cacheBadge}>
              Offline Data
            </Badge>
          )}
          {showLocationPoints && locationPoints.length > 0 && (
            <Badge variant="info" style={styles.pointsBadge}>
              {locationPoints.length} location points
            </Badge>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading timeline...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Date Navigation */}
      <Card style={styles.dateCard}>
        <CardContent>
          <View style={styles.dateNavigation}>
            <Button
              variant="outline"
              size="sm"
              onPress={() => changeDate(-1)}
            >
              ← Previous
            </Button>
            <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            <Button
              variant="outline"
              size="sm"
              onPress={() => changeDate(1)}
              disabled={selectedDate.toDateString() === new Date().toDateString()}
            >
              Next →
            </Button>
          </View>
        </CardContent>
      </Card>

      {/* Timeline Stats */}
      {renderTimelineStats()}

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          region={mapRegion}
          onRegionChangeComplete={setMapRegion}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {renderVisitMarkers()}
          {renderTravelPaths()}
          {renderLocationPoints()}
        </MapView>
      </View>

      {/* Selected Item Details */}
      {renderSelectedItemDetails()}

      {/* Refresh Button */}
      <Button
        variant="primary"
        onPress={loadTimelineData}
        style={styles.refreshButton}
      >
      🔄 Refresh Data
      </Button>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6b7280',
  },
  dateCard: {
    margin: 16,
    marginBottom: 8,
  },
  dateNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    flex: 1,
    marginHorizontal: 16,
  },
  statsCard: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  cacheBadge: {
    alignSelf: 'center',
    marginTop: 8,
  },
  locationToggleContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  locationToggleButton: {
    minWidth: 140,
  },
  pointsBadge: {
    alignSelf: 'center',
    marginTop: 4,
  },
  mapContainer: {
    flex: 1,
    margin: 16,
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  map: {
    flex: 1,
  },
  detailCard: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: 'white',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  closeButton: {
    marginTop: 12,
  },
  refreshButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
});

export default MapViewScreen;
