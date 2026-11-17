'use client';
import type { Coordinates, Forecast, SummaryStore, Summary } from '../lib/types.ts';
import { decode, readJson } from '../lib/validation.ts';
import { validSummaries, validSummaryStore } from '../lib/contracts.ts';
import { useEffect, useState } from 'react';
import { forecastKey, FORECAST_STALE_MS } from '../lib/client-forecast.ts';
import { mapKey, mapSnapshot, summaryFresh } from '../lib/map-weather.ts';
import { readLocal, writeLocal } from './storage.ts';
export default function useMapWeather(
  cities: Coordinates[],
  current: Coordinates,
  forecast: Forecast | null,
  cacheNamespace: string,
) {
  const [summaries, setSummaries] = useState<SummaryStore>({}),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(false);
  const currentKey = mapKey(current);
  const coords = cities.map(mapKey).join(';'),
    source = forecast?.source || 'open-meteo';
  useEffect(() => {
    const controller = new AbortController(),
      key = 'summaries.v2:' + cacheNamespace;
    const now = Date.now();
    const stored = readLocal(key);
    const cache: SummaryStore = Object.fromEntries(
      Object.entries(validSummaryStore(stored) ? stored : {})
        .filter(
          ([, item]) =>
            item &&
            Number.isFinite(item.temp) &&
            Number.isFinite(item.code) &&
            now >= item.time &&
            now - item.time < FORECAST_STALE_MS,
        )
        .map(([key, item]) => [
          key,
          { ...item, stale: item.stale || now - item.time >= 15 * 60_000 },
        ]),
    );
    const points = coords
      ? coords.split(';').map((pair) => {
          const [lat, lon] = pair.split(',').map(Number);
          return { lat, lon };
        })
      : [];
    for (const city of points) {
      const full = mapSnapshot(
        city,
        mapKey(city) === currentKey ? forecast : readLocal(forecastKey(city, cacheNamespace), null),
        source,
      );
      if (full && (!cache[mapKey(city)] || full.time >= cache[mapKey(city)].time))
        cache[mapKey(city)] = full;
    }
    setSummaries({ ...cache });
    setFailed(false);
    const missing = points.filter((city) => !summaryFresh(cache[mapKey(city)]));
    setLoading(missing.length > 0);
    if (missing.length)
      void (async () => {
        try {
          const r = await fetch(
            '/api/summaries?' + new URLSearchParams({ coords: missing.map(mapKey).join(';') }),
            { signal: controller.signal },
          );
          if (!r.ok) throw Error('summary');
          const data = decode(await readJson(r), validSummaries);
          if (controller.signal.aborted) return;
          for (const item of data.items || [])
            cache[mapKey(item)] = { ...item, time: Date.parse(item.fetchedAt || '') || Date.now() };
          const keep = Object.fromEntries(
            Object.entries(cache)
              .sort((a, b) => b[1].time - a[1].time)
              .slice(0, 100),
          );
          writeLocal(key, keep);
          setSummaries(keep);
          setFailed(missing.some((city) => !summaryFresh(cache[mapKey(city)])));
        } catch {
          if (!controller.signal.aborted) setFailed(true);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    return () => controller.abort();
  }, [coords, source, attempt, forecast, cacheNamespace, currentKey]);
  return { summaries, failed, loading, retry: () => setAttempt((n) => n + 1) };
}
