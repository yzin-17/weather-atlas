import type { PlaceLabel, Locale } from './types.ts';
import { isLocale } from './catalog.ts';
import { errorInfo } from './errors.ts';
import { isRecord, isArray, isFiniteNumber as finite, timed } from './validation.ts';
interface ReverseLabel {
  name: string;
  region: string;
  country: string;
  countryCode: string;
  level: 'city' | 'region';
  cityId: number | null;
  source: string;
}
function validReverseRecord(value: unknown): value is ReverseRecord {
  if (
    !isRecord(value) ||
    !timed(value) ||
    (value.temporary !== undefined && typeof value.temporary !== 'boolean') ||
    (value.retryAfter !== undefined && !finite(value.retryAfter))
  )
    return false;
  const label = value.value;
  return (
    label === null ||
    (isRecord(label) &&
      ['name', 'region', 'country', 'countryCode', 'level', 'source'].every(
        (key) => typeof label[key] === 'string',
      ) &&
      (label.level === 'city' || label.level === 'region') &&
      (label.cityId === null || finite(label.cityId)))
  );
}
interface ReverseRecord {
  at: number;
  value: ReverseLabel | null;
  retryAfter?: number;
  temporary?: boolean;
}
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { coordinates } from './weather.ts';
import { cityDirectory, localPlace, locales } from './catalog.ts';
import { cacheDirectory, createSharedStore } from './shared-store.ts';
import { trace } from './trace.ts';

const DAY = 86400000,
  countries: Record<number, string[]> = {
    1835848: ['KR'],
    1815286: ['CN'],
    1668341: ['TW'],
    2643743: ['GB'],
    1850147: ['JP'],
    5128581: ['US'],
    1795565: ['CN'],
    1819729: ['CN', 'HK'],
  };
const text = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f]/g, '')
        .trim()
        .slice(0, 120)
    : '';
const normalized = (value: string) =>
  text(value)
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(?:特别行政区|特別行政區|特别市|特別市|특별시|광역시|市|都)$/u, '')
    .replace(/ city$/, '');
function labelFrom(properties: unknown): ReverseLabel | null {
  const p = isRecord(properties) ? properties : {},
    rawCode = text(p.countrycode),
    countryCode = /^[a-z]{2}$/i.test(rawCode) ? rawCode.toUpperCase() : '';
  const city =
    text(p.city) ||
    (['city', 'town', 'village', 'municipality'].includes(text(p.type) || text(p.osm_value))
      ? text(p.name)
      : '');
  const region = text(p.district) || text(p.county) || text(p.state),
    country = text(p.country);
  const name = city || region || country;
  if (!name) return null;
  const known = city
    ? cityDirectory.find(
        (c) =>
          countries[c.id]?.includes(countryCode) &&
          c.names.some((n) => normalized(n) === normalized(city)),
      )
    : undefined;
  return {
    name,
    region: region === name ? '' : region,
    country,
    countryCode,
    level: city ? 'city' : 'region',
    cityId: known?.id ?? null,
    source: 'photon-osm',
  };
}
export function photonLabel(raw: unknown) {
  const labels = (isRecord(raw) && isArray(raw.features) ? raw.features : [])
    .slice(0, 5)
    .map((f) => labelFrom(isRecord(f) ? f.properties : null))
    .filter((label): label is ReverseLabel => !!label);
  return labels.find((l: { level: string }) => l.level === 'city') || labels[0] || null;
}
export function localizeLabel(
  label: ReverseLabel | null | undefined,
  locale: Locale,
): PlaceLabel | null {
  if (!label) return null;
  const known = cityDirectory.find((c) => c.id === label.cityId),
    localized = known && localPlace(known, locale);
  let country = label.country;
  try {
    if (label.countryCode)
      country =
        new Intl.DisplayNames([locale], { type: 'region' }).of(label.countryCode) || country;
  } catch {}
  return {
    name:
      localized?.name ||
      (label.level === 'region' && label.name === label.country ? country : label.name),
    region: label.region,
    country: localized?.country || country,
    level: label.level,
    source: label.source,
    locale,
    ...(known
      ? {
          names: Object.fromEntries(locales.map((l) => [l, localPlace(known, l).name])),
          countries: Object.fromEntries(locales.map((l) => [l, localPlace(known, l).country])),
        }
      : {}),
  };
}

export function createReverseGeocoder({
  directory = cacheDirectory(),
  endpoint = process.env.WEATHER_REVERSE_URL || 'https://photon.komoot.io/reverse',
  fetcher = fetch,
  now = Date.now,
  sleep = delay,
}: {
  directory?: string;
  endpoint?: string;
  fetcher?: (url: URL, init: RequestInit) => Promise<Response>;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
} = {}) {
  const root = path.join(directory, 'reverse'),
    store = createSharedStore(root),
    gate = createSharedStore(directory);
  const provider = createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
  const usable = (record: ReverseRecord | null | undefined) =>
    record &&
    now() - record.at >= 0 &&
    (now() - record.at < (record.value ? 7 * DAY : record.temporary ? 5000 : 300000) ||
      (record.value && (record.retryAfter || 0) > now() && now() - record.at < 30 * DAY));
  async function prune() {
    const files = (await fs.readdir(root)).filter((n) => n.endsWith('.json'));
    if (files.length <= 1024) return;
    const entries = await Promise.all(
      files.map(async (name) => ({ name, mtime: (await fs.stat(path.join(root, name))).mtimeMs })),
    );
    entries.sort((a, b) => b.mtime - a.mtime);
    await Promise.all(
      entries.slice(1024).map((e) => fs.rm(path.join(root, e.name), { force: true })),
    );
  }
  return async (lat: unknown, lon: unknown, locale = 'en') => {
    const point = coordinates(lat, lon),
      lang = isLocale(locale) ? locale : 'en';
    // 公共 Photon 仅提供 en/de/fr/default；非英文使用当地名称，避免中文地点变拼音。
    const providerLanguage = lang === 'en' ? 'en' : 'default';
    const key = `reverse-v3:${provider}:${providerLanguage}:${point.lat},${point.lon}`;
    let record: ReverseRecord | null | undefined;
    try {
      record = await store.read(key, validReverseRecord);
      if (!usable(record))
        record = await store.lock(
          key,
          async () => {
            const latest = await store.read(key, validReverseRecord);
            if (usable(latest)) return latest;
            try {
              const value = await gate.lock(
                'reverse-upstream',
                async () => {
                  const url = new URL(endpoint);
                  url.searchParams.set('lat', String(point.lat));
                  url.searchParams.set('lon', String(point.lon));
                  url.searchParams.set('lang', providerLanguage);
                  url.searchParams.set('limit', '5');
                  // 两次查询共用超时预算；扩圈只采用行政区域，避免把邻近村镇当作选点城市。
                  const signal = AbortSignal.timeout(6000);
                  for (const radius of [1, 10]) {
                    const last = await gate.read('reverse-last-start', timed);
                    await sleep(last ? Math.max(0, 1000 - (now() - last.at)) : 0);
                    signal.throwIfAborted();
                    await gate.write('reverse-last-start', { at: now() });
                    url.searchParams.set('radius', String(radius));
                    const started = now();
                    const response = await fetcher(url, {
                      headers: {
                        'User-Agent': 'WeatherAtlas/1.1.2 (city labels)',
                        Accept: 'application/json',
                      },
                      signal,
                    });
                    trace('upstream', {
                      kind: 'reverse',
                      status: response.status,
                      ms: Math.round(now() - started),
                    });
                    if (!response.ok) throw Error('Reverse unavailable');
                    const raw: unknown = await response.json();
                    if (!isRecord(raw) || !isArray(raw.features))
                      throw Error('Invalid reverse response');
                    const label = photonLabel(raw);
                    if (radius === 1 && label) return label;
                    if (radius === 10 && label?.region)
                      return {
                        ...label,
                        name: label.region,
                        region: '',
                        level: 'region' as const,
                        cityId: null,
                      };
                  }
                  return null;
                },
                { wait: 1200 },
              );
              const next = { at: now(), value };
              await store.write(key, next);
              void prune().catch(() => {});
              return next;
            } catch (error) {
              if (latest?.value && now() - latest.at < 30 * DAY) {
                const old = { ...latest, retryAfter: now() + 300000 };
                await store.write(key, old);
                return old;
              }
              if (errorInfo(error).code === 'CACHE_BUSY')
                return { at: now(), value: null, temporary: true };
              const empty = { at: now(), value: null, temporary: true };
              await store.write(key, empty);
              void prune().catch(() => {});
              return empty;
            }
          },
          { wait: 8500 },
        );
    } catch {
      /* 名称解析与天气可用性独立；不输出坐标或原始地址。 */
    }
    return {
      place: localizeLabel(record?.value, lang),
      attribution: record?.value ? '© OpenStreetMap contributors' : null,
      retryAfterMs:
        record?.value || (record && !record.temporary)
          ? null
          : Math.max(1000, 5000 - (record ? now() - record.at : 0)),
    };
  };
}
const singleton = Symbol.for('weather-atlas.reverse.v3');
const services: typeof globalThis & { [singleton]?: ReturnType<typeof createReverseGeocoder> } =
  globalThis;
export const reversePlace = (services[singleton] ??= createReverseGeocoder());
