import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, FlatList, SafeAreaView, TouchableOpacity, Modal } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAuth } from '../AuthContext';
import TimelineService from '../services/TimelineService';
import { Button } from './Button';
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { Badge } from './Badge';

const TimelineListScreen = () => {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [viewMode, setViewMode] = useState('all'); // 'all', 'visits', 'travels'
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);
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

  const toggleItemExpansion = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const handleShowMap = async (visit = null) => {
    if (visit && visit.center_latitude && visit.center_longitude) {
      setSelectedVisit(visit);
      setShowLocationPoints(false);
    } else if (!visit) {
      // Load location points for the day
      try {
        setLocationPointsLoading(true);
        const locationData = await TimelineService.fetchLocationPointsForDate(selectedDate, token);
        setLocationPoints(locationData.location_points || []);
        setSelectedVisit(null);
        setShowLocationPoints(true);
      } catch (error) {
        console.error('Failed to load location points:', error);
        Alert.alert('Error', 'Failed to load location points for this date');
        return;
      } finally {
        setLocationPointsLoading(false);
      }
    } else {
      Alert.alert('No Location Data', 'This visit does not have location coordinates available.');
      return;
    }
    
    setMapModalVisible(true);
  };

  const getLocationPointsRegion = () => {
    if (!locationPoints || locationPoints.length === 0) {
      return {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }

    const latitudes = locationPoints.map(p => p.latitude);
    const longitudes = locationPoints.map(p => p.longitude);

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

  const getFilteredData = () => {
    if (!timeline) return [];

    let items = [];

    if (viewMode === 'all' || viewMode === 'visits') {
      const visits = (timeline.visits || []).map(visit => ({
        ...visit,
        type: 'visit',
        sortTime: new Date(visit.start_time).getTime()
      }));
      items = [...items, ...visits];
    }

    if (viewMode === 'all' || viewMode === 'travels') {
      const travels = (timeline.travels || []).map(travel => ({
        ...travel,
        type: 'travel',
        sortTime: new Date(travel.start_time).getTime()
      }));
      items = [...items, ...travels];
    }

    // Sort by start time
    return items.sort((a, b) => a.sortTime - b.sortTime);
  };

  const renderTimelineItem = ({ item }) => {
    const isVisit = item.type === 'visit';
    const isExpanded = expandedItems.has(`${item.type}-${item.id}`);

    return (
      <TouchableOpacity
        style={styles.timelineItem}
        onPress={() => toggleItemExpansion(`${item.type}-${item.id}`)}
        activeOpacity={0.7}
      >
        <Card style={[styles.itemCard, isVisit ? styles.visitCard : styles.travelCard]}>
          <CardContent>
            {/* Header */}
            <View style={styles.itemHeader}>
              <View style={styles.itemTitleRow}>
                <Badge variant={isVisit ? 'success' : 'info'} style={styles.typeBadge}>
                  {isVisit ? '📍 Visit' : '🚗 Travel'}
                </Badge>
                <Text style={styles.timeRange}>
                  {TimelineService.formatTime(item.start_time)} - {TimelineService.formatTime(item.end_time)}
                </Text>
              </View>
              <Text style={styles.duration}>
                {TimelineService.formatDuration(item.duration)}
              </Text>
            </View>

            {/* Location/Travel Info */}
            {isVisit && item.location && (
              <View style={styles.locationInfo}>
                <Text style={styles.locationName}>{item.location.name}</Text>
                {item.location.address && (
                  <Text style={styles.locationAddress}>{item.location.address}</Text>
                )}
              </View>
            )}

            {!isVisit && item.distance && (
              <View style={styles.travelInfo}>
                <Text style={styles.travelDistance}>
                  Distance: {TimelineService.formatDistance(item.distance)}
                </Text>
              </View>
            )}

            {/* Expanded Details */}
            {isExpanded && (
              <View style={styles.expandedDetails}>
                <View style={styles.detailsGrid}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Start Time</Text>
                    <Text style={styles.detailValue}>
                      {TimelineService.formatDateTime(item.start_time)}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>End Time</Text>
                    <Text style={styles.detailValue}>
                      {TimelineService.formatDateTime(item.end_time)}
                    </Text>
                  </View>
                  {isVisit && item.center_latitude && item.center_longitude && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Coordinates</Text>
                      <Text style={styles.detailValue}>
                        {item.center_latitude.toFixed(6)}, {item.center_longitude.toFixed(6)}
                      </Text>
                    </View>
                  )}
                  {!isVisit && item.distance && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Distance</Text>
                      <Text style={styles.detailValue}>
                        {TimelineService.formatDistance(item.distance)}
                      </Text>
                    </View>
                  )}
                </View>
                {/* View on Map Button for visits */}
                {isVisit && item.center_latitude && item.center_longitude && (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={(e) => {
                      e.stopPropagation();
                      handleShowMap(item);
                    }}
                    style={styles.mapButton}
                  >
                    🗺️ View on Map
                  </Button>
                )}
              </View>
            )}

            {/* Expand indicator */}
            <View style={styles.expandIndicator}>
              <Text style={styles.expandText}>
                {isExpanded ? '▲ Tap to collapse' : '▼ Tap for details'}
              </Text>
            </View>
          </CardContent>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderViewModeSelector = () => (
    <Card style={styles.viewModeCard}>
      <CardContent>
        <View style={styles.viewModeButtons}>
          <Button
            variant={viewMode === 'all' ? 'primary' : 'outline'}
            size="sm"
            onPress={() => setViewMode('all')}
            style={styles.viewModeButton}
          >
            All
          </Button>
          <Button
            variant={viewMode === 'visits' ? 'primary' : 'outline'}
            size="sm"
            onPress={() => setViewMode('visits')}
            style={styles.viewModeButton}
          >
            Visits Only
          </Button>
          <Button
            variant={viewMode === 'travels' ? 'primary' : 'outline'}
            size="sm"
            onPress={() => setViewMode('travels')}
            style={styles.viewModeButton}
          >
            Travels Only
          </Button>
        </View>
        <View style={styles.mapToggleContainer}>
          <Button
            variant="outline"
            size="sm"
            onPress={() => handleShowMap()}
            style={styles.mapToggleButton}
          >
            🗺️ View Location Points
          </Button>
        </View>
      </CardContent>
    </Card>
  );

  const renderTimelineStats = () => {
    if (!timeline) return null;

    const filteredData = getFilteredData();
    const visits = filteredData.filter(item => item.type === 'visit');
    const travels = filteredData.filter(item => item.type === 'travel');
    const totalDistance = travels.reduce((sum, travel) => sum + (travel.distance || 0), 0);

    return (
      <Card style={styles.statsCard}>
        <CardContent>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{visits.length}</Text>
              <Text style={styles.statLabel}>Visits</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{travels.length}</Text>
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

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>
        No {viewMode === 'all' ? 'timeline data' : viewMode} found for this date
      </Text>
      <Button
        variant="outline"
        onPress={loadTimelineData}
        style={styles.emptyStateButton}
      >
        🔄 Refresh
      </Button>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading timeline...</Text>
      </SafeAreaView>
    );
  }

  const filteredData = getFilteredData();

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

      {/* View Mode Selector */}
      {renderViewModeSelector()}

      {/* Timeline List */}
      {filteredData.length > 0 ? (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={renderTimelineItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        renderEmptyState()
      )}

      {/* Refresh Button */}
      <Button
        variant="primary"
        onPress={loadTimelineData}
        style={styles.refreshButton}
      >
        🔄 Refresh Data
      </Button>

      {/* Map Modal */}
      <Modal
        visible={mapModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMapModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleContainer}>
              <Text style={styles.modalTitle}>
                {showLocationPoints ? 'Location Points' : 'Visit Location'}
              </Text>
              {selectedVisit?.location?.name && (
                <Text style={styles.modalSubtitle}>{selectedVisit.location.name}</Text>
              )}
              {showLocationPoints && (
                <Text style={styles.modalSubtitle}>
                  {locationPoints.length} points for {formatDate(selectedDate)}
                </Text>
              )}
            </View>
            <Button
              variant="outline"
              size="sm"
              onPress={() => setMapModalVisible(false)}
              style={styles.closeModalButton}
            >
              ✕ Close
            </Button>
          </View>

          {/* Map */}
          {locationPointsLoading ? (
            <View style={styles.mapLoadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.mapLoadingText}>Loading location points...</Text>
            </View>
          ) : showLocationPoints && locationPoints.length > 0 ? (
            <MapView
              style={styles.modalMap}
              region={getLocationPointsRegion()}
              showsUserLocation={true}
              showsMyLocationButton={true}
            >
              {locationPoints.map((point, index) => (
                <Marker
                  key={point.id}
                  coordinate={{
                    latitude: point.latitude,
                    longitude: point.longitude,
                  }}
                  title={`Location ${index + 1}`}
                  description={TimelineService.formatDateTime(point.recorded_at)}
                  pinColor={point.is_moving ? "#3B82F6" : "#10B981"}
                />
              ))}
            </MapView>
          ) : selectedVisit ? (
            <MapView
              style={styles.modalMap}
              region={{
                latitude: selectedVisit.center_latitude,
                longitude: selectedVisit.center_longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              showsUserLocation={true}
              showsMyLocationButton={true}
            >
              <Marker
                coordinate={{
                  latitude: selectedVisit.center_latitude,
                  longitude: selectedVisit.center_longitude,
                }}
                title={selectedVisit.location?.name || 'Visit Location'}
                description={`${TimelineService.formatTime(selectedVisit.start_time)} - ${TimelineService.formatTime(selectedVisit.end_time)}`}
                pinColor="#10B981"
              />
            </MapView>
          ) : (
            <View style={styles.mapLoadingContainer}>
              <Text style={styles.mapLoadingText}>No location data available</Text>
            </View>
          )}

          {/* Visit Details */}
          {selectedVisit && (
            <Card style={styles.modalDetailsCard}>
              <CardContent>
                <View style={styles.modalDetailsRow}>
                  <View style={styles.modalDetailColumn}>
                    <Text style={styles.modalDetailLabel}>Duration</Text>
                    <Text style={styles.modalDetailValue}>
                      {TimelineService.formatDuration(selectedVisit.duration)}
                    </Text>
                  </View>
                  <View style={styles.modalDetailColumn}>
                    <Text style={styles.modalDetailLabel}>Time</Text>
                    <Text style={styles.modalDetailValue}>
                      {TimelineService.formatTime(selectedVisit.start_time)} - {TimelineService.formatTime(selectedVisit.end_time)}
                    </Text>
                  </View>
                </View>
                {selectedVisit.location?.address && (
                  <View style={styles.modalAddressRow}>
                    <Text style={styles.modalDetailLabel}>Address</Text>
                    <Text style={styles.modalDetailValue}>{selectedVisit.location.address}</Text>
                  </View>
                )}
                <View style={styles.modalAddressRow}>
                  <Text style={styles.modalDetailLabel}>Coordinates</Text>
                  <Text style={styles.modalDetailValue}>
                    {selectedVisit.center_latitude.toFixed(6)}, {selectedVisit.center_longitude.toFixed(6)}
                  </Text>
                </View>
              </CardContent>
            </Card>
          )}
        </SafeAreaView>
      </Modal>
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
  viewModeCard: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  viewModeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  viewModeButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  mapToggleContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  mapToggleButton: {
    minWidth: 150,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80, // Space for refresh button and bottom navigation
  },
  timelineItem: {
    marginBottom: 8,
  },
  itemCard: {
    borderRadius: 8,
  },
  visitCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  travelCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  itemHeader: {
    marginBottom: 8,
  },
  itemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  typeBadge: {
    flex: 0,
  },
  timeRange: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  duration: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  locationInfo: {
    marginBottom: 8,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 14,
    color: '#6b7280',
  },
  travelInfo: {
    marginBottom: 8,
  },
  travelDistance: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  expandedDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  detailsGrid: {
    marginBottom: 8,
  },
  detailItem: {
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 8,
  },
  expandText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyStateButton: {
    minWidth: 120,
  },
  refreshButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  mapButton: {
    marginTop: 8,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitleContainer: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  closeModalButton: {
    marginLeft: 16,
  },
  modalMap: {
    flex: 1,
  },
  modalDetailsCard: {
    margin: 16,
    marginTop: 8,
  },
  modalDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalDetailColumn: {
    flex: 1,
    marginHorizontal: 4,
  },
  modalAddressRow: {
    marginBottom: 8,
  },
  modalDetailLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 2,
  },
  modalDetailValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  mapLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  mapLoadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default TimelineListScreen;
