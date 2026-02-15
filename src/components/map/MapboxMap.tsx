'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapStatusNearby } from '@/lib/firebase/functions';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const NYU_CENTER: [number, number] = [-73.9965, 40.7295];
const DEFAULT_ZOOM = 14.5;

const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.28, 40.48],
  [-73.68, 40.92],
];

interface Props {
  statuses: MapStatusNearby[];
  currentUid?: string;
  selectedId: string | null;
  onSelectStatus: (status: MapStatusNearby | null) => void;
  visible: boolean;
}

interface MarkerEntry {
  marker: mapboxgl.Marker;
  el: HTMLDivElement;
}

export default function MapboxMap({
  statuses,
  currentUid,
  selectedId,
  onSelectStatus,
  visible,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapLoaded = useRef(false);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const statusLookup = useRef<Map<string, MapStatusNearby>>(new Map());

  // Keep latest values in refs for use inside stable callbacks
  const onSelectRef = useRef(onSelectStatus);
  const statusesRef = useRef(statuses);
  const currentUidRef = useRef(currentUid);
  onSelectRef.current = onSelectStatus;
  statusesRef.current = statuses;
  currentUidRef.current = currentUid;

  // ── Create a single marker DOM element ──
  const createMarkerEl = useCallback(
    (emoji: string, isMe: boolean): HTMLDivElement => {
      const el = document.createElement('div');
      el.className = 'emoji-pin';
      if (isMe) el.classList.add('emoji-pin-me');

      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'emoji-pin-emoji';
      emojiSpan.textContent = emoji || '📍';
      el.appendChild(emojiSpan);

      if (isMe) {
        const badge = document.createElement('span');
        badge.className = 'emoji-pin-badge';
        badge.textContent = 'You';
        el.appendChild(badge);
      }

      return el;
    },
    []
  );

  // ── Sync markers to match current statuses data ──
  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded.current) return;

    const data = statusesRef.current;
    const uid = currentUidRef.current;
    const markers = markersRef.current;

    // Build latest lookup
    const newLookup = new Map(data.map((s) => [s.uid, s]));
    statusLookup.current = newLookup;

    // Remove markers whose uid is no longer in the data
    Array.from(markers.entries()).forEach(([key, entry]) => {
      if (!newLookup.has(key)) {
        entry.marker.remove();
        markers.delete(key);
      }
    });

    // Add or update
    for (const status of data) {
      const isMe = status.uid === uid;
      const existing = markers.get(status.uid);

      if (existing) {
        // Update position
        existing.marker.setLngLat([status.lng, status.lat]);
        // Update emoji text if changed
        const emojiSpan = existing.el.querySelector('.emoji-pin-emoji');
        if (emojiSpan && emojiSpan.textContent !== (status.emoji || '📍')) {
          emojiSpan.textContent = status.emoji || '📍';
        }
      } else {
        // Create new marker
        const el = createMarkerEl(status.emoji, isMe);

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const latest = statusLookup.current.get(status.uid);
          if (latest) {
            onSelectRef.current(latest);
            map.easeTo({
              center: [latest.lng, latest.lat],
              offset: [0, 80],
              duration: 350,
            });
          }
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([status.lng, status.lat])
          .addTo(map);

        markers.set(status.uid, { marker, el });
      }
    }

    if (data.length > 0) {
      console.log(`[MapboxMap] Synced ${data.length} emoji marker(s)`);
    }
  }, [createMarkerEl]);

  // ── Initialise map (once, on first visible) ──
  useEffect(() => {
    if (!visible || mapRef.current || !containerRef.current) return;
    if (!mapboxgl.accessToken) {
      console.warn('[MapboxMap] Missing NEXT_PUBLIC_MAPBOX_TOKEN');
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: NYU_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
      maxBounds: NYC_BOUNDS,
      minZoom: 11,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    });

    // Disable rotation via multi-touch while keeping pinch-zoom
    map.touchZoomRotate.disableRotation();

    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right'
    );

    map.on('load', () => {
      mapLoaded.current = true;
      console.log('[MapboxMap] Style loaded — syncing markers');

      // Subtle style customisation to feel more cohesive with the app
      try {
        // Slightly warmer water colour
        if (map.getLayer('water')) {
          map.setPaintProperty('water', 'fill-color', '#d6e6f5');
        }
        // Softer building outlines
        if (map.getLayer('building')) {
          map.setPaintProperty('building', 'fill-color', '#e8e4ef');
          map.setPaintProperty('building', 'fill-opacity', 0.45);
        }
      } catch {
        // Non-critical — style layers may differ between versions
      }

      // Initial sync
      syncMarkers();
    });

    // Click empty map area → deselect
    map.on('click', () => {
      onSelectRef.current(null);
    });

    mapRef.current = map;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Resize when visibility toggles ──
  useEffect(() => {
    if (visible && mapRef.current) {
      requestAnimationFrame(() => mapRef.current?.resize());
    }
  }, [visible]);

  // ── Re-sync markers when statuses data changes ──
  useEffect(() => {
    syncMarkers();
  }, [statuses, syncMarkers]);

  // ── Update selected CSS class without re-creating markers ──
  useEffect(() => {
    markersRef.current.forEach(({ el }, uid) => {
      el.classList.toggle('emoji-pin-selected', uid === selectedId);
    });
  }, [selectedId]);

  // ── Cleanup on full unmount (e.g. logout) ──
  useEffect(() => {
    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapLoaded.current = false;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="mapbox-container"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}
