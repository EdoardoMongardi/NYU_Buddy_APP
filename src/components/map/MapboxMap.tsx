'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapStatusNearby } from '@/lib/firebase/functions';
import { ensureEmojiImages, emojiImageName } from '@/lib/utils/emojiSprite';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// NYU Washington Square campus center
const NYU_CENTER: [number, number] = [-73.9965, 40.7295];
const DEFAULT_ZOOM = 14.5;

// Full NYC metro bounds [sw, ne] in [lng, lat] order
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.28, 40.48],
  [-73.68, 40.92],
];

const SOURCE_ID = 'statuses';
const LAYER_CLUSTERS = 'cluster-circles';
const LAYER_CLUSTER_COUNT = 'cluster-count';
const LAYER_EMOJI_PINS = 'emoji-pins';

interface MapboxMapProps {
  statuses: MapStatusNearby[];
  currentUid?: string;
  selectedId: string | null;
  onSelectStatus: (status: MapStatusNearby | null) => void;
  visible: boolean;
}

/**
 * Build a GeoJSON FeatureCollection from status data.
 */
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
  currentUid,
  selectedId,
  onSelectStatus,
  visible,
}: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapLoaded = useRef(false);
  const statusesRef = useRef(statuses);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelectStatus);

  // Keep refs in sync
  statusesRef.current = statuses;
  selectedIdRef.current = selectedId;
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
      maxBounds: NYC_BOUNDS,
      minZoom: 11,
      maxZoom: 18,
      pitchWithRotate: false,
      dragRotate: false,
      attributionControl: false,
    });

    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right'
    );

    map.on('load', async () => {
      mapLoaded.current = true;

      // Add empty source
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toGeoJSON([]),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
      });

      // Cluster circles
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
            18, // default
            5, 22,
            10, 26,
            25, 32,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Cluster count labels
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

      // Emoji pin layer (initially with fallback icon)
      map.addLayer({
        id: LAYER_EMOJI_PINS,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['concat', 'emoji_', ['get', 'emoji']],
          'icon-size': 1,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'center',
        },
      });

      // Populate with initial data
      await syncStatuses(map, statusesRef.current);

      // ── Click: emoji pin ──
      map.on('click', LAYER_EMOJI_PINS, (e) => {
        if (!e.features || e.features.length === 0) return;
        const f = e.features[0];
        const props = f.properties!;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [
          number,
          number,
        ];

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

        // Shift map so pin is visible below the info card
        map.easeTo({
          center: coords,
          offset: [0, 100],
          duration: 400,
        });
      });

      // ── Click: cluster → zoom in ──
      map.on('click', LAYER_CLUSTERS, (e) => {
        if (!e.features || e.features.length === 0) return;
        const coords = (e.features[0].geometry as GeoJSON.Point)
          .coordinates as [number, number];
        map.easeTo({
          center: coords,
          zoom: map.getZoom() + 2,
          duration: 400,
        });
      });

      // ── Click: empty area → deselect ──
      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [LAYER_EMOJI_PINS, LAYER_CLUSTERS],
        });
        if (features.length === 0) {
          onSelectRef.current(null);
        }
      });

      // ── Cursor ──
      map.on('mouseenter', LAYER_EMOJI_PINS, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', LAYER_EMOJI_PINS, () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('mouseenter', LAYER_CLUSTERS, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', LAYER_CLUSTERS, () => {
        map.getCanvas().style.cursor = '';
      });
    });

    mapRef.current = map;

    return () => {
      // Do NOT destroy map on unmount — singleton pattern.
      // Only destroy if the entire layout is unmounting (logout).
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

  // ── Sync statuses to GeoJSON source ──
  const syncStatuses = useCallback(
    async (map: mapboxgl.Map, data: MapStatusNearby[]) => {
      if (!mapLoaded.current) return;

      // Ensure all emoji images are registered
      const emojis = data.map((s) => s.emoji || '📍');
      await ensureEmojiImages(map, emojis);

      // Update GeoJSON data
      const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(toGeoJSON(data));
      }
    },
    []
  );

  useEffect(() => {
    if (mapRef.current && mapLoaded.current) {
      syncStatuses(mapRef.current, statuses);
    }
  }, [statuses, syncStatuses]);

  // ── Update selected pin icon size ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded.current) return;
    if (!map.getLayer(LAYER_EMOJI_PINS)) return;

    if (selectedId) {
      map.setLayoutProperty(LAYER_EMOJI_PINS, 'icon-image', [
        'case',
        ['==', ['get', 'uid'], selectedId],
        ['concat', 'emoji_', ['get', 'emoji'], '_selected'],
        ['concat', 'emoji_', ['get', 'emoji']],
      ]);
      map.setLayoutProperty(LAYER_EMOJI_PINS, 'icon-size', [
        'case',
        ['==', ['get', 'uid'], selectedId],
        1.15,
        1,
      ]);
    } else {
      map.setLayoutProperty(LAYER_EMOJI_PINS, 'icon-image', [
        'concat',
        'emoji_',
        ['get', 'emoji'],
      ]);
      map.setLayoutProperty(LAYER_EMOJI_PINS, 'icon-size', 1);
    }
  }, [selectedId]);

  // Clean up map on full unmount (e.g. logout)
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
