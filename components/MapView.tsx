
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { LocationPoint, UserLocation } from '../types';

interface MapViewProps {
  points: LocationPoint[];
  userLocation: UserLocation | null;
  onSelectPoint: (id: number) => void;
  selectedPointId: number | null;
  checkInRadius: number;
}

const MapView: React.FC<MapViewProps> = ({ points, userLocation, onSelectPoint, selectedPointId, checkInRadius }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: number]: L.Marker }>({});
  const circlesRef = useRef<{ [key: number]: L.Circle }>({});
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = 13.7735;
    const initialLng = 100.6120;

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: false, 
      attributionControl: false
    }).setView([initialLat, initialLng], 17);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Points Markers and Circles
  useEffect(() => {
    if (!mapRef.current) return;

    // ล้างของเก่า
    (Object.values(markersRef.current) as L.Marker[]).forEach(marker => marker.remove());
    markersRef.current = {};
    (Object.values(circlesRef.current) as L.Circle[]).forEach(circle => circle.remove());
    circlesRef.current = {};

    points.forEach((point, index) => {
      // สร้างวงกลมรัศมีเช็คอินรอบจุดเป้าหมาย (สีม่วงคราม)
      const circle = L.circle([point.lat, point.lng], {
        radius: checkInRadius,
        color: '#4f46e5',
        fillColor: '#4f46e5',
        fillOpacity: 0.15,
        weight: 2,
        dashArray: '5, 8'
      }).addTo(mapRef.current!);
      circlesRef.current[point.id] = circle;

      // สร้าง Marker
      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: 'custom-div-icon',
          html: `<div class="w-8 h-8 bg-indigo-600 rounded-full border-2 border-white flex items-center justify-center text-white font-bold shadow-lg transition-transform hover:scale-110">${index + 1}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      })
      .addTo(mapRef.current!)
      .on('click', () => onSelectPoint(point.id));

      markersRef.current[point.id] = marker;
    });

    // ถ้าไม่มีจุดที่เลือก ให้ซูมดูภาพรวม
    if (points.length > 0 && !selectedPointId) {
      const group = L.featureGroup(Object.values(circlesRef.current));
      mapRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  }, [points, onSelectPoint, checkInRadius]);

  // Update User Location Marker (Auto-Focus removed as requested)
  useEffect(() => {
    if (userLocation && mapRef.current) {
      const { lat, lng } = userLocation;
      
      // Marker ตัวตนผู้ใช้
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([lat, lng]);
      } else {
        userMarkerRef.current = L.marker([lat, lng], {
          zIndexOffset: 1000,
          icon: L.divIcon({
            className: 'user-icon',
            html: `<div class="relative w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-lg"><div class="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-75"></div></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }).addTo(mapRef.current);
      }

      // NO AUTOMATIC PAN/ZOOM TO USER POSITION
      // The map will no longer auto-follow the user based on GPS updates.
    }
  }, [userLocation]);

  // ซูมเข้าหาจุดเป้าหมายที่เลือก
  useEffect(() => {
    if (selectedPointId && circlesRef.current[selectedPointId] && mapRef.current) {
      const circle = circlesRef.current[selectedPointId];
      mapRef.current.fitBounds(circle.getBounds().pad(0.2), {
        animate: true,
        duration: 1,
        maxZoom: 18
      });
    }
  }, [selectedPointId]);

  // ฟังก์ชันโฟกัสไปที่ตำแหน่งปัจจุบันของผู้ใช้
  const handleZoomToUser = () => {
    if (userLocation && mapRef.current) {
      const bounds = L.latLng([userLocation.lat, userLocation.lng]).toBounds(checkInRadius * 2.5);
      mapRef.current.fitBounds(bounds, {
        animate: true,
        duration: 0.8,
        maxZoom: 18
      });
    }
  };

  return (
    <div className="w-full h-full relative overflow-hidden rounded-xl shadow-inner border border-slate-200">
      <div ref={mapContainerRef} className="w-full h-full" />
      
      {/* ปุ่มดึงกลับมาที่ตำแหน่งปัจจุบัน (Location Button) */}
      {userLocation && mapRef.current && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            handleZoomToUser();
          }}
          className="absolute bottom-6 right-6 z-[100] w-14 h-14 bg-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 flex items-center justify-center active:scale-90 transition-all hover:bg-slate-50"
          title="Zoom to my location"
        >
          <div className="relative">
            <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white animate-pulse"></div>
          </div>
        </button>
      )}
    </div>
  );
};

export default MapView;
