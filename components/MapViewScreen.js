import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView, SafeAreaView } from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { useAuth } from '../AuthContext';
import TimelineService from '../services/TimelineService';
import { VisitTrackingService } from '../services';
import Button from './Button';
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { Badge } from './Badge';

const MapViewScreen = () => {
  const [timeline, setTimeline] = useState(null);
  const [localVisits, setLocalVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showLocalVisits, setShowLocalVisits] = useState(true);
  const [mapRegion, setMapRegion] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const [selectedItem, setSelectedItem] = useState(null);
  const { token } = useAuth();

  useEffect(() => {
    loadTimelineData();
    loadLocalVisits();
  }, [selectedDate, token]);

  useEffect(() => {
    if (showLocalVisits) {
      loadLocalVisits();
    }
  }, [showLocalVisits]);

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

  const loadLocalVisits = async () => {
    try {
      const hoursBack = 24;
      const visits = await VisitTrackingService.getRecentVisits(hoursBack);
      setLocalVisits(visits);

      // Adjust map region to include local visits if they exist and showLocalVisits is true
      if (showLocalVisits && visits.length > 0) {
        const bounds = calculateVisitsBounds(visits);
        setMapRegion(bounds);
      }
    } catch (error) {
      console.error('Failed to load local visits:', error);
    }
  };

  const calculateVisitsBounds = (visits) => {
    if (visits.length === 0) return mapRegion;

    const latitudes = visits.map(v => v.latitude);
    const longitudes = visits.map(v => v.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latDelta = Math.max((maxLat - minLat) * 1.3, 0.01);
    const lngDelta = Math.max((maxLng - minLng) * 1.3, 0.01);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
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

  const renderLocalVisitMarkers = () => {
    if (!showLocalVisits || !localVisits.length) return null;

    return localVisits.map((visit, index) => {
      const formatTime = (date) => {
        if (!date) return 'Unknown';
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      };

      const formatDuration = (seconds) => {
        if (!seconds) return 'Unknown';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      };

      return (
        <React.Fragment key={`local-visit-${visit.id}`}>
          {/* Visit radius circle */}
          <Circle
            center={{
              latitude: visit.latitude,
              longitude: visit.longitude,
            }}
            radius={150} // Default visit radius
            fillColor="rgba(59, 130, 246, 0.1)"
            strokeColor="rgba(59, 130, 246, 0.3)"
            strokeWidth={2}
          />
          
          {/* Visit marker */}
          <Marker
            coordinate={{
              latitude: visit.latitude,
              longitude: visit.longitude,
            }}
            pinColor="#3B82F6"
            title={`Local Visit ${index + 1}`}
            description={`${formatTime(visit.startTime)} - ${visit.endTime ? formatTime(visit.endTime) : 'Ongoing'} (${visit.duration ? formatDuration(visit.duration) : 'In progress'})`}
            onPress={() => setSelectedItem({
              ...visit,
              type: 'local_visit',
              center_latitude: visit.latitude,
              center_longitude: visit.longitude,
              start_time: visit.startTime,
              end_time: visit.endTime
            })}
          />
        </React.Fragment>
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

  const renderSelectedItemDetails = () => {
    if (!selectedItem) return null;

    const isVisit = selectedItem.type === 'visit';
    const isLocalVisit = selectedItem.type === 'local_visit';
    const isTravel = selectedItem.type === 'travel';

    const formatTime = (time) => {
      if (!time) return 'Unknown';
      if (time instanceof Date) {
        return time.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      }
      return TimelineService.formatTime(time);
    };

    const formatDuration = (duration) => {
      if (!duration) return 'Unknown';
      if (typeof duration === 'number') {
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      }
      return TimelineService.formatDuration(duration);
    };

    return (
      <Card style={styles.detailCard}>
        <CardHeader>
          <View style={styles.detailHeader}>
            <CardTitle>
              {isLocalVisit ? 'Local Visit Details' : isVisit ? 'Visit Details' : 'Travel Details'}
            </CardTitle>
            <Badge variant={isLocalVisit ? 'warning' : isVisit ? 'success' : 'info'}>
              {isLocalVisit ? 'Local Visit' : isVisit ? 'Visit' : 'Travel'}
            </Badge>
          </View>
        </CardHeader>
        <CardContent>
          {(isVisit || isLocalVisit) && selectedItem.location && (
            <Text style={styles.locationName}>{selectedItem.location.name}</Text>
          )}
          {(isVisit || isLocalVisit) && selectedItem.location?.address && (
            <Text style={styles.locationAddress}>{selectedItem.location.address}</Text>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Start:</Text>
            <Text style={styles.detailValue}>{formatTime(selectedItem.start_time)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>End:</Text>
            <Text style={styles.detailValue}>
              {selectedItem.end_time ? formatTime(selectedItem.end_time) : 'Ongoing'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration:</Text>
            <Text style={styles.detailValue}>{formatDuration(selectedItem.duration)}</Text>
          </View>
          {isLocalVisit && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Confidence:</Text>
              <Text style={styles.detailValue}>{(selectedItem.confidence * 100).toFixed(0)}%</Text>
            </View>
          )}
          {isLocalVisit && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location Points:</Text>
              <Text style={styles.detailValue}>{selectedItem.locationCount || 0}</Text>
            </View>
          )}
          {isTravel && selectedItem.distance && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Distance:</Text>
              <Text style={styles.detailValue}>{TimelineService.formatDistance(selectedItem.distance)}</Text>
            </View>
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
    if (showLocalVisits) {
      return (
        <Card style={styles.statsCard}>
          <CardContent>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{localVisits.length}</Text>
                <Text style={styles.statLabel}>Local Visits</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {localVisits.filter(v => !v.endTime).length}
                </Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>24h</Text>
                <Text style={styles.statLabel}>Period</Text>
              </View>
            </View>
            <Badge variant="info" style={styles.cacheBadge}>
              Real-time Detection
            </Badge>
          </CardContent>
        </Card>
      );
    }

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
          {timeline.fromCache && (
            <Badge variant="warning" style={styles.cacheBadge}>
              Offline Data
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
              disabled={showLocalVisits}
            >
              ← Previous
            </Button>
            <Text style={styles.dateText}>
              {showLocalVisits ? 'Local Visits (24h)' : formatDate(selectedDate)}
            </Text>
            <Button
              variant="outline"
              size="sm"
              onPress={() => changeDate(1)}
              disabled={showLocalVisits || selectedDate.toDateString() === new Date().toDateString()}
            >
              Next →
            </Button>
          </View>
          
          {/* View Toggle */}
          <View style={styles.viewToggle}>
            <Button
              variant={showLocalVisits ? "primary" : "outline"}
              size="sm"
              onPress={() => setShowLocalVisits(true)}
            >
              📍 Local Visits
            </Button>
            <Button
              variant={!showLocalVisits ? "primary" : "outline"}
              size="sm"
              onPress={() => setShowLocalVisits(false)}
            >
              📊 Server Timeline
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
          {showLocalVisits ? renderLocalVisitMarkers() : renderVisitMarkers()}
          {!showLocalVisits && renderTravelPaths()}
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
  viewToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
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
