'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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

  // Stable invalidateSize helper
  const invalidate = useCallback(() => {
    mapRef.current?.invalidateSize();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const container = mapContainerRef.current;

    import('leaflet').then((L) => {
      // Fix default icon path issue with bundlers
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;

      const nycBounds = L.latLngBounds(NYC_BOUNDS[0], NYC_BOUNDS[1]);

      const map = L.map(container, {
        center: NYU_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        boxZoom: false,
        keyboard: true,
        dragging: true,
        maxBounds: nycBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 13,
        maxZoom: 18,
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

      // Force resize at multiple points to handle any layout timing
      requestAnimationFrame(() => map.invalidateSize());
      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 400);
    });

    // ResizeObserver: call invalidateSize whenever the container resizes
    const ro = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Also invalidate when the window resizes (orientation change, etc.)
  useEffect(() => {
    window.addEventListener('resize', invalidate);
    return () => window.removeEventListener('resize', invalidate);
  }, [invalidate]);

  // Update markers when statuses change OR when map becomes ready
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    import('leaflet').then((L) => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

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
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}
