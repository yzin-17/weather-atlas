import { readObject, readStats } from './lib/json.ts';
import { cacheRecord } from '../web/lib/validation.ts';
import { validSnapshot } from '../web/lib/client-forecast.ts';
import type { ForecastRecord } from './lib/contracts.ts';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { createSharedStore } from '../web/lib/shared-store.ts';
import { createHash } from 'node:crypto';
const origins = ['http://127.0.0.1:3301', 'http://127.0.0.1:3302'],
  up = 'http://127.0.0.1:3399',
  provider = up + '/forecast';
const store = createSharedStore(new URL('../.cache-verification', import.meta.url).pathname),
  prefix = 'forecast-v3:' + createHash('sha256').update(provider).digest('hex').slice(0, 12) + ':';
const coords = [
  '37.577,126.98',
  '25.0478,121.5319',
  '51.5074,-0.1278',
  '35.6762,139.6503',
  '40.7128,-74.006',
  '30.5723,104.0665',
];
const get = async (origin: string, point: string) => {
  const t = performance.now(),
    r = await fetch(
      origin +
        '/api/weather?' +
        new URLSearchParams({ lat: point.split(',')[0], lon: point.split(',')[1] }),
    );
  return { status: r.status, ms: performance.now() - t, body: await readObject(r) };
};
const stats = () => fetch(up + '/stats').then((r) => readStats(r)),
  control = (query: string) => fetch(up + '/control?' + query);
await control('delay=350&reset=1');
const report: {
  at: string;
  kind: 'controlled-upstream';
  origins: string[];
  concurrent?: { requests: number; upstream: unknown; versions: unknown[]; ms: number[] };
  warm?: number[];
  summary?: { cities: 1 | 3 | 6; bytes: number; ms: number; before: unknown; after: unknown }[];
  stale?: { ms: number; fetchedAt: unknown };
  expired?: 503;
  recovered?: { status: number; calls: unknown };
  ai?: { accepted: number; limited: number; models: unknown };
} = { at: new Date().toISOString(), kind: 'controlled-upstream', origins };
const cold = await Promise.all(
  Array.from({ length: 20 }, (_, i) => get(origins[i % 2], coords[0])),
);
assert(cold.every((r) => r.status === 200));
assert.equal((await stats()).calls.forecast, 1);
report.concurrent = {
  requests: 20,
  upstream: (await stats()).calls.forecast,
  versions: [...new Set(cold.map((r) => r.body.version))],
  ms: cold.map((r) => Math.round(r.ms)),
};
const warm = await Promise.all(origins.map((o) => get(o, coords[0])));
assert.equal((await stats()).calls.forecast, 1);
report.warm = warm.map((r) => r.ms);
report.summary = [];
for (const count of [1, 3, 6] as const) {
  const before = (await stats()).calls;
  const t = performance.now(),
    r = await fetch(
      origins[0] +
        '/api/summaries?' +
        new URLSearchParams({ coords: coords.slice(0, count).join(';') }),
    );
  const text = await r.text();
  assert.equal(r.status, 200);
  report.summary.push({
    cities: count,
    bytes: Buffer.byteLength(text),
    ms: performance.now() - t,
    before,
    after: (await stats()).calls,
  });
}
const key = prefix + coords[0],
  entry = await store.read(key, cacheRecord(validSnapshot));
assert(entry);
await store.write(key, { ...entry, at: Date.now() - 16 * 60000 });
await control('failure=503&reset=1');
const stale = await get(origins[1], coords[0]);
assert.equal(stale.status, 200);
assert.equal(stale.body.stale, true);
assert.equal(stale.body.fetchedAt, entry.value.fetchedAt);
report.stale = { ms: stale.ms, fetchedAt: stale.body.fetchedAt };
await new Promise((r) => setTimeout(r, 500));
await store.write(key, { ...entry, at: Date.now() - 4 * 3600000 });
const expired = await get(origins[0], coords[0]);
assert.equal(expired.status, 503);
report.expired = expired.status;
await control('reset=1');
const recovered = await get(origins[1], coords[0]);
assert.equal(recovered.status, 200);
assert(!recovered.body.stale);
report.recovered = { status: recovered.status, calls: (await stats()).calls };
const answers = await Promise.all(
  Array.from({ length: 26 }, (_, i) =>
    fetch(origins[i % 2] + '/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: '明天早上需要带伞吗',
        locale: 'zh-Hans',
        lat: 37.577,
        lon: 126.98,
        version: recovered.body.version,
      }),
    }).then(async (r) => ({ status: r.status, body: await readObject(r) })),
  ),
);
report.ai = {
  accepted: answers.filter((r) => r.status === 200).length,
  limited: answers.filter((r) => r.status === 429).length,
  models: (await stats()).calls.model,
};
assert.equal(report.ai.accepted, 24);
assert.equal(report.ai.limited, 2);
await mkdir(new URL('./evidence/', import.meta.url), { recursive: true });
await writeFile(
  new URL('./evidence/shared-instances.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
