import { requireValue } from '../lib/validation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherService } from '../lib/weather.ts';
import { mapCities, mapSnapshot, summaryFresh } from '../lib/map-weather.ts';
test('地图候选有界、按坐标去重，当前与选中地点名称优先', () => {
  const current = { lat: 1, lon: 2, name: 'Current', id: 'current', country: '' },
    selected = { lat: 3, lon: 4, name: 'Selected', id: 'selected', country: '' };
  const saved = [
    { ...current, name: 'Old' },
    ...Array.from({ length: 100 }, (_, i) => ({
      lat: i / 2,
      lon: 20,
      id: i,
      name: String(i),
      country: '',
    })),
  ];
  const result = mapCities(current, saved, selected);
  assert.equal(result.length, 20);
  assert.equal(result[0].name, 'Current');
  assert.equal(result[1].name, 'Selected');
  assert.equal(result.filter((p) => p.lat === 1 && p.lon === 2).length, 1);
});
test('地图复用同源完整快照，零温保留，三小时／异源／未来数据不能冒充新天气', () => {
  const now = Date.now(),
    p = { lat: 1, lon: 2 };
  const f = {
    version: 'x',
    timezone: 'Asia/Seoul',
    source: 'fixture',
    stale: false,
    fetchedAt: new Date(now - 1000).toISOString(),
    current: { temp: 0, code: 0, time: 123 },
    hours: Array.from({ length: 24 }, (_, i) => ({ time: i * 3600, temp: 0, code: 0, rain: null })),
    days: Array.from({ length: 7 }, () => ({ date: '2026-11-17', min: 0, max: 0, code: 0 })),
  };
  const s = mapSnapshot(p, f, 'fixture');
  assert(s);
  assert.equal(s.temp, 0);
  assert.equal(s.observedAt, 123);
  assert.equal(s.timezone, 'Asia/Seoul');
  assert(summaryFresh(s, now));
  assert.equal(mapSnapshot(p, f, 'demo'), null);
  assert.equal(
    mapSnapshot(p, { ...f, fetchedAt: new Date(now - 3 * 3600_000).toISOString() }, 'fixture'),
    null,
  );
  assert.equal(summaryFresh({ ...s, time: now + 1000 }, now), false);
  assert.equal(summaryFresh({ ...s, stale: true }, now), false);
});
test('地图摘要请求本地时区和 Unix 时间，一批可追溯元数据且复用缓存', async () => {
  let calls = 0,
    query: URLSearchParams | undefined;
  const observedAt = 1794860000,
    now = observedAt * 1000;
  const service = createWeatherService({
    clock: () => now,
    fetcher: async (url) => {
      calls++;
      query = new URL(url).searchParams;
      return Response.json([
        {
          timezone: 'Asia/Seoul',
          current: { time: observedAt, temperature_2m: 0, weather_code: 0 },
        },
        {
          timezone: 'Asia/Taipei',
          current: { time: observedAt, temperature_2m: 18, weather_code: 2 },
        },
      ]);
    },
  });
  const points = [
    { lat: 25, lon: 121 },
    { lat: 37, lon: 126 },
  ];
  const result = await service.getSummaries(points);
  assert.equal(calls, 1);
  assert.equal(requireValue(query).get('timezone'), 'auto');
  assert.equal(requireValue(query).get('timeformat'), 'unixtime');
  assert.equal(result.items[0].temp, 0);
  assert.equal(result.items[0].observedAt, observedAt);
  assert.equal(result.items[0].fetchedAt, new Date(now).toISOString());
  await service.getSummaries(points);
  assert.equal(calls, 1);
});
test('当前完整预报可直接提供地图摘要及其同一版本的观测时间', async () => {
  const service = createWeatherService({ demo: true });
  const p = { lat: 37, lon: 126 },
    f = await service.getWeather(p.lat, p.lon),
    s = (await service.getSummaries([p])).items[0];
  assert.equal(s.observedAt, f.current.time);
  assert.equal(s.timezone, f.timezone);
  assert.equal(s.fetchedAt, f.fetchedAt);
  assert.equal(s.temp, f.current.temp);
});
