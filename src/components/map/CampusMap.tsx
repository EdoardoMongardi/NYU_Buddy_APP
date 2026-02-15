'use client';

import { useEffect, useRef, useState } from 'react';
import { MapStatusNearby } from '@/lib/firebase/functions';

interface CampusMapProps {
  statuses: MapStatusNearby[];
  currentUid?: string;
}

// NYU Washington Square campus center
const NYU_CENTER: [number, number] = [40.7295, -73.9965];
const DEFAULT_ZOOM = 15;

// Full NYC metro bounds — tiles always fill the viewport
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [40.48, -74.28], // southwest
  [40.92, -73.68], // northeast
];

export default function CampusMap({ statuses, currentUid }: CampusMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      // Fix default icon path issue with bundlers
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;

      const nycBounds = L.latLngBounds(NYC_BOUNDS[0], NYC_BOUNDS[1]);

      const map = L.map(mapContainerRef.current!, {
        center: NYU_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,           // no +/- buttons, cleaner UI
        attributionControl: false,
        scrollWheelZoom: true,        // allow scroll zoom
        doubleClickZoom: true,        // allow double-click zoom
        touchZoom: true,              // allow pinch zoom
        boxZoom: false,               // not useful on mobile
        keyboard: true,
        dragging: true,
        maxBounds: nycBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 13,                  // roughly all of Manhattan
        maxZoom: 18,                  // street-level detail
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
      setTimeout(() => map.invalidateSize(), 150);
      setTimeout(() => map.invalidateSize(), 500);
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
        const emoji = status.emoji || '📍';

        const icon = L.divIcon({
          html: `<span class="emoji-marker-icon">${emoji}</span>`,
          className: 'emoji-marker',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20],
        });

        const marker = L.marker([status.lat, status.lng], { icon }).addTo(
          mapRef.current!
        );

        marker.bindPopup(
          `<div style="text-align:center;padding:4px 8px;min-width:80px;">
            <div style="font-size:22px;line-height:1;">${emoji}</div>
            <div style="font-size:13px;font-weight:600;margin-top:4px;color:#1f2937;">${status.statusText}</div>
            ${isOwn ? '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">You</div>' : ''}
          </div>`,
          { closeButton: false, className: 'emoji-popup' }
        );

        marker.on('click', () => marker.openPopup());

        markersRef.current.push(marker);
      });
    });
  }, [statuses, currentUid, mapReady]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100vw', height: '100dvh' }}
    />
  );
}
