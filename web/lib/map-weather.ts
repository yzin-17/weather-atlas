import type { Coordinates, Place, Forecast, WeatherSource, StoredSummary } from './types.ts';
import {
  FORECAST_FRESH_MS,
  FORECAST_STALE_MS,
  snapshotAge,
  validSnapshot,
} from './client-forecast.ts';
export const mapKey = (p: Coordinates) => `${Number(p.lat).toFixed(4)},${Number(p.lon).toFixed(4)}`;
export function mapCities(current: Place, saved: Place[] = [], selected: Place | null = null) {
  const places = new Map<string, Place>();
  for (const p of [current, selected, ...saved].filter((p): p is Place => !!p))
    if (!places.has(mapKey(p))) places.set(mapKey(p), p);
  return [...places.values()].slice(0, 20);
}
export function mapSnapshot(
  place: Coordinates,
  forecast: unknown,
  source: WeatherSource,
): StoredSummary | null {
  if (
    !validSnapshot(forecast) ||
    forecast.source !== source ||
    snapshotAge(forecast) >= FORECAST_STALE_MS
  )
    return null;
  return {
    lat: place.lat,
    lon: place.lon,
    temp: forecast.current.temp,
    code: forecast.current.code,
    observedAt: forecast.current.time,
    timezone: forecast.timezone,
    fetchedAt: forecast.fetchedAt,
    stale: !!forecast.stale || snapshotAge(forecast) >= FORECAST_FRESH_MS,
    time: Date.parse(forecast.fetchedAt),
  };
}
export function summaryFresh(summary: StoredSummary | null | undefined, now = Date.now()) {
  return (
    !!summary &&
    !summary.stale &&
    Number.isFinite(summary.temp) &&
    Number.isFinite(summary.code) &&
    now >= summary.time &&
    now - summary.time < FORECAST_FRESH_MS
  );
}
