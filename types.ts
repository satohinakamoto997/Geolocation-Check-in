
export interface LocationPoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface CheckInRecord {
  pointId: number;
  timestamp: string;
  photoUrl: string;
}

export interface AppState {
  points: LocationPoint[];
  currentLocation: UserLocation | null;
  checkIns: CheckInRecord[];
  isCameraOpen: boolean;
  selectedPointId: number | null;
  isLoading: boolean;
  error: string | null;
}
