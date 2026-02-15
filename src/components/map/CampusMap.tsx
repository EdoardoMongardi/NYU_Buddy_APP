'use client';

import { useEffect, useRef } from 'react';
import { MapStatusNearby } from '@/lib/firebase/functions';

// Leaflet CSS loaded via <link> in layout or dynamically
// We use the global L object since leaflet doesn't play well with SSR

interface CampusMapProps {
  statuses: MapStatusNearby[];
  currentUid?: string;
}

// NYU Washington Square campus center
const NYU_CENTER: [number, number] = [40.7295, -73.9965];
const DEFAULT_ZOOM = 15;

export default function CampusMap({ statuses, currentUid }: CampusMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Dynamic import to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix default marker icons
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const map = L.map(mapContainerRef.current!, {
        center: NYU_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Force resize after render
      setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when statuses change
  useEffect(() => {
    if (!mapRef.current) return;

    import('leaflet').then((L) => {
      // Clear existing markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Add new markers
      statuses.forEach((status) => {
        const isOwn = status.uid === currentUid;
        const color = isOwn ? '#7c3aed' : '#3b82f6';

        const marker = L.circleMarker([status.lat, status.lng], {
          radius: isOwn ? 10 : 8,
          fillColor: color,
          fillOpacity: 0.9,
          color: '#fff',
          weight: 2,
        }).addTo(mapRef.current!);

        marker.bindPopup(
          `<div style="text-align:center;">
            <strong style="font-size:13px;">${status.statusText}</strong>
          </div>`,
          { closeButton: false }
        );

        marker.on('mouseover', () => marker.openPopup());

        markersRef.current.push(marker);
      });
    });
  }, [statuses, currentUid]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full rounded-2xl overflow-hidden"
      style={{ minHeight: '300px' }}
    />
  );
}
