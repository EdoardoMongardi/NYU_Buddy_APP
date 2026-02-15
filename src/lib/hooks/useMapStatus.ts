'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { mapStatusSet, mapStatusClear, mapStatusGetNearby, MapStatusNearby } from '@/lib/firebase/functions';

interface UseMapStatusReturn {
  statuses: MapStatusNearby[];
  loading: boolean;
  error: string | null;
  myStatus: string | null;
  setStatus: (statusText: string, emoji: string, lat: number, lng: number) => Promise<void>;
  clearStatus: () => Promise<void>;
  refresh: () => Promise<void>;
  settingStatus: boolean;
}

// NYU Washington Square campus center
const DEFAULT_LAT = 40.7295;
const DEFAULT_LNG = -73.9965;

export function useMapStatus(): UseMapStatusReturn {
  const [statuses, setStatuses] = useState<MapStatusNearby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [settingStatus, setSettingStatus] = useState(false);
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  const fetchNearby = useCallback(async () => {
    try {
      setError(null);
      const result = await mapStatusGetNearby({
        lat: DEFAULT_LAT,
        lng: DEFAULT_LNG,
        radiusKm: 5,
      });
      setStatuses(result.data.statuses);
    } catch (err) {
      console.error('[useMapStatus] Error fetching nearby:', err);
      setError(err instanceof Error ? err.message : 'Failed to load map');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    fetchNearby();
    refreshInterval.current = setInterval(fetchNearby, 30000);
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [fetchNearby]);

  const setStatusFn = useCallback(async (statusText: string, emoji: string, lat: number, lng: number) => {
    setSettingStatus(true);
    try {
      await mapStatusSet({ statusText, emoji, lat, lng });
      setMyStatus(statusText);
      await fetchNearby();
    } finally {
      setSettingStatus(false);
    }
  }, [fetchNearby]);

  const clearStatusFn = useCallback(async () => {
    setSettingStatus(true);
    try {
      await mapStatusClear({} as never);
      setMyStatus(null);
      await fetchNearby();
    } finally {
      setSettingStatus(false);
    }
  }, [fetchNearby]);

  return {
    statuses,
    loading,
    error,
    myStatus,
    setStatus: setStatusFn,
    clearStatus: clearStatusFn,
    refresh: fetchNearby,
    settingStatus,
  };
}
