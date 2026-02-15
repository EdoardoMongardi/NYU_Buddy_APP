'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { mapStatusSet, mapStatusClear, mapStatusGetNearby, MapStatusNearby } from '@/lib/firebase/functions';

interface UseMapStatusOptions {
  enabled?: boolean;
}

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

export function useMapStatus({ enabled = true }: UseMapStatusOptions = {}): UseMapStatusReturn {
  const [statuses, setStatuses] = useState<MapStatusNearby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [settingStatus, setSettingStatus] = useState(false);
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);
  const hasFetched = useRef(false);

  const fetchNearby = useCallback(async () => {
    try {
      setError(null);
      console.log('[useMapStatus] fetchNearby: calling mapStatusGetNearby…');
      const result = await mapStatusGetNearby({
        lat: DEFAULT_LAT,
        lng: DEFAULT_LNG,
        radiusKm: 5,
      });
      const list = result.data.statuses ?? [];
      console.log(`[useMapStatus] fetchNearby: got ${list.length} statuses`, list);
      setStatuses(list);
      hasFetched.current = true;
    } catch (err) {
      console.error('[useMapStatus] fetchNearby ERROR:', err);
      setError(err instanceof Error ? err.message : 'Failed to load map');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch + auto-refresh only when enabled
  useEffect(() => {
    if (!enabled) {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
      return;
    }

    // Fetch immediately when enabled turns on
    fetchNearby();
    refreshInterval.current = setInterval(fetchNearby, 30000);

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
    };
  }, [enabled, fetchNearby]);

  const setStatusFn = useCallback(async (statusText: string, emoji: string, lat: number, lng: number) => {
    setSettingStatus(true);
    try {
      console.log(`[useMapStatus] setStatus: text="${statusText}" emoji=${emoji} lat=${lat} lng=${lng}`);
      await mapStatusSet({ statusText, emoji, lat, lng });
      console.log('[useMapStatus] setStatus: success, now refreshing nearby…');
      setMyStatus(statusText);
      await fetchNearby();
    } catch (err) {
      console.error('[useMapStatus] setStatus ERROR:', err);
      throw err;
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
