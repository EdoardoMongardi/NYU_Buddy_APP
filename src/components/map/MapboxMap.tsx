'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapStatusNearby } from '@/lib/firebase/functions';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// NYU Washington Square campus center
const NYU_CENTER: [number, number] = [-73.9965, 40.7295];
const DEFAULT_ZOOM = 14.5;
const DEFAULT_PITCH = 45;

// Full NYC metro bounds [sw, ne] in [lng, lat] order
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.28, 40.48],
  [-73.68, 40.92],
];

const SOURCE_ID = 'statuses';
const LAYER_CLUSTERS = 'cluster-circles';
const LAYER_CLUSTER_COUNT = 'cluster-count';
const LAYER_EMOJI_BG = 'emoji-bg';
const LAYER_EMOJI_PINS = 'emoji-pins';

interface MapboxMapProps {
  statuses: MapStatusNearby[];
  currentUid?: string;
  selectedId: string | null;
  onSelectStatus: (status: MapStatusNearby | null) => void;
  visible: boolean;
}

function toGeoJSON(
  statuses: MapStatusNearby[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: statuses.map((s) => ({
      type: 'Feature' as const,
      id: s.uid,
      geometry: {
        type: 'Point' as const,
        coordinates: [s.lng, s.lat],
      },
      properties: {
        uid: s.uid,
        emoji: s.emoji || '📍',
        statusText: s.statusText,
        createdAt: s.createdAt,
        lat: s.lat,
        lng: s.lng,
        expiresAt: s.expiresAt,
      },
    })),
  };
}

export default function MapboxMap({
  statuses,
  currentUid: _currentUid,
  selectedId,
  onSelectStatus,
  visible,
}: MapboxMapProps) {
  void _currentUid;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapLoaded = useRef(false);
  const statusesRef = useRef(statuses);
  const onSelectRef = useRef(onSelectStatus);

  statusesRef.current = statuses;
  onSelectRef.current = onSelectStatus;

  // ── Initialize map (once, on first visible) ──
  useEffect(() => {
    if (!visible || mapRef.current || !containerRef.current) return;
    if (!mapboxgl.accessToken) {
      console.warn('[MapboxMap] No NEXT_PUBLIC_MAPBOX_TOKEN set');
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: NYU_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: -15,
      maxBounds: NYC_BOUNDS,
      minZoom: 11,
      maxZoom: 18,
      dragRotate: true,
      pitchWithRotate: true,
      attributionControl: false,
    });

    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right'
    );

    map.on('load', () => {
      mapLoaded.current = true;

      // Add GeoJSON source with clustering
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toGeoJSON([]),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
      });

      // ── Cluster circles ──
      map.addLayer({
        id: LAYER_CLUSTERS,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#7c3aed',
          'circle-opacity': 0.85,
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            18,
            5, 22,
            10, 26,
            25, 32,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // ── Cluster count labels ──
      map.addLayer({
        id: LAYER_CLUSTER_COUNT,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // ── Emoji background circles (white sticker look) ──
      map.addLayer({
        id: LAYER_EMOJI_BG,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 20,
          'circle-color': '#ffffff',
          'circle-opacity': 0.95,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(0,0,0,0.1)',
          'circle-blur': 0,
        },
      });

      // ── Emoji text pins ──
      map.addLayer({
        id: LAYER_EMOJI_PINS,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'emoji'],
          'text-size': 22,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-anchor': 'center',
          'text-offset': [0, 0.05],
        },
      });

      // Populate with initial data
      syncData(map, statusesRef.current);

      // ── Click: emoji pin ──
      map.on('click', LAYER_EMOJI_PINS, (e) => {
        if (!e.features || e.features.length === 0) return;
        const f = e.features[0];
        const props = f.properties!;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];

        const status: MapStatusNearby = {
          uid: props.uid,
          emoji: props.emoji,
          statusText: props.statusText,
          lat: props.lat,
          lng: props.lng,
          createdAt: props.createdAt,
          expiresAt: props.expiresAt,
        };

        onSelectRef.current(status);
        map.easeTo({ center: coords, offset: [0, 100], duration: 400 });
      });

      // Also handle click on the background circle
      map.on('click', LAYER_EMOJI_BG, (e) => {
        if (!e.features || e.features.length === 0) return;
        const f = e.features[0];
        const props = f.properties!;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];

        const status: MapStatusNearby = {
          uid: props.uid,
          emoji: props.emoji,
          statusText: props.statusText,
          lat: props.lat,
          lng: props.lng,
          createdAt: props.createdAt,
          expiresAt: props.expiresAt,
        };

        onSelectRef.current(status);
        map.easeTo({ center: coords, offset: [0, 100], duration: 400 });
      });

      // ── Click: cluster → zoom in ──
      map.on('click', LAYER_CLUSTERS, (e) => {
        if (!e.features || e.features.length === 0) return;
        const coords = (e.features[0].geometry as GeoJSON.Point)
          .coordinates as [number, number];
        map.easeTo({ center: coords, zoom: map.getZoom() + 2, duration: 400 });
      });

      // ── Click: empty area → deselect ──
      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [LAYER_EMOJI_PINS, LAYER_EMOJI_BG, LAYER_CLUSTERS],
        });
        if (features.length === 0) {
          onSelectRef.current(null);
        }
      });

      // ── Cursor ──
      const pointerLayers = [LAYER_EMOJI_PINS, LAYER_EMOJI_BG, LAYER_CLUSTERS];
      pointerLayers.forEach((layer) => {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      });
    });

    mapRef.current = map;

    return () => {
      // Singleton — don't destroy on effect cleanup
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Resize when visibility toggles on ──
  useEffect(() => {
    if (visible && mapRef.current) {
      requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    }
  }, [visible]);

  // ── Sync data to GeoJSON source (no Canvas, no image registration needed) ──
  const syncData = useCallback(
    (map: mapboxgl.Map, data: MapStatusNearby[]) => {
      if (!mapLoaded.current) return;
      const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(toGeoJSON(data));
      }
    },
    []
  );

  useEffect(() => {
    if (mapRef.current && mapLoaded.current) {
      syncData(mapRef.current, statuses);
    }
  }, [statuses, syncData]);

  // ── Update selected pin style ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded.current) return;
    if (!map.getLayer(LAYER_EMOJI_BG) || !map.getLayer(LAYER_EMOJI_PINS)) return;

    if (selectedId) {
      // Background: selected pin gets violet ring + larger
      map.setPaintProperty(LAYER_EMOJI_BG, 'circle-radius', [
        'case', ['==', ['get', 'uid'], selectedId], 24, 20,
      ]);
      map.setPaintProperty(LAYER_EMOJI_BG, 'circle-stroke-width', [
        'case', ['==', ['get', 'uid'], selectedId], 3, 1.5,
      ]);
      map.setPaintProperty(LAYER_EMOJI_BG, 'circle-stroke-color', [
        'case', ['==', ['get', 'uid'], selectedId], '#7c3aed', 'rgba(0,0,0,0.1)',
      ]);
      // Emoji text: selected is larger
      map.setLayoutProperty(LAYER_EMOJI_PINS, 'text-size', [
        'case', ['==', ['get', 'uid'], selectedId], 28, 22,
      ]);
    } else {
      // Reset to defaults
      map.setPaintProperty(LAYER_EMOJI_BG, 'circle-radius', 20);
      map.setPaintProperty(LAYER_EMOJI_BG, 'circle-stroke-width', 1.5);
      map.setPaintProperty(LAYER_EMOJI_BG, 'circle-stroke-color', 'rgba(0,0,0,0.1)');
      map.setLayoutProperty(LAYER_EMOJI_PINS, 'text-size', 22);
    }
  }, [selectedId]);

  // Clean up map on full unmount (logout)
  useEffect(() => {
    return () => {
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
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}
