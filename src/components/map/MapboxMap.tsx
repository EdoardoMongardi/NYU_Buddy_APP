'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapStatusNearby } from '@/lib/firebase/functions';
import { nyuCampusZones, nyuBuildingPoints } from '@/data/nyuCampus';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// Fallback center (NYU campus) — used while geolocation is resolving
const FALLBACK_CENTER: [number, number] = [-73.9965, 40.7295];
const DEFAULT_ZOOM = 14.5;

const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.28, 40.48],
  [-73.68, 40.92],
];

/** Check if a coordinate is within the NYC bounding box */
function isInNYC(lat: number, lng: number): boolean {
  return (
    lat >= NYC_BOUNDS[0][1] &&
    lat <= NYC_BOUNDS[1][1] &&
    lng >= NYC_BOUNDS[0][0] &&
    lng <= NYC_BOUNDS[1][0]
  );
}

// ─── NYU Map Styling ─────────────────────────────────────────────────────────
// Called once on map load. Uses dynamic layer discovery so it works across
// Mapbox style versions without hardcoded layer IDs.

function applyNyuMapStyle(map: mapboxgl.Map): void {
  const layers = map.getStyle().layers ?? [];

  // ── a) Subtle base-map overrides (dynamic discovery) ──
  for (const layer of layers) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src = (layer as any)['source-layer'] as string | undefined;

    if (
      layer.type === 'fill' &&
      (src === 'landuse' || src === 'landuse_overlay' || src === 'landcover')
    ) {
      try {
        map.setPaintProperty(layer.id, 'fill-color', [
          'match', ['get', 'class'],
          'park', '#d4edda', 'national_park', '#d4edda',
          'grass', '#d4edda', 'scrub', '#dff0df',
          ['coalesce', ['get', 'color'], '#e8e8e0'],
        ]);
      } catch { /* non-critical */ }
    }

    if (layer.type === 'fill' && src === 'water') {
      try { map.setPaintProperty(layer.id, 'fill-color', '#bdd9ee'); } catch { /* skip */ }
    }

    if (layer.type === 'line' && src === 'waterway') {
      try { map.setPaintProperty(layer.id, 'line-color', '#a3cde4'); } catch { /* skip */ }
    }
  }

  // ── b) Find first symbol layer as anchor for z-ordering ──
  let firstSymbolId: string | undefined;
  for (const layer of layers) {
    if (layer.type === 'symbol') { firstSymbolId = layer.id; break; }
  }

  // ── c) NYU campus zone overlays ──
  if (!map.getSource('nyu-zones')) {
    map.addSource('nyu-zones', { type: 'geojson', data: nyuCampusZones });
  }
  if (!map.getLayer('nyu-zone-fill')) {
    map.addLayer(
      {
        id: 'nyu-zone-fill', type: 'fill', source: 'nyu-zones',
        paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.06 }
      },
      firstSymbolId,
    );
  }
  if (!map.getLayer('nyu-zone-outline')) {
    map.addLayer(
      {
        id: 'nyu-zone-outline', type: 'line', source: 'nyu-zones',
        paint: { 'line-color': '#7c3aed', 'line-opacity': 0.18, 'line-width': 1.5 }
      },
      firstSymbolId,
    );
  }

  // ── d) NYU building name labels (violet text + white halo) ──
  // Tier 1 (major) visible at zoom >= 15, Tier 2 at zoom >= 16.5
  if (!map.getSource('nyu-buildings')) {
    map.addSource('nyu-buildings', { type: 'geojson', data: nyuBuildingPoints });
  }
  if (!map.getLayer('nyu-building-labels')) {
    map.addLayer({
      id: 'nyu-building-labels',
      type: 'symbol',
      source: 'nyu-buildings',
      minzoom: 14.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-size': ['match', ['get', 'tier'], 1, 12, 10],
        'text-max-width': 7,
        'text-variable-anchor': ['top', 'bottom', 'left', 'right', 'center'],
        'text-radial-offset': 0.6,
        'text-optional': true,
        'text-allow-overlap': false,
        'symbol-sort-key': ['match', ['get', 'tier'], 1, 0, 1],
        visibility: 'visible',
      },
      paint: {
        'text-color': '#7c3aed',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 0.3,
        'text-opacity': [
          'step', ['zoom'],
          0,
          15, ['match', ['get', 'tier'], 1, 1, 0],
          16.5, 1,
        ],
      },
    });
  }
}

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
  const geolocated = useRef(false);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const statusLookup = useRef<Map<string, MapStatusNearby>>(new Map());
  const pendingSyncRef = useRef(false);

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
    if (!map || !mapLoaded.current) {
      pendingSyncRef.current = true;
      return;
    }

    const data = statusesRef.current;
    const uid = currentUidRef.current;
    const markers = markersRef.current;

    const newLookup = new Map(data.map((s) => [s.uid, s]));
    statusLookup.current = newLookup;

    // Remove stale markers
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
        existing.marker.setLngLat([status.lng, status.lat]);
        const emojiSpan = existing.el.querySelector('.emoji-pin-emoji');
        if (emojiSpan && emojiSpan.textContent !== (status.emoji || '📍')) {
          emojiSpan.textContent = status.emoji || '📍';
        }
      } else {
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

    pendingSyncRef.current = false;
  }, [createMarkerEl]);

  // ── Fly to user's geolocation (called once after map loads) ──
  const flyToUserLocation = useCallback(() => {
    if (geolocated.current) return;
    geolocated.current = true;

    const map = mapRef.current;
    if (!map || !('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (isInNYC(latitude, longitude) && mapRef.current) {
          mapRef.current.flyTo({
            center: [longitude, latitude],
            zoom: DEFAULT_ZOOM,
            duration: 1200,
          });
        }
      },
      () => {
        // Geolocation denied or failed — stay at fallback center
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  // ── Initialise map (once, on first visible) ──
  useEffect(() => {
    if (!visible || mapRef.current || !containerRef.current) return;
    if (!mapboxgl.accessToken) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: FALLBACK_CENTER,
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

    map.touchZoomRotate.disableRotation();

    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right'
    );

    map.on('load', () => {
      mapLoaded.current = true;

      // Apply NYU campus styling (parks, water, zones, building labels)
      try {
        applyNyuMapStyle(map);
      } catch (err) {
        console.warn('[MapboxMap] applyNyuMapStyle failed:', err);
      }

      // Center on user's real location
      flyToUserLocation();

      // Sync emoji markers
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

  // ── Update selected CSS class ──
  useEffect(() => {
    markersRef.current.forEach(({ el }, uid) => {
      el.classList.toggle('emoji-pin-selected', uid === selectedId);
    });
  }, [selectedId]);

  // ── Cleanup on full unmount ──
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
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
