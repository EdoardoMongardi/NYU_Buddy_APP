'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
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
  const pendingSyncRef = useRef(false);

  // Debug state — visible on the map for diagnosis
  const [debugInfo, setDebugInfo] = useState('init');

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
    if (!map) {
      console.warn('[MapboxMap] syncMarkers: no map ref');
      pendingSyncRef.current = true;
      return;
    }
    if (!mapLoaded.current) {
      console.warn('[MapboxMap] syncMarkers: map not loaded yet — will retry on load');
      pendingSyncRef.current = true;
      return;
    }

    const data = statusesRef.current;
    const uid = currentUidRef.current;
    const markers = markersRef.current;

    console.log(`[MapboxMap] syncMarkers: ${data.length} statuses, ${markers.size} existing markers, uid=${uid}`);
    if (data.length > 0) {
      console.log('[MapboxMap] First status:', JSON.stringify(data[0]));
    }

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
    let created = 0;
    let updated = 0;
    for (const status of data) {
      const isMe = status.uid === uid;
      const existing = markers.get(status.uid);

      if (existing) {
        existing.marker.setLngLat([status.lng, status.lat]);
        const emojiSpan = existing.el.querySelector('.emoji-pin-emoji');
        if (emojiSpan && emojiSpan.textContent !== (status.emoji || '📍')) {
          emojiSpan.textContent = status.emoji || '📍';
        }
        updated++;
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
        created++;
      }
    }

    const msg = `data=${data.length} created=${created} updated=${updated} total=${markers.size}`;
    console.log(`[MapboxMap] syncMarkers done: ${msg}`);
    setDebugInfo(msg);
    pendingSyncRef.current = false;
  }, [createMarkerEl]);

  // ── Initialise map (once, on first visible) ──
  useEffect(() => {
    if (!visible) {
      console.log('[MapboxMap] init: not visible, skipping');
      return;
    }
    if (mapRef.current) {
      console.log('[MapboxMap] init: map already exists, skipping');
      return;
    }
    if (!containerRef.current) {
      console.warn('[MapboxMap] init: no container ref!');
      return;
    }
    if (!mapboxgl.accessToken) {
      console.error('[MapboxMap] init: missing NEXT_PUBLIC_MAPBOX_TOKEN');
      setDebugInfo('ERROR: no Mapbox token');
      return;
    }

    console.log('[MapboxMap] init: creating new map');
    setDebugInfo('creating map…');

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
      console.log('[MapboxMap] map style loaded');

      // Subtle style customisation
      try {
        if (map.getLayer('water')) {
          map.setPaintProperty('water', 'fill-color', '#d6e6f5');
        }
        if (map.getLayer('building')) {
          map.setPaintProperty('building', 'fill-color', '#e8e4ef');
          map.setPaintProperty('building', 'fill-opacity', 0.45);
        }
      } catch {
        // non-critical
      }

      // ── TEST MARKER: hardcoded pin at NYU to verify markers work ──
      const testEl = document.createElement('div');
      testEl.className = 'emoji-pin';
      testEl.innerHTML = '<span class="emoji-pin-emoji">🏫</span>';
      new mapboxgl.Marker({ element: testEl, anchor: 'center' })
        .setLngLat(NYU_CENTER)
        .addTo(map);
      console.log('[MapboxMap] TEST MARKER added at NYU center');

      // Sync real data
      syncMarkers();

      // Belt-and-suspenders: if a sync was queued before load, run it now
      if (pendingSyncRef.current) {
        console.log('[MapboxMap] Running pending sync after load');
        syncMarkers();
      }
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
    console.log(`[MapboxMap] statuses prop changed: ${statuses.length} items, mapLoaded=${mapLoaded.current}`);
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div
        ref={containerRef}
        className="mapbox-container"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Temporary debug overlay — remove after confirming fix */}
      <div
        style={{
          position: 'fixed',
          top: 8,
          right: 8,
          background: 'rgba(0,0,0,0.7)',
          color: '#0f0',
          fontSize: 10,
          fontFamily: 'monospace',
          padding: '4px 8px',
          borderRadius: 6,
          zIndex: 99999,
          pointerEvents: 'none',
          maxWidth: 200,
          wordBreak: 'break-all',
        }}
      >
        {debugInfo}
      </div>
    </div>
  );
}
