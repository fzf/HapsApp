export interface TrackPoint {
  latitude: number;
  longitude: number;
  speed: number | null;      // m/s, may be -1/null for unknown
  heading?: number | null;
  recorded_at?: string;      // ISO8601
}

export interface SuggestedLocation {
  id: number;
  name: string | null;
  address: string | null;
  city?: string | null;
  state?: string | null;
  latitude: number;
  longitude: number;
  rank: number;
  providers: string[];
}

export interface TimelineLocation {
  id: number;
  name: string | null;
  address: string | null;
  city?: string | null;
  state?: string | null;
  latitude: number;
  longitude: number;
}

export interface TimelineVisit {
  id: number;
  type: 'visit';
  start_time: string;
  end_time: string | null;
  duration: number | null;        // seconds
  center_latitude: number | null;
  center_longitude: number | null;
  radius?: number | null;         // meters
  location: TimelineLocation | null;
  suggested_locations?: SuggestedLocation[];
  gps_gap?: boolean;
  location_source?: string;
  location_confidence_score?: number;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface TimelineTravel {
  id: number;
  type: 'travel';
  start_time: string;
  end_time: string | null;
  duration: number | null;
  distance: number | null;        // kilometers
  center_latitude: number | null;
  center_longitude: number | null;
  mode?: 'walking' | 'cycling' | 'driving' | 'unknown';
  geometry_source?: 'matched' | 'raw';
  geometry?: GeoPoint[] | null;   // street-snapped, visit-anchored polyline
  track_points?: TrackPoint[];
}

export type TimelineItem = TimelineVisit | TimelineTravel;

export interface TimelineDay {
  date?: string;
  timezone?: string;              // IANA
  visits: TimelineVisit[];
  travels: TimelineTravel[];
  fromCache?: boolean;
}

export interface MatchedVisitRef {
  visit_id: number;
  confidence: number;
  confidence_label: string;
  method: string;
  verified: boolean;
}

export interface Purchase {
  id: number;
  name: string;
  merchant: string | null;
  amount: number;
  currency: string;
  purchased_at: string;
  category?: string | null;
  matched_visit: MatchedVisitRef | null;
}

export interface LocationPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  timeline_id: number | null;
}

export interface GeocodeResponse {
  message: string;
  visit: TimelineVisit;
}

export interface ReprocessResponse {
  message: string;
  processed_count: number;
  visits_count: number | null;
  travels_count: number | null;
}
