import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinates, parseBatch, createWeatherService, normalizeWeather } from '../lib/weather.ts';

const start = Date.parse('2026-11-16T09:00:00Z') / 1000;
const fixedClock = () => start * 1000;
function raw() {
  const hours = Array.from({ length: 24 }, (_, i) => start + i * 3600);
  const days = Array.from(
    { length: 7 },
    (_, i) => Date.parse('2026-11-15T15:00Z') / 1000 + i * 86400,
  );
  return {
    timezone: 'Asia/Seoul',
    utc_offset_seconds: 32400,
    current: { time: start, temperature_2m: 9, weather_code: 1 },
    hourly: {
      time: hours,
      temperature_2m: hours.map(() => 9),
      weather_code: hours.map(() => 1),
      precipitation_probability: hours.map((): number | null => 0),
    },
    daily: {
      time: days,
      temperature_2m_min: days.map(() => 6),
      temperature_2m_max: days.map(() => 16),
      weather_code: days.map(() => 2),
    },
  };
}
const response = (obj: unknown) => new Response(JSON.stringify(obj));

test('rejects absent, non-finite, repeated separators and out-of-range coordinates', () => {
  for (const p of [
    [null, 12],
    [' ', 12],
    [91, 1],
    [12, 181],
    ['0x10', 1],
  ])
    assert.throws(() => coordinates(p[0], p[1]));
  assert.deepEqual(coordinates('0', 0), { lat: 0, lon: 0 });
  assert.throws(() => parseBatch(';;'));
  assert.throws(() => parseBatch(Array(21).fill('1,1').join(';')));
});
test('delivers exactly 24 hours, 7 local dates, and preserves missing probabilities', () => {
  const data = raw();
  data.hourly.precipitation_probability[1] = null;
  const result = normalizeWeather({ lat: 37, lon: 127 }, data, fixedClock());
  assert.equal(result.days[0].date, '2026-11-16');
  assert.equal(result.hours[1].rain, null);
  assert.equal(result.hours[0].rain, 0);
  data.daily.time.pop();
  assert.throws(() => normalizeWeather({ lat: 37, lon: 127 }, data));
});
test('shares concurrent and inter-locale reads, retains last good snapshot on short outages', async () => {
  let now = fixedClock(),
    calls = 0,
    offline = false;
  const s = createWeatherService({
    clock: () => now,
    fetcher: async (url) => {
      calls++;
      assert.equal(url.searchParams.get('forecast_hours'), '168');
      if (offline) throw Error('offline');
      return response(raw());
    },
  });
  const [first, second] = await Promise.all([s.getWeather(37, 127), s.getWeather(37, 127)]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  await s.getWeather(37, 127);
  assert.equal(calls, 1);
  now += 16 * 60000;
  offline = true;
  const stale = await s.getWeather(37, 127);
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, first.fetchedAt);
  assert.equal(stale.version, first.version);
  now += 4 * 3600000;
  await assert.rejects(s.getWeather(37, 127), { code: 'UPSTREAM_UNAVAILABLE' });
});
test('summary batches only uncached, deduplicated coordinates and restores caller order', async () => {
  let batched = 0;
  const s = createWeatherService({
    clock: fixedClock,
    fetcher: async (url) => {
      if (url.searchParams.has('daily')) return response(raw());
      batched++;
      assert.equal(url.searchParams.get('latitude'), '12,18');
      return response([
        { current: { temperature_2m: 5, weather_code: 3 } },
        { current: { temperature_2m: 8, weather_code: 0 } },
      ]);
    },
  });
  await s.getWeather(37, 127);
  const points = parseBatch('37,127;18,98;12,34;18,98');
  const { items } = await s.getSummaries(points);
  assert.equal(batched, 1);
  assert.deepEqual(
    items.map((p) => p.temp),
    [9, 8, 5, 8],
  );
  await s.getSummaries(points);
  assert.equal(batched, 1);
});
test('global search falls back to an exact local alias and preserves upstream coordinates', async () => {
  let calls = 0;
  const s = createWeatherService({
    clock: fixedClock,
    fetcher: async (url) => {
      calls++;
      assert.equal(url.searchParams.get('language'), 'ko');
      return response({
        results: [
          {
            id: 12,
            name: '서울의 마을',
            latitude: 37,
            longitude: 127,
            country: '대한민국',
          },
        ],
      });
    },
  });
  assert.deepEqual(await s.searchPlaces('서', 'ko'), { places: [] });
  const { places } = await s.searchPlaces('서울', 'ko');
  assert.equal(places[0].id, 1835848);
  assert.equal(places[1].id, 12);
  await s.searchPlaces('서울', 'ko');
  assert.equal(calls, 1);
  const offline = createWeatherService({
    fetcher: async () => {
      throw Error('offline');
    },
  });
  assert.equal((await offline.searchPlaces('成都', 'zh-Hant')).source, 'catalog');
  await assert.rejects(offline.searchPlaces('Utrecht', 'en'), {
    code: 'UPSTREAM_UNAVAILABLE',
  });
});
test('demo is explicit, fresh, and deterministic for the displayed hour', async () => {
  const s = createWeatherService({
    demo: true,
    clock: fixedClock,
    fetcher: () => {
      throw Error('no upstream calls allowed');
    },
  });
  const result = await s.getWeather(37.566, 126.9784);
  assert.equal(result.source, 'demo');
  assert.equal(result.timezone, 'Asia/Seoul');
  assert.equal(result.hours.length, 24);
  assert.equal((await s.getSummaries([{ lat: 37.566, lon: 126.9784 }])).source, 'demo');
});
