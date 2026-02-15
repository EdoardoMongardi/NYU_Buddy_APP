'use client';

import { useEffect, useRef, useState } from 'react';
import { MapStatusNearby } from '@/lib/firebase/functions';

interface CampusMapProps {
  statuses: MapStatusNearby[];
  currentUid?: string;
}

// NYU Washington Square campus center
const NYU_CENTER: [number, number] = [40.7295, -73.9965];
// Zoom 16 = ~4 block radius around NYU, ideal for campus activity
const FIXED_ZOOM = 16;

// Tight bounds around lower Manhattan / NYU area — user can pan a bit but not leave NYC
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [40.70, -74.02], // southwest
  [40.76, -73.97], // northeast
];

export default function CampusMap({ statuses, currentUid }: CampusMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      const nycBounds = L.latLngBounds(NYC_BOUNDS[0], NYC_BOUNDS[1]);

      const map = L.map(mapContainerRef.current!, {
        center: NYU_CENTER,
        zoom: FIXED_ZOOM,
        zoomControl: false,          // no zoom buttons
        attributionControl: false,
        scrollWheelZoom: false,       // disable scroll zoom
        doubleClickZoom: false,       // disable double-click zoom
        touchZoom: false,             // disable pinch zoom
        boxZoom: false,               // disable box zoom
        keyboard: false,              // disable keyboard zoom
        dragging: true,               // allow panning only
        maxBounds: nycBounds,
        maxBoundsViscosity: 1.0,
        minZoom: FIXED_ZOOM,
        maxZoom: FIXED_ZOOM,
      });

      // Carto Voyager — colorful, modern tiles
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          subdomains: 'abcd',
          maxZoom: 19,
        }
      ).addTo(map);

      mapRef.current = map;
      setMapReady(true);

      // Force resize multiple times to handle any layout timing issues
      setTimeout(() => map.invalidateSize(), 0);
      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 300);
      setTimeout(() => map.invalidateSize(), 600);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when statuses change OR when map becomes ready
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    import('leaflet').then((L) => {
      // Clear existing markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Add new markers
      statuses.forEach((status) => {
        const isOwn = status.uid === currentUid;
        const color = isOwn ? '#7c3aed' : '#3b82f6';

        const marker = L.circleMarker([status.lat, status.lng], {
          radius: isOwn ? 12 : 9,
          fillColor: color,
          fillOpacity: 0.9,
          color: '#fff',
          weight: 2.5,
        }).addTo(mapRef.current!);

        // Pulsing ring for own dot
        if (isOwn) {
          const ring = L.circleMarker([status.lat, status.lng], {
            radius: 18,
            fillColor: color,
            fillOpacity: 0.15,
            color: color,
            weight: 1.5,
            opacity: 0.4,
          }).addTo(mapRef.current!);
          markersRef.current.push(ring);
        }

        marker.bindPopup(
          `<div style="text-align:center;padding:2px 4px;">
            <strong style="font-size:13px;">${status.statusText}</strong>
            ${isOwn ? '<br><span style="font-size:11px;color:#888;">You</span>' : ''}
          </div>`,
          { closeButton: false, offset: L.point(0, -4) }
        );

        marker.on('click', () => marker.openPopup());

        markersRef.current.push(marker);
      });
    });
  }, [statuses, currentUid, mapReady]);

  return (
    <div
      ref={mapContainerRef}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}
