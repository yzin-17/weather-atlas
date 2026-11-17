'use client';
import type { Coordinates, Place, PlaceLabel, Locale } from '../lib/types.ts';
import { isRecord, isFiniteNumber, readJson } from '../lib/validation.ts';
import { validPlaceLabel } from '../lib/contracts.ts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isCoordinatePlace, localize } from '../lib/catalog.ts';
import { readLocal, writeLocal } from './storage.ts';

interface LabelResult {
  place: PlaceLabel | null;
  retryAfterMs: number | null;
}
const inflight = new Map<string, Promise<LabelResult>>();
async function loadPlaceLabel(place: Coordinates, locale: Locale): Promise<LabelResult> {
  const key = `${place.lat},${place.lon}.${locale}`,
    storage = `reverse-label.v2.${key}`,
    cached = readLocal(storage);
  if (
    isRecord(cached) &&
    isFiniteNumber(cached.at) &&
    validPlaceLabel(cached.place) &&
    Date.now() >= cached.at &&
    Date.now() - cached.at < 7 * 86400000
  )
    return { place: cached.place, retryAfterMs: null };
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = new AbortController(),
    timer = setTimeout(() => job.abort(), 8500);
  const task = (async () => {
    try {
      const r = await fetch(
        '/api/reverse?' +
          new URLSearchParams({ lat: String(place.lat), lon: String(place.lon), lang: locale }),
        { signal: job.signal },
      );
      if (!r.ok) throw Error('label');
      const data = await readJson(r);
      if (isRecord(data) && validPlaceLabel(data.place) && data.place.name) {
        writeLocal(storage, { at: Date.now(), place: data.place });
        return { place: data.place, retryAfterMs: null };
      }
      if (isRecord(data) && data.place === null)
        return {
          place: null,
          retryAfterMs: isFiniteNumber(data.retryAfterMs)
            ? Math.max(1000, Math.min(10000, data.retryAfterMs))
            : null,
        };
    } catch {
      /* 名称解析失败时使用现有区域或坐标。 */
    } finally {
      clearTimeout(timer);
      inflight.delete(key);
    }
    return { place: null, retryAfterMs: 5000 };
  })();
  inflight.set(key, task);
  return task;
}
export async function warmPlaceLabel(place: Place, locale: Locale): Promise<PlaceLabel | null> {
  if (!isCoordinatePlace(place)) return null;
  return (await loadPlaceLabel(place, locale)).place;
}

export default function usePlaceLabel(place: Place, locale: Locale) {
  const point = isCoordinatePlace(place),
    identity = `${place.lat},${place.lon}`,
    key = `${identity}.${locale}`;
  const [resolved, setResolved] = useState<{ key: string; value: PlaceLabel | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const retryLabel = useCallback(() => {
    setResolved(null);
    setRetry((value) => value + 1);
  }, []);
  useEffect(() => {
    if (!point) return;
    let active = true;
    let attempts = 0;
    let pending = false;
    let found = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (!active || pending || found) return;
      pending = true;
      const result = await loadPlaceLabel({ lat: place.lat, lon: place.lon }, locale);
      pending = false;
      if (!active) return;
      found = !!result.place;
      // 首次空结果即结束占位；后台恢复期间天气与区域／坐标仍可阅读。
      setResolved({ key, value: result.place });
      if (!found && result.retryAfterMs !== null && attempts++ < 2)
        timer = setTimeout(() => void run(), result.retryAfterMs);
    };
    const recover = () => {
      if (document.visibilityState === 'hidden') return;
      clearTimeout(timer);
      attempts = 0;
      void run();
    };
    void run();
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [point, key, place.lat, place.lon, locale, retry]);
  return useMemo(() => {
    if (!point) return { place, resolving: false, canRetry: false, retryLabel };
    const label = resolved?.key === key ? resolved.value || place.label : place.label;
    const localized = localize({ ...place, name: label?.name || place.name, label }, locale);
    const known = label?.names?.[locale] || (label?.locale === locale && localized.name);
    const labeledPlace = {
      ...place,
      name:
        known || place.region || `${Number(place.lat).toFixed(4)}, ${Number(place.lon).toFixed(4)}`,
      region: label?.region || place.region || '',
      country: label?.countries?.[locale] || label?.country || place.country || '',
      label,
    };
    const resolving = !known && resolved?.key !== key;
    return { place: labeledPlace, resolving, canRetry: !known && !resolving, retryLabel };
  }, [point, place, resolved, key, locale, retryLabel]);
}
