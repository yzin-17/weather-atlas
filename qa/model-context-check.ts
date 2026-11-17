import { readForecast, readComparison } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import { cacheRecord } from '../web/lib/validation.ts';
import { validSnapshot } from '../web/lib/client-forecast.ts';
import type { Forecast, ComparisonContext } from '../web/lib/types.ts';
import type { ComparisonAnswer, ForecastRecord } from './lib/contracts.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSharedStore } from '../web/lib/shared-store.ts';

// 仅修改隔离的模型验收缓存；finally 恢复，绝不操作默认服务数据。
const origin = process.env.APP_URL || 'http://127.0.0.1:3305';
const directory = process.env.MODEL_CACHE_DIR;
assert(directory, '必须显式提供隔离 MODEL_CACHE_DIR');
const store = createSharedStore(directory),
  rows: { question: string; status: number; ms: number; body: ComparisonAnswer }[] = [],
  backups = new Map<string, ForecastRecord>();
const prefix =
  'forecast-v3:' +
  createHash('sha256').update('http://127.0.0.1:3399/forecast').digest('hex').slice(0, 12) +
  ':';
const weather = async (lat: number, lon: number) => {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${origin}/api/weather?lat=${lat}&lon=${lon}`),
      body = await readForecast(r);
    if (r.ok && !body.stale) return body;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error('隔离天气夹具未恢复新鲜状态');
};
const modelCount = async () =>
  process.env.MODEL_TRACE_LOG
    ? (await readFile(process.env.MODEL_TRACE_LOG, 'utf8'))
        .split('\n')
        .filter((s) => s.includes('"event":"model-call"')).length
    : null;
async function ask(
  question: string,
  {
    lat = 37.566,
    lon = 126.9784,
    context,
  }: { lat?: number; lon?: number; context?: ComparisonContext } = {},
) {
  const f = await weather(lat, lon),
    start = performance.now();
  const r = await fetch(origin + '/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lat, lon, version: f.version, locale: 'zh-Hans', question, context }),
    }),
    b = await readComparison(r);
  rows.push({ question, status: r.status, ms: Math.round(performance.now() - start), body: b });
  return { r, b };
}
async function mutate(coords: string, change: (forecast: Forecast) => Forecast) {
  const key = prefix + coords,
    entry = await store.read(key, cacheRecord(validSnapshot));
  assert(entry);
  if (!backups.has(key)) backups.set(key, entry);
  await store.write(key, { ...entry, at: Date.now(), value: change(entry.value) });
}
try {
  await weather(37.566, 126.9784);
  await weather(25.0478, 121.5319);
  let { r, b } = await ask('首尔和台北明天早上 7–9 点，哪里更容易下雨？');
  assert.equal(r.status, 200);
  assert.equal(b.source, 'model');
  const context = b.context;
  await mutate('25.0478,121.5319', (f) => ({ ...f, version: f.version + '-context-qa' }));
  const count = await modelCount();
  ({ r, b } = await ask('那下午呢？', { context }));
  assert.equal(r.status, 409);
  assert.equal(await modelCount(), count);
  ({ r, b } = await ask('那下午呢？', {
    context: {
      ...context,
      cities: await Promise.all(
        context.cities.map(async (c) => ({ ...c, version: (await weather(c.lat, c.lon)).version })),
      ),
    },
  }));
  assert.equal(r.status, 200);
  assert(
    b.comparisons.every(
      (c: { fromHour: number; toHour: number }) => c.fromHour === 12 && c.toHour === 17,
    ),
  );
  ({ r, b } = await ask('首尔和台北明天 UTC 07:00–09:00 同一绝对时刻，哪里更容易下雨？'));
  assert.equal(r.status, 200);
  assert.equal(b.context.alignmentZone, 'UTC');
  assert.deepEqual(
    b.comparisons[0].evidence.map((e) => e.time),
    b.comparisons[1].evidence.map((e) => e.time),
  );
  await mutate('25.0478,121.5319', (f) => ({
    ...f,
    version: f.version + '-missing-qa',
    comparisonHours: requireValue(f.comparisonHours).map((h) => ({ ...h, rain: null })),
  }));
  ({ r, b } = await ask('首尔和台北明天早上 7–9 点，哪里更容易下雨？'));
  assert.equal(r.status, 200);
  const missing = b.comparisons.find((c: { city: { lon: number } }) => c.city.lon === 121.5319);
  assert.equal(requireValue(missing).complete, false);
  assert.equal(requireValue(missing).value, null);
  assert.equal(requireValue(missing).evidence.length, 0);
  assert(b.answer.includes('无法比较'));
  ({ r, b } = await ask('哪个更冷？', { lat: 51.50853, lon: -0.12574, context }));
  assert.equal(r.status, 200);
  assert.equal(b.context, undefined);
  assert(!b.comparisons?.length);
  ({ r, b } = await ask('未来六小时会下雨吗？'));
  assert.equal(r.status, 200);
  assert.equal(b.source, 'model');
  assert(b.evidence.length > 0);
} finally {
  for (const [key, entry] of backups) await store.write(key, entry);
  await writeFile(
    new URL('./evidence/model-context.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), weather: 'controlled fixture', rows }, null, 2),
  );
}
console.log(
  JSON.stringify(
    rows.map(({ status, ms, body }) => ({ status, ms, source: body.source, code: body.code })),
  ),
);
