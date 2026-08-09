export interface TrackPoint {
  latitude: number;
  longitude: number;
  speed: number | null;      // m/s, may be -1/null for unknown
  heading?: number | null;
  recorded_at?: string;      // ISO8601
}

export interface TimelineLocation {
  id: number;
  name: string | null;
  address: string | null;
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
  suggested_locations?: TimelineLocation[];
  gps_gap?: boolean;
}

export interface TimelineTravel {
  id: number;
  type: 'travel';
  start_time: string;
  end_time: string | null;
  duration: number | null;
  distance: number | null;        // meters
  center_latitude: number | null;
  center_longitude: number | null;
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
