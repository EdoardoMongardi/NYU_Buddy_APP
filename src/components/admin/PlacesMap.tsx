'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface Place {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  active: boolean;
  allowedActivities?: string[];
}

interface PlacesMapProps {
  places: Place[];
}

const CATEGORY_COLORS: Record<string, string> = {
  'Restaurant': '#f97316',   // orange
  'Cafe/Tea':   '#8b5cf6',   // violet
  'Park':       '#22c55e',   // green
  'Library':    '#3b82f6',   // blue
  'Study Space':'#06b6d4',   // cyan
  'Other':      '#94a3b8',   // slate
};

const NYC_CENTER: [number, number] = [40.7295, -73.9965];

export function PlacesMap({ places }: PlacesMapProps) {
  // Leaflet icon fix for Next.js (avoids broken default marker images)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require('leaflet');
    delete (L.Icon.Default.prototype as typeof L.Icon.Default.prototype & { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }, []);

  const activePlaces   = places.filter(p => p.active);
  const inactivePlaces = places.filter(p => !p.active);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => {
          const count = places.filter(p => p.category === cat).length;
          if (count === 0) return null;
          return (
            <span key={cat} className="flex items-center gap-1.5 text-gray-600">
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              {cat} <span className="text-gray-400">({count})</span>
            </span>
          );
        })}
        <span className="flex items-center gap-1.5 text-gray-400">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 bg-white" />
          Inactive ({inactivePlaces.length})
        </span>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 520 }}>
        <MapContainer
          center={NYC_CENTER}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {activePlaces.map((place) => (
            <CircleMarker
              key={place.id}
              center={[place.lat, place.lng]}
              radius={7}
              pathOptions={{
                fillColor: CATEGORY_COLORS[place.category] ?? '#94a3b8',
                fillOpacity: 0.85,
                color: '#fff',
                weight: 1.5,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <div className="text-xs leading-snug">
                  <p className="font-semibold">{place.name}</p>
                  <p className="text-gray-500">{place.category}</p>
                  {place.allowedActivities && place.allowedActivities.length > 0 && (
                    <p className="text-gray-400">{place.allowedActivities.join(', ')}</p>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          ))}

          {/* Inactive places shown as hollow grey dots */}
          {inactivePlaces.map((place) => (
            <CircleMarker
              key={place.id}
              center={[place.lat, place.lng]}
              radius={5}
              pathOptions={{
                fillColor: '#fff',
                fillOpacity: 0.6,
                color: '#94a3b8',
                weight: 1.5,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <div className="text-xs leading-snug">
                  <p className="font-semibold text-gray-400">{place.name} (inactive)</p>
                  <p className="text-gray-400">{place.category}</p>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <p className="text-xs text-gray-400 text-center">
        {activePlaces.length} active · {inactivePlaces.length} inactive · {places.length} total — hover a dot for details
      </p>
    </div>
  );
}
