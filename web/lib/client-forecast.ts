import type { Coordinates, Forecast, WeatherSource } from './types.ts';
import { isRecord as record, isArray, isFiniteNumber as finite } from './validation.ts';
export const FORECAST_FRESH_MS = 15 * 60_000;
export const FORECAST_STALE_MS = 3 * 60 * 60_000;
export const forecastKey = (p: Coordinates) => `weather.${p.lat},${p.lon}`;
const code = (value: unknown): value is number =>
  finite(value) && Number.isInteger(value) && value >= 0 && value <= 99;
const current = (value: unknown) =>
  record(value) && finite(value.time) && finite(value.temp) && code(value.code);
const hour = (value: unknown) =>
  record(value) &&
  current(value) &&
  (value.rain === null || (finite(value.rain) && value.rain >= 0 && value.rain <= 100));
export function validSnapshot(s: unknown): s is Forecast {
  return (
    record(s) &&
    typeof s.version === 'string' &&
    s.version.length > 0 &&
    typeof s.timezone === 'string' &&
    s.timezone.length > 0 &&
    typeof s.source === 'string' &&
    ['demo', 'fixture', 'open-meteo'].includes(s.source) &&
    typeof s.fetchedAt === 'string' &&
    Number.isFinite(Date.parse(s.fetchedAt)) &&
    typeof s.stale === 'boolean' &&
    current(s.current) &&
    isArray(s.hours) &&
    s.hours.length === 24 &&
    s.hours.every(hour) &&
    isArray(s.days) &&
    s.days.length === 7 &&
    s.days.every(
      (day) =>
        record(day) &&
        typeof day.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(day.date) &&
        finite(day.min) &&
        finite(day.max) &&
        day.min <= day.max &&
        code(day.code),
    ) &&
    (s.comparisonHours === undefined ||
      (isArray(s.comparisonHours) && s.comparisonHours.every(hour)))
  );
}
export function snapshotAge(s: { fetchedAt?: string } | null | undefined, now = Date.now()) {
  const age = now - Date.parse(s?.fetchedAt || '');
  return Number.isFinite(age) && age >= 0 ? age : Infinity;
}
export function preferredSnapshot(initial: Forecast | null, cached: unknown, now = Date.now()) {
  const usable =
    validSnapshot(cached) &&
    snapshotAge(cached, now) < FORECAST_STALE_MS &&
    cached.source !== 'demo' &&
    (!initial || initial.source === cached.source);
  const chosen =
    usable && (!initial || snapshotAge(cached, now) < snapshotAge(initial, now)) ? cached : initial;
  return chosen
    ? {
        ...chosen,
        stale: !!chosen.stale || !initial || snapshotAge(chosen, now) >= FORECAST_FRESH_MS,
      }
    : null;
}
export function cachedSummary(
  place: Coordinates,
  snapshot: unknown,
  source: WeatherSource,
  now = Date.now(),
) {
  if (
    !validSnapshot(snapshot) ||
    snapshot.source !== source ||
    snapshot.stale ||
    snapshotAge(snapshot, now) >= FORECAST_FRESH_MS
  )
    return null;
  return {
    lat: place.lat,
    lon: place.lon,
    temp: snapshot.current.temp,
    code: snapshot.current.code,
    time: Date.parse(snapshot.fetchedAt),
  };
}
