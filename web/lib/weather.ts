import type { Coordinates, Forecast, Summary, Place, Locale, CatalogCity } from './types.ts';
import { errorInfo } from './errors.ts';
import { WeatherError } from './service-errors.ts';
export { WeatherError } from './service-errors.ts';
import {
  isRecord,
  isArray,
  isFiniteNumber as finite,
  readJson,
  cacheRecord,
  requireValue,
} from './validation.ts';
import { validSnapshot } from './client-forecast.ts';
interface UpstreamForecast {
  timezone: string;
  utc_offset_seconds: number;
  current: { time: number; temperature_2m: number; weather_code: number };
  hourly: {
    time: number[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability?: (number | null)[];
  };
  daily: {
    time: number[];
    temperature_2m_min: number[];
    temperature_2m_max: number[];
    weather_code: number[];
  };
}
interface UpstreamCity {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  country_code?: string;
}
import { createHash } from 'node:crypto';
import { cityDirectory as catalog, localPlace, locales } from './catalog.ts';
import { createSharedStore } from './shared-store.ts';
import { trace } from './trace.ts';

const FORECAST = process.env.WEATHER_FORECAST_URL || 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const CACHE_LIMIT = 512;

function badInput(message: string) {
  return new WeatherError(400, 'INVALID_INPUT', message);
}

export function coordinates(lat: unknown, lon: unknown) {
  function parse(raw: unknown, limit: number) {
    if (typeof raw !== 'number' && typeof raw !== 'string') throw badInput('Invalid coordinates');
    if (typeof raw === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim()))
      throw badInput('Invalid coordinates');
    const n = Number(raw);
    if (!Number.isFinite(n) || Math.abs(n) > limit)
      throw badInput('Coordinates outside supported range');
    return Number(n.toFixed(4));
  }
  return { lat: parse(lat, 90), lon: parse(lon, 180) };
}

export function parseBatch(value: string | null) {
  const pairs = value?.split(';') ?? [];
  if (!pairs.length || pairs.length > 20) throw badInput('Provide 1 to 20 coordinates');
  return pairs.map((pair) => {
    const fields = pair.split(',');
    if (fields.length !== 2) throw badInput('Expected latitude,longitude');
    return coordinates(fields[0], fields[1]);
  });
}

function keyOf(p: Coordinates) {
  return p.lat + ',' + p.lon;
}
export function forecastNamespace(demo = process.env.WEATHER_MODE === 'demo', upstream = FORECAST) {
  const provider = createHash('sha256').update(upstream).digest('hex').slice(0, 12);
  return demo ? 'demo-v1' : `live-v1-${provider}`;
}
function serverForecastKey(demo: boolean, p: Coordinates) {
  const provider = createHash('sha256').update(FORECAST).digest('hex').slice(0, 12);
  return `forecast-v3:${demo ? 'demo' : provider}:${keyOf(p)}`;
}

function forecastSummary(p: Coordinates, forecast: Forecast): Summary {
  return {
    ...p,
    temp: forecast.current.temp,
    code: forecast.current.code,
    observedAt: forecast.current.time,
    timezone: forecast.timezone,
    fetchedAt: forecast.fetchedAt,
    stale: !!forecast.stale,
  };
}

function checkData(ok: unknown): asserts ok {
  if (!ok)
    throw new WeatherError(
      502,
      'INVALID_UPSTREAM',
      'The weather provider returned incomplete data',
    );
}
const unix = (n: unknown): n is number =>
  finite(n) && Number.isSafeInteger(n) && n > 0 && n < 100000000000;
const weatherCode = (n: unknown): n is number =>
  finite(n) && Number.isSafeInteger(n) && n >= 0 && n <= 99;

export function civilDate(stamp: number, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(stamp * 1000));
}

function makeVersion(p: Coordinates, content: unknown) {
  return createHash('sha256')
    .update(JSON.stringify([p.lat, p.lon, content]))
    .digest('hex')
    .slice(0, 20);
}

export function normalizeWeather(p: Coordinates, value: unknown, fetchedAt = Date.now()): Forecast {
  checkData(isRecord(value));
  const raw = value;
  const { current: c, hourly: h, daily: d, timezone } = raw;
  checkData(isRecord(c) && isRecord(h) && isRecord(d));
  checkData(typeof timezone === 'string' && timezone.length > 0);
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    checkData(false);
  }
  checkData(unix(c?.time) && finite(c.temperature_2m) && weatherCode(c.weather_code));
  checkData(
    isArray(h.time) &&
      h.time.length >= 24 &&
      h.time.length <= 192 &&
      isArray(d.time) &&
      d.time.length === 7,
  );
  checkData(
    isArray(h.temperature_2m) &&
      isArray(h.weather_code) &&
      (h.precipitation_probability === undefined || isArray(h.precipitation_probability)) &&
      isArray(d.temperature_2m_min) &&
      isArray(d.temperature_2m_max) &&
      isArray(d.weather_code),
  );
  const hourTimes = h.time,
    temperatures = h.temperature_2m,
    codes = h.weather_code,
    probabilities = h.precipitation_probability,
    dayTimes = d.time,
    minimums = d.temperature_2m_min,
    maximums = d.temperature_2m_max,
    dayCodes = d.weather_code;
  const current = {
    time: c.time,
    temp: c.temperature_2m,
    code: c.weather_code,
  };
  const hours = hourTimes.map((time, i) => {
    const temp = temperatures[i],
      code = codes[i],
      rain = probabilities?.[i] ?? null;
    checkData(
      unix(time) &&
        (!i || time > Number(requireValue(hourTimes[i - 1]))) &&
        finite(temp) &&
        weatherCode(code),
    );
    // A missing probability does not mean 0% rain.
    checkData(rain === null || (finite(rain) && rain >= 0 && rain <= 100));
    return { time, temp, code, rain };
  });
  // The provider's daily boundaries are encoded with the UTC offset at request
  // time. Recover the provider's calendar date before formatting for display.
  const offset = Number(raw.utc_offset_seconds);
  checkData(Number.isFinite(offset) && Math.abs(offset) <= 86400);
  const days = dayTimes.map((stamp, i) => {
    const min = minimums[i],
      max = maximums[i],
      code = dayCodes[i];
    checkData(
      unix(stamp) &&
        (!i || stamp > Number(requireValue(dayTimes[i - 1]))) &&
        finite(min) &&
        finite(max) &&
        min <= max &&
        weatherCode(code),
    );
    return {
      date: new Date((stamp + offset) * 1000).toISOString().slice(0, 10),
      min,
      max,
      code,
    };
  });
  const data = { timezone, current, hours: hours.slice(0, 24), days, comparisonHours: hours };
  return {
    ...data,
    version: makeVersion(p, data),
    fetchedAt: new Date(fetchedAt).toISOString(),
    source: process.env.WEATHER_FORECAST_URL ? 'fixture' : 'open-meteo',
    stale: false,
  };
}

// Deterministic, separately selected fixtures are useful for screenshots, UI
// reviews, and tests. Upstream failures never select this code path.
function localMatches(query: string, locale: Locale) {
  const needle = query.toLocaleLowerCase();
  return catalog
    .filter((c) => c.names.some((n) => n.toLocaleLowerCase().startsWith(needle)))
    .map((c) => {
      const { id, name, country, lat, lon } = localPlace(
        c,
        locales.includes(locale) ? locale : 'en',
      );
      return { id, name, country, lat, lon, region: '' };
    });
}

function sample(p: Coordinates, now: number): Forecast {
  const distance = (c: CatalogCity) => Math.abs(c.lat - p.lat) + Math.abs(c.lon - p.lon);
  const closest = catalog.reduce((best, c) => (distance(c) < distance(best) ? c : best));
  const city = distance(closest) < 1 ? closest : null;
  const timezone = city?.timezone ?? 'UTC';
  const t = Math.floor(now / HOUR) * 3600;
  const base = 13 + Math.round(3 * Math.sin(p.lat / 9));
  const hours = Array.from({ length: 168 }, (_, i) => {
    const temp = base + Math.round(4 * Math.sin((i + 3) / 4));
    return {
      time: t + i * 3600,
      temp,
      code: i > 12 && i < 18 ? 61 : i % 5 ? 2 : 1,
      rain: i > 12 && i < 18 ? 75 : 5,
    };
  });
  const firstDay = Date.parse(civilDate(t, timezone) + 'T00:00:00Z');
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(firstDay + i * 86400000).toISOString().slice(0, 10),
    min: base - 4 + (i % 2),
    max: base + 4 - (i % 3),
    code: [2, 61, 3, 0, 1, 2, 3][i],
  }));
  const data = {
    timezone,
    current: { time: t, temp: hours[0].temp, code: hours[0].code },
    hours: hours.slice(0, 24),
    comparisonHours: hours,
    days,
  };
  return {
    ...data,
    version: makeVersion(p, data),
    fetchedAt: new Date(now).toISOString(),
    source: 'demo',
    stale: false,
  };
}

async function jsonRequest(
  fetcher: (url: URL, init: RequestInit) => Promise<Response>,
  url: URL,
): Promise<unknown> {
  let response: Response;
  const started = performance.now();
  try {
    response = await fetcher(url, {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    trace('upstream', {
      kind: url.searchParams.has('name')
        ? 'geocoding'
        : url.searchParams.has('hourly')
          ? 'forecast'
          : 'summaries',
      status: response.status,
      ms: Math.round((performance.now() - started) * 100) / 100,
    });
  } catch {
    throw new WeatherError(
      503,
      'UPSTREAM_UNAVAILABLE',
      'The weather service is temporarily unavailable',
    );
  }
  if (!response.ok) {
    const limited = response.status === 429;
    throw new WeatherError(
      limited ? 429 : 503,
      limited ? 'RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE',
      limited ? 'Weather provider rate limit reached' : 'Weather service unavailable',
    );
  }
  try {
    return await readJson(response);
  } catch {
    throw new WeatherError(502, 'INVALID_UPSTREAM', 'Invalid response from the weather service');
  }
}

function urlFor(base: string, params: Record<string, string | number>) {
  const url = new URL(base);
  url.search = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  return url;
}

export function createWeatherService({
  fetcher = fetch,
  clock = Date.now,
  demo = false,
  sharedStore = null,
}: {
  fetcher?: (url: URL, init: RequestInit) => Promise<Response>;
  clock?: () => number;
  demo?: boolean;
  sharedStore?: ReturnType<typeof createSharedStore> | null;
} = {}) {
  const order = new Map<string, () => void>();
  let pendingCount = 0;
  const summaryCache = new Map<string, { at: number; item: Summary }>();
  function store<T>(map: Map<string, T>, key: string, value: T) {
    map.delete(key);
    map.set(key, value);
    if (map.size > CACHE_LIMIT) {
      const first = map.keys().next();
      if (!first.done) map.delete(first.value);
    }
  }
  function makeCached<T extends object>() {
    const cache = new Map<string, { at: number; value: T }>();
    const pending = new Map<string, Promise<T>>();
    return async function cached(
      key: string,
      freshFor: number,
      staleFor: number,
      load: () => Promise<T>,
    ): Promise<T> {
      const hit = cache.get(key);
      if (hit && clock() - hit.at < freshFor) return hit.value;
      const running = pending.get(key);
      if (running) return running;
      if (pendingCount >= 128) throw new WeatherError(503, 'BUSY', 'Service is busy, try again');
      const promise = Promise.resolve()
        .then(load)
        .then((value) => {
          cache.set(key, { at: clock(), value });
          order.delete(key);
          order.set(key, () => cache.delete(key));
          if (order.size > CACHE_LIMIT) {
            const oldest = order.entries().next();
            if (!oldest.done) {
              oldest.value[1]();
              order.delete(oldest.value[0]);
            }
          }
          return value;
        })
        .catch((err: unknown) => {
          if (hit && clock() - hit.at < staleFor) return { ...hit.value, stale: true };
          throw err;
        })
        .finally(() => {
          pending.delete(key);
          pendingCount--;
        });
      pendingCount++;
      pending.set(key, promise);
      return promise;
    };
  }
  const cachedForecast = makeCached<Forecast>(),
    cachedPlaces = makeCached<{ places: Place[]; source?: string }>(),
    cachedBatch = makeCached<{ items: Summary[] }>();
  async function getWeather(lat: unknown, lon: unknown, { fresh = false } = {}) {
    const started = performance.now();
    const p = coordinates(lat, lon);
    const load = async () => {
      const forecast = demo
        ? sample(p, clock())
        : normalizeWeather(
            p,
            await jsonRequest(
              fetcher,
              urlFor(FORECAST, {
                latitude: p.lat,
                longitude: p.lon,
                current: 'temperature_2m,weather_code',
                hourly: 'temperature_2m,weather_code,precipitation_probability',
                daily: 'temperature_2m_min,temperature_2m_max,weather_code',
                forecast_hours: 168,
                forecast_days: 7,
                timezone: 'auto',
                timeformat: 'unixtime',
              }),
            ),
            clock(),
          );
      store(summaryCache, keyOf(p), {
        at: clock(),
        item: forecastSummary(p, forecast),
      });
      return forecast;
    };
    const key = serverForecastKey(demo, p);
    let value: Forecast;
    try {
      value = await (sharedStore
        ? sharedStore.getOrLoad(key, load, { background: !fresh, validate: validSnapshot })
        : cachedForecast(key, 15 * MINUTE, 3 * HOUR, load));
    } catch (error) {
      if (errorInfo(error).code === 'CACHE_BUSY')
        throw new WeatherError(503, 'BUSY', 'Service is busy, try again');
      throw error;
    }
    trace('forecast-read', {
      ms: Math.round((performance.now() - started) * 100) / 100,
      stale: value.stale,
    });
    return value;
  }
  async function searchPlaces(
    query: unknown,
    locale: Locale = 'en',
  ): Promise<{ places: Place[]; source?: string }> {
    const textQuery = String(query ?? '').trim();
    if (textQuery.length > 100) throw badInput('Search text is too long');
    if ([...textQuery].length < 2) return { places: [] };
    const language =
      { 'zh-Hans': 'zh', 'zh-Hant': 'zh', zh: 'zh', ko: 'ko', en: 'en' }[locale] ?? 'en';
    return cachedPlaces(
      'place:' + locale + ':' + textQuery.toLowerCase(),
      6 * HOUR,
      0,
      async () => {
        const matches = localMatches(textQuery, locale);
        if (demo) return { places: matches, source: 'demo' };
        let raw: unknown;
        try {
          raw = await jsonRequest(
            fetcher,
            urlFor(GEOCODE, {
              name: textQuery,
              language,
              count: 8,
              format: 'json',
            }),
          );
        } catch (error) {
          if (matches.length) return { places: matches, source: 'catalog' };
          throw error;
        }
        checkData(isRecord(raw) && (raw.results === undefined || isArray(raw.results)));
        const places = (raw.results ?? [])
          .filter(
            (c): c is UpstreamCity =>
              isRecord(c) &&
              finite(c.id) &&
              Number.isSafeInteger(c.id) &&
              typeof c.name === 'string' &&
              finite(c.latitude) &&
              finite(c.longitude) &&
              Math.abs(c.latitude) <= 90 &&
              Math.abs(c.longitude) <= 180 &&
              (c.admin1 === undefined || typeof c.admin1 === 'string') &&
              (c.country === undefined || typeof c.country === 'string') &&
              (c.country_code === undefined || typeof c.country_code === 'string'),
          )
          .map((c) => ({
            id: c.id,
            name: c.name,
            region: c.admin1 ?? '',
            country: c.country ?? c.country_code ?? '',
            lat: c.latitude,
            lon: c.longitude,
          }));
        const ids = new Set(matches.map((p) => p.id));
        return {
          places: [...matches, ...places.filter((p) => !ids.has(p.id))].slice(0, 8),
          source: 'open-meteo',
        };
      },
    );
  }
  async function getSummaries(coords: Coordinates[]) {
    const points = coords.map((p) => coordinates(p.lat, p.lon));
    const unique = new Map(points.map((p) => [keyOf(p), p]));
    const result = new Map<string, Summary>(),
      missing: Coordinates[] = [];
    for (const [k, p] of unique) {
      const hit = summaryCache.get(k);
      if (hit && clock() - hit.at < 15 * MINUTE) result.set(k, hit.item);
      else {
        const persisted =
          sharedStore &&
          (await sharedStore.read(serverForecastKey(demo, p), cacheRecord(validSnapshot)));
        if (persisted && clock() - persisted.at >= 0 && clock() - persisted.at < 15 * MINUTE)
          result.set(k, forecastSummary(p, persisted.value));
        else missing.push(p);
      }
    }
    if (missing.length) {
      missing.sort((a, b) => a.lat - b.lat || a.lon - b.lon);
      const batch = await cachedBatch(
        'batch:' + missing.map(keyOf).join(';'),
        15 * MINUTE,
        0,
        async () => {
          let current: Omit<Summary, 'lat' | 'lon'>[];
          if (demo) current = missing.map((p) => forecastSummary(p, sample(p, clock())));
          else {
            const response = await jsonRequest(
              fetcher,
              urlFor(FORECAST, {
                latitude: missing.map((p) => p.lat).join(','),
                longitude: missing.map((p) => p.lon).join(','),
                current: 'temperature_2m,weather_code',
                timezone: 'auto',
                timeformat: 'unixtime',
              }),
            );
            const rows = isArray(response) ? response : [response];
            checkData(rows.length === missing.length);
            current = rows.map((row) => {
              checkData(isRecord(row) && isRecord(row.current));
              checkData(
                finite(row.current?.temperature_2m) && weatherCode(row.current?.weather_code),
              );
              return {
                temp: row.current.temperature_2m,
                code: row.current.weather_code,
                observedAt: unix(row.current.time) ? row.current.time : null,
                timezone: typeof row.timezone === 'string' ? row.timezone : null,
                fetchedAt: new Date(clock()).toISOString(),
                stale: false,
              };
            });
          }
          const items = missing.map((p, i) => ({
            ...p,
            temp: current[i].temp,
            code: current[i].code,
            observedAt: current[i].observedAt,
            timezone: current[i].timezone,
            fetchedAt: current[i].fetchedAt,
            stale: !!current[i].stale,
          }));
          for (const item of items) store(summaryCache, keyOf(item), { at: clock(), item });
          return { items };
        },
      );
      for (const item of batch.items) result.set(keyOf(item), item);
    }
    return {
      items: points.map((p) => requireValue(result.get(keyOf(p)), 'Missing batch summary')),
      source: demo ? 'demo' : 'open-meteo',
    };
  }
  return { getWeather, searchPlaces, getSummaries };
}

const serviceKey = Symbol.for('weather-atlas.forecasts.v1.' + forecastNamespace());
const services: typeof globalThis & { [serviceKey]?: ReturnType<typeof createWeatherService> } =
  globalThis;
const service = (services[serviceKey] ??= createWeatherService({
  demo: process.env.WEATHER_MODE === 'demo',
  sharedStore: process.env.WEATHER_SHARED_CACHE === 'off' ? null : createSharedStore(),
}));
export const { getWeather, searchPlaces, getSummaries } = service;
