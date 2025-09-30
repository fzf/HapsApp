import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, FlatList, SafeAreaView, TouchableOpacity, Modal } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { useAuth } from '../AuthContext';
import TimelineService from '../services/TimelineService';
import { VisitTrackingService } from '../services';
import Button from './Button';
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { Badge } from './Badge';

const TimelineListScreen = () => {
  const [timeline, setTimeline] = useState(null);
  const [localVisits, setLocalVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [viewMode, setViewMode] = useState('all'); // 'all', 'visits', 'travels', 'local_visits'
  const [showLocalVisits, setShowLocalVisits] = useState(false);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const { token } = useAuth();

  useEffect(() => {
    if (showLocalVisits) {
      loadLocalVisits();
    } else {
      loadTimelineData();
    }
  }, [selectedDate, token, showLocalVisits]);

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
    } catch (error) {
      console.error('Failed to load timeline data:', error);
      Alert.alert('Error', 'Failed to load timeline data');
    } finally {
      setLoading(false);
    }
  };

  const loadLocalVisits = async () => {
    try {
      setLoading(true);
      const hoursBack = 24;
      const visits = await VisitTrackingService.getRecentVisits(hoursBack);
      setLocalVisits(visits);
    } catch (error) {
      console.error('Failed to load local visits:', error);
      Alert.alert('Error', 'Failed to load local visits');
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

  const handleShowMap = (visit) => {
    if (visit.center_latitude && visit.center_longitude) {
      setSelectedVisit(visit);
      setMapModalVisible(true);
    } else {
      Alert.alert('No Location Data', 'This visit does not have location coordinates available.');
    }
  };

  const getFilteredData = () => {
    if (showLocalVisits) {
      if (viewMode === 'all' || viewMode === 'local_visits') {
        return localVisits.map(visit => ({
          ...visit,
          type: 'local_visit',
          center_latitude: visit.latitude,
          center_longitude: visit.longitude,
          start_time: visit.startTime,
          end_time: visit.endTime,
          sortTime: visit.startTime ? visit.startTime.getTime() : Date.now()
        })).sort((a, b) => b.sortTime - a.sortTime); // Recent first for local visits
      }
      return [];
    }

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
    const isLocalVisit = item.type === 'local_visit';
    const isTravel = item.type === 'travel';
    const isExpanded = expandedItems.has(`${item.type}-${item.id}`);

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
      <TouchableOpacity
        style={styles.timelineItem}
        onPress={() => toggleItemExpansion(`${item.type}-${item.id}`)}
        activeOpacity={0.7}
      >
        <Card style={[styles.itemCard, 
          isLocalVisit ? styles.localVisitCard : 
          isVisit ? styles.visitCard : styles.travelCard]}>
          <CardContent>
            {/* Header */}
            <View style={styles.itemHeader}>
              <View style={styles.itemTitleRow}>
                <Badge variant={
                  isLocalVisit ? 'warning' : 
                  isVisit ? 'success' : 'info'
                } style={styles.typeBadge}>
                  {isLocalVisit ? '🔵 Local Visit' : isVisit ? '📍 Visit' : '🚗 Travel'}
                </Badge>
                <Text style={styles.timeRange}>
                  {formatTime(item.start_time)} - {item.end_time ? formatTime(item.end_time) : 'Ongoing'}
                </Text>
              </View>
              <Text style={styles.duration}>
                {formatDuration(item.duration)}
              </Text>
            </View>

            {/* Location/Travel Info */}
            {(isVisit || isLocalVisit) && item.location && (
              <View style={styles.locationInfo}>
                <Text style={styles.locationName}>{item.location.name}</Text>
                {item.location.address && (
                  <Text style={styles.locationAddress}>{item.location.address}</Text>
                )}
              </View>
            )}

            {isLocalVisit && (
              <View style={styles.localVisitInfo}>
                <Text style={styles.localVisitDetails}>
                  Confidence: {(item.confidence * 100).toFixed(0)}% • Points: {item.locationCount || 0}
                </Text>
              </View>
            )}

            {isTravel && item.distance && (
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
                      {isLocalVisit && item.start_time instanceof Date 
                        ? item.start_time.toLocaleString('en-US') 
                        : TimelineService.formatDateTime(item.start_time)}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>End Time</Text>
                    <Text style={styles.detailValue}>
                      {item.end_time 
                        ? (isLocalVisit && item.end_time instanceof Date 
                          ? item.end_time.toLocaleString('en-US') 
                          : TimelineService.formatDateTime(item.end_time))
                        : 'Ongoing'}
                    </Text>
                  </View>
                  {(isVisit || isLocalVisit) && item.center_latitude && item.center_longitude && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Coordinates</Text>
                      <Text style={styles.detailValue}>
                        {item.center_latitude.toFixed(6)}, {item.center_longitude.toFixed(6)}
                      </Text>
                    </View>
                  )}
                  {isLocalVisit && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Detection Confidence</Text>
                      <Text style={styles.detailValue}>
                        {(item.confidence * 100).toFixed(1)}%
                      </Text>
                    </View>
                  )}
                  {isLocalVisit && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Location Points</Text>
                      <Text style={styles.detailValue}>
                        {item.locationCount || 0} points
                      </Text>
                    </View>
                  )}
                  {isTravel && item.distance && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Distance</Text>
                      <Text style={styles.detailValue}>
                        {TimelineService.formatDistance(item.distance)}
                      </Text>
                    </View>
                  )}
                </View>
                {/* View on Map Button for visits */}
                {(isVisit || isLocalVisit) && item.center_latitude && item.center_longitude && (
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
      </CardContent>
    </Card>
  );

  const renderTimelineStats = () => {
    if (showLocalVisits) {
      const activeVisits = localVisits.filter(v => !v.endTime).length;
      const avgConfidence = localVisits.length > 0 
        ? localVisits.reduce((sum, v) => sum + v.confidence, 0) / localVisits.length 
        : 0;

      return (
        <Card style={styles.statsCard}>
          <CardContent>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{localVisits.length}</Text>
                <Text style={styles.statLabel}>Local Visits</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{activeVisits}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{(avgConfidence * 100).toFixed(0)}%</Text>
                <Text style={styles.statLabel}>Avg Confidence</Text>
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
          
          {/* Data Source Toggle */}
          <View style={styles.viewToggle}>
            <Button
              variant={showLocalVisits ? "primary" : "outline"}
              size="sm"
              onPress={() => {
                setShowLocalVisits(true);
                setViewMode('all');
              }}
            >
              🔵 Local Visits
            </Button>
            <Button
              variant={!showLocalVisits ? "primary" : "outline"}
              size="sm"
              onPress={() => {
                setShowLocalVisits(false);
                setViewMode('all');
              }}
            >
              📊 Server Timeline
            </Button>
          </View>
        </CardContent>
      </Card>

      {/* Timeline Stats */}
      {renderTimelineStats()}

      {/* View Mode Selector */}
      {!showLocalVisits && renderViewModeSelector()}

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
              <Text style={styles.modalTitle}>Visit Location</Text>
              {selectedVisit?.location?.name && (
                <Text style={styles.modalSubtitle}>{selectedVisit.location.name}</Text>
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
          {selectedVisit && (
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
              {selectedVisit.type === 'local_visit' && (
                <Circle
                  center={{
                    latitude: selectedVisit.center_latitude,
                    longitude: selectedVisit.center_longitude,
                  }}
                  radius={150}
                  fillColor="rgba(59, 130, 246, 0.1)"
                  strokeColor="rgba(59, 130, 246, 0.3)"
                  strokeWidth={2}
                />
              )}
              <Marker
                coordinate={{
                  latitude: selectedVisit.center_latitude,
                  longitude: selectedVisit.center_longitude,
                }}
                title={selectedVisit.location?.name || 
                  (selectedVisit.type === 'local_visit' ? 'Local Visit' : 'Visit Location')}
                description={selectedVisit.type === 'local_visit' 
                  ? `${selectedVisit.start_time instanceof Date 
                      ? selectedVisit.start_time.toLocaleTimeString() 
                      : 'Unknown start'} - ${selectedVisit.end_time 
                      ? (selectedVisit.end_time instanceof Date 
                        ? selectedVisit.end_time.toLocaleTimeString() 
                        : 'Unknown end') 
                      : 'Ongoing'}`
                  : `${TimelineService.formatTime(selectedVisit.start_time)} - ${TimelineService.formatTime(selectedVisit.end_time)}`}
                pinColor={selectedVisit.type === 'local_visit' ? "#3B82F6" : "#10B981"}
              />
            </MapView>
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
  localVisitCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  travelCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#6B7280',
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
  localVisitInfo: {
    marginBottom: 8,
  },
  localVisitDetails: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  viewToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
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
});

export default TimelineListScreen;
