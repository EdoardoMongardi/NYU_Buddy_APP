'use client';

import { useEffect, useRef } from 'react';
import { MapStatusNearby } from '@/lib/firebase/functions';

interface CampusMapProps {
  statuses: MapStatusNearby[];
  currentUid?: string;
}

// NYU Washington Square campus center
const NYU_CENTER: [number, number] = [40.7295, -73.9965];
const DEFAULT_ZOOM = 15;

// Bounding box: restrict panning to roughly the NYC area
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [40.48, -74.28], // southwest corner
  [40.92, -73.68], // northeast corner
];

export default function CampusMap({ statuses, currentUid }: CampusMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      const nycBounds = L.latLngBounds(NYC_BOUNDS[0], NYC_BOUNDS[1]);

      const map = L.map(mapContainerRef.current!, {
        center: NYU_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        attributionControl: false, // hide default attribution for cleaner look
        minZoom: 12,              // don't zoom out beyond NYC
        maxZoom: 18,
        maxBounds: nycBounds,     // restrict panning to NYC
        maxBoundsViscosity: 1.0,  // hard stop at the boundary (no elastic drag)
      });

      // Carto Voyager — colorful, modern vector-style tiles (free, no API key)
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 19,
        }
      ).addTo(map);

      // Small, subtle attribution in the corner
      L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

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
