'use client';
import { useCallback, useEffect, useState, useRef } from 'react';
import type { Coordinates, Forecast } from '../lib/types.ts';
import {
  requestWeather,
  WeatherRequestError,
  type WeatherFailure,
} from '../lib/weather-request.ts';
import {
  forecastKey,
  preferredSnapshot,
  snapshotAge,
  FORECAST_FRESH_MS,
} from '../lib/client-forecast.ts';
import { readLocal, writeLocal } from './storage.ts';

export default function useWeatherQuery(
  place: Coordinates,
  initial: Forecast | null,
  namespace: string,
) {
  const { lat, lon } = place;
  const [weather, setWeather] = useState(initial);
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>(initial ? 'ready' : 'error');
  const [failure, setFailure] = useState<WeatherFailure | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const job = useRef<AbortController | null>(null);
  const cooldown = useRef(0);
  const key = forecastKey({ lat, lon }, namespace);
  const accept = useCallback(
    (snapshot: Forecast) => {
      setWeather(snapshot);
      setStatus(snapshot.stale ? 'error' : 'ready');
      setFailure(snapshot.stale ? 'unavailable' : null);
      if (snapshot.source !== 'demo') writeLocal(key, snapshot);
    },
    [key],
  );
  const reload = useCallback(async () => {
    if (job.current || Date.now() < cooldown.current) return;
    const controller = new AbortController();
    job.current = controller;
    let timeout = false;
    const timer = setTimeout(() => {
      timeout = true;
      controller.abort();
    }, 22_000);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    setStatus('loading');
    setFailure(null);
    try {
      const snapshot = await requestWeather({ lat, lon }, controller.signal);
      if (job.current === controller && !controller.signal.aborted) accept(snapshot);
    } catch (error) {
      if (job.current === controller && (!controller.signal.aborted || timeout)) {
        const reason = timeout
          ? 'timeout'
          : error instanceof WeatherRequestError
            ? error.reason
            : 'unavailable';
        setFailure(reason);
        setStatus('error');
        setWeather((old) => (old ? { ...old, stale: true } : old));
        if (error instanceof WeatherRequestError && error.retryMs) {
          cooldown.current = Date.now() + error.retryMs;
          setRetryAt(cooldown.current);
        }
      }
    } finally {
      clearTimeout(timer);
      if (job.current === controller) job.current = null;
    }
  }, [lat, lon, accept]);
  useEffect(() => {
    const selected = preferredSnapshot(initial, readLocal(key));
    setWeather(selected);
    setStatus(selected ? 'ready' : 'error');
    setFailure(null);
    cooldown.current = 0;
    setRetryAt(0);
    if (selected && selected.source !== 'demo') writeLocal(key, selected);
    if (!selected || selected.stale || snapshotAge(selected) >= FORECAST_FRESH_MS) void reload();
    return () => {
      job.current?.abort();
      job.current = null;
    };
  }, [initial, key, reload]);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(
      () => {
        cooldown.current = 0;
        setRetryAt(0);
      },
      Math.max(0, retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [retryAt]);
  return { weather, status, failure, reload, accept, retryBlocked: retryAt > 0 };
}
