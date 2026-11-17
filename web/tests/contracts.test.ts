import test from 'node:test';
import assert from 'node:assert/strict';
import { validCoordinates, validPlace, validSummary } from '../lib/contracts.ts';
import { validMetricRow } from '../lib/rum.ts';
import { validAskResult, validPlaceLabel, validSingleContext } from '../lib/contracts.ts';
import { createWeatherService } from '../lib/weather.ts';
import { answerQuestion } from '../lib/ask.ts';
import { createSharedStore, sharedLimiter } from '../lib/shared-store.ts';
import { cacheRecord, requireValue } from '../lib/validation.ts';
import { validSnapshot } from '../lib/client-forecast.ts';
import { catalog } from '../lib/catalog.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('坐标校验保留城市与摘要字段，同时拒绝非法坐标和字段', () => {
  const place = { lat: 37.566, lon: 126.9784, id: 1835848, name: '首尔', country: '韩国' };
  assert(validCoordinates(place));
  assert(validPlace(place));
  assert(validSummary({ ...place, temp: 12, code: 3, stale: false }));
  assert.equal(validPlace({ ...place, lat: 91 }), false);
  assert.equal(validPlace({ ...place, name: 42 }), false);
  assert.equal(validSummary({ ...place, temp: '12', code: 3 }), false);
});

test('RUM 缓存读取只接受完整且有效的指标记录', () => {
  const row = {
    id: 'test-lcp',
    name: 'LCP',
    value: 1234,
    locale: 'zh-Hans',
    pageType: 'city',
    device: 'mobile',
    receivedAt: 123,
    dataset: 'controlled',
  };
  assert(validMetricRow(row));
  assert.equal(validMetricRow({ ...row, value: -1 }), false);
  assert.equal(validMetricRow({ ...row, receivedAt: '123' }), false);
  assert.equal(validMetricRow({ ...row, dataset: undefined }), false);
});

test('地点解析拒绝错误字段，并保留合法的区域回退标签', () => {
  const label = {
    name: 'Sichuan',
    names: {},
    locale: 'en',
    source: 'photon-osm',
    level: 'region',
    country: 'China',
    region: 'Sichuan',
  };
  assert(validPlaceLabel(label));
  for (const value of [
    { ...label, name: 12 },
    { ...label, names: { ko: 42 } },
    { ...label, locale: 'fr' },
    { ...label, level: 'invalid' },
  ])
    assert.equal(validPlaceLabel(value), false);
});

test('双城回答逐层验证证据、快照和上下文，缺测概率仍可保留 null', async () => {
  const now = () => Date.parse('2026-11-16T00:00:00Z');
  const service = createWeatherService({ demo: true, clock: now });
  const city = requireValue(catalog[0]);
  const forecast = await service.getWeather(city.lat, city.lon);
  const answer = await answerQuestion(
    {
      ...city,
      question: '首尔和台北明天早上7–9点哪里更容易下雨？',
      locale: 'zh-Hans',
      version: forecast.version,
    },
    { getWeather: service.getWeather, now },
  );
  assert(validAskResult(answer));
  const comparison = requireValue(answer.comparisons?.[0]);
  assert.equal(validAskResult({ ...answer, comparisons: [{ ...comparison, value: '12' }] }), false);
  assert.equal(
    validAskResult({
      ...answer,
      comparisons: [{ ...comparison, forecast: { ...comparison.forecast, timezone: 42 } }],
    }),
    false,
  );
  assert.equal(validAskResult({ ...answer, evidence: [{ time: 123, rain: '0' }] }), false);
  assert(validAskResult({ ...answer, evidence: [{ time: 123, rain: null }] }));
  assert.equal(
    validAskResult({
      ...answer,
      context: { ...answer.context, plan: { intent: 'rain', window: 'local' } },
    }),
    false,
  );
  assert.equal(
    validSingleContext({
      origin: 'test',
      createdAt: 0,
      dateAnchor: 0,
      city: { ...city, timezone: 'Asia/Seoul', version: 'v1' },
      plan: { intent: 'unsupported' },
    }),
    false,
  );
});

test('损坏的共享缓存不能伪装为预报；重载后跨实例读取有效快照', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-type-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createSharedStore(directory);
  const now = Date.now();
  const city = requireValue(catalog[0]);
  const forecast = await createWeatherService({ demo: true }).getWeather(city.lat, city.lon);
  let calls = 0;
  await store.write('broken', { at: now, value: { ...forecast, hours: [{ time: 'invalid' }] } });
  assert.equal(await store.read('broken', cacheRecord(validSnapshot)), null);
  const restored = await store.getOrLoad(
    'broken',
    async () => {
      calls++;
      return forecast;
    },
    { validate: validSnapshot },
  );
  assert.equal(restored.version, forecast.version);
  assert.equal(calls, 1);
  assert.equal(
    (await createSharedStore(directory).read('broken', cacheRecord(validSnapshot)))?.value.version,
    forecast.version,
  );
  await store.write('ask-budget', ['invalid timestamp']);
  const allowed = sharedLimiter({ store, limit: 1 });
  assert.equal(await allowed(), true);
  assert.equal(await allowed(), false);
});
